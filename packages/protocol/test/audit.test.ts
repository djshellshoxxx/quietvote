import test from 'node:test';
import assert from 'node:assert/strict';
import { ballotCode, buildBallot, check, lit, obj, hex, makeCast, makeSpoil, verifyEnvelope, analyzeBallotLog, NO_SUPERSEDES, type BallotBody } from '../src/index.ts';
import { castBallot, closeElection, defaultContests, setup, push, spoilBallot, voterEnvelopes } from './helpers/sim.ts';

test('CP-03: closed schema is not fooled by Object.prototype names', () => {
  const s = obj({ a: lit('x') }, { b: hex(32) });
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const o = JSON.parse(`{"a":"x","${k}":1}`) as unknown;
    assert.notEqual(check(s, o), null, k);
  }
  const noA = JSON.parse('{"constructor":1}') as unknown;
  assert.match(check(s, noA) ?? '', /unknown field|missing/);
  assert.equal(check(s, { a: 'x' }), null);
});

const contests = defaultContests().filter((c) => c.id === 'budget');

for (const mode of ['publish', 'trustees', 'private'] as const) {
  for (const order of ['cast-then-spoil', 'spoil-then-cast'] as const) {
    test(`CP-01: a ${mode} spoil that re-wraps a cast ballot's ciphertexts (${order}) is excluded and alarmed`, async () => {
      const sim = await setup({ seed: `cp01-${mode}-${order}`, n: 3, t: 2, voters: 4, contests, spoilTrustees: true });
      const p = sim.params!;
      const v = sim.voters[0]!;
      const b = buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, { budget: ['yes'] }, sim.rng, 0);
      assert.ok(b.ok);
      const cast = makeCast(p, v.secretKey, b.value);
      const body: BallotBody = structuredClone(b.value.body);
      body.supersedes = '22'.repeat(32); // spoils are not chain-checked; proofs bind only (ctx, voter)
      const spoil = makeSpoil(p, v.secretKey, { ...b.value, body, code: ballotCode(p.ctx, body) }, mode);
      assert.ok(verifyEnvelope(p, new Set(sim.rollHex), spoil).ok, 'precondition: valid envelope');
      if (order === 'cast-then-spoil') { push(sim, cast); push(sim, spoil); } else { push(sim, spoil); push(sim, cast); }
      closeElection(sim);
      const an = analyzeBallotLog(p, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
      assert.equal(an.spoiled.size, 0);
      assert.ok(an.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST' && f.cls === 'ALARM' && /re-wrapped/.test(f.detail)), JSON.stringify(an.findings));
      assert.equal(an.checkFailures.benaloh, false);
      assert.equal(an.counted.length, 1);
    });
  }
}

test('CP-01 control: an honest spoil followed by an honest re-vote (fresh randomness) is not flagged', async () => {
  const sim = await setup({ seed: 'cp01-control', n: 3, t: 2, voters: 4, contests, spoilTrustees: true });
  spoilBallot(sim, 0, { budget: ['yes'] }, 'trustees');
  castBallot(sim, 0, { budget: ['yes'] });
  closeElection(sim);
  const an = analyzeBallotLog(sim.params!, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  assert.equal(an.spoiled.size, 1);
  assert.equal(an.checkFailures.benaloh, true);
});
