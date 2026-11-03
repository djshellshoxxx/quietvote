// R-01 §11.2 attacks-to-test checklist. Each test names the row it covers; rows that belong to other packages are listed
// in NOTES.md (board: #4 receipts, #6 split views; Phase 2/3: #17, #19, #20).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, baseMul, bytesToHex, cdsProve, cdsVerify, decProve, decVerify, dhProve, dhVerify, elgamalEncrypt, h256, limitProve,
  limitVerify, pokProve, pokVerify, scalarRandomNonZero, shareKeyProve, shareKeyVerify, streamRng, utf8, pointMul,
  type CompactProof,
} from '@quietvote/crypto';
import { analyzeBallotLog, makeSpoil, buildBallot, verifyElection, NO_SUPERSEDES, makeCast, type ElectionBundle } from '../src/index.ts';
import { bundleOf, castBallot, clone, closeElection, defaultContests, publishTally, setup, spoilBallot } from './helpers/sim.ts';

const H = bytesToHex;
const rng = streamRng('attacks');

test('R-01 #2: cross-protocol / DST confusion - a proof of type X never verifies as type Y over the same numbers', () => {
  const mh = h256('manifest', utf8('x'));
  const a = scalarRandomNonZero(rng);
  const A = baseMul(a);
  const K = baseMul(scalarRandomNonZero(rng));
  const B = pointMul(K, 3n);
  const proofs: Record<string, CompactProof> = {
    pok: pokProve(mh, 1, 0, a, A, rng),
    share: shareKeyProve(mh, 1, A, a, rng),
    dh: dhProve(mh, 1, 1, A, G, A, a, rng),
    limit: limitProve({ ctx: mh, binder: mh, cid: 'c', L: 1, K, Asum: A, Bsum: B }, a, new Uint8Array(64)),
    dec: decProve({ ctx: mh, cid: 'c', oid: 'o', j: 1, Yj: A, A: G, B }, a, rng).proof,
  };
  const verifiers: Record<string, (p: CompactProof) => boolean> = {
    pok: (p) => pokVerify(mh, 1, 0, A, p),
    share: (p) => shareKeyVerify(mh, 1, A, p),
    dh: (p) => dhVerify(mh, 1, 1, A, G, A, p),
    limit: (p) => limitVerify({ ctx: mh, binder: mh, cid: 'c', L: 1, K, Asum: A, Bsum: B }, p),
    dec: (p) => decVerify({ ctx: mh, cid: 'c', oid: 'o', j: 1, Yj: A, A: G, B, M: pointMul(G, a) }, p),
  };
  for (const [px, p] of Object.entries(proofs)) {
    for (const [vy, v] of Object.entries(verifiers)) {
      if (px === vy) continue;
      assert.ok(!v(p), `${px} proof accepted by ${vy} verifier`);
    }
  }
  assert.ok(verifiers.pok!(proofs.pok!));
  // CDS proof pair as a limit proof
  const r = scalarRandomNonZero(rng);
  const ct = elgamalEncrypt(K, 1, r);
  const cds = cdsProve({ ctx: mh, binder: mh, cid: 'c', oid: 'o', K, ct }, 1, r, new Uint8Array(64));
  assert.ok(cdsVerify({ ctx: mh, binder: mh, cid: 'c', oid: 'o', K, ct }, cds));
  assert.ok(!limitVerify({ ctx: mh, binder: mh, cid: 'c', L: 1, K, Asum: ct.A, Bsum: ct.B }, { c: cds.c1, s: cds.s1 }));
});

test('R-01 #4 (protocol part): identical selections by two voters never share a ballot code or randomness', async () => {
  const sim = await setup({ seed: 'att-clash', n: 3, t: 2, voters: 2, contests: [defaultContests()[0]!] });
  const a = castBallot(sim, 0, { budget: ['yes'] });
  const b = castBallot(sim, 1, { budget: ['yes'] });
  assert.notEqual(H(a.built.code), H(b.built.code));
  assert.notEqual(a.env.body.contests[0]!.sel[0]!.a, b.env.body.contests[0]!.sel[0]!.a);
});

test('R-01 #5: honest-looking drop of a voter\'s newest ballot is detectable by the voter via the counted-code list', async () => {
  const sim = await setup({ seed: 'att-drop', n: 3, t: 2, voters: 4, contests: [defaultContests()[0]!] });
  castBallot(sim, 0, { budget: ['yes'] });
  castBallot(sim, 1, { budget: ['no'] });
  castBallot(sim, 2, { budget: ['yes'] });
  const mine = castBallot(sim, 0, { budget: ['no'] }); // voter 0's revote, the one the server will drop
  closeElection(sim);
  // the operator removes the revote from the log, then recomputes and publishes a self-consistent tally
  const drop = sim.log.findIndex((l) => l.entry === mine.env);
  const dropped = sim.log.splice(drop, 1);
  assert.equal(dropped.length, 1);
  publishTally(sim, [1, 2]);
  const rep = await verifyElection(bundleOf(sim));
  assert.equal(rep.verdict, 'PASS', 'log-level consistency alone cannot expose a silent drop');
  const counted = rep.countedBallots!.find((c) => c.voter === H(sim.voters[0]!.publicKey))!;
  assert.notEqual(counted.code, H(mine.built.code), 'the voter\'s own receipt code is not the counted code: detected');
});

test('R-01 #5/#6 (protocol part): reordering log entries changes the verdict or the counted set', async () => {
  const sim = await setup({ seed: 'att-reorder', n: 3, t: 2, voters: 4, contests: [defaultContests()[0]!] });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  castBallot(sim, 0, { budget: ['no'] });
  closeElection(sim);
  publishTally(sim, [1, 3]);
  const b: ElectionBundle = clone(bundleOf(sim));
  const idx = b.log.map((l, i) => ((l.entry as { intent?: string }).intent === 'cast' ? i : -1)).filter((i) => i >= 0);
  const [i0, i3] = [idx[0]!, idx[3]!];
  const t = b.log[i0]!.entry;
  b.log[i0]!.entry = b.log[i3]!.entry;
  b.log[i3]!.entry = t;
  const rep = await verifyElection(b);
  assert.notEqual(rep.verdict, 'PASS');
});

test('R-01 #15: private-audit spoil publishes no randomness or plaintext; the code cannot be cast afterwards', async () => {
  const sim = await setup({ seed: 'att-benaloh', n: 3, t: 2, voters: 2, contests: [defaultContests()[0]!] });
  const { env, built } = spoilBallot(sim, 0, { budget: ['yes'] }, 'private');
  const text = JSON.stringify(env);
  assert.ok(!text.includes(H(built.xi)) && !text.includes('"selections"') && !text.includes('"xi"'));
  // device equivocation: the audited ballot is cast afterwards under the cast label -> alarm, excluded
  const cast = makeCast(sim.params!, sim.voters[0]!.secretKey, built);
  sim.seq += 1;
  sim.log.push({ seq: sim.seq, entry: cast });
  closeElection(sim);
  const an = analyzeBallotLog(sim.params!, new Set(sim.rollHex), sim.log.filter((l) => 'intent' in (l.entry as object)).map((l) => ({ seq: l.seq, raw: l.entry })), sim.openSeq!, sim.closeSeq!);
  assert.equal(an.counted.length, 0);
  assert.ok(an.findings.some((f) => f.code === 'E_SPOILED_CODE_CAST'));
  void makeSpoil; void buildBallot; void NO_SUPERSEDES;
});

test('R-01 #18: privacy floor enforced by manifest validation, trustees and the verifier', async () => {
  const sim = await setup({ seed: 'att-floor', n: 3, t: 2, voters: 4, contests: [defaultContests()[0]!], minCounted: 3 });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  closeElection(sim);
  publishTally(sim, [1, 2]);
  const b: ElectionBundle = clone(bundleOf(sim));
  const drop = b.log.findIndex((l) => (l.entry as { intent?: string }).intent === 'cast');
  b.log.splice(drop, 1);
  const rep = await verifyElection(b);
  assert.notEqual(rep.verdict, 'PASS');
  assert.ok(rep.findings.some((f) => f.code === 'E_BELOW_FLOOR'));
});
