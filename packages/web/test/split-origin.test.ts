// @verifies QV-08-REQ-034 QV-19-REQ-022 QV-09-REQ-009
import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClient } from '../src/api/client.ts';
import { apiOrigin, boardPolicy, boardOrigins, electionCacheKey, MAX_BOARD_ORIGINS, safeBoardOrigin } from '../src/api/origins.ts';
import { buildArguments, siteConfig } from '../src/build/config.ts';
import { csp, htmlPage, type Asset } from '../src/build/site.ts';
import { parseFragment } from '../src/flow/invite.ts';
import { boardStorage } from '../src/key/board-storage.ts';
import type { QvKey1 } from '../src/key/keystore.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { inviteLink } from '../src/ui/invites.ts';

const page = 'https://client.example', a = 'https://a.example', b = 'https://b.example';

test('canonical origins reject ambiguous destinations and the deployment allowlist is bounded', () => {
  for (const origin of [page, 'https://a.example:8443', 'http://localhost:3000', 'http://127.0.0.1:3001', 'http://abc.onion']) assert.equal(safeBoardOrigin(origin), origin);
  for (const origin of ['', 'https://a.example/', 'https://a.example/path', 'https://a.example?x=1', 'https://a.example#read=secret',
    'https://user:pass@a.example', ' https://a.example', 'https://A.example', 'https://a.example:443', 'https://a.example:65536',
    'https://a..example', 'https://-a.example', 'https://a_.example', 'https://a.example.', 'http://public.example', 'http://127.1',
    'https://a.example\\@evil.example', '//a.example', 'data:text/plain,secret', "https://a.example;connect-src *", 'https://' + 'a'.repeat(301)]) assert.equal(safeBoardOrigin(origin), undefined, origin);
  assert.deepEqual(boardOrigins([b, a, b]), [a, b]);
  assert.throws(() => boardOrigins(Array.from({ length: MAX_BOARD_ORIGINS + 1 }, (_, i) => `https://b${i}.example`)), /too many/);
  assert.equal(apiOrigin('', page), page);
  const policy = boardPolicy(page, a, [a, b]);
  assert.equal(policy.defaultBoard, a); assert.equal(policy.select(b), b); assert.equal(policy.select(page), page);
  assert.throws(() => policy.select('https://unlisted.example'), /not allowed/);
  assert.throws(() => boardPolicy(page, a), /not allowed/, 'an API base is not an implicit runtime permission');
});

test('supplied malformed or duplicate board fragments fail closed and generated split links retain frontend origin', () => {
  const read = 'abcdefghijklmnop';
  for (const board of ['', '%', encodeURIComponent(a + '/path'), encodeURIComponent('https://u:p@a.example')]) {
    assert.throws(() => parseFragment(`#read=${read}&board=${board}`));
  }
  assert.throws(() => parseFragment(`#read=${read}&board`));
  assert.throws(() => parseFragment(`#board=${encodeURIComponent(a)}&board=${encodeURIComponent(b)}`));
  const token = 'AAECAwQFBgcICQoLDA0ODw';
  const url = new URL(inviteLink(page, 'a'.repeat(32), token, a));
  assert.equal(url.origin, page); assert.equal(url.search, '');
  assert.equal(parseFragment(url.hash).board, a);
  assert.ok(url.hash.includes(`inv=${token}`));
  assert.ok(!inviteLink(page, 'a'.repeat(32), token, page).includes('board='));
});

test('cache identity includes board and read credential while persistent storage is disjoint by board', async () => {
  const raw = new MemoryStorage(), A = boardStorage(raw, a, page), B = boardStorage(raw, b, page), local = boardStorage(raw, page, page);
  assert.equal(local, raw, 'same-origin historical slots remain readable');
  assert.notEqual(electionCacheKey(a, 'same'), electionCacheKey(b, 'same'));
  assert.notEqual(electionCacheKey(a, 'same', 'read-a'), electionCacheKey(a, 'same', 'read-b'));
  assert.notEqual(electionCacheKey(a, 'same'), electionCacheKey(a, 'same', 'read-a'));
  const key = { version: 1 } as unknown as QvKey1;
  await raw.putKey('organizer', key);
  assert.equal(await A.getKey('organizer'), undefined);
  const installed = await Promise.all([A.installKeyIfAbsent!('organizer', key), A.installKeyIfAbsent!('organizer', key)]);
  assert.equal(installed.filter(Boolean).length, 1, 'atomic installation survives namespacing');
  assert.deepEqual(await A.listKeySlots(), ['organizer']); assert.deepEqual(await B.listKeySlots(), []);
  assert.equal(await B.getKey('organizer'), undefined);
  const receipt = { electionId: 'same', seq: 5, code: 'code', json: '{"public":"receipt"}' };
  await A.putReceipt(receipt); assert.deepEqual(await A.getReceipts('same'), [receipt]); assert.deepEqual(await B.getReceipts('same'), []);
  await A.putHead({ electionId: 'same', size: 10, note: 'signed note' });
  assert.equal((await A.getHead('same'))?.size, 10); assert.equal(await B.getHead('same'), undefined);
  const pending = { origin: 'quietvote/v1/same', electionId: 'same', manifestHash: 'hash', code: 'code', leafHash: 'leaf' };
  await A.putPendingCast(pending); assert.deepEqual(await A.getPendingCast(pending.origin, 'same'), pending);
  assert.equal(await B.getPendingCast(pending.origin, 'same'), undefined);
  await B.deletePendingCast(pending); assert.deepEqual(await A.getPendingCast(pending.origin, 'same'), pending);
  await A.deletePendingCast(pending); assert.equal(await A.getPendingCast(pending.origin, 'same'), undefined);
  assert.ok([...(await raw.listKeySlots()), ...raw.heads.keys()].every((slot) => !slot.includes('read-a')));
  await A.clearAll(); assert.deepEqual(await raw.listKeySlots(), []);
});

test('build flags, runtime metadata and strict CSP describe the same finite board policy', () => {
  const opts = buildArguments(['out', '--api-base', a, '--connect-origin', b]);
  assert.deepEqual(opts, { out: 'out', apiBase: a, connectOrigins: [a, b] });
  assert.deepEqual(siteConfig(), { apiBase: '', connectOrigins: [] });
  for (const args of [['--api-base'], ['--api-base', a, '--api-base', b], ['--unknown'], ['one', 'two'], ['--api-base', a + '/api']]) assert.throws(() => buildArguments(args));
  assert.throws(() => siteConfig({ apiBase: a, connectOrigins: Array.from({ length: MAX_BOARD_ORIGINS }, (_, i) => `https://b${i}.example`) }), /too many/);
  const asset = { path: 'assets/pinned.js', integrity: 'sha384-pin' } as Asset;
  const html = htmlPage({ js: asset, css: asset, worker: asset, version: 'test', buildId: 'test', ...opts });
  assert.ok(html.includes(`<meta name="qv-api-base" content="${a}">`));
  assert.ok(html.includes(`<meta name="qv-board-origins" content="${a} ${b}">`));
  assert.ok(html.includes(`connect-src 'self' ${a} ${b}`));
  assert.ok(csp([a, b]).header.includes(`connect-src 'self' ${a} ${b}`));
  assert.ok(!/unsafe-inline|unsafe-eval|<script(?![^>]*\ssrc=)/.test(html));
});

test('read keys and SSE resume cursors stay in headers and credentialed requests refuse redirects', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const client = new ApiClient({ baseUrl: a, readKey: 'abcdefghijklmnop', fetch: async (url, init) => {
    seen.push({ url: String(url), init: init! });
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  } });
  await client.election('same');
  await client.events('same', { lastEventId: 7 });
  for (const r of seen) {
    assert.ok(r.url.startsWith(a + '/api/')); assert.ok(!r.url.includes('abcdefghijklmnop'));
    assert.equal(r.init.redirect, 'error'); assert.equal(r.init.credentials, 'omit'); assert.equal(r.init.referrerPolicy, 'no-referrer');
    assert.equal(new Headers(r.init.headers).get('qv-read-key'), 'abcdefghijklmnop');
  }
  assert.equal(new Headers(seen[1]!.init.headers).get('last-event-id'), '7');
  assert.ok(!seen[1]!.url.includes('?'));
});
