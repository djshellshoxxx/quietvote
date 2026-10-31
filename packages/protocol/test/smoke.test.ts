import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyElection } from '../src/index.ts';
import { bundleOf, castBallot, closeElection, publishTally, setup } from './helpers/sim.ts';

test('smoke: tiny election verifies', async () => {
  const sim = await setup({ seed: 'smoke', n: 3, t: 2, voters: 4 });
  const sels = [
    { budget: ['yes'], chair: ['ann'], topics: ['a', 'b'], board: ['p'] },
    { budget: ['yes'], chair: ['bob'], topics: ['a'], board: ['p', 'q'] },
    { budget: ['no'], chair: ['ann'], topics: [], board: [] },
    { budget: [], chair: ['ann'], topics: ['b'], board: ['s'] },
  ];
  sels.forEach((s, i) => castBallot(sim, i, s));
  closeElection(sim);
  publishTally(sim, [1, 3]);
  const rep = await verifyElection(bundleOf(sim));
  console.log(JSON.stringify(rep, null, 1).slice(0, 3000));
  assert.equal(rep.verdict, 'PASS');
});
