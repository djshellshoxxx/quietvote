// Registry revision 2026-11-04 (QV-ADR-027; CP-02 / B1-12 / C3 / OQ-7 / D-19 / N-41): every interactive-free prover
// nonce hashes the secret, the statement context, the statement point(s) and 32 CSPRNG bytes (QV-16 §5.4, §5.7.2,
// §5.7.5, §5.7.8, §5.16). The tests use a deliberately broken RNG: before the revision these pairs of proofs shared a
// nonce, so s1 - s2 = (c1 - c2) * secret leaked the secret. Verifiers are unchanged (the nonce is never transmitted).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, LABELS, QvCryptoError, baseMul, constantRng, decProve, decVerify, dhProve, dhVerify, elgamalEncrypt, h256, hs,
  hsNz, pointAdd, pointMul, pointSub, pointToBytes, pokProve, pokVerify, scalarAdd, scalarMul, scalarRandomNonZero,
  scalarSub, scalarToBytes, shareKeyProve, shareKeyVerify, spoilDecProve, spoilDecVerify, streamRng, u16, u8, utf8,
  type CompactProof, type Point, type Scalar,
} from '../src/index.ts';

const rng = streamRng('conformance-nonce-hedge');
const h = (s: string): Uint8Array => h256('manifest', utf8(s));
const pt = pointToBytes;
const sc = scalarToBytes;
const BYTE = 7;
/** rand32 as a constant RNG produces it. */
const R32 = new Uint8Array(32).fill(BYTE);

/** Recovers the prover's first commitment [u]B = [s]B - [c]X from a compact proof (what every verifier recomputes). */
const commitOf = (B: Point, X: Point, p: CompactProof): Point => pointSub(pointMul(B, p.s), pointMul(X, p.c));
/** The nonce-reuse leak: with a shared u, s1 - s2 equals (c1 - c2) * secret. */
const leaks = (p1: CompactProof, p2: CompactProof, secret: Scalar): boolean =>
  scalarSub(p1.s, p2.s) === scalarMul(scalarSub(p1.c, p2.c), secret);

const K = baseMul(scalarRandomNonZero(rng));
const ctx = h('ctx');

test('registry: the three new hedged-nonce labels are hs_nz and reject other kinds', () => {
  for (const l of ['pok-nonce', 'pok-share-nonce', 'cp-dh-nonce', 'cp-dec-nonce'] as const) {
    assert.equal(LABELS[l], 'hs_nz', l);
    assert.throws(() => hs(l, utf8('x')), (e: unknown) => e instanceof QvCryptoError && e.code === 'E_DOMAIN_UNKNOWN');
    assert.throws(() => h256(l, utf8('x')), (e: unknown) => e instanceof QvCryptoError && e.code === 'E_DOMAIN_UNKNOWN');
  }
  // the four nonce labels are domain separated from each other over identical fields
  const outs = new Set(['pok-nonce', 'pok-share-nonce', 'cp-dh-nonce', 'cp-dec-nonce'].map((l) => hsNz(l as 'pok-nonce', R32).toString(16)));
  assert.equal(outs.size, 4);
});

test('CP-02: constant RNG, same (ctx,cid,oid,j), different aggregates -> different decryption nonces; proofs still verify', () => {
  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const ct1 = elgamalEncrypt(K, 1, scalarRandomNonZero(rng));
  const ct2 = elgamalEncrypt(K, 2, scalarRandomNonZero(rng));
  const st = { ctx, cid: 'c', oid: 'o', j: 1, Yj };
  const p1 = decProve({ ...st, A: ct1.A, B: ct1.B }, sj, constantRng(BYTE));
  const p2 = decProve({ ...st, A: ct2.A, B: ct2.B }, sj, constantRng(BYTE));
  assert.ok(decVerify({ ...st, A: ct1.A, B: ct1.B, M: p1.M }, p1.proof));
  assert.ok(decVerify({ ...st, A: ct2.A, B: ct2.B, M: p2.M }, p2.proof));
  // nonces differ: a = [u]G recomputed from each proof
  assert.ok(!commitOf(G, Yj, p1.proof).equals(commitOf(G, Yj, p2.proof)));
  assert.ok(!leaks(p1.proof, p2.proof, sj), 's_j must not be recoverable from the two responses');
  // only B differs (same A): still a different nonce, because the challenge hashes B too
  const B3 = pointAdd(ct1.B, G);
  const p3 = decProve({ ...st, A: ct1.A, B: B3 }, sj, constantRng(BYTE));
  assert.ok(decVerify({ ...st, A: ct1.A, B: B3, M: p3.M }, p3.proof));
  assert.ok(!commitOf(G, Yj, p1.proof).equals(commitOf(G, Yj, p3.proof)));
  assert.ok(!leaks(p1.proof, p3.proof, sj));
  // a tampered response still fails under the new prover
  assert.ok(!decVerify({ ...st, A: ct1.A, B: ct1.B, M: p1.M }, { c: p1.proof.c, s: scalarAdd(p1.proof.s, 1n) }));
});

test('decryption nonces bind trustee index even when two trustees have the same secret', () => {
  const sj = 1234567n;
  const Yj = baseMul(sj);
  const ct = elgamalEncrypt(K, 1, 7654321n);
  const base = { ctx, cid: 'budget', oid: 'yes', Yj, A: ct.A, B: ct.B };
  const first = decProve({ ...base, j: 1 }, sj, constantRng(BYTE));
  const second = decProve({ ...base, j: 2 }, sj, constantRng(BYTE));
  assert.ok(decVerify({ ...base, j: 1, M: first.M }, first.proof));
  assert.ok(decVerify({ ...base, j: 2, M: second.M }, second.proof));
  assert.ok(!commitOf(G, Yj, first.proof).equals(commitOf(G, Yj, second.proof)), 'different trustee challenges need different nonces');
  assert.ok(!leaks(first.proof, second.proof, sj));
});

test('spoil decryption nonces bind trustee index even when two trustees have the same secret', () => {
  const sj = 1234567n;
  const Yj = baseMul(sj);
  const ct = elgamalEncrypt(K, 1, 7654321n);
  const base = { ctx, ballotCode: h('same-spoiled-ballot'), cid: 'budget', oid: 'yes', Yj, alpha: ct.A, beta: ct.B };
  const first = spoilDecProve({ ...base, j: 1 }, sj, constantRng(BYTE));
  const second = spoilDecProve({ ...base, j: 2 }, sj, constantRng(BYTE));
  assert.ok(spoilDecVerify({ ...base, j: 1, M: first.M }, first.proof));
  assert.ok(spoilDecVerify({ ...base, j: 2, M: second.M }, second.proof));
  assert.ok(!commitOf(G, Yj, first.proof).equals(commitOf(G, Yj, second.proof)), 'different trustee challenges need different nonces');
  assert.ok(!leaks(first.proof, second.proof, sj));
});

test('CP-02: decProve nonce equals the QV-16 §5.4 cp-dec-nonce field list (s_j, ctx, cid, oid, u8(j), pt(A), pt(B), rand32)', () => {
  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const ct = elgamalEncrypt(K, 3, scalarRandomNonZero(rng));
  const { proof } = decProve({ ctx, cid: 'budget', oid: 'yes', j: 2, Yj, A: ct.A, B: ct.B }, sj, constantRng(BYTE));
  const a = commitOf(G, Yj, proof);
  const u = hsNz('cp-dec-nonce', sc(sj), ctx, utf8('budget'), utf8('yes'), u8(2), pt(ct.A), pt(ct.B), R32);
  assert.ok(baseMul(u).equals(a), 'nonce follows the registry field list');
  // The superseded list omitted the trustee index.
  const uOld = hsNz('cp-dec-nonce', sc(sj), ctx, utf8('budget'), utf8('yes'), pt(ct.A), pt(ct.B), R32);
  assert.ok(!baseMul(uOld).equals(a));
  // and the field order is fixed: swapping A and B gives a different nonce
  assert.ok(!baseMul(hsNz('cp-dec-nonce', sc(sj), ctx, utf8('budget'), utf8('yes'), u8(2), pt(ct.B), pt(ct.A), R32)).equals(a));
});

test('CP-02 spoil variant: constant RNG, same code/cid/oid, different (alpha,beta) -> different nonces; field list pinned', () => {
  const sj = scalarRandomNonZero(rng);
  const Yj = baseMul(sj);
  const code = h('code');
  const ct1 = elgamalEncrypt(K, 0, scalarRandomNonZero(rng));
  const ct2 = elgamalEncrypt(K, 1, scalarRandomNonZero(rng));
  const st = { ctx, ballotCode: code, cid: 'c', oid: 'o', j: 3, Yj };
  const p1 = spoilDecProve({ ...st, alpha: ct1.A, beta: ct1.B }, sj, constantRng(BYTE));
  const p2 = spoilDecProve({ ...st, alpha: ct2.A, beta: ct2.B }, sj, constantRng(BYTE));
  assert.ok(spoilDecVerify({ ...st, alpha: ct1.A, beta: ct1.B, M: p1.M }, p1.proof));
  assert.ok(spoilDecVerify({ ...st, alpha: ct2.A, beta: ct2.B, M: p2.M }, p2.proof));
  assert.ok(!commitOf(G, Yj, p1.proof).equals(commitOf(G, Yj, p2.proof)));
  assert.ok(!leaks(p1.proof, p2.proof, sj));
  const oidField = new Uint8Array([...utf8('o'), 0, ...code]);
  const u = hsNz('cp-dec-nonce', sc(sj), ctx, utf8('c'), oidField, u8(3), pt(ct1.A), pt(ct1.B), R32);
  assert.ok(baseMul(u).equals(commitOf(G, Yj, p1.proof)), 'spoil nonce: oid || 0x00 || ballot_code (E-12), then u8(j), pt(alpha), pt(beta)');
  // the tally-mode nonce over the same numbers differs (ballot-code fold keeps the two uses apart)
  const tally = decProve({ ctx, cid: 'c', oid: 'o', j: 3, Yj, A: ct1.A, B: ct1.B }, sj, constantRng(BYTE));
  assert.ok(!commitOf(G, Yj, tally.proof).equals(commitOf(G, Yj, p1.proof)));
  assert.ok(!spoilDecVerify({ ...st, alpha: ct1.A, beta: ct1.B, M: p1.M }, { c: p1.proof.c, s: scalarAdd(p1.proof.s, 1n) }));
});

test('C3: DKG PoK nonce (pok-nonce) differs per coefficient, dealer and manifest with a constant RNG; pinned field list', () => {
  const mh = h('mh');
  // a constant RNG makes every coefficient the same scalar (as in a dealing from a dead RNG): the worst case
  const a = scalarRandomNonZero(constantRng(BYTE));
  const A = baseMul(a);
  const proofs = [
    pokProve(mh, 1, 0, a, A, constantRng(BYTE)),
    pokProve(mh, 1, 1, a, A, constantRng(BYTE)),
    pokProve(mh, 1, 0xffff, a, A, constantRng(BYTE)),
    pokProve(mh, 2, 0, a, A, constantRng(BYTE)),
    pokProve(h('other'), 1, 0, a, A, constantRng(BYTE)),
  ];
  const ctxs: [Uint8Array, number, number][] = [[mh, 1, 0], [mh, 1, 1], [mh, 1, 0xffff], [mh, 2, 0], [h('other'), 1, 0]];
  proofs.forEach((p, n) => assert.ok(pokVerify(ctxs[n]![0], ctxs[n]![1], ctxs[n]![2], A, p), `pok ${n} verifies`));
  const Rs = new Set(proofs.map((p) => Buffer.from(pt(commitOf(G, A, p))).toString('hex')));
  assert.equal(Rs.size, proofs.length, 'all nonces distinct');
  for (let x = 0; x < proofs.length; x++) for (let y = x + 1; y < proofs.length; y++) assert.ok(!leaks(proofs[x]!, proofs[y]!, a));
  // the previous plain-CSPRNG nonce was identical for all five proofs; the new one is the registry derivation
  const uOld = scalarRandomNonZero(constantRng(BYTE));
  assert.ok(!baseMul(uOld).equals(commitOf(G, A, proofs[0]!)));
  const u = hsNz('pok-nonce', sc(a), mh, u8(1), u16(0), pt(A), R32);
  assert.ok(baseMul(u).equals(commitOf(G, A, proofs[0]!)), 'pok-nonce = (sc(a), manifest_hash, u8(i), u16(k), pt(A), rand32)');
  assert.ok(!pokVerify(mh, 1, 0, A, { c: proofs[0]!.c, s: scalarAdd(proofs[0]!.s, 1n) }));
});

test('C3: share-key PoK nonce (pok-share-nonce) differs per ctx and j with a constant RNG; pinned field list', () => {
  const sj = scalarRandomNonZero(rng);
  const Y = baseMul(sj);
  const p1 = shareKeyProve(ctx, 2, Y, sj, constantRng(BYTE));
  const p2 = shareKeyProve(h('ctx-2'), 2, Y, sj, constantRng(BYTE));
  const p3 = shareKeyProve(ctx, 3, Y, sj, constantRng(BYTE));
  assert.ok(shareKeyVerify(ctx, 2, Y, p1));
  assert.ok(shareKeyVerify(h('ctx-2'), 2, Y, p2));
  assert.ok(shareKeyVerify(ctx, 3, Y, p3));
  for (const q of [p2, p3]) {
    assert.ok(!commitOf(G, Y, p1).equals(commitOf(G, Y, q)));
    assert.ok(!leaks(p1, q, sj));
  }
  const u = hsNz('pok-share-nonce', sc(sj), ctx, u8(2), pt(Y), R32);
  assert.ok(baseMul(u).equals(commitOf(G, Y, p1)), 'pok-share-nonce = (sc(s_j), ctx, u8(j), pt(Y_j), rand32)');
  assert.ok(!shareKeyVerify(ctx, 2, Y, { c: p1.c, s: scalarAdd(p1.s, 1n) }));
});

test('C3: complaint DLEQ nonce (cp-dh-nonce) differs per package R and party pair with a constant RNG; pinned field list', () => {
  const mh = h('mh');
  const e = scalarRandomNonZero(rng);
  const E = baseMul(e);
  const R1 = baseMul(scalarRandomNonZero(rng));
  const R2 = baseMul(scalarRandomNonZero(rng));
  const S1 = pointMul(R1, e);
  const S2 = pointMul(R2, e);
  const p1 = dhProve(mh, 1, 2, E, R1, S1, e, constantRng(BYTE));
  const p2 = dhProve(mh, 1, 2, E, R2, S2, e, constantRng(BYTE));
  const p3 = dhProve(mh, 3, 2, E, R1, S1, e, constantRng(BYTE));
  assert.ok(dhVerify(mh, 1, 2, E, R1, S1, p1));
  assert.ok(dhVerify(mh, 1, 2, E, R2, S2, p2));
  assert.ok(dhVerify(mh, 3, 2, E, R1, S1, p3));
  for (const q of [p2, p3]) {
    assert.ok(!commitOf(G, E, p1).equals(commitOf(G, E, q)));
    assert.ok(!leaks(p1, q, e));
  }
  const u = hsNz('cp-dh-nonce', sc(e), mh, u8(1), u8(2), pt(E), pt(R1), pt(S1), R32);
  assert.ok(baseMul(u).equals(commitOf(G, E, p1)), 'cp-dh-nonce = (sc(e_j), manifest_hash, u8(i), u8(j), pt(E_j), pt(R), pt(S), rand32)');
  assert.ok(!dhVerify(mh, 1, 2, E, R1, S1, { c: p1.c, s: scalarAdd(p1.s, 1n) }));
});

test('hedge keeps fresh randomness: same statement + same RNG output -> same proof; different rand32 -> different proof', () => {
  const sj = scalarRandomNonZero(rng);
  const Y = baseMul(sj);
  const mh = h('mh');
  const same = (f: (r: ReturnType<typeof constantRng>) => CompactProof): void => {
    const x = f(constantRng(BYTE));
    const y = f(constantRng(BYTE));
    const z = f(constantRng(BYTE + 1));
    assert.deepEqual(x, y, 'deterministic in (secret, statement, rand32)');
    assert.notEqual(x.c, z.c, 'rand32 still enters the nonce');
  };
  same((r) => pokProve(mh, 1, 0, sj, Y, r));
  same((r) => shareKeyProve(ctx, 1, Y, sj, r));
  same((r) => dhProve(mh, 1, 2, Y, G, Y, sj, r));
  const ct = elgamalEncrypt(K, 1, scalarRandomNonZero(rng));
  same((r) => decProve({ ctx, cid: 'c', oid: 'o', j: 1, Yj: Y, A: ct.A, B: ct.B }, sj, r).proof);
  same((r) => spoilDecProve({ ctx, ballotCode: h('code'), cid: 'c', oid: 'o', j: 1, Yj: Y, alpha: ct.A, beta: ct.B }, sj, r).proof);
});
