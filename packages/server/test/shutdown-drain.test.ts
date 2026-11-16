import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import { buildServer } from '../src/app.ts';
import { ElectionRuntime } from '../src/election.ts';
import { createHttpApp } from '../src/http.ts';
import { World } from './helpers/world.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

test('pool shutdown waits for opening runtimes and rejects new acquisition', async (t) => {
  const w = new World({ seed: 'shutdown-pool', n: 3, t: 2, voters: 1 });
  await w.start();
  const entered = deferred();
  const resume = deferred();
  try {
    await w.setupOrgAndElection();
    await w.server.pool.evict(w.electionId);
    const original = ElectionRuntime.open;
    t.mock.method(ElectionRuntime, 'open', async (...args: Parameters<typeof ElectionRuntime.open>) => {
      entered.resolve();
      await resume.promise;
      return original(...args);
    });
    const opening = w.server.pool.get(w.electionId);
    // Attach the rejection handler before triggering shutdown.
    const rejected = assert.rejects(opening, /shutting down/);
    await entered.promise;
    let closed = false;
    const closing = w.server.pool.closeAll().then(() => { closed = true; });
    await tick();
    assert.equal(closed, false, 'opening runtime must drain before pool closes');
    await assert.rejects(w.server.pool.get(w.electionId), /shutting down/);
    resume.resolve();
    await Promise.all([closing, rejected]);
    assert.equal(w.server.pool.openCount(), 0);
    await w.server.pool.closeAll();
  } finally { resume.resolve(); await w.stop(); }
});

test('HTTP close drains accepted handlers after force-closing their sockets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-http-drain-'));
  const server = buildServer({ dataDir: dir, logSink: () => undefined });
  const entered = deferred();
  const resume = deferred();
  let completed = false;
  const http = createHttpApp(server.env, [{
    method: 'GET', path: '/slow', cls: 'R', auth: 'none',
    async handler() {
      entered.resolve();
      await resume.promise;
      server.env.control.audit('system', 'drain.test', null);
      completed = true;
      return { status: 204 };
    },
  }]);
  try {
    const address = await http.listen();
    const request = fetch(`http://${address.host}:${address.port}/slow`).catch(() => undefined);
    await entered.promise;
    let closed = false;
    const closing = http.close().then(() => { closed = true; });
    await tick();
    await tick();
    assert.equal(closed, false, 'socket closure is not handler completion');
    resume.resolve();
    await closing;
    await request;
    assert.equal(completed, true);
  } finally {
    resume.resolve();
    await http.close();
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shutdown holds ownership beyond the former non-import job timeout', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-job-drain-'));
  const server = buildServer({ dataDir: dir, logSink: () => undefined, retentionSweepMs: 0 });
  const resume = deferred();
  const entered = deferred();
  try {
    server.jobs.submit('backup', 1, { kind: 'backup', election_id: null, params: {}, created_by: 'system' }, async () => {
      entered.resolve();
      await resume.promise;
      server.env.control.audit('system', 'job.drain', null);
      return {};
    });
    await entered.promise;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let stopped = false;
    const stopping = server.stop().then(() => { stopped = true; });
    t.mock.timers.tick(5001);
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(stopped, false, 'a job timeout must never transfer data-directory ownership');
    assert.throws(() => buildServer({ dataDir: dir }), /data directory.*locked/i);
    resume.resolve();
    await stopping;
    const next = buildServer({ dataDir: dir });
    await next.stop();
  } finally {
    resume.resolve();
    t.mock.timers.reset();
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

const resolver = async () => [{ address: '93.184.216.34', family: 4 as const }];

test('server shutdown waits for in-flight webhook outcomes before closing storage', async () => {
  const entered = deferred();
  const resume = deferred();
  const w = new World({ seed: 'shutdown-webhook', n: 3, t: 2, voters: 1, server: {
    webhookResolver: resolver,
    webhookTransport: async () => { entered.resolve(); await resume.promise; return { status: 200, truncated: false }; },
  } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.server.webhooks.create(w.orgId, 'https://hooks.example.com/qv', ['entry'], undefined);
    w.server.webhooks.onEvent({ electionId: w.electionId, orgId: w.orgId }, { id: 1, ts: w.clock, type: 'entry', seq: 1, data: '{}' });
    await entered.promise;
    let stopped = false;
    const stopping = w.server.stop().then(() => { stopped = true; });
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(stopped, false, 'in-flight delivery can still persist its outcome');
    assert.throws(() => buildServer({ dataDir: w.dir }), /data directory.*locked/i);
    resume.resolve();
    await stopping;
    assert.equal(w.server.webhooks.stats.delivered, 1);
    const next = buildServer({ dataDir: w.dir });
    assert.equal(next.env.control.outboxCount(), 0, 'delivery outcome persisted before DB close');
    await next.stop();
  } finally { resume.resolve(); await w.stop(); }
});

test('server shutdown waits for the active gossip exchange before releasing storage', async () => {
  const entered = deferred();
  const resume = deferred();
  const w = new World({ seed: 'shutdown-gossip', n: 3, t: 2, voters: 1, server: {
    gossipPeers: ['https://gossip.example.com'], gossipResolver: resolver,
    gossipTransport: async () => { entered.resolve(); await resume.promise; return { status: 200, truncated: false, body: Buffer.from('{}') }; },
  } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.publishManifest();
    const run = w.server.gossip.runOnce();
    await entered.promise;
    let stopped = false;
    const stopping = w.server.stop().then(() => { stopped = true; });
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(stopped, false, 'gossip callback still owns an election runtime');
    assert.throws(() => buildServer({ dataDir: w.dir }), /data directory.*locked/i);
    resume.resolve();
    await Promise.all([run, stopping]);
    const next = buildServer({ dataDir: w.dir });
    await next.stop();
  } finally { resume.resolve(); await w.stop(); }
});
