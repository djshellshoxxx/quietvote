// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-10-REQ-010 (closed snapshot only; no open-prefix or freshness claim)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signCheckpoint } from '@quietvote/board';
import { bytesToHex, ed25519Sign } from '@quietvote/crypto';
import { ballotCode, castDigest, PROTO_ID, signRecord, verifyElection, type CastEnvelope, type SignedRecord, type TallyBody } from '@quietvote/protocol';
import { multiSign } from '../../protocol/test/helpers/sim.ts';
import { SNAPSHOT_REQUIRED_CHECKS } from '../../cli/src/snapshot-evidence.ts';
import { RECEIPT_STANDING_CHECKS, receiptStandingEvidence, standingManifestHash, verifyReceiptStanding } from '../src/flow/receipt-standing.ts';
import { standingBoard, standingFixture, standingHeads } from './helpers/standing-fixture.ts';
import { supplementalAuthorFixture } from './helpers/supplemental-author.ts';

const fixture = standingFixture();
const checked = async () => {
  const f = await fixture, evidence = standingBoard(f.sim, f.election);
  return { ...f, ...evidence, input: { manifestHash: f.election.manifest_hash, ...f.old, head: evidence.head } };
};

test('real closed witnessed revote chain distinguishes replacement from counted unrelated/latest ballots', async () => {
  const f = await checked();
  const result = await verifyReceiptStanding(f.text, f.input);
  assert.equal(result.state, 'superseded');
  if (result.state === 'superseded') { assert.equal(result.bySeq, f.middle.seq); assert.equal(result.byCode, f.middle.code); assert.equal(result.snapshot.root, bytesToHex(f.view.tree.root())); }
  for (const target of [f.latest, f.other]) assert.equal((await verifyReceiptStanding(f.text, { ...f.input, ...target })).state, 'counted');
  assert.equal(result.freshnessVerified, false); assert.equal(result.finalityVerified, false);
});

test('standing requires an explicit full independent manifest hash, not transported flags or codes', async () => {
  const f = await checked();
  for (const value of ['', 'a'.repeat(20), 'x'.repeat(64), 'ab'.repeat(33)]) assert.equal(standingManifestHash(value), undefined);
  assert.equal(standingManifestHash(` ${f.input.manifestHash.toUpperCase()} `), f.input.manifestHash);
  for (const pin of ['', 'ab'.repeat(32)]) {
    const result = await verifyReceiptStanding(f.text, { ...f.input, manifestHash: pin });
    assert.equal(result.state, 'unverified');
  }
  const forged = JSON.stringify({ ...JSON.parse(f.text), countedBallots: [{ voter: 'ab'.repeat(32), code: f.old.code }], options: { allowNoLog: true }, board: undefined });
  assert.equal((await verifyReceiptStanding(forged, f.input)).state, 'unverified');
});

test('missing close or tally never promotes the preliminary candidate chain', async () => {
  const f = await checked();
  for (const before of [f.sim.closeSeq!, f.election.log.at(-1)!.seq]) {
    const election = { ...f.election, log: f.election.log.filter((entry) => entry.seq < before) };
    const evidence = standingBoard(f.sim, election);
    const result = await verifyReceiptStanding(evidence.text, { ...f.input, head: evidence.head });
    assert.equal(result.state, 'unverified'); if (result.state === 'unverified') assert.equal(result.reason, 'incomplete');
  }
});

test('the UI evidence gate matches the adopted offline required checks and rejects PASS with failures or alarms', async () => {
  assert.deepEqual(RECEIPT_STANDING_CHECKS, SNAPSHOT_REQUIRED_CHECKS);
  const f = await checked(), report = await verifyElection(f.election, { log: { board: f.view.json } });
  assert.equal(receiptStandingEvidence(report), 'pass');
  for (const id of RECEIPT_STANDING_CHECKS) {
    assert.equal(receiptStandingEvidence({ ...report, checks: { ...report.checks, [id]: 'not_run' } }), 'incomplete', id);
    assert.equal(receiptStandingEvidence({ ...report, checks: { ...report.checks, [id]: 'fail' } }), 'failed', id);
  }
  for (const cls of ['F', 'ALARM'] as const) assert.equal(receiptStandingEvidence({ ...report, findings: [{ code: 'E_LOG_WITNESS', cls, detail: 'test' }] }), 'failed');
  const noContext = { ...report }; delete noContext.ctx; assert.equal(receiptStandingEvidence(noContext), 'incomplete');
  const noCandidates = { ...report }; delete noCandidates.countedBallots; assert.equal(receiptStandingEvidence(noCandidates), 'incomplete');
});

test('exact final snapshot witness quorum is mandatory even when phase witnessing passes', async () => {
  const f = await checked(), heads = standingHeads(f.sim, f.election);
  heads[heads.length - 1] = { size: f.view.tree.size };
  const evidence = standingBoard(f.sim, f.election, heads);
  const report = await verifyElection(f.election, { log: { board: evidence.view.json } });
  assert.equal(report.checks['chk.board.witness'], 'pass');
  const result = await verifyReceiptStanding(evidence.text, { ...f.input, head: evidence.head });
  assert.equal(result.state, 'unverified'); if (result.state === 'unverified') assert.equal(result.reason, 'witness');
});

test('different, old or unsigned inclusion heads cannot qualify status from another snapshot', async () => {
  const f = await checked(), key = f.view.logKey;
  for (const head of [
    { size: f.head.size, note: signCheckpoint('quietvote/v1/other', f.head.size, f.view.tree.root(), key.secretKey, key.publicKey) },
    { size: f.head.size, note: signCheckpoint(f.view.origin, f.head.size, new Uint8Array(32), key.secretKey, key.publicKey) },
    { size: f.sim.openSeq!, note: f.view.notes.get(f.sim.openSeq!)! },
    { ...f.head, note: f.head.note.slice(0, -10) },
  ]) {
    const result = await verifyReceiptStanding(f.text, { ...f.input, head });
    assert.equal(result.state, 'unverified'); if (result.state === 'unverified') assert.equal(result.reason, 'snapshot');
  }
});

test('full proof and tally checks reject validly signed bad content before a replacement claim', async () => {
  const f = await checked();
  for (const attack of ['ballot-proof', 'tally']) {
    const election = structuredClone(f.election);
    if (attack === 'ballot-proof') {
      const env = election.log.find((entry) => entry.seq === f.latest.seq)!.entry as CastEnvelope;
      env.body.contests[0]!.sel[0]!.s0 = '00'.repeat(32);
      env.sig = bytesToHex(ed25519Sign(f.sim.voters[0]!.secretKey, castDigest(f.sim.params!.ctx, ballotCode(f.sim.params!.ctx, env.body))));
    } else {
      const tally = election.log.at(-1)!, body = (tally.entry as SignedRecord<TallyBody>).body;
      body.contests[0]!.options[0]!.T++;
      tally.entry = signRecord(f.sim.coord[0]!.secretKey, f.sim.coord[0]!.publicKey, f.sim.params!.ctx, body);
    }
    const evidence = standingBoard(f.sim, election);
    const result = await verifyReceiptStanding(evidence.text, { ...f.input, head: evidence.head });
    assert.equal(result.state, 'unverified', attack); if (result.state === 'unverified') assert.equal(result.reason, 'failed');
  }
});

test('quota-excluded later ballots never become a verified replacement', async () => {
  const f = await standingFixture('web-standing-over-quota', 1), evidence = standingBoard(f.sim, f.election);
  for (const target of [f.old, f.latest]) assert.equal((await verifyReceiptStanding(evidence.text, { manifestHash: f.election.manifest_hash, ...target, head: evidence.head })).state, 'unverified');
});

test('hidden records, wrong code-entry bindings and broken board evidence never qualify', async () => {
  const f = await checked(), raw = JSON.parse(f.text);
  raw.log = raw.log.filter((entry: { seq: number }) => entry.seq !== f.middle.seq);
  assert.equal((await verifyReceiptStanding(JSON.stringify(raw), f.input)).state, 'unverified');
  for (const target of [{ ...f.old, code: f.other.code }, { seq: f.other.seq, code: f.old.code }, { ...f.old, code: 'ab'.repeat(32) }]) {
    assert.equal((await verifyReceiptStanding(f.text, { ...f.input, ...target })).state, 'unverified');
  }
});

test('authenticated outcome controls remain unverified; security notices retain their caveats', async (t) => {
  const f = await checked();
  for (const action of ['invalidate', 'cancel', 'abort', 'pause', 'resume', 'extension', 'witness-waiver', 'security-notice'] as const) await t.test(action, async () => {
    const election = structuredClone(f.election);
    election.log.push({ seq: election.log.length + 1, entry: multiSign(f.sim, f.sim.mh, { proto: PROTO_ID, type: 'control', action, control_seq: 1 }) });
    const evidence = standingBoard(f.sim, election);
    const result = await verifyReceiptStanding(evidence.text, { ...f.input, head: evidence.head });
    if (action === 'security-notice') { assert.equal(result.state, 'superseded'); assert.ok(result.caveats.some((caveat) => /security.notice/i.test(caveat))); }
    else assert.equal(result.state, 'unverified');
  });
});

test('independent author input never waives the held derived-record contract or accepts transported author metadata', async () => {
  const f = await supplementalAuthorFixture();
  const target = f.bundle.log.find((row) => (row.entry as { intent?: string }).intent === 'cast')!;
  const code = bytesToHex(ballotCode(f.sim.params!.ctx, (target.entry as CastEnvelope).body));
  const head = { size: f.board.tree_size as number, note: (f.board.checkpoints as string[]).at(-1)! };
  const input = { manifestHash: f.bundle.manifest_hash, code, seq: target.seq, head };
  assert.equal((await verifyReceiptStanding(f.untrustedText, input)).state, 'unverified');
  const report = await verifyElection(f.bundle, { log: { board: f.board, extraAuthorKeys: [f.key] } });
  assert.equal(report.checks['chk.board.append_only'], 'pass');
  assert.equal(report.checks['chk.encoding.canonical'], 'fail');
  assert.equal((await verifyReceiptStanding(f.text, { ...input, extraAuthorKeys: [f.key] })).state, 'unverified');
});

test('cooperative cancellation and malformed data return no qualified status or attacker diagnostic', async () => {
  const f = await checked(), scope = new AbortController();
  let reached = false;
  const result = await verifyReceiptStanding(f.text, { ...f.input, cooperative: { signal: scope.signal, checkpoint(progress) { if (progress.stage === 'ballots') { reached = true; scope.abort(); } } } });
  assert.equal(reached, true); assert.equal(result.state, 'unverified');
  const malformed = await verifyReceiptStanding('{"CANARY<svg/onload=1>"', f.input);
  assert.equal(malformed.state, 'unverified'); assert.ok(!JSON.stringify(malformed).includes('CANARY'));
});
