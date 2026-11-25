// @verifies QV-08-REQ-019
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { authorKeyId, b64u } from '@quietvote/board';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { World } from '../../server/test/helpers/world.ts';
import { FLOOR_PARAMS, wrapSeed } from '../src/keyfile.ts';
import { BIN, qv, tmp, voterKeyFile, writePrivateFixture, writePrivateJson } from './helpers.ts';

const plainKey = (w: World): string => writePrivateJson(w.dir, 'organization-owner.key', {
  format: 'qv-voter-key/v1', public_key: bytesToHex(w.owner.publicKey), seed: bytesToHex(w.owner.secretKey),
});

test('organization CLI registers a protected owner through the executable, replays explicitly and creates its first election', async () => {
  const w = new World({ seed: 'cli-organization-bootstrap', n: 3, t: 2, voters: 1 });
  w.clock = Date.now();
  await w.start();
  try {
    const passphrase = 'organization owner test passphrase';
    const key = writePrivateJson(w.dir, 'protected-owner.key', await wrapSeed(w.owner.secretKey, passphrase,
      streamRng('organization-key-wrap'), FLOOR_PARAMS));
    const auth = ['--server', w.base, '--audience', w.audience, '--key', key, '--passphrase-stdin', '--json'];
    const create = ['online', 'org-create', ...auth, '--name', 'River Cooperative', '--idempotency-key', 'organization-bootstrap-1'];
    const childResult = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, ...create], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      child.stdout.on('data', (b: Buffer) => { out += b.toString(); });
      child.stderr.on('data', (b: Buffer) => { err += b.toString(); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, out, err }));
      child.stdin.end(passphrase);
    });
    assert.equal(childResult.code, 0, childResult.err);
    const created = JSON.parse(childResult.out);
    assert.deepEqual(created.keys, [{ key_id: b64u(authorKeyId('ed25519', w.owner.publicKey)), role: 'org_owner' }]);
    assert.equal(created.name, 'River Cooperative');
    const invoke = (argv: string[]) => qv(argv, { stdin: passphrase, rng: w.rng });
    const replay = await invoke(create);
    assert.equal(replay.code, 0, replay.err);
    assert.deepEqual(JSON.parse(replay.out), created);
    const changed = await invoke(create.map((value) => value === 'River Cooperative' ? 'Changed body' : value));
    assert.equal(changed.code, 1);
    assert.equal(changed.out, '');
    const inspected = await invoke(['online', 'org-inspect', ...auth, '--org', created.org_id]);
    assert.equal(inspected.code, 0, inspected.err);
    assert.equal(JSON.parse(inspected.out).org_id, created.org_id);
    assert.equal(JSON.parse(inspected.out).name, 'River Cooperative');
    const election = await invoke(['online', 'election-create', ...auth, '--org', created.org_id,
      '--title', 'First meeting', '--access', 'public', '--idempotency-key', 'organization-election-1']);
    assert.equal(election.code, 0, election.err);
    assert.equal(JSON.parse(election.out).state, 'DRAFT');
  } finally { await w.stop(); }
});

test('organization creation preserves private token spelling and honors token and closed server modes', async () => {
  const token = '\uFEFF  Mixed case token with spaces  ';
  for (const mode of ['token', 'closed'] as const) {
    const w = new World({ seed: `cli-organization-${mode}`, n: 3, t: 2, voters: 1,
      server: { registrationMode: mode, registrationTokens: [token] } });
    w.clock = Date.now();
    await w.start();
    try {
      const key = plainKey(w), tokenFile = join(w.dir, 'registration-token.txt');
      const argv = ['online', 'org-create', '--server', w.base, '--audience', w.audience, '--key', key,
        '--name', 'Token organization', '--idempotency-key', 'token-organization-1'];
      assert.equal((await qv(argv, { rng: w.rng })).code, 1);
      writePrivateFixture(tokenFile, 'wrong-token\n');
      const tokenArgs = [...argv, '--registration-token-file', tokenFile];
      assert.equal((await qv(tokenArgs, { rng: w.rng })).code, 1);
      writePrivateFixture(tokenFile, `${token}\r\n`);
      const result = await qv(tokenArgs, { rng: w.rng });
      assert.equal(result.code, mode === 'token' ? 0 : 1, result.err);
      assert.equal((result.out + result.err).includes(token), false);
      if (mode === 'token') assert.equal(JSON.parse(result.out).name, 'Token organization');
      else assert.equal(result.out, '');
    } finally { await w.stop(); }
  }
});

test('organization input errors stop before contacting a server', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('invalid input must not contact a server'); });
  const dir = tmp();
  try {
    const tokenFile = join(dir, 'token.txt');
    const common = ['--server', 'https://board.example', '--audience', 'qv:test@https://board.example',
      '--key', voterKeyFile(dir, 0), '--name', 'Organization', '--idempotency-key', 'organization-input-1'];
    for (const extra of [['--registration-token', 'secret'], ['--registration-token-file'], ['--typo']]) {
      assert.equal((await qv(['online', 'org-create', ...common, ...extra])).code, 2);
    }
    for (const bad of ['x'.repeat(121), 'NUL\0name']) {
      assert.equal((await qv(['online', 'org-create', ...common.map((value) => value === 'Organization' ? bad : value)])).code, 2);
    }
    for (const body of ['', 'x'.repeat(201), 'first\nsecond', 'token\0suffix', new Uint8Array([0xff])]) {
      writePrivateFixture(tokenFile, body);
      assert.equal((await qv(['online', 'org-create', ...common, '--registration-token-file', tokenFile])).code, 4);
    }
    if (process.platform !== 'win32') {
      writePrivateFixture(tokenFile, 'valid-private-token');
      chmodSync(tokenFile, 0o644);
      assert.equal((await qv(['online', 'org-create', ...common, '--registration-token-file', tokenFile])).code, 4);
    }
    const auth = common.slice(0, 6);
    assert.equal((await qv(['online', 'org-inspect', ...auth, '--org', '../outside'])).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('organization creation binds public success fields and never reflects registration tokens or retries a failed mutation', async (t) => {
  const dir = tmp(), token = 'TOKEN_MUST_STAY_PRIVATE';
  try {
    const tokenFile = join(dir, 'token.txt');
    writePrivateFixture(tokenFile, token);
    const argv = ['online', 'org-create', '--server', 'https://board.example', '--audience', 'qv:test@https://board.example',
      '--key', voterKeyFile(dir, 0), '--name', 'Organization', '--idempotency-key', 'organization-response-1',
      '--registration-token-file', tokenFile];
    let mode = 'valid', calls = 0;
    t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
      calls++;
      assert.equal(String(url), 'https://board.example/api/v1/orgs');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.match((init.headers as Record<string, string>)['authorization']!, /^QV-Sig /);
      const body = JSON.parse(String(init.body));
      assert.equal(body.registration_token, token);
      const reply = { org_id: 'a'.repeat(26), name: body.name,
        keys: [{ key_id: b64u(authorKeyId('ed25519', Buffer.from(body.owner_key.pk, 'base64url'))), role: 'org_owner' }],
        registration_token: token, arbitrary: { secret: token } };
      if (mode === 'network') throw new Error(token);
      if (mode === 'http') return new Response(JSON.stringify({ code: token, detail: token }), { status: 503 });
      if (mode === 'malformed') return new Response(JSON.stringify({ secret: token }));
      if (mode === 'owner') reply.keys[0]!.key_id = token;
      if (mode === 'name') reply.name = token;
      if (mode === 'org') reply.org_id = token;
      return new Response(JSON.stringify(reply), { status: 201 });
    });
    for (mode of ['valid', 'owner', 'name', 'org', 'malformed', 'http', 'network']) {
      const before = calls, result = await qv(argv);
      assert.equal(result.code, mode === 'valid' ? 0 : 1, `${mode}: ${result.err}`);
      assert.equal(calls, before + 1, 'mutations are never retried automatically');
      assert.equal((result.out + result.err).includes(token), false);
      if (mode === 'valid') assert.deepEqual(Object.keys(JSON.parse(result.out)).sort(), ['keys', 'name', 'org_id']);
      else assert.equal(result.out, '');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
