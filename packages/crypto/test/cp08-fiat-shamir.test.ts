// CP-08 (docs/audit/crypto-protocol.md §4): crypto-level tests for Fiat-Shamir field omissions.
//
// The existing "change one statement field, expect reject" tests cannot see the omission of a field that ALSO enters the
// verifier's commitment equations (ct.A in cds01, L in cp-limit, Y_j in cp-dec, ...): changing that field changes the
// recomputed commitments, so the challenge differs even when the field itself is not hashed. This file closes that gap
// three ways:
//   1. transcript conformance: recompute every proof's commitments and challenge from the QV-16 §5.4 registry field list
//      with an independent, test-local framing/hash (no production transcript code), and require bit equality;
//   2. adaptive-statement (Frozen-Heart) forgeries: a proof whose statement field is chosen AFTER the challenge, valid for
//      a challenge that omits that field, must be rejected (cds01 alpha, cp-dec / cp-dec-spoil Y_j); plus a compensating
//      change (L+1, B_sigma+G) that keeps the cp-limit commitments identical, so only the hashed (L, B_sigma) reject it;
//   3. hs_nz shape: the counter is the LAST field (QV-16 §5.3), checked against the spec, the prover nonces and the
//      frozen label-registry vectors (read only).
// Every hashed input of every proof type is also mutated one at a time. AI-assisted test work; not an audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  G, ORDER, baseMul, bytesToHex, cdsProve, cdsVerify, constantRng, ctSum, decProve, decVerify, dhProve, dhVerify,
  elgamalDecryptToPoint, elgamalEncrypt, h256, hexToBytes, hs, hsNz, isIdentity, limitProve, limitVerify, pointAdd,
  pointMul, pointSub, pointToBytes, pokProve, pokVerify, scalarAdd, scalarInv, scalarMul, scalarRandomNonZero, scalarSub,
  scalarToBytes, shareKeyProve, shareKeyVerify, spoilDecProve, spoilDecVerify, streamRng, utf8, LABELS,
  type CdsProof, type CdsStatement, type CompactProof, type DecStatement, type LimitStatement, type Point, type Scalar,
  type SpoilDecStatement,
} from '../src/index.ts';

// ------------------------------------------------------------ independent spec model of QV-16 §5.3 (test-local)
const be32 = (n: number): Uint8Array => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const be16 = (n: number): Uint8Array => Uint8Array.of((n >>> 8) & 255, n & 255);
const one = (n: number): Uint8Array => Uint8Array.of(n);
const str = (s: string): Uint8Array => new TextEncoder().encode(s);
const cat = (...xs: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) out.set(x, (o += x.length) - x.length);
  return out;
};
const lpS = (x: Uint8Array): Uint8Array => cat(be32(x.length), x);
/** FRAME(L; f_1..f_m) = lp("QV1-HASH") || lp(suite) || lp(L) || u32(m) || lp(f_1) || ... || lp(f_m) */
const specFrame = (label: string, fields: Uint8Array[]): Uint8Array =>
  cat(lpS(str('QV1-HASH')), lpS(str('qv1-r255-sha2')), lpS(str(label)), be32(fields.length), ...fields.map(lpS));
const leInt = (b: Uint8Array): bigint => b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n);
/** hs(L; f...) = LE_int(SHA-512(frame)) mod l */
const specHs = (label: string, ...f: Uint8Array[]): Scalar => leInt(sha512(specFrame(label, f))) % ORDER;
/** hs_nz(L; f...) = first non-zero of hs(L; f..., u32(0)), hs(L; f..., u32(1)), ... (counter LAST) */
const specHsNz = (label: string, ...f: Uint8Array[]): Scalar => {
  for (let c = 0; c < 256; c++) {
    const s = specHs(label, ...f, be32(c));
    if (s !== 0n) return s;
  }
  throw new Error('exhausted');
};
const pt = pointToBytes;
/** Verifier-side commitment recomputation  [s]B1 - [c]X1  (test-local copy of the QV-16 equations). */
const cm = (B1: Point, X1: Point, c: Scalar, s: Scalar): Point => pointSub(pointMul(B1, s), pointMul(X1, c));

// ------------------------------------------------------------ fixtures
const rng = streamRng('cp08-fiat-shamir');
const h = (s: string): Uint8Array => h256('manifest', utf8(s));
const ctx = h('ctx');
const binder = h('binder');
const mh = h('mh');
const code = h('ballot-code');
const x = scalarRandomNonZero(rng);
const K = baseMul(x);
const flip = (b: Uint8Array): Uint8Array => {
  const c = b.slice();
  c[0] = c[0]! ^ 1;
  return c;
};
const bump = (P: Point): Point => pointAdd(P, G);

function cdsFixture(m: 0 | 1): { st: CdsStatement; r: Scalar; xi: Uint8Array; proof: CdsProof } {
  const r = scalarRandomNonZero(rng);
  const st: CdsStatement = { ctx, binder, cid: 'budget', oid: 'yes', K, ct: elgamalEncrypt(K, m, r) };
  const xi = rng.bytes(64);
  return { st, r, xi, proof: cdsProve(st, m, r, xi) };
}
function limitFixture(): { st: LimitStatement; R: Scalar; xi: Uint8Array; proof: CompactProof } {
  const ms = [1, 0, 0] as const;
  const rs = ms.map(() => scalarRandomNonZero(rng));
  const sum = ctSum(ms.map((m, i) => elgamalEncrypt(K, m, rs[i]!)));
  const R = rs.reduce((a, b) => scalarAdd(a, b), 0n);
  const st: LimitStatement = { ctx, binder, cid: 'budget', L: 1, K, Asum: sum.A, Bsum: sum.B };
  const xi = rng.bytes(64);
  return { st, R, xi, proof: limitProve(st, R, xi) };
}
const RAND = 0x5a; // constantRng byte: makes the hedged cp-dec-nonce input known to the test
function decFixture(): { st: DecStatement; sj: Scalar; proof: CompactProof } {
  const sj = scalarRandomNonZero(rng);
  const ct = elgamalEncrypt(K, 3, scalarRandomNonZero(rng));
  const base = { ctx, cid: 'budget', oid: 'yes', j: 2, Yj: baseMul(sj), A: ct.A, B: ct.B };
  const { M, proof } = decProve(base, sj, constantRng(RAND));
  return { st: { ...base, M }, sj, proof };
}
function spoilFixture(): { st: SpoilDecStatement; sj: Scalar; proof: CompactProof } {
  const sj = scalarRandomNonZero(rng);
  const ct = elgamalEncrypt(K, 1, scalarRandomNonZero(rng));
  const base = { ctx, ballotCode: code, cid: 'budget', oid: 'yes', j: 3, Yj: baseMul(sj), alpha: ct.A, beta: ct.B };
  const { M, proof } = spoilDecProve(base, sj, constantRng(RAND));
  return { st: { ...base, M }, sj, proof };
}

// ============================================================ 1. transcript conformance (QV-16 §5.4 registry)

test('CP-08 conformance: cds01 challenge hashes exactly (ctx, binder, cid, oid, K, alpha, beta, a0, b0, a1, b1) [kills M3]', () => {
  for (const m of [0, 1] as const) {
    const { st, proof: p } = cdsFixture(m);
    assert.ok(cdsVerify(st, p));
    const a0 = cm(G, st.ct.A, p.c0, p.s0);
    const b0 = cm(K, st.ct.B, p.c0, p.s0);
    const a1 = cm(G, st.ct.A, p.c1, p.s1);
    const b1 = cm(K, pointSub(st.ct.B, G), p.c1, p.s1);
    const c = specHs('cds01', ctx, binder, str(st.cid), str(st.oid), pt(K), pt(st.ct.A), pt(st.ct.B), pt(a0), pt(b0), pt(a1), pt(b1));
    assert.equal(scalarAdd(p.c0, p.c1), c, `cds01 challenge (m=${m}) differs from the QV-16 registry field list`);
  }
});

test('CP-08 conformance: cp-limit challenge hashes exactly (ctx, binder, cid, u32(L), K, Asum, Bsum, a, b) [kills M7]', () => {
  const { st, proof: p } = limitFixture();
  assert.ok(limitVerify(st, p));
  const a = cm(G, st.Asum, p.c, p.s);
  const b = cm(K, pointSub(st.Bsum, baseMul(BigInt(st.L))), p.c, p.s);
  const c = specHs('cp-limit', ctx, binder, str(st.cid), be32(st.L), pt(K), pt(st.Asum), pt(st.Bsum), pt(a), pt(b));
  assert.equal(p.c, c, 'cp-limit challenge differs from the QV-16 registry field list');
});

test('CP-08 conformance: cp-dec challenge hashes exactly (ctx, cid, oid, u8(j), Yj, A, B, M, a, b) [kills M8]', () => {
  const { st, proof: p } = decFixture();
  assert.ok(decVerify(st, p));
  const a = cm(G, st.Yj, p.c, p.s);
  const b = cm(st.A, st.M, p.c, p.s);
  const c = specHs('cp-dec', ctx, str(st.cid), str(st.oid), one(st.j), pt(st.Yj), pt(st.A), pt(st.B), pt(st.M), pt(a), pt(b));
  assert.equal(p.c, c, 'cp-dec challenge differs from the QV-16 registry field list');
});

test('CP-08 conformance: cp-dec-spoil challenge hashes exactly (ctx, code, cid, oid, u8(j), Yj, alpha, beta, M, a, b)', () => {
  const { st, proof: p } = spoilFixture();
  assert.ok(spoilDecVerify(st, p));
  const a = cm(G, st.Yj, p.c, p.s);
  const b = cm(st.alpha, st.M, p.c, p.s);
  const c = specHs(
    'cp-dec-spoil', ctx, code, str(st.cid), str(st.oid), one(st.j), pt(st.Yj), pt(st.alpha), pt(st.beta), pt(st.M), pt(a), pt(b),
  );
  assert.equal(p.c, c, 'cp-dec-spoil challenge differs from the QV-16 registry field list');
});

test('CP-08 conformance: pok, pok-share and cp-dh challenges hash exactly their QV-16 registry field lists', () => {
  const a = scalarRandomNonZero(rng);
  const A = baseMul(a);
  const p = pokProve(mh, 4, 2, a, A, rng);
  assert.ok(pokVerify(mh, 4, 2, A, p));
  assert.equal(p.c, specHs('pok', mh, one(4), be16(2), pt(A), pt(cm(G, A, p.c, p.s))), 'pok');

  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const q = shareKeyProve(ctx, 5, Yj, sj, rng);
  assert.ok(shareKeyVerify(ctx, 5, Yj, q));
  assert.equal(q.c, specHs('pok-share', ctx, one(5), pt(Yj), pt(cm(G, Yj, q.c, q.s))), 'pok-share');

  const e = scalarRandomNonZero(rng);
  const E = baseMul(e);
  const R = baseMul(scalarRandomNonZero(rng));
  const S = pointMul(R, e);
  const d = dhProve(mh, 1, 2, E, R, S, e, rng);
  assert.ok(dhVerify(mh, 1, 2, E, R, S, d));
  const a1 = cm(G, E, d.c, d.s);
  const a2 = cm(R, S, d.c, d.s);
  assert.equal(d.c, specHs('cp-dh', mh, one(1), one(2), pt(E), pt(R), pt(S), pt(a1), pt(a2)), 'cp-dh');
});

// ============================================================ 2a. adaptive-statement forgeries

test('CP-08 M3: cds01 forgery with alpha chosen after the challenge (challenge omitting alpha) is rejected', () => {
  // Weak Fiat-Shamir: if alpha is not hashed, fix all commitments first, take the challenge, then solve for alpha.
  // Branch 1 is made trivial (c1 = 0); branch 0 absorbs the whole challenge with beta = [b]K.
  const b = scalarRandomNonZero(rng);
  const B = pointMul(K, b);
  const [t0, u0, s1] = [scalarRandomNonZero(rng), scalarRandomNonZero(rng), scalarRandomNonZero(rng)];
  const a0 = baseMul(u0);
  const b0 = pointMul(K, t0);
  const a1 = baseMul(s1);
  const b1 = pointMul(K, s1);
  const cid = 'budget', oid = 'yes';
  const weak = specHs('cds01', ctx, binder, str(cid), str(oid), pt(K), /* alpha omitted */ pt(B), pt(a0), pt(b0), pt(a1), pt(b1));
  const s0 = scalarAdd(t0, scalarMul(weak, b));
  const alpha = scalarMul(scalarSub(s0, u0), scalarInv(weak));
  const st: CdsStatement = { ctx, binder, cid, oid, K, ct: { A: baseMul(alpha), B } };
  const forged: CdsProof = { c0: weak, s0, c1: 0n, s1 };
  // Control: the forgery satisfies every verification equation for the alpha-less challenge.
  assert.ok(cm(G, st.ct.A, forged.c0, forged.s0).equals(a0) && cm(K, B, forged.c0, forged.s0).equals(b0));
  assert.ok(cm(G, st.ct.A, 0n, s1).equals(a1) && cm(K, pointSub(B, G), 0n, s1).equals(b1));
  // ... and the statement is false: the ciphertext encrypts neither 0 nor 1.
  const D = elgamalDecryptToPoint(st.ct, x);
  assert.ok(!isIdentity(D) && !D.equals(G), 'forged ciphertext unexpectedly encrypts a bit');
  assert.equal(cdsVerify(st, forged), false, 'cds01 accepted a proof built for a challenge that omits alpha');
});

test('CP-08 M8: cp-dec forgery with Y_j chosen after the challenge (challenge omitting Y_j) is rejected', () => {
  // False partial decryption M = [mu]A, Y_j solved after the challenge; log_G(Y_j) != mu.
  const ct = elgamalEncrypt(K, 2, scalarRandomNonZero(rng));
  const mu = scalarRandomNonZero(rng);
  const M = pointMul(ct.A, mu);
  const [u, t] = [scalarRandomNonZero(rng), scalarRandomNonZero(rng)];
  const a = baseMul(u);
  const b = pointMul(ct.A, t);
  const weak = specHs('cp-dec', ctx, str('budget'), str('yes'), one(2), /* Yj omitted */ pt(ct.A), pt(ct.B), pt(M), pt(a), pt(b));
  const s = scalarAdd(t, scalarMul(weak, mu));
  const y = scalarMul(scalarSub(s, u), scalarInv(weak));
  const st: DecStatement = { ctx, cid: 'budget', oid: 'yes', j: 2, Yj: baseMul(y), A: ct.A, B: ct.B, M };
  assert.ok(cm(G, st.Yj, weak, s).equals(a) && cm(st.A, M, weak, s).equals(b), 'control: equations hold for the Yj-less challenge');
  assert.ok(!pointMul(ct.A, y).equals(M), 'control: the claimed decryption share is false');
  assert.equal(decVerify(st, { c: weak, s }), false, 'cp-dec accepted a proof built for a challenge that omits Y_j');
});

test('CP-08: cp-dec-spoil forgery with Y_j chosen after the challenge (challenge omitting Y_j) is rejected', () => {
  const ct = elgamalEncrypt(K, 1, scalarRandomNonZero(rng));
  const mu = scalarRandomNonZero(rng);
  const M = pointMul(ct.A, mu);
  const [u, t] = [scalarRandomNonZero(rng), scalarRandomNonZero(rng)];
  const a = baseMul(u);
  const b = pointMul(ct.A, t);
  const weak = specHs(
    'cp-dec-spoil', ctx, code, str('budget'), str('yes'), one(1), /* Yj omitted */ pt(ct.A), pt(ct.B), pt(M), pt(a), pt(b),
  );
  const s = scalarAdd(t, scalarMul(weak, mu));
  const y = scalarMul(scalarSub(s, u), scalarInv(weak));
  const st: SpoilDecStatement = { ctx, ballotCode: code, cid: 'budget', oid: 'yes', j: 1, Yj: baseMul(y), alpha: ct.A, beta: ct.B, M };
  assert.ok(cm(G, st.Yj, weak, s).equals(a) && cm(st.alpha, M, weak, s).equals(b), 'control');
  assert.equal(spoilDecVerify(st, { c: weak, s }), false, 'cp-dec-spoil accepted a proof built for a challenge that omits Y_j');
});

// ============================================================ 2b. compensating change: only the hash binds (L, Bsum)
// Note: this does NOT kill M7 on its own. With only u32(L) omitted, pt(Bsum) is still hashed, so the compensated statement
// still gets a different challenge; and L is a u32, so it cannot be solved for after the challenge either. M7 is a
// spec-conformance defect that only the transcript-conformance test above (and the frozen vectors) can observe.

test('CP-08: a cp-limit proof for (L, Bsum) is rejected for (L+1, Bsum+G) although every commitment is identical', () => {
  const { st, proof: p } = limitFixture();
  const moved: LimitStatement = { ...st, L: st.L + 1, Bsum: bump(st.Bsum) };
  // Control: Bsum - [L]G is unchanged, so the recomputed commitments a, b are bit-identical; only the hashed (L, Bsum) differ.
  const bOf = (s: LimitStatement): Point => cm(K, pointSub(s.Bsum, baseMul(BigInt(s.L))), p.c, p.s);
  assert.ok(bOf(st).equals(bOf(moved)));
  assert.equal(limitVerify(st, p), true);
  assert.equal(limitVerify(moved, p), false, 'cp-limit accepted the proof under a different (L, Bsum) with identical commitments');
  // the same with L lowered (an L-1 contest cannot reuse the proof either)
  assert.equal(limitVerify({ ...st, L: st.L - 1, Bsum: pointSub(st.Bsum, G) }, p), false);
});

// ============================================================ 2c. one transcript input at a time, every proof type

test('CP-08: every hashed statement input of every proof type is bound (one change at a time)', () => {
  const cds = cdsFixture(1);
  const lim = limitFixture();
  const dec = decFixture();
  const sp = spoilFixture();
  const a = scalarRandomNonZero(rng);
  const A = baseMul(a);
  const pok = pokProve(mh, 1, 0, a, A, rng);
  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const shk = shareKeyProve(ctx, 2, Yj, sj, rng);
  const e = scalarRandomNonZero(rng);
  const E = baseMul(e);
  const R = baseMul(scalarRandomNonZero(rng));
  const S = pointMul(R, e);
  const dh = dhProve(mh, 1, 2, E, R, S, e, rng);

  type Case = [string, () => boolean];
  const cases: Record<string, { ok: () => boolean; muts: Case[] }> = {
    pok: {
      ok: () => pokVerify(mh, 1, 0, A, pok),
      muts: [
        ['manifest_hash', () => pokVerify(flip(mh), 1, 0, A, pok)],
        ['i', () => pokVerify(mh, 2, 0, A, pok)],
        ['k', () => pokVerify(mh, 1, 1, A, pok)],
        ['A', () => pokVerify(mh, 1, 0, bump(A), pok)],
      ],
    },
    'pok-share': {
      ok: () => shareKeyVerify(ctx, 2, Yj, shk),
      muts: [
        ['ctx', () => shareKeyVerify(flip(ctx), 2, Yj, shk)],
        ['j', () => shareKeyVerify(ctx, 3, Yj, shk)],
        ['Y_j', () => shareKeyVerify(ctx, 2, bump(Yj), shk)],
      ],
    },
    'cp-dh': {
      ok: () => dhVerify(mh, 1, 2, E, R, S, dh),
      muts: [
        ['manifest_hash', () => dhVerify(flip(mh), 1, 2, E, R, S, dh)],
        ['i', () => dhVerify(mh, 3, 2, E, R, S, dh)],
        ['j', () => dhVerify(mh, 1, 3, E, R, S, dh)],
        ['E_j', () => dhVerify(mh, 1, 2, bump(E), R, S, dh)],
        ['R', () => dhVerify(mh, 1, 2, E, bump(R), S, dh)],
        ['S', () => dhVerify(mh, 1, 2, E, R, bump(S), dh)],
      ],
    },
    cds01: {
      ok: () => cdsVerify(cds.st, cds.proof),
      muts: [
        ['ctx', () => cdsVerify({ ...cds.st, ctx: flip(ctx) }, cds.proof)],
        ['binder', () => cdsVerify({ ...cds.st, binder: flip(binder) }, cds.proof)],
        ['cid', () => cdsVerify({ ...cds.st, cid: 'budgeu' }, cds.proof)],
        ['oid', () => cdsVerify({ ...cds.st, oid: 'yez' }, cds.proof)],
        ['K', () => cdsVerify({ ...cds.st, K: bump(K) }, cds.proof)],
        ['alpha', () => cdsVerify({ ...cds.st, ct: { A: bump(cds.st.ct.A), B: cds.st.ct.B } }, cds.proof)],
        ['beta', () => cdsVerify({ ...cds.st, ct: { A: cds.st.ct.A, B: bump(cds.st.ct.B) } }, cds.proof)],
      ],
    },
    'cp-limit': {
      ok: () => limitVerify(lim.st, lim.proof),
      muts: [
        ['ctx', () => limitVerify({ ...lim.st, ctx: flip(ctx) }, lim.proof)],
        ['binder', () => limitVerify({ ...lim.st, binder: flip(binder) }, lim.proof)],
        ['cid', () => limitVerify({ ...lim.st, cid: 'budgeu' }, lim.proof)],
        ['L', () => limitVerify({ ...lim.st, L: 2 }, lim.proof)],
        ['K', () => limitVerify({ ...lim.st, K: bump(K) }, lim.proof)],
        ['Asum', () => limitVerify({ ...lim.st, Asum: bump(lim.st.Asum) }, lim.proof)],
        ['Bsum', () => limitVerify({ ...lim.st, Bsum: bump(lim.st.Bsum) }, lim.proof)],
      ],
    },
    'cp-dec': {
      ok: () => decVerify(dec.st, dec.proof),
      muts: [
        ['ctx', () => decVerify({ ...dec.st, ctx: flip(ctx) }, dec.proof)],
        ['cid', () => decVerify({ ...dec.st, cid: 'budgeu' }, dec.proof)],
        ['oid', () => decVerify({ ...dec.st, oid: 'yez' }, dec.proof)],
        ['j', () => decVerify({ ...dec.st, j: 3 }, dec.proof)],
        ['Y_j', () => decVerify({ ...dec.st, Yj: bump(dec.st.Yj) }, dec.proof)],
        ['A', () => decVerify({ ...dec.st, A: bump(dec.st.A) }, dec.proof)],
        ['B', () => decVerify({ ...dec.st, B: bump(dec.st.B) }, dec.proof)],
        ['M', () => decVerify({ ...dec.st, M: bump(dec.st.M) }, dec.proof)],
      ],
    },
    'cp-dec-spoil': {
      ok: () => spoilDecVerify(sp.st, sp.proof),
      muts: [
        ['ctx', () => spoilDecVerify({ ...sp.st, ctx: flip(ctx) }, sp.proof)],
        ['ballot_code', () => spoilDecVerify({ ...sp.st, ballotCode: flip(code) }, sp.proof)],
        ['cid', () => spoilDecVerify({ ...sp.st, cid: 'budgeu' }, sp.proof)],
        ['oid', () => spoilDecVerify({ ...sp.st, oid: 'yez' }, sp.proof)],
        ['j', () => spoilDecVerify({ ...sp.st, j: 4 }, sp.proof)],
        ['Y_j', () => spoilDecVerify({ ...sp.st, Yj: bump(sp.st.Yj) }, sp.proof)],
        ['alpha', () => spoilDecVerify({ ...sp.st, alpha: bump(sp.st.alpha) }, sp.proof)],
        ['beta', () => spoilDecVerify({ ...sp.st, beta: bump(sp.st.beta) }, sp.proof)],
        ['M', () => spoilDecVerify({ ...sp.st, M: bump(sp.st.M) }, sp.proof)],
      ],
    },
  };
  for (const [label, { ok, muts }] of Object.entries(cases)) {
    assert.equal(ok(), true, `${label}: honest proof must verify`);
    for (const [field, run] of muts) assert.equal(run(), false, `${label}: changed ${field} still verifies`);
  }
  // cover the whole registry of proof labels (a new proof type must be added above)
  const proofLabels = Object.entries(LABELS).filter(([, k]) => k === 'hs').map(([l]) => l)
    .filter((l) => !l.startsWith('proof-'));
  assert.deepEqual(proofLabels.sort(), Object.keys(cases).sort());
});

// ============================================================ 3. hs_nz counter position (M15)

test('CP-08 M15: hs_nz appends u32(counter) as the LAST field for every hs_nz label (spec model)', () => {
  const f1 = rng.bytes(32);
  const f2 = str('contest-1');
  for (const [label, kind] of Object.entries(LABELS)) {
    if (kind !== 'hs_nz') continue;
    const got = hsNz(label as keyof typeof LABELS, f1, f2);
    assert.equal(got, specHsNz(label, f1, f2), `${label}: counter not last`);
    assert.notEqual(got, specHs(label, be32(0), f1, f2), `${label}: counter-first shape`);
  }
});

test('CP-08 M15: hs and hs_nz match the frozen label-registry vectors (test-vectors/v1, read only)', () => {
  const file = new URL('../../../test-vectors/v1/primitives/hash/tagged-hash.json', import.meta.url);
  const doc = JSON.parse(readFileSync(file, 'utf8')) as {
    vectors: { id: string; input: { label: string; kind: string; fields_hex: string[] }; expect: { ok: boolean; output?: { scalar_hex?: string } } }[];
  };
  let n = 0;
  for (const v of doc.vectors) {
    if (!v.expect.ok || (v.input.kind !== 'hs' && v.input.kind !== 'hs_nz')) continue;
    const fields = v.input.fields_hex.map((x) => hexToBytes(x));
    const label = v.input.label as keyof typeof LABELS;
    const s = v.input.kind === 'hs' ? hs(label, ...fields) : hsNz(label, ...fields);
    assert.equal(bytesToHex(scalarToBytes(s)), v.expect.output!.scalar_hex, v.id);
    n++;
  }
  assert.ok(n >= 4 + 7, `expected the hs_nz and proof-label vectors, saw ${n}`);
});

test('CP-08 M15: prover nonces are the spec hs_nz values (proof-w, limit-w, cp-dec-nonce incl. spoil code suffix)', () => {
  // CDS: the real branch reveals w = s_m - c_m * r; the simulated branch uses plain hs (proof-csim / proof-ssim).
  for (const m of [0, 1] as const) {
    const { st, r, xi, proof: p } = cdsFixture(m);
    const [cR, sR, cS, sS] = m === 0 ? [p.c0, p.s0, p.c1, p.s1] : [p.c1, p.s1, p.c0, p.s0];
    assert.equal(scalarSub(sR, scalarMul(cR, r)), specHsNz('proof-w', xi, str(st.cid), str(st.oid), one(m)), `proof-w m=${m}`);
    assert.equal(cS, specHs('proof-csim', xi, str(st.cid), str(st.oid)));
    assert.equal(sS, specHs('proof-ssim', xi, str(st.cid), str(st.oid)));
  }
  const lim = limitFixture();
  assert.equal(scalarSub(lim.proof.s, scalarMul(lim.proof.c, lim.R)), specHsNz('limit-w', lim.xi, str(lim.st.cid)), 'limit-w');
  const rand32 = new Uint8Array(32).fill(RAND);
  const dec = decFixture();
  assert.equal(
    scalarSub(dec.proof.s, scalarMul(dec.proof.c, dec.sj)),
    specHsNz('cp-dec-nonce', scalarToBytes(dec.sj), ctx, str(dec.st.cid), str(dec.st.oid), rand32),
    'cp-dec-nonce',
  );
  const sp = spoilFixture();
  assert.equal(
    scalarSub(sp.proof.s, scalarMul(sp.proof.c, sp.sj)),
    specHsNz('cp-dec-nonce', scalarToBytes(sp.sj), ctx, str(sp.st.cid), cat(str(sp.st.oid), one(0), code), rand32),
    'cp-dec-nonce (spoil: oid || 0x00 || ballot_code)',
  );
});
