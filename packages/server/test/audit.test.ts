// Adversarial / negative regression tests added by the AI-assisted audit (docs/audit/server.md). Test names starting with SRV-nnn
// are regression tests for that finding; the others pin behaviour that was reviewed and found correct.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorKeyId, b64u } from '@quietvote/board';
import { ed25519Sign, utf8 } from '@quietvote/crypto';
import { readTar, writeTar } from '../src/index.ts';
import { BucketKeyer } from '../src/ratelimit.ts';
import { signRequest } from '../src/auth.ts';
import { World, kp } from './helpers/world.ts';

const sel = { budget: ['yes'], chair: ['ann'] };
let w: World;
let staticDir: string;

before(async () => {
  staticDir = mkdtempSync(join(tmpdir(), 'qv-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>spa</title>');
  mkdirSync(join(staticDir, 'assets'));
  writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log(1)');
  w = new World({ seed: 'audit', n: 3, t: 2, voters: 3, server: { staticDir } });
  await w.start();
  await w.setupOrgAndElection();
  await w.registerVoters();
  await w.publishManifest();
  await w.ceremony();
  await w.open();
}, { timeout: 120_000 });
after(async () => {
  await w.stop();
  rmSync(staticDir, { recursive: true, force: true });
});

const code = (r: { json: any }): string => r.json?.code;

async function organizerKey(): Promise<ReturnType<typeof kp>> {
  const k = kp('audit', 'organizer');
  const pop = ed25519Sign(k.secretKey, new Uint8Array([...utf8(`QV-KEY-v1\0${w.orgId}\0`), ...k.publicKey]));
  const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/keys`, { pk: b64u(k.publicKey), alg: 'ed25519', role: 'org_organizer', pop: b64u(pop) }, w.owner);
  assert.equal(r.status, 201, r.text);
  return k;
}

// ------------------------------------------------------------------------------------------------ rate-limit buckets

test('SRV-002: IPv6 clients inside one /64 share a bucket even when the textual address is compressed', () => {
  const k = new BucketKeyer(() => 0);
  // Node prints zero runs as "::", so the first four colon-separated tokens can contain host bits
  const a = k.bucket('2001:db8::1:2:3:4');
  const b = k.bucket('2001:db8::5:6:7:8');
  const c = k.bucket('2001:db8:0:0:aaaa:bbbb:cccc:dddd');
  assert.equal(a, b);
  assert.equal(a, c);
  assert.notEqual(a, k.bucket('2001:db8:0:1::1'), 'a different /64 is a different bucket');
  assert.notEqual(a, k.bucket('2001:db8:1::1'));
  assert.equal(k.bucket('::ffff:10.1.2.3'), k.bucket('10.1.2.200'), 'v4-mapped addresses bucket by /24');
  assert.equal(k.bucket('fe80::1%eth0'), k.bucket('fe80::2'), 'zone ids do not split buckets');
});

// ------------------------------------------------------------------------------------------------ link elections

test('SRV-003: read-key protected responses are never publicly cacheable', async () => {
  const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Private', access: 'link' }, w.owner, w.idemKey());
  assert.equal(r.status, 201);
  const h = { 'qv-read-key': r.json.read_key };
  const id = r.json.election_id;
  const pub = await w.get(`/api/v1/elections/${w.electionId}/log/proof/consistency?old=0&new=0`);
  assert.match(pub.headers.get('cache-control') ?? '', /public/, 'public elections keep their immutable caching');
  for (const p of ['', '/log/proof/consistency?old=0&new=0', '/log/checkpoints', '/roll', '/state', '/log/entries?from=0']) {
    const x = await w.get(`/api/v1/elections/${id}${p}`, h);
    assert.equal(x.status, 200, p);
    const cc = x.headers.get('cache-control') ?? '';
    assert.ok(/no-store|private/.test(cc) && !/public/.test(cc), `${p}: cache-control=${cc}`);
  }
});

// ------------------------------------------------------------------------------------------------ static assets

test('SRV-006: static server: SPA fallback never answers /api paths; traversal spellings never reach the filesystem', async () => {
  const idx = await w.get('/');
  assert.equal(idx.status, 200);
  assert.match(idx.text, /<title>spa<\/title>/);
  assert.equal((await w.get('/some/client/route')).status, 200);
  assert.equal((await w.get('/assets/app.js')).status, 200);
  const miss = await w.get('/api/v1/does-not-exist');
  assert.equal(miss.status, 404);
  assert.equal(code(miss), 'NOT_FOUND');
  assert.match(miss.headers.get('content-type') ?? '', /problem\+json/);
  assert.equal((await w.get('/api/v1/elections/nothex/state')).status, 404);
  for (const p of ['/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2findex.html', '/assets/%2e%2e%5c..%5cetc%5cpasswd', '/a%00b', '/assets/../../etc/passwd', '//etc/passwd', '/%252e%252e/etc/passwd']) {
    const x = await w.get(p);
    assert.ok(x.status === 400 || x.status === 404 || (x.status === 200 && /<title>spa<\/title>/.test(x.text)), `${p} -> ${x.status}`);
    assert.ok(!/root:/.test(x.text), p);
  }
  // raw request target with literal dot segments (fetch would normalise them)
  const raw = await new Promise<string>((resolve) => {
    const s = connect(Number(new URL(w.base).port), '127.0.0.1', () => s.write('GET /assets/../../../../etc/passwd HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    let out = '';
    s.on('data', (d) => (out += d));
    s.on('close', () => resolve(out));
    s.on('error', () => resolve(out));
  });
  // WHATWG URL parsing resolves the dot segments before routing, so this is just a SPA route; the point is that no file is read
  assert.ok(!/root:/.test(raw));
  assert.match(raw, /^HTTP\/1\.1 (200|400|404)/);
  assert.ok(!raw.startsWith('HTTP/1.1 200') || /<title>spa<\/title>/.test(raw));
});

// ------------------------------------------------------------------------------------------------ tar reader

test('SRV-005: readTar rejects malformed headers instead of looping or over-reading', { timeout: 10_000 }, () => {
  const good = writeTar([{ name: 'a.txt', data: utf8('hello') }]);
  const patch = (field: string): Uint8Array => {
    const t = new Uint8Array(good);
    t.fill(0, 124, 136);
    t.set(utf8(field), 124);
    return t;
  };
  assert.throws(() => readTar(patch('-1001\0')), /tar/, 'negative'); // negative size used to make the cursor stand still forever
  assert.throws(() => readTar(patch('zzz\0')), /tar/, 'not octal');
  assert.throws(() => readTar(patch('77777777777\0')), /tar/, 'size beyond archive'); // declares more data than the archive holds
  assert.throws(() => readTar(good.subarray(0, 515)), /tar/, 'truncated'); // truncated body
  const named = (n: string): Uint8Array => {
    const t = new Uint8Array(good);
    t.fill(0, 0, 100);
    t.set(utf8(n), 0);
    return t;
  };
  for (const n of ['../x', 'a/../../x', '/etc/passwd', 'a\\..\\x', 'a//b', 'a/./b']) assert.throws(() => readTar(named(n)), /unsafe tar path/, JSON.stringify(n));
  assert.equal(readTar(good).size, 1);
  // duplicate member names are ambiguous
  const two = writeTar([{ name: 'a.txt', data: utf8('x') }, { name: 'b.txt', data: utf8('y') }]);
  const t2 = new Uint8Array(two);
  t2.set(utf8('a.txt\0'), 512 + 512); // rename second member to the first one's name
  assert.throws(() => readTar(t2), /tar/);
});

// ------------------------------------------------------------------------------------------------ response size

test('SRV-004: log entry pages are bounded in bytes, not only in count, and paging still yields every entry', { timeout: 120_000 }, async () => {
  const w2 = new World({ seed: 'audit-page', n: 3, t: 2, voters: 3, server: { maxPageBytes: 2048 } });
  await w2.start();
  try {
    await w2.setupOrgAndElection();
    await w2.registerVoters();
    assert.equal((await w2.publishManifest()).status, 201);
    await w2.ceremony();
    const base = `/api/v1/elections/${w2.electionId}/log/entries`;
    const first = await w2.get(`${base}?from=0&limit=1000`);
    assert.equal(first.status, 200);
    const tree = first.json.tree_size as number;
    assert.ok(tree > 4);
    assert.ok(first.json.entries.length >= 1 && first.json.entries.length < tree, `page held ${first.json.entries.length} of ${tree}`);
    assert.ok(Buffer.byteLength(first.text) < 64 * 1024);
    assert.notEqual(first.json.next_from, null);
    assert.notEqual(first.headers.get('cache-control'), 'public, max-age=3600');
    const seen: number[] = [];
    for (let from: number | null = 0, n = 0; from !== null && n < 500; n++) {
      const p = await w2.get(`${base}?from=${from}&limit=1000`);
      for (const e of p.json.entries) seen.push(e.seq);
      from = p.json.next_from;
    }
    assert.deepEqual(seen, Array.from({ length: tree }, (_, i) => i));
  } finally {
    await w2.stop();
  }
});

// ------------------------------------------------------------------------------------------------ log append integrity

test('append integrity: an append that fails after the in-memory tree moved rolls back completely and the log continues at the same seq', async () => {
  const rt = (await w.server.pool.get(w.electionId))!;
  const before = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json.tree_size as number;
  const cpBefore = (await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text;
  const edb = rt.edb as any;
  edb.recordBallot = () => {
    throw new Error('injected projection failure /secret/path');
  };
  w.tick(3);
  const bad = await w.cast(0, sel);
  delete edb.recordBallot;
  assert.equal(bad.status, 500);
  assert.equal(code(bad), 'INTERNAL');
  assert.ok(!/injected|secret|path/.test(bad.text), 'internal error text is not echoed');
  // nothing was committed: checkpoint and size are unchanged
  const st = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
  assert.equal(st.tree_size, before);
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`)).text, cpBefore);
  w.tick(3);
  const ok = await w.cast(0, sel);
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.json.receipt.seq, before, 'the failed attempt left no gap and no duplicate');
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.tree_size, before + 1);
  assert.ok(w.logs.every((l) => !l.includes('injected') && !l.includes('/secret/path')), 'error messages are not logged');
});

// ------------------------------------------------------------------------------------------------ authentication

test('auth: malformed, duplicated and oversize Authorization headers are 401, never 500', async () => {
  const path = `/api/v1/orgs/${w.orgId}`;
  const sig = 'A'.repeat(86);
  const kid = 'A'.repeat(43);
  const nonce = 'A'.repeat(22);
  const cases = [
    '', 'Bearer abc', 'QV-Sig', 'QV-Sig ', 'QV-Sig keyid=x', `QV-Sig keyid=${kid},ts=1,nonce=${nonce}`,
    `QV-Sig keyid=${kid},ts=1,nonce=${nonce},sig=${sig},extra=1`, `QV-Sig keyid=${kid},keyid=${kid},ts=1,nonce=${nonce},sig=${sig}`,
    `QV-Sig keyid=${kid},ts=-1,nonce=${nonce},sig=${sig}`, `QV-Sig keyid=${kid},ts=1e9,nonce=${nonce},sig=${sig}`, `QV-Sig keyid=${kid},ts=${w.nowSec},nonce=${nonce},sig=${'A'.repeat(85)}`,
    `QV-Sig keyid=${kid},ts=${w.nowSec},nonce=${'A'.repeat(10)},sig=${sig}`, `QV-Sig keyid=${kid},ts=${w.nowSec},nonce=${nonce},sig=${sig}`,
    'QV-Sig ' + 'a=b,'.repeat(200), `QV-Sig keyid=${kid},ts=${w.nowSec},nonce=${nonce},sig=${sig}`.replace('QV-Sig', 'qv-sig'),
  ];
  for (const a of cases) {
    const r = await fetch(w.base + path, { headers: a === '' ? {} : { authorization: a } });
    assert.equal(r.status, 401, a.slice(0, 60));
    await r.arrayBuffer();
  }
});

test('auth: a signature is bound to method, target and body; a revoked key stops working at once', async () => {
  const orgPath = `/api/v1/orgs/${w.orgId}`;
  // sign one target, send to another
  const nonce = w.rng.bytes(16);
  const h1 = signRequest(w.owner.secretKey, w.owner.publicKey, 'GET', orgPath, w.audience, new Uint8Array(0), w.nowSec, nonce);
  const r1 = await fetch(w.base + `${orgPath}/keys`, { headers: { authorization: h1 } });
  assert.equal(r1.status, 401);
  // sign a GET, send it as a DELETE of an election
  const h2 = signRequest(w.owner.secretKey, w.owner.publicKey, 'GET', orgPath, w.audience, new Uint8Array(0), w.nowSec, w.rng.bytes(16));
  const r2 = await fetch(w.base + orgPath, { method: 'DELETE', headers: { authorization: h2 } });
  assert.ok(r2.status === 401 || r2.status === 405);
  // another instance's audience
  const h4 = signRequest(w.owner.secretKey, w.owner.publicKey, 'GET', orgPath, 'qv:other@http://localhost', new Uint8Array(0), w.nowSec, w.rng.bytes(16));
  assert.equal((await fetch(w.base + orgPath, { headers: { authorization: h4 } })).status, 401);
  // revocation
  const o = await organizerKey();
  assert.equal((await w.signed('GET', orgPath, undefined, o)).status, 200);
  const kid = b64u(authorKeyId('ed25519', o.publicKey));
  assert.equal((await w.signed('DELETE', `${orgPath}/keys/${kid}`, undefined, w.owner)).status, 204);
  assert.equal((await w.signed('GET', orgPath, undefined, o)).status, 401);
  // the last owner key cannot be removed (lock-out protection)
  const ownerKid = b64u(authorKeyId('ed25519', w.owner.publicKey));
  assert.equal((await w.signed('DELETE', `${orgPath}/keys/${ownerKid}`, undefined, w.owner)).status, 409);
});

// ------------------------------------------------------------------------------------------------ authorization

test('authz: organizer keys cannot manage keys, webhooks or delete elections; foreign organizations are 404', async () => {
  const o = kp('audit', 'organizer2');
  const pop = ed25519Sign(o.secretKey, new Uint8Array([...utf8(`QV-KEY-v1\0${w.orgId}\0`), ...o.publicKey]));
  assert.equal((await w.signed('POST', `/api/v1/orgs/${w.orgId}/keys`, { pk: b64u(o.publicKey), alg: 'ed25519', role: 'org_organizer', pop: b64u(pop) })).status, 201);
  const org = `/api/v1/orgs/${w.orgId}`;
  // an organizer cannot mint an owner key even with a valid proof of possession
  const k3 = kp('audit', 'organizer3');
  const pop3 = ed25519Sign(k3.secretKey, new Uint8Array([...utf8(`QV-KEY-v1\0${w.orgId}\0`), ...k3.publicKey]));
  const esc = await w.signed('POST', `${org}/keys`, { pk: b64u(k3.publicKey), alg: 'ed25519', role: 'org_owner', pop: b64u(pop3) }, o);
  assert.equal(esc.status, 403);
  assert.equal((await w.signed('POST', `${org}/webhooks`, { url: 'https://example.com/h', events: ['entry'] }, o, w.idemKey())).status, 403);
  assert.equal((await w.signed('GET', `${org}/webhooks`, undefined, o)).status, 403);
  assert.equal((await w.signed('DELETE', `/api/v1/elections/${w.electionId}`, { confirm: 'Annual meeting' }, o)).status, 403);
  // a proof of possession made for another organization is not accepted here
  const k4 = kp('audit', 'organizer4');
  const pop4 = ed25519Sign(k4.secretKey, new Uint8Array([...utf8(`QV-KEY-v1\0${'a'.repeat(26)}\0`), ...k4.publicKey]));
  assert.equal((await w.signed('POST', `${org}/keys`, { pk: b64u(k4.publicKey), alg: 'ed25519', role: 'org_organizer', pop: b64u(pop4) })).status, 401);
  // a new organization's owner cannot read, mutate or probe this organization
  const stranger = kp('audit', 'stranger');
  const reg = await w.req('POST', '/api/v1/orgs', { name: 'Stranger', owner_key: { pk: b64u(stranger.publicKey), alg: 'ed25519' } }, { key: stranger, headers: w.idemKey() });
  assert.equal(reg.status, 201);
  for (const [m, p, b] of [
    ['GET', `${org}/keys`, undefined], ['GET', `${org}/webhooks`, undefined], ['GET', `${org}/elections`, undefined],
    ['PUT', `/api/v1/elections/${w.electionId}/draft`, {}], ['GET', `/api/v1/elections/${w.electionId}/invites`, undefined],
    ['POST', `${org}/webhooks`, { url: 'https://example.com/h', events: ['entry'] }],
  ] as const) {
    const r = await w.signed(m, p, b, stranger, m === 'POST' ? w.idemKey() : {});
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  // webhook scoped to an election of another organization
  const own = await w.signed('POST', `/api/v1/orgs/${reg.json.org_id}/webhooks`, { url: 'https://example.com/h', events: ['entry'], election_id: w.electionId }, stranger, w.idemKey());
  assert.equal(own.status, 404);
});

// ------------------------------------------------------------------------------------------------ injection

test('SRV-007: quotes and SQL metacharacters in idempotency keys and query filters are inert; failed idempotent requests release their key', async () => {
  const key = `a'b"c;--');DROP-TABLE-idempotency;--`;
  const hdr = { 'idempotency-key': key };
  const org = `/api/v1/orgs/${w.orgId}`;
  // fails inside the idempotent section (non-public target), which takes the cleanup path
  const a = await w.signed('POST', `${org}/webhooks`, { url: 'https://127.0.0.1/', events: ['entry'] }, w.owner, hdr);
  assert.equal(a.status, 422);
  assert.equal(a.json.reason, 'TARGET_BLOCKED');
  const b = await w.signed('POST', `${org}/webhooks`, { url: 'https://127.0.0.1/', events: ['entry'] }, w.owner, hdr);
  assert.equal(b.status, 422, 'the in-progress marker was removed, so the retry is evaluated again');
  assert.notEqual(code(b), 'IDEMPOTENCY_IN_PROGRESS');
  const ok = await w.signed('POST', `${org}/elections`, { title: 'after' }, w.owner, w.idemKey());
  assert.equal(ok.status, 201, 'the idempotency table still exists');
  const evil = encodeURIComponent(`' OR '1'='1`).replace(/'/g, '%27'); // fetch would rewrite a literal quote in the query, breaking the signed target
  const l1 = await w.signed('GET', `${org}/elections?state=${evil}`);
  assert.equal(l1.status, 200, l1.text);
  assert.equal(l1.json.items.length, 0);
  const l2 = await w.signed('GET', `/api/v1/elections/${w.electionId}/invites?state=${evil}&cursor=${evil}`);
  assert.equal(l2.status, 200, l2.text);
  assert.equal(l2.json.items.length, 0);
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/log/entries?author=${evil}`)).status, 400);
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/log/entries?type=${evil}`)).status, 400);
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/roll?cursor=${evil}`)).status, 400);
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/voters/${evil}`)).status, 404);
});

// ------------------------------------------------------------------------------------------------ DoS and leakage

test('SRV-001: a chunked body without Content-Length is cut off at the route limit; problem bodies carry no internals', async () => {
  const port = Number(new URL(w.base).port);
  const uncaught: unknown[] = [];
  const onUncaught = (e: unknown): void => void uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  const resp = await new Promise<string>((resolve) => {
    const s = connect(port, '127.0.0.1', () => {
      s.write('POST /api/v1/orgs HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n');
      const chunk = 'x'.repeat(2000);
      for (let i = 0; i < 20; i++) s.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
    });
    let out = '';
    s.on('data', (d) => (out += d));
    s.on('close', () => resolve(out));
    s.on('error', () => resolve(out));
    setTimeout(() => s.destroy(), 3000).unref();
  });
  assert.match(resp, /^HTTP\/1\.1 413/);
  assert.match(resp, /PAYLOAD_TOO_LARGE/);
  await new Promise((r) => setTimeout(r, 200)); // the 'finish' handler of the closing reply runs after the peer is gone
  process.off('uncaughtException', onUncaught);
  assert.deepEqual(uncaught, [], 'a peer that disconnects while its request is being refused must not crash the process');
  // assorted hostile requests: every error body is a small problem document without paths or stack frames
  const probes: [string, string, BodyInit | undefined, Record<string, string>][] = [
    ['POST', '/api/v1/orgs', '{"name":', { 'content-type': 'application/json' }],
    ['POST', '/api/v1/orgs', '[]', { 'content-type': 'application/json' }],
    ['POST', '/api/v1/orgs', '{"name":"x","name":"y"}', { 'content-type': 'application/json' }],
    ['POST', '/api/v1/orgs', '{"__proto__":{"a":1}}', { 'content-type': 'application/json' }],
    ['POST', `/api/v1/elections/${w.electionId}/log/entries`, '{"header":"!!!","body":"AA"}', { 'content-type': 'application/json' }],
    ['POST', `/api/v1/elections/${w.electionId}/log/entries`, '{"header":"AAAA","body":"AAAA"}', { 'content-type': 'application/json' }],
    ['POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, '{"checkpoint_size":1e99,"lines":[]}', { 'content-type': 'application/json' }],
    ['GET', `/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,1,1,99`, undefined, {}],
    ['GET', `/api/v1/elections/${w.electionId}/log/proof/inclusion?seq=99999999`, undefined, {}],
    ['GET', `/api/v1/elections/${w.electionId}/events?last_event_id=abc`, undefined, {}],
    ['GET', '/healthz%2f..', undefined, {}],
  ];
  for (const [m, p, b, h] of probes) {
    const r = await fetch(w.base + p, { method: m, ...(b !== undefined ? { body: b } : {}), headers: h });
    const t = await r.text();
    assert.ok(r.status >= 400 && r.status < 500, `${m} ${p} -> ${r.status} ${t.slice(0, 100)}`);
    assert.ok(t.length < 2000, `${m} ${p}: body of ${t.length} bytes`);
    assert.ok(!/node:|\/home\/|\/tmp\/|\.ts:\d|\bat \w+.*\(|stack|SQLITE|sqlite/i.test(t), `${m} ${p} leaked: ${t.slice(0, 200)}`);
  }
});
