import { writePrivateJson } from './private-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { b64u } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { logOrigin } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { BIN, qv, tmp, voterKeyFile } from './helpers.ts';

async function processQv(args: string[]) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
    child.on('error', reject); child.on('close', code => resolve({ code, out, err }));
  });
}

test('actual invitation CLI stores private bearer responses and refuses unrecoverable redacted replay', async () => {
  const w = new World({ seed: 'cli-invitation-create', n: 3, t: 2, voters: 0 }); w.clock = Date.now();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const key = writePrivateJson(w.dir, 'owner.json', { format: 'qv-voter-key/v1', seed: bytesToHex(w.owner.secretKey), public_key: bytesToHex(w.owner.publicKey) });
    const out = join(w.dir, 'invitations.json');
    const args = ['online', 'invites-create', '--server', w.base, '--id', w.electionId, '--count', '2', '--out', out,
      '--audience', w.audience, '--key', key, '--idempotency-key', 'issue-fixture-001', '--json'];
    const result = await processQv(args); assert.equal(result.code, 0, result.err);
    const response = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(response.invites.length, 2); assert.equal(new Set(response.invites.map((r: { code: string }) => r.code)).size, 2);
    const publicResult = JSON.parse(result.out);
    assert.deepEqual(Object.keys(publicResult).sort(), ['count', 'election_id', 'file', 'invite_ids']);
    assert.deepEqual(publicResult.invite_ids, response.invites.map((r: { invite_id: string }) => r.invite_id));
    if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
    for (const { code } of response.invites) assert.equal((result.out + result.err).includes(code), false);
    const rt = (await w.server.pool.get(w.electionId))!; assert.equal(rt.edb.inviteCount(), 2);
    const before = readFileSync(out);
    const exists = await qv(args); assert.equal(exists.code, 4); assert.deepEqual(readFileSync(out), before); assert.equal(rt.edb.inviteCount(), 2);
    const replayOut = join(w.dir, 'redacted-replay.json');
    const replay = await processQv(args.map(v => v === out ? replayOut : v));
    assert.equal(replay.code, 1); assert.match(replay.err, /invalid or redacted/); assert.equal(rt.edb.inviteCount(), 2);
    assert.ok(JSON.parse(readFileSync(replayOut, 'utf8')).invites.every((r: Record<string, unknown>) => !Object.hasOwn(r, 'code')));
    for (const { code } of response.invites) assert.equal((replay.out + replay.err).includes(code), false);
  } finally { await w.stop(); }
});

const ID = 'ab'.repeat(16);
const metadata = { election_id: ID, origin: logOrigin({ election_id: ID }), registration_scheme: 'hashed-pop-v1' };
const invite = { invite_id: 'a'.repeat(26), code: b64u(new Uint8Array(16).fill(7)) };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function mocked(body: (context: { dir: string; out: string; args: string[]; posts: () => number }) => Promise<void>, post: (out: string) => Response | Promise<Response>, meta: unknown = metadata) {
  const dir = tmp(), out = join(dir, 'invites.json'), old = globalThis.fetch; let posts = 0;
  const args = ['online', 'invites-create', '--server', 'http://localhost', '--id', ID, '--count', '1', '--out', out,
    '--key', voterKeyFile(dir, 0), '--audience', 'qv:test@http://localhost', '--idempotency-key', 'mock-issue-0001', '--json'];
  globalThis.fetch = async (_input, init) => { if (init?.method === 'POST') { posts++; return post(out); } return json(meta); };
  try { await body({ dir, out, args, posts: () => posts }); }
  finally { globalThis.fetch = old; rmSync(dir, { recursive: true, force: true }); }
}

test('private output reservation exists before the one mutation', async () => {
  await mocked(async ({ out, args, posts }) => {
    const r = await qv(args); assert.equal(r.code, 0, r.err); assert.equal(posts(), 1);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { invites: [invite] });
    assert.equal((r.out + r.err).includes(invite.code), false);
  }, out => {
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).format, 'qv-invite-issuance/pending');
    if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
    return json({ invites: [invite] }, 201);
  });
});

test('invalid counts, existing files/directories and missing output parents issue no invitations', async () => {
  await mocked(async ({ dir, out, args, posts }) => {
    for (const count of ['0', '1001', '01', '-1', '1.0']) {
      const changed = [...args]; changed[changed.indexOf('--count') + 1] = count;
      assert.equal((await qv(changed)).code, 2); assert.equal(existsSync(out), false);
    }
    writeFileSync(out, 'preserve'); assert.equal((await qv(args)).code, 4); assert.equal(readFileSync(out, 'utf8'), 'preserve');
    rmSync(out); mkdirSync(out); assert.equal((await qv(args)).code, 4); rmSync(out, { recursive: true });
    const parentMissing = args.map(v => v === out ? join(dir, 'absent', 'invites.json') : v);
    assert.equal((await qv(parentMissing)).code, 4); assert.equal(posts(), 0);
  }, () => { throw new Error('POST forbidden'); });
});

test('output symlink cannot overwrite a target or trigger issuance', { skip: process.platform === 'win32' }, async () => {
  await mocked(async ({ dir, out, args, posts }) => {
    const target = join(dir, 'keep'); writeFileSync(target, 'unchanged'); symlinkSync(target, out);
    assert.equal((await qv(args)).code, 4); assert.equal(readFileSync(target, 'utf8'), 'unchanged'); assert.equal(posts(), 0);
  }, () => { throw new Error('POST forbidden'); });
});

test('unknown scheme and mismatched election metadata refuse before reservation or POST', async () => {
  for (const meta of [{ ...metadata, registration_scheme: 'legacy-raw-v1' }, { ...metadata, origin: 'quietvote/v1/outsider' }, { ...metadata, election_id: 'cd'.repeat(16) }]) {
    await mocked(async ({ out, args, posts }) => { assert.equal((await qv(args)).code, 1); assert.equal(posts(), 0); assert.equal(existsSync(out), false); }, () => json({ invites: [invite] }), meta);
  }
});

test('malformed, duplicate and noncanonical bearer responses remain private and are never successes', async () => {
  const alias = invite.code.slice(0, -1) + 'x';
  for (const bad of [{ invites: [{ ...invite, code: alias }] }, { invites: [invite], surprise: invite.code }, { invites: [] }, { invites: [{ invite_id: invite.invite_id }] }]) {
    await mocked(async ({ out, args }) => {
      const r = await qv(args); assert.equal(r.code, 1); assert.match(r.err, /invalid or redacted/);
      assert.equal(r.out, ''); assert.equal(r.err.includes(invite.code), false); assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), bad);
    }, () => json(bad, 201));
  }
  await mocked(async ({ out, args }) => {
    const changed = [...args]; changed[changed.indexOf('--count') + 1] = '2';
    const r = await qv(changed); assert.equal(r.code, 1); assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { invites: [invite, invite] });
  }, () => json({ invites: [invite, invite] }, 201));
});

test('network ambiguity, error-body secrets and oversized response leave pending evidence and never retry', async () => {
  for (const post of [() => { throw new Error(invite.code); }, () => new Response('x'.repeat(262145), { status: 201 }), () => json({ code: 'SECRET_BEARER', detail: invite.code }, 500)]) {
    await mocked(async ({ out, args, posts }) => {
      const r = await qv(args); assert.equal(r.code, 1); assert.equal(posts(), 1); assert.equal(r.out, '');
      assert.equal(r.err.includes(invite.code), false); assert.equal(r.err.includes('SECRET_BEARER'), false); assert.match(r.err, /not confirmed/);
      assert.equal(JSON.parse(readFileSync(out, 'utf8')).format, 'qv-invite-issuance/pending');
    }, post);
  }
});
