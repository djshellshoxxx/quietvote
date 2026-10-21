// C3 log layer (QV-16 App. C step 11, QV-05 V4/V7, QV-18 §7-§9): tree heads, witness cosignatures and gating,
// witnessed times, receipts; R-01 §11.2 attacks #4 (clash), #5 (silent tail drop via receipts), #6 (split views).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, ed25519Keypair, sha256, utf8 } from '@quietvote/crypto';
import { b64, bundleFromJson, bundleToJson, hashLeaf, type ReceiptJson } from '@quietvote/board';
import {
  validateManifest, verifyElection, verifyReceiptChain, type ElectionBundle, type LogEvidence, type ReceiptClaim, type VerificationReport,
} from '../src/index.ts';
import { buildBoard, isoSec, witnessKeys, type BoardView, type Cosig, type Head } from './helpers/board.ts';
import { bundleOf, castBallot, clone, closeElection, defaultContests, kp, publishTally, setup, type Sim } from './helpers/sim.ts';

const H = bytesToHex;
const SEED = 'log-layer';
const contests = defaultContests().filter((c) => c.id === 'budget');
const [W1, W2, W3] = witnessKeys(SEED) as [ReturnType<typeof kp>, ReturnType<typeof kp>, ReturnType<typeof kp>];
const WITNESSES = [{ name: 'w1', pk: H(W1.publicKey) }, { name: 'w2', pk: H(W2.publicKey) }, { name: 'w3', pk: H(W3.publicKey) }];

interface World {
  sim: Sim;
  bundle: ElectionBundle;
  revoteSeq: number;
  v1Seq: number;
  v2Seq: number;
}

/** Honest run: v0 yes, v1 yes (identical choice), v2 no, v3 yes; `revote`: v0 revotes no. */
async function election(o: { revote: boolean; tally: boolean; witnessQuorum?: number; listWitnesses?: boolean }): Promise<World> {
  const sim = await setup({
    seed: SEED, n: 2, t: 2, voters: 4, contests, boundLog: true, witnessQuorum: o.witnessQuorum ?? 2,
    ...(o.listWitnesses === false ? {} : { witnesses: WITNESSES }),
  });
  castBallot(sim, 0, { budget: ['yes'] });
  const v1Seq = sim.seq + 1;
  castBallot(sim, 1, { budget: ['yes'] });
  const v2Seq = sim.seq + 1;
  castBallot(sim, 2, { budget: ['no'] });
  castBallot(sim, 3, { budget: ['yes'] });
  let revoteSeq = -1;
  if (o.revote) {
    revoteSeq = sim.seq + 1;
    castBallot(sim, 0, { budget: ['no'] });
  }
  closeElection(sim);
  if (o.tally) publishTally(sim, [1, 2]);
  return { sim, bundle: JSON.parse(JSON.stringify(bundleOf(sim))) as ElectionBundle, revoteSeq, v1Seq, v2Seq };
}

const cos = (ts: number, ...who: ('w1' | 'w2' | 'w3')[]): Cosig[] =>
  who.map((n) => ({ name: n, key: n === 'w1' ? W1 : n === 'w2' ? W2 : W3, ts }));

/** Witnessed heads at each QV-18 §9.4 gate with plausible times. */
function stdHeads(w: World, tweak: Partial<Record<'setup' | 'ballots' | 'close' | 'final', Cosig[]>> = {}): Head[] {
  const m = w.bundle.manifest.body;
  const vo = isoSec(m.voting_open);
  const vc = isoSec(m.voting_close);
  const open = w.sim.openSeq!;
  const close = w.sim.closeSeq!;
  const n = w.bundle.log.at(-1)!.seq + 1;
  const heads: Head[] = [
    { size: open, cosigs: tweak.setup ?? cos(vo - 3600, 'w1', 'w2') },
    { size: close, cosigs: tweak.ballots ?? cos(vo + 3600, 'w1', 'w2', 'w3') },
    { size: close + 1, cosigs: tweak.close ?? cos(vc + 60, 'w1', 'w2') },
  ];
  if (n > close + 1) heads.push({ size: n, cosigs: tweak.final ?? cos(vc + 120, 'w1', 'w2') });
  return heads;
}

const view = (w: World, heads: Head[] = stdHeads(w), logKey = kp(SEED, 'log')): BoardView => buildBoard(w.sim, w.bundle, heads, { logKey });
const verify = (b: ElectionBundle, log: LogEvidence): Promise<VerificationReport> => verifyElection(clone(b), { log });
const codes = (r: VerificationReport): string[] => r.findings.map((f) => f.code);
const has = (r: VerificationReport, code: string, cls?: string): boolean => r.findings.some((f) => f.code === code && (cls === undefined || f.cls === cls));
const voterHex = (w: World, i: number): string => H(w.sim.voters[i]!.publicKey);
const claim = (receipt: ReceiptJson, voter: string, code?: string): ReceiptClaim => (code === undefined ? { receipt, voter } : { receipt, voter, code });
const mutJson = (v: BoardView, f: (j: Record<string, any>) => void): unknown => {
  const j = JSON.parse(JSON.stringify(v.json)) as Record<string, any>;
  f(j);
  return j;
};

let honest: World;
let hv: BoardView;
async function init(): Promise<void> {
  if (honest !== undefined) return;
  honest = await election({ revote: true, tally: true });
  hv = view(honest);
}

test('log layer: witnessed, bound log with receipts PASSes every check', async () => {
  await init();
  const n = hv.tree.size;
  const r = await verify(honest.bundle, {
    board: hv.json,
    receipts: [claim(hv.receipt(honest.revoteSeq, n), voterHex(honest, 0)), claim(hv.receipt(honest.v2Seq, honest.sim.closeSeq!), voterHex(honest, 2))],
    observed: [...hv.notes.values()],
  });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  for (const c of ['chk.board.append_only', 'chk.board.witness', 'chk.receipts.sample', 'chk.time.window'] as const) assert.equal(r.checks[c], 'pass', c);
  assert.ok(!r.caveats.some((c) => /unwitnessed|NOT WITNESSED|log integrity/.test(c)), JSON.stringify(r.caveats));
  // without evidence the same bundle keeps the C3 checks not_run and says so
  const bare = await verifyElection(clone(honest.bundle));
  assert.equal(bare.checks['chk.board.append_only'], 'not_run');
  assert.equal(bare.checks['chk.receipts.sample'], 'not_run');
  assert.ok(bare.caveats.some((c) => c.startsWith('log integrity')));
});

test('log layer: entry/record binding (tamper, hidden entry, wrong type/author, origin, log_id)', async () => {
  await init();
  // a ballot changed in the protocol view only
  const b1 = clone(honest.bundle);
  const e = b1.log.find((x) => x.seq === honest.v2Seq)!.entry as Record<string, any>;
  e.sig = e.sig.replace(/^./, (c: string) => (c === '0' ? '1' : '0'));
  let r = await verify(b1, { board: hv.json });
  assert.ok(has(r, 'E_LOG_BINDING', 'F') && r.verdict === 'FAIL' && r.checks['chk.board.append_only'] === 'fail', JSON.stringify(codes(r)));
  // a log entry hidden from the protocol view (operator shows verifiers a log without one ballot)
  const b2 = clone(honest.bundle);
  b2.log = b2.log.filter((x) => x.seq !== honest.v1Seq);
  r = await verify(b2, { board: hv.json });
  assert.ok(has(r, 'E_LOG_BINDING', 'F') && r.verdict === 'FAIL');
  // body bytes in the export differ from the record (digest also breaks)
  r = await verify(honest.bundle, { board: mutJson(hv, (j) => (j.entries[honest.v1Seq].body_b64u = j.entries[honest.v2Seq].body_b64u)) });
  assert.ok(has(r, 'E_LOG_BINDING') && r.verdict === 'FAIL');
  // header authored by another voter's key (unauthorised author for this record)
  const other = buildBoard(honest.sim, honest.bundle, stdHeads(honest), { logKey: kp(SEED, 'log') });
  const swapped = mutJson(other, (j) => (j.entries[honest.v1Seq].header_b64u = (hv.json as any).entries[honest.v2Seq].header_b64u));
  r = await verify(honest.bundle, { board: swapped });
  assert.ok(has(r, 'E_LOG_BINDING') && r.verdict === 'FAIL');
  // export of another log (origin) and a self-attested log key that is not bb.log_pk
  r = await verify(honest.bundle, { board: mutJson(hv, (j) => (j.origin = 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa')) });
  assert.ok(has(r, 'E_LOG_BINDING') && r.verdict === 'FAIL');
  r = await verify(honest.bundle, { board: mutJson(hv, (j) => (j.policy.log_pk_b64 = b64(W1.publicKey))) });
  assert.ok(has(r, 'E_LOG_BINDING') && r.verdict === 'FAIL');
  // garbage export
  r = await verify(honest.bundle, { board: { format: 'nope' } });
  assert.ok(has(r, 'E_LOG_FORMAT') && r.verdict === 'FAIL');
});

test('log layer: tree heads (wrong key, tampered root, fork, reordered entries, missing full head); note order is irrelevant', async () => {
  await init();
  // heads signed by a key other than bb.log_pk
  const wrong = view(honest, stdHeads(honest), ed25519Keypair(sha256(utf8('not-the-log'))));
  let r = await verify(honest.bundle, { board: mutJson(wrong, (j) => (j.policy.log_pk_b64 = (hv.json as any).policy.log_pk_b64)) });
  assert.ok(has(r, 'E_LOG_CHECKPOINT') && r.verdict === 'FAIL', JSON.stringify(codes(r)));
  // a root edited after signing
  r = await verify(honest.bundle, {
    board: mutJson(hv, (j) => (j.checkpoints[1] = j.checkpoints[1].replace(/\n([A-Za-z0-9+/]{4})/, (_m: string, x: string) => `\n${x === 'AAAA' ? 'BBBB' : 'AAAA'}`))),
  });
  assert.ok(has(r, 'E_LOG_CHECKPOINT') && r.verdict === 'FAIL');
  // fork: a second log-signed head of the same size with another root
  const forkView = buildBoard(honest.sim, { ...honest.bundle, log: honest.bundle.log.map((x) => (x.seq === honest.v1Seq ? { seq: x.seq, entry: honest.bundle.log.find((y) => y.seq === honest.v2Seq)!.entry } : x)) }, stdHeads(honest), { logKey: kp(SEED, 'log') });
  r = await verify(honest.bundle, { board: mutJson(hv, (j) => j.checkpoints.push(forkView.notes.get(honest.sim.closeSeq!)!)) });
  assert.ok(has(r, 'E_LOG_FORK') && r.verdict === 'FAIL');
  // two entries reordered in both views: signed heads no longer match (append-only violated)
  const b = clone(honest.bundle);
  const i1 = b.log.findIndex((x) => x.seq === honest.v1Seq);
  const i2 = b.log.findIndex((x) => x.seq === honest.v2Seq);
  [b.log[i1]!.entry, b.log[i2]!.entry] = [b.log[i2]!.entry, b.log[i1]!.entry];
  const reView = buildBoard(honest.sim, b, [], { logKey: kp(SEED, 'log') });
  r = await verify(b, { board: mutJson(reView, (j) => (j.checkpoints = (hv.json as any).checkpoints)) });
  assert.ok(has(r, 'E_LOG_FORK') && r.verdict === 'FAIL', JSON.stringify(codes(r)));
  // no head covering the full log
  r = await verify(honest.bundle, { board: mutJson(hv, (j) => j.checkpoints.pop()) });
  assert.ok(has(r, 'E_LOG_CHECKPOINT') && r.verdict === 'FAIL');
  // heads listed in another order: still valid
  r = await verify(honest.bundle, { board: mutJson(hv, (j) => j.checkpoints.reverse()) });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
});

test('witnesses: below quorum, wrong key, tampered cosignature, non-monotone, no trusted keys, caller anchors', async () => {
  await init();
  const vc = isoSec(honest.bundle.manifest.body.voting_close);
  const vo = isoSec(honest.bundle.manifest.body.voting_open);
  const fail = (r: VerificationReport, code = 'E_LOG_WITNESS'): void => {
    assert.ok(has(r, code, 'F'), JSON.stringify(codes(r)));
    assert.equal(r.verdict, 'FAIL');
  };
  // only one cosignature on the setup head before election-open
  let r = await verify(honest.bundle, { board: view(honest, stdHeads(honest, { setup: cos(vo - 3600, 'w1') })).json });
  fail(r);
  assert.equal(r.checks['chk.board.witness'], 'fail');
  // cosignature under the name w2 made with a key that is not w2's
  const imp: Cosig = { name: 'w2', key: ed25519Keypair(sha256(utf8('impostor'))), ts: vc + 60 };
  r = await verify(honest.bundle, { board: view(honest, stdHeads(honest, { close: [...cos(vc + 60, 'w1'), imp], ballots: cos(vo + 3600, 'w1') })).json });
  fail(r);
  // tampered cosignature line (timestamp edited after signing)
  const oneOnBallots = view(honest, stdHeads(honest, { ballots: cos(vo + 3600, 'w1') }));
  const bad = mutJson(oneOnBallots, (j) => {
    const i = j.checkpoints.length - 2;
    const lines = j.checkpoints[i].split('\n');
    const k = lines.findIndex((l: string) => l.startsWith('— w1 '));
    const raw = Buffer.from(lines[k].slice(5), 'base64');
    raw[11] = raw[11]! ^ 1;
    lines[k] = `— w1 ${raw.toString('base64')}`;
    j.checkpoints[i] = lines.join('\n');
  });
  r = await verify(honest.bundle, { board: bad });
  fail(r);
  // w1 non-monotone (later timestamp on a smaller tree): excluded with an ALARM, quorum then fails
  r = await verify(honest.bundle, { board: view(honest, stdHeads(honest, { setup: [...cos(vc + 9999, 'w1'), ...cos(vo - 3600, 'w2')] })).json });
  assert.ok(has(r, 'E_LOG_WITNESS', 'ALARM'));
  fail(r);
  // quorum > 0 but the manifest lists no witnesses and the caller supplies none; then with caller anchors
  const nw = await election({ revote: false, tally: true, listWitnesses: false });
  const nv = view(nw);
  r = await verify(nw.bundle, { board: nv.json });
  fail(r);
  r = await verify(nw.bundle, { board: nv.json, witnesses: WITNESSES });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  assert.ok(r.caveats.some((c) => c.includes('supplied by the verifier caller')));
  // self-attested witness policy inside the export is never used
  const selfAttested = mutJson(nv, (j) => (j.policy.witness_policy = { quorum: 2, none_acknowledged: false, witnesses: WITNESSES.map((w) => ({ name: w.name, alg: 'ed25519', pk_b64: b64(Buffer.from(w.pk, 'hex')) })) }));
  r = await verify(nw.bundle, { board: selfAttested });
  fail(r);
});

test('witnessed times (QV-16 §5.14.3): late cutoff and early open are E_TIME_WINDOW', async () => {
  await init();
  const m = honest.bundle.manifest.body;
  const vc = isoSec(m.voting_close);
  const vo = isoSec(m.voting_open);
  let r = await verify(honest.bundle, { board: view(honest, stdHeads(honest, { close: cos(vc + m.clock_skew_s + 1, 'w1', 'w2'), final: cos(vc + 9000, 'w1', 'w2') })).json });
  assert.ok(has(r, 'E_TIME_WINDOW', 'F') && r.checks['chk.time.window'] === 'fail' && r.verdict === 'FAIL', JSON.stringify(codes(r)));
  r = await verify(honest.bundle, { board: view(honest, stdHeads(honest, { ballots: cos(vo - m.clock_skew_s - 1, 'w1', 'w2') })).json });
  assert.ok(has(r, 'E_TIME_WINDOW', 'F') && r.verdict === 'FAIL');
  // early close: the head covering close is cosigned well before voting_close
  r = await verify(honest.bundle, { board: view(honest, stdHeads(honest, { ballots: cos(vo + 10, 'w1', 'w2'), close: cos(vc - 86400, 'w1', 'w2') })).json });
  assert.ok(has(r, 'E_TIME_WINDOW', 'F') && r.verdict === 'FAIL');
});

test('quorum 0: chk.board.witness not_run with NOT WITNESSED caveat; structure still checked', async () => {
  const w = await election({ revote: false, tally: true, witnessQuorum: 0, listWitnesses: false });
  const v = buildBoard(w.sim, w.bundle, [{ size: w.bundle.log.at(-1)!.seq + 1 }], { logKey: kp(SEED, 'log') });
  const r = await verify(w.bundle, { board: v.json });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  assert.equal(r.checks['chk.board.append_only'], 'pass');
  assert.equal(r.checks['chk.board.witness'], 'not_run');
  assert.ok(r.caveats.some((c) => c.startsWith('NOT WITNESSED')));
  assert.ok(r.caveats.some((c) => c.startsWith('election times are unwitnessed')));
});

test('R-01 #5/#6: dropped revote is caught by the voter receipt; split view caught by observed heads and receipt chain', async () => {
  await init();
  // Adversarial view: same election, the operator drops v0's revote and re-signs a consistent-looking log;
  // witnesses that never saw the honest view cosign it. Without receipts it verifies.
  const adv = await election({ revote: false, tally: true });
  const av = view(adv);
  let r = await verify(adv.bundle, { board: av.json });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  const revoteReceipt = hv.receipt(honest.revoteSeq, honest.sim.closeSeq!);
  // the voter's receipt for the dropped revote: broken promise (different leaf at that seq) + receipt head not a prefix
  r = await verify(adv.bundle, { board: av.json, receipts: [claim(revoteReceipt, voterHex(honest, 0))] });
  assert.ok(has(r, 'E_LOG_RECEIPT', 'F') && r.verdict === 'FAIL' && r.checks['chk.receipts.sample'] === 'fail', JSON.stringify(codes(r)));
  // silent tail drop: the operator stops the log right before the revote; receipt seq beyond the log
  const cut = clone(adv.bundle);
  cut.log = cut.log.filter((x) => x.seq < honest.revoteSeq);
  const cv = buildBoard(adv.sim, cut, [{ size: honest.revoteSeq }], { logKey: kp(SEED, 'log') });
  r = await verify(cut, { board: cv.json, receipts: [claim(revoteReceipt, voterHex(honest, 0))] });
  assert.ok(r.findings.some((f) => f.code === 'E_LOG_RECEIPT' && f.cls === 'F' && /tail dropped/.test(f.detail)), JSON.stringify(r.findings));
  assert.equal(r.verdict, 'FAIL');
  // split view: a head of the honest view (gossip / pin / witness monitoring) against the adversarial export
  r = await verify(adv.bundle, { board: av.json, observed: [hv.notes.get(hv.tree.size)!] });
  assert.ok((has(r, 'E_LOG_FORK') || has(r, 'E_LOG_ROLLBACK')) && r.verdict === 'FAIL');
  r = await verify(adv.bundle, { board: av.json, observed: [hv.notes.get(honest.sim.closeSeq!)!] });
  assert.ok(has(r, 'E_LOG_FORK', 'F'), JSON.stringify(codes(r)));
  // unsigned junk in observed is not evidence
  r = await verify(adv.bundle, { board: av.json, observed: ['junk\n'] });
  assert.equal(r.verdict, 'PASS');
  assert.ok(r.warnings.some((x) => x.includes('not evidence')));
  // voter-side receipt chain: the later head is from the other view -> no valid consistency proof exists
  const m = honest.bundle.manifest.body;
  const header = hv.headers[honest.revoteSeq]!;
  const chainBad = verifyReceiptChain({
    manifest: m, receipt: revoteReceipt, header, voter: voterHex(honest, 0),
    latest: av.notes.get(av.tree.size)!, consistency: av.tree.consistencyProof(honest.sim.closeSeq!, av.tree.size).map(b64),
  });
  assert.ok(!chainBad.ok && chainBad.error === 'E_LOG_FORK', JSON.stringify(chainBad));
});

test('receipt chain (voter side): positive, rollback, wrong log key, unwitnessed head, malformed proof', async () => {
  await init();
  const m = honest.bundle.manifest.body;
  const n = hv.tree.size;
  const at = honest.sim.closeSeq!;
  const rc = hv.receipt(honest.v2Seq, at);
  const base = { manifest: m, receipt: rc, header: hv.headers[honest.v2Seq]!, voter: voterHex(honest, 2), latest: hv.notes.get(n)!, consistency: hv.tree.consistencyProof(at, n).map(b64) };
  const okR = verifyReceiptChain(base);
  assert.ok(okR.ok && okR.value.witnessed && okR.value.seq === honest.v2Seq, JSON.stringify(okR));
  assert.deepEqual(hashLeaf(hv.headers[honest.v2Seq]!), hv.tree.leafHash(honest.v2Seq));
  // later head smaller than the receipt head
  let r = verifyReceiptChain({ ...base, latest: hv.notes.get(honest.sim.openSeq!)!, consistency: [] });
  assert.ok(!r.ok && r.error === 'E_LOG_ROLLBACK');
  // receipt promise signed by a key other than bb.log_pk
  const other = view(honest, stdHeads(honest), ed25519Keypair(sha256(utf8('evil-log'))));
  r = verifyReceiptChain({ ...base, receipt: other.receipt(honest.v2Seq, at) });
  assert.ok(!r.ok && r.error === 'E_LOG_RECEIPT');
  // a later head with no witness quorum
  const unw = view(honest, stdHeads(honest, { final: cos(isoSec(m.voting_close) + 120, 'w3') }));
  r = verifyReceiptChain({ ...base, latest: unw.notes.get(n)! });
  assert.ok(!r.ok && r.error === 'E_LOG_WITNESS');
  // tampered consistency proof
  const proof = [...base.consistency];
  proof[0] = b64(sha256(utf8('x')));
  r = verifyReceiptChain({ ...base, consistency: proof });
  assert.ok(!r.ok && r.error === 'E_LOG_FORK');
  // the receipt's leaf is not this header
  r = verifyReceiptChain({ ...base, header: hv.headers[honest.v1Seq]! });
  assert.ok(!r.ok && r.error === 'E_LOG_RECEIPT_CLASH');
  // garbage never throws
  r = verifyReceiptChain({ ...base, receipt: { junk: true } });
  assert.ok(!r.ok);
});

test('R-01 #4 clash: identical choices still give distinct receipts; a receipt for someone else\'s ballot is flagged', async () => {
  await init();
  const n = hv.tree.size;
  const r0 = hv.receipt(honest.v1Seq - 1, n); // v0's first ballot: yes
  const r1 = hv.receipt(honest.v1Seq, n); // v1's ballot: yes
  assert.notEqual(r0.leaf_hash, r1.leaf_hash);
  const e0 = honest.bundle.log.find((x) => x.seq === honest.v1Seq - 1)!.entry as Record<string, any>;
  const e1 = honest.bundle.log.find((x) => x.seq === honest.v1Seq)!.entry as Record<string, any>;
  assert.notDeepEqual(e0.body.contests, e1.body.contests);
  // server hands v1 the receipt of v0's stored ballot
  let r = await verify(honest.bundle, { board: hv.json, receipts: [claim(r0, voterHex(honest, 1))] });
  assert.ok(has(r, 'E_LOG_RECEIPT_CLASH', 'ALARM') && r.checks['chk.receipts.sample'] === 'fail', JSON.stringify(codes(r)));
  assert.equal(r.verdict, 'PASS'); // not provable to third parties: ALARM (X-28)
  // two voters claim the same entry
  r = await verify(honest.bundle, { board: hv.json, receipts: [claim(r0, voterHex(honest, 0)), claim(r0, voterHex(honest, 1))] });
  assert.ok(has(r, 'E_LOG_RECEIPT_CLASH', 'ALARM'));
  // recorded ballot code differs from the logged one
  r = await verify(honest.bundle, { board: hv.json, receipts: [claim(r1, voterHex(honest, 1), '00'.repeat(32))] });
  assert.ok(has(r, 'E_LOG_RECEIPT_CLASH', 'ALARM'));
  // a forged receipt (not signed by the log key) is not evidence: check fails, verdict unaffected
  const forged = { ...r1, promise_sig: b64(new Uint8Array(64)) };
  r = await verify(honest.bundle, { board: hv.json, receipts: [claim(forged, voterHex(honest, 1))] });
  assert.ok(has(r, 'E_LOG_RECEIPT', 'I') && r.checks['chk.receipts.sample'] === 'fail' && r.verdict === 'PASS');
  // voter-side: v1 checking v0's header against its own key
  const c = verifyReceiptChain({
    manifest: honest.bundle.manifest.body, receipt: r0, header: hv.headers[honest.v1Seq - 1]!, voter: voterHex(honest, 1),
    latest: hv.notes.get(n)!, consistency: [],
  });
  assert.ok(!c.ok && c.error === 'E_LOG_RECEIPT_CLASH');
});

test('manifest witness list: validated strictly; log_id must bind the origin', async () => {
  await init();
  const m = clone(honest.bundle.manifest.body);
  const roll = honest.bundle.roll.length;
  assert.ok(validateManifest(m, roll).ok);
  const dupe = clone(m);
  dupe.bb.witnesses = [WITNESSES[0]!, { ...WITNESSES[1]!, name: 'w1' }];
  assert.equal((validateManifest(dupe, roll) as { error?: string }).error, 'E_MANIFEST');
  const over = clone(m);
  over.bb.witnesses = [WITNESSES[0]!];
  assert.equal((validateManifest(over, roll) as { error?: string }).error, 'E_MANIFEST');
  const logKeyAsWitness = clone(m);
  logKeyAsWitness.bb.witnesses = [WITNESSES[0]!, { name: 'w9', pk: m.bb.log_pk }];
  assert.equal((validateManifest(logKeyAsWitness, roll) as { error?: string }).error, 'E_MANIFEST');
  const badName = clone(m);
  badName.bb.witnesses = [WITNESSES[0]!, { ...WITNESSES[1]!, name: 'has space' }];
  assert.equal((validateManifest(badName, roll) as { error?: string }).error, 'E_SCHEMA');
  // an unbound log_id (the default test manifests) fails the log layer
  const unbound = await setup({ seed: 'unbound-logid', n: 1, t: 1, voters: 3, contests });
  const ub = JSON.parse(JSON.stringify(bundleOf(unbound))) as ElectionBundle;
  const uv = buildBoard(unbound, ub, [{ size: ub.log.at(-1)!.seq + 1 }], { logKey: kp('unbound-logid', 'log') });
  const r = await verify(ub, { board: uv.json });
  assert.ok(has(r, 'E_LOG_BINDING', 'F') && r.verdict === 'FAIL');
  // round trip of the export JSON form is stable
  const rt = bundleFromJson(hv.json);
  assert.ok(rt.ok && JSON.stringify(bundleToJson(rt.value)) === JSON.stringify(hv.json));
});
