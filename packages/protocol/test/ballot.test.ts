import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseMul, bytesToHex, cdsProve, constantRng, ctSum, ed25519Sign, elgamalEncrypt, hexToBytes, jcs, limitProve, pointAdd,
  pointToBytes, scalarAdd, scalarRandomNonZero, scalarToBytes, streamRng, utf8, ORDER, hsNz, type Scalar, type Ciphertext,
} from '@quietvote/crypto';
import {
  PROTO_ID, ballotCode, binderFor, buildBallot, castDigest, encryptBallot, makeCast, makeSpoil, selectionBits,
  verifyEnvelope, verifySpoilReveal, voterNonceKey, NO_SUPERSEDES, spoilDigest, revealDigest,
  type BallotBody, type CastEnvelope, type ElectionParams, type SpoilEnvelope,
} from '../src/index.ts';
import { clone, defaultContests, setup, type Sim } from './helpers/sim.ts';

const H = bytesToHex;
let sim: Sim;
let p: ElectionParams;
let roll: Set<string>;

const contests = defaultContests().filter((c) => c.id !== 'chair');
const SEL = { budget: ['yes'], topics: ['a', 'c'], board: ['q'] };

async function init(): Promise<void> {
  if (sim !== undefined) return;
  sim = await setup({ seed: 'ballot-tests', n: 3, t: 2, voters: 4, contests });
  p = sim.params!;
  roll = new Set(sim.rollHex);
}

function build(voter = 0, sel: Record<string, string[]> = SEL, sup = NO_SUPERSEDES, rng = streamRng(`b${voter}`)) {
  const v = sim.voters[voter]!;
  const r = buildBallot(p, v.secretKey, v.publicKey, sup, sel, rng);
  assert.ok(r.ok, JSON.stringify(r));
  return { v, b: r.value, env: makeCast(p, v.secretKey, r.value) };
}

/** Mutate the body, then re-sign as the voter so only content checks can fail. */
function resign(voter: number, env: CastEnvelope, mutate: (b: BallotBody) => void, ctx = p.ctx): CastEnvelope {
  const body = clone(env.body);
  mutate(body);
  const code = ballotCode(ctx, body);
  return { intent: 'cast', body, sig: H(ed25519Sign(sim.voters[voter]!.secretKey, castDigest(ctx, code))) };
}
const errOf = (e: unknown, rollSet = roll, pp = p): string => {
  const r = verifyEnvelope(pp, rollSet, e);
  return r.ok ? 'OK' : r.error;
};

test('valid cast verifies; code and signature bound', async () => {
  await init();
  const { env, b } = build();
  const r = verifyEnvelope(p, roll, env);
  assert.ok(r.ok);
  if (r.ok) assert.equal(H(r.value.code), H(b.code));
});

test('selection rules: overvote / unknown / duplicate cannot be encoded', async () => {
  await init();
  const c = contests.find((x) => x.id === 'board')!;
  assert.ok(!selectionBits(c, ['p', 'q', 'r']).ok);
  assert.ok(!selectionBits(c, ['zz']).ok);
  assert.ok(!selectionBits(c, ['p', 'p']).ok);
  const bits = selectionBits(c, ['q']);
  assert.ok(bits.ok);
  if (bits.ok) assert.deepEqual(bits.value, [0, 1, 0, 0, 0, 1, 0]); // 5 real + 2 placeholders, one placeholder set
  const yn = contests[0]!;
  const blank = selectionBits(yn, []);
  assert.ok(blank.ok);
  if (blank.ok) assert.deepEqual(blank.value, [0, 0, 1]);
});

test('encryption is a deterministic function of xi (Benaloh recompute)', async () => {
  await init();
  const { b, v } = build();
  const again = encryptBallot(p, v.publicKey, NO_SUPERSEDES, SEL, b.xi);
  assert.ok(again.ok);
  if (again.ok) assert.equal(H(jcs(again.value)), H(jcs(b.body)));
});

test('REQ-013 hedging: constant RNG -> identical ballot for identical plaintext, independent randomness for different plaintext', async () => {
  await init();
  const v = sim.voters[0]!;
  const mk = (sel: Record<string, string[]>) => {
    const r = buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, sel, constantRng(0));
    assert.ok(r.ok);
    return r.ok ? r.value : (undefined as never);
  };
  const a1 = mk(SEL);
  const a2 = mk(SEL);
  assert.equal(H(jcs(a1.body)), H(jcs(a2.body)));
  const o = mk({ ...SEL, budget: ['no'] });
  const alphas = (b: BallotBody): string[] => b.contests.flatMap((c) => [...c.sel, ...(c.ph ?? [])].map((s) => s.a));
  const A = alphas(a1.body);
  const B = alphas(o.body);
  for (let i = 0; i < A.length; i++) assert.notEqual(A[i], B[i], 'randomness reused across different plaintexts');
  // fresh attempt counter also changes xi
  const r3 = buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, SEL, constantRng(0), 1);
  assert.ok(r3.ok && r3.value.code.toString() !== a1.code.toString());
  assert.notEqual(H(voterNonceKey(v.secretKey)), H(voterNonceKey(sim.voters[1]!.secretKey)));
});

test('per-field tamper matrix with re-signing: expected error codes', async () => {
  await init();
  const { env } = build();
  const flipHex = (h: string): string => (h[0] === '0' ? '1' : '0') + h.slice(1);
  const G_HEX = H(pointToBytes(baseMul(1n)));
  const cases: [string, (b: BallotBody) => void, string][] = [
    ['alpha replaced by another valid point', (b) => (b.contests[0]!.sel[0]!.a = G_HEX), 'E_CDS'],
    ['beta shifted by G', (b) => (b.contests[0]!.sel[0]!.b = H(pointToBytes(pointAdd(baseMul(5n), baseMul(1n))))), 'E_CDS'],
    ['c0 +1', (b) => (b.contests[0]!.sel[0]!.c0 = H(scalarToBytes((BigInt('0x' + H(hexToBytes(b.contests[0]!.sel[0]!.c0).reverse())) + 1n) % ORDER))), 'E_CDS'],
    ['s1 replaced', (b) => (b.contests[0]!.sel[1]!.s1 = H(scalarToBytes(12345n))), 'E_CDS'],
    ['alpha = identity', (b) => (b.contests[0]!.sel[0]!.a = '00'.repeat(32)), 'E_IDENTITY'],
    ['beta = identity', (b) => (b.contests[1]!.sel[0]!.b = '00'.repeat(32)), 'E_IDENTITY'],
    ['alpha non-canonical point', (b) => (b.contests[0]!.sel[0]!.a = 'ff'.repeat(32)), 'E_POINT_DECODE'],
    ['alpha = non-square encoding', (b) => (b.contests[0]!.sel[0]!.a = '26948d35ca62e643e26a83177332e6b6afeb9d08e4268b650f1f5bbd8d81d371'), 'E_POINT_DECODE'],
    ['scalar = l', (b) => (b.contests[0]!.sel[0]!.c1 = 'edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010'), 'E_SCALAR_RANGE'],
    ['scalar = 2^256-1', (b) => (b.contests[0]!.sel[0]!.s0 = 'ff'.repeat(32)), 'E_SCALAR_RANGE'],
    ['limit proof c flipped', (b) => (b.contests[2]!.lim!.c = flipHex(b.contests[2]!.lim!.c)), 'E_LIMIT_PROOF'],
    ['limit proof s = l', (b) => (b.contests[2]!.lim!.s = 'edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010'), 'E_SCALAR_RANGE'],
    ['missing contest', (b) => b.contests.pop(), 'E_STRUCTURE'],
    ['contest order swapped', (b) => b.contests.reverse(), 'E_STRUCTURE'],
    ['options swapped', (b) => b.contests[0]!.sel.reverse(), 'E_STRUCTURE'],
    ['placeholder dropped', (b) => b.contests[2]!.ph!.pop(), 'E_STRUCTURE'],
    ['limit proof removed', (b) => delete b.contests[2]!.lim, 'E_STRUCTURE'],
    ['placeholders added to approval', (b) => (b.contests[1]!.ph = clone(b.contests[2]!.ph!)), 'E_STRUCTURE'],
    ['placeholder renamed', (b) => (b.contests[2]!.ph![0]!.opt = '~ph9'), 'E_STRUCTURE'],
  ];
  for (const [name, mut, code] of cases) assert.equal(errOf(resign(0, env, mut)), code, name);
});

test('envelope-level failures', async () => {
  await init();
  const { env } = build();
  const e1 = clone(env);
  e1.sig = '00' + e1.sig.slice(2);
  assert.equal(errOf(e1), 'E_SIG');
  const e2 = clone(env);
  e2.body.supersedes = '11'.repeat(32);
  assert.equal(errOf(e2), 'E_SIG', 'body altered after signing');
  const e3 = clone(env);
  e3.body.ctx = '22'.repeat(32);
  assert.equal(errOf(e3), 'E_CTX');
  assert.equal(errOf(env, new Set(sim.rollHex.slice(1))), 'E_VOTER_NOT_ELIGIBLE');
  const e4 = clone(env) as unknown as { body: { proto: string } };
  e4.body.proto = 'qv2-x';
  assert.equal(errOf(e4), 'E_VERSION');
  const e5 = { ...clone(env), extra: 1 };
  assert.equal(errOf(e5), 'E_SCHEMA');
  const e6 = clone(env);
  e6.sig = e6.sig.toUpperCase();
  assert.equal(errOf(e6), 'E_SCHEMA');
  const e7 = clone(env);
  e7.body.voter = e7.body.voter.toUpperCase();
  assert.equal(errOf(e7), 'E_SCHEMA');
  assert.equal(errOf({ intent: 'nope' }), 'E_SCHEMA');
  assert.equal(errOf(null), 'E_SCHEMA');
  // signature of s >= l (malleated)
  const sig = hexToBytes(env.sig);
  let S = 0n;
  for (let i = 63; i >= 32; i--) S = (S << 8n) | BigInt(sig[i]!);
  S += ORDER;
  const mall = sig.slice();
  for (let i = 32; i < 64; i++, S >>= 8n) mall[i] = Number(S & 255n);
  assert.equal(errOf({ ...clone(env), sig: H(mall) }), 'E_SIG');
});

test('ballot copy: Alice\'s ciphertexts and proofs re-signed by Bob fail (binder), re-randomised copy fails', async () => {
  await init();
  const alice = build(0);
  const copy = resign(1, alice.env, (b) => (b.voter = H(sim.voters[1]!.publicKey)));
  assert.equal(errOf(copy), 'E_CDS');
  // homomorphic re-randomisation of one ciphertext with proofs unchanged
  const rr = resign(0, alice.env, (b) => {
    const s = b.contests[0]!.sel[0]!;
    s.a = H(pointToBytes(pointAdd(hexPoint(s.a), baseMul(7n))));
    s.b = H(pointToBytes(pointAdd(hexPoint(s.b), pointAdd(p.K, p.K))));
  });
  assert.equal(errOf(rr), 'E_CDS');
});
import { pointFromBytes } from '@quietvote/crypto';
const hexPoint = (h: string) => pointFromBytes(hexToBytes(h));

test('cross-election replay: rejected by ctx; rewriting ctx breaks every proof', async () => {
  await init();
  const sim2 = await setup({ seed: 'ballot-tests-other', n: 3, t: 2, voters: 2, contests });
  const alice = build(0);
  const roll2 = new Set([...sim2.rollHex, ...sim.rollHex]);
  assert.equal(errOf(alice.env, roll2, sim2.params!), 'E_CTX');
  const rewritten = resign(0, alice.env, (b) => (b.ctx = H(sim2.params!.ctx)), sim2.params!.ctx);
  assert.equal(errOf(rewritten, roll2, sim2.params!), 'E_CDS');
});

/** Honest-but-invalid constructions: the prover is given a witness for a false statement. */
function forge(bits: (0 | 1 | 2)[], contestIdx: number, sup = NO_SUPERSEDES, voter = 0): CastEnvelope {
  const good = build(voter, SEL, sup);
  const body = clone(good.b.body);
  const c = contests[contestIdx]!;
  const bc = body.contests[contestIdx]!;
  const xi = new Uint8Array(64).fill(5);
  const binder = binderFor(p.ctx, sim.voters[voter]!.publicKey);
  const slots = [...bc.sel, ...(bc.ph ?? [])];
  const cts: Ciphertext[] = [];
  const rs: Scalar[] = [];
  slots.forEach((s, k) => {
    const m = bits[k]!;
    const r = hsNz('enc-nonce', xi, utf8(c.id), utf8(s.opt));
    const ct = elgamalEncrypt(p.K, m, r);
    // choose the "closest" honest branch; for m=2 the proof is necessarily invalid
    const pr = cdsProve({ ctx: p.ctx, binder, cid: c.id, oid: s.opt, K: p.K, ct }, (m === 2 ? 1 : m) as 0 | 1, r, xi);
    s.a = H(pointToBytes(ct.A)); s.b = H(pointToBytes(ct.B));
    s.c0 = H(scalarToBytes(pr.c0)); s.s0 = H(scalarToBytes(pr.s0)); s.c1 = H(scalarToBytes(pr.c1)); s.s1 = H(scalarToBytes(pr.s1));
    cts.push(ct); rs.push(r);
  });
  if (bc.lim !== undefined) {
    const sum = ctSum(cts);
    const R = rs.reduce((a, b) => scalarAdd(a, b), 0n);
    const lp = limitProve({ ctx: p.ctx, binder, cid: c.id, L: c.selection_limit!, K: p.K, Asum: sum.A, Bsum: sum.B }, R, xi);
    bc.lim = { c: H(scalarToBytes(lp.c)), s: H(scalarToBytes(lp.s)) };
  }
  const code = ballotCode(p.ctx, body);
  return { intent: 'cast', body, sig: H(ed25519Sign(sim.voters[voter]!.secretKey, castDigest(p.ctx, code))) };
}

test('invalid plaintexts are rejected: 2 in a bit, overvote beyond the limit, wrong placeholder sum', async () => {
  await init();
  // sanity: forge() with honest bits verifies
  assert.equal(errOf(forge([1, 0, 0], 0)), 'OK');
  // plaintext 2 (yes = 2): CDS fails
  assert.equal(errOf(forge([2, 0, 0], 0)), 'E_CDS');
  // overvote on budget: yes + no both set (sum 2 with placeholder 0): CDS holds, limit proof fails
  assert.equal(errOf(forge([1, 1, 0], 0)), 'E_LIMIT_PROOF');
  // board k=2 with 3 real selected and no placeholder: sum 3 != 2
  assert.equal(errOf(forge([1, 1, 1, 0, 0, 0, 0], 2)), 'E_LIMIT_PROOF');
  // undervote not absorbed by placeholders: sum 1 != 2
  assert.equal(errOf(forge([1, 0, 0, 0, 0, 0, 0], 2)), 'E_LIMIT_PROOF');
  // all-zero budget (sum 0 != 1)
  assert.equal(errOf(forge([0, 0, 0], 0)), 'E_LIMIT_PROOF');
});

test('Benaloh: spoil with published reveal reproduces; mismatched reveal fails; modes', async () => {
  await init();
  const { b, v } = build(2);
  const pub: SpoilEnvelope = makeSpoil(p, v.secretKey, b, 'publish');
  const r = verifyEnvelope(p, roll, pub);
  assert.ok(r.ok);
  assert.ok(verifySpoilReveal(p, pub.body, pub.reveal!).ok);
  // wrong selections
  const wrong = clone(pub.reveal!);
  wrong.selections = { ...wrong.selections, budget: ['no'] };
  const w = verifySpoilReveal(p, pub.body, wrong);
  assert.ok(!w.ok && w.error === 'E_SPOIL_MISMATCH');
  // wrong xi
  const wx = { ...pub.reveal!, xi: H(new Uint8Array(64).fill(1)) };
  assert.ok(!verifySpoilReveal(p, pub.body, wx).ok);
  // reveal not matching signed digest
  const tampered = clone(pub);
  tampered.reveal = wrong;
  assert.equal(errOf(tampered), 'E_SPOIL_MISMATCH');
  // private audit: digest signed, no reveal published; trustee mode: zero digest
  const priv = makeSpoil(p, v.secretKey, b, 'private');
  assert.ok(verifyEnvelope(p, roll, priv).ok);
  assert.notEqual(priv.reveal_digest, '00'.repeat(32));
  assert.equal(priv.reveal_digest, H(revealDigest(p.ctx, { xi: H(b.xi), selections: b.selections })));
  const tr = makeSpoil(p, v.secretKey, b, 'trustees');
  assert.equal(tr.reveal_digest, '00'.repeat(32));
  assert.ok(verifyEnvelope(p, roll, tr).ok);
  // a spoil signature can never be presented as a cast (different label) and vice versa
  const asCast = { intent: 'cast', body: pub.body, sig: pub.sig };
  assert.equal(errOf(asCast), 'E_SIG');
  const asSpoil = { intent: 'spoil', body: b.body, reveal_digest: '00'.repeat(32), sig: makeCast(p, v.secretKey, b).sig };
  assert.equal(errOf(asSpoil), 'E_SIG');
  assert.notEqual(H(spoilDigest(p.ctx, b.code, new Uint8Array(32))), H(castDigest(p.ctx, b.code)));
});

test('property: random valid selections always verify; random single-field corruption never does', async () => {
  await init();
  const r = streamRng('prop-ballot');
  const pick = (c: (typeof contests)[number]): string[] => {
    const L = c.selection_limit ?? c.options.length;
    const k = r.bytes(1)[0]! % (L + 1);
    const ids = c.options.map((o) => o.id).sort(() => (r.bytes(1)[0]! % 2 === 0 ? -1 : 1));
    return ids.slice(0, k);
  };
  for (let i = 0; i < 6; i++) {
    const sel = Object.fromEntries(contests.map((c) => [c.id, pick(c)]));
    const { env } = build(i % 4, sel, NO_SUPERSEDES, streamRng(`pb${i}`));
    assert.equal(errOf(env), 'OK');
    // corrupt one random proof scalar or point byte and re-sign
    const bad = resign(i % 4, env, (b) => {
      const flat = b.contests.flatMap((c) => [...c.sel, ...(c.ph ?? [])]);
      const s = flat[r.bytes(1)[0]! % flat.length]!;
      const f = (['c0', 's0', 'c1', 's1'] as const)[r.bytes(1)[0]! % 4]!;
      s[f] = H(scalarToBytes(scalarAdd(BigInt('0x' + H(hexToBytes(s[f]).reverse())), scalarRandomNonZero(r))));
    });
    assert.notEqual(errOf(bad), 'OK');
  }
});
void PROTO_ID;
