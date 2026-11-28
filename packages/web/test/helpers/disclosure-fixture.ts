// Genuine single-choice and approval tallies with four counted voters on a larger roll.
import { castBallot, closeElection, publishTally, setup } from '../../../protocol/test/helpers/sim.ts';
import { fixtureWitnesses } from './witnessed-board.ts';

export async function disclosureFixture(seed: string, voters: number, pattern: 'mixed' | 'none' | 'single-all' | 'empty') {
  const options = ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase() }));
  const sim = await setup({ seed, n: 3, t: 2, voters, minCounted: 3, boundLog: true, witnessQuorum: 2, witnesses: fixtureWitnesses(seed),
    contests: [
      { id: 'choice', title: 'Single choice', method: 'single-choice', options, selection_limit: 1, min_selections: 0, tie_break: { type: 'declare-tie' } },
      { id: 'approval', title: 'Approval choices', method: 'approval', options, min_selections: 0, winners: 1, tie_break: { type: 'declare-tie' } },
    ],
  });
  if (pattern !== 'empty') {
    const choice = pattern === 'single-all' ? ['a', 'a', 'a', 'a'] : pattern === 'none' ? ['a', 'b', 'c', 'a'] : ['a', 'b', 'a', 'b'];
    const approval = pattern === 'mixed' ? [['a', 'b'], ['a'], ['a', 'b'], ['a']] : [['a', 'b'], ['b', 'c'], ['a', 'c'], ['a']];
    for (let i = 0; i < 4; i++) castBallot(sim, i, { choice: [choice[i]!], approval: approval[i]! });
  }
  closeElection(sim);
  if (pattern !== 'empty') publishTally(sim, [1, 2]);
  return sim;
}
