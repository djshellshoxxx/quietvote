// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-09-REQ-010 QV-09-REQ-020
// Actual ApiClient/LiveElection, HTTP streaming, durable outbox and signed records. Only reconnect timing is gated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World } from '../../server/test/helpers/world.ts';
import { ApiClient } from '../src/api/client.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { LiveElection, type LiveChange, type LiveTarget } from '../src/flow/live.ts';
import { connectEvents, type ConnStatus, type EventConnection, type LiveEvent } from '../src/net/sse.ts';

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition() && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), label);
}

// Pause between real HTTP connections so appends/pruning happen deterministically while the client is disconnected.
class ReconnectGate {
  readonly waits: { release(): void }[] = [];
  readonly sleep = (_ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve) => {
    const release = (): void => { signal.removeEventListener('abort', release); resolve(); };
    this.waits.push({ release });
    if (signal.aborted) release();
    else signal.addEventListener('abort', release, { once: true });
  });
  async release(index: number): Promise<void> {
    await until(() => this.waits.length > index, `reconnect wait ${index + 1}`);
    this.waits[index]!.release();
  }
}

test('real server: web live updates close the connection gap, replay and resynchronise', { timeout: 120_000 }, async (t) => {
  const world = new World({ seed: 'web-live-real-server', n: 3, t: 2, voters: 4, server: { sseHeartbeatMs: 100 } });
  const gate = new ReconnectGate(), events: LiveEvent[] = [], statuses: ConnStatus[] = [], changes: LiveChange[] = [], errors: unknown[] = [];
  const requests: { path: string; method: string; last: string | null; from: string | null; status: number | undefined }[] = [];
  let live: LiveElection | undefined, connection: EventConnection | undefined;
  await world.start();
  try {
    await world.setupOrgAndElection(); await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201); await world.ceremony();
    assert.equal((await world.open()).status, 201);
    const runtime = (await world.server.pool.get(world.electionId))!;
    const api = new ApiClient({ baseUrl: world.base, fetch: async (input, init) => {
      const url = new URL(input), headers = new Headers(init?.headers);
      assert.equal(url.searchParams.has('last_event_id'), false, 'cursor is never placed in a URL');
      assert.equal(headers.get('Authorization'), null, 'public stream/records need no signing credential');
      const request = { path: url.pathname, method: init?.method ?? 'GET', last: headers.get('Last-Event-ID'), from: url.searchParams.get('from'), status: undefined as number | undefined };
      requests.push(request);
      const response = await fetch(input, init); request.status = response.status; return response;
    } });
    const records = (await api.allEntries(world.electionId)).entries.map((entry) => ({ seq: entry.seq, record: entryRecord(entry) }));
    const derived = await deriveElectionContext(records); assert.ok(derived.ok, derived.ok ? '' : derived.detail);
    const target: LiveTarget = { apiId: world.electionId, api, records, ctx: derived.value };
    const streams = () => requests.filter((request) => request.path.endsWith('/events'));
    const reads = () => requests.filter((request) => request.path.endsWith('/log/entries'));
    const signedRecords = async () => (await api.allEntries(world.electionId)).entries.map((entry) => ({ seq: entry.seq, record: entryRecord(entry) }));
    live = new LiveElection(target, {
      debounceMs: 1, sleep: gate.sleep,
      onChange: (change) => changes.push(change), onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error),
      connect: (options) => {
        connection = connectEvents({ ...options, onEvent: (event) => { events.push(event); options.onEvent(event); } });
        return connection;
      },
    });

    await t.test('an append between initial load and first stream is reread after connection', async () => {
      const before = target.records.length;
      assert.equal((await world.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 201);
      live!.start();
      await until(() => statuses.some((status) => status.state === 'live'), 'initial stream is live');
      assert.equal(connection!.lastEventId, undefined, 'connection preamble contains no event ID');
      await until(() => target.records.length === before + 1, 'signed append in load/stream gap is reread without another event');
      assert.equal(streams()[0]!.last, null); assert.equal(events.length, 0, 'server does not replay history without a cursor');
      assert.deepEqual(target.records, await signedRecords());
    });

    await t.test('disconnect before the first event ID still catches up from the signed log', async () => {
      const before = target.records.length, readCount = reads().length;
      assert.equal(connection!.lastEventId, undefined);
      world.server.sse.closeAll();
      await until(() => gate.waits.length === 1, 'cursorless stream disconnected');
      assert.equal((await world.cast(1, { budget: ['no'], chair: ['bob'] })).status, 201);
      await gate.release(0);
      await until(() => streams().length === 2 && streams()[1]!.status === 200, 'cursorless reconnect accepted');
      await until(() => target.records.length === before + 1, 'append during cursorless disconnect is reread');
      assert.equal(streams()[1]!.last, null); assert.equal(events.length, 0);
      assert.equal(reads()[readCount]!.from, String(before), 'incremental read starts at the first missing signed entry');
      assert.deepEqual(target.records, await signedRecords());
    });

    await t.test('live events refresh signed records, then a real cursor replays only missed events', async () => {
      const before = target.records.length;
      assert.equal((await world.cast(2, { budget: ['yes'], chair: ['cy'] })).status, 201);
      await until(() => target.records.length === before + 1 && connection!.lastEventId === runtime.edb.lastEventId(), 'live ballot and checkpoint consumed');
      const cursor = connection!.lastEventId!, priorEvents = events.length;
      world.server.sse.closeAll(); await until(() => gate.waits.length === 2, 'cursor stream disconnected');
      assert.equal((await world.cast(3, { budget: ['no'], chair: ['ann'] })).status, 201);
      const missed = runtime.edb.eventsAfter(cursor, 100).map((row) => row.id);
      assert.ok(missed.length > 0);
      await gate.release(1);
      await until(() => events.length === priorEvents + missed.length && target.records.length === before + 2, 'retained events replayed and records caught up');
      assert.equal(streams()[2]!.last, String(cursor)); assert.equal(streams()[2]!.status, 200);
      assert.deepEqual(events.slice(priorEvents).map((event) => event.id), missed);
      assert.equal(new Set(events.map((event) => event.id)).size, events.length, 'replayed IDs are delivered once');
      assert.deepEqual(target.records, await signedRecords());
    });

    await t.test('actual outbox pruning returns 410, drops the cursor and rereads the signed close', async () => {
      const cursor = connection!.lastEventId!;
      world.server.sse.closeAll(); await until(() => gate.waits.length === 3, 'stream disconnected before retention');
      assert.equal((await world.close()).status, 201);
      runtime.edb.pruneEvents(); // Real retention operation; signed board records remain available.
      assert.equal(runtime.edb.eventBounds(), undefined); assert.ok(runtime.edb.lastEventId() > cursor);
      await gate.release(2);
      await until(() => streams().length === 4 && streams()[3]!.status === 410, 'actual EVENT_GONE response');
      assert.equal(streams()[3]!.last, String(cursor));
      await gate.release(3);
      await until(() => streams().length === 5 && streams()[4]!.status === 200 && target.ctx?.phase === 'closed', 'cursor reset and signed phase caught up');
      assert.equal(streams()[4]!.last, null);
      assert.ok(statuses.some((status) => status.state === 'reconnecting' && status.reason === 'resync'));
      assert.ok(changes.some((change) => change.phaseChanged));
      assert.deepEqual(target.records, await signedRecords()); assert.ok(target.ctx!.closeSeq !== undefined);
    });

    await t.test('closing the web controller releases the real stream/runtime and stops reconnects', async () => {
      const opened = streams().length;
      live!.close(); live!.close(); await connection!.done;
      await until(() => world.server.sse.stats.active === 0, 'server releases aborted stream');
      assert.equal(runtime.inUse, 0); assert.equal(statuses.at(-1)!.state, 'closed');
      assert.equal(streams().length, opened); assert.ok(requests.every((request) => request.method === 'GET'));
      assert.deepEqual(errors, []);
    });
  } finally {
    live?.close(); await connection?.done; await world.stop();
  }
});
