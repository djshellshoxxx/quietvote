// Second-wave triage (docs/audit/crypto-protocol.md, "Second-wave triage"). Each test was written to fail before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, decProve, hexToBytes, scalarToBytes, type Scalar } from '@quietvote/crypto';
import {
  aggregate, analyzeBallotLog, buildBallot, buildTally, makeCast, makeSpoil, shareKey, signRecord, trusteeDecryptTally,
  validateManifest, verifyElection, NO_SUPERSEDES, type ElectionBundle, type KeyconfBody, type ShareSet, type TallyBody,
} from '../src/index.ts';
import {
  bundleOf, castBallot, clone, closeElection, defaultContests, publishTally, push, setup, trusteeKeyFor, voterEnvelopes, type Sim,
} from './helpers/sim.ts';

const H = bytesToHex;
const contests = defaultContests().filter((c) => c.id === 'budget');

async function finished(seed: string, voters = 4, cast = 3): Promise<Sim> {
  const sim = await setup({ seed, n: 3, t: 2, voters, contests });
  for (let i = 0; i < cast; i++) castBallot(sim, i, { budget: [i % 2 === 0 ? 'yes' : 'no'] });
  closeElection(sim);
  return sim;
}

test('P3: a second, different tally record makes the verdict FAIL (identical duplicate stays L)', async () => {
  const sim = await finished('sw-p3');
  publishTally(sim, [1, 2]);
  const first = sim.log[sim.log.length - 1]!.entry as { body: TallyBody };
  const dup = clone(bundleOf(sim));
  dup.log.push({ seq: sim.seq + 1, entry: clone(first) });
  const rd = await verifyElection(dup);
  assert.equal(rd.verdict, 'PASS', JSON.stringify(rd.findings));
  const forged = clone(first.body);
  forged.contests[0]!.options[0]!.T += 1;
  const c = sim.coord[0]!;
  const bad = clone(bundleOf(sim));
  bad.log.push({ seq: sim.seq + 1, entry: signRecord(c.secretKey, c.publicKey, sim.params!.ctx, forged) });
  const r = await verifyElection(bad);
  assert.equal(r.verdict, 'FAIL', JSON.stringify(r.findings));
  assert.ok(r.findings.some((f) => f.cls === 'F' && /conflicting tally/.test(f.detail)));
});

test('P4/REQ-015: a voter-signed spoil whose attached reveal is bad still spoils its code; the same body cast later is excluded', async () => {
  const sim = await setup({ seed: 'sw-p4', n: 3, t: 2, voters: 4, contests });
  const p = sim.params!;
  const v = sim.voters[0]!;
  const b = buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'] }, sim.rng, 0);
  assert.ok(b.ok);
  const spoil = makeSpoil(p, v.secretKey, b.value, 'publish');
  assert.ok(spoil.reveal !== undefined);
  spoil.reveal.selections = { budget: ['no'] }; // reveal no longer matches the signed reveal_digest
  push(sim, spoil);
  push(sim, makeCast(p, v.secretKey, b.value));
  closeElection(sim);
  const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  assert.equal(an.counted.length, 0, 'the spoiled code must never be counted');
  assert.ok(an.spoiled.has(H(b.value.code)));
  assert.ok(an.findings.some((f) => f.code === 'E_SPOIL_MISMATCH' && f.cls === 'ALARM'));
  assert.ok(an.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST' && f.cls === 'ALARM'));
  assert.equal(an.checkFailures.benaloh, false);
});

test('P6: bidi controls / non-NFC text in trustee and witness names are rejected', async () => {
  const sim = await setup({ seed: 'sw-p6', n: 3, t: 2, voters: 4, contests });
  const m = clone(sim.manifest);
  assert.ok(validateManifest(m, 4).ok);
  const t1 = clone(m);
  t1.trustees[0]!.name = 'Alice‮ecilA';
  assert.equal(validateManifest(t1, 4).ok, false);
  const t2 = clone(m);
  t2.trustees[0]!.name = 'José';
  assert.equal(validateManifest(t2, 4).ok, false);
  const w = clone(m);
  w.bb.witnesses = [{ name: 'w⁦itness', pk: m.coordinator.keys[0]! }];
  w.bb.witness_quorum = 1;
  assert.equal(validateManifest(w, 4).ok, false);
});

test('P7/TSV-03: below the floor, decrypt is not reported as pass and the rules failure is not overwritten', async () => {
  const sim = await finished('sw-p7', 4, 2); // floor 3 (roll < 8), 2 counted
  const p = sim.params!;
  const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  assert.equal(an.counted.length, 2);
  const aggs = aggregate(p, an.counted);
  const shares = new Map<number, ShareSet>();
  for (const j of [1, 2]) {
    const k = trusteeKeyFor(sim, j);
    const set: ShareSet = new Map();
    for (const [cid, mm] of aggs) for (const [oid, a] of mm) {
      const { M, proof } = decProve({ ctx: p.ctx, cid, oid, j, Yj: k.Yj, A: a.A, B: a.B }, k.sj, sim.rng);
      set.set(shareKey(cid, oid), { M, c: proof.c, s: proof.s });
    }
    shares.set(j, set);
  }
  const t = buildTally(p, { analysis: an, shares, Y: sim.outcome!.Y, decrypters: new Set(sim.outcome!.Q), rollSize: 4, spoiled: [] });
  assert.ok(t.ok);
  const c = sim.coord[0]!;
  push(sim, signRecord(c.secretKey, c.publicKey, p.ctx, t.value.body));
  const r = await verifyElection(bundleOf(sim));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.findings.some((f) => f.code === 'E_BELOW_FLOOR'));
  assert.equal(r.checks['chk.result.rules'], 'fail');
  assert.equal(r.checks['chk.tally.decrypt'], 'not_run');
});

test('P9: an invalid keyconf does not shadow a later valid keyconf of the same trustee', async () => {
  const sim = await finished('sw-p9');
  publishTally(sim, [1, 2]);
  const b: ElectionBundle = clone(bundleOf(sim));
  const kcIdx = b.log.map((e, i) => [e, i] as const).filter(([e]) => (e.entry as { body?: { type?: string } }).body?.type === 'dkg-keyconf').map(([, i]) => i);
  assert.equal(kcIdx.length, 3);
  const kc = kcIdx.map((i) => b.log[i]!.entry as { body: KeyconfBody });
  const j1 = kc.find((x) => x.body.j === 1)!;
  const j2 = kc.find((x) => x.body.j === 2)!;
  const badBody: KeyconfBody = { ...j1.body, s: H(scalarToBytes(((BigInt('0x' + H(hexToBytes(j1.body.s, 32).reverse())) + 1n) % 7237005577332262213973186563042994240857116359379907606001950938285454250989n) as Scalar)) };
  const tk = sim.trusteeKeys[0]!;
  const bad = signRecord(tk.secretKey, tk.publicKey, sim.mh, badBody);
  b.log[kcIdx[0]!]!.entry = bad;
  b.log[kcIdx[1]!]!.entry = j1;
  b.log[kcIdx[2]!]!.entry = j2;
  const r = await verifyElection(b);
  assert.ok(r.findings.some((f) => f.code === 'E_DKG_KEYCONF' && f.cls === 'L'), JSON.stringify(r.findings));
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
});

test('P11: tally.decrypters must equal the recomputed T_valid', async () => {
  const sim = await finished('sw-p11');
  publishTally(sim, [1, 3]);
  const ok = await verifyElection(bundleOf(sim));
  assert.equal(ok.verdict, 'PASS', JSON.stringify(ok.findings));
  const b = clone(bundleOf(sim));
  const rec = b.log[b.log.length - 1]!.entry as { body: TallyBody };
  rec.body.decrypters = [1, 2, 3];
  const r = await verifyElection(b);
  assert.equal(r.verdict, 'FAIL', JSON.stringify(r.findings));
  assert.equal(r.checks['chk.tally.decrypt'], 'fail');
});

test('P2: trusteeDecryptTally refuses a counted list that repeats a voter (floor padding / single-ballot decryption)', async () => {
  const sim = await finished('sw-p2');
  const p = sim.params!;
  const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  const one = an.counted[0]!;
  const r = trusteeDecryptTally(p, trusteeKeyFor(sim, 1), [one, one, one], undefined, 4, sim.rng);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error === 'E_TRUSTEE_REFUSE');
  const twin = { ...an.counted[1]!, code: one.code };
  const r2 = trusteeDecryptTally(p, trusteeKeyFor(sim, 1), [one, twin, an.counted[2]!], undefined, 4, sim.rng);
  assert.ok(!r2.ok && r2.error === 'E_TRUSTEE_REFUSE');
  assert.ok(trusteeDecryptTally(p, trusteeKeyFor(sim, 1), an.counted, undefined, 4, sim.rng).ok);
});
