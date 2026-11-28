import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { buildServer } from '../src/app.ts';
import { SELF_AUDIT_INTERVAL_MS } from '../src/self-audit.ts';
import { World } from './helpers/world.ts';
import { exportQvb, fullElection, importAndWait } from './helpers/full.ts';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function observeJobs(t: TestContext, w: World) {
  const c = w.server.env.control;
  const created: string[] = [];
  const finished: string[] = [];
  const waiters = new Map<number, (id: string) => void>();
  const create = c.createJob.bind(c), finish = c.finishJob.bind(c);
  const createMock = t.mock.method(c, 'createJob', (spec: Parameters<typeof c.createJob>[0]) => {
    const row = create(spec);
    if (spec.kind === 'self_audit') created.push(row.job_id);
    return row;
  });
  t.mock.method(c, 'finishJob', (...args: Parameters<typeof c.finishJob>) => {
    finish(...args);
    if (created.includes(args[0])) {
      finished.push(args[0]);
      waiters.get(finished.length - 1)?.(args[0]);
    }
  });
  const completed = (index = 0): Promise<string> => finished[index] !== undefined
    ? Promise.resolve(finished[index]!) : new Promise((resolve) => { waiters.set(index, resolve); });
  return { created, completed, calls: () => createMock.mock.callCount() };
}

test('self-audit: the six-hour timer detects stored corruption, quarantines and keeps the stop on restart', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'scheduled-self-audit', n: 3, t: 2, voters: 1, witnessQuorum: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.publishManifest();
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const rt = (await w.server.pool.get(w.electionId))!;
    const checkpoint = rt.edb.store.latestCheckpoint()!.note;
    const jobs = observeJobs(t, w);
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    const raw = new DatabaseSync(path);
    const original = (raw.prepare('SELECT body FROM log_entry WHERE seq=1').get() as { body: Uint8Array }).body;
    const corrupt = new Uint8Array(original); corrupt[corrupt.length - 5] = corrupt[corrupt.length - 5]! ^ 0x20;
    raw.exec('DROP TRIGGER log_entry_noupdate');
    raw.prepare('UPDATE log_entry SET body=? WHERE seq=1').run(corrupt);
    raw.close();
    t.mock.timers.tick(SIX_HOURS - 1);
    assert.equal(jobs.created.length, 0, 'no audit before the six-hour boundary');
    assert.equal(rt.quarantineReason(), undefined);
    t.mock.timers.tick(1);
    assert.equal(jobs.created.length, 1, 'the interval must submit the missing periodic self-audit');
    const job = w.server.env.control.job(await jobs.completed())!;
    assert.equal(job.state, 'done');
    assert.equal(JSON.parse(job.result!).ok, false);
    assert.equal(JSON.parse(rt.forcedQuarantine!).code, 'SELF_AUDIT_MISMATCH');
    assert.ok(rt.edb.eventsAfter(0, 100).some((event) => event.type === 'alert' && JSON.parse(event.data).detail_code === 'SELF_AUDIT_MISMATCH'));
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.integrity, 'quarantined');
    assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh))).status, 503);
    assert.equal(rt.edb.store.latestCheckpoint()!.note, checkpoint, 'quarantine must not issue a new checkpoint');
    // Restoring the damaged bytes alone cannot clear the persisted operator incident.
    const restore = new DatabaseSync(path);
    restore.prepare('UPDATE log_entry SET body=? WHERE seq=1').run(original);
    restore.close();
    await tick();
    await w.server.stop();
    await w.start();
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.integrity, 'quarantined');
  } finally {
    await w.stop();
    t.mock.timers.reset();
  }
});

test('self-audit: startup arms the six-hour interval, repeated cycles run, and stop removes admission', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-lifecycle', n: 3, t: 2, voters: 0 });
  w.server = buildServer({ dataDir: w.dir, logSink: (line) => w.logs.push(line), retentionSweepMs: 0 });
  const jobs = observeJobs(t, w);
  try {
    assert.equal(SELF_AUDIT_INTERVAL_MS, SIX_HOURS);
    t.mock.timers.tick(SIX_HOURS);
    assert.equal(jobs.created.length, 0, 'constructing the server does not start background auditing');
    await w.server.start();
    t.mock.timers.tick(SIX_HOURS - 1);
    assert.equal(jobs.created.length, 0);
    t.mock.timers.tick(1);
    assert.equal(jobs.created.length, 1);
    const first = w.server.env.control.job(await jobs.completed())!;
    assert.equal(first.state, 'done');
    assert.deepEqual(JSON.parse(first.result!), { ok: true, checked: 0, mismatched: 0, unavailable: 0 });
    await tick();
    t.mock.timers.tick(SIX_HOURS);
    assert.equal(jobs.created.length, 2);
    assert.equal(w.server.env.control.job(await jobs.completed(1))!.state, 'done');
    await w.server.stop();
    const calls = jobs.calls();
    t.mock.timers.tick(2 * SIX_HOURS);
    assert.equal(jobs.calls(), calls, 'no attempts against closed storage after stop');
  } finally { await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: one queued sweep shares the FIFO runner with heavy jobs and repeated ticks do not accumulate work', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-fifo', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  const release = deferred<void>(), entered = deferred<void>();
  try {
    const blocker = w.server.jobs.submit('admin', 4, { kind: 'backup', election_id: null, params: {}, created_by: 'system' }, async () => {
      entered.resolve(); await release.promise; return {};
    });
    await entered.promise;
    const jobs = observeJobs(t, w);
    t.mock.timers.tick(SIX_HOURS);
    assert.equal(jobs.created.length, 1);
    assert.equal(w.server.env.control.job(blocker.job_id)!.state, 'running');
    assert.equal(w.server.env.control.job(jobs.created[0]!)!.state, 'queued');
    t.mock.timers.tick(3 * SIX_HOURS);
    assert.equal(jobs.created.length, 1, 'at most one periodic sweep is queued or running');
    release.resolve();
    assert.equal(w.server.env.control.job(await jobs.completed())!.state, 'done');
    assert.equal(w.server.env.control.job(blocker.job_id)!.state, 'done');
  } finally { release.resolve(); await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: shutdown cancels a queued sweep and drains the running job before closing storage', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-cancel-queued', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  const release = deferred<void>(), entered = deferred<void>();
  try {
    w.server.jobs.submit('admin', 4, { kind: 'backup', election_id: null, params: {}, created_by: 'system' }, async () => {
      entered.resolve(); await release.promise; return {};
    });
    await entered.promise;
    const jobs = observeJobs(t, w);
    t.mock.timers.tick(SIX_HOURS);
    const stopping = w.server.stop();
    const cancelled = w.server.env.control.job(await jobs.completed())!;
    assert.equal(cancelled.state, 'failed');
    assert.equal(JSON.parse(cancelled.error!).code, 'CANCELLED');
    t.mock.timers.tick(2 * SIX_HOURS);
    assert.equal(jobs.created.length, 1);
    release.resolve();
    await stopping;
  } finally { release.resolve(); await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: cancellation during runtime acquisition performs no later audit work', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-cancel-running', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  const release = deferred<void>(), entered = deferred<void>();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const jobs = observeJobs(t, w);
    t.mock.method(w.server.pool, 'get', async () => { entered.resolve(); await release.promise; return rt; });
    t.mock.timers.tick(SIX_HOURS);
    await entered.promise;
    t.mock.timers.tick(2 * SIX_HOURS);
    assert.equal(jobs.created.length, 1, 'a running periodic audit is not duplicated');
    const stopping = w.server.stop();
    release.resolve();
    const cancelled = w.server.env.control.job(await jobs.completed())!;
    assert.equal(cancelled.state, 'failed');
    assert.equal(JSON.parse(cancelled.error!).code, 'CANCELLED');
    assert.equal(w.server.env.control.auditRows().filter((row) => row.action === 'election.self_audit').length, 0);
    assert.equal(rt.inUse, 0);
    await stopping;
  } finally { release.resolve(); await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: unavailable elections do not starve other audits and the durable job reports incomplete', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-unavailable', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.server.pool.create(w.orgId, 'Another draft', 'public');
    const first = w.server.env.control.listAllElections(undefined, undefined, 100)[0]!.election_id;
    const get = w.server.pool.get.bind(w.server.pool);
    const unavailable = t.mock.method(w.server.pool, 'get', async (id: string) => {
      if (id === first) throw new Error('private synthetic storage error marker');
      return get(id);
    });
    const jobs = observeJobs(t, w);
    t.mock.timers.tick(SIX_HOURS);
    const failed = w.server.env.control.job(await jobs.completed())!;
    assert.equal(failed.state, 'failed');
    const error = JSON.parse(failed.error!);
    assert.equal(error.code, 'SELF_AUDIT_INCOMPLETE');
    assert.equal(error.checked, 1);
    assert.equal(error.unavailable, 1);
    assert.equal(error.mismatched, 0);
    assert.ok(!failed.error!.includes('private synthetic'));
    assert.ok(!w.logs.join('\n').includes('private synthetic'));
    unavailable.mock.restore();
    await tick();
    t.mock.timers.tick(SIX_HOURS);
    const recovered = w.server.env.control.job(await jobs.completed(1))!;
    assert.equal(recovered.state, 'done');
    assert.deepEqual(JSON.parse(recovered.result!), { ok: true, checked: 2, mismatched: 0, unavailable: 0 });
  } finally { await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: failed durable admission emits a fixed error and retries at the next interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-admission', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  try {
    const submit = w.server.jobs.submit.bind(w.server.jobs);
    let fail = true;
    t.mock.method(w.server.jobs, 'submit', (...args: Parameters<typeof submit>) => {
      if (fail) { fail = false; throw new Error('private synthetic database path marker'); }
      return submit(...args);
    });
    const jobs = observeJobs(t, w);
    t.mock.timers.tick(SIX_HOURS);
    assert.equal(jobs.created.length, 0);
    assert.ok(w.logs.some((line) => JSON.parse(line).code === 'SELF_AUDIT_SCHEDULE_FAILED'));
    assert.ok(!w.logs.join('\n').includes('private synthetic'));
    t.mock.timers.tick(SIX_HOURS);
    assert.equal(w.server.env.control.job(await jobs.completed())!.state, 'done');
  } finally { await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: a registry page boundary visits every remaining election and skips a concurrent deletion', { timeout: 30_000 }, async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w = new World({ seed: 'self-audit-paging', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const registry = w.server.env.control.election(w.electionId)!;
    // Scheduler-only scale fixture: actual audit work uses one valid empty runtime;
    // the registry/pool seam independently tracks all 101 requested identities.
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...registry, election_id: (index + 1).toString(16).padStart(32, '0') }));
    const requested: string[] = [];
    t.mock.method(w.server.env.control, 'countAllElections', () => rows.length);
    t.mock.method(w.server.env.control, 'listAllElections', (_state: string | undefined, after: string | undefined, limit: number) => rows.filter((row) => after === undefined || row.election_id > after).slice(0, limit));
    t.mock.method(w.server.pool, 'get', async (id: string) => {
      requested.push(id);
      return id === rows[50]!.election_id ? undefined : rt;
    });
    const jobs = observeJobs(t, w);
    t.mock.timers.tick(SIX_HOURS);
    const job = w.server.env.control.job(await jobs.completed())!;
    assert.equal(job.state, 'done');
    assert.deepEqual(requested, rows.map((row) => row.election_id));
    assert.deepEqual(JSON.parse(job.result!), { ok: true, checked: 100, mismatched: 0, unavailable: 0 });
  } finally { await w.stop(); t.mock.timers.reset(); }
});

test('self-audit: scheduled archive and imported-mirror audits retain keyless read-only handles and database bytes', { timeout: 120_000 }, async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const source = await fullElection('self-audit-keyless-source', { server: { retentionSweepMs: 0 } });
  const mirror = new World({ seed: 'self-audit-keyless-mirror', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  let mirrorStarted = false;
  const audit = async (w: World, id: string, checked: number): Promise<void> => {
    const rt = (await w.server.pool.get(id))!;
    const connection = rt.edb.db;
    const path = join(w.dir, w.server.env.control.election(id)!.db_path);
    const before = readFileSync(path);
    const wal = existsSync(path + '-wal') ? readFileSync(path + '-wal') : Buffer.alloc(0);
    const checkpoint = rt.edb.store.latestCheckpoint()!.note;
    const jobs = observeJobs(t, w);
    assert.equal(rt.edb.readOnly, true);
    t.mock.timers.tick(SIX_HOURS);
    const job = w.server.env.control.job(await jobs.completed())!;
    assert.equal(job.state, 'done');
    assert.deepEqual(JSON.parse(job.result!), { ok: true, checked, mismatched: 0, unavailable: 0 });
    assert.equal(rt.edb.db, connection);
    assert.equal(rt.edb.readOnly, true);
    assert.equal(rt.edb.row().log_sk_enc, null);
    assert.equal(rt.edb.row().srv_sk_enc, null);
    assert.equal(rt.log.checkpoint().ok, false, 'audit never reacquires signing capability');
    assert.equal(rt.edb.store.latestCheckpoint()!.note, checkpoint);
    assert.ok(readFileSync(path).equals(before));
    assert.ok((existsSync(path + '-wal') ? readFileSync(path + '-wal') : Buffer.alloc(0)).equals(wal));
  };
  try {
    await audit(source, source.electionId, 1);
    const exported = await exportQvb(source);
    await source.server.stop(); // Only one instance's periodic job is active at a time.
    await mirror.start(); mirrorStarted = true;
    await mirror.setupOrgAndElection();
    assert.equal((await importAndWait(mirror, exported)).state, 'done');
    await audit(mirror, source.electionId, 2); // One native draft plus the imported mirror.
  } finally {
    if (mirrorStarted) await mirror.stop();
    await source.stop();
    t.mock.timers.reset();
  }
});
