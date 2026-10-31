// QV-34 log-layer vectors (QV-18 §7-§9, QV-16 §5.14.3 / App. C step 11, logcheck.ts X-21..X-34): checkpoint consistency,
// witness cosignature thresholds, receipt inclusion, equivocation / split view, and notice handling. Operation
// `log.verify_election`: the full verifier with QV-18 log evidence. File-based inputs (QV-34 §10.2) keep the corpus small:
// an election bundle and a log export by path, plus top-level replacements for the export (usually `checkpoints`).
import { bytesToHex, ed25519Keypair, sha256, utf8, type Ed25519Keypair } from '@quietvote/crypto';
import { b64 } from '@quietvote/board';
import { verifyElection, type ElectionBundle, type LogEvidence, type VerificationReport } from '../../src/index.ts';
import { isoSec, type Cosig, type Head } from '../helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, publishTally, setup, type Sim } from '../helpers/sim.ts';
import { buildLogView, controlRecord, insertAt, markerSeq, signHeads, type EntryOverride, type LogView } from './logboard.ts';

const H = bytesToHex;
export const LOG_SEED = 'vec-log-layer';
export const LOG_DIR = 'elections/log-layer-4v';
export const LOG_OPERATION = 'log.verify_election';

/** Input of one `log.verify_election` vector (paths relative to the `v1/` tree root). */
export interface LogVectorInput {
  bundle: { path: string };
  board: { path: string; replace?: Record<string, unknown> };
  receipts?: unknown[];
  observed?: unknown[];
  witnesses?: { name: string; pk: string }[];
}

/** Codes the log layer emits (logcheck.ts); the primary `error` of a negative vector is one of them. */
export const LOG_CODES = new Set(['E_LOG_FORMAT', 'E_LOG_BINDING', 'E_LOG_CHECKPOINT', 'E_LOG_FORK', 'E_LOG_ROLLBACK', 'E_LOG_WITNESS', 'E_LOG_RECEIPT', 'E_LOG_RECEIPT_CLASH', 'E_TIME_WINDOW']);

/** Resolves a vector input into verifier arguments; `read` loads a file of the tree by its relative path. */
export function resolveLogVector(i: LogVectorInput, read: (path: string) => unknown): { bundle: ElectionBundle; log: LogEvidence } {
  const bundle = JSON.parse(JSON.stringify(read(i.bundle.path))) as ElectionBundle;
  const board = { ...(JSON.parse(JSON.stringify(read(i.board.path))) as Record<string, unknown>), ...JSON.parse(JSON.stringify(i.board.replace ?? {})) };
  const log: LogEvidence = { board };
  if (i.receipts !== undefined) log.receipts = JSON.parse(JSON.stringify(i.receipts));
  if (i.observed !== undefined) log.observed = JSON.parse(JSON.stringify(i.observed));
  if (i.witnesses !== undefined) log.witnesses = JSON.parse(JSON.stringify(i.witnesses));
  return { bundle, log };
}

export const failedChecks = (r: VerificationReport): string[] => Object.entries(r.checks).filter(([, s]) => s === 'fail').map(([k]) => k).sort();
const logFindings = (r: VerificationReport): string[] => r.findings.filter((f) => LOG_CODES.has(f.code) && f.cls !== 'L').map((f) => f.code);

type Envelope = (suite: string, operation: string, description: string, origin: 'external' | 'quietvote' | 'hybrid', vectors: unknown[]) => unknown;

interface Spec {
  id: string;
  comment: string;
  tags: string[];
  input: LogVectorInput;
  /** Expected primary code (negative vector) or undefined (positive). */
  code?: string;
  verdict: 'PASS' | 'FAIL';
  /** Caveat substrings the report must contain (informational; carried as `surfaces:` tags). */
  surfaces?: string[];
}

/** Honest flow: v0 yes, v1 yes (identical choice), v2 no, v3 yes, v0 revotes no (when `revote`), close, tally by T1, T2. */
async function election(revote: boolean): Promise<{ sim: Sim; bundle: ElectionBundle; seqs: { v0: number; v1: number; v2: number; revote: number } }> {
  const W = [1, 2, 3].map((i) => ({ name: `w${i}`, pk: H(kp(LOG_SEED, `w${i}`).publicKey) }));
  const sim = await setup({
    seed: LOG_SEED, n: 2, t: 2, voters: 4, contests: defaultContests().filter((c) => c.id === 'budget'), boundLog: true, witnessQuorum: 2, witnesses: W,
  });
  const v0 = sim.seq + 1;
  castBallot(sim, 0, { budget: ['yes'] });
  const v1 = sim.seq + 1;
  castBallot(sim, 1, { budget: ['yes'] });
  const v2 = sim.seq + 1;
  castBallot(sim, 2, { budget: ['no'] });
  castBallot(sim, 3, { budget: ['yes'] });
  let rv = -1;
  if (revote) {
    rv = sim.seq + 1;
    castBallot(sim, 0, { budget: ['no'] });
  }
  closeElection(sim);
  publishTally(sim, [1, 2]);
  return { sim, bundle: JSON.parse(JSON.stringify(bundleOf(sim))) as ElectionBundle, seqs: { v0, v1, v2, revote: rv } };
}

export async function generateLogLayer(
  put: (path: string, o: unknown) => void,
  envelope: Envelope,
  assert: (c: unknown, m: string) => asserts c,
  expectedOf: (r: VerificationReport) => unknown,
): Promise<void> {
  const files = new Map<string, unknown>();
  const save = (path: string, o: unknown): string => {
    files.set(path, JSON.parse(JSON.stringify(o)));
    put(path, o);
    return path;
  };
  const read = (path: string): unknown => {
    const v = files.get(path);
    assert(v !== undefined, `log vectors: no file ${path}`);
    return v;
  };
  const logKey = kp(LOG_SEED, 'log');
  const wk: Record<string, Ed25519Keypair> = { w1: kp(LOG_SEED, 'w1'), w2: kp(LOG_SEED, 'w2'), w3: kp(LOG_SEED, 'w3'), w9: kp(LOG_SEED, 'w9') };
  const cos = (ts: number, ...who: string[]): Cosig[] => who.map((n) => ({ name: n, key: wk[n]!, ts }));

  const honest = await election(true);
  const adv = await election(false);
  const m = honest.bundle.manifest.body;
  const vo = isoSec(m.voting_open);
  const vc = isoSec(m.voting_close);
  const skew = m.clock_skew_s;

  type Tweak = Partial<Record<'setup' | 'ballots' | 'close' | 'final', Cosig[]>>;
  /** Witnessed heads at each QV-18 §9.4 gate with plausible times (same layout as loglayer.test.ts). */
  const heads = (b: ElectionBundle, t: Tweak = {}): Head[] => {
    const open = markerSeq(b, 'election-open');
    const close = markerSeq(b, 'election-close');
    const n = b.log.at(-1)!.seq + 1;
    const hs: Head[] = [
      { size: open, cosigs: t.setup ?? cos(vo - 3600, 'w1', 'w2') },
      { size: close, cosigs: t.ballots ?? cos(vo + 3600, 'w1', 'w2', 'w3') },
      { size: close + 1, cosigs: t.close ?? cos(vc + 60, 'w1', 'w2') },
    ];
    if (n > close + 1) hs.push({ size: n, cosigs: t.final ?? cos(vc + 120, 'w1', 'w2') });
    return hs;
  };
  const scenario = (name: string, b: ElectionBundle, sim: Sim, over?: ReadonlyMap<number, EntryOverride>): { view: LogView; bundle: string; board: string; b: ElectionBundle } => {
    const view = buildLogView(sim, b, heads(b), logKey, over);
    return { view, b, bundle: save(`${LOG_DIR}/${name}bundle.json`, b), board: save(`${LOG_DIR}/${name}board.json`, view.json) };
  };
  const H0 = scenario('', honest.bundle, honest.sim);
  const A0 = scenario('adv-', adv.bundle, adv.sim);
  // elections/<name>/ convention (bundle.json + expected-report.json): the honest bundle without log evidence.
  const plain = await verifyElection(JSON.parse(JSON.stringify(honest.bundle)));
  assert(plain.verdict === 'PASS', 'log-layer honest bundle must pass without log evidence');
  put(`${LOG_DIR}/expected-report.json`, expectedOf(plain));
  const hv = H0.view;
  const n = hv.tree.size;
  const close = markerSeq(honest.bundle, 'election-close');
  const open = markerSeq(honest.bundle, 'election-open');
  const voter = (i: number): string => H(honest.sim.voters[i]!.publicKey);
  const on = (s: { bundle: string; board: string }, replace?: Record<string, unknown>, extra: Omit<LogVectorInput, 'bundle' | 'board'> = {}): LogVectorInput => ({
    bundle: { path: s.bundle }, board: replace === undefined ? { path: s.board } : { path: s.board, replace }, ...extra,
  });
  const cps = (s: { view: LogView; b: ElectionBundle }, t: Tweak): { checkpoints: string[] } => ({ checkpoints: s.view.sign(heads(s.b, t)) });

  const specs: Spec[] = [];
  const pos = (id: string, comment: string, tags: string[], input: LogVectorInput, surfaces?: string[]): void =>
    void specs.push({ id, comment, tags: ['kat', ...tags], input, verdict: 'PASS', ...(surfaces === undefined ? {} : { surfaces }) });
  const neg = (id: string, comment: string, tags: string[], input: LogVectorInput, code: string, verdict: 'PASS' | 'FAIL' = 'FAIL', surfaces?: string[]): void =>
    void specs.push({ id, comment, tags: ['negative', ...tags], input, code, verdict, ...(surfaces === undefined ? {} : { surfaces }) });

  // ---------------------------------------------------------------- checkpoint consistency (QV-18 §8, §13 steps 2 and 4; X-26)
  const rcRevote = hv.receipt(honest.seqs.revote, n);
  const rcV2 = hv.receipt(honest.seqs.v2, close);
  pos('log-honest-witnessed', 'Honest log: every head log-signed, every QV-18 §9.4 gate quorum-witnessed, two voter receipts, all heads re-observed', ['checkpoint', 'witness', 'receipt'],
    on(H0, undefined, { receipts: [{ receipt: rcRevote, voter: voter(0) }, { receipt: rcV2, voter: voter(2) }], observed: [...hv.notes.values()] }));
  pos('log-heads-any-order', 'Tree heads listed in reverse order: order of notes in the export is irrelevant', ['checkpoint'], on(H0, { checkpoints: [...hv.notes.values()].reverse() }));
  pos('log-observed-older-head-consistent', 'An older log-signed head seen elsewhere (pin/gossip) that is a prefix of this log', ['checkpoint', 'split-view'], on(H0, undefined, { observed: [hv.notes.get(open)!] }));
  pos('log-observed-unsigned-ignored', 'An observed note without a valid log signature is not evidence (warning only, X-26)', ['checkpoint'], on(H0, undefined, { observed: ['junk\n'] }));
  const otherKey = ed25519Keypair(sha256(utf8(`${LOG_SEED}/not-the-log`)));
  neg('log-head-wrong-log-key', 'Every head signed by a key other than manifest bb.log_pk', ['checkpoint'],
    on(H0, { checkpoints: [...signHeads(hv.origin, hv.tree, otherKey, heads(honest.bundle)).values()] }), 'E_LOG_CHECKPOINT');
  const edited = [...hv.notes.values()];
  edited[1] = edited[1]!.replace(/\n([A-Za-z0-9+/]{4})/, (_m, x: string) => `\n${x === 'AAAA' ? 'BBBB' : 'AAAA'}`);
  neg('log-head-root-edited', 'A tree head root edited after signing', ['checkpoint'], on(H0, { checkpoints: edited }), 'E_LOG_CHECKPOINT');
  neg('log-head-missing-full-size', 'No log-signed head covers the whole log', ['checkpoint'], on(H0, { checkpoints: [...hv.notes.values()].slice(0, -1) }), 'E_LOG_CHECKPOINT');
  neg('log-export-other-log-key', 'The export names a log key other than bb.log_pk (self-attested key is never trusted)', ['checkpoint', 'binding'],
    on(H0, { policy: { ...(hv.json['policy'] as Record<string, unknown>), log_pk_b64: b64(wk['w1']!.publicKey) } }), 'E_LOG_BINDING');
  neg('log-export-other-origin', 'The export is for another log origin', ['binding'], on(H0, { origin: 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa' }), 'E_LOG_BINDING');

  // ---------------------------------------------------------------- equivocation / split view (QV-18 §9.5, §9.6; R-01 #6)
  const forkNote = signHeads(hv.origin, A0.view.tree, logKey, [{ size: close }]).get(close)!;
  neg('equivocation-two-roots-same-size', 'The export carries two log-signed roots for one size (QV-18 §9.6 fork)', ['equivocation', 'attack:split-view'],
    on(H0, { checkpoints: [...hv.notes.values(), forkNote] }), 'E_LOG_FORK');
  neg('split-view-observed-fork', 'A log-signed head from another view (gossip/witness monitoring) is not a prefix of this log', ['equivocation', 'attack:split-view'],
    on(H0, undefined, { observed: [forkNote] }), 'E_LOG_FORK');
  pos('split-view-adversarial-view-alone', 'The adversarial view (revote dropped, re-signed, cosigned by witnesses that never saw the honest view) verifies on its own: detection needs receipts or observed heads (QV-18 §2 non-claim)', ['split-view', 'limitation'], on(A0));
  neg('split-view-observed-rollback', 'Adversarial view vs. the honest full-size head: log-signed size larger than the log (ROLLBACK_DETECTED)', ['equivocation', 'rollback'],
    on(A0, undefined, { observed: [hv.notes.get(n)!] }), 'E_LOG_ROLLBACK');
  neg('split-view-observed-honest-head', 'Adversarial view vs. an honest head of a size it has: different prefix root (EQUIVOCATION)', ['equivocation', 'attack:split-view'],
    on(A0, undefined, { observed: [hv.notes.get(close)!] }), 'E_LOG_FORK');

  // ---------------------------------------------------------------- witness cosignature thresholds (QV-18 REQ-020, §9.3, §9.4; X-23, X-25, X-29)
  pos('witness-all-three', 'Every head cosigned by all three manifest witnesses (k = 2)', ['witness'],
    on(H0, cps(H0, { setup: cos(vo - 3600, 'w1', 'w2', 'w3'), close: cos(vc + 60, 'w1', 'w2', 'w3'), final: cos(vc + 120, 'w1', 'w2', 'w3') })));
  neg('witness-below-quorum-setup', 'One cosignature on the head before election-open (k = 2)', ['witness', 'threshold'], on(H0, cps(H0, { setup: cos(vo - 3600, 'w1') })), 'E_LOG_WITNESS');
  const imp: Cosig = { name: 'w2', key: ed25519Keypair(sha256(utf8(`${LOG_SEED}/impostor`))), ts: vc + 60 };
  neg('witness-impostor-key', 'A cosignature under the name w2 made with another key does not count', ['witness', 'threshold'],
    on(H0, cps(H0, { ballots: cos(vo + 3600, 'w1'), close: [...cos(vc + 60, 'w1'), imp] })), 'E_LOG_WITNESS');
  neg('witness-duplicate-cosigner', 'The same witness twice on one head counts once', ['witness', 'threshold'],
    on(H0, cps(H0, { setup: [...cos(vo - 3600, 'w1'), ...cos(vo - 3599, 'w1')] })), 'E_LOG_WITNESS');
  neg('witness-unknown-cosigner', 'A cosignature by a witness not in the manifest list does not count', ['witness', 'threshold'],
    on(H0, cps(H0, { setup: cos(vo - 3600, 'w1', 'w9') })), 'E_LOG_WITNESS');
  {
    const notes = H0.view.sign(heads(honest.bundle, { setup: cos(vo - 3600, 'w1') }));
    const w2line = notes[1]!.split('\n').find((l) => l.startsWith('— w2 '))!;
    notes[0] = `${notes[0]!}${w2line}\n`;
    neg('witness-cosig-from-other-head', 'A valid w2 cosignature line copied from another tree head (cosignature for a different size/root)', ['witness', 'threshold'],
      on(H0, { checkpoints: notes }), 'E_LOG_WITNESS');
    const t = H0.view.sign(heads(honest.bundle, { ballots: cos(vo + 3600, 'w1') }));
    const lines = t[2]!.split('\n');
    const k = lines.findIndex((l) => l.startsWith('— w2 '));
    const raw = Buffer.from(lines[k]!.slice(5), 'base64');
    raw[11] = raw[11]! ^ 1;
    lines[k] = `— w2 ${raw.toString('base64')}`;
    t[2] = lines.join('\n');
    neg('witness-cosig-tampered', 'A cosignature timestamp edited after signing', ['witness', 'threshold'], on(H0, { checkpoints: t }), 'E_LOG_WITNESS');
  }
  neg('witness-non-monotone-excluded', 'w1 timestamps decrease as the tree grows: w1 excluded (ALARM), quorum then fails (X-29)', ['witness', 'witness-conflict'],
    on(H0, cps(H0, { setup: [...cos(vc + 9999, 'w1'), ...cos(vo - 3600, 'w2')] })), 'E_LOG_WITNESS');
  neg('witness-close-to-tally-unwitnessed', 'No quorum-witnessed head of size in [seq(close), seq(tally)] (QV-18 §9.4)', ['witness', 'gate'],
    on(H0, cps(H0, { ballots: cos(vo + 3600, 'w1'), close: cos(vc + 60, 'w3') })), 'E_LOG_WITNESS');

  // ---------------------------------------------------------------- witnessed times (QV-16 §5.14.3; X-25)
  neg('time-late-cutoff', 'election-close first witnessed after voting_close + clock_skew_s', ['time'],
    on(H0, cps(H0, { close: cos(vc + skew + 1, 'w1', 'w2'), final: cos(vc + 9000, 'w1', 'w2') })), 'E_TIME_WINDOW');
  neg('time-early-close', 'election-close witnessed a day before voting_close', ['time'],
    on(H0, cps(H0, { ballots: cos(vo + 10, 'w1', 'w2'), close: cos(vc - 86400, 'w1', 'w2') })), 'E_TIME_WINDOW');
  neg('time-early-open', 'election-open witnessed before voting_open - clock_skew_s', ['time'],
    on(H0, cps(H0, { ballots: cos(vo - skew - 1, 'w1', 'w2') })), 'E_TIME_WINDOW');

  // ---------------------------------------------------------------- receipts (QV-18 §7, §9.6 broken_promise; X-27, X-28)
  const r0 = hv.receipt(honest.seqs.v0, n);
  const r1 = hv.receipt(honest.seqs.v1, n);
  pos('receipt-inclusion-older-head', 'Receipt with an inclusion proof against an older (close) head', ['receipt'], on(H0, undefined, { receipts: [{ receipt: rcV2, voter: voter(2) }] }));
  neg('receipt-forged-promise', 'Receipt promise not signed by the log key: not evidence (class I), check fails, verdict unaffected', ['receipt'],
    on(H0, undefined, { receipts: [{ receipt: { ...r1, promise_sig: b64(new Uint8Array(64)) }, voter: voter(1) }] }), 'E_LOG_RECEIPT', 'PASS');
  const otherView = buildLogView(honest.sim, honest.bundle, heads(honest.bundle), otherKey);
  neg('receipt-other-log-key', 'Receipt signed by another log key', ['receipt'],
    on(H0, undefined, { receipts: [{ receipt: otherView.receipt(honest.seqs.v2, close), voter: voter(2) }] }), 'E_LOG_RECEIPT', 'PASS');
  neg('receipt-malformed', 'Malformed receipt', ['receipt'], on(H0, undefined, { receipts: [{ receipt: { junk: true }, voter: voter(1) }] }), 'E_LOG_RECEIPT', 'PASS');
  neg('receipt-broken-promise-dropped-revote', 'Adversarial view vs. the voter\'s receipt for the dropped revote: another leaf at that seq (broken promise)', ['receipt', 'attack:drop', 'split-view'],
    on(A0, undefined, { receipts: [{ receipt: hv.receipt(honest.seqs.revote, close), voter: voter(0) }] }), 'E_LOG_RECEIPT');
  neg('receipt-tail-dropped', 'Receipt for a seq beyond the end of the log (silent tail drop)', ['receipt', 'attack:drop'],
    on(A0, undefined, { receipts: [{ receipt: hv.receipt(n - 1, n), voter: voter(0) }] }), 'E_LOG_RECEIPT');
  neg('receipt-clash-other-voter', 'v1 holds the receipt of v0\'s ballot (clash, ALARM: not provable to third parties)', ['receipt', 'attack:clash'],
    on(H0, undefined, { receipts: [{ receipt: r0, voter: voter(1) }] }), 'E_LOG_RECEIPT_CLASH', 'PASS');
  neg('receipt-two-claimants', 'Two voters claim the same entry', ['receipt', 'attack:clash'],
    on(H0, undefined, { receipts: [{ receipt: r0, voter: voter(0) }, { receipt: r0, voter: voter(1) }] }), 'E_LOG_RECEIPT_CLASH', 'PASS');
  neg('receipt-code-mismatch', 'Recorded ballot code differs from the logged ballot', ['receipt', 'attack:clash'],
    on(H0, undefined, { receipts: [{ receipt: r1, voter: voter(1), code: '00'.repeat(32) }] }), 'E_LOG_RECEIPT_CLASH', 'PASS');

  // ---------------------------------------------------------------- notices and control entries (X-31..X-34)
  const S = honest.sim;
  const waiver = controlRecord(S, 'witness-waiver', { reason: 'witness w3 offline' });
  const nb = (name: string, at: number, rec: unknown, over?: ReadonlyMap<number, EntryOverride>): ReturnType<typeof scenario> =>
    scenario(`notices/${name}.`, insertAt(honest.bundle, at, rec), S, over);
  const wOpen = nb('waiver-before-open', open, waiver);
  pos('notice-waiver-reported', 'Coordinator-signed witness waiver before election-open; gates met anyway: PASS, waiver surfaced (QV-18 REQ-052). Notice records are not QV-16 suite v1 records, so the protocol layer reports them as unknown (class L, chk.encoding.canonical)', ['notice', 'waiver'],
    on(wOpen), ['WITNESS WAIVER']);
  neg('notice-waiver-does-not-unblock-open-gate', 'Waiver present, head before election-open has one cosignature: still E_LOG_WITNESS (a waiver never relaxes a gate)', ['notice', 'waiver', 'attack:waiver'],
    on(wOpen, cps(wOpen, { setup: cos(vo - 3600, 'w1') })), 'E_LOG_WITNESS', 'FAIL', ['WITNESS WAIVER']);
  const wClose = nb('waiver-after-close', close + 1, waiver);
  neg('notice-waiver-does-not-unblock-tally-gate', 'Waiver between close and tally, no quorum head in [close, tally]: still E_LOG_WITNESS', ['notice', 'waiver', 'attack:waiver'],
    on(wClose, cps(wClose, { ballots: cos(vo + 3600, 'w1'), close: cos(vc + 60, 'w3') })), 'E_LOG_WITNESS', 'FAIL', ['WITNESS WAIVER']);
  const wQ = nb('waiver-with-quorum-field', open, controlRecord(S, 'witness-waiver', { extra: { quorum: 1 } }));
  neg('notice-waiver-carries-quorum', 'Waiver body carrying a quorum field: closed schema, malformed (a notice cannot restate a threshold)', ['notice', 'waiver', 'attack:waiver'],
    on(wQ, cps(wQ, { setup: cos(vo - 3600, 'w1') })), 'E_LOG_FORMAT');
  const t1 = S.trusteeKeys[0]!;
  const wT = nb('waiver-by-trustee', open, controlRecord(S, 'witness-waiver', { signer: t1 }), new Map([[open, { author: t1 }]]));
  neg('notice-waiver-by-trustee', 'Waiver authored and signed by a trustee key, not a coordinator (QV-18 REQ-052)', ['notice', 'waiver', 'authority'], on(wT), 'E_LOG_BINDING');
  const wS = nb('waiver-record-sig-not-coordinator', open, controlRecord(S, 'witness-waiver', { signer: S.voters[0]! }));
  neg('notice-waiver-record-not-coordinator-signed', 'Entry header by the coordinator but the record signature is a voter key: fewer than m coordinator signatures', ['notice', 'waiver', 'authority'],
    on(wS), 'E_LOG_BINDING');
  const wE = nb('waiver-in-anchor-entry', open, waiver, new Map([[open, { type: 'anchor' }]]));
  neg('notice-waiver-wrong-entry-type', 'Waiver record carried in an `anchor` entry', ['notice', 'waiver'], on(wE), 'E_LOG_BINDING');
  const extension = controlRecord(S, 'extension', { reason: 'outage' });
  const eB = nb('extension-before-close', close, extension);
  pos('notice-extension-reported', 'Coordinator extension notice before election-close, close witnessed on time: PASS, extension surfaced, not applied', ['notice', 'extension'],
    on(eB), ['EXTENSION']);
  neg('notice-extension-does-not-move-close', 'Extension notice before close, close witnessed after voting_close + skew: still E_TIME_WINDOW (suite v1 has no extension record, QV-16 §5.14.3)', ['notice', 'extension', 'attack:extension'],
    on(eB, cps(eB, { close: cos(vc + skew + 1, 'w1', 'w2'), final: cos(vc + 9000, 'w1', 'w2') })), 'E_TIME_WINDOW', 'FAIL', ['EXTENSION']);
  const eA = nb('extension-after-close', close + 1, extension);
  neg('notice-extension-retroactive', 'Extension notice sequenced after election-close (QV-03 §5.5: only before close)', ['notice', 'extension', 'attack:extension'], on(eA), 'E_TIME_WINDOW');
  const pr = insertAt(insertAt(honest.bundle, honest.seqs.v2, controlRecord(S, 'pause', { reason: 'outage' })), honest.seqs.v2 + 2, controlRecord(S, 'resume'));
  const pR = scenario('notices/pause-resume.', pr, S);
  neg('notice-pause-resume-do-not-move-close', 'Pause/resume during voting, close witnessed after voting_close + skew: still E_TIME_WINDOW (halt credit not applied)', ['notice', 'control'],
    on(pR, cps(pR, { close: cos(vc + skew + 1, 'w1', 'w2'), final: cos(vc + 9000, 'w1', 'w2') })), 'E_TIME_WINDOW', 'FAIL', ['PAUSE', 'RESUME']);
  const uK = nb('unknown-kind', close, controlRecord(S, 'lower-quorum'));
  neg('notice-unknown-kind', 'Coordinator-signed control record with an unknown action: fail closed', ['notice', 'fail-closed'], on(uK), 'E_LOG_BINDING');
  const body = { proto: 'qv1-r255-sha2', type: 'waiver', code: 'witness_waiver', text: 'w3 offline' };
  const uB = nb('unrecognised-body', close, { body, sigs: [{ key: H(S.coord[0]!.publicKey), sig: '00'.repeat(64) }] });
  neg('notice-unrecognised-body', 'A `notice` entry whose body is neither a DKG marker nor a control record: fail closed', ['notice', 'fail-closed'], on(uB), 'E_LOG_BINDING');

  // ---------------------------------------------------------------- run, assert, emit
  const out: unknown[] = [];
  const ids = new Set<string>();
  for (const s of specs) {
    assert(!ids.has(s.id), `log vector id ${s.id} duplicated`);
    ids.add(s.id);
    const { bundle, log } = resolveLogVector(s.input, read);
    const r = await verifyElection(bundle, { log });
    const failed = failedChecks(r);
    assert(r.verdict === s.verdict, `log vector ${s.id}: verdict ${r.verdict} (${JSON.stringify(r.findings.map((f) => `${f.code}/${f.cls}`))})`);
    for (const c of s.surfaces ?? []) assert(r.caveats.some((x) => x.includes(c)), `log vector ${s.id}: caveat '${c}' missing (${JSON.stringify(r.caveats)})`);
    const tags = [...s.tags, ...(s.surfaces ?? []).map((c) => `surfaces:${c}`)];
    if (s.code === undefined) {
      assert(logFindings(r).length === 0, `log vector ${s.id}: unexpected log findings ${JSON.stringify(logFindings(r))}`);
      out.push({ id: s.id, comment: s.comment, input: s.input, expect: { ok: true, output: { verdict: r.verdict, checks: r.checks } }, tags });
    } else {
      assert(logFindings(r).includes(s.code), `log vector ${s.id}: ${s.code} missing (${JSON.stringify(r.findings.map((f) => `${f.code}/${f.cls}`))})`);
      assert(failed.length > 0, `log vector ${s.id}: no named check fails`);
      out.push({ id: s.id, comment: s.comment, input: s.input, expect: { ok: false, error: s.code, failed_checks: failed }, tags: [...tags, `verdict:${r.verdict}`] });
    }
  }
  put(`${LOG_DIR}/vectors.json`, envelope('elections/log-layer', LOG_OPERATION,
    'QV-18 log layer through the full verifier: checkpoint consistency, witness thresholds, receipts, equivocation/split view, notices (logcheck X-21..X-34)', 'quietvote', out));
}
