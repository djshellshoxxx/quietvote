import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../src/api/client.ts';
import { SseParser, SseProtocolError, connectEvents, validateEvent, type ConnStatus, type LiveEvent } from '../src/net/sse.ts';
import { FakeSseServer, type Behavior, checkpointEvent, entryEvent, settle, until } from './helpers/fake-sse.ts';

const noSleep = async (): Promise<void> => undefined;

test('parser: chunk boundaries anywhere, CRLF / CR / LF, BOM, comments, multi-line data, retry', () => {
  const text = '﻿retry: 3000\n: connected\n\nid: 1\nevent: entry\ndata: {"a":\r\ndata: 1}\r\n\r\nid: 2\revent: phase\rdata: x\r\r';
  const whole = new SseParser().push(text);
  assert.equal(whole.length, 2);
  assert.deepEqual(whole[0], { id: '1', event: 'entry', data: '{"a":\n1}' });
  assert.equal(whole[1]!.id, '2');
  // byte-by-byte must give the same frames, including a CR at the end of a chunk followed by LF in the next
  const p = new SseParser();
  const bits: unknown[] = [];
  for (const ch of text) bits.push(...p.push(ch));
  assert.deepEqual(bits, whole);
  // the retry-only block dispatches nothing (no data), but the field is not lost on the next frame
  const q = new SseParser().push('retry: 4000\n\nid: 5\ndata: {}\n\n');
  assert.equal(q.length, 1);
});

test('parser: refuses oversized lines and events (memory is bounded per frame)', () => {
  assert.throws(() => new SseParser({ maxLineChars: 100 }).push(`data: ${'x'.repeat(200)}`), SseProtocolError);
  const p = new SseParser({ maxLineChars: 100, maxEventChars: 250 });
  assert.throws(() => {
    for (let i = 0; i < 10; i++) p.push(`data: ${'y'.repeat(90)}\n`);
  }, SseProtocolError);
});

test('validateEvent: server event shapes are accepted, unknown names ignored, malformed ones rejected', () => {
  assert.deepEqual(validateEvent('entry', 7, JSON.stringify(entryEvent(3))), { type: 'entry', id: 7, seq: 3, entryType: 'ballot', author: 'QUJD', leafHash: 'REVG' });
  assert.equal(validateEvent('checkpoint', 8, JSON.stringify(checkpointEvent(4)))?.type, 'checkpoint');
  assert.equal(validateEvent('phase', 9, '{"from":"OPEN","to":"CLOSED","seq":10}')?.type, 'phase');
  assert.equal(validateEvent('alert', 10, '{"kind":"quarantine","detail_code":"LOG_QUARANTINED"}')?.type, 'alert');
  assert.equal(validateEvent('witness', 11, '{"witness":"w1","lag_seconds":3,"quorum_met":true}')?.type, 'witness');
  assert.equal(validateEvent('future-thing', 12, 'not even json'), undefined);
  const bad: [string, string][] = [
    ['entry', '{"seq":-1,"type":"ballot","author":"QUJD","leaf_hash":"REVG"}'],
    ['entry', '{"seq":1.5,"type":"ballot","author":"QUJD","leaf_hash":"REVG"}'],
    ['entry', '{"seq":1,"type":"bal lot","author":"QUJD","leaf_hash":"REVG"}'],
    ['entry', '{"seq":1,"type":"ballot","author":"<script>","leaf_hash":"REVG"}'],
    ['entry', '[]'], ['entry', 'null'], ['entry', '{'],
    ['checkpoint', '{"tree_size":"4","root":"AAAA","witnessed":false,"issued_at":"2026-10-21T10:00:00Z"}'],
    ['checkpoint', '{"tree_size":4,"root":"AAAA","witnessed":"no","issued_at":"2026-10-21T10:00:00Z"}'],
    ['checkpoint', '{"tree_size":4,"root":"AAAA","witnessed":false,"issued_at":"yesterday"}'],
    ['phase', '{"from":"OPEN","to":"","seq":1}'],
    ['witness', '{"witness":"w","lag_seconds":-1,"quorum_met":true}'],
  ];
  for (const [n, d] of bad) assert.throws(() => validateEvent(n, 1, d), SseProtocolError, `${n} ${d}`);
});

test('ApiClient.events: only the election id is in the URL; cursor and read key travel in headers', async () => {
  const sse = new FakeSseServer();
  const api = new ApiClient({ fetch: sse.fetch, readKey: 'SECRET-READ-KEY' });
  const ac = new AbortController();
  const res = await api.events('aaaaaaaaaaaaaaaaaaaaaaaaaa', { lastEventId: 41, signal: ac.signal });
  assert.equal(res.status, 200);
  const c = sse.conns[0]!;
  assert.equal(c.url, '/api/v1/elections/aaaaaaaaaaaaaaaaaaaaaaaaaa/events');
  assert.ok(!c.url.includes('?') && !/SECRET|41/.test(c.url));
  assert.equal(c.headers['last-event-id'], '41');
  assert.equal(c.headers['qv-read-key'], 'SECRET-READ-KEY');
  assert.equal(c.headers.accept, 'text/event-stream');
  ac.abort();
  await settle();
  assert.equal(c.aborted, true, 'aborting the caller signal tears the stream down after headers');
});

function harness(over: Partial<Parameters<typeof connectEvents>[0]> = {}, script: Behavior[] = [], realSleep = false) {
  const sse = new FakeSseServer();
  sse.script = script; // set before connecting: the first attempt starts immediately
  const api = new ApiClient({ fetch: sse.fetch });
  const events: LiveEvent[] = [];
  const statuses: ConnStatus[] = [];
  const waits: number[] = [];
  let resyncs = 0;
  const invalid: string[] = [];
  const conn = connectEvents({
    open: (last, signal) => api.events('aaaaaaaaaaaaaaaaaaaaaaaaaa', { lastEventId: last, signal }),
    onEvent: (e) => events.push(e),
    onStatus: (s) => { statuses.push(s); if (s.waitMs !== undefined) waits.push(s.waitMs); },
    onResync: () => { resyncs++; },
    onInvalid: (r) => invalid.push(r),
    random: () => 1, // deterministic: the top of the jitter range
    ...(realSleep ? {} : { sleep: async () => undefined }),
    ...over,
  });
  return { sse, api, events, statuses, waits, conn, resyncs: () => resyncs, invalid };
}

test('connect: delivers validated events in order, drops duplicates, resumes with Last-Event-ID after the socket dies', async () => {
  const h = harness();
  const c1 = await h.sse.connection(1);
  assert.equal(c1.headers['last-event-id'], undefined, 'first connection has no cursor');
  c1.write('retry: 3000\n: connected\n\n');
  c1.frame(1, 'entry', entryEvent(5));
  c1.frame(2, 'checkpoint', checkpointEvent(6));
  c1.frame(2, 'checkpoint', checkpointEvent(6)); // at-least-once duplicate
  c1.frame(3, 'unknown-future', { x: 1 });
  c1.frame(4, 'phase', { from: 'OPEN', to: 'CLOSED', seq: 6 });
  await until(() => h.events.length === 3);
  assert.deepEqual(h.events.map((e) => e.type), ['entry', 'checkpoint', 'phase']);
  assert.equal(h.conn.lastEventId, 4);
  c1.fail();
  const c2 = await h.sse.connection(2);
  assert.equal(c2.headers['last-event-id'], '4', 'resume from the last delivered id, not from what was merely received');
  c2.frame(3, 'entry', entryEvent(9)); // replay of an old id after resume is ignored
  c2.frame(5, 'entry', entryEvent(7));
  await until(() => h.events.length === 4);
  assert.equal((h.events[3] as { seq: number }).seq, 7);
  h.conn.close();
  await h.conn.done;
  assert.equal(h.statuses.at(-1)!.state, 'closed');
});

test('connect: a malformed known event is skipped and reported; the cursor does not move for it', async () => {
  const h = harness();
  const c = await h.sse.connection(1);
  c.frame(1, 'entry', entryEvent(1));
  c.frame(2, 'entry', { seq: 'two' });
  c.write('data: {}\n\n'); // no id at all
  c.frame(3, 'entry', entryEvent(3));
  await until(() => h.events.length === 2);
  assert.equal(h.invalid.length, 2);
  assert.deepEqual(h.events.map((e) => e.id), [1, 3]);
  h.conn.close();
  await h.conn.done;
});

test('connect: exponential backoff with jitter, capped, honours retry: and resets after progress', async () => {
  const h = harness({ baseMs: 1000, maxMs: 8000, random: () => 1 }, ['network', 'network', 'network', 'network', 'network']);
  await until(() => h.waits.length >= 5);
  assert.deepEqual(h.waits.slice(0, 5), [1000, 2000, 4000, 8000, 8000]);
  // connection 6 is healthy and delivers an event: the next failure starts from the base again
  const c = await h.sse.connection(1);
  c.frame(1, 'entry', entryEvent(1));
  await until(() => h.events.length === 1);
  c.fail();
  await until(() => h.waits.length >= 6);
  assert.equal(h.waits[5], 1000);
  // equal jitter never goes below half the cap, never to zero (no tight loop)
  const lo = harness({ random: () => 0, baseMs: 1000 }, ['network']);
  await until(() => lo.waits.length >= 1);
  assert.equal(lo.waits[0], 500);
  for (const x of [h, lo]) {
    x.conn.close();
    await x.conn.done;
  }
});

test('connect: server retry: field becomes the base delay (clamped)', async () => {
  const h = harness({ random: () => 1 });
  const c = await h.sse.connection(1);
  c.write('retry: 5000\n\n');
  c.write(': hb\n\n');
  c.frame(1, 'entry', entryEvent(1));
  await until(() => h.events.length === 1);
  h.sse.script = ['network'];
  c.fail();
  await until(() => h.waits.length >= 1);
  // progress reset the attempt counter; the first wait uses the server's 5 s base
  assert.equal(h.waits[0], 5000);
  h.conn.close();
  await h.conn.done;
});

test('connect: 429/503 with Retry-After wait that long; 400/401/403/404 stop for good; 410 clears the cursor and asks for a resync', async () => {
  const h = harness({}, [{ status: 429, code: 'RATE_LIMITED', headers: { 'Retry-After': '7' } }]);
  await until(() => h.waits.length >= 1);
  assert.equal(h.waits[0], 7000);
  const c = await h.sse.connection(1);
  c.frame(1, 'entry', entryEvent(1));
  c.frame(2, 'entry', entryEvent(2));
  await until(() => h.events.length === 2);
  h.sse.script = [{ status: 410, code: 'EVENT_GONE' }];
  c.end();
  const c2 = await h.sse.connection(2); // the 410 attempt is not a connection; this is the reconnect after it
  assert.equal(c2.headers['last-event-id'], undefined, 'after 410 the cursor is dropped');
  await until(() => h.resyncs() === 1);
  h.conn.close();
  await h.conn.done;

  for (const status of [400, 401, 403, 404]) {
    const f = harness({}, [{ status, code: 'NOPE' }]);
    await f.conn.done;
    assert.equal(f.statuses.at(-1)!.state, 'failed', String(status));
    assert.equal(f.sse.conns.length, 0, 'no retry storm on a permanent error');
  }
});

test('connect: a non-event-stream answer is a permanent failure, not a parse attempt', async () => {
  const h = harness({}, [{ contentType: 'text/html' }]);
  await h.conn.done;
  assert.equal(h.statuses.at(-1)!.state, 'failed');
});

test('connect: an idle stream (no heartbeat) is dropped and reconnected', async () => {
  const h = harness({ idleMs: 30 });
  const c1 = await h.sse.connection(1);
  c1.write(': connected\n\n');
  const c2 = await h.sse.connection(2);
  assert.ok(c2);
  assert.ok(h.statuses.some((s) => s.state === 'reconnecting' && s.reason === 'idle'));
  h.conn.close();
  await h.conn.done;
});

test('connect: close() aborts the request, stops reconnecting and never calls the handler again', async () => {
  const h = harness({}, [], true);
  const c = await h.sse.connection(1);
  c.frame(1, 'entry', entryEvent(1));
  await until(() => h.events.length === 1);
  h.conn.close();
  await h.conn.done;
  assert.equal(c.aborted, true);
  c.write('id: 2\nevent: entry\ndata: {}\n\n'); // late bytes are ignored (stream already torn down)
  await settle();
  assert.equal(h.events.length, 1);
  assert.equal(h.sse.conns.length, 1, 'no reconnect after close');
  // closing while waiting out a backoff also ends promptly
  const w = harness({ baseMs: 60_000, maxMs: 60_000 }, ['network'], true);
  await until(() => w.waits.length === 1);
  w.conn.close();
  await w.conn.done;
});

test('connect: maxAttempts gives up with a failed status', async () => {
  const h = harness({ maxAttempts: 2 }, ['network', 'network', 'network', 'network']);
  await h.conn.done;
  assert.equal(h.statuses.at(-1)!.state, 'failed');
  void noSleep;
});
