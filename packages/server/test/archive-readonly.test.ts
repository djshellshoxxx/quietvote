// @verifies QV-28-REQ-015
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { fullElection, exportQvb, importAndWait } from './helpers/full.ts';
import { World } from './helpers/world.ts';
import { ElectionDb } from '../src/electiondb.ts';
import { SERVER_VERSION } from '../src/election.ts';
import { backupWork } from '../src/admin.ts';

async function assertReadable(w: World, id = w.electionId): Promise<void> {
  const rt = (await w.server.pool.get(id))!, connection = rt.edb.db;
  assert.equal(rt.edb.readOnly, true, 'pooled terminal handle is physically read-only');
  assert.throws(() => connection.prepare('UPDATE election SET title=title').run(), /readonly database/);
  for (const suffix of ['/state', '/log/entries?from=0&limit=1000', '/log/checkpoint', '/log/proof/inclusion?seq=0', '/export.json', '/export.json?board=1']) {
    assert.equal((await w.get(`/api/v1/elections/${id}${suffix}`)).status, 200, `terminal GET ${suffix}`);
  }
  assert.ok((await exportQvb(w, id)).length > 0);
  assert.equal((await w.server.pool.get(id))!.edb.db, connection, 'reads retain one stable read connection');
  assert.equal(rt.edb.row().log_sk_enc, null);
  assert.equal(rt.edb.row().srv_sk_enc, null);
  assert.equal(rt.edb.hasAppendCompletions(), false);
  assert.equal(rt.log.checkpoint().ok, false, 'terminal access never reacquires signing capability');
}

test('native archive retires its writer and clean reload/HTTP reads do not change database bytes or append WAL frames', { timeout: 120_000 }, async () => {
  const w = await fullElection('archive-readonly-native', { server: { retentionSweepMs: 0 } });
  try {
    await assertReadable(w);
    await w.server.pool.evict(w.electionId);
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path), before = readFileSync(path);
    const wal = existsSync(path + '-wal') ? readFileSync(path + '-wal') : Buffer.alloc(0);
    await assertReadable(w);
    assert.ok(readFileSync(path).equals(before), 'clean archive reads preserve actual database bytes');
    assert.ok((existsSync(path + '-wal') ? readFileSync(path + '-wal') : Buffer.alloc(0)).equals(wal), 'locking side files may exist, but reads append no WAL frames');
    await w.server.stop(); await w.start();
    await assertReadable(w);
    assert.ok(readFileSync(path).equals(before), 'startup receipt/event inspection does not rewrite a clean archive');
  } finally { await w.stop(); }
});

test('verified import staging publishes a read-only runtime and keeps mirror cosignatures refused', { timeout: 120_000 }, async () => {
  const source = await fullElection('archive-readonly-source', { server: { retentionSweepMs: 0 } });
  const mirror = new World({ seed: 'archive-readonly-mirror', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await mirror.start();
  try {
    await mirror.setupOrgAndElection();
    const job = await importAndWait(mirror, await exportQvb(source));
    assert.equal(job.state, 'done');
    await assertReadable(mirror, source.electionId);
    assert.equal((await mirror.req('POST', `/api/v1/elections/${source.electionId}/log/cosignatures`, { checkpoint_size: 1, lines: [] })).status, 409);
    await mirror.server.stop(); await mirror.start();
    await assertReadable(mirror, source.electionId);
  } finally { await mirror.stop(); await source.stop(); }
});

test('terminal state is probed before migration even when the control registry is stale', async () => {
  const w = new World({ seed: 'archive-readonly-schema', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    await w.server.pool.evict(w.electionId);
    const raw = new DatabaseSync(path);
    // A deliberately unsupported version marker tests refusal, not historical schema compatibility.
    raw.exec("UPDATE election SET state='ARCHIVED'; DELETE FROM schema_migration WHERE version=11; PRAGMA user_version=10"); raw.close();
    const before = readFileSync(path);
    assert.throws(() => ElectionDb.openExisting(path, SERVER_VERSION), /requires explicit migration/);
    await assert.rejects(w.server.pool.get(w.electionId), /requires explicit migration/);
    assert.ok(readFileSync(path).equals(before));
    assert.equal(existsSync(path + '.pre-migrations'), false, 'terminal probing never starts an automatic upgrade');
    const inspect = new DatabaseSync(path, { readOnly: true });
    try { assert.equal(inspect.prepare('PRAGMA user_version').get()!['user_version'], 10); }
    finally { inspect.close(); }
  } finally { await w.stop(); }
});

test('online backup keeps its own read handle when the live runtime archives during the asynchronous copy', { timeout: 120_000 }, async () => {
  const w = await fullElection('archive-readonly-backup', { stopAt: 'AUDIT', server: { retentionSweepMs: 0 } });
  let ready!: () => void, release!: () => void;
  const paused = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let source: DatabaseSync | undefined;
  const copy: typeof backup = async (...args) => {
    source = args[0]; ready(); await gate;
    return backup(...args);
  };
  const work = backupWork(w.server.env, w.server.pool, 'a'.repeat(26), 'election', w.electionId,
    { jobId: 'a'.repeat(26), signal: new AbortController().signal, progress: () => undefined, tick: async () => undefined }, copy);
  try {
    await Promise.race([paused, work.then(() => { throw new Error('backup did not reach its copy boundary'); })]);
    const rt = (await w.server.pool.get(w.electionId))!, writer = rt.edb.db;
    assert.ok(source);
    assert.notEqual(source, writer, 'backup owns its handle rather than borrowing the retiring writer');
    assert.throws(() => source!.prepare('UPDATE election SET title=title').run(), /readonly database/);
    assert.equal((await w.post('audit_close', w.coord[0]!, w.control('audit-close'))).status, 201);
    assert.equal(writer.isOpen, false);
    assert.equal(source.isOpen, true);
    release();
    const result = await work;
    assert.equal((result.result as { files: number }).files, 1);
    assert.equal(source.isOpen, false, 'backup closes its read handle after copying');
    await assertReadable(w);
  } finally {
    release(); await work.catch(() => undefined);
    await w.stop();
  }
});

test('failed reader acquisition after committed archive closes the writer and reloads a read-only runtime', { timeout: 120_000 }, async (t) => {
  const w = await fullElection('archive-readonly-retire-failure', { stopAt: 'AUDIT', server: { retentionSweepMs: 0 } });
  try {
    const rt = (await w.server.pool.get(w.electionId))!, writer = rt.edb.db;
    const fault = t.mock.method(rt.edb, 'makeReadOnly', () => { throw new Error('injected reader acquisition failure'); });
    assert.equal((await w.post('audit_close', w.coord[0]!, w.control('audit-close'))).status, 500);
    fault.mock.restore();
    assert.equal(rt.poisoned, true, 'a failed retirement cannot remain a usable cached runtime');
    assert.equal(writer.isOpen, false, 'the committed archive does not retain its writable handle');
    await assertReadable(w);
    assert.notEqual((await w.server.pool.get(w.electionId))!, rt);
  } finally { t.mock.restoreAll(); await w.stop(); }
});
