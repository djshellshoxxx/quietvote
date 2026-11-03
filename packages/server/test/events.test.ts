// SSE (QV-09 §9, REQ-010/014) and webhooks (QV-09 §6.3, REQ-014) over a real HTTP server.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { join } from 'node:path';
import { b64u, cosignLine } from '@quietvote/board';
import { signDelivery } from '../src/webhooks.ts';
import type { WebhookRequest } from '../src/ssrf.ts';
import { SseClient } from './helpers/sse.ts';
import { World } from './helpers/world.ts';

const sel = { budget: ['yes'], chair: ['ann'] };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- programmable webhook environment
const dns = new Map<string, string[]>();
const calls: (WebhookRequest & { n: number })[] = [];
let script: (c: WebhookRequest, n: number) => number | Error = () => 200;
const transport = async (r: WebhookRequest): Promise<{ status: number; truncated: boolean }> => {
  calls.push({ ...r, n: calls.length + 1 });
  const out = script(r, calls.length);
  if (out instanceof Error) throw out;
  return { status: out, truncated: false };
};
const resolver = async (host: string): Promise<{ address: string; family: 4 | 6 }[]> => {
  const a = dns.get(host);
  if (!a) throw new Error('ENOTFOUND');
  return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

let w: World;
let nVoter = 0;
const vote = async (): Promise<void> => {
  const r = await w.cast(nVoter++ % 4, sel);
  assert.equal(r.status, 201, r.text);
};
const EV = (): string => `/api/v1/elections/${w.electionId}/events`;
const hooksPath = (): string => `/api/v1/orgs/${w.orgId}/webhooks`;
const mkHook = (url: string, events: string[], extra: Record<string, unknown> = {}) =>
  w.signed('POST', hooksPath(), { url, events, ...extra }, w.owner, w.idemKey());

before(async () => {
  dns.set('hooks.example.com', ['93.184.216.34']);
  w = new World({
    seed: 'events', n: 3, t: 2, voters: 4,
    server: {
      sseHeartbeatMs: 100, maxSseStreams: 3, webhookResolver: resolver, webhookTransport: transport, webhookBackoffBaseMs: 5, webhookMaxBackoffMs: 20,
      webhookMaxAttempts: 4, webhookDisableAfter: 2, maxWebhooksPerOrg: 6, minBallotIntervalSec: 2,
    },
  });
  await w.start();
  await w.setupOrgAndElection();
  await w.registerVoters();
  await w.publishManifest();
  await w.ceremony();
  await w.open();
}, { timeout: 120_000 });
after(async () => {
  await w.stop();
});

// =============================================================================================== SSE

test('SSE: headers, comment preamble, heartbeat comments, public CORS, HEAD does not stream', async () => {
  const s = await SseClient.open(w.base, EV());
  try {
    assert.equal(s.status, 200);
    assert.match(String(s.headers['content-type']), /^text\/event-stream/);
    assert.equal(s.headers['cache-control'], 'no-store');
    assert.equal(s.headers['access-control-allow-origin'], '*');
    assert.equal(s.headers['x-content-type-options'], 'nosniff');
    assert.ok(s.headers['x-request-id']);
    await s.until((c) => c.comments.filter((x) => x === 'heartbeat').length >= 2, 3000);
    assert.equal(s.events.length, 0); // nothing historical without Last-Event-ID
  } finally {
    s.close();
  }
  const h = await fetch(w.base + EV(), { method: 'HEAD' });
  assert.equal(h.status, 200);
  assert.match(h.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(await h.text(), '');
  assert.equal(w.server.sse.stats.active, 0);
});

test('SSE: live entry/checkpoint/phase events, ordered ids, bodies and secrets never included', async () => {
  const s = await SseClient.open(w.base, EV());
  try {
    await vote();
    await s.until((c) => c.events.some((e) => e.event === 'entry') && c.events.some((e) => e.event === 'checkpoint'));
    const ent = s.events.find((e) => e.event === 'entry')!;
    assert.deepEqual(Object.keys(ent.json).sort(), ['author', 'leaf_hash', 'seq', 'type']);
    assert.equal(ent.json.type, 'ballot');
    const cp = s.events.find((e) => e.event === 'checkpoint')!;
    assert.deepEqual(Object.keys(cp.json).sort(), ['cosigners', 'issued_at', 'root', 'tree_size', 'witnessed']);
    assert.equal(cp.json.tree_size, ent.json.seq + 1);
    // ids strictly increasing
    for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i]!.id! > s.events[i - 1]!.id!);
    // payload audit: no bodies, no ballot ciphertext, no keys other than author id
    const raw = s.raw;
    assert.ok(!/body|ciphertext|secret|invite|contact|email|ip_/i.test(raw), raw);
    await w.close();
    await s.until((c) => c.events.some((e) => e.event === 'phase' && e.json.to === 'CLOSED'));
    const ph = s.events.find((e) => e.event === 'phase' && e.json.to === 'CLOSED')!;
    assert.equal(ph.json.from, 'OPEN');
    assert.equal(typeof ph.json.seq, 'number');
  } finally {
    s.close();
  }
});

test('SSE: Last-Event-ID resume returns exactly the missed events, in order, no duplicates (header and query forms)', async () => {
  const a = await SseClient.open(w.base, EV());
  // CLOSED now: use control notices to generate events instead of ballots
  await a.until((c) => c.comments.length > 0);
  a.close();
  const before = await SseClient.open(w.base, EV() + '?last_event_id=0');
  await before.until((c) => c.events.length >= 6, 4000);
  const all = before.events.map((e) => e.id!);
  before.close();
  assert.deepEqual(all, [...all].sort((x, y) => x - y));
  assert.equal(new Set(all).size, all.length);
  const mid = all[Math.floor(all.length / 2)]!;
  const expected = all.filter((x) => x > mid);

  const viaHeader = await SseClient.open(w.base, EV(), { 'Last-Event-ID': String(mid) });
  await viaHeader.until((c) => c.events.length >= expected.length);
  assert.deepEqual(viaHeader.events.slice(0, expected.length).map((e) => e.id), expected);
  viaHeader.close();

  const viaQuery = await SseClient.open(w.base, EV() + `?last_event_id=${mid}`);
  await viaQuery.until((c) => c.events.length >= expected.length);
  assert.deepEqual(viaQuery.events.slice(0, expected.length).map((e) => e.id), expected);
  viaQuery.close();

  // header wins over the query parameter
  const both = await SseClient.open(w.base, EV() + '?last_event_id=0', { 'Last-Event-ID': String(mid) });
  await both.until((c) => c.events.length >= expected.length);
  assert.equal(both.events[0]!.id, expected[0]);
  both.close();

  // resuming at the very end is valid and yields nothing historical
  const last = all.at(-1)!;
  const tail = await SseClient.open(w.base, EV(), { 'Last-Event-ID': String(last) });
  assert.equal(tail.status, 200);
  await sleep(150);
  assert.equal(tail.events.length, 0);
  tail.close();
});

test('SSE: disconnect during activity then resume loses nothing (ballot-driven)', async () => {
  // a second, live election keeps this independent of the closed one
  const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Second' }, w.owner, w.idemKey());
  assert.equal(r.status, 201);
  const id2 = r.json.election_id as string;
  const p = `/api/v1/elections/${id2}/events`;
  const rt = (await w.server.pool.get(id2))!;
  const emit = (n: number): number[] => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const row = rt.edb.insertEvent(Date.now(), 'alert', null, JSON.stringify({ kind: 'quarantine', detail_code: `T${i}` }));
      ids.push(row.id);
      (rt as any).publish([row]);
    }
    return ids;
  };
  const s1 = await SseClient.open(w.base, p);
  const first = emit(3);
  await s1.until((c) => c.events.length === 3);
  assert.deepEqual(s1.events.map((e) => e.id), first);
  s1.close();
  await sleep(50);
  const missed = emit(5); // nobody connected
  const s2 = await SseClient.open(w.base, p, { 'Last-Event-ID': String(first.at(-1)) });
  const live = emit(2); // arrives while/after the backlog is replayed
  await s2.until((c) => c.events.length === 7);
  assert.deepEqual(s2.events.map((e) => e.id), [...missed, ...live]);
  s2.close();
});

test('SSE: unknown, future, malformed Last-Event-ID', async () => {
  const future = await w.get(EV(), { 'Last-Event-ID': '99999999' });
  assert.equal(future.status, 410);
  assert.equal(future.json.code, 'EVENT_GONE');
  for (const bad of ['abc', '-1', '1.5', '1e3', '0x10', '1234567890123', '12abc', '+1']) {
    const r = await w.get(EV(), { 'Last-Event-ID': bad });
    assert.equal(r.status, 400, bad);
    assert.equal(r.json.code, 'BAD_REQUEST');
  }
  assert.equal((await w.get(EV() + '?last_event_id=zz')).status, 400);
  assert.equal(w.server.sse.stats.active, 0);
});

test('SSE: pruned history answers 410 EVENT_GONE', async () => {
  const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Pruned' }, w.owner, w.idemKey());
  const id = r.json.election_id as string;
  const rt = (await w.server.pool.get(id))!;
  for (let i = 0; i < 5; i++) rt.edb.insertEvent(Date.now(), 'alert', null, '{"kind":"quarantine","detail_code":"X"}');
  rt.edb.db.exec('DELETE FROM event WHERE event_id < 3'); // retention removed the oldest rows
  const gone = await w.get(`/api/v1/elections/${id}/events`, { 'Last-Event-ID': '1' });
  assert.equal(gone.status, 410);
  const ok = await SseClient.open(w.base, `/api/v1/elections/${id}/events`, { 'Last-Event-ID': '2' });
  assert.equal(ok.status, 200);
  await ok.until((c) => c.events.length === 3);
  assert.deepEqual(ok.events.map((e) => e.id), [3, 4, 5]);
  ok.close();
  rt.edb.pruneEvents();
  assert.equal((await w.get(`/api/v1/elections/${id}/events`, { 'Last-Event-ID': '4' })).status, 410);
});

test('SSE: per-client stream cap (429 + Retry-After) is released when streams close; unknown election 404; link elections need the read key', async () => {
  const open: SseClient[] = [];
  for (let i = 0; i < 3; i++) open.push(await SseClient.open(w.base, EV()));
  assert.ok(open.every((c) => c.status === 200));
  assert.equal(w.server.sse.stats.active, 3);
  const over = await w.get(EV());
  assert.equal(over.status, 429);
  assert.equal(over.json.code, 'RATE_LIMITED');
  assert.ok(Number(over.headers.get('retry-after')) >= 1);
  open[0]!.close();
  await sleep(100);
  const again = await SseClient.open(w.base, EV());
  assert.equal(again.status, 200);
  open.push(again);
  for (const c of open) c.close();
  await sleep(100);
  assert.equal(w.server.sse.stats.active, 0);

  assert.equal((await w.get(`/api/v1/elections/${'0'.repeat(32)}/events`)).status, 404);

  const l = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Private', access: 'link' }, w.owner, w.idemKey());
  const lp = `/api/v1/elections/${l.json.election_id}/events`;
  const denied = await w.get(lp);
  assert.equal(denied.status, 403);
  assert.equal(denied.json.code, 'READ_KEY_REQUIRED');
  assert.equal((await w.get(lp, { 'qv-read-key': 'wrong' })).status, 403);
  const good = await SseClient.open(w.base, lp, { 'qv-read-key': l.json.read_key });
  assert.equal(good.status, 200);
  good.close();
});

test('SSE: POST/PUT/DELETE are 405; request body is refused', async () => {
  assert.equal((await w.req('POST', EV(), {})).status, 405);
  assert.equal((await w.req('DELETE', EV())).status, 405);
  const withBody = await new Promise<number>((resolve, reject) => {
    const u = new URL(w.base);
    const rq = httpRequest({ host: u.hostname, port: u.port, path: EV(), method: 'GET', headers: { 'content-length': '2', 'content-type': 'application/json' } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    rq.on('error', reject);
    rq.end('{}');
  });
  assert.equal(withBody, 400);
});

test('SSE: process-wide cap answers 503 BUSY', async () => {
  const lite = new World({ seed: 'sse-total', n: 3, t: 2, voters: 1, server: { maxSseTotal: 1, maxSseStreams: 4 } });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const p = `/api/v1/elections/${lite.electionId}/events`;
    const a = await SseClient.open(lite.base, p);
    assert.equal(a.status, 200);
    const b = await lite.get(p);
    assert.equal(b.status, 503);
    assert.equal(b.json.code, 'BUSY');
    a.close();
  } finally {
    await lite.stop();
  }
});

test('SSE: idle streams are closed by the server; heartbeats alone do not keep them alive', async () => {
  const lite = new World({ seed: 'sse-idle', n: 3, t: 2, voters: 1, server: { sseHeartbeatMs: 20, sseIdleCloseMs: 300 } });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const s = await SseClient.open(lite.base, `/api/v1/elections/${lite.electionId}/events`);
    await s.until((c) => c.comments.includes('heartbeat'));
    await s.until((c) => c.ended, 3000);
    assert.equal(lite.server.sse.stats.droppedIdle, 1);
    assert.equal(lite.server.sse.stats.active, 0);
  } finally {
    await lite.stop();
  }
});

test('SSE: a client that stops reading is dropped; others are unaffected; buffers stay bounded', async () => {
  const lite = new World({ seed: 'sse-slow', n: 3, t: 2, voters: 1, server: { sseSlowClientMs: 300, sseHeartbeatMs: 1000, sseMaxBufferBytes: 256 * 1024 } });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const id = lite.electionId;
    const p = `/api/v1/elections/${id}/events`;
    const rt = (await lite.server.pool.get(id))!;
    // a raw socket that never reads
    const addr = new URL(lite.base);
    const slow = connect(Number(addr.port), addr.hostname);
    slow.pause();
    await new Promise<void>((r) => slow.once('connect', () => r()));
    slow.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nAccept: text/event-stream\r\n\r\n`);
    const good = await SseClient.open(lite.base, p);
    await sleep(100);
    assert.equal(lite.server.sse.stats.active, 2);
    // ~40 MB of backlog: far more than socket buffers can absorb
    const big = JSON.stringify({ kind: 'quarantine', detail_code: 'x'.repeat(2000) });
    rt.edb.db.exec('BEGIN');
    let lastRow = rt.edb.insertEvent(Date.now(), 'alert', null, big);
    for (let i = 0; i < 20000; i++) lastRow = rt.edb.insertEvent(Date.now(), 'alert', null, big);
    rt.edb.db.exec('COMMIT');
    (rt as any).publish([lastRow]);
    await good.until(() => lite.server.sse.stats.droppedSlow === 1, 8000);
    assert.equal(lite.server.sse.stats.droppedSlow, 1);
    assert.equal(lite.server.sse.stats.active, 1);
    // the healthy stream got data and is still usable
    await good.until((c) => c.events.length > 0);
    const next = rt.edb.insertEvent(Date.now(), 'alert', null, '{"kind":"quarantine","detail_code":"after"}');
    (rt as any).publish([next]);
    await good.until((c) => c.events.some((e) => e.id === next.id), 10000);
    good.close();
    slow.destroy();
  } finally {
    await lite.stop();
  }
});

test('SSE: deleting the election ends its streams', async () => {
  const lite = new World({ seed: 'sse-del', n: 3, t: 2, voters: 1 });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const s = await SseClient.open(lite.base, `/api/v1/elections/${lite.electionId}/events`);
    const d = await lite.signed('DELETE', `/api/v1/elections/${lite.electionId}`, { confirm: 'Annual meeting' });
    assert.equal(d.status, 202, d.text);
    await s.until((c) => c.ended, 3000);
    assert.equal(lite.server.sse.stats.active, 0);
    assert.equal((await lite.get(`/api/v1/elections/${lite.electionId}/events`)).status, 404);
  } finally {
    await lite.stop();
  }
});

// =============================================================================================== webhooks

test('webhook: create is owner-signed, validates, returns the secret once, stores URL and secret sealed', async () => {
  const idem = w.idemKey();
  const body = { url: 'https://hooks.example.com/qv/in?token=abc', events: ['entry', 'entry', 'phase'] };
  const c = await w.signed('POST', hooksPath(), body, w.owner, idem);
  assert.equal(c.status, 201, c.text);
  assert.match(c.json.secret, /^whsec_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(c.json.events, ['entry', 'phase']);
  assert.equal(c.json.url, body.url);
  assert.equal(c.json.election_id, null);
  const id = c.json.webhook_id as string;

  // listing never shows the secret
  const l = await w.signed('GET', hooksPath());
  assert.equal(l.status, 200);
  assert.equal(l.json.items.length, 1);
  assert.ok(!JSON.stringify(l.json).includes('whsec_'));
  // replaying the creation request does not leak the secret
  const replay = await w.signed('POST', hooksPath(), body, w.owner, idem);
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('idempotent-replay'), 'true');
  assert.equal(replay.json.secret, undefined);
  assert.equal(replay.json.url, undefined); // URLs can embed tokens: not kept in the idempotency cache either
  assert.equal(replay.json.webhook_id, id);
  assert.equal((await w.signed('GET', hooksPath())).json.items.length, 1);

  // at rest: neither the URL nor the secret appear in plaintext in the database files
  const files = readdirSync(w.dir).filter((f) => f.startsWith('control.sqlite'));
  for (const f of files) {
    const bytes = readFileSync(join(w.dir, f));
    assert.ok(!bytes.includes('hooks.example.com'), f);
    assert.ok(!bytes.includes(c.json.secret.slice(6)), f);
  }
  assert.equal((await w.signed('DELETE', `${hooksPath()}/${id}`)).status, 204);
  assert.equal((await w.signed('GET', hooksPath())).json.items.length, 0);
  assert.equal((await w.signed('DELETE', `${hooksPath()}/${id}`)).status, 404);
});

test('webhook: input validation and authentication', async () => {
  const bad = async (b: unknown, status: number, code?: string): Promise<void> => {
    const r = await w.signed('POST', hooksPath(), b, w.owner, w.idemKey());
    assert.equal(r.status, status, JSON.stringify(b) + r.text);
    if (code) assert.equal(r.json.code, code);
  };
  await bad({ url: 'https://hooks.example.com/', events: [] }, 400, 'BAD_REQUEST');
  await bad({ url: 'https://hooks.example.com/', events: ['ballot'] }, 400);
  await bad({ url: 'https://hooks.example.com/' }, 400);
  await bad({ events: ['entry'] }, 400);
  await bad({ url: 'https://hooks.example.com/', events: ['entry'], secret: 'mine' }, 400, 'UNKNOWN_FIELD');
  await bad({ url: 'https://hooks.example.com/', events: ['entry'], election_id: 'nothex' }, 400);
  await bad({ url: 'https://hooks.example.com/', events: ['entry'], election_id: '0'.repeat(32) }, 404);
  await bad({ url: 'https://' + 'a'.repeat(3000) + '.example.com/', events: ['entry'] }, 400);
  // unauthenticated / unsigned
  assert.equal((await w.req('POST', hooksPath(), { url: 'https://hooks.example.com/', events: ['entry'] }, { headers: w.idemKey() })).status, 401);
  assert.equal((await w.req('GET', hooksPath())).status, 401);
  assert.equal((await w.req('DELETE', `${hooksPath()}/aaaaaaaaaaaaaaaaaaaaaaaaaa`)).status, 401);
  // a missing Idempotency-Key is refused
  assert.equal((await w.signed('POST', hooksPath(), { url: 'https://hooks.example.com/', events: ['entry'] })).status, 400);
  assert.equal((await w.signed('GET', hooksPath())).json.items.length, 0);
});

test('webhook: SSRF — every non-public or non-https target is refused at registration, nothing is stored or contacted', async () => {
  dns.set('rebind.example.com', ['10.0.0.5']);
  dns.set('mixed.example.com', ['93.184.216.34', '192.168.1.10']);
  dns.set('meta.example.com', ['169.254.169.254']);
  dns.set('v6.example.com', ['fd00::1']);
  dns.set('mapped.example.com', ['::ffff:127.0.0.1']);
  dns.set('loop.example.com', ['127.0.0.1']);
  const cases: [string, string][] = [
    ['http://hooks.example.com/', 'URL_NOT_HTTPS'],
    ['ftp://hooks.example.com/', 'URL_NOT_HTTPS'],
    ['https://localhost/', 'TARGET_BLOCKED'],
    ['https://127.0.0.1/', 'TARGET_BLOCKED'],
    ['https://127.1/', 'TARGET_BLOCKED'],
    ['https://2130706433/', 'TARGET_BLOCKED'],
    ['https://0x7f.0.0.1/', 'TARGET_BLOCKED'],
    ['https://10.1.2.3/', 'TARGET_BLOCKED'],
    ['https://172.16.0.1/', 'TARGET_BLOCKED'],
    ['https://192.168.0.1/', 'TARGET_BLOCKED'],
    ['https://169.254.169.254/latest/meta-data/', 'TARGET_BLOCKED'],
    ['https://100.64.0.1/', 'TARGET_BLOCKED'],
    ['https://[::1]/', 'TARGET_BLOCKED'],
    ['https://[::ffff:127.0.0.1]/', 'TARGET_BLOCKED'],
    ['https://[fe80::1]/', 'TARGET_BLOCKED'],
    ['https://[fc00::1]/', 'TARGET_BLOCKED'],
    ['https://0.0.0.0/', 'TARGET_BLOCKED'],
    ['https://hooks.example.com:22/', 'URL_PORT'],
    ['https://hooks.example.com:6379/', 'URL_PORT'],
    ['https://admin:pw@hooks.example.com/', 'URL_CREDENTIALS'],
    ['https://printer.local/', 'TARGET_BLOCKED'],
    ['https://db.internal/', 'TARGET_BLOCKED'],
    ['https://intranet/', 'TARGET_BLOCKED'],
    ['https://rebind.example.com/', 'TARGET_BLOCKED'], // public-looking name, private A record
    ['https://mixed.example.com/', 'TARGET_BLOCKED'], // one private record among public ones
    ['https://meta.example.com/', 'TARGET_BLOCKED'],
    ['https://v6.example.com/', 'TARGET_BLOCKED'],
    ['https://mapped.example.com/', 'TARGET_BLOCKED'],
    ['https://loop.example.com/', 'TARGET_BLOCKED'],
    ['https://nxdomain.example.com/', 'DNS_FAILED'],
  ];
  calls.length = 0;
  for (const [url, reason] of cases) {
    const r = await mkHook(url, ['entry']);
    assert.equal(r.status, 422, `${url} -> ${r.status} ${r.text}`);
    assert.equal(r.json.code, 'VALIDATION_FAILED', url);
    assert.equal(r.json.reason, reason, url);
    assert.ok(!r.text.includes('10.0.0.5') && !r.text.includes('192.168.1.10') && !r.text.includes('169.254'), 'resolved addresses must not be reflected');
  }
  assert.equal((await w.signed('GET', hooksPath())).json.items.length, 0);
  assert.equal(calls.length, 0);
});

test('webhook: signed, pinned, event-filtered delivery with a stable id', async () => {
  calls.length = 0;
  script = () => 200;
  const c = await mkHook('https://hooks.example.com/qv', ['entry', 'phase']);
  assert.equal(c.status, 201, c.text);
  const secret = c.json.secret as string;
  const hookId = c.json.webhook_id as string;
  const sec = await SseClient.open(w.base, `/api/v1/elections/${w.electionId}/events`);
  // a fresh election in the OPEN state is needed for ballots; use control notices on the live election instead
  const r2 = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Hook source' }, w.owner, w.idemKey());
  assert.equal(r2.status, 201);
  sec.close();

  // feed events through the real publish path
  const rt = (await w.server.pool.get(r2.json.election_id))!;
  const rowOf = (type: string, data: object) => rt.edb.insertEvent(w.clock, type, 7, JSON.stringify(data));
  const e1 = rowOf('entry', { seq: 7, type: 'ballot', author: 'AAAA', leaf_hash: 'BBBB' });
  const e2 = rowOf('checkpoint', { tree_size: 8, root: 'R', witnessed: false, cosigners: [], issued_at: 'x' });
  const e3 = rowOf('phase', { from: 'OPEN', to: 'CLOSED', seq: 7 });
  for (const e of [e1, e2, e3]) (rt as any).publish([e]);
  await w.server.webhooks.idle();

  assert.equal(calls.length, 2, 'checkpoint is not subscribed');
  const a = calls[0]!;
  const b = calls[1]!;
  assert.equal(a.ip, '93.184.216.34'); // connected to the validated address
  assert.equal(a.url.href, 'https://hooks.example.com/qv');
  for (const [req, row, type] of [[a, e1, 'entry'], [b, e3, 'phase']] as const) {
    const body = req.body.toString();
    const j = JSON.parse(body);
    assert.equal(j.type, type);
    assert.equal(j.election_id, r2.json.election_id);
    assert.equal(j.event_id, row.id);
    assert.equal(j.id, `${hookId}.${r2.json.election_id}.${row.id}`);
    assert.deepEqual(j.data, JSON.parse(row.data));
    assert.equal(req.headers['QV-Webhook-Id'], j.id);
    assert.equal(req.headers['QV-Webhook-Event'], type);
    assert.equal(req.headers['Content-Type'], 'application/json');
    const ts = Number(req.headers['QV-Webhook-Timestamp']);
    assert.equal(ts, w.nowSec);
    assert.equal(req.headers['QV-Webhook-Signature'], signDelivery(secret, ts, j.id, body));
    assert.match(req.headers['QV-Webhook-Signature']!, /^v1=[0-9a-f]{64}$/);
    // a wrong secret or tampered body does not verify
    assert.notEqual(req.headers['QV-Webhook-Signature'], signDelivery('whsec_other', ts, j.id, body));
    assert.notEqual(req.headers['QV-Webhook-Signature'], signDelivery(secret, ts, j.id, body + ' '));
    assert.ok(req.timeoutMs > 0 && req.timeoutMs <= 30_000);
    assert.ok(req.maxResponseBytes <= 1024 * 1024);
  }
  await w.signed('DELETE', `${hooksPath()}/${hookId}`);
});

test('witness quorum: cosignatures produce witness + checkpoint events; real appends reach SSE and webhooks; rejected writes emit nothing', { timeout: 120_000 }, async () => {
  const sent: WebhookRequest[] = [];
  const w3 = new World({
    seed: 'ev-wit', n: 3, t: 2, voters: 3, witnessQuorum: 1,
    server: { sseHeartbeatMs: 100, webhookResolver: resolver, webhookBackoffBaseMs: 5, webhookTransport: async (r) => (sent.push(r), { status: 200, truncated: false }) },
  });
  await w3.start();
  try {
    await w3.setupOrgAndElection();
    await w3.registerVoters();
    const hk = await w3.signed('POST', `/api/v1/orgs/${w3.orgId}/webhooks`, { url: 'https://hooks.example.com/w', events: ['witness', 'phase', 'entry'], election_id: w3.electionId }, w3.owner, w3.idemKey());
    assert.equal(hk.status, 201, hk.text);
    assert.equal((await w3.publishManifest()).status, 201);
    await w3.ceremony();
    const evPath = `/api/v1/elections/${w3.electionId}/events`;
    const s = await SseClient.open(w3.base, evPath);
    // election_open needs a witnessed checkpoint: refused, and a refused write emits no events
    const refused = await w3.open();
    assert.equal(refused.status, 409);
    await sleep(100);
    assert.equal(s.events.length, 0);
    const cp = (await w3.get(`/api/v1/elections/${w3.electionId}/log/checkpoint`)).text;
    const size = Number(cp.split('\n')[1]);
    const text = cp.slice(0, cp.indexOf('\n\n') + 1);
    const wk = w3.witnesses[0]!;
    const evil = (await import('./helpers/world.ts')).kp('evil', 'w');
    const bad = await w3.req('POST', `/api/v1/elections/${w3.electionId}/log/cosignatures`, { checkpoint_size: size, lines: [cosignLine('w1', evil.secretKey, evil.publicKey, text, w3.nowSec)] });
    assert.deepEqual(bad.json.accepted, []);
    await sleep(100);
    assert.equal(s.events.length, 0, 'an invalid cosignature emits nothing');
    const good = await w3.req('POST', `/api/v1/elections/${w3.electionId}/log/cosignatures`, { checkpoint_size: size, lines: [cosignLine('w1', wk.secretKey, wk.publicKey, text, w3.nowSec)] });
    assert.deepEqual(good.json.accepted, ['w1']);
    await s.until((c) => c.events.some((e) => e.event === 'witness') && c.events.some((e) => e.event === 'checkpoint'));
    const we = s.events.find((e) => e.event === 'witness')!;
    assert.equal(we.json.witness, 'w1');
    assert.equal(we.json.quorum_met, true);
    assert.equal(typeof we.json.lag_seconds, 'number');
    const ce = s.events.find((e) => e.event === 'checkpoint')!;
    assert.equal(ce.json.witnessed, true);
    assert.deepEqual(ce.json.cosigners, ['w1']);
    assert.equal((await w3.open()).status, 201);
    await s.until((c) => c.events.some((e) => e.event === 'phase' && e.json.to === 'OPEN'));
    assert.equal(s.events.find((e) => e.event === 'phase' && e.json.to === 'OPEN')!.json.from, 'READY');
    s.close();
    await w3.server.webhooks.idle();
    const types = sent.map((r) => JSON.parse(r.body.toString()).type);
    assert.ok(types.includes('witness') && types.includes('phase') && types.includes('entry'), types.join());
    assert.ok(!types.includes('checkpoint'));
    const ph = sent.map((r) => JSON.parse(r.body.toString())).find((j) => j.type === 'phase' && j.data.to === 'OPEN')!;
    assert.deepEqual(ph.data, { from: 'READY', to: 'OPEN', seq: ph.seq });
    // the SSE outbox and the webhook payloads carry the same public data
    const sseOpen = s.events.find((e) => e.event === 'phase' && e.json.to === 'OPEN')!;
    assert.equal(ph.event_id, sseOpen.id);
    // resume from the beginning replays the same history: ids dense and strictly increasing
    const all = await SseClient.open(w3.base, evPath + '?last_event_id=0');
    await all.until((c) => c.events.some((e) => e.id === sseOpen.id));
    assert.deepEqual(all.events.map((e) => e.id), all.events.map((_, i) => i + 1));
    all.close();
  } finally {
    await w3.stop();
  }
});

test('webhook: election scoping — hooks only receive their election; foreign election ids are 404', async () => {
  calls.length = 0;
  const mk = async (title: string) => (await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title }, w.owner, w.idemKey())).json.election_id as string;
  const [x, y] = [await mk('X'), await mk('Y')];
  const hx = await mkHook('https://hooks.example.com/x', ['alert'], { election_id: x });
  const hall = await mkHook('https://hooks.example.com/all', ['alert']);
  assert.equal(hx.status, 201);
  assert.equal(hall.status, 201);
  for (const id of [x, y]) {
    const rt = (await w.server.pool.get(id))!;
    (rt as any).publish([rt.edb.insertEvent(w.clock, 'alert', null, '{"kind":"quarantine","detail_code":"T"}')]);
  }
  await w.server.webhooks.idle();
  const byPath = (p: string) => calls.filter((k) => k.url.pathname === p).map((k) => JSON.parse(k.body.toString()).election_id);
  assert.deepEqual(byPath('/x'), [x]);
  assert.deepEqual(byPath('/all').sort(), [x, y].sort());
  // another org cannot scope a hook to our election, nor see, delete or list ours
  const other = (await import('./helpers/world.ts')).kp('events', 'other-owner');
  const org2 = await w.req('POST', '/api/v1/orgs', { name: 'Other', owner_key: { pk: b64u(other.publicKey), alg: 'ed25519' } }, { key: other, headers: w.idemKey() });
  assert.equal(org2.status, 201);
  const p2 = `/api/v1/orgs/${org2.json.org_id}/webhooks`;
  assert.equal((await w.signed('POST', p2, { url: 'https://hooks.example.com/z', events: ['alert'], election_id: x }, other, w.idemKey())).status, 404);
  assert.equal((await w.signed('GET', hooksPath(), undefined, other)).status, 404);
  assert.equal((await w.signed('DELETE', `${hooksPath()}/${hx.json.webhook_id}`, undefined, other)).status, 404);
  assert.equal((await w.signed('DELETE', `${p2}/${hx.json.webhook_id}`, undefined, other)).status, 404);
  assert.equal((await w.signed('GET', p2, undefined, other)).json.items.length, 0);
  for (const h of [hx, hall]) await w.signed('DELETE', `${hooksPath()}/${h.json.webhook_id}`);
});

test('webhook: retries 5xx/429/network errors with backoff and the same delivery id; fresh signature each attempt', async () => {
  calls.length = 0;
  const c = await mkHook('https://hooks.example.com/retry', ['alert']);
  const secret = c.json.secret as string;
  const answers: (number | Error)[] = [503, new Error('ECONNRESET'), 429, 200];
  script = (_r, n) => answers[n - 1]!;
  const rt = (await w.server.pool.get(w.electionId))!;
  const before = { ...w.server.webhooks.stats };
  const t0 = Date.now();
  (rt as any).publish([rt.edb.insertEvent(w.clock, 'alert', null, '{"kind":"quarantine","detail_code":"R"}')]);
  await w.server.webhooks.idle();
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map((k) => k.headers['QV-Webhook-Id'])).size, 1);
  for (const k of calls) {
    const ts = Number(k.headers['QV-Webhook-Timestamp']);
    assert.equal(k.headers['QV-Webhook-Signature'], signDelivery(secret, ts, k.headers['QV-Webhook-Id']!, k.body.toString()));
  }
  assert.equal(w.server.webhooks.stats.retries - before.retries, 3);
  assert.equal(w.server.webhooks.stats.delivered - before.delivered, 1);
  assert.ok(Date.now() - t0 >= 5 + 10 + 20 - 5, 'exponential backoff 5,10,20 ms was observed');
  assert.equal(w.server.webhooks.backoffMs(1), 5);
  assert.equal(w.server.webhooks.backoffMs(2), 10);
  assert.equal(w.server.webhooks.backoffMs(3), 20);
  assert.equal(w.server.webhooks.backoffMs(9), 20); // capped
  await w.signed('DELETE', `${hooksPath()}/${c.json.webhook_id}`);
});

test('webhook: 4xx, 3xx (never followed) are permanent; retries are bounded; repeated failures disable the hook', async () => {
  const rt = (await w.server.pool.get(w.electionId))!;
  const fire = () => (rt as any).publish([rt.edb.insertEvent(w.clock, 'alert', null, '{"kind":"quarantine","detail_code":"F"}')]);
  const c = await mkHook('https://hooks.example.com/fail', ['alert']);
  const id = c.json.webhook_id as string;
  for (const status of [400, 404, 410, 301, 302, 307]) {
    calls.length = 0;
    script = () => status;
    const before = w.server.webhooks.stats.failed;
    fire();
    await w.server.webhooks.idle();
    assert.equal(calls.length, 1, `status ${status} must not be retried or followed`);
    assert.equal(w.server.webhooks.stats.failed - before, 1);
    // re-enable bookkeeping: failures counted per hook; reset by a success
    script = () => 200;
    fire();
    await w.server.webhooks.idle();
    calls.length = 0;
  }
  // exhausted retries: exactly webhookMaxAttempts (4) attempts
  calls.length = 0;
  script = () => 500;
  fire();
  await w.server.webhooks.idle();
  assert.equal(calls.length, 4);
  // second consecutive exhausted delivery disables the hook (webhookDisableAfter = 2)
  calls.length = 0;
  fire();
  await w.server.webhooks.idle();
  const list = (await w.signed('GET', hooksPath())).json.items as { webhook_id: string; disabled: boolean }[];
  assert.equal(list.find((h) => h.webhook_id === id)!.disabled, true);
  calls.length = 0;
  fire();
  await w.server.webhooks.idle();
  assert.equal(calls.length, 0, 'disabled hooks receive nothing');
  await w.signed('DELETE', `${hooksPath()}/${id}`);
  script = () => 200;
});

test('webhook: DNS rebinding after registration is caught at delivery time and never retried', async () => {
  dns.set('flip.example.com', ['93.184.216.40']);
  const c = await mkHook('https://flip.example.com/h', ['alert']);
  assert.equal(c.status, 201, c.text);
  const rt = (await w.server.pool.get(w.electionId))!;
  const fire = () => (rt as any).publish([rt.edb.insertEvent(w.clock, 'alert', null, '{"kind":"quarantine","detail_code":"D"}')]);
  calls.length = 0;
  script = () => 200;
  fire();
  await w.server.webhooks.idle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.ip, '93.184.216.40');
  await w.signed('DELETE', `${hooksPath()}/${c.json.webhook_id}`);
  // the attacker repoints the name at an internal service (a fresh hook each time: blocked deliveries count towards disabling)
  for (const evil of ['127.0.0.1', '169.254.169.254', '10.9.9.9', '::1', '::ffff:10.0.0.1']) {
    dns.set('flip.example.com', ['93.184.216.40']);
    const h = await mkHook('https://flip.example.com/h', ['alert']);
    assert.equal(h.status, 201, h.text);
    dns.set('flip.example.com', [evil]);
    calls.length = 0;
    const blocked = w.server.webhooks.stats.blocked;
    const retries = w.server.webhooks.stats.retries;
    fire();
    await w.server.webhooks.idle();
    assert.equal(calls.length, 0, evil);
    assert.equal(w.server.webhooks.stats.blocked - blocked, 1, evil);
    assert.equal(w.server.webhooks.stats.retries, retries, 'a security rejection is never retried');
    await w.signed('DELETE', `${hooksPath()}/${h.json.webhook_id}`);
  }
  dns.set('flip.example.com', ['93.184.216.40']);
  const c2 = await mkHook('https://flip.example.com/h', ['alert']);
  // transient resolution failure is retried (not a security rejection)
  dns.delete('flip.example.com');
  const retries = w.server.webhooks.stats.retries;
  fire();
  await w.server.webhooks.idle();
  assert.ok(w.server.webhooks.stats.retries > retries);
  assert.equal(calls.length, 0);
  await w.signed('DELETE', `${hooksPath()}/${c2.json.webhook_id}`);
});

test('webhook: per-organization quota', async () => {
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await mkHook(`https://hooks.example.com/q${i}`, ['alert']);
    assert.equal(r.status, 201, r.text);
    ids.push(r.json.webhook_id);
  }
  const over = await mkHook('https://hooks.example.com/q7', ['alert']);
  assert.equal(over.status, 429);
  assert.equal(over.json.retryable, false);
  for (const id of ids) assert.equal((await w.signed('DELETE', `${hooksPath()}/${id}`)).status, 204);
});

test('webhook: the delivery queue is bounded; overflow drops the oldest and never blocks the log', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const seen: string[] = [];
  const lite = new World({
    seed: 'wh-queue', n: 3, t: 2, voters: 1,
    server: {
      webhookResolver: resolver, webhookMaxQueue: 3, webhookMaxInflight: 1,
      webhookTransport: async (r) => {
        seen.push(r.headers['QV-Webhook-Id']!);
        await gate;
        return { status: 200, truncated: false };
      },
    },
  });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const c = await lite.signed('POST', `/api/v1/orgs/${lite.orgId}/webhooks`, { url: 'https://hooks.example.com/q', events: ['alert'] }, lite.owner, lite.idemKey());
    assert.equal(c.status, 201, c.text);
    const rt = (await lite.server.pool.get(lite.electionId))!;
    for (let i = 0; i < 10; i++) (rt as any).publish([rt.edb.insertEvent(lite.clock, 'alert', null, '{"kind":"quarantine","detail_code":"Q"}')]);
    await sleep(50);
    // 1 in flight + 3 queued survive; 6 were dropped
    assert.equal(lite.server.webhooks.stats.dropped, 6);
    release();
    await lite.server.webhooks.idle();
    assert.equal(lite.server.webhooks.stats.delivered, 4);
    assert.equal(seen.length, 4);
    // the oldest queued ones were dropped: the first (already in flight) and the three newest remain
    const evIds = seen.map((s) => Number(s.split('.').at(-1)));
    assert.equal(evIds[0], 1);
    assert.deepEqual(evIds.slice(1), [8, 9, 10]);
  } finally {
    release();
    await lite.stop();
  }
});

test('webhook: oversized payloads are dropped, not sent', async () => {
  const lite = new World({ seed: 'wh-big', n: 3, t: 2, voters: 1, server: { webhookResolver: resolver, webhookMaxBodyBytes: 512, webhookTransport: transport } });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const c = await lite.signed('POST', `/api/v1/orgs/${lite.orgId}/webhooks`, { url: 'https://hooks.example.com/b', events: ['alert'] }, lite.owner, lite.idemKey());
    assert.equal(c.status, 201);
    const rt = (await lite.server.pool.get(lite.electionId))!;
    calls.length = 0;
    (rt as any).publish([rt.edb.insertEvent(lite.clock, 'alert', null, JSON.stringify({ kind: 'quarantine', detail_code: 'x'.repeat(2000) }))]);
    await lite.server.webhooks.idle();
    assert.equal(calls.length, 0);
    assert.equal(lite.server.webhooks.stats.dropped, 1);
  } finally {
    await lite.stop();
  }
});

test('webhook: deleting a hook with deliveries pending cancels them', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const lite = new World({
    seed: 'wh-del', n: 3, t: 2, voters: 1,
    server: { webhookResolver: resolver, webhookMaxInflight: 1, webhookTransport: async () => (await gate, { status: 200, truncated: false }) },
  });
  await lite.start();
  try {
    await lite.setupOrgAndElection();
    const c = await lite.signed('POST', `/api/v1/orgs/${lite.orgId}/webhooks`, { url: 'https://hooks.example.com/d', events: ['alert'] }, lite.owner, lite.idemKey());
    const rt = (await lite.server.pool.get(lite.electionId))!;
    for (let i = 0; i < 3; i++) (rt as any).publish([rt.edb.insertEvent(lite.clock, 'alert', null, '{"kind":"quarantine","detail_code":"Q"}')]);
    await lite.signed('DELETE', `/api/v1/orgs/${lite.orgId}/webhooks/${c.json.webhook_id}`);
    release();
    await lite.server.webhooks.idle();
    assert.equal(lite.server.webhooks.stats.delivered, 1); // only the attempt already on the wire
  } finally {
    release();
    await lite.stop();
  }
});
