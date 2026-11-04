// Trustees-mode spoil shares in the web client (QV-ADR-020): local verification of every trustee share, threshold decoding,
// forged/cast-code refusal and the exact POST contract of packages/server (POST/GET /elections/:id/spoil-shares).
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { PROTO_ID, ballotCode, check, shareToHex, signRecord, spoilShareRecordSchema, trusteeDecryptSpoiled, type SpoilShareBody } from '@quietvote/protocol';
import { ApiClient, type FetchLike } from '../src/api/client.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import {
  checkSpoilShare, deriveSpoilTargets, loadSpoilStatuses, parseShareInput, statusFor, submitShares, type SpoilTargets,
} from '../src/flow/spoil-shares.ts';
import { castBallot, closeElection, setup, spoilBallot, trusteeKeyFor, type Sim } from '../../protocol/test/helpers/sim.ts';
import { FakeBoard, TEST_CONTESTS } from './helpers/fake-board.ts';

const H = bytesToHex;
const SPOILED = { budget: ['yes'], board: ['p', 'r'] };
let sim: Sim;
let board: FakeBoard;
let tg: SpoilTargets;
let code: string;
let castCode: string;
let revealCode: string;

/** What `qv-trustee spoil-release` emits for one trustee and one code (same body, same signature scope). */
function release(j: number, c: string, mutate?: (b: SpoilShareBody) => void, signer = j): { body: SpoilShareBody; sig: unknown } {
  const spoil = tg.spoils.get(c) ?? [...tg.spoils.values()][0]!;
  const r = trusteeDecryptSpoiled(sim.params!, trusteeKeyFor(sim, j), { ...spoil, code: c }, streamRng(`rel${j}${c}`));
  if (!r.ok) throw new Error(r.error);
  const shares: SpoilShareBody['shares'] = [];
  for (const [k, sp] of r.value) {
    const [contest, opt] = k.split('/') as [string, string];
    const x = shareToHex(j, sp);
    shares.push({ contest, opt, M: x.M, c: x.c, s: x.s });
  }
  const body: SpoilShareBody = { proto: PROTO_ID, type: 'spoil-share', ctx: H(sim.params!.ctx), j, code: c, spoil_seq: spoil.seq, shares };
  mutate?.(body);
  const kp = sim.trusteeKeys[signer - 1]!;
  return signRecord(kp.secretKey, kp.publicKey, sim.params!.ctx, body) as { body: SpoilShareBody; sig: unknown };
}

before(async () => {
  sim = await setup({ seed: 'web-spoil', n: 3, t: 2, voters: 4, contests: TEST_CONTESTS()!, minCounted: 3, spoilTrustees: true });
  castCode = H(castBallot(sim, 0, { budget: ['no'], board: ['q'] }).built.code);
  const sp = spoilBallot(sim, 1, SPOILED, 'trustees');
  code = H(ballotCode(sim.params!.ctx, sp.env.body));
  revealCode = H(ballotCode(sim.params!.ctx, spoilBallot(sim, 2, { budget: ['no'], board: ['q'] }, 'publish').env.body));
  closeElection(sim);
  board = new FakeBoard(sim);
  const api = new ApiClient({ fetch: board.fetch, sleep: async () => undefined });
  const all = await api.allEntries(board.apiId);
  const recs = all.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
  const c = await deriveElectionContext(recs);
  assert.ok(c.ok, c.ok ? "" : c.detail);
  const t = deriveSpoilTargets(c.value, recs, sim.rollHex);
  assert.ok(t.ok);
  tg = t.value;
}, { timeout: 300_000 });

/** The board plus the QV-ADR-020 endpoints, as packages/server serves them. */
function server(): { fetch: FetchLike; posts: { url: string; method: string; body: string; contentType: string }[]; gets: string[]; stored: Map<string, unknown[]>; failWith: { status: number; code: string; reason?: string } | undefined } {
  const stored = new Map<string, unknown[]>();
  const st = { posts: [] as { url: string; method: string; body: string; contentType: string }[], gets: [] as string[], stored, failWith: undefined as { status: number; code: string; reason?: string } | undefined };
  const fetchLike: FetchLike = async (input, init) => {
    const url = new URL(input, 'http://board.test');
    const base = `/api/v1/elections/${board.apiId}/spoil-shares`;
    if (url.pathname !== base) return board.fetch(input, init);
    const json = (status: number, v: unknown): Response => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' } });
    if ((init?.method ?? 'GET') === 'POST') {
      const headers = new Headers(init?.headers);
      st.posts.push({ url: input, method: 'POST', body: String(init?.body), contentType: headers.get('Content-Type') ?? '' });
      if (st.failWith) return json(st.failWith.status, { code: st.failWith.code, reason: st.failWith.reason, detail: 'x', status: st.failWith.status });
      const rec = JSON.parse(String(init?.body)) as { body: SpoilShareBody };
      assert.equal(check(spoilShareRecordSchema, rec), null); // server parse: addSpoilShare -> check(spoilShareRecordSchema, raw)
      const list = st.stored.get(rec.body.code) ?? [];
      const dup = list.some((x) => JSON.stringify(x) === String(init?.body));
      if (!dup) st.stored.set(rec.body.code, [...list, rec]);
      return json(dup ? 200 : 201, { status: dup ? 'duplicate' : 'accepted', j: rec.body.j, code: rec.body.code });
    }
    st.gets.push(input);
    const q = url.searchParams.get('code');
    if (q === null) return json(200, { items: [...st.stored].map(([c, l]) => ({ code: c, trustees: l.map((x) => (x as { body: SpoilShareBody }).body.j) })) });
    return json(200, { code: q, items: (st.stored.get(q) ?? []).map((r) => ({ j: (r as { body: SpoilShareBody }).body.j, spoil_seq: (r as { body: SpoilShareBody }).body.spoil_seq, record: r })) });
  };
  return Object.assign(st, { fetch: fetchLike });
}
const clientFor = (s: { fetch: FetchLike }): ApiClient => new ApiClient({ fetch: s.fetch, sleep: async () => undefined });

test('targets: only the verified trustees-mode spoil is decryptable; cast and reveal-mode codes are not', () => {
  assert.deepEqual([...tg.spoils.keys()], [code]);
  assert.ok(tg.castCodes.has(castCode));
  assert.ok(tg.refused.has(revealCode));
  assert.deepEqual([...tg.ctx.decrypters].sort(), [1, 2, 3]);
});

test('targets: refused when the manifest does not enable trustee decryption', () => {
  const off = deriveSpoilTargets({ ...tg.ctx, manifest: { ...tg.ctx.manifest, spoil_trustee_decrypt: false } }, [], sim.rollHex);
  assert.deepEqual(off, { ok: false, reason: 'not-enabled' });
  const open = deriveSpoilTargets({ ...tg.ctx, closeSeq: undefined as never }, [], sim.rollHex);
  assert.deepEqual(open, { ok: false, reason: 'not-closed' });
});

test('below threshold: waiting (n of t); at threshold: decoded to the exact spoiled selections', () => {
  assert.deepEqual(statusFor(tg, code, []), { kind: 'waiting', code, valid: [], need: 2 });
  assert.deepEqual(statusFor(tg, code, [release(3, code)]), { kind: 'waiting', code, valid: [3], need: 2 });
  const s = statusFor(tg, code, [release(3, code), release(1, code)]);
  assert.equal(s.kind, 'decoded');
  if (s.kind === 'decoded') {
    assert.deepEqual(s.selections, SPOILED);
    assert.deepEqual(s.valid, [1, 3]);
  }
  // a repeat of the same trustee never counts twice
  assert.equal(statusFor(tg, code, [release(2, code), release(2, code)]).kind, 'waiting');
});

test('forged or tampered shares are rejected with a reason and are not counted', () => {
  const swapped = release(1, code, (b) => { const x = b.shares[0]!; [x.c, x.s] = [x.s, x.c]; });
  const swappedM = release(1, code, (b) => { [b.shares[0]!.M, b.shares[1]!.M] = [b.shares[1]!.M, b.shares[0]!.M]; });
  const wrongSigner = release(1, code, undefined, 2);
  const badCtx = release(1, code, (b) => { b.ctx = '11'.repeat(32); });
  const missing = release(1, code, (b) => { b.shares.pop(); });
  const wrongSeq = release(1, code, (b) => { b.spoil_seq += 1; });
  const outOfRange = release(1, code, (b) => { b.j = 9; });
  const tamperedAfterSigning = (() => { const r = release(1, code); r.body.shares[0]!.M = release(2, code).body.shares[0]!.M; return r; })();
  const expect = (rec: unknown, reason: string): void => {
    const r = checkSpoilShare(tg, rec);
    assert.equal(r.ok, false);
    assert.equal(r.ok ? '' : r.reason, reason);
  };
  expect(swapped, 'proof');
  expect(swappedM, 'proof');
  expect(wrongSigner, 'bad-signature');
  expect(badCtx, 'wrong-election');
  expect(missing, 'incomplete');
  expect(wrongSeq, 'wrong-spoil');
  expect(outOfRange, 'wrong-election');
  expect(tamperedAfterSigning, 'bad-signature');
  expect(release(1, code, (b) => { b.shares[1] = b.shares[0]!; }), 'undecodable');
  expect(null, 'schema');
  expect({ body: { code: 'zz' } }, 'schema');
  // one honest + one forged: below threshold, status names the bad trustee, the forged share is not counted
  const s = statusFor(tg, code, [release(3, code), swapped]);
  assert.equal(s.kind, 'invalid-share');
  if (s.kind === 'invalid-share') {
    assert.deepEqual(s.valid, [3]);
    assert.deepEqual(s.invalid, [{ j: 1, reason: 'proof' }]);
  }
  // a forged first record from trustee 1 does not mask trustee 1's honest record, and t honest shares still decode
  const d = statusFor(tg, code, [swapped, release(1, code), release(2, code)]);
  assert.equal(d.kind, 'decoded');
  if (d.kind === 'decoded') assert.deepEqual(d.selections, SPOILED);
});

test('a share for a cast (or reveal-mode, or unknown) code is refused locally', () => {
  // validly signed by trustee 1 over a cast code
  const cast = release(1, code, (b) => { b.code = castCode; });
  assert.deepEqual(checkSpoilShare(tg, cast), { ok: false, code: castCode, reason: 'cast-code' });
  assert.deepEqual(checkSpoilShare(tg, release(1, code, (b) => { b.code = revealCode; })), { ok: false, code: revealCode, reason: 'not-trustees-mode' });
  assert.deepEqual(checkSpoilShare(tg, release(1, code, (b) => { b.code = 'ab'.repeat(32); })), { ok: false, code: 'ab'.repeat(32), reason: 'unknown-code' });
});

test('ApiClient: GET index and per-code list use the server paths; the server list is verified, never trusted', async () => {
  const s = server();
  const api = clientFor(s);
  assert.deepEqual(await api.getSpoilShares(board.apiId), { items: [] });
  s.stored.set(code, [release(1, code), release(2, code, (b) => { const x = b.shares[0]!; [x.c, x.s] = [x.s, x.c]; })]);
  assert.deepEqual((await api.getSpoilShares(board.apiId)).items, [{ code, trustees: [1, 2] }]);
  const list = await api.getSpoilShares(board.apiId, code);
  assert.equal(list.items.length, 2);
  assert.deepEqual(s.gets, [`/api/v1/elections/${board.apiId}/spoil-shares`, `/api/v1/elections/${board.apiId}/spoil-shares`, `/api/v1/elections/${board.apiId}/spoil-shares?code=${code}`]);
  const [st] = await loadSpoilStatuses(api, board.apiId, tg);
  assert.equal(st!.kind, 'invalid-share'); // the forged record from "trustee 2" does not count even though the server listed it
  assert.deepEqual(st!.valid, [1]);
});

test('submit: verified record is POSTed byte-for-byte as the server contract; replay is a duplicate; threshold then decodes', async () => {
  const s = server();
  const api = clientFor(s);
  const r1 = release(2, code);
  const r2 = release(3, code);
  const out = await submitShares(api, board.apiId, tg, [r1, r2]);
  assert.deepEqual(out, [{ kind: 'accepted', j: 2, code }, { kind: 'accepted', j: 3, code }]);
  assert.equal(s.posts.length, 2);
  const p = s.posts[0]!;
  assert.equal(p.method, 'POST');
  assert.equal(p.url, `/api/v1/elections/${board.apiId}/spoil-shares`);
  assert.match(p.contentType, /^application\/json/);
  assert.equal(p.body, JSON.stringify(r1)); // the body IS the signed record {body, sig}: not wrapped
  assert.deepEqual(Object.keys(JSON.parse(p.body) as object).sort(), ['body', 'sig']);
  assert.equal(check(spoilShareRecordSchema, JSON.parse(p.body)), null);
  assert.deepEqual(await submitShares(api, board.apiId, tg, [r1]), [{ kind: 'duplicate', j: 2, code }]);
  const [st] = await loadSpoilStatuses(api, board.apiId, tg);
  assert.equal(st!.kind, 'decoded');
});

test('submit: forged and cast-code records never reach the network; server refusals are reported with status, code and reason', async () => {
  const s = server();
  const api = clientFor(s);
  const forged = release(1, code, (b) => { const x = b.shares[0]!; [x.c, x.s] = [x.s, x.c]; });
  const cast = release(1, code, (b) => { b.code = castCode; });
  assert.deepEqual(await submitShares(api, board.apiId, tg, [forged, cast, { nope: 1 }]), [
    { kind: 'rejected-local', j: 1, code, reason: 'proof' },
    { kind: 'rejected-local', code: castCode, reason: 'cast-code' },
    { kind: 'rejected-local', reason: 'schema' },
  ]);
  assert.equal(s.posts.length, 0);
  s.failWith = { status: 409, code: 'WRONG_PHASE' };
  assert.deepEqual(await submitShares(api, board.apiId, tg, [release(1, code)]), [{ kind: 'rejected-server', j: 1, code, status: 409, apiCode: 'WRONG_PHASE' }]);
  s.failWith = { status: 422, code: 'ENTRY_INVALID', reason: 'E_DEC_PROOF' };
  assert.deepEqual(await submitShares(api, board.apiId, tg, [release(1, code)]), [{ kind: 'rejected-server', j: 1, code, status: 422, apiCode: 'ENTRY_INVALID', reason: 'E_DEC_PROOF' }]);
});

test('input parsing: a record, an array, a spoil-share ceremony packet; other rounds and junk are unreadable', () => {
  const r = release(1, code);
  const same = (got: unknown[] | undefined, want: unknown[]): void => assert.equal(JSON.stringify(got), JSON.stringify(want));
  same(parseShareInput(JSON.stringify(r)), [r]);
  same(parseShareInput(JSON.stringify([r, r])), [r, r]);
  same(parseShareInput(JSON.stringify({ format: 'qv-ceremony-packet/v1', round: 'spoil-share', from: 1, records: [r] })), [r]);
  assert.equal(parseShareInput(JSON.stringify({ format: 'qv-ceremony-packet/v1', round: 'dkg-shares', from: 1, records: [r] })), undefined);
  assert.equal(parseShareInput('not json'), undefined);
  assert.equal(parseShareInput('[]'), undefined);
  assert.equal(parseShareInput('"x"'), undefined);
});
