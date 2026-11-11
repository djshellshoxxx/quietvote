// S1-02 repro (AI-assisted review; QuietVote is unaudited and not for real elections).
// Server admission refuses a spoil that re-uses the ciphertexts of an admitted cast (CP-01/TR-01, election.ts vBallot), but not
// the reverse order: a cast that re-uses the ciphertexts of an already admitted (and publicly revealed) spoil under a different
// `supersedes` (hence a different ballot code) is admitted and counted. Consequences shown below:
//  * the log then holds the opening (xi, selections) of ciphertexts that are counted (QV-16 §5.13.2 item 4, §5.13.3; QV-07-REQ-072);
//  * every verifier reports ALARM E_SPOILED_CODE_CAST and chk.benaloh.spoiled = fail for the whole election; one voter can do this.
//
// Run: node --test packages/server/test/s1-spoil-then-cast-rewrap.repro.ts
// Asserts the EXPECTED behaviour, so it FAILS while the defect exists. Observations are printed as diagnostics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { ballotCode, makeCast, makeSpoil, signRecord, verifyElectionText, verifySpoilReveal, type BallotBody } from '@quietvote/protocol';
import { World } from './helpers/world.ts';

const H = bytesToHex;

test('S1-02: a cast that re-wraps the ciphertexts of an admitted, published spoil is admitted and counted', { timeout: 300_000 }, async (t) => {
  const w = new World({ seed: 's1-spoil-then-cast', n: 3, t: 2, voters: 3 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.registerVoters();
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    assert.equal((await w.open()).status, 201);

    const v = w.voters[0]!;
    const selections = { budget: ['no'], chair: ['cy'] };
    const b = w.build(0, selections); // supersedes = zeros: the voter's first ballot
    // 1. Spoil the SAME ciphertexts under another `supersedes` (spoils are not chain-checked; proofs bind only ctx and voter).
    const body: BallotBody = structuredClone(b.body);
    body.supersedes = '22'.repeat(32);
    const spoil = makeSpoil(w.params, v.secretKey, { ...b, body, code: ballotCode(w.params.ctx, body) }, 'publish');
    const rs = await w.post('ballot_audit', v, spoil);
    t.diagnostic(`1. spoil (published reveal) of ciphertexts C under code ${H(ballotCode(w.params.ctx, body)).slice(0, 16)}...: ${rs.status}`);
    assert.equal(rs.status, 201, rs.text);
    w.tick(5);
    // 2. Cast the original body: same ciphertexts and proofs, different code.
    const rc = await w.post('ballot', v, makeCast(w.params, v.secretKey, b));
    t.diagnostic(`2. cast of the same ciphertexts C under code ${H(b.code).slice(0, 16)}...: ${rc.status} ${rc.json?.reason ?? ''}`);
    if (rc.status === 201) w.last.set(H(v.publicKey), H(b.code));
    w.tick(5);
    // control: the other order is refused at admission (existing CP-01/TR-01 behaviour)
    const b1 = w.build(1, { budget: ['yes'], chair: ['ann'] });
    assert.equal((await w.post('ballot', w.voters[1]!, makeCast(w.params, w.voters[1]!.secretKey, b1))).status, 201);
    w.last.set(H(w.voters[1]!.publicKey), H(b1.code));
    w.tick(5);
    const body1: BallotBody = structuredClone(b1.body);
    body1.supersedes = '33'.repeat(32);
    const ctl = await w.post('ballot_audit', w.voters[1]!, makeSpoil(w.params, w.voters[1]!.secretKey, { ...b1, body: body1, code: ballotCode(w.params.ctx, body1) }, 'publish'));
    t.diagnostic(`control, cast-then-spoil of the same ciphertexts: ${ctl.status} ${ctl.json?.reason}`);
    assert.equal(ctl.status, 422);
    w.tick(5);
    assert.equal((await w.cast(2, { budget: ['yes'], chair: ['bob'] })).status, 201);

    // 3. Finish the election.
    assert.equal((await w.close()).status, 201);
    for (const j of [1, 3]) assert.equal((await w.trusteeShares(j)).status, 201);
    const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
    assert.equal(draft.status, 200, draft.text);
    const c = w.coord[0]!;
    assert.equal((await w.post('tally_result', c, signRecord(c.secretKey, c.publicKey, w.params.ctx, draft.json.body))).status, 201);

    // 4. What the public record now contains.
    const log = await w.fetchLog();
    const spoilEntry = log.find((e) => e.rec?.intent === 'spoil' && e.rec.body.voter === H(v.publicKey))!;
    const castEntry = log.find((e) => e.rec?.intent === 'cast' && e.rec.body.voter === H(v.publicKey));
    const sameCiphertexts = castEntry !== undefined && H(jcs(castEntry.rec.body.contests)) === H(jcs(spoilEntry.rec.body.contests));
    const opened = castEntry !== undefined && verifySpoilReveal(w.params, { ...castEntry.rec.body, supersedes: spoilEntry.rec.body.supersedes }, spoilEntry.rec.reveal).ok;
    const exported = await w.get(`/api/v1/elections/${w.electionId}/export.json`);
    const report = await verifyElectionText(exported.text);
    const counted = report.countedBallots?.some((x) => x.voter === H(v.publicKey) && x.code === H(b.code)) ?? false;
    t.diagnostic(`public log: counted cast (seq ${castEntry?.seq}) has the ciphertexts of the spoil at seq ${spoilEntry.seq}: ${sameCiphertexts}; the published reveal opens them to ${JSON.stringify(spoilEntry.rec.reveal.selections)}: ${opened}`);
    t.diagnostic(`verifyElection: verdict ${report.verdict}, counted ${report.counts.counted}, voter 0 counted with that code: ${counted}, chk.benaloh.spoiled=${report.checks['chk.benaloh.spoiled']}, findings ${JSON.stringify(report.findings.filter((f) => f.cls !== 'I'))}`);

    // EXPECTED: the server refuses, at admission, a cast whose ciphertexts were already spoiled (as it does for the other order),
    // so a counted ballot never has its opening on the log and no voter can force the election-wide Benaloh alarm.
    assert.equal(rc.status, 422, 'a cast re-using the ciphertexts of an admitted spoil must be refused at admission');
    assert.equal(report.checks['chk.benaloh.spoiled'], 'pass');
  } finally {
    await w.stop();
  }
});
