// Registry revision 2026-11-04 (QV-ADR-027; CP-02 / B1-12 / C3 / N-41) at the protocol layer: the DKG dealing,
// complaint, key confirmation and tally partial decryption paths, driven by a deliberately dead RNG, no longer emit two
// proofs that share a nonce for the same secret. Verification is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseMul, constantRng, decVerify, hexToBytes, pointFromBytes, pointMul, pointSub, scalarFromBytes, scalarMul, scalarSub,
  shareKeyVerify, type CompactProof, type Point, type Scalar,
} from '@quietvote/crypto';
import { aggregate, analyzeBallotLog, checkDealing, dkgDeal, dkgKeyconf, manifestHash, trusteeDecryptTally, verifyKeyconf, shareKey } from '../src/index.ts';
import { castBallot, closeElection, defaultContests, setup, trusteeKeyFor, voterEnvelopes } from './helpers/sim.ts';

const PT = (h: string): Point => pointFromBytes(hexToBytes(h, 32));
const SC = (h: string): Scalar => scalarFromBytes(hexToBytes(h, 32));
const commitOf = (X: Point, p: CompactProof): Point => pointSub(baseMul(p.s), pointMul(X, p.c));
const leaks = (p1: CompactProof, p2: CompactProof, secret: Scalar): boolean =>
  scalarSub(p1.s, p2.s) === scalarMul(scalarSub(p1.c, p2.c), secret);

test('C3: a dealing from a dead RNG (all coefficients and e equal) has t+1 PoKs with distinct nonces and still verifies', async () => {
  const sim = await setup({ seed: 'conf-hedge-dkg', n: 3, t: 2, voters: 1, contests: defaultContests().filter((c) => c.id === 'budget') });
  const mh = manifestHash(sim.manifest);
  const t = 3;
  const { secret, body } = dkgDeal(mh, 1, t, constantRng(5));
  // the dead RNG really is dead: every secret scalar is the same value
  assert.ok(secret.coeffs.every((a) => a === secret.e));
  const checked = checkDealing(mh, t, body);
  assert.ok(checked.ok, 'dealing verifies (positive)');
  const proofs: [Point, CompactProof][] = [
    [PT(body.enc.E), { c: SC(body.enc.c), s: SC(body.enc.s) }],
    ...body.coeffs.map((x): [Point, CompactProof] => [PT(x.A), { c: SC(x.c), s: SC(x.s) }]),
  ];
  const Rs = new Set(proofs.map(([X, p]) => commitOf(X, p).toHex()));
  assert.equal(Rs.size, t + 1, 'every PoK nonce differs');
  for (let x = 0; x < proofs.length; x++) {
    for (let y = x + 1; y < proofs.length; y++) assert.ok(!leaks(proofs[x]![1], proofs[y]![1], secret.e), `PoK ${x}/${y} would leak a`);
  }
  // negative: a tampered PoK still fails the dealing check
  const bad = structuredClone(body);
  bad.coeffs[1]!.s = body.coeffs[0]!.s;
  assert.ok(!checkDealing(mh, t, bad).ok);
});

test('C3: key confirmations from a dead RNG under two contexts do not share a nonce', () => {
  const sj = 1234567n;
  const Y = baseMul(sj);
  const ctx1 = new Uint8Array(32).fill(1);
  const ctx2 = new Uint8Array(32).fill(2);
  const k1 = dkgKeyconf(ctx1, 2, Y, sj, constantRng(5));
  const k2 = dkgKeyconf(ctx2, 2, Y, sj, constantRng(5));
  assert.ok(verifyKeyconf(ctx1, Y, k1) && verifyKeyconf(ctx2, Y, k2));
  const p1 = { c: SC(k1.c), s: SC(k1.s) };
  const p2 = { c: SC(k2.c), s: SC(k2.s) };
  assert.ok(!commitOf(Y, p1).equals(commitOf(Y, p2)));
  assert.ok(!leaks(p1, p2, sj));
  assert.ok(!shareKeyVerify(ctx2, 2, Y, p1), 'a keyconf does not verify under another ctx');
});

test('CP-02: a trustee asked twice to decrypt different counted sets with a dead RNG does not leak s_j', async () => {
  const contests = defaultContests().filter((c) => c.id === 'budget');
  const sim = await setup({ seed: 'conf-hedge-tally', n: 3, t: 2, voters: 5, contests });
  const sels = [{ budget: ['yes'] }, { budget: ['no'] }, { budget: ['yes'] }, { budget: ['yes'] }, { budget: [] }];
  sels.forEach((s, i) => castBallot(sim, i, s));
  closeElection(sim);
  const p = sim.params!;
  const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  assert.equal(an.counted.length, 5);
  const key = trusteeKeyFor(sim, 1);
  // two requests for the same (ctx, cid, oid) over different aggregates (one ballot fewer), both above the floor of 3
  const setA = an.counted;
  const setB = an.counted.slice(1);
  const rA = trusteeDecryptTally(p, key, setA, undefined, 5, constantRng(9));
  const rB = trusteeDecryptTally(p, key, setB, undefined, 5, constantRng(9));
  assert.ok(rA.ok && rB.ok);
  const aggA = aggregate(p, setA).get('budget')!;
  const aggB = aggregate(p, setB).get('budget')!;
  for (const oid of ['yes', 'no']) {
    const a = aggA.get(oid)!;
    const b = aggB.get(oid)!;
    assert.ok(!a.A.equals(b.A), 'the aggregates really differ');
    const sA = rA.value.get(shareKey('budget', oid))!;
    const sB = rB.value.get(shareKey('budget', oid))!;
    const st = { ctx: p.ctx, cid: 'budget', oid, j: 1, Yj: key.Yj };
    assert.ok(decVerify({ ...st, A: a.A, B: a.B, M: sA.M }, sA), 'share A verifies (positive)');
    assert.ok(decVerify({ ...st, A: b.A, B: b.B, M: sB.M }, sB), 'share B verifies (positive)');
    assert.ok(!decVerify({ ...st, A: b.A, B: b.B, M: sA.M }, sA), 'share A does not verify for aggregate B (negative)');
    assert.ok(!commitOf(key.Yj, sA).equals(commitOf(key.Yj, sB)), 'nonces differ');
    assert.ok(!leaks(sA, sB, key.sj), `s_j not recoverable for ${oid}`);
  }
});
