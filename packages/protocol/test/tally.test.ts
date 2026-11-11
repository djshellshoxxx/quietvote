import test from 'node:test';
import assert from 'node:assert/strict';
import { baseMul, bytesToHex, decProve, ctSum, elgamalEncrypt, pointAdd, scalarRandomNonZero, streamRng, G } from '@quietvote/crypto';
import {
  aggregate, analyzeBallotLog, ballotCode, makeSpoil, verifyEnvelope, decryptAggregates, shareKey, trusteeDecryptSpoiled, trusteeDecryptTally, verifyElection,
  type ShareSet,
} from '../src/index.ts';
import { bundleOf, push, castBallot, closeElection, defaultContests, publishTally, setup, spoilBallot, trusteeKeyFor, voterEnvelopes } from './helpers/sim.ts';

const H = bytesToHex;
const contests = defaultContests().filter((c) => c.id !== 'chair' && c.id !== 'topics');

test('any t-subset of Q decrypts to identical counts; t-1 trustees cannot proceed; canonical subset', async () => {
  const sim = await setup({ seed: 'tally-subsets', n: 5, t: 3, voters: 5, contests });
  const sels = [
    { budget: ['yes'], board: ['p', 'q'] }, { budget: ['yes'], board: ['p'] }, { budget: ['no'], board: ['q', 'r'] },
    { budget: ['yes'], board: [] }, { budget: [], board: ['p', 't'] },
  ];
  sels.forEach((s, i) => castBallot(sim, i, s));
  closeElection(sim);
  const p = sim.params!;
  const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  const aggs = aggregate(p, an.counted);
  const all = new Map<number, ShareSet>();
  for (let j = 1; j <= 5; j++) {
    const r = trusteeDecryptTally(p, trusteeKeyFor(sim, j), an.counted, undefined, 5, sim.rng);
    assert.ok(r.ok);
    if (r.ok) all.set(j, r.value);
  }
  const dec = new Set([1, 2, 3, 4, 5]);
  let first: string | undefined;
  for (const subset of [[1, 2, 3], [2, 4, 5], [1, 3, 5], [3, 4, 5], [1, 2, 3, 4, 5]]) {
    const r = decryptAggregates(p, sim.outcome!.Y, dec, aggs, 5, new Map(subset.map((j) => [j, all.get(j)!])));
    assert.ok(r.ok);
    if (r.ok) {
      const s = JSON.stringify([...r.value.counts].map(([k, m]) => [k, [...m]]));
      first ??= s;
      assert.equal(s, first);
      assert.deepEqual(r.value.S, subset.slice(0, 3));
    }
  }
  assert.equal(JSON.parse(first!)[0][1][0][1], 3); // yes
  const two = decryptAggregates(p, sim.outcome!.Y, dec, aggs, 5, new Map([1, 2].map((j) => [j, all.get(j)!])));
  assert.ok(!two.ok && two.error === 'E_TALLY_INSUFFICIENT');
  // a bad trustee among five is ignored; the rest still reach t
  const wrong = new Map(all);
  const s1 = new Map(all.get(1)!);
  const k = shareKey('budget', 'yes');
  s1.set(k, { ...s1.get(k)!, M: pointAdd(s1.get(k)!.M, G) });
  wrong.set(1, s1);
  const r2 = decryptAggregates(p, sim.outcome!.Y, dec, aggs, 5, wrong);
  assert.ok(r2.ok);
  if (r2.ok) {
    assert.deepEqual(r2.value.invalid, [1]);
    assert.deepEqual(r2.value.S, [2, 3, 4]);
  }
  // trustee not in the confirmed decrypter set is not accepted
  const r3 = decryptAggregates(p, sim.outcome!.Y, new Set([2, 3]), aggs, 5, new Map([1, 2, 3].map((j) => [j, all.get(j)!])));
  assert.ok(!r3.ok);
});

test('trustee refuses: claimed sub-aggregate, tampered aggregate, below privacy floor', async () => {
  const sim = await setup({ seed: 'tally-refuse', n: 3, t: 2, voters: 4, contests: [contests[0]!] });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  closeElection(sim);
  const p = sim.params!;
  const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  assert.equal(an.counted.length, 3);
  const key = trusteeKeyFor(sim, 1);
  // coordinator asks to decrypt a single ballot (decryption oracle) disguised as the aggregate
  const sub = aggregate(p, [an.counted[0]!]);
  const r = trusteeDecryptTally(p, key, an.counted, sub, 4, sim.rng);
  assert.ok(!r.ok && r.error === 'E_TRUSTEE_REFUSE');
  // extra ciphertext in the claim
  const extra = aggregate(p, an.counted);
  extra.get('budget')!.set('zzz', { A: baseMul(1n), B: baseMul(2n) });
  const r2 = trusteeDecryptTally(p, key, an.counted, extra, 4, sim.rng);
  assert.ok(!r2.ok && r2.error === 'E_TRUSTEE_REFUSE');
  // honest claim passes
  assert.ok(trusteeDecryptTally(p, key, an.counted, aggregate(p, an.counted), 4, sim.rng).ok);
  // privacy floor: two counted ballots < floor 3
  const r3 = trusteeDecryptTally(p, key, an.counted.slice(0, 2), undefined, 4, sim.rng);
  assert.ok(!r3.ok && r3.error === 'E_BELOW_FLOOR');
  // trustee-mode spoil decryption is refused unless the manifest enables it
  const sp = spoilBallot(sim, 3, { budget: ['no'] }, 'trustees');
  void sp;
  const an2 = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq! + 100);
  const rec = [...an2.spoiled.values()][0]!;
  const rr = trusteeDecryptSpoiled(p, key, rec, sim.rng);
  assert.ok(!rr.ok && rr.error === 'E_TRUSTEE_REFUSE');
});

test('trustee-mode spoil decryption (manifest-enabled) verifies end to end', async () => {
  const sim = await setup({ seed: 'tally-spoil-trustees', n: 3, t: 2, voters: 4, contests: [contests[1]!], spoilTrustees: true });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { board: ['p', 'q'] });
  spoilBallot(sim, 3, { board: ['r'] }, 'trustees');
  closeElection(sim);
  publishTally(sim, [2, 3], { spoilTrustees: true });
  const rep = await verifyElection(bundleOf(sim));
  assert.equal(rep.verdict, 'PASS', JSON.stringify(rep.findings));
  assert.equal(rep.checks['chk.benaloh.spoiled'], 'pass');
});

test('BSGS miss / count above V is a failure, never zero (R-01 #14)', async () => {
  const sim = await setup({ seed: 'tally-range', n: 3, t: 2, voters: 3, contests: [contests[0]!] });
  const p = sim.params!;
  // aggregate encrypting 9 while only V = 3 ballots are claimed
  const ct = ctSum([elgamalEncrypt(p.K, 9, scalarRandomNonZero(streamRng('r')))]);
  const aggs = new Map([['budget', new Map([['yes', ct], ['no', ct]])]]);
  const shares = new Map<number, ShareSet>();
  for (const j of [1, 2]) {
    const key = trusteeKeyFor(sim, j);
    const set: ShareSet = new Map();
    for (const oid of ['yes', 'no']) {
      const { M, proof } = decProve({ ctx: p.ctx, cid: 'budget', oid, j, Yj: key.Yj, A: ct.A, B: ct.B }, key.sj, sim.rng);
      set.set(shareKey('budget', oid), { M, c: proof.c, s: proof.s });
    }
    shares.set(j, set);
  }
  const r = decryptAggregates(p, sim.outcome!.Y, new Set([1, 2, 3]), aggs, 3, shares);
  assert.ok(!r.ok && r.error === 'E_DLOG_RANGE');
  const ok = decryptAggregates(p, sim.outcome!.Y, new Set([1, 2, 3]), aggs, 9, shares);
  // V large enough for each count, but the per-contest sum bound (limit 1 x V = 9 < 18) still fails
  assert.ok(!ok.ok && ok.error === 'E_DLOG_RANGE' && /sum bound/.test(ok.detail ?? ''));
  void H;
});

test('TR-01: a trustees-mode spoil that re-wraps a cast ballot\'s ciphertexts is flagged, never PASS', async () => {
  const sim = await setup({ seed: 'tally-spoil-rewrap', n: 3, t: 2, voters: 4, contests: [contests[1]!], spoilTrustees: true });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { board: ['p', 'q'] });
  const { built } = castBallot(sim, 3, { board: ['r'] });
  const p = sim.params!;
  const v = sim.voters[3]!;
  const body = structuredClone(built.body);
  body.supersedes = '11'.repeat(32); // spoils are not chain-checked; proofs bind only (ctx, voter)
  const rewrapped = { ...built, body, code: ballotCode(p.ctx, body) };
  const spoil = makeSpoil(p, v.secretKey, rewrapped, 'trustees');
  assert.ok(verifyEnvelope(p, new Set(sim.rollHex), spoil).ok, 'precondition: the re-wrapped spoil is a valid envelope');
  push(sim, spoil);
  sim.built.push(rewrapped);
  closeElection(sim);
  publishTally(sim, [2, 3], { spoilTrustees: true });
  const rep = await verifyElection(bundleOf(sim));
  assert.equal(rep.checks['chk.benaloh.spoiled'], 'fail');
  assert.ok(rep.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST' && /re-wrapped/.test(f.detail ?? '')), JSON.stringify(rep.findings));
});
