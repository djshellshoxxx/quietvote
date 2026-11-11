// S3 confidentiality review — VERIFY the CP-01/TR-01 fix holds (re-wrapped cast ballot as a trustees-mode spoil).
// Not picked up by the test glob (name ends .repro.ts). Run: node --test packages/protocol/test/s3-spoil-rewrap.repro.ts
//
// Attack (the original CP-01): a voter casts a ballot (counted), then re-wraps the SAME ciphertexts and voter-bound
// proofs as a trustees-mode spoil, changing only `supersedes` (which the CDS/limit proofs do NOT bind), so the spoil
// gets a DIFFERENT ballot code. If trustees then decrypt the spoil, the coordinator learns the CAST vote without the
// voter's cooperation. This repro confirms analyzeBallotLog now EXCLUDES such a spoil (ALARM E_SPOILED_CODE_CAST) so no
// honest trustee/coordinator ever decrypts it, and that a non-rewrapped trustees-mode spoil of the SAME voter is still
// accepted (the guard is specific to ciphertext reuse, not a blanket refusal).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, ed25519Sign, hexToBytes } from '@quietvote/crypto';
import { analyzeBallotLog, ballotCode, spoilDigest, type BallotBody, type SpoilEnvelope } from '@quietvote/protocol';
import { setup, castBallot, spoilBallot, voterEnvelopes, closeElection, kp } from './helpers/sim.ts';

const H = bytesToHex;

test('CP-01/TR-01 fix holds: a cast ballot re-wrapped as a trustees-mode spoil (changed supersedes) is excluded from the spoiled set', async () => {
  const sim = await setup({ seed: 's3-rewrap', n: 3, t: 2, voters: 6, spoilTrustees: true });
  // voter 0 casts {budget:['no']}; it will be counted
  const { built } = castBallot(sim, 0, { budget: ['no'] });
  const castCode = H(built.code);

  // Re-wrap: identical ciphertexts + voter-bound proofs, only `supersedes` changed -> a NEW code.
  const reBody: BallotBody = { ...built.body, supersedes: 'ff'.repeat(32) };
  assert.notEqual(reBody.supersedes, built.body.supersedes, 'supersedes was changed');
  const reCode = ballotCode(sim.params!.ctx, reBody);
  assert.notEqual(H(reCode), castCode, 're-wrap has a different ballot code');
  // The voter signs a trustees-mode spoil (reveal_digest = 32 zero bytes) over the NEW code.
  const v0 = sim.voters[0]!;
  const sig = ed25519Sign(v0.secretKey, spoilDigest(sim.params!.ctx, reCode, new Uint8Array(32)));
  const reSpoil: SpoilEnvelope = { intent: 'spoil', body: reBody, reveal_digest: '00'.repeat(32), sig: H(sig) };
  sim.log.push({ seq: ++sim.seq, entry: reSpoil });

  // A legitimate (freshly-encrypted) trustees-mode spoil by the same voter, to show the guard is not a blanket refusal.
  const fresh = spoilBallot(sim, 0, { budget: ['yes'] }, 'trustees');
  const freshCode = H(fresh.built.code);

  closeElection(sim);
  const an = analyzeBallotLog(sim.params!, new Set(sim.rollHex), voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);

  // The cast ballot is still counted; its ciphertexts are the ones the re-wrap reused.
  assert.ok(an.counted.some((c) => c.code === castCode), 'original cast is counted');
  // The re-wrapped spoil is NOT in the admissible spoiled map (so trustees/coordinator never decrypt it).
  assert.equal(an.spoiled.has(H(reCode)), false, 're-wrapped spoil is excluded from the spoiled set');
  // ...and it is flagged.
  const flagged = an.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST' && f.cls === 'ALARM');
  assert.ok(flagged, 'E_SPOILED_CODE_CAST ALARM raised for the re-wrap');
  assert.equal(an.checkFailures.benaloh, false, 'chk.benaloh.spoiled fails');
  // The honest fresh trustees-mode spoil is still accepted.
  assert.ok(an.spoiled.has(freshCode), 'a non-rewrapped trustees-mode spoil is still admitted');
  console.log('cast counted:', castCode.slice(0, 12), 'rewrap excluded:', !an.spoiled.has(H(reCode)), 'fresh spoil admitted:', an.spoiled.has(freshCode));
});

void hexToBytes; void kp;
