import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseMul, bytesToHex, h256, hexToBytes, pointAdd, pointSub, pointToBytes, reconstructSecret,
  scalarRandomNonZero, streamRng, utf8,
} from '@quietvote/crypto';
import { checkDealing, dkgDeal, dealingCommitHash, adjudicateDkg, type DkgInput, type MarkerSeqs } from '../src/index.ts';
import { clone, setup } from './helpers/sim.ts';

const H = bytesToHex;
const mh = h256('manifest', utf8('dkg-test'));
const rng = streamRng('dkg-test');

test('honest DKG n=5 t=3: K = sum of constant terms; any 3 shares reconstruct x; Y_j = [s_j]G', async () => {
  const sim = await setup({ seed: 'dkg-honest', n: 5, t: 3, voters: 0 });
  const o = sim.outcome!;
  assert.deepEqual(o.Q, [1, 2, 3, 4, 5]);
  assert.equal(o.qmask, 31);
  for (const j of o.Q) assert.ok(baseMul(sim.shares.get(j)!).equals(o.Y.get(j)!));
  const x = reconstructSecret([1, 3, 5], sim.shares);
  assert.ok(baseMul(x).equals(o.K));
  assert.equal(reconstructSecret([2, 4, 5], sim.shares), x);
  assert.notEqual(reconstructSecret([1, 2], sim.shares), x);
  assert.equal(o.events.length, 0);
});

const scenarios: { name: string; faults: Parameters<typeof setup>[0]['faults']; Q: number[]; code?: string }[] = [
  { name: 'bad share (dealer 2 -> 4) disqualifies the dealer', faults: { badShare: [[2, 4]] }, Q: [1, 3, 4, 5], code: 'E_DKG_COMPLAINT' },
  { name: 'false complaint (4 accuses 2) disqualifies the accuser', faults: { falseComplaint: [[4, 2]] }, Q: [1, 2, 3, 5], code: 'E_DKG_COMPLAINT' },
  { name: 'missing shares package disqualifies the dealer', faults: { noShares: [3] }, Q: [1, 2, 4, 5], code: 'E_DKG_R2' },
  { name: 'dealer that never reveals is out', faults: { noDealing: [5] }, Q: [1, 2, 3, 4], code: 'E_DKG_R1' },
  { name: 'late dealing (after r1-close) is out', faults: { lateDealing: [1] }, Q: [2, 3, 4, 5], code: 'E_DKG_R1' },
];
for (const sc of scenarios) {
  test(`DKG scenario: ${sc.name}`, async () => {
    const sim = await setup({ seed: `dkg-${sc.name}`, n: 5, t: 3, voters: 0, faults: sc.faults });
    assert.deepEqual(sim.outcome!.Q, sc.Q);
    assert.ok(sim.outcome!.events.some((e) => e.code === sc.code), JSON.stringify(sim.outcome!.events));
    // surviving trustees still have consistent shares and K
    const subset = sc.Q.slice(0, 3);
    const x = reconstructSecret(subset, new Map(subset.map((j) => [j, sim.shares.get(j)!])));
    assert.ok(baseMul(x).equals(sim.outcome!.K));
  });
}

test('DKG aborts when |Q| < t (no manual override)', async () => {
  await assert.rejects(setup({ seed: 'dkg-abort', n: 3, t: 3, voters: 0, faults: { noDealing: [1] } }), /E_DKG_QUORUM/);
});

// ---- direct dealing-level attacks (R-01 #9, #10)
const mkInput = (extra: Partial<DkgInput>): DkgInput => {
  const markers: MarkerSeqs = { 'dkg-open': 1, 'dkg-r1-open': 10, 'dkg-r1-close': 20, 'dkg-r2-close': 30, 'dkg-r3-close': 40, 'dkg-final': 50 };
  return { mh, n: 3, t: 2, markers, commits: [], dealings: [], shares: [], complaints: [], ...extra };
};

test('rogue-key: dealer publishing A0 = Y - others without knowing its dlog fails the PoK', () => {
  const d1 = dkgDeal(mh, 1, 2, rng);
  const d2 = dkgDeal(mh, 2, 2, rng);
  const Y = baseMul(scalarRandomNonZero(rng)); // attacker's desired joint key
  const A0others = [d1.body.coeffs[0]!.A, d2.body.coeffs[0]!.A].map((h) => hexToBytes(h, 32));
  void A0others;
  const rogue = clone(dkgDeal(mh, 3, 2, rng).body);
  const sumOthers = pointAdd(baseMul(1n), baseMul(2n)); // stand-in for the honest sum
  rogue.coeffs[0]!.A = H(pointToBytes(pointSub(Y, sumOthers)));
  const r = checkDealing(mh, 2, rogue);
  assert.ok(!r.ok && r.error === 'E_DKG_R1');
});

test('replay: another trustee\'s dealing (incl. PoKs) republished under a different index fails', () => {
  const d1 = dkgDeal(mh, 1, 2, rng);
  const replay = clone(d1.body);
  replay.i = 2;
  assert.ok(!checkDealing(mh, 2, replay).ok);
  // and under another manifest
  assert.ok(!checkDealing(h256('manifest', utf8('other')), 2, d1.body).ok);
  assert.ok(checkDealing(mh, 2, d1.body).ok);
});

test('identity commitments are rejected (A_k and E)', () => {
  const d = dkgDeal(mh, 1, 2, rng);
  const idHex = '00'.repeat(32);
  const a = clone(d.body);
  a.coeffs[1]!.A = idHex;
  assert.ok(!checkDealing(mh, 2, a).ok);
  const e = clone(d.body);
  e.enc.E = idHex;
  assert.ok(!checkDealing(mh, 2, e).ok);
});

test('wrong coefficient count / malformed encodings / non-canonical scalar in PoK', () => {
  const d = dkgDeal(mh, 1, 3, rng);
  assert.ok(!checkDealing(mh, 2, d.body).ok, 'count mismatch');
  const bad = clone(d.body);
  bad.coeffs[0]!.A = 'ff'.repeat(32);
  assert.ok(!checkDealing(mh, 3, bad).ok);
  const nc = clone(d.body);
  nc.coeffs[0]!.s = 'ff'.repeat(32);
  assert.ok(!checkDealing(mh, 3, nc).ok);
});

test('commit/reveal: reveal must match the round-0 hash; late commit rejected; equivocation disqualifies', async () => {
  const ds = [1, 2, 3].map((i) => dkgDeal(mh, i, 2, rng));
  const commits = ds.map((d, k) => ({ seq: 2 + k, body: d.commit }));
  const dealings = ds.map((d, k) => ({ seq: 11 + k, body: d.body }));
  const base = mkInput({ commits, dealings });
  // no shares: everybody fails R2 -> |Q| < t
  const r0 = await adjudicateDkg(base);
  assert.ok(!r0.ok && r0.error === 'E_DKG_QUORUM');
  // dealer 2 reveals something other than committed
  const other = dkgDeal(mh, 2, 2, rng);
  const r1 = await adjudicateDkg(mkInput({ commits, dealings: [dealings[0]!, { seq: 12, body: other.body }, dealings[2]!] }));
  assert.ok(!r1.ok);
  // equivocation: two different dealings from 1
  const r2 = await adjudicateDkg(mkInput({ commits, dealings: [...dealings, { seq: 15, body: dkgDeal(mh, 1, 2, rng).body }] }));
  assert.ok(!r2.ok);
  // commit published after r1-open is not timely
  const late = commits.map((c, k) => (k === 0 ? { ...c, seq: 12 } : c));
  const r3 = await adjudicateDkg(mkInput({ commits: late, dealings }));
  assert.ok(!r3.ok);
  assert.equal(H(dealingCommitHash(mh, 1, ds[0]!.body)), ds[0]!.commit.h);
});

test('duplicate A_0 among PoK-valid dealers disqualifies both (copy hygiene)', async () => {
  const a0 = scalarRandomNonZero(rng);
  const ds = [dkgDeal(mh, 1, 1, rng, a0), dkgDeal(mh, 2, 1, rng, a0), dkgDeal(mh, 3, 1, rng)];
  const r = await adjudicateDkg(
    mkInput({
      t: 1,
      commits: ds.map((d, k) => ({ seq: 2 + k, body: d.commit })),
      dealings: ds.map((d, k) => ({ seq: 11 + k, body: d.body })),
      shares: [{ seq: 21, body: { proto: 'qv1-r255-sha2', type: 'dkg-shares', i: 3, shares: [] } }],
    }),
  );
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value.Q, [3]);
    assert.equal(r.value.events.filter((e) => e.detail === 'duplicate A_0').length, 2);
  }
});
