import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, IDENTITY, ORDER, baseMul, cdsProve, cdsVerify, ctSum, decProve, decVerify, dhProve, dhVerify, elgamalDecryptToPoint,
  elgamalEncrypt, h256, hs, limitProve, limitVerify, pointAdd, pointMul, pointSub, pokProve, pokVerify, scalarAdd,
  scalarMul, scalarRandomNonZero, scalarSub, shareKeyProve, shareKeyVerify, spoilDecProve, spoilDecVerify, streamRng,
  utf8, pointToBytes, constantRng, type CdsStatement, type Ciphertext, type Scalar, type CdsProof,
  type LimitStatement, type DecStatement,
} from '../src/index.ts';

const rng = streamRng('proofs');
const h = (s: string): Uint8Array => h256('manifest', utf8(s));
const ctx = h('ctx');
const binder = h('binder');
const x = scalarRandomNonZero(rng);
const K = baseMul(x);

function bit(m: 0 | 1, seed = 'xi'): { st: CdsStatement; r: Scalar; xi: Uint8Array; proof: CdsProof } {
  const r = scalarRandomNonZero(rng);
  const ct = elgamalEncrypt(K, m, r);
  const xi = new Uint8Array(64).fill(seed.length);
  const st: CdsStatement = { ctx, binder, cid: 'budget', oid: 'yes', K, ct };
  return { st, r, xi, proof: cdsProve(st, m, r, xi) };
}

test('CDS: completeness for 0 and 1 (randomised)', () => {
  for (let i = 0; i < 12; i++) {
    const m = (i % 2) as 0 | 1;
    const { st, proof } = bit(m);
    assert.ok(cdsVerify(st, proof));
  }
});

test('CDS: deterministic given xi', () => {
  const r = scalarRandomNonZero(rng);
  const ct = elgamalEncrypt(K, 1, r);
  const st: CdsStatement = { ctx, binder, cid: 'c', oid: 'o', K, ct };
  const xi = new Uint8Array(64).fill(3);
  assert.deepEqual(cdsProve(st, 1, r, xi), cdsProve(st, 1, r, xi));
});

test('CDS: every statement field is bound (Frozen-Heart style per-field mutation)', () => {
  const { st, proof } = bit(1);
  const flip = (b: Uint8Array): Uint8Array => {
    const c = b.slice();
    c[0] = c[0]! ^ 1;
    return c;
  };
  const other = pointAdd(st.ct.A, G);
  const muts: [string, CdsStatement][] = [
    ['ctx', { ...st, ctx: flip(ctx) }],
    ['binder', { ...st, binder: flip(binder) }],
    ['cid', { ...st, cid: 'budgeu' }],
    ['oid', { ...st, oid: 'yez' }],
    ['K', { ...st, K: pointAdd(K, G) }],
    ['alpha', { ...st, ct: { A: other, B: st.ct.B } }],
    ['beta', { ...st, ct: { A: st.ct.A, B: pointAdd(st.ct.B, G) } }],
  ];
  for (const [name, m] of muts) assert.ok(!cdsVerify(m, proof), `mutated ${name} accepted`);
  assert.ok(cdsVerify(st, proof));
  // each proof scalar is bound
  for (const k of ['c0', 's0', 'c1', 's1'] as const) {
    assert.ok(!cdsVerify(st, { ...proof, [k]: scalarAdd(proof[k], 1n) }), k);
  }
});

test('CDS: soundness - a ciphertext of 2 / -1 cannot be proven honestly or by simulating both branches', () => {
  for (const m of [2n, ORDER - 1n]) {
    const r = scalarRandomNonZero(rng);
    const ct: Ciphertext = { A: baseMul(r), B: pointAdd(baseMul(m), pointMul(K, r)) };
    const st: CdsStatement = { ctx, binder, cid: 'c', oid: 'o', K, ct };
    // run the prover as if it were bit 0 and bit 1 - proofs must not verify
    for (const claimed of [0, 1] as const) {
      const p = cdsProve(st, claimed, r, new Uint8Array(64).fill(9));
      assert.ok(!cdsVerify(st, p));
    }
    // simulate both branches with arbitrary (c, s): sum of challenges cannot match the hash
    for (let t = 0; t < 5; t++) {
      const forged: CdsProof = {
        c0: scalarRandomNonZero(rng), s0: scalarRandomNonZero(rng), c1: scalarRandomNonZero(rng), s1: scalarRandomNonZero(rng),
      };
      assert.ok(!cdsVerify(st, forged));
    }
  }
});

test('CDS: weak-Fiat-Shamir forgery (challenge that omits the ciphertext) is rejected', () => {
  // Attacker picks (alpha,beta) encrypting 5 and builds a "proof" using a weak challenge hash over commitments only.
  const r = scalarRandomNonZero(rng);
  const ct: Ciphertext = { A: baseMul(r), B: pointAdd(baseMul(5n), pointMul(K, r)) };
  const st: CdsStatement = { ctx, binder, cid: 'c', oid: 'o', K, ct };
  const c0 = 11n, s0 = 12n;
  const weakC = hs('cds01', pointToBytes(G)); // not the real transcript
  const forged: CdsProof = { c0, s0, c1: scalarSub(weakC, c0), s1: 13n };
  assert.ok(!cdsVerify(st, forged));
});

test('CDS: identity ciphertext components rejected', () => {
  const { st, proof } = bit(0);
  assert.ok(!cdsVerify({ ...st, ct: { A: IDENTITY, B: st.ct.B } }, proof));
  assert.ok(!cdsVerify({ ...st, ct: { A: st.ct.A, B: IDENTITY } }, proof));
  assert.ok(!cdsVerify({ ...st, K: IDENTITY }, proof));
});

test('CDS: out-of-range proof scalars rejected (no reduction)', () => {
  const { st, proof } = bit(0);
  assert.ok(!cdsVerify(st, { ...proof, c0: proof.c0 + ORDER }));
  assert.ok(!cdsVerify(st, { ...proof, s1: -1n }));
});

test('CDS: proof does not verify for a different voter binder (ballot-copy defence)', () => {
  const { st, proof } = bit(1);
  assert.ok(!cdsVerify({ ...st, binder: h('mallory') }, proof));
});

test('limit proof: completeness, field binding and overvote rejection', () => {
  const L = 1;
  const ms = [1, 0, 0] as const; // yes, no, ph1
  const rs = ms.map(() => scalarRandomNonZero(rng));
  const cts = ms.map((m, i) => elgamalEncrypt(K, m, rs[i]!));
  const sum = ctSum(cts);
  const R = rs.reduce((a, b) => scalarAdd(a, b), 0n);
  const st: LimitStatement = { ctx, binder, cid: 'budget', L, K, Asum: sum.A, Bsum: sum.B };
  const xi = new Uint8Array(64).fill(1);
  const p = limitProve(st, R, xi);
  assert.ok(limitVerify(st, p));
  assert.ok(!limitVerify({ ...st, L: 2 }, p));
  assert.ok(!limitVerify({ ...st, cid: 'x' }, p));
  assert.ok(!limitVerify({ ...st, binder: h('b2') }, p));
  assert.ok(!limitVerify({ ...st, ctx: h('c2') }, p));
  assert.ok(!limitVerify({ ...st, K: pointAdd(K, G) }, p));
  assert.ok(!limitVerify({ ...st, Asum: pointAdd(st.Asum, G) }, p));
  assert.ok(!limitVerify({ ...st, Bsum: pointAdd(st.Bsum, G) }, p));
  // overvote: plaintext sum 2 with L=1
  const ms2 = [1, 1, 0] as const;
  const rs2 = ms2.map(() => scalarRandomNonZero(rng));
  const sum2 = ctSum(ms2.map((m, i) => elgamalEncrypt(K, m, rs2[i]!)));
  const st2: LimitStatement = { ...st, Asum: sum2.A, Bsum: sum2.B };
  const p2 = limitProve(st2, rs2.reduce((a, b) => scalarAdd(a, b), 0n), xi);
  assert.ok(!limitVerify(st2, p2));
  assert.ok(!limitVerify(st, { c: p.c, s: scalarAdd(p.s, 1n) }));
});

test('Schnorr PoK: bound to (manifest, i, k, A); identity and rogue-key fail', () => {
  const mh = h('mh');
  const a = scalarRandomNonZero(rng);
  const A = baseMul(a);
  const p = pokProve(mh, 1, 0, a, A, rng);
  assert.ok(pokVerify(mh, 1, 0, A, p));
  assert.ok(!pokVerify(mh, 2, 0, A, p), 'replay under another dealer index');
  assert.ok(!pokVerify(mh, 1, 1, A, p), 'replay under another coefficient index');
  assert.ok(!pokVerify(h('other'), 1, 0, A, p), 'replay under another manifest');
  assert.ok(!pokVerify(mh, 1, 0, pointAdd(A, G), p));
  assert.ok(!pokVerify(mh, 1, 0, IDENTITY, pokProve(mh, 1, 0, 0n, IDENTITY, rng)));
  // rogue key: attacker publishes A' = Y - A_honest without knowing its dlog and tries to reuse a proof
  const Y = baseMul(scalarRandomNonZero(rng));
  const rogue = pointSub(Y, A);
  assert.ok(!pokVerify(mh, 3, 0, rogue, p));
  assert.ok(!pokVerify(mh, 3, 0, rogue, { c: 5n, s: 6n }));
});

test('share-key PoK and DH-reveal DLEQ', () => {
  const sj = scalarRandomNonZero(rng);
  const Y = baseMul(sj);
  const p = shareKeyProve(ctx, 2, Y, sj, rng);
  assert.ok(shareKeyVerify(ctx, 2, Y, p));
  assert.ok(!shareKeyVerify(ctx, 3, Y, p));
  assert.ok(!shareKeyVerify(h('x'), 2, Y, p));
  const e = scalarRandomNonZero(rng);
  const E = baseMul(e);
  const R = baseMul(scalarRandomNonZero(rng));
  const S = pointMul(R, e);
  const mh = h('mh');
  const d = dhProve(mh, 1, 2, E, R, S, e, rng);
  assert.ok(dhVerify(mh, 1, 2, E, R, S, d));
  assert.ok(!dhVerify(mh, 2, 1, E, R, S, d));
  assert.ok(!dhVerify(mh, 1, 2, E, R, pointAdd(S, G), d));
  assert.ok(!dhVerify(mh, 1, 2, E, pointAdd(R, G), S, d));
  assert.ok(!dhVerify(mh, 1, 2, pointAdd(E, G), R, S, d));
});

test('decryption proofs: complete; every field bound; wrong share rejected; types do not cross-verify', () => {
  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const ct = elgamalEncrypt(K, 3, scalarRandomNonZero(rng));
  const base = { ctx, cid: 'c', oid: 'o', j: 2, Yj, A: ct.A, B: ct.B };
  const { M, proof } = decProve(base, sj, rng);
  const st: DecStatement = { ...base, M };
  assert.ok(decVerify(st, proof));
  for (const m of [
    { ...st, ctx: h('z') }, { ...st, cid: 'd' }, { ...st, oid: 'p' }, { ...st, j: 3 }, { ...st, Yj: pointAdd(Yj, G) },
    { ...st, A: pointAdd(st.A, G) }, { ...st, B: pointAdd(st.B, G) }, { ...st, M: pointAdd(M, G) },
  ]) assert.ok(!decVerify(m, proof));
  // wrong secret share
  const bad = decProve(base, scalarAdd(sj, 1n), rng);
  assert.ok(!decVerify({ ...base, M: bad.M }, bad.proof));
  // cross-protocol: a cp-dec proof must not verify as a spoil-dec proof over same numbers
  assert.ok(!spoilDecVerify({ ctx, ballotCode: h('code'), cid: 'c', oid: 'o', j: 2, Yj, alpha: ct.A, beta: ct.B, M }, proof));
  const sp = spoilDecProve({ ctx, ballotCode: h('code'), cid: 'c', oid: 'o', j: 2, Yj, alpha: ct.A, beta: ct.B }, sj, rng);
  assert.ok(spoilDecVerify({ ctx, ballotCode: h('code'), cid: 'c', oid: 'o', j: 2, Yj, alpha: ct.A, beta: ct.B, M: sp.M }, sp.proof));
  assert.ok(!spoilDecVerify({ ctx, ballotCode: h('code2'), cid: 'c', oid: 'o', j: 2, Yj, alpha: ct.A, beta: ct.B, M: sp.M }, sp.proof));
  assert.ok(!decVerify(st, sp.proof));
  // a PoK / DLEQ proof of another type does not verify as a decryption proof
  const pk = pokProve(h('mh'), 2, 0, sj, Yj, rng);
  assert.ok(!decVerify(st, pk));
});

test('decryption with a failed RNG still never repeats the nonce across different statements', () => {
  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const ct1 = elgamalEncrypt(K, 1, scalarRandomNonZero(rng));
  const ct2 = elgamalEncrypt(K, 2, scalarRandomNonZero(rng));
  const dead = constantRng(7);
  const p1 = decProve({ ctx, cid: 'c', oid: 'a', j: 1, Yj, A: ct1.A, B: ct1.B }, sj, dead);
  const p2 = decProve({ ctx, cid: 'c', oid: 'b', j: 1, Yj, A: ct2.A, B: ct2.B }, sj, dead);
  // same u would give s1 - s2 = (c1 - c2) * sj; check that responses do not leak sj that way
  const leaked = scalarSub(p1.proof.s, p2.proof.s);
  const cdiff = scalarSub(p1.proof.c, p2.proof.c);
  assert.notEqual(leaked, scalarMul(cdiff, sj));
});

test('ElGamal homomorphism and decryption', () => {
  const cts = [1, 0, 1, 1].map((m) => elgamalEncrypt(K, m, scalarRandomNonZero(rng)));
  const sum = ctSum(cts);
  assert.ok(elgamalDecryptToPoint(sum, x).equals(baseMul(3n)));
  assert.throws(() => elgamalEncrypt(K, 1, 0n));
});
