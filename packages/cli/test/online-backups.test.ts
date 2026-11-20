// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { World, kp } from '../../server/test/helpers/world.ts';
import { waitJob } from '../../server/test/helpers/full.ts';
import { FLOOR_PARAMS, wrapSeed } from '../src/keyfile.ts';
import { writePrivateFixtureAsync } from './private-fixture.ts';
import { BIN, qv, tmp } from './helpers.ts';

test('backup-create submits both scopes with a protected admin key, replays one job and inspects completion', { timeout: 120_000 }, async () => {
  const admin = kp('cli-online-backup', 'admin');
  const w = new World({ seed: 'cli-online-backup', n: 3, t: 2, voters: 3, server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  w.clock = Date.now();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const passphrase = 'correct horse battery staple', key = join(w.dir, 'backup-admin.key');
    await writePrivateFixtureAsync(key, JSON.stringify(await wrapSeed(admin.secretKey, passphrase, w.rng, FLOOR_PARAMS)));
    const auth = ['--server', w.base, '--audience', w.audience, '--key', key, '--passphrase-stdin', '--json'];
    const cli = (args: string[]) => qv(['online', ...args, ...auth], { rng: w.rng, stdin: passphrase });
    const args = ['backup-create', '--scope', 'all', '--idempotency-key', 'cli-backup-full-1'];
    const created = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, 'online', ...args, ...auth], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000 });
      let out = '', err = '';
      child.stdout.on('data', (b: Buffer) => { out += b.toString(); });
      child.stderr.on('data', (b: Buffer) => { err += b.toString(); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, out, err }));
      child.stdin.end(passphrase);
    });
    assert.equal(created.code, 0, created.err);
    const receipt = JSON.parse(created.out);
    assert.equal(receipt.kind, 'backup');
    assert.equal(receipt.scope, 'all');
    assert.equal(receipt.election_id, undefined);
    const replay = await cli(args);
    assert.equal(replay.code, 0, replay.err);
    assert.equal(JSON.parse(replay.out).job_id, receipt.job_id);
    const done = await waitJob(w, receipt.job_id, admin);
    assert.equal(done.state, 'done', JSON.stringify(done));
    const inspected = await cli(['job-inspect', '--job-id', receipt.job_id]);
    assert.equal(inspected.code, 0, inspected.err);
    assert.equal(JSON.parse(inspected.out).state, 'done');
    const manifest = JSON.parse(readFileSync(join(w.dir, 'backups', receipt.job_id, 'manifest.json'), 'utf8'));
    assert.equal(manifest.scope, 'all');
    assert.deepEqual(manifest.files.map((f: { name: string }) => f.name).sort(), ['control.sqlite', `elections-${w.electionId}.sqlite`]);
    const scoped = await cli(['backup-create', '--scope', 'election', '--id', w.electionId, '--idempotency-key', 'cli-backup-election-1']);
    assert.equal(scoped.code, 0, scoped.err);
    const scopedReceipt = JSON.parse(scoped.out);
    assert.equal(scopedReceipt.election_id, w.electionId);
    assert.equal(scopedReceipt.scope, 'election');
    assert.equal((await waitJob(w, scopedReceipt.job_id, admin)).state, 'done');
    const single = JSON.parse(readFileSync(join(w.dir, 'backups', scopedReceipt.job_id, 'manifest.json'), 'utf8'));
    assert.deepEqual(single.files.map((f: { name: string }) => f.name), [`elections-${w.electionId}.sqlite`]);
    const conflict = await cli(['backup-create', '--scope', 'election', '--id', w.electionId, '--idempotency-key', 'cli-backup-full-1']);
    assert.equal(conflict.code, 1);
    assert.match(conflict.err, /HTTP 422/);
    const owner = join(w.dir, 'owner.key');
    await writePrivateFixtureAsync(owner, JSON.stringify({ format: 'qv-voter-key/v1', public_key: bytesToHex(w.owner.publicKey), seed: bytesToHex(w.owner.secretKey) }));
    const refused = await qv(['online', ...args, '--server', w.base, '--audience', w.audience, '--key', owner], { rng: w.rng });
    assert.equal(refused.code, 1);
    assert.match(refused.err, /HTTP 403/);
  } finally { await w.stop(); }
});

test('backup-create validates scope, election option and idempotency before loading credentials', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected request'); });
  const auth = ['--server', 'https://board.example', '--audience', 'qv:test@https://board.example', '--key', 'missing.key'];
  for (const options of [
    [], ['--scope', 'unknown'], ['--scope', 'election'], ['--scope', 'election', '--id', 'short'],
    ['--scope', 'all', '--id', '12'.repeat(16)], ['--scope', 'all'],
    ['--scope', 'all', '--idempotency-key', 'short'],
  ]) {
    const result = await qv(['online', 'backup-create', ...auth, ...options]);
    assert.equal(result.code, 2, result.err);
    assert.equal(result.out, '');
  }
  assert.equal(calls, 0);
});

test('backup-create binds the returned job, selects metadata and preserves unknown outcomes without retry', async (t) => {
  const dir = tmp(), pair = kp('cli-backup-response', 'admin'), key = join(dir, 'admin.key');
  try {
    await writePrivateFixtureAsync(key, JSON.stringify({ format: 'qv-voter-key/v1', public_key: bytesToHex(pair.publicKey), seed: bytesToHex(pair.secretKey) }));
    const job = { job_id: 'a'.repeat(26), kind: 'backup', state: 'queued', progress: 0, created_at: '2026-11-20T12:00:00Z' };
    let value: unknown = { ...job, result_ref: 'https://metadata.example/ignored', extra: 'discarded-field' }, calls = 0;
    let reply = () => new Response(JSON.stringify(value), { status: 202, headers: { Location: 'https://metadata.example/ignored' } });
    let id: string | undefined;
    t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
      calls++;
      assert.equal(String(url), 'https://board.example/api/v1/admin/backups');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.equal((init.headers as Record<string, string>)['idempotency-key'], 'cli-backup-binding');
      assert.match((init.headers as Record<string, string>)['authorization']!, /^QV-Sig /);
      assert.deepEqual(JSON.parse(Buffer.from(init.body as Uint8Array).toString()), id === undefined ? { scope: 'all' } : { scope: 'election', election_id: id });
      return reply();
    });
    const invoke = () => qv(['online', 'backup-create', '--server', 'https://board.example', '--audience', 'qv:test@https://board.example',
      '--key', key, '--scope', id === undefined ? 'all' : 'election', ...(id === undefined ? [] : ['--id', id]),
      '--idempotency-key', 'cli-backup-binding'], { rng: streamRng('backup-response') });
    const accepted = await invoke();
    assert.equal(accepted.code, 0, accepted.err);
    assert.deepEqual(JSON.parse(accepted.out), { ...job, scope: 'all' });
    for (value of [null, [], { ...job, job_id: 'short' }, { ...job, kind: 'export' }, { ...job, election_id: '12'.repeat(16) },
      { ...job, state: 'unknown' }, { ...job, progress: 2 }, { ...job, created_at: 'not-a-date' }]) {
      const before = calls, refused = await invoke();
      assert.equal(refused.code, 1, refused.err);
      assert.equal(refused.out, '');
      assert.match(refused.err, /may have been accepted/);
      assert.equal(calls, before + 1);
    }
    id = '12'.repeat(16);
    value = { ...job, election_id: id };
    const scoped = await invoke();
    assert.equal(scoped.code, 0, scoped.err);
    assert.equal(JSON.parse(scoped.out).election_id, id);
    value = { ...job, election_id: '34'.repeat(16) };
    assert.equal((await invoke()).code, 1);
    for (reply of [
      () => { throw new Error('connection lost'); },
      () => new Response('{', { status: 202 }),
      () => new Response(' '.repeat(64 * 1024 + 1), { status: 202 }),
      () => new Response(JSON.stringify({ code: 'BUSY' }), { status: 503 }),
    ]) {
      const before = calls, failed = await invoke();
      assert.equal(failed.code, 1, failed.err);
      assert.equal(failed.out, '');
      assert.match(failed.err, /outcome unknown|may have been accepted/);
      assert.equal(calls, before + 1, 'a mutation is never automatically retried');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
