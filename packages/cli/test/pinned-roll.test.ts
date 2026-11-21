// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { requestMessage, unb64u } from '@quietvote/board';
import { bytesToHex, ed25519Keypair, ed25519Verify, hexToBytes, utf8 } from '@quietvote/crypto';
import { rollRoot } from '@quietvote/protocol';
import { qv, strangerKeyFile, tmp, writeJson } from './helpers.ts';

const ELECTION = 'ab'.repeat(16);
const AUDIENCE = 'qv:pinned-test@https://board.example';
const roll = [1, 2, 3].map((i) => bytesToHex(ed25519Keypair(new Uint8Array(32).fill(i)).publicKey)).sort();

// @verifies QV-09-REQ-020
test('online pinned membership signs exact creation and immutable attachment bodies', async () => {
  const dir = tmp();
  const key = strangerKeyFile(dir);
  const publicKey = hexToBytes(JSON.parse(readFileSync(key, 'utf8')).public_key, 32);
  const file = writeJson(dir, 'members.json', roll);
  const received: { method: string; target: string; body: unknown; idem: string | undefined }[] = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const bodyBytes = Buffer.concat(chunks);
      const match = /^QV-Sig keyid=([A-Za-z0-9_-]+),ts=(\d+),nonce=([A-Za-z0-9_-]+),sig=([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? '');
      assert.ok(match);
      assert.ok(ed25519Verify(publicKey, unb64u(match[4]!)!, requestMessage(req.method!, req.url!, AUDIENCE,
        Number(match[2]), unb64u(match[3]!)!, bodyBytes)));
      received.push({ method: req.method!, target: req.url!, body: JSON.parse(bodyBytes.toString('utf8')), idem: req.headers['idempotency-key'] as string | undefined });
      const root = rollRoot(roll); assert.ok(root.ok);
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.method === 'POST' ? { election_id: ELECTION } : { election_id: ELECTION,
        roll_root: bytesToHex(root.value), roll_size: roll.length, attached: true }));
    } catch (error) {
      res.writeHead(500); res.end(JSON.stringify({ code: 'SIGNATURE_TEST_FAILED' }));
      assert.fail(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const common = ['--server', `http://127.0.0.1:${address.port}`, '--audience', AUDIENCE, '--key', key, '--json'];
    const createArgs = ['online', 'election-create', ...common, '--org', 'ORG1', '--title', 'Pinned membership', '--access', 'public',
      '--idempotency-key', 'create-pinned-1', '--pinned-roll', file];
    for (let attempt = 0; attempt < 2; attempt++) {
      const created = await qv(createArgs);
      assert.equal(created.code, 0, created.err);
      assert.equal(JSON.parse(created.out).election_id, ELECTION);
    }
    const attached = await qv(['online', 'election-pinned-roll', ...common, '--id', ELECTION, '--pinned-roll', file,
      '--idempotency-key', 'attach-pinned-1']);
    assert.equal(attached.code, 0, attached.err);
    assert.equal(JSON.parse(attached.out).attached, true);
    assert.deepEqual(received, [
      { method: 'POST', target: '/api/v1/orgs/ORG1/elections', body: { title: 'Pinned membership', access: 'public', pinned_roll: roll }, idem: 'create-pinned-1' },
      { method: 'POST', target: '/api/v1/orgs/ORG1/elections', body: { title: 'Pinned membership', access: 'public', pinned_roll: roll }, idem: 'create-pinned-1' },
      { method: 'PUT', target: `/api/v1/elections/${ELECTION}/pinned-roll`, body: { pinned_roll: roll }, idem: 'attach-pinned-1' },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('online pinned membership refuses invalid, unbounded and non-regular files before loading a key or sending a request', async () => {
  const dir = tmp();
  try {
    const fixtures = [[], [...roll].reverse(), [roll[0]!, roll[0]!], [roll[0]!.toUpperCase()], ['00'.repeat(32)], ['g'.repeat(64)], { pinned_roll: roll }];
    const files = fixtures.map((value, i) => writeJson(dir, `invalid-${i}.json`, value));
    const oversized = join(dir, 'oversized.json'); writeFileSync(oversized, utf8(' '.repeat(1_153_435))); files.push(oversized);
    const directory = join(dir, 'directory'); mkdirSync(directory); files.push(directory);
    if (process.platform !== 'win32') {
      const link = join(dir, 'members-link.json'); symlinkSync(writeJson(dir, 'valid.json', roll), link); files.push(link);
    }
    for (const file of files) {
      for (const [command, fields] of [
        ['election-create', ['--org', 'ORG1', '--title', 'T', '--access', 'public']],
        ['election-pinned-roll', ['--id', ELECTION]],
      ] as const) {
        const result = await qv(['online', command, '--server', 'http://127.0.0.1:1', '--audience', AUDIENCE,
          '--key', join(dir, 'key-must-not-be-read'), '--idempotency-key', 'invalid-list-test', '--pinned-roll', file, ...fields]);
        assert.equal(result.code, 4, `${file}: ${result.err}`);
        assert.match(result.err, /pinned roll|input must be a bounded regular file|cannot read input file/);
        assert.doesNotMatch(result.err, /key-must-not-be-read|server request|outcome unknown/);
        assert.equal(result.out, '');
      }
    }
    const missingKey = await qv(['online', 'election-pinned-roll', '--server', 'http://127.0.0.1:1', '--id', ELECTION,
      '--pinned-roll', writeJson(dir, 'original.json', roll)]);
    assert.equal(missingKey.code, 2);
    assert.match(missingKey.err, /idempotency-key/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
