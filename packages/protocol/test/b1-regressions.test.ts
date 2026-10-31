import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@quietvote/crypto';
import * as protocol from '../src/index.ts';
import { analyzeBallotLog, ballotCode, buildBallot, makeCast, makeSpoil, NO_SUPERSEDES, verifyElection } from '../src/index.ts';
import { bundleOf, castBallot, closeElection, defaultContests, publishTally, setup, trusteeKeyFor, voterEnvelopes } from './helpers/sim.ts';

const contests = defaultContests().filter((c) => c.id === 'budget');
for (const position of ['over-limit', 'before-open', 'after-close'] as const) {
  test(`B1-01: a signed spoil ${position} still excludes the same code from counting`, async () => {
    const sim = await setup({ seed: `b1-01-${position}`, n: 3, t: 2, voters: 4, contests, maxSpoils: 0 });
    const p = sim.params!;
    const v = sim.voters[0]!;
    const built = buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'] }, sim.rng, 0);
    assert.ok(built.ok);
    const spoil = makeSpoil(p, v.secretKey, built.value, 'publish');
    const entries = [
      { seq: position === 'before-open' ? 1 : position === 'after-close' ? 5 : 3, raw: spoil },
      { seq: 3, raw: makeCast(p, v.secretKey, built.value) },
    ].sort((a, b) => a.seq - b.seq);
    const result = analyzeBallotLog(p, new Set(sim.rollHex), entries, 2, 4);
    assert.equal(result.counted.length, 0);
    assert.ok(result.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST'));
    assert.equal(result.checkFailures.benaloh, false);
    if (position === 'over-limit') assert.ok(result.findings.some((f) => f.code === 'E_REVOTE_LIMIT'));
    else assert.equal(result.checkFailures.window, false);
    assert.equal(bytesToHex(built.value.code).length, 64);
  });
}

for (const outside of [false, true]) {
  test(`CP-01/B1-01: rewrapped signed spoil is flagged even ${outside ? 'after close' : 'above the audit limit'}`, async () => {
    const sim = await setup({ seed: `b1-cp01-${outside}`, n: 3, t: 2, voters: 4, contests, maxSpoils: 0 });
    const p = sim.params!;
    const v = sim.voters[0]!;
    const b = buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'] }, sim.rng, 0);
    assert.ok(b.ok);
    const body = { ...b.value.body, supersedes: '22'.repeat(32) };
    const spoil = makeSpoil(p, v.secretKey, { ...b.value, body, code: ballotCode(p.ctx, body) }, 'publish');
    const result = analyzeBallotLog(p, new Set(sim.rollHex), [
      { seq: 3, raw: makeCast(p, v.secretKey, b.value) }, { seq: outside ? 5 : 3, raw: spoil },
    ], 2, 4);
    assert.equal(result.counted.length, 1);
    assert.equal(result.spoiled.size, 0, 'inadmissible audit must not reach trustee relays');
    assert.equal(result.checkFailures.benaloh, false);
    assert.ok(result.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST'));
  });
}

test('B1-13: manifest envelope and signature members are closed schemas', async () => {
  const sim = await setup({ seed: 'b1-13', n: 3, t: 2, voters: 4, contests });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  closeElection(sim);
  publishTally(sim, [1, 2]);
  assert.equal((await verifyElection(bundleOf(sim))).verdict, 'PASS');
  for (const location of ['envelope', 'signature']) {
    const bundle = structuredClone(bundleOf(sim));
    const target = location === 'envelope' ? bundle.manifest : bundle.manifest.sigs[0]!;
    Object.assign(target, { extra: 'unsigned malleability' });
    const report = await verifyElection(bundle);
    assert.equal(report.verdict, 'FAIL', location);
    assert.equal(report.checks['chk.encoding.canonical'], 'fail');
    assert.ok(report.findings.some((f) => f.code === 'E_SCHEMA'));
  }
  const unsigned = structuredClone(bundleOf(sim));
  unsigned.manifest.sigs = [];
  assert.ok((await verifyElection(unsigned)).findings.some((f) => f.code === 'E_MANIFEST_SIG'), 'missing signatures retain their registered error code');
  const future = structuredClone(bundleOf(sim));
  Object.assign(future.manifest.body, { proto: 'future-protocol' });
  assert.ok((await verifyElection(future)).findings.some((f) => f.code === 'E_VERSION'), 'version checks retain their registered error code');
});

test('B2-01: draft assembly from an admitted aggregate equals independently recomputed tally', async () => {
  const helper = (protocol as unknown as Record<string, unknown>).buildTallyFromAggregate;
  assert.equal(typeof helper, 'function', 'aggregate assembly helper is available');
  const sim = await setup({ seed: 'b2-01-helper', n: 3, t: 2, voters: 4, contests });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  closeElection(sim);
  const p = sim.params!;
  const analysis = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  const shares = new Map<number, protocol.ShareSet>();
  for (const j of [1, 2]) {
    const share = protocol.trusteeDecryptTally(p, trusteeKeyFor(sim, j), analysis.counted, undefined, 4, sim.rng);
    assert.ok(share.ok);
    shares.set(j, share.value);
  }
  const inputs = { shares, Y: sim.outcome!.Y, decrypters: new Set(sim.outcome!.Q), rollSize: 4, spoiled: [] };
  const expected = protocol.buildTally(p, { ...inputs, analysis });
  const supplied = { ...inputs, nCounted: analysis.counted.length, countedRoot: protocol.countedRoot(analysis.counted), aggs: protocol.aggregate(p, analysis.counted) };
  const assemble = helper as (p: protocol.ElectionParams, inp: typeof supplied) => typeof expected;
  assert.deepEqual(assemble(p, supplied), expected);
  const corrupted = new Map(shares);
  corrupted.delete(2);
  assert.equal(assemble(p, { ...supplied, shares: corrupted }).ok, false, 'still verifies threshold shares');
});

test('B1-11: a late false complaint cannot disqualify its accuser', async () => {
  const sim = await setup({ seed: 'b1-late-complaint', n: 3, t: 2, voters: 4, contests, faults: { falseComplaint: [[2, 1]] } });
  assert.deepEqual(sim.outcome!.Q, [1, 3], 'timely control: false accuser was disqualified');
  const typed = sim.log.map(({ seq, entry }) => ({ seq, body: (entry as { body: Record<string, unknown> }).body }));
  const take = (type: string): never => typed.filter((e) => e.body.type === type) as never;
  const markers = Object.fromEntries(typed.filter((e) => e.body.type === 'marker').map((e) => [e.body.name, e.seq])) as protocol.MarkerSeqs;
  const complaints = typed.filter((e) => e.body.type === 'dkg-complaint').map((e) => ({ ...e, seq: markers['dkg-r3-close'] + 1 }));
  const result = await protocol.adjudicateDkg({ mh: sim.mh, n: 3, t: 2, markers,
    commits: take('dkg-commit'), dealings: take('dkg-dealing'), shares: take('dkg-shares'), complaints: complaints as never });
  assert.ok(result.ok);
  assert.deepEqual(result.value.Q, [1, 2, 3]);
});

test('B1-11: a key confirmation after dkg-final cannot complete the decrypter quorum', async () => {
  const sim = await setup({ seed: 'b1-late-keyconf', n: 3, t: 3, voters: 4, contests });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  closeElection(sim);
  publishTally(sim, [1, 2, 3]);
  const bundle = structuredClone(bundleOf(sim));
  assert.equal((await verifyElection(bundle)).verdict, 'PASS', 'timely keyconf control');
  const index = bundle.log.findIndex((e) => (e.entry as { body?: { type?: string } }).body?.type === 'dkg-keyconf');
  const [late] = bundle.log.splice(index, 1);
  assert.ok(late);
  bundle.log.push({ ...late, seq: sim.seq + 1 });
  const report = await verifyElection(bundle);
  assert.equal(report.verdict, 'FAIL');
  assert.ok(report.findings.some((f) => f.code === 'E_DKG_KEYCONF'));
});
