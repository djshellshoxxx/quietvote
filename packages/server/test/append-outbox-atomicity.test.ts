// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-005
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { bytesToHex, pointToBytes } from '@quietvote/crypto';
import type { EventRow } from '../src/electiondb.ts';
import { World } from './helpers/world.ts';

test('a phase outbox commit failure rolls back its entry, checkpoint, projection and every event', async (t) => {
  const w = new World({ seed: 'append-phase-atomicity', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!, live: EventRow[] = [], webhook: EventRow[] = [];
    rt.subscribe({ event: (row) => live.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { webhook.push(row); };
    const transaction = rt.edb.tx.bind(rt.edb);
    let reached = false;
    rt.edb.tx = <T>(fn: () => T): T => transaction(() => {
      const value = fn();
      if (rt.edb.eventsAfter(0, 100).some((row) => row.type === 'phase')) {
        reached = true;
        throw new Error('injected phase outbox commit failure');
      }
      return value;
    });
    const response = await w.publishManifest();
    rt.edb.tx = transaction;
    assert.equal(reached, true, 'the fault must run after phase insertion, before commit');
    const count = (table: 'log_entry' | 'checkpoint' | 'append_completion'): number =>
      Number(rt.edb.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!['n']);
    const projection = rt.edb.db.prepare('SELECT state,tree_size FROM election').get()!;
    const observed = { status: response.status, entries: count('log_entry'), checkpoints: count('checkpoint'),
      intents: count('append_completion'), state: projection['state'], tree_size: projection['tree_size'],
      event_types: rt.edb.eventsAfter(0, 100).map((row) => row.type), live_types: live.map((row) => row.type),
      webhook_types: webhook.map((row) => row.type), anchor_size: w.server.env.control.runtimeAnchor(w.electionId)?.tree_size ?? 0 };
    t.diagnostic(JSON.stringify(observed));
    assert.deepEqual(observed, { status: 500, entries: 0, checkpoints: 0, intents: 0, state: 'DRAFT', tree_size: 0,
      event_types: [], live_types: [], webhook_types: [], anchor_size: 0 });
  } finally { await w.stop(); }
});

test('an append-generated alert insertion failure rolls back every append row and publishes nothing', async () => {
  const w = new World({ seed: 'append-alert-atomicity', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!, delivered: EventRow[] = [];
    rt.subscribe({ event: (row) => delivered.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { delivered.push(row); };
    const insert = rt.edb.insertEvent.bind(rt.edb), reason = rt.quarantineReason.bind(rt);
    let checkpointRecorded = false, reached = false;
    rt.quarantineReason = () => checkpointRecorded ? 'synthetic pending integrity alert' : reason();
    rt.edb.insertEvent = (...args) => {
      const row = insert(...args);
      if (args[1] === 'checkpoint') checkpointRecorded = true;
      if (args[1] === 'alert') { reached = true; throw new Error('injected alert insertion failure'); }
      return row;
    };
    const response = await w.publishManifest();
    rt.quarantineReason = reason; rt.edb.insertEvent = insert;
    assert.equal(reached, true); assert.equal(response.status, 500);
    assert.equal(rt.edb.store.size(), 0); assert.equal(rt.edb.store.latestCheckpoint(), undefined);
    assert.equal(rt.edb.row().state, 'DRAFT'); assert.equal(rt.edb.hasAppendCompletions(), false);
    assert.deepEqual(rt.edb.eventsAfter(0, 100), []); assert.deepEqual(delivered, []);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)?.tree_size ?? 0, 0);
  } finally { await w.stop(); }
});

test('DKG adjudication still awaits outside the append transaction and restart reproduces its state and event IDs', async () => {
  const w = new World({ seed: 'append-atomic-async-dkg', n: 3, t: 2, voters: 3 });
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters(); assert.equal((await w.publishManifest()).status, 201);
    const rt = (await w.server.pool.get(w.electionId))!;
    const transaction = rt.edb.tx.bind(rt.edb);
    let depth = 0;
    const observed: { depth: number; visible: number; expected: number; flag: number; types: unknown[] }[] = [];
    rt.edb.tx = <T>(fn: () => T): T => {
      depth++;
      try { return transaction(fn); } finally { depth--; }
    };
    const internal = rt as unknown as { computeDkgPre(): Promise<void> };
    const compute = internal.computeDkgPre.bind(rt);
    internal.computeDkgPre = async () => {
      const snapshot = new DatabaseSync(rt.edb.path, { readOnly: true });
      try {
        const seq = rt.log.size - 1;
        observed.push({ depth, visible: Number(snapshot.prepare('SELECT COUNT(*) AS n FROM log_entry').get()!['n']), expected: rt.log.size,
          flag: Number(snapshot.prepare('SELECT events_committed FROM append_completion WHERE seq=?').get(seq)?.['events_committed'] ?? -1),
          types: snapshot.prepare('SELECT type FROM event WHERE seq=? ORDER BY event_id').all(seq).map((row) => row['type']) });
      } finally { snapshot.close(); }
      await Promise.resolve();
      return compute(); // Run the real cryptographic adjudication after observing its committed boundary.
    };
    await w.ceremony();
    assert.equal(observed.length, 1); assert.equal(rt.logState, 'READY');
    assert.equal(observed[0]!.depth, 0, 'no SQLite transaction may span asynchronous adjudication');
    assert.equal(observed[0]!.visible, observed[0]!.expected); assert.equal(observed[0]!.flag, 1);
    assert.deepEqual(observed[0]!.types, ['entry', 'checkpoint']);
    const key = bytesToHex(pointToBytes(rt.st.params!.K)), context = bytesToHex(rt.st.params!.ctx), events = rt.edb.eventsAfter(0, 1000);
    await w.server.stop(); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.logState, 'READY'); assert.equal(bytesToHex(pointToBytes(reopened.st.params!.K)), key);
    assert.equal(bytesToHex(reopened.st.params!.ctx), context); assert.deepEqual(reopened.edb.eventsAfter(0, 1000), events);
    assert.equal(reopened.edb.hasAppendCompletions(), false);
  } finally { await w.stop(); }
});

test('a transaction wrapper failure after commit retires the handle before any unanchored outcome escapes', async () => {
  const w = new World({ seed: 'append-atomic-lost-commit-return', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!, delivered: EventRow[] = [];
    rt.subscribe({ event: (row) => delivered.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { delivered.push(row); };
    const transaction = rt.edb.tx.bind(rt.edb);
    rt.edb.tx = <T>(fn: () => T): T => {
      const result = transaction(fn);
      if (rt.edb.hasAppendCompletions()) throw new Error('injected lost return after append commit');
      return result;
    };
    const response = await w.publishManifest(); rt.edb.tx = transaction;
    assert.equal(response.status, 500); assert.equal(rt.edb.store.size(), 1);
    assert.equal(rt.edb.appendEventsCommitted(0), true);
    const rows = rt.edb.eventsAfter(0, 20); assert.deepEqual(rows.map((row) => row.type), ['entry', 'checkpoint', 'phase']);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)?.tree_size ?? 0, 0); assert.deepEqual(delivered, []);
    assert.equal(rt.poisoned, true, 'an uncertain append completion must force durable recovery even when tree sizes agree');
    assert.throws(() => rt.outcomeFor(0, true), /recovery is required/);
    const first = rt.edb.store.getEntry(0)!;
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.notEqual(reopened, rt); assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 1);
    assert.equal(reopened.edb.hasAppendCompletions(), false); assert.deepEqual(reopened.edb.eventsAfter(0, 20), rows);
    assert.equal((await w.submit(first.headerBytes, first.body!)).status, 200);
  } finally { await w.stop(); }
});
