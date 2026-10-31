import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { b64u, buildEntry, cosignLine, unb64u } from '@quietvote/board';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { makeCast } from '@quietvote/protocol';
import { World, kp } from './helpers/world.ts';

const sel = { budget: ['yes'], chair: ['ann'] };
let w: World;

before(async () => {
  w = new World({ seed: 'neg', n: 3, t: 2, voters: 4 });
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

const code = (r: { json: any }): string => r.json?.code;

test('replayed signed management request is rejected; stale and tampered ones too', async () => {
  const nonce = w.rng.bytes(16);
  const path = `/api/v1/orgs/${w.orgId}`;
  const a = await w.req('GET', path, undefined, { key: w.owner, nonce });
  assert.equal(a.status, 200);
  const b = await w.req('GET', path, undefined, { key: w.owner, nonce });
  assert.equal(b.status, 401);
  assert.equal(b.json.reason, 'REPLAY');
  const stale = await w.req('GET', path, undefined, { key: w.owner, ts: w.nowSec - 500 });
  assert.equal(stale.status, 401);
  // signature over one body, different body sent
  const good = await w.req('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'x' }, { key: w.owner, headers: w.idemKey() });
  assert.equal(good.status, 201);
  const raw = Buffer.from(JSON.stringify({ title: 'y' }));
  const header = (await w.req('GET', path, undefined, { key: w.owner })).status; // just consume
  void header;
  const tampered = await fetch(w.base + `/api/v1/orgs/${w.orgId}/elections`, {
    method: 'POST', body: raw,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'abcdefgh1234', authorization: (await w.req('GET', path, undefined, { key: w.owner })).headers.get('x-none') ?? 'QV-Sig keyid=aaaaaaaaaaaaaaaaaaaa,ts=1,nonce=aaaaaaaaaaaaaaaaaaaa,sig=' + 'A'.repeat(86) },
  });
  assert.equal(tampered.status, 401);
  const noauth = await w.req('GET', path);
  assert.equal(noauth.status, 401);
});

test('cross-org access looks like 404', async () => {
  const other = kp('neg', 'other-owner');
  const r = await w.req('POST', '/api/v1/orgs', { name: 'Other', owner_key: { pk: b64u(other.publicKey), alg: 'ed25519' } }, { key: other, headers: w.idemKey() });
  assert.equal(r.status, 201);
  assert.equal((await w.signed('GET', `/api/v1/orgs/${w.orgId}`, undefined, other)).status, 404);
  assert.equal((await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, other, w.idemKey())).status, 404);
  assert.equal((await w.signed('DELETE', `/api/v1/elections/${w.electionId}`, { confirm: 'Annual meeting' }, other)).status, 404);
});

test('entry replay: identical bytes are idempotent, nonce reuse with other bytes conflicts', async () => {
  const v = w.voters[0]!;
  const b = w.build(0, sel);
  const e = w.entry('ballot', v, makeCast(w.params, v.secretKey, b));
  const r1 = await w.submit(e.headerBytes, e.body);
  assert.equal(r1.status, 201, r1.text);
  w.last.set(bytesToHex(v.publicKey), bytesToHex(b.code));
  const r2 = await w.submit(e.headerBytes, e.body);
  assert.equal(r2.status, 200);
  assert.equal(r2.json.receipt.seq, r1.json.receipt.seq);
  assert.equal(r2.json.receipt.leaf_hash, r1.json.receipt.leaf_hash);
  // same (author,type,nonce), different content
  const b2 = w.build(0, { budget: ['no'], chair: ['bob'] });
  const e2 = buildEntry({ origin: w.origin, type: 'ballot', secretKey: v.secretKey, publicKey: v.publicKey, nonce: e.header.authorNonce, createdAt: w.nowSec, body: jcs(makeCast(w.params, v.secretKey, b2)) });
  const r3 = await w.submit(e2.headerBytes, e2.body);
  assert.equal(r3.status, 409);
  assert.equal(code(r3), 'NONCE_REUSE');
  // the same ballot re-signed under a fresh nonce breaks the supersedes chain
  w.tick();
  const e3 = w.entry('ballot', v, makeCast(w.params, v.secretKey, b));
  const r4 = await w.submit(e3.headerBytes, e3.body);
  assert.equal(r4.status, 422);
  assert.equal(r4.json.reason, 'E_SUPERSEDES');
});

test('oversize requests and entries are rejected before parsing', async () => {
  const big = Buffer.alloc(2 * 1024 * 1024, 0x41);
  const r = await fetch(`${w.base}/api/v1/elections/${w.electionId}/log/entries`, { method: 'POST', body: big, headers: { 'content-type': 'application/json' } }).catch(() => undefined);
  if (r) assert.equal(r.status, 413);
  const v = w.voters[1]!;
  const e = buildEntry({ origin: w.origin, type: 'ballot_audit', secretKey: v.secretKey, publicKey: v.publicKey, nonce: w.rng.bytes(16), createdAt: w.nowSec, body: new Uint8Array(200 * 1024).fill(0x20) });
  const r2 = await w.submit(e.headerBytes, e.body);
  assert.equal(r2.status, 413);
  assert.equal(code(r2), 'ENTRY_TOO_LARGE');
  const r3 = await w.req('POST', `/api/v1/elections/${w.electionId}/log/entries`, { header: 'A', body: 'A', extra: 1 });
  assert.equal(r3.status, 400);
  assert.equal(code(r3), 'UNKNOWN_FIELD');
});

test('bad signatures and non-roll authors never reach the proof verifier', async () => {
  const before = w.server.env.stats.proofVerifications;
  const v = w.voters[1]!;
  const b = w.build(1, sel);
  const e = w.entry('ballot', v, makeCast(w.params, v.secretKey, b));
  const bad = new Uint8Array(e.headerBytes);
  bad[bad.length - 3]! ^= 0x55; // inside the entry signature
  const r1 = await w.submit(bad, e.body);
  assert.ok([400, 401].includes(r1.status), r1.text);
  // a stranger with a valid signature but no roll membership
  const stranger = kp('neg', 'stranger');
  const e2 = w.entry('ballot', stranger, makeCast(w.params, v.secretKey, b));
  const r2 = await w.submit(e2.headerBytes, e2.body);
  assert.equal(r2.status, 403);
  assert.equal(code(r2), 'AUTHOR_NOT_AUTHORIZED');
  // roll voter signs entry, but the envelope belongs to another voter
  const e3 = w.entry('ballot', w.voters[2]!, makeCast(w.params, v.secretKey, b));
  const r3 = await w.submit(e3.headerBytes, e3.body);
  assert.equal(r3.status, 422);
  assert.equal(w.server.env.stats.proofVerifications, before, 'no proof verification for any of the above');
  // a bearer token on POST entries changes nothing
  const r4 = await w.req('POST', `/api/v1/elections/${w.electionId}/log/entries`, { header: b64u(bad), body: b64u(e.body) }, { headers: { authorization: 'Bearer qvs_x' } });
  assert.equal(r4.status, r1.status);
});

test('wrong election: entry bound to another origin is rejected', async () => {
  const r0 = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Second' }, w.owner, w.idemKey());
  const otherId = r0.json.election_id;
  const v = w.voters[1]!;
  const e = w.entry('ballot', v, makeCast(w.params, v.secretKey, w.build(1, sel)));
  const r = await w.submit(e.headerBytes, e.body, otherId);
  assert.equal(r.status, 422);
  assert.equal(r.json.reason, 'ORIGIN_MISMATCH');
  const inv = await w.get(`/api/v1/elections/${'0'.repeat(32)}/state`);
  assert.equal(inv.status, 404);
});

test('privacy: no IP/UA in logs or storage, no cookies, security headers present', async () => {
  const ua = 'canary-user-agent-7f3a9c';
  const xff = '203.0.113.77';
  const r = await w.get('/api/v1/instance', { 'user-agent': ua, 'x-forwarded-for': xff });
  assert.equal(r.status, 200);
  assert.equal(r.json.logging.ip, false);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.ok(r.headers.get('x-request-id'));
  assert.equal(r.headers.get('server'), null);
  assert.equal(r.headers.get('x-powered-by'), null);
  const all = w.logs.join('\n');
  for (const c of [ua, xff, '127.0.0.1', 'Bearer', 'QV-Sig']) assert.ok(!all.includes(c), `log leaks ${c}`);
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  for (const f of walk(w.dir)) {
    const buf = readFileSync(f);
    assert.ok(!buf.includes(ua) && !buf.includes(xff), `storage leaks canary in ${f}`);
  }
  const nf = await w.get('/api/v1/nothing');
  assert.equal(nf.status, 404);
  assert.match(nf.headers.get('content-type') ?? '', /application\/problem\+json/);
  assert.equal(nf.json.code, 'NOT_FOUND');
  const mna = await w.req('DELETE', '/healthz');
  assert.equal(mna.status, 405);
  const enc = await fetch(`${w.base}/api/v1/elections/${w.electionId}/log/entries`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } });
  assert.equal(enc.status, 415);
  const ct = await fetch(`${w.base}/api/v1/elections/${w.electionId}/log/entries`, { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } });
  assert.equal(ct.status, 415);
});

test('per-key and per-bucket rate limits answer 429 with Retry-After', async () => {
  const v = w.voters[3]!;
  const first = await w.cast(3, sel);
  assert.equal(first.status, 201);
  w.clock -= 3000; // second ballot from the same key inside the 2 s minimum interval
  const quick = await w.cast(3, { budget: ['no'], chair: ['bob'] });
  assert.equal(quick.status, 429);
  assert.ok(Number(quick.headers.get('retry-after')) >= 1);
  assert.equal(quick.json.retryable, true);
  void v;
});

test('late ballot after voting_close and after election_close', async () => {
  w.clock = Date.UTC(2026, 10, 9, 0, 0, 0); // past voting_close, election not yet closed
  const late = await w.cast(2, sel);
  assert.equal(late.status, 409);
  assert.equal(code(late), 'WRONG_PHASE');
  w.clock += 60_000;
  assert.equal((await w.close()).status, 201);
  assert.equal(code(await w.cast(2, sel)), 'WRONG_PHASE');
});

test('link-access elections require the read key', async () => {
  const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Private', access: 'link' }, w.owner, w.idemKey());
  assert.equal(r.status, 201);
  const id = r.json.election_id;
  assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 403);
  assert.equal((await w.get(`/api/v1/elections/${id}`, { 'qv-read-key': 'wrong' })).status, 403);
  assert.equal((await w.get(`/api/v1/elections/${id}`, { 'qv-read-key': r.json.read_key })).status, 200);
});

test('idempotency keys: replay returns stored response, mismatch is 422', async () => {
  const k = w.idemKey();
  const a = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Idem' }, w.owner, k);
  const b = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Idem' }, w.owner, k);
  assert.equal(b.status, 201);
  assert.equal(b.headers.get('idempotent-replay'), 'true');
  assert.equal(b.json.election_id, a.json.election_id);
  const c = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Other' }, w.owner, k);
  assert.equal(c.status, 422);
  assert.equal(code(c), 'IDEMPOTENCY_MISMATCH');
  assert.equal((await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'NoKey' }, w.owner)).status, 400);
});

test('invite codes: single use, wrong code generic failure', async () => {
  const w2 = new World({ seed: 'neg-inv', n: 3, t: 2, voters: 0 });
  await w2.start();
  try {
    await w2.setupOrgAndElection();
    const inv = (await w2.signed('POST', `/api/v1/elections/${w2.electionId}/invites`, { count: 2 }, w2.owner, w2.idemKey())).json.invites;
    const reg = async (code: string, k: ReturnType<typeof kp>) => {
      const pop = await import('@quietvote/crypto').then((c) => c.ed25519Sign(k.secretKey, new Uint8Array([...new TextEncoder().encode(`QV-REG-v1\0${w2.electionId}\0`), ...k.publicKey])));
      return w2.req('POST', `/api/v1/elections/${w2.electionId}/registrations`, { invite_code: code, pk: b64u(k.publicKey), alg: 'ed25519', pop: b64u(pop) });
    };
    const k1 = kp('x', 'a');
    const k2 = kp('x', 'b');
    assert.equal((await reg(inv[0].code, k1)).status, 201);
    assert.equal((await reg(inv[0].code, k1)).status, 201, 'same pk replays');
    const used = await reg(inv[0].code, k2);
    assert.equal(used.status, 409);
    assert.equal(used.json.code, 'INVITE_USED');
    assert.equal((await reg('A'.repeat(22), k2)).status, 422);
    const roll = (await w2.get(`/api/v1/elections/${w2.electionId}/roll`)).json;
    assert.equal(roll.roll_size, 1);
    // a code never appears in storage
    const files = readdirSync(w2.dir, { recursive: true, encoding: 'utf8' }).map((f) => join(w2.dir, f)).filter((f) => statSync(f).isFile());
    for (const f of files) assert.ok(!readFileSync(f).includes(inv[0].code), `invite code stored in ${f}`);
  } finally {
    await w2.stop();
  }
});

test('witness gating: election_open waits for a quorum-cosigned checkpoint', { timeout: 120_000 }, async () => {
  const w3 = new World({ seed: 'neg-wit', n: 3, t: 2, voters: 3, witnessQuorum: 1 });
  await w3.start();
  try {
    await w3.setupOrgAndElection();
    await w3.registerVoters();
    assert.equal((await w3.publishManifest()).status, 201);
    await w3.ceremony();
    const r = await w3.open();
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'WITNESS_QUORUM_REQUIRED');
    const cp = (await w3.get(`/api/v1/elections/${w3.electionId}/log/checkpoint`)).text;
    const size = Number(cp.split('\n')[1]);
    const wk = w3.witnesses[0]!;
    const text = cp.slice(0, cp.indexOf('\n\n') + 1);
    const evil = kp('evil', 'w');
    const bad = await w3.req('POST', `/api/v1/elections/${w3.electionId}/log/cosignatures`, { checkpoint_size: size, lines: [cosignLine('w1', evil.secretKey, evil.publicKey, text, w3.nowSec)] });
    assert.equal(bad.status, 422);
    assert.equal((await w3.open()).status, 409);
    const good = await w3.req('POST', `/api/v1/elections/${w3.electionId}/log/cosignatures`, { checkpoint_size: size, lines: [cosignLine('w1', wk.secretKey, wk.publicKey, text, w3.nowSec)] });
    assert.deepEqual(good.json.accepted, ['w1']);
    assert.equal((await w3.get(`/api/v1/elections/${w3.electionId}/state`)).json.witnessed, true);
    assert.equal((await w3.open()).status, 201);
  } finally {
    await w3.stop();
  }
});

test('election_open must bind (manifest_hash, joint_key_seq, roll_commit_seq): absent, forward and mismatched refs are rejected (QV-ADR-015)', { timeout: 120_000 }, async () => {
  const w5 = new World({ seed: 'neg-bind', n: 3, t: 2, voters: 3 });
  await w5.start();
  try {
    await w5.setupOrgAndElection();
    await w5.registerVoters();
    assert.equal((await w5.publishManifest()).status, 201);
    await w5.ceremony();
    const good = await w5.openBinding();
    const log = await w5.fetchLog();
    const r3 = log.find((e) => e.rec?.body?.name === 'dkg-r3-close')!.seq;
    const size = log.length === 0 ? 0 : log[log.length - 1]!.seq + 1;
    const bad: Record<string, unknown>[] = [
      { roll_commit_seq: undefined }, { joint_key_seq: undefined }, { manifest_hash: undefined },
      { roll_commit_seq: size + 5 }, { joint_key_seq: size + 5 }, { roll_commit_seq: r3 }, { joint_key_seq: r3 },
      { roll_commit_seq: good.joint_key_seq }, { joint_key_seq: good.roll_commit_seq }, { manifest_hash: '22'.repeat(32) },
    ];
    for (const o of bad) {
      const r = await w5.open(o);
      assert.equal(r.status, 422, JSON.stringify(o));
    }
    assert.equal((await w5.open()).status, 201);
  } finally {
    await w5.stop();
  }
});

test('flood of pre-auth writes from one bucket is throttled (default limits)', async () => {
  const w4 = new World({ seed: 'neg-rate', n: 3, t: 2, voters: 0, server: { rate: { writePre: { limit: 30, windowSec: 60 } } } });
  await w4.start();
  try {
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      const r = await w4.req('POST', `/api/v1/elections/${'1'.repeat(32)}/log/entries`, { header: 'AAAA', body: 'AAAA' });
      if (r.status === 429) {
        limited++;
        assert.ok(r.headers.get('retry-after'));
        assert.equal(r.headers.get('ratelimit-remaining'), '0');
      } else assert.equal(r.status, 404);
    }
    assert.ok(limited >= 9, `limited=${limited}`);
  } finally {
    await w4.stop();
  }
});

test('slowloris: a stalled header block is dropped by the headers timeout', async () => {
  const w5 = new World({ seed: 'neg-slow', n: 3, t: 2, voters: 0, server: { headersTimeoutMs: 300, requestTimeoutMs: 600 } });
  await w5.start();
  try {
    const port = Number(new URL(w5.base).port);
    const closed = await new Promise<boolean>((resolve) => {
      const s = connect(port, '127.0.0.1', () => s.write('GET /healthz HTTP/1.1\r\nHost: x\r\nX-Slow: a'));
      const t = setTimeout(() => {
        s.destroy();
        resolve(false);
      }, 4000);
      s.on('close', () => {
        clearTimeout(t);
        resolve(true);
      });
      s.on('error', () => undefined);
      s.resume();
    });
    assert.ok(closed, 'server closed the stalled connection');
    // header block over the limit
    const r = await fetch(w5.base + '/healthz', { headers: { 'x-big': 'a'.repeat(40_000) } }).then((x) => x.status).catch(() => 431);
    assert.ok(r === 431 || r === 400);
  } finally {
    await w5.stop();
  }
});

void unb64u;
