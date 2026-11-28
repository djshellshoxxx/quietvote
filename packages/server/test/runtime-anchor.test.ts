// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-18-REQ-053, QV-28-REQ-011
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { signCheckpoint } from '@quietvote/board';
import { ed25519Keypair } from '@quietvote/crypto';
import { ApiError } from '../src/problem.ts';
import { ControlDb } from '../src/controldb.ts';
import { SERVER_VERSION } from '../src/election.ts';
import type { EventRow } from '../src/electiondb.ts';
import type { WebhookResponse } from '../src/ssrf.ts';
import { World } from './helpers/world.ts';

async function world(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 2, witnessQuorum: 0 });
  await w.start(); await w.setupOrgAndElection();
  return w;
}
const denied = (code: string) => (error: unknown): boolean => error instanceof ApiError && error.status === 503 && error.code === code;

test('control schema 7 upgrades additively and anchors are monotonic, identity-bound and durable', async () => {
  const w = await world('runtime-anchor-upgrade');
  try {
    const id = w.electionId;
    const oldHashes = w.server.env.control.db.prepare('SELECT version,sha256 FROM schema_migration WHERE version<=7 ORDER BY version').all();
    await w.server.stop();
    const legacy = new DatabaseSync(join(w.dir, 'control.sqlite'));
    legacy.exec('DROP TABLE runtime_anchor; DELETE FROM schema_migration WHERE version=8; PRAGMA user_version=7'); legacy.close();
    const ctl = new ControlDb(w.dir, () => w.clock, SERVER_VERSION);
    try {
      assert.equal(ctl.migrationVersion(), 8);
      assert.deepEqual(ctl.db.prepare('SELECT version,sha256 FROM schema_migration WHERE version<=7 ORDER BY version').all(), oldHashes);
      assert.equal(ctl.db.prepare('PRAGMA synchronous').get()!['synchronous'], 2);
      const pk = new Uint8Array(32).fill(1), root = new Uint8Array(32).fill(2);
      assert.equal(ctl.raiseRuntimeAnchor(id, w.origin, pk, 2, root), 'advanced');
      assert.equal(ctl.raiseRuntimeAnchor(id, w.origin, pk, 1, new Uint8Array(32)), 'older');
      assert.equal(ctl.raiseRuntimeAnchor(id, w.origin, pk, 2, root), 'unchanged');
      assert.equal(ctl.raiseRuntimeAnchor(id, w.origin, pk, 2, new Uint8Array(32).fill(3)), 'conflict');
      assert.equal(ctl.runtimeAnchor(id)!.tree_size, 2);
      assert.deepEqual(ctl.runtimeAnchor(id)!.root, root);
      assert.equal(ctl.runtimeAnchor(id)!.conflicted, 1);
      assert.equal(ctl.raiseRuntimeAnchor(id, w.origin, pk, 3, root), 'conflict');
    } finally { ctl.close(); }
  } finally { await w.stop(); }
});

test('election-only rollback blocks duplicate receipts and new signatures while reads remain available', async () => {
  const w = await world('runtime-anchor-election-rollback');
  try {
    assert.equal((await w.publishManifest()).status, 201);
    const rt = (await w.server.pool.get(w.electionId))!;
    const first = rt.edb.store.getEntry(0)!;
    const old = join(w.dir, 'old-election.sqlite');
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    rt.edb.db.prepare('VACUUM INTO ?').run(old);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 2);
    await w.server.stop(); copyFileSync(old, path); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.log.size, 1);
    assert.ok(reopened.quarantineReason());
    assert.throws(() => reopened.assertHealthy(), denied('QUARANTINED'));
    assert.equal((await w.submit(first.headerBytes, first.body!)).status, 503);
    assert.throws(() => reopened.outcomeFor(0, true), denied('QUARANTINED'));
    assert.equal(reopened.log.getReceipt(0).ok, false);
    assert.equal(reopened.log.checkpoint().ok, false);
    assert.throws(() => reopened.clearForcedQuarantine(), /independent runtime anchor/);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/log/entries?from=0&limit=10`)).status, 200);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 2);
    await w.server.stop(); await w.start();
    assert.equal((await w.server.pool.get(w.electionId))!.log.getReceipt(0).ok, false);
  } finally { await w.stop(); }
});

test('same-size independent root conflict cannot be cleared by a reload', async () => {
  const w = await world('runtime-anchor-same-size');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const ctl = w.server.env.control;
    assert.equal(ctl.raiseRuntimeAnchor(w.electionId, w.origin, rt.logPk, rt.log.size, new Uint8Array(32).fill(7)), 'conflict');
    assert.equal(rt.log.getReceipt(0).ok, false);
    await w.server.pool.evict(w.electionId);
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.ok(reopened.quarantineReason());
    assert.throws(() => reopened.clearForcedQuarantine(), /independent runtime anchor/);
    assert.equal(ctl.runtimeAnchor(w.electionId)!.conflicted, 1);
  } finally { await w.stop(); }
});

test('an election-file log-key substitution cannot replace the independent signing identity', async () => {
  const w = await world('runtime-anchor-key-substitution');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const original = w.server.env.control.runtimeAnchor(w.electionId)!;
    rt.edb.db.prepare('UPDATE election SET log_pk=?').run(ed25519Keypair().publicKey);
    await w.server.pool.evict(w.electionId);
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.ok(reopened.quarantineReason());
    assert.equal(reopened.log.getReceipt(0).ok, false);
    assert.deepEqual(w.server.env.control.runtimeAnchor(w.electionId)!.log_pk, original.log_pk);
  } finally { await w.stop(); }
});

for (const afterCommit of [false, true]) test(`anchor failure ${afterCommit ? 'after' : 'before'} control commit exposes nothing and recovers once`, async () => {
  const w = await world(`runtime-anchor-failure-${afterCommit}`);
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const live: EventRow[] = [];
    const webhook: EventRow[] = [];
    rt.subscribe({ event: (row) => live.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { webhook.push(row); };
    const ctl = w.server.env.control, raise = ctl.raiseRuntimeAnchor.bind(ctl);
    ctl.raiseRuntimeAnchor = (...args) => {
      if (args[3] === 1) { if (afterCommit) raise(...args); throw new Error('injected runtime anchor failure'); }
      return raise(...args);
    };
    const response = await w.publishManifest();
    assert.equal(response.status, 503, response.text);
    assert.equal(response.json.code, 'LOG_UNAVAILABLE');
    assert.equal(rt.edb.store.size(), 1);
    assert.equal(rt.edb.hasAppendCompletions(), true);
    assert.equal(rt.edb.appendEventsCommitted(0), true);
    const committed = rt.edb.eventsAfter(0, 10);
    assert.deepEqual(committed.map((row) => row.type), ['entry', 'checkpoint', 'phase']);
    assert.equal(rt.poisoned, true);
    assert.throws(() => rt.assertHealthy(), denied('LOG_UNAVAILABLE'));
    assert.equal(live.length, 0);
    assert.equal(webhook.length, 0, 'no callback may escape before independent anchor persistence');
    assert.throws(() => rt.outcomeFor(0, true), denied('LOG_UNAVAILABLE'));
    assert.equal(rt.log.getReceipt(0).ok, false);
    const first = rt.edb.store.getEntry(0)!;
    ctl.raiseRuntimeAnchor = raise;
    await w.server.pool.evict(w.electionId);
    const recovered = (await w.server.pool.get(w.electionId))!;
    assert.equal(ctl.runtimeAnchor(w.electionId)!.tree_size, 1);
    assert.equal(recovered.edb.hasAppendCompletions(), false);
    assert.deepEqual(recovered.edb.eventsAfter(0, 10).map((row) => row.type), ['entry', 'checkpoint', 'phase']);
    assert.deepEqual(recovered.edb.eventsAfter(0, 10), committed);
    assert.equal((await w.submit(first.headerBytes, first.body!)).status, 200);
    assert.equal(recovered.log.size, 1);
    await w.server.stop(); await w.start();
    assert.deepEqual((await w.server.pool.get(w.electionId))!.edb.eventsAfter(0, 10).map((row) => row.type), ['entry', 'checkpoint', 'phase']);
  } finally { await w.stop(); }
});

test('whole-disk rollback is caught by a newer authenticated public peer before duplicate signing', async () => {
  const w = await world('runtime-anchor-peer-rollback');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const first = rt.edb.store.getEntry(0)!;
    const oldElection = join(w.dir, 'old-election.sqlite'), oldControl = join(w.dir, 'old-control.sqlite');
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    rt.edb.db.prepare('VACUUM INTO ?').run(oldElection);
    w.server.env.control.db.prepare('VACUUM INTO ?').run(oldControl);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const newer = rt.edb.store.latestCheckpoint()!.note;
    await w.server.stop(); copyFileSync(oldElection, path); copyFileSync(oldControl, join(w.dir, 'control.sqlite'));
    let calls = 0;
    w.o.server = { gossipPeers: ['https://peer.example'], gossipResolver: async () => [{ address: '93.184.216.34', family: 4 }],
      gossipTransport: async () => { calls++; return { status: 200, truncated: false, body: Buffer.from(JSON.stringify({ latest_note: newer })) }; } };
    await w.start();
    assert.equal((await w.submit(first.headerBytes, first.body!)).status, 503);
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(calls, 1);
    assert.equal(reopened.log.size, 1);
    assert.equal(reopened.log.getReceipt(0).ok, false);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 2);
  } finally { await w.stop(); }
});

test('unavailable or invalid startup peers block signing with bounded retry while reads work', async () => {
  const w = await world('runtime-anchor-unavailable');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const first = rt.edb.store.getEntry(0)!, latest = rt.edb.store.latestCheckpoint()!.note;
    await w.server.stop();
    let mode: 'hang' | 'bad' | 'good' = 'hang';
    const unrelated = ed25519Keypair();
    const invalid = signCheckpoint(w.origin, 100, new Uint8Array(32), unrelated.secretKey, unrelated.publicKey);
    w.o.server = { gossipPeers: ['https://peer.example'], gossipTimeoutMs: 25,
      gossipResolver: async () => [{ address: '93.184.216.34', family: 4 }],
      gossipTransport: async (): Promise<WebhookResponse> => mode === 'hang' ? new Promise(() => {}) :
        { status: 200, truncated: false, body: Buffer.from(JSON.stringify({ latest_note: mode === 'bad' ? invalid : latest })) } };
    await w.start();
    const before = Date.now();
    assert.equal((await w.submit(first.headerBytes, first.body!)).status, 503);
    assert.ok(Date.now() - before < 5000);
    assert.equal((await w.server.pool.get(w.electionId))!.quarantineReason(), undefined);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).status, 200);
    mode = 'bad'; assert.equal((await w.submit(first.headerBytes, first.body!)).status, 503);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 1);
    mode = 'good'; assert.equal((await w.submit(first.headerBytes, first.body!)).status, 200);
  } finally { await w.stop(); }
});

test('link elections retain their local anchor without exposing their identity to public peers', async () => {
  const w = await world('runtime-anchor-link');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    rt.edb.db.prepare("UPDATE election SET access='link'").run();
    w.server.env.control.db.prepare("UPDATE election_registry SET access='link' WHERE election_id=?").run(w.electionId);
    const first = rt.edb.store.getEntry(0)!;
    await w.server.stop();
    let calls = 0;
    w.o.server = { gossipPeers: ['https://peer.example'], gossipResolver: async () => { calls++; return [{ address: '93.184.216.34', family: 4 }]; },
      gossipTransport: async () => { calls++; throw new Error('link election must not reach a public peer'); } };
    await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal((await reopened.append(first.headerBytes, first.body!)).duplicate, true);
    assert.equal(calls, 0);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 1);
  } finally { await w.stop(); }
});

test('a new election may start, but reopening a pre-manifest snapshot cannot bypass configured peer acquisition', async () => {
  let calls = 0;
  const w = new World({ seed: 'runtime-anchor-empty-restore', n: 3, t: 2, voters: 2, witnessQuorum: 0, server: {
    gossipPeers: ['https://peer.example'], gossipResolver: async () => [{ address: '93.184.216.34', family: 4 }],
    gossipTransport: async () => { calls++; throw new Error('unavailable'); },
  } });
  await w.start(); await w.setupOrgAndElection();
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const oldElection = join(w.dir, 'pre-manifest.sqlite'), oldControl = join(w.dir, 'pre-manifest-control.sqlite');
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    rt.edb.db.prepare('VACUUM INTO ?').run(oldElection);
    w.server.env.control.db.prepare('VACUUM INTO ?').run(oldControl);
    assert.equal((await w.publishManifest()).status, 201, 'genuinely new in-process election has no prior signing history');
    assert.equal(calls, 0);
    await w.server.stop(); copyFileSync(oldElection, path); copyFileSync(oldControl, join(w.dir, 'control.sqlite')); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.log.size, 0);
    assert.equal(reopened.log.checkpoint().ok, false, 'cannot sign an empty checkpoint merely to query peers');
    assert.equal((await w.publishManifest()).status, 503);
    assert.equal(reopened.log.size, 0);
  } finally { await w.stop(); }
});

test('imported keyless mirrors never claim ownership of an independent runtime anchor', async () => {
  const w = await world('runtime-anchor-imported');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    rt.edb.db.exec("UPDATE election SET imported=1,state='IMPORTED',log_sk_enc=NULL,srv_sk_enc=NULL");
    const ctl = w.server.env.control;
    ctl.db.prepare('DELETE FROM runtime_anchor WHERE election_id=?').run(w.electionId);
    ctl.db.prepare("UPDATE election_registry SET imported=1,state='IMPORTED',dek_wrapped=NULL WHERE election_id=?").run(w.electionId);
    await w.server.pool.evict(w.electionId);
    const mirror = (await w.server.pool.get(w.electionId))!;
    assert.equal(mirror.imported, true);
    assert.equal(ctl.runtimeAnchor(w.electionId), undefined);
    assert.equal(mirror.log.getReceipt(0).ok, false);
    assert.equal(mirror.log.checkpoint().ok, false);
    assert.throws(() => ctl.raiseRuntimeAnchor(w.electionId, w.origin, mirror.logPk, 1, mirror.log.root()), /owned election/);
  } finally { await w.stop(); }
});
