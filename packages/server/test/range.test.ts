// HTTP Range on export downloads: single range, 206/416, exact Content-Range, no multi-range amplification.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { cosignLine } from '@quietvote/board';
import { ifRangeHolds, parseRange } from '../src/range.ts';
import { World } from './helpers/world.ts';

let w: World;
let path = '';
before(async () => {
  w = new World({ seed: 'range', n: 3, t: 2, voters: 2 });
  await w.start();
  await w.setupOrgAndElection();
  await w.publishManifest();
  path = `/api/v1/elections/${w.electionId}/export.qvb`;
}, { timeout: 60_000 });
after(async () => {
  await w.stop();
});

const get = async (p: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; headers: Headers; body: Buffer }> => {
  const r = await fetch(w.base + p, { method, headers });
  return { status: r.status, headers: r.headers, body: Buffer.from(await r.arrayBuffer()) };
};

test('parseRange: accepted forms and clamping', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { kind: 'partial', start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { kind: 'partial', start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { kind: 'partial', start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', 1000), { kind: 'partial', start: 0, end: 999 });
  assert.deepEqual(parseRange('bytes=990-5000', 1000), { kind: 'partial', start: 990, end: 999 });
  assert.deepEqual(parseRange('BYTES=1-2', 1000), { kind: 'partial', start: 1, end: 2 });
  assert.deepEqual(parseRange(' bytes = 1-2 ', 1000), { kind: 'partial', start: 1, end: 2 });
  assert.deepEqual(parseRange(undefined, 1000), { kind: 'ignore' });
  assert.deepEqual(parseRange('items=1-2', 1000), { kind: 'ignore' }); // unknown unit is ignored (RFC 9110 §14.2)
});

test('parseRange: everything else is unsatisfiable, never expanded', () => {
  for (const h of [
    'bytes=0-1,5-6', 'bytes=0-0,0-0,0-0', 'bytes=0-1, 2-3', 'bytes=5-2', 'bytes=-0', 'bytes=1000-', 'bytes=1000-1001', 'bytes=', 'bytes=-', 'bytes=a-b', 'bytes=--5',
    'bytes=1-2-3', 'bytes=+1-2', 'bytes=0x10-0x20', 'bytes=1e3-2e3', 'bytes=-1-2', 'bytes=9999999999999999-', 'bytes=0-99999999999999999999', 'bytes', '=1-2', 'bytes=1 -2',
    `bytes=${'0-0,'.repeat(5000)}0-0`, 'bytes=' + '9'.repeat(5000), 'bytes=0-1\r\nX: y',
  ]) assert.equal(parseRange(h, 1000).kind, 'unsatisfiable', h.slice(0, 40));
  assert.equal(parseRange('bytes=0-0', 0).kind, 'unsatisfiable', 'empty representation');
  assert.equal(parseRange('bytes=-1', 0).kind, 'unsatisfiable');
});

test('ifRangeHolds: strong tag equality only', () => {
  assert.equal(ifRangeHolds(undefined, '"a"'), true);
  assert.equal(ifRangeHolds('"a"', '"a"'), true);
  assert.equal(ifRangeHolds('"b"', '"a"'), false);
  assert.equal(ifRangeHolds('W/"a"', 'W/"a"'), false);
  assert.equal(ifRangeHolds('Wed, 21 Oct 2026 07:28:00 GMT', '"a"'), false);
  assert.equal(ifRangeHolds('"a"', undefined), false);
});

test('export.qvb: full response advertises ranges; ranged chunks reassemble the identical file', async () => {
  const full = await get(path);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const len = full.body.length;
  assert.equal(Number(full.headers.get('content-length')), len);
  assert.ok(len > 2048);
  const etag = full.headers.get('etag')!;
  assert.match(etag, /^"/);
  const parts: Buffer[] = [];
  for (let off = 0; off < len; off += 1000) {
    const end = Math.min(len - 1, off + 999);
    const r = await get(path, { range: `bytes=${off}-${end}` });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), `bytes ${off}-${end}/${len}`);
    assert.equal(Number(r.headers.get('content-length')), end - off + 1);
    assert.equal(r.headers.get('etag'), etag);
    parts.push(r.body);
  }
  assert.ok(Buffer.concat(parts).equals(full.body));
});

test('suffix, open-ended and clamped ranges', async () => {
  const full = (await get(path)).body;
  const len = full.length;
  let r = await get(path, { range: 'bytes=-100' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes ${len - 100}-${len - 1}/${len}`);
  assert.ok(r.body.equals(full.subarray(len - 100)));
  r = await get(path, { range: `bytes=${len - 10}-` });
  assert.equal(r.status, 206);
  assert.ok(r.body.equals(full.subarray(len - 10)));
  r = await get(path, { range: `bytes=${len - 3}-${len + 500}` });
  assert.equal(r.headers.get('content-range'), `bytes ${len - 3}-${len - 1}/${len}`);
  r = await get(path, { range: `bytes=-${len + 10}` });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 0-${len - 1}/${len}`);
  r = await get(path, { range: 'bytes=0-0' });
  assert.equal(r.body.length, 1);
});

test('unsatisfiable and multi-range requests get 416 with Content-Range */len and a problem body', async () => {
  const len = (await get(path)).body.length;
  for (const h of [`bytes=${len}-`, `bytes=${len + 100}-${len + 200}`, 'bytes=-0', 'bytes=0-1,5-6', 'bytes=5-2', 'bytes=abc', `bytes=${'0-0,'.repeat(300)}1-1`]) {
    const r = await get(path, { range: h });
    assert.equal(r.status, 416, h.slice(0, 30));
    assert.equal(r.headers.get('content-range'), `bytes */${len}`);
    assert.match(r.headers.get('content-type') ?? '', /application\/problem\+json/);
    assert.equal(JSON.parse(r.body.toString()).code, 'RANGE_NOT_SATISFIABLE');
    assert.ok(r.body.length < 600, 'the error body does not grow with the request');
  }
});

test('unknown range unit and duplicate Range headers', async () => {
  const full = (await get(path)).body;
  const r = await get(path, { range: 'items=0-5' });
  assert.equal(r.status, 200);
  assert.ok(r.body.equals(full));
  const dup = await new Promise<number>((resolve) => {
    const u = new URL(w.base + path);
    const q = httpRequest({ host: u.hostname, port: u.port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    q.setHeader('range', ['bytes=0-1', 'bytes=3-4']);
    q.end();
  });
  assert.equal(dup, 416, 'two Range headers are one multi-range request: refused, never expanded');
});

test('If-Range: matching strong ETag keeps the range, anything else yields the full 200', async () => {
  const first = await get(path);
  const etag = first.headers.get('etag')!;
  let r = await get(path, { range: 'bytes=0-9', 'if-range': etag });
  assert.equal(r.status, 206);
  r = await get(path, { range: 'bytes=0-9', 'if-range': '"other"' });
  assert.equal(r.status, 200);
  assert.equal(r.body.length, first.body.length);
  r = await get(path, { range: 'bytes=0-9', 'if-range': 'Wed, 21 Oct 2026 07:28:00 GMT' });
  assert.equal(r.status, 200);
  r = await get(path, { range: 'bytes=0-9', 'if-range': `W/${etag}` });
  assert.equal(r.status, 200);
});

test('If-None-Match still wins with 304; HEAD answers headers only; non-GET is untouched', async () => {
  const first = await get(path);
  const etag = first.headers.get('etag')!;
  const nm = await get(path, { 'if-none-match': etag, range: 'bytes=0-9' });
  assert.equal(nm.status, 304);
  const head = await get(path, { range: 'bytes=0-9' }, 'HEAD');
  assert.equal(head.status, 206);
  assert.equal(head.headers.get('content-range'), `bytes 0-9/${first.body.length}`);
  assert.equal(head.body.length, 0);
  const post = await fetch(w.base + path, { method: 'POST', headers: { range: 'bytes=0-9' } });
  assert.equal(post.status, 405);
});

test('export.json supports ranges too; other endpoints ignore Range', async () => {
  const p = `/api/v1/elections/${w.electionId}/export.json`;
  const full = await get(p);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  JSON.parse(full.body.toString());
  const part = await get(p, { range: 'bytes=0-9' });
  assert.equal(part.status, 206);
  assert.ok(part.body.equals(full.body.subarray(0, 10)));
  const st = await get(`/api/v1/elections/${w.electionId}/state`, { range: 'bytes=0-3' });
  assert.equal(st.status, 200, 'ranges are only offered where advertised');
  assert.equal(st.headers.get('accept-ranges'), null);
});

test('Range on an export that is not available yet is the normal 409, not a range error', async () => {
  const w2 = new World({ seed: 'range2', n: 3, t: 2, voters: 1 });
  await w2.start();
  try {
    await w2.setupOrgAndElection();
    const r = await fetch(w2.base + `/api/v1/elections/${w2.electionId}/export.qvb`, { headers: { range: 'bytes=0-9' } });
    assert.equal(r.status, 409);
  } finally {
    await w2.stop();
  }
});

test('the ETag is stable while nothing changes and changes when a cosignature is attached (cached bytes are dropped)', async () => {
  const a = await get(path);
  const b = await get(path);
  assert.equal(a.headers.get('etag'), b.headers.get('etag'));
  assert.ok(a.body.equals(b.body));
  const note = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text;
  const size = Number(note.split('\n')[1]);
  const text = note.slice(0, note.indexOf('\n\n') + 1);
  const wk = w.witnesses[0]!;
  const line = cosignLine('w1', wk.secretKey, wk.publicKey, text, w.nowSec);
  const r = await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, { checkpoint_size: size, lines: [line] });
  assert.equal(r.status, 200, r.text);
  const c = await get(path);
  assert.notEqual(c.headers.get('etag'), a.headers.get('etag'));
  assert.ok(c.body.length > a.body.length - 1, 'the new bundle carries the cosigned checkpoint');
  // a client resuming with the old ETag in If-Range gets a full, consistent file instead of a splice
  const resumed = await get(path, { range: 'bytes=100-', 'if-range': a.headers.get('etag')! });
  assert.equal(resumed.status, 200);
  assert.ok(resumed.body.equals(c.body));
});
