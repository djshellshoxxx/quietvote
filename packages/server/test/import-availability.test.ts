// Availability and publication boundaries for imports; all fixtures are synthetic.
import test, { after, afterEach, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs, { existsSync, readdirSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { Worker } from 'node:worker_threads';
import { request, type IncomingMessage } from 'node:http';
import { signRequest } from '../src/auth.ts';
import { join } from 'node:path';
import { commitImport, ImportError, runVerificationWorker, verifyBundle, type VerifiedBundle } from '../src/imports.ts';
import { ElectionRuntime } from '../src/election.ts';
import { exportQvb, fullElection, upload, waitJob } from './helpers/full.ts';
import { World } from './helpers/world.ts';

let source: World;
let target: World;
let tar: Uint8Array;
let verified: VerifiedBundle;
const files = (): string[] => {
  const dir = join(target.dir, 'elections', source.electionId.slice(0, 2));
  return existsSync(dir) ? readdirSync(dir).filter((x) => x.startsWith(source.electionId)) : [];
};
before(async () => {
  source = await fullElection('import-availability');
  tar = await exportQvb(source);
}, { timeout: 120_000 });
beforeEach(async () => {
  target = new World({ seed: 'import-availability-target', n: 3, t: 2, voters: 1, server: { maxElectionsPerOrg: 2, maxImportUploads: 1 } });
  await target.start();
  await target.setupOrgAndElection();
  verified ??= await verifyBundle(target.server.env, tar, undefined, async () => {}, () => {});
}, { timeout: 120_000 });
after(async () => {
  await source.stop();
});
afterEach(async () => { await target.stop(); });

test('board verification allows an event-loop turn before reporting its result', async () => {
  let ran = false;
  await verifyBundle(target.server.env, tar, undefined, async () => {}, (p) => {
    if (p === 0.55) setImmediate(() => { ran = true; });
    if (p === 0.8) assert.equal(ran, true, 'board signatures must run off the event-loop thread');
  });
});

test('a typed cancellation before publication removes staging files', async () => {
  await assert.rejects(commitImport(target.server.env, verified, target.orgId, 'public', null,
    async () => { throw new ImportError('TEST_CANCEL', 'synthetic cancellation'); }), { rule: 'TEST_CANCEL' });
  assert.deepEqual(files(), []);
  assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
});

test('replay self-test runs before the imported election is visible', async () => {
  let visible: boolean | undefined;
  const open = mock.method(ElectionRuntime, 'open', async () => {
    visible = target.server.env.control.election(source.electionId) !== undefined;
    throw new Error('synthetic replay failure');
  });
  try {
    await assert.rejects(commitImport(target.server.env, verified, target.orgId, 'public', null,
      async () => {}), { rule: 'REPLAY_FAILED' });
    assert.equal(visible, false, 'registry must not expose an import while its replay can still fail');
    assert.deepEqual(files(), []);
    assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
  } finally { open.mock.restore(); }
});

test('quota is rechecked after staging yields and concurrent native creation', async () => {
  await assert.rejects(commitImport(target.server.env, verified, target.orgId, 'public', null,
    async () => {
      if (target.server.env.control.countElections(target.orgId) === 1) await target.server.pool.create(target.orgId, 'Concurrent native election', 'public');
    }), { rule: 'QUOTA' });
  assert.equal(target.server.env.control.countElections(target.orgId), 2);
  assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
  assert.deepEqual(files(), []);
});

test('shutdown cancels active and queued imports and joins the verifier before releasing its slot', async () => {
  const jobs = target.server.jobs;
  const w = new Worker(new URL('data:text/javascript,for(;;){}'));
  const spec = { kind: 'import' as const, election_id: null, params: {}, created_by: 'synthetic' };
  const active = jobs.submit('import', 2, spec, async (ctl) => {
    await runVerificationWorker(w, 120_000, ctl.signal);
    return { result: 'must not succeed' };
  });
  const queued = jobs.submit('import', 2, spec, async () => { throw new Error('queued work must not start'); });
  await jobs.stop();
  assert.equal(w.threadId, -1);
  assert.equal(jobs.active('import'), 0);
  for (const row of [active, queued]) {
    const final = target.server.env.control.job(row.job_id)!;
    assert.equal(final.state, 'failed');
    assert.equal(JSON.parse(final.error!).code, 'CANCELLED');
    assert.equal(final.result, null);
  }
});

test('two concurrent duplicate uploads publish once and release both queue slots', async () => {
  const [a, b] = await Promise.all([upload(target, tar), upload(target, tar)]);
  assert.deepEqual([a.status, b.status], [202, 202]);
  const completed = await Promise.all([waitJob(target, a.json.job_id), waitJob(target, b.json.job_id)]);
  assert.deepEqual(completed.map((x) => x.state).sort(), ['done', 'failed']);
  assert.equal(completed.find((x) => x.state === 'failed').error.rule, 'ELECTION_EXISTS');
  assert.equal(target.server.env.stats.importVerifications, 1);
  assert.equal(target.server.env.control.countElections(target.orgId), 2);
  assert.equal(target.server.jobs.active('import'), 0);
});

test('cleanup failure stays unpublished and a retry removes the orphan', async () => {
  let staged = false;
  const original = fs.rmSync;
  const remove = mock.method(fs, 'rmSync', (...args: Parameters<typeof fs.rmSync>) => {
    if (staged && String(args[0]).includes(source.electionId)) throw new Error('synthetic unlink failure');
    return original(...args);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(commitImport(target.server.env, verified, target.orgId, 'public', null,
      async () => { staged = true; throw new Error('synthetic cancellation'); }), { rule: 'IMPORT_CLEANUP' });
    assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
    assert.ok(files().length > 0, 'failed unlink leaves an explicit, unpublished orphan');
  } finally { remove.mock.restore(); syncBuiltinESMExports(); }
  assert.equal((await commitImport(target.server.env, verified, target.orgId, 'public', null, async () => {})).election_id, source.electionId);
});

test('audit publication failure rolls back the registry and removes staged files', async () => {
  const audit = mock.method(target.server.env.control, 'audit', () => { throw new Error('synthetic audit failure'); });
  try {
    await assert.rejects(commitImport(target.server.env, verified, target.orgId, 'public', null, async () => {}), /synthetic audit failure/);
    assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
    assert.deepEqual(files(), []);
  } finally { audit.mock.restore(); }
});

test('shutdown waits beyond the old cutoff for staged replay cleanup without publishing success', async (t) => {
  let entered!: () => void;
  let release!: () => void;
  const inReplay = new Promise<void>((r) => { entered = r; });
  const blocked = new Promise<void>((r) => { release = r; });
  const original = ElectionRuntime.open;
  const open = mock.method(ElectionRuntime, 'open', async (...args: Parameters<typeof ElectionRuntime.open>) => {
    entered(); await blocked; return original(...args);
  });
  const jobs = target.server.jobs;
  const job = jobs.submit('import', 2, { kind: 'import', election_id: null, params: {}, created_by: 'synthetic' }, async (ctl) => ({
    result: await commitImport(target.server.env, verified, target.orgId, 'public', null, ctl.tick),
  }));
  await inReplay;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stopped = false;
  const stopping = jobs.stop().then(() => { stopped = true; });
  try {
    t.mock.timers.tick(5001);
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(stopped, false, 'import cleanup must retain its control database after the former five-second cutoff');
    assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
  } finally {
    release(); await stopping; open.mock.restore(); t.mock.timers.reset();
  }
  assert.equal(target.server.env.control.job(job.job_id)!.state, 'failed');
  assert.equal(target.server.env.control.electionAny(source.electionId), undefined);
  assert.deepEqual(files(), []);
});

test('disconnect during upload releases the reservation without enqueueing an import', { timeout: 60_000 }, async () => {
  const path = `/api/v1/imports?org_id=${target.orgId}`;
  const u = new URL(target.base);
  const reading = new Promise<IncomingMessage>((resolve) => {
    target.server.http.server.once('request', (incoming) => incoming.once('data', () => resolve(incoming)));
  });
  const partial = request({ host: u.hostname, port: u.port, method: 'POST', path, headers: {
    'content-type': 'application/x-tar', 'content-length': String(tar.length), 'idempotency-key': 'partial-import',
    authorization: signRequest(target.owner.secretKey, target.owner.publicKey, 'POST', path, target.audience, tar, target.nowSec, target.rng.bytes(16)),
  } });
  partial.on('error', () => {});
  partial.write(Buffer.from(tar.subarray(0, 10)));
  const incoming = await reading;
  try {
    // Probe admission with headers only: an early rejection closes the connection without consuming a body.
    // Eagerly uploading the full archive here can race that close (ECONNRESET on Windows) before we see the 503.
    const busy = await new Promise<{ status: number; body: string; retryAfter: string | undefined }>((resolve, reject) => {
      const probe = request({ host: u.hostname, port: u.port, method: 'POST', path, agent: false, headers: {
        'content-type': 'application/x-tar', 'content-length': String(tar.length), 'idempotency-key': 'occupied-import',
        authorization: signRequest(target.owner.secretKey, target.owner.publicKey, 'POST', path, target.audience, tar, target.nowSec, target.rng.bytes(16)),
      } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.once('error', reject);
        res.once('end', () => resolve({ status: res.statusCode ?? 0, body, retryAfter: res.headers['retry-after'] }));
      });
      probe.once('error', reject);
      const deadline = setTimeout(() => probe.destroy(new Error('occupied upload was not rejected from headers')), 10_000);
      probe.once('close', () => clearTimeout(deadline));
      probe.end(); // Declared body is deliberately withheld; occupied-slot rejection must precede body reads.
    });
    assert.equal(busy.status, 503, 'the single upload reservation is held');
    assert.equal(JSON.parse(busy.body).code, 'BUSY');
    assert.equal(busy.retryAfter, '5');
    assert.equal(target.server.jobs.active('import'), 0);
  } finally {
    const closed = incoming.destroyed ? Promise.resolve() : new Promise<void>((resolve) => incoming.once('close', resolve));
    partial.destroy(); await closed;
  }
  await new Promise<void>((r) => setImmediate(r));
  const retry = await upload(target, tar);
  assert.equal(retry.status, 202, 'disconnect returns capacity to the next upload');
  assert.equal((await waitJob(target, retry.json.job_id)).state, 'done');
});
