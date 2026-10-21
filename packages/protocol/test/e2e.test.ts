import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { evaluateAll, verifyElectionText } from '../src/index.ts';
import { bundleOf, castBallot, closeElection, defaultContests, publishTally, setup, spoilBallot } from './helpers/sim.ts';

test('end to end: 3-of-5 trustees, 50 voters, revotes, spoiled ballots, one missing trustee', { timeout: 600_000 }, async () => {
  const contests = defaultContests().filter((c) => c.id === 'budget' || c.id === 'board');
  const sim = await setup({
    seed: 'e2e-50', n: 5, t: 3, voters: 50, contests, spoilTrustees: true, maxPerVoter: 4,
    quorum: { type: 'fraction', basis: 'roll', num: 1, den: 2 },
  });
  const r = streamRng('e2e-select');
  const pick = (): Record<string, string[]> => {
    const b = r.bytes(3);
    const budget = b[0]! % 5 === 0 ? [] : [b[0]! % 2 === 0 ? 'yes' : 'no'];
    const ids = ['p', 'q', 'r', 's', 't'].sort(() => (r.bytes(1)[0]! % 2 === 0 ? -1 : 1));
    return { budget, board: ids.slice(0, b[1]! % 3) };
  };
  const final = new Map<number, Record<string, string[]>>();
  const casting = new Set<number>(Array.from({ length: 50 }, (_, i) => i).filter((i) => i % 7 !== 6)); // some abstain
  for (const i of casting) {
    const s = pick();
    castBallot(sim, i, s);
    final.set(i, s);
  }
  // revotes: 12 voters twice, 3 voters three times
  const revoters = [...casting].filter((i) => i % 4 === 0).slice(0, 12);
  for (const i of revoters) {
    const s = pick();
    castBallot(sim, i, s);
    final.set(i, s);
  }
  for (const i of revoters.slice(0, 3)) {
    const s = pick();
    castBallot(sim, i, s);
    final.set(i, s);
  }
  // spoiled ballots: audits (not counted); voters 1, 2, 3 publish reveal, 5 private, 8 trustee-mode, then they cast anew
  spoilBallot(sim, 1, { budget: ['no'], board: ['p'] }, 'publish');
  spoilBallot(sim, 2, { budget: ['yes'], board: [] }, 'publish');
  spoilBallot(sim, 3, { budget: [], board: ['q', 'r'] }, 'publish');
  spoilBallot(sim, 5, { budget: ['yes'], board: ['t'] }, 'private');
  spoilBallot(sim, 8, { budget: ['no'], board: ['s'] }, 'trustees');
  for (const i of [1, 2, 3, 5, 8]) {
    if (!casting.has(i)) continue;
    const s = pick();
    castBallot(sim, i, s);
    final.set(i, s);
  }
  closeElection(sim);
  publishTally(sim, [1, 2, 4, 5], { spoilTrustees: true }); // trustee 3 is missing

  // independent expectation from the plaintext choices
  const expected = new Map<string, Map<string, number>>(contests.map((c) => [c.id, new Map(c.options.map((o) => [o.id, 0]))]));
  for (const s of final.values()) for (const [cid, ids] of Object.entries(s)) for (const id of ids) expected.get(cid)!.set(id, expected.get(cid)!.get(id)! + 1);

  const text = JSON.stringify(bundleOf(sim));
  const rep = await verifyElectionText(text);
  assert.equal(rep.verdict, 'PASS', JSON.stringify(rep.findings.filter((f) => f.cls === 'F')));
  assert.equal(rep.counts.counted, final.size);
  assert.equal(rep.counts.spoiled, 5);
  assert.deepEqual(Object.values(rep.checks).filter((c) => c === 'fail'), []);
  const tally = JSON.parse(text).log.at(-1).entry.body;
  for (const c of tally.contests) for (const o of c.options) assert.equal(o.T, expected.get(c.id)!.get(o.id), `${c.id}/${o.id}`);
  assert.deepEqual(tally.decrypters, [1, 2, 4, 5]);
  assert.equal(tally.spoiled.length, 4 /* 3 published + 1 trustee-mode; private audit is not decrypted */);
  assert.deepEqual(rep.results, evaluateAll(sim.manifest, expected, final.size, 50));
  assert.ok(bytesToHex(new Uint8Array(1)) === '00');
});
