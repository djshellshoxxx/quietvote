// Report vocabulary: QV-05 V1..V14 (normative common vocabulary, QV-ADR-P05-2) over the QV-34 chk.* names.
export const V_IDS = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14'] as const;
export type VId = (typeof V_IDS)[number];
export type VStatus = 'pass' | 'fail' | 'not_run';
export type Verdict = 'PASS' | 'FAIL' | 'INCOMPLETE';

export const V_TITLES: Record<VId, string> = {
  V1: 'Manifest hash and coordinator signatures, rule bounds',
  V2: 'Roll root recomputed and bound to the manifest / roll-commit',
  V3: 'DKG transcript, complaints, joint key, trustee key confirmation',
  V4: 'Log integrity: entry signatures, tree heads, consistency, witnesses',
  V5: 'Every ballot: signature, eligibility, proofs, manifest binding',
  V6: 'Revote resolution (supersedes chain, limits, counted set)',
  V7: 'Election window and open/close markers',
  V8: 'Spoiled ballots (Benaloh) reproduce or are flagged',
  V9: 'Recomputed aggregate equals the published aggregate',
  V10: 'Every decryption share proof (Chaum-Pedersen)',
  V11: 'Combined plaintext and discrete-log step',
  V12: 'Outcome follows the manifest rules',
  V13: 'Steward/operator actions authorised (control entries)',
  V14: 'Bundle completeness and report hash',
};

export interface VResult {
  status: VStatus;
  title: string;
  /** Short, human-readable reasons (finding details, board failures, not-run explanations). */
  notes: string[];
}

export interface ReportFinding {
  code: string;
  cls: string;
  seq?: number;
  detail: string;
}

export interface BoardSummary {
  integrity: 'VERIFIED' | 'PARTIAL' | 'FAILED';
  treeSize: number;
  witnessed: { have: number; k: number; latest: boolean };
  redacted: number;
  failures: { seq?: number; rule: string; detail: string }[];
  warnings: string[];
}

/**
 * Protocol C3 log-layer results (protocol.verifyElection with `log` evidence, QV-16 App. C step 11): entry/record binding and
 * tree heads (`append_only`), witness gating (`witness`), voter receipts (`receipts`), witnessed election times
 * (`time_window`). Present only when the bundle carries a board export. The same statuses are folded into V4/V7.
 */
export interface LogLayerSummary {
  checks: { append_only: VStatus; witness: VStatus; receipts: VStatus; time_window: VStatus };
  /** Where the witness keys used by the log check came from: the signature-verified manifest, the caller, or none (QV-18 X-23). */
  witness_keys: 'manifest' | 'caller' | 'none';
  receipt_claims: number;
  observed_heads: number;
}

export interface SelfTestSummary {
  ok: boolean;
  control: boolean;
  total: number;
  rejected: number;
  failures: string[];
}

export interface VerifierReport {
  tool: string;
  verdict: Verdict;
  /** V1..V14 results. */
  checks: Record<VId, VResult>;
  /** The underlying QV-34 `chk.*` statuses (protocol layer, board folded into chk.board.*). */
  chk: Record<string, VStatus>;
  findings: ReportFinding[];
  warnings: string[];
  caveats: string[];
  counts: { cast: number; spoiled: number; counted: number; ignored: Record<string, number> };
  ctxPrefix?: string;
  results?: unknown;
  board?: BoardSummary;
  log?: LogLayerSummary;
  /** SHA-256 over the RFC 8785 canonical form of this report minus `reportHash` and `selfTest`. */
  reportHash: string;
  selfTest?: SelfTestSummary;
}
