// Thin composition: protocol.verifyElection (Appendix C) + board.verifyLog (QV-18 section 13) -> one report.
// No cryptography of its own. Everything here is bookkeeping: mapping check results onto V1..V14,
// deriving the trust anchors for the board layer from the *verified* manifest, and hashing the report.
import { bytesToHex, hexToBytes, jcs, sha256 } from '@quietvote/crypto';
import {
  authorKeyId, verifyLog, type LogBundle, type VerifyOptions, type Verdict as BoardVerdict, type WitnessPolicy,
} from '@quietvote/board';
import {
  verifyElection, witnessAnchors, type LogEvidence, type Manifest, type ReceiptClaim, type VerificationReport, type WitnessAnchor,
} from '@quietvote/protocol';
import { loadBundle } from './bundle.ts';
import {
  V_IDS, V_TITLES, type BoardSummary, type LogLayerSummary, type ReportFinding, type VId, type VResult, type VStatus, type Verdict,
  type VerifierReport,
} from './report.ts';

export const VERIFIER_TOOL = 'quietvote-verifier/0.1.0';

export interface VerifyBundleOptions {
  /** Manifest hash obtained out of band (hex). Overrides the value inside the bundle, which is attacker-controlled. */
  pinnedManifestHash?: string;
  /** Extra author public keys (hex) accepted for board entries, beyond coordinator/trustee/roll keys of the manifest. */
  extraAuthorKeys?: string[];
  /** Previously pinned checkpoint note (rollback / equivocation detection). Also used as observed evidence by the log layer. */
  pinnedCheckpoint?: string;
  /** Witness trust anchors held by the verifier caller. Used only when the manifest lists no witnesses (QV-18 X-23). */
  witnesses?: WitnessAnchor[];
  /** Checkpoint notes seen elsewhere (gossip, witness monitoring). Only log-signed notes are evidence (QV-18 §9.5, X-26). */
  observedCheckpoints?: string[];
  /** Voter receipts to check against the board export (QV-05 G-V2). Needs the bundle's `board` member. */
  receipts?: ReceiptClaim[];
}

/** Log-layer evidence for protocol.verifyElection, from the bundle's board export and the caller's options. */
function logEvidence(boardJson: unknown, o: VerifyBundleOptions): LogEvidence {
  const observed = [...(o.observedCheckpoints ?? []), ...(o.pinnedCheckpoint === undefined ? [] : [o.pinnedCheckpoint])];
  return {
    board: boardJson,
    ...(o.witnesses === undefined ? {} : { witnesses: o.witnesses }),
    observed,
    receipts: o.receipts ?? [],
    extraAuthorKeys: o.extraAuthorKeys ?? [],
  };
}

/** Protocol C3 codes that belong to the log layer (V4), for the V4 notes. */
const LOG_CODES = [
  'E_LOG_BINDING', 'E_LOG_FORMAT', 'E_LOG_ORDER', 'E_LOG_CHECKPOINT', 'E_LOG_FORK', 'E_LOG_ROLLBACK', 'E_LOG_WITNESS',
  'E_LOG_RECEIPT', 'E_LOG_RECEIPT_CLASH',
];

const H = bytesToHex;
const hasHex = (s: unknown, n: number): s is string => typeof s === 'string' && s.length === n && /^[0-9a-f]+$/.test(s);

function emptyChecks(): Record<VId, VResult> {
  const c = {} as Record<VId, VResult>;
  for (const id of V_IDS) c[id] = { status: 'not_run', title: V_TITLES[id], notes: [] };
  return c;
}

function blankReport(): VerifierReport {
  return {
    tool: VERIFIER_TOOL, verdict: 'FAIL', checks: emptyChecks(), chk: {}, findings: [], warnings: [], caveats: [],
    counts: { cast: 0, spoiled: 0, counted: 0, ignored: {} }, reportHash: '',
  };
}

/** Rejection report for input that is not a bundle at all (still a structured report, never a throw). */
function rejected(errors: string[]): VerifierReport {
  const r = blankReport();
  for (const e of errors) r.findings.push({ code: 'E_SCHEMA', cls: 'F', detail: e });
  r.checks.V14 = { status: 'fail', title: V_TITLES.V14, notes: ['bundle could not be loaded'] };
  r.chk['chk.encoding.canonical'] = 'fail';
  return seal(r);
}

export function hashReport(r: VerifierReport): string {
  const { reportHash: _h, selfTest: _s, ...rest } = r;
  void _h;
  void _s;
  return H(sha256(jcs(rest)));
}

function seal(r: VerifierReport): VerifierReport {
  r.reportHash = hashReport(r);
  return r;
}

function boardResolver(m: Manifest, roll: readonly unknown[], extra: readonly string[]): (h: { author: Uint8Array }) => Uint8Array | undefined {
  const keys = new Map<string, Uint8Array>();
  const add = (hex: unknown): void => {
    if (!hasHex(hex, 64)) return;
    const pk = hexToBytes(hex);
    keys.set(H(authorKeyId('ed25519', pk)), pk);
  };
  for (const k of m.coordinator.keys) add(k);
  for (const t of m.trustees) add(t.sign_pk);
  for (const v of roll) add(v);
  for (const k of extra) add(k);
  return (h) => keys.get(H(h.author));
}

function runBoard(m: Manifest, roll: readonly unknown[], board: LogBundle, o: VerifyBundleOptions): BoardVerdict {
  // The log key and witness quorum come from the signature-verified manifest; witness identities can only come
  // from the bundle (self-attested: the verifier warns, see board.verifyLog).
  // A bundle may only make the quorum stricter than the manifest, never laxer.
  const policy: WitnessPolicy = { ...board.policy.witnessPolicy, quorum: Math.max(m.bb.witness_quorum, board.policy.witnessPolicy.quorum) };
  const opts: VerifyOptions = {
    logPublicKey: hexToBytes(m.bb.log_pk),
    witnessPolicy: policy,
    resolveAuthorKey: boardResolver(m, roll, o.extraAuthorKeys ?? []),
  };
  if (o.pinnedCheckpoint !== undefined) opts.pinned = o.pinnedCheckpoint;
  return verifyLog(board, opts);
}

/** Verifies a bundle given as text/bytes (strict QV-JSON) or as an already parsed value. Never throws. */
export async function verifyBundle(input: string | Uint8Array | object, o: VerifyBundleOptions = {}): Promise<VerifierReport> {
  try {
    const loaded = loadBundle(input);
    if (!loaded.ok) return rejected(loaded.errors);
    const election = { ...loaded.value.election };
    if (o.pinnedManifestHash !== undefined) election.manifest_hash = o.pinnedManifestHash;
    const boardJson = loaded.value.boardJson;
    const log = boardJson === undefined ? undefined : logEvidence(boardJson, o);
    const pr = await verifyElection(election, log === undefined ? {} : { log });
    let br: BoardVerdict | undefined;
    let boardSkipped: string | undefined;
    const board = loaded.value.board;
    if (board !== undefined) {
      if (pr.checks['chk.manifest.sig'] !== 'pass') boardSkipped = 'manifest not verified, so the log key and witness quorum cannot be trusted';
      else {
        try {
          br = runBoard(election.manifest.body as Manifest, election.roll, board, o);
        } catch (e) {
          boardSkipped = `board verification raised: ${e instanceof Error ? e.message : 'unknown'}`;
        }
      }
    }
    const logInfo = log === undefined ? undefined : {
      // Witness keys are taken only from a verified manifest (or the caller); a bundle's own copy is never trusted.
      witness_keys: pr.checks['chk.manifest.sig'] === 'pass' ? witnessAnchors(election.manifest.body as Manifest, o.witnesses).source : 'none' as const,
      receipt_claims: log.receipts?.length ?? 0,
      observed_heads: log.observed?.length ?? 0,
    };
    const r = compose(pr, br, boardSkipped, board !== undefined, logInfo);
    if (log === undefined && ((o.receipts?.length ?? 0) > 0 || (o.observedCheckpoints?.length ?? 0) > 0 || o.pinnedCheckpoint !== undefined)) {
      r.caveats.push('log evidence (receipts, observed tree heads, pinned checkpoint) not checked: the bundle carries no board log export');
      return seal(r);
    }
    return r;
  } catch (e) {
    return rejected([`verifier internal rejection: ${e instanceof Error ? e.message : 'unknown'}`]);
  }
}

/** Two layer results for the same property: any failure fails it; pass needs both to pass; otherwise not run. */
const both = (a: VStatus, b: VStatus): VStatus => (a === 'fail' || b === 'fail' ? 'fail' : a === 'pass' && b === 'pass' ? 'pass' : 'not_run');

function compose(
  pr: VerificationReport, br: BoardVerdict | undefined, boardSkipped: string | undefined, hadBoard: boolean,
  logInfo?: Pick<LogLayerSummary, 'witness_keys' | 'receipt_claims' | 'observed_heads'>,
): VerifierReport {
  const r = blankReport();
  const chk: Record<string, VStatus> = { ...pr.checks };
  r.findings = pr.findings.map((f): ReportFinding => ({ code: f.code, cls: f.cls, ...(f.seq === undefined ? {} : { seq: f.seq }), detail: f.detail }));
  r.warnings = [...pr.warnings];
  r.caveats = pr.caveats.filter((c) => !c.startsWith('log integrity'));
  r.counts = pr.counts;
  if (pr.ctxPrefix !== undefined) r.ctxPrefix = pr.ctxPrefix;
  if (pr.results !== undefined) r.results = pr.results;

  // ---- board layer (board.verifyLog) and protocol log layer (C3, via protocol.verifyElection) -> chk.board.* and V4
  const v4: string[] = [];
  let boardFailed = false;
  let boardAppend: VStatus = 'not_run';
  let boardWitness: VStatus = 'not_run';
  if (br !== undefined) {
    const summary: BoardSummary = {
      integrity: br.integrity, treeSize: br.treeSize, witnessed: br.witnessed, redacted: br.redacted,
      failures: br.failures, warnings: br.warnings,
    };
    r.board = summary;
    for (const w of br.warnings) r.warnings.push(`board: ${w}`);
    for (const f of br.failures) {
      boardFailed = true;
      r.findings.push({ code: f.rule, cls: 'F', ...(f.seq === undefined ? {} : { seq: f.seq }), detail: `board: ${f.detail}` });
      v4.push(`${f.rule}${f.seq === undefined ? '' : ` @${f.seq}`}: ${f.detail}`);
    }
    boardAppend = boardFailed ? 'fail' : br.integrity === 'VERIFIED' ? 'pass' : 'not_run';
    if (br.integrity === 'PARTIAL') v4.push(`partial: ${br.redacted} entry bod${br.redacted === 1 ? 'y' : 'ies'} redacted, not fully checkable`);
    if (!boardFailed && br.witnessed.k > 0 && br.witnessed.latest) boardWitness = 'pass';
    else if (boardFailed && br.failures.some((f) => /witness|quorum|checkpoint|FORK/i.test(`${f.rule} ${f.detail}`))) boardWitness = 'fail';
    else {
      boardWitness = 'not_run';
      v4.push(br.witnessed.k === 0 ? 'NOT WITNESSED: witness quorum is 0' : 'latest checkpoint does not carry a witness quorum');
    }
  } else {
    v4.push(boardSkipped ?? (hadBoard ? 'board export present but not checked' : 'bundle carries no board log export'));
    if (!hadBoard) r.caveats.push('V4 not run: the bundle has no board log export, so ordering/omission of log entries was not checked');
    else if (boardSkipped !== undefined) r.caveats.push(`V4 not run: ${boardSkipped}`);
  }
  // Protocol C3 results are only present when the log export was passed to verifyElection (they are not_run otherwise).
  chk['chk.board.append_only'] = both(boardAppend, pr.checks['chk.board.append_only'] ?? 'not_run');
  chk['chk.board.witness'] = both(boardWitness, pr.checks['chk.board.witness'] ?? 'not_run');
  if (logInfo !== undefined) {
    r.log = {
      checks: {
        append_only: pr.checks['chk.board.append_only'] ?? 'not_run',
        witness: pr.checks['chk.board.witness'] ?? 'not_run',
        receipts: pr.checks['chk.receipts.sample'] ?? 'not_run',
        time_window: pr.checks['chk.time.window'] ?? 'not_run',
      },
      ...logInfo,
    };
    r.caveats = [...new Set(r.caveats)];
  }
  r.chk = chk;

  // ---- V mapping
  const set = (id: VId, status: VStatus, notes: string[] = []): void => {
    r.checks[id] = { status, title: V_TITLES[id], notes };
  };
  const detailsFor = (...codes: string[]): string[] =>
    r.findings.filter((f) => codes.includes(f.code) && f.cls !== 'I').map((f) => `${f.code}${f.seq === undefined ? '' : ` @${f.seq}`}: ${f.detail}`);

  set('V1', both(chk['chk.manifest.hash']!, chk['chk.manifest.sig']!), detailsFor('E_MANIFEST', 'E_MANIFEST_HASH', 'E_MANIFEST_SIG'));
  const rollFail = r.findings.some((f) => f.code === 'E_ROLL');
  set('V2', rollFail ? 'fail' : chk['chk.keys.trustees'] !== 'not_run' || chk['chk.ballots.valid'] !== 'not_run' ? 'pass' : 'not_run', detailsFor('E_ROLL'));
  set('V3', chk['chk.keys.trustees']!, detailsFor('E_DKG_R1', 'E_DKG_R2', 'E_DKG_COMPLAINT', 'E_DKG_FINAL', 'E_DKG_QUORUM', 'E_DKG_KEYCONF', 'E_DKG_MARKERS', 'E_DKG_EQUIVOCATION'));
  // V4 = log integrity: append-only + witnesses, plus receipt promises when any were checked (a receipt-free bundle does not block pass).
  const v4Parts: VStatus[] = [chk['chk.board.append_only']!, chk['chk.board.witness']!];
  if (chk['chk.receipts.sample'] !== 'not_run') v4Parts.push(chk['chk.receipts.sample']!);
  const v4Status: VStatus = v4Parts.includes('fail') ? 'fail' : v4Parts.every((s) => s === 'pass') ? 'pass' : 'not_run';
  const v4Notes = [...new Set([...v4, ...detailsFor(...LOG_CODES)])];
  set('V4', v4Status, v4Notes);
  set('V5', chk['chk.ballots.valid']!, detailsFor('E_SIG', 'E_CTX', 'E_VOTER_NOT_ELIGIBLE', 'E_STRUCTURE', 'E_POINT_DECODE', 'E_IDENTITY', 'E_SCALAR_RANGE', 'E_CDS', 'E_LIMIT_PROOF', 'E_SCHEMA', 'E_VERSION'));
  set('V6', chk['chk.ballots.latest']!, detailsFor('E_SUPERSEDES', 'E_REVOTE_LIMIT', 'E_DUP_CODE'));
  set('V7', chk['chk.time.window']!, detailsFor('E_TIME_WINDOW', 'E_MARKERS'));
  set('V8', chk['chk.benaloh.spoiled']!, detailsFor('E_SPOIL_MISMATCH', 'E_SPOILED_CODE_CAST'));
  set('V9', chk['chk.tally.aggregate']!, detailsFor('E_AGG_MISMATCH', 'E_AGG_IDENTITY', 'E_COUNTED_ROOT'));
  const dec = chk['chk.tally.decrypt']!;
  const dlog = r.findings.some((f) => f.code === 'E_DLOG_RANGE');
  const share = r.findings.some((f) => f.code === 'E_DEC_PROOF' || f.code === 'E_TALLY_INSUFFICIENT');
  set('V10', dec === 'fail' ? (dlog && !share ? 'pass' : 'fail') : dec, detailsFor('E_DEC_PROOF', 'E_TALLY_INSUFFICIENT'));
  set('V11', dec === 'fail' ? (share && !dlog ? 'pass' : 'fail') : dec, detailsFor('E_DLOG_RANGE'));
  set('V12', chk['chk.result.rules']!, detailsFor('E_RESULT', 'E_BELOW_FLOOR'));
  set('V13', 'not_run', ['no verifier step exists for steward/operator control entries yet (QV-ADR-022; see NOTES.md)']);
  // V14: completeness. A bundle without a tally record is incomplete, not failed.
  const enc = chk['chk.encoding.canonical']!;
  const tallyPresent = pr.verdict !== 'INCOMPLETE' && chk['chk.tally.decrypt'] !== 'not_run';
  set('V14', enc === 'fail' ? 'fail' : tallyPresent && enc === 'pass' ? 'pass' : 'not_run', enc === 'fail' ? ['non-canonical or malformed records present'] : tallyPresent ? [] : ['no tally record in the bundle']);

  // ---- verdict: FAIL if either layer fails; INCOMPLETE if nothing failed but no tally was verified
  const verdict: Verdict = pr.verdict === 'FAIL' || boardFailed ? 'FAIL' : pr.verdict;
  r.verdict = verdict;
  return seal(r);
}
