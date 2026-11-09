// Log layer through the verifier: board export + witnesses + observed heads + receipts reach protocol.verifyElection({log})
// (QV-16 App. C step 11, QV-05 V4/V7/G-V2, QV-18 §7-§9). The election is simulated (helpers/sim.ts) so that every log entry
// body is the JCS of its protocol record, as C3 requires; the shipped test-vector manifest does not bind its log (see NOTES.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex, type Ed25519Keypair } from '@quietvote/crypto';
import { receiptToJson, signCheckpoint, signPromise, type ReceiptJson, type WitnessPolicy } from '@quietvote/board';
import type { ElectionBundle, ReceiptClaim } from '@quietvote/protocol';
import { formatReport, hashReport, verifyBundle, type VerifyBundleOptions } from '../src/index.ts';
import { buildBoard, isoSec, witnessKeys, type BoardView, type Cosig, type Head } from './helpers/board.ts';
import { bundleOf, castBallot, clone, closeElection, defaultContests, kp, publishTally, setup, type Sim } from './helpers/sim.ts';

const H = bytesToHex;
const SEED = 'verifier-log';
const contests = defaultContests().filter((c) => c.id === 'budget');
const [W1, W2, W3] = witnessKeys(SEED) as [Ed25519Keypair, Ed25519Keypair, Ed25519Keypair];
// Manifest-listed witnesses (X-23 trust anchors) and the board export's own witness policy (self-attested by the export).
const MANIFEST_WITNESSES = [{ name: 'w1', pk: H(W1.publicKey) }, { name: 'w2', pk: H(W2.publicKey) }, { name: 'w3', pk: H(W3.publicKey) }];
const BOARD_POLICY: WitnessPolicy = {
  quorum: 2, noneAcknowledged: false,
  witnesses: [{ name: 'w1', alg: 'ed25519', publicKey: W1.publicKey }, { name: 'w2', alg: 'ed25519', publicKey: W2.publicKey }, { name: 'w3', alg: 'ed25519', publicKey: W3.publicKey }],
};

interface World {
  sim: Sim;
  bundle: ElectionBundle;
  revoteSeq: number;
  v1Seq: number;
  v2Seq: number;
}

/** Honest run: v0 yes, v1 yes, v2 no, v3 yes; `revote`: v0 revotes no. */
async function election(o: { revote: boolean; tally: boolean; witnessQuorum?: number; listWitnesses?: boolean }): Promise<World> {
  const sim = await setup({
    seed: SEED, n: 2, t: 2, voters: 4, contests, boundLog: true, witnessQuorum: o.witnessQuorum ?? 2,
    ...(o.listWitnesses === false ? {} : { witnesses: MANIFEST_WITNESSES }),
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

const board = (w: World, heads: Head[], policy: WitnessPolicy = BOARD_POLICY): BoardView =>
  buildBoard(w.sim, w.bundle, heads, { logKey: kp(SEED, 'log'), witnessPolicy: policy });
const withBoard = (b: unknown, board: unknown): object => ({ ...(clone(b) as object), board });
const voterHex = (w: World, i: number): string => H(w.sim.voters[i]!.publicKey);
const claim = (receipt: ReceiptJson, voter: string): ReceiptClaim => ({ receipt, voter });
const has = (r: { findings: { code: string; cls: string }[] }, code: string, cls?: string): boolean =>
  r.findings.some((f) => f.code === code && (cls === undefined || f.cls === cls));
const mutJson = (v: BoardView, f: (j: Record<string, any>) => void): unknown => {
  const j = JSON.parse(JSON.stringify(v.json)) as Record<string, any>;
  f(j);
  return j;
};

let honest: World;
let hv: BoardView;
async function init(): Promise<void> {
  if (honest !== undefined) return;
  honest = await election({ revote: true, tally: false });
  hv = board(honest, stdHeads(honest));
}

test('log layer runs: a witnessed, bound log with receipts and observed heads PASSes every log check', async () => {
  await init();
  const n = hv.tree.size;
  const r = await verifyBundle(withBoard(honest.bundle, hv.json), {
    receipts: [claim(hv.receipt(honest.revoteSeq, n), voterHex(honest, 0)), claim(hv.receipt(honest.v2Seq, honest.sim.closeSeq!), voterHex(honest, 2))],
    observedCheckpoints: [...hv.notes.values()],
  });
  assert.equal(r.verdict, 'INCOMPLETE', JSON.stringify(r.findings));
  assert.equal(r.checks.V4.status, 'pass', JSON.stringify(r.checks.V4.notes));
  assert.equal(r.checks.V7.status, 'pass');
  assert.deepEqual(r.log?.checks, { append_only: 'pass', witness: 'pass', receipts: 'pass', time_window: 'pass' });
  assert.deepEqual([r.log?.witness_keys, r.log?.receipt_claims, r.log?.observed_heads], ['manifest', 2, hv.notes.size]);
  assert.equal(r.chk['chk.receipts.sample'], 'pass');
  assert.ok(!r.caveats.some((c) => /unwitnessed|NOT WITNESSED|log integrity/.test(c)), JSON.stringify(r.caveats));
  assert.match(formatReport(r), /log layer \(QV-16 C3\): append-only pass, witness pass, receipts pass, witnessed times pass; witness keys from manifest; 2 receipt claim\(s\)/);
  assert.equal(r.reportHash, hashReport(r));
  // without a board export the log layer is absent, V4 is not_run and says why
  const bare = await verifyBundle(clone(honest.bundle));
  assert.equal(bare.log, undefined);
  assert.equal(bare.checks.V4.status, 'not_run');
});

test('log layer: tampered or hidden entries (protocol view differs from the export) FAIL V4 and the verdict', async () => {
  await init();
  // a ballot changed in the protocol view only
  const b1 = clone(honest.bundle);
  (b1.log.find((x) => x.seq === honest.v2Seq)!.entry as Record<string, any>).sig = ((b1.log.find((x) => x.seq === honest.v2Seq)!.entry as Record<string, any>).sig as string).replace(/^./, (c) => (c === '0' ? '1' : '0'));
  let r = await verifyBundle(withBoard(b1, hv.json));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.log?.checks.append_only, 'fail');
  assert.equal(r.checks.V4.status, 'fail');
  assert.ok(has(r, 'E_LOG_BINDING', 'F'), JSON.stringify(r.findings));
  // a log entry hidden from the protocol view (the operator shows verifiers a log without one ballot)
  const b2 = clone(honest.bundle);
  b2.log = b2.log.filter((x) => x.seq !== honest.v1Seq);
  r = await verifyBundle(withBoard(b2, hv.json));
  assert.equal(r.verdict, 'FAIL');
  assert.ok(has(r, 'E_LOG_BINDING', 'F'));
  // the export's body bytes differ from the record (the header digest breaks as well)
  r = await verifyBundle(withBoard(honest.bundle, mutJson(hv, (j) => (j.entries[honest.v1Seq].body_b64u = j.entries[honest.v2Seq].body_b64u))));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.checks.V4.status, 'fail');
});

test('receipts: a broken promise FAILs; a receipt for another voter is a flagged clash; a malformed one is not evidence', async () => {
  await init();
  const n = hv.tree.size;
  const ts = 1_793_000_000;
  // the log key promises seq v2 but the leaf is the one at v1: the log dropped or replaced the entry
  const forged = receiptToJson(signPromise(kp(SEED, 'log').secretKey, hv.origin, honest.v2Seq, hv.tree.leafHash(honest.v1Seq)!, ts));
  let r = await verifyBundle(withBoard(honest.bundle, hv.json), { receipts: [claim(forged, voterHex(honest, 2))] });
  assert.equal(r.verdict, 'FAIL');
  assert.ok(has(r, 'E_LOG_RECEIPT', 'F'), JSON.stringify(r.findings));
  assert.equal(r.checks.V4.status, 'fail');
  // voter 2 holds a receipt for voter 1's ballot: clash (ALARM, verdict unchanged, V4 flagged)
  r = await verifyBundle(withBoard(honest.bundle, hv.json), { receipts: [claim(hv.receipt(honest.v1Seq, n), voterHex(honest, 2))] });
  assert.equal(r.verdict, 'INCOMPLETE', JSON.stringify(r.findings));
  assert.ok(has(r, 'E_LOG_RECEIPT_CLASH', 'ALARM'));
  assert.equal(r.checks.V4.status, 'fail');
  assert.match(formatReport(r), /FLAGGED: .*V4/);
  // a receipt that does not parse is named as such, does not flip the verdict
  r = await verifyBundle(withBoard(honest.bundle, hv.json), { receipts: [claim({ junk: 1 } as unknown as ReceiptJson, voterHex(honest, 0))] });
  assert.equal(r.verdict, 'INCOMPLETE', JSON.stringify(r.findings));
  assert.ok(has(r, 'E_LOG_RECEIPT', 'I'));
});

test('witnesses: a gate without quorum FAILs; unlisted manifest witnesses need caller keys, which are used only then', async () => {
  await init();
  // no witnessed head in [close, tally]: only one cosignature on the close heads
  const gate = board(honest, stdHeads(honest, { ballots: cos(0, 'w1'), close: cos(0, 'w1') }));
  let r = await verifyBundle(withBoard(honest.bundle, gate.json));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.log?.checks.witness, 'fail');
  assert.equal(r.checks.V4.status, 'fail');

  // a manifest that lists no witnesses: the quorum cannot be met with no trusted keys
  const nl = await election({ revote: true, tally: false, listWitnesses: false });
  const nlv = board(nl, stdHeads(nl));
  r = await verifyBundle(withBoard(nl.bundle, nlv.json));
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.log?.witness_keys, 'none');
  assert.ok(has(r, 'E_LOG_WITNESS', 'F'), JSON.stringify(r.findings));
  // the caller's witness keys stand in for the missing manifest list (X-23), with a caveat
  const opts: VerifyBundleOptions = { witnesses: MANIFEST_WITNESSES };
  r = await verifyBundle(withBoard(nl.bundle, nlv.json), opts);
  assert.equal(r.verdict, 'INCOMPLETE', JSON.stringify(r.findings));
  assert.equal(r.log?.witness_keys, 'caller');
  assert.ok(r.caveats.some((c) => c.includes('witness keys supplied by the verifier caller')));
});

test('observed heads: a log-signed fork FAILs (also as a pinned checkpoint); an unsigned note is ignored with a warning', async () => {
  await init();
  const origin = hv.origin;
  const fork = signCheckpoint(origin, hv.tree.size, new Uint8Array(32).fill(7), kp(SEED, 'log').secretKey, kp(SEED, 'log').publicKey);
  let r = await verifyBundle(withBoard(honest.bundle, hv.json), { observedCheckpoints: [fork] });
  assert.equal(r.verdict, 'FAIL');
  assert.ok(has(r, 'E_LOG_FORK', 'F'), JSON.stringify(r.findings));
  r = await verifyBundle(withBoard(honest.bundle, hv.json), { pinnedCheckpoint: fork });
  assert.equal(r.verdict, 'FAIL');
  r = await verifyBundle(withBoard(honest.bundle, hv.json), { observedCheckpoints: ['not a checkpoint note'] });
  assert.equal(r.verdict, 'INCOMPLETE', JSON.stringify(r.findings));
  assert.ok(r.warnings.some((w) => w.startsWith('log: observed tree head ignored (not evidence)')), JSON.stringify(r.warnings));
});

test('unwitnessed log (witness_quorum 0): structure verifies, witness and V4 stay not_run, verdict unaffected', async () => {
  const u = await election({ revote: false, tally: false, witnessQuorum: 0 });
  const uv = board(u, stdHeads(u), { quorum: 0, noneAcknowledged: true, witnesses: [] });
  const r = await verifyBundle(withBoard(u.bundle, uv.json));
  assert.equal(r.verdict, 'INCOMPLETE', JSON.stringify(r.findings));
  assert.equal(r.log?.checks.append_only, 'pass');
  assert.equal(r.log?.checks.witness, 'not_run');
  assert.equal(r.checks.V4.status, 'not_run');
  assert.ok(r.caveats.some((c) => c.includes('NOT WITNESSED')));
});

test('receipts and observed heads without a board export are reported as not checked', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-vectors', 'v1');
  const tiny = JSON.parse(readFileSync(join(root, 'elections', 'tiny-yesno-3v', 'bundle.json'), 'utf8')) as object;
  const r = await verifyBundle(tiny, { receipts: [{ receipt: {}, voter: '00'.repeat(32) }], observedCheckpoints: ['x'] });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
  assert.equal(r.log, undefined);
  assert.equal(r.checks.V4.status, 'not_run');
  assert.ok(r.caveats.some((c) => c.includes('not checked: the bundle carries no board log export')));
  assert.equal(r.reportHash, hashReport(r));
});
