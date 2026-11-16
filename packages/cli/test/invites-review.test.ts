import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b64u } from '@quietvote/board';
import { streamRng } from '@quietvote/crypto';
import { logOrigin } from '@quietvote/protocol';
import { run } from '../src/main.ts';
import { qv, tmp, voterKeyFile } from './helpers.ts';

const id = 'bc'.repeat(16);
const response = { invites: [{ invite_id: 'a'.repeat(26), code: b64u(new Uint8Array(16).fill(91)) }] };
const metadata = { election_id: id, origin: logOrigin({ election_id: id }), registration_scheme: 'hashed-pop-v1' };

async function fixture(body: (x: { dir: string; out: string; args: string[]; posts: () => number }) => Promise<void>,
  onPost: (out: string, dir: string) => Response) {
  const dir = tmp(), out = join(dir, 'invites.json'), previous = globalThis.fetch;
  let posts = 0;
  const args = ['online', 'invites-create', '--server', 'http://localhost', '--id', id, '--count', '1', '--out', out,
    '--key', voterKeyFile(dir, 0), '--audience', 'qv:review@http://localhost', '--idempotency-key', 'review-invites-01', '--json'];
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'POST') { posts++; return onPost(out, dir); }
    return Response.json(metadata);
  };
  try { await body({ dir, out, args, posts: () => posts }); }
  finally { globalThis.fetch = previous; rmSync(dir, { recursive: true, force: true }); }
}

test('review: a replaced reserved pathname cannot be reported as the invitation output', async () => {
  await fixture(async ({ dir, out, args, posts }) => {
    const result = await qv(args);
    assert.equal(result.code, 1); assert.equal(posts(), 1); assert.equal(result.out, '');
    assert.match(result.err, /output binding lost/);
    assert.equal(result.err.includes(response.invites[0]!.code), false);
    assert.equal(readFileSync(out, 'utf8'), 'independent replacement');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'original-private.json'), 'utf8')), response);
  }, (out, dir) => {
    renameSync(out, join(dir, 'original-private.json'));
    writeFileSync(out, 'independent replacement', { mode: 0o600 });
    return Response.json(response, { status: 201 });
  });
});

test('review: reservation changed during protected-key prompt prevents the POST', async () => {
  await fixture(async ({ dir, out, args, posts }) => {
    const legacy = JSON.parse(readFileSync(new URL('./fixtures/qvkey1-legacy.json', import.meta.url), 'utf8')).fixtures[1];
    const key = join(dir, 'protected-key.json'); writeFileSync(key, JSON.stringify(legacy.container));
    const argv = args.map(v => v === args[args.indexOf('--key') + 1] ? key : v);
    let stdout = '', stderr = '';
    const code = await run(argv, {
      out: s => { stdout += s; }, err: s => { stderr += s; }, stdin: async () => new Uint8Array(), rng: streamRng('invite-review'),
      prompt: async () => {
        renameSync(out, join(dir, 'original-pending.json'));
        writeFileSync(out, 'replacement during key unlock', { mode: 0o600 });
        return legacy.passphrase;
      },
    });
    assert.equal(code, 4); assert.equal(posts(), 0); assert.equal(stdout, '');
    assert.match(stderr, /no invitations were requested/);
    assert.equal(readFileSync(out, 'utf8'), 'replacement during key unlock');
    assert.equal(JSON.parse(readFileSync(join(dir, 'original-pending.json'), 'utf8')).format, 'qv-invite-issuance/pending');
  }, () => Response.json(response, { status: 201 }));
});

test('review: lost private permissions do not receive bearer codes', { skip: process.platform === 'win32' }, async () => {
  await fixture(async ({ out, args, posts }) => {
    const result = await qv(args);
    assert.equal(result.code, 1); assert.equal(posts(), 1); assert.equal(result.out, '');
    assert.equal(result.err.includes(response.invites[0]!.code), false);
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).format, 'qv-invite-issuance/pending');
  }, out => { chmodSync(out, 0o644); return Response.json(response, { status: 201 }); });
});

test('review: malformed UTF-8 success is preserved byte-for-byte privately without a success verdict', async () => {
  const malformed = Buffer.concat([Buffer.from(JSON.stringify(response)), Buffer.from([0xff])]);
  await fixture(async ({ out, args, posts }) => {
    const result = await qv(args);
    assert.equal(result.code, 1); assert.equal(posts(), 1); assert.equal(result.out, '');
    assert.match(result.err, /invalid or redacted/); assert.equal(result.err.includes(response.invites[0]!.code), false);
    assert.deepEqual(readFileSync(out), malformed);
  }, () => new Response(malformed, { status: 201 }));
});
