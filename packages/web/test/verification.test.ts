import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signRecord } from '@quietvote/protocol';
import { bundleOf, castBallot, closeElection, publishTally, setup, clone } from '../../protocol/test/helpers/sim.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { canShowResults, verificationSummary, verifyLoadedElection } from '../src/flow/verification.ts';

test('B3-02: genuine proof-verified tally displays; coordinator-signed forged counts are hidden', async () => {
  const sim = await setup({ seed: 'b3-results', n: 3, t: 2, voters: 4, minCounted: 3 });
  for (let i = 0; i < 4; i++) castBallot(sim, i, { budget: ['yes'], chair: ['ann'] });
  closeElection(sim); publishTally(sim, [1, 2]);
  const b = bundleOf(sim);
  const records = [{ seq: 0, record: b.manifest }, ...b.log.map((r) => ({ seq: r.seq, record: r.entry }))];
  const ctx = await deriveElectionContext(records); assert.ok(ctx.ok);
  const good = await verifyLoadedElection(records, ctx.value, b.roll);
  assert.equal(canShowResults(good), true);
  assert.equal(verificationSummary(good).partial, true, 'board evidence is not supplied by this view');
  assert.equal(verificationSummary(good, true).verdict, 'FAIL', 'anchor mismatch overrides visible verdict');
  const rec = records.find((r) => (r.record as any).body?.type === 'tally')!;
  const forged = clone((rec.record as any).body);
  forged.contests[0].options[0].T++;
  const c = sim.coord[0]!;
  rec.record = signRecord(c.secretKey, c.publicKey, sim.params!.ctx, forged);
  const bad = await verifyLoadedElection(records, ctx.value, b.roll);
  assert.equal(bad.verdict, 'FAIL'); assert.equal(canShowResults(bad), false);
  assert.equal(canShowResults(await verifyLoadedElection(records, ctx.value, b.roll.slice(1))), false);
});
