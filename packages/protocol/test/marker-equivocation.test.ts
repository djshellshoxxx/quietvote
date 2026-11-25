// QV-ADR-027 / P10: authenticate first, then compare canonical election marker bodies.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  signRecordRaw, verifyElection, type ElectionBundle, type MarkerBody, type MultiSignedRecord, type VerificationReport,
} from '../src/index.ts';
import { bundleOf, castBallot, clone, closeElection, defaultContests, kp, publishTally, setup } from './helpers/sim.ts';

const sim = await setup({ seed: 'p10-marker-equivocation', n: 3, t: 2, voters: 4, contests: [defaultContests()[0]!] });
for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: [i % 2 === 0 ? 'yes' : 'no'] });
closeElection(sim);
publishTally(sim, [1, 3]);
const baseline = bundleOf(sim);
const expected = await verifyElection(baseline, { allowNoLog: true });
const outsider = kp('p10-marker-equivocation', 'outsider');
const names = ['election-open', 'election-close'] as const;

function marker(b: ElectionBundle, name: typeof names[number]): MultiSignedRecord<MarkerBody> {
  return b.log.find((r) => (r.entry as { body?: MarkerBody }).body?.name === name)!.entry as MultiSignedRecord<MarkerBody>;
}

function signed(body: MarkerBody, key = sim.coord[0]!): MultiSignedRecord<MarkerBody> {
  return { body, sigs: [signRecordRaw(key.secretKey, key.publicKey, sim.params!.ctx, 'marker', body)] };
}

function append(b: ElectionBundle, entry: MultiSignedRecord<MarkerBody>): void {
  b.log.push({ seq: b.log[b.log.length - 1]!.seq + 1, entry });
}

function assertPass(r: VerificationReport): void {
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  assert.equal(r.checks['chk.time.window'], 'pass');
  assert.deepEqual(r.results, expected.results);
  assert.equal(r.counts.counted, expected.counts.counted);
}

test('P10: honest election retains its result and default log gate', async () => {
  assertPass(expected);
  assert.equal(expected.counts.counted, 3);
  assert.ok(expected.results !== undefined);
  assert.equal((await verifyElection(baseline)).verdict, 'INCOMPLETE');
});

for (const name of names) {
  test(`P10: identical ${name} bodies remain L despite key/signature array order`, async () => {
    const b = clone(baseline);
    const first = marker(b, name);
    // Both records satisfy the coordinator threshold; the extra signature is not a coordinator vote.
    first.sigs.push(signed(first.body, outsider).sigs[0]!);
    const repeat = clone(first);
    repeat.body = Object.fromEntries(Object.entries(repeat.body).reverse()) as unknown as MarkerBody;
    repeat.sigs.reverse();
    assert.notDeepEqual(first.sigs, repeat.sigs);
    append(b, repeat);
    const r = await verifyElection(b, { allowNoLog: true });
    assertPass(r);
    assert.ok(r.findings.some((f) => f.code === 'E_MARKERS' && f.cls === 'L'));
    assert.ok(!r.findings.some((f) => f.cls === 'F'));
  });

  test(`P10: differing authenticated ${name} bodies fail the window and stop dependents`, async () => {
    for (const changedFirst of [false, true]) {
      const b = clone(baseline);
      const first = marker(b, name);
      const original = clone(first);
      // qmask is an existing closed-schema field, unlike the decision's illustrative opens_at.
      const changed = signed({ ...first.body, qmask: 1 });
      if (changedFirst) Object.assign(first, changed);
      append(b, changedFirst ? original : changed);
      for (const allowNoLog of [false, true]) {
        const r = await verifyElection(b, { allowNoLog });
        assert.equal(r.verdict, 'FAIL', JSON.stringify(r.findings));
        assert.equal(r.checks['chk.time.window'], 'fail');
        assert.ok(r.findings.some((f) => f.code === 'E_MARKERS' && f.cls === 'F'));
        for (const check of ['chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees'] as const) {
          assert.equal(r.checks[check], 'pass', check);
        }
        for (const check of ['chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules', 'chk.benaloh.spoiled'] as const) {
          assert.equal(r.checks[check], 'not_run', check);
        }
        assert.equal(r.counts.counted, 0);
        assert.equal(r.countedBallots, undefined);
        assert.equal(r.results, undefined);
      }
    }
  });

  test(`P10: invalid or unauthorized ${name} signatures cannot poison the valid marker`, async () => {
    for (const before of [false, true]) for (const badSignature of [false, true]) {
      const b = clone(baseline);
      const body = { ...marker(b, name).body, qmask: 1 };
      // An outsider's valid signature contributes zero of the required one coordinator signatures.
      const junk = signed(body, badSignature ? sim.coord[0]! : outsider);
      if (badSignature) junk.sigs[0]!.sig = '00'.repeat(64);
      if (before) b.log.unshift({ seq: 0, entry: junk });
      else append(b, junk);
      const r = await verifyElection(b, { allowNoLog: true });
      assertPass(r);
      assert.ok(r.findings.some((f) => f.code === 'E_SIG' && f.cls === 'L'));
      assert.ok(!r.findings.some((f) => f.code === 'E_MARKERS'));
    }
  });
}
