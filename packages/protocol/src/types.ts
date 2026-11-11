export type Hex = string;
export const PROTO_ID = 'qv1-r255-sha2';

export type ErrorCode =
  | 'E_PARSE' | 'E_SCHEMA' | 'E_VERSION' | 'E_CTX' | 'E_VOTER_NOT_ELIGIBLE' | 'E_SIG' | 'E_STRUCTURE'
  | 'E_POINT_DECODE' | 'E_IDENTITY' | 'E_SCALAR_RANGE' | 'E_CDS' | 'E_LIMIT_PROOF' | 'E_TIME_WINDOW'
  | 'E_SUPERSEDES' | 'E_REVOTE_LIMIT' | 'E_DUP_CODE' | 'E_SPOILED_CODE_CAST' | 'E_SPOIL_MISMATCH'
  | 'E_DKG_R1' | 'E_DKG_R2' | 'E_DKG_COMPLAINT' | 'E_DKG_FINAL' | 'E_DKG_QUORUM' | 'E_DKG_KEYCONF' | 'E_DKG_MARKERS'
  | 'E_DKG_EQUIVOCATION' | 'E_AGG_IDENTITY' | 'E_AGG_MISMATCH' | 'E_DEC_PROOF' | 'E_TALLY_INSUFFICIENT'
  | 'E_TALLY_MISSING' | 'E_DLOG_RANGE' | 'E_COUNTED_ROOT' | 'E_RESULT' | 'E_BELOW_FLOOR' | 'E_MANIFEST' | 'E_MANIFEST_HASH'
  | 'E_MANIFEST_SIG' | 'E_ROLL' | 'E_MARKERS' | 'E_TRUSTEE_REFUSE' | 'E_LOG_ORDER'
  // QV-16 §8 `E_LOG_*` family (QV-18 log layer, NOTES X-21..X-30)
  | 'E_LOG_FORMAT' | 'E_LOG_BINDING' | 'E_LOG_CHECKPOINT' | 'E_LOG_FORK' | 'E_LOG_ROLLBACK' | 'E_LOG_WITNESS'
  | 'E_LOG_RECEIPT' | 'E_LOG_RECEIPT_CLASH';

export type Result<T, E = ErrorCode> = { ok: true; value: T } | { ok: false; error: E; detail?: string };
export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = (error: ErrorCode, detail?: string): { ok: false; error: ErrorCode; detail?: string } =>
  detail === undefined ? { ok: false, error } : { ok: false, error, detail };

export interface Sig {
  key: Hex;
  sig: Hex;
}
export interface SignedRecord<B> {
  body: B;
  sig: Sig;
}
export interface MultiSignedRecord<B> {
  body: B;
  sigs: Sig[];
}

export interface ManifestOption {
  id: string;
  label: string;
}
export interface ManifestContest {
  id: string;
  title: string;
  method: 'yes-no' | 'single-choice' | 'approval' | 'k-of-n';
  options: ManifestOption[];
  selection_limit?: number;
  winners?: number;
  min_selections: 0;
  rule?: { type: 'threshold'; num: number; den: number; basis: 'yes+no' | 'counted'; strict: boolean };
  tie_break: { type: 'status-quo' | 'declare-tie' | 'lexicographic' | 'beacon'; option?: string };
}
export interface Manifest {
  proto: string;
  type: 'manifest';
  election_id: Hex;
  title: string;
  created: string;
  voting_open: string;
  voting_close: string;
  clock_skew_s: number;
  contests: ManifestContest[];
  quorum?: { type: 'fraction' | 'count'; basis?: 'roll'; num?: number; den?: number; value?: number };
  roll: { scheme: 'ed25519-roll-v1'; weights: 'uniform'; root?: Hex; size?: number };
  trustees: { index: number; name: string; sign_pk: Hex }[];
  n: number;
  t: number;
  coordinator: { keys: Hex[]; m: number };
  ballots: { max_per_voter: number; max_spoils_per_voter: number };
  /** `witnesses` (optional, NOTES X-23): QV-18 REQ-020 witness keys pinned by the manifest hash (tlog-cosignature Ed25519, type 0x04). */
  bb: { log_id: Hex; log_pk: Hex; witness_quorum: number; witnesses?: { name: string; pk: Hex }[] };
  min_counted_ballots?: number;
  privacy_ack?: boolean;
  spoil_trustee_decrypt?: boolean;
}

export type MarkerName =
  | 'dkg-open' | 'dkg-r1-open' | 'dkg-r1-close' | 'dkg-r2-close' | 'dkg-r3-close' | 'dkg-final' | 'election-open' | 'election-close';
export interface MarkerBody {
  proto: string;
  type: 'marker';
  name: MarkerName;
  qmask?: number;
  K?: Hex;
  /** `election-open` only (QV-ADR-015): the open entry binds (manifest_hash, joint_key_seq, roll_commit_seq). Required there, forbidden on every other marker. */
  manifest_hash?: Hex;
  /** Log seq of the `dkg-final` marker (QV-18 `joint_key`). */
  joint_key_seq?: number;
  /** Log seq of the organizer-signed `roll-commit` record. */
  roll_commit_seq?: number;
}
export interface RollCommitBody {
  proto: string;
  type: 'roll-commit';
  root: Hex;
  size: number;
}

export interface CompactProofHex {
  c: Hex;
  s: Hex;
}
export interface DealingBody {
  proto: string;
  type: 'dkg-dealing';
  i: number;
  enc: { E: Hex; c: Hex; s: Hex };
  coeffs: { A: Hex; c: Hex; s: Hex }[];
}
export interface CommitBody {
  proto: string;
  type: 'dkg-commit';
  i: number;
  h: Hex;
}
export interface SharesBody {
  proto: string;
  type: 'dkg-shares';
  i: number;
  shares: { j: number; R: Hex; ct: Hex; tag: Hex }[];
}
export interface ComplaintBody {
  proto: string;
  type: 'dkg-complaint';
  accuser: number;
  accused: number;
  S: Hex;
  c: Hex;
  s: Hex;
}
export interface KeyconfBody {
  proto: string;
  type: 'dkg-keyconf';
  j: number;
  c: Hex;
  s: Hex;
}

export interface BallotSel {
  opt: string;
  a: Hex;
  b: Hex;
  c0: Hex;
  s0: Hex;
  c1: Hex;
  s1: Hex;
}
export interface BallotContest {
  id: string;
  sel: BallotSel[];
  ph?: BallotSel[];
  lim?: { c: Hex; s: Hex };
}
export interface BallotBody {
  proto: string;
  type: 'ballot';
  ctx: Hex;
  voter: Hex;
  supersedes: Hex;
  contests: BallotContest[];
}
export interface Reveal {
  xi: Hex;
  selections: Record<string, string[]>;
}
export interface CastEnvelope {
  intent: 'cast';
  body: BallotBody;
  sig: Hex;
}
export interface SpoilEnvelope {
  intent: 'spoil';
  body: BallotBody;
  reveal_digest: Hex;
  reveal?: Reveal;
  sig: Hex;
}
export type VoterEnvelope = CastEnvelope | SpoilEnvelope;

export interface TallyShare {
  j: number;
  M: Hex;
  c: Hex;
  s: Hex;
}
export interface TallyBody {
  proto: string;
  type: 'tally';
  ctx: Hex;
  n_counted: number;
  counted_root: Hex;
  decrypters: number[];
  contests: { id: string; options: { id: string; A: Hex; B: Hex; shares: TallyShare[]; T: number }[] }[];
  spoiled: {
    code: Hex;
    mode: 'reveal' | 'trustees';
    selections: Record<string, string[]>;
    shares?: { contest: string; opt: string; j: number; M: Hex; c: Hex; s: Hex }[];
  }[];
  results: {
    contest: string;
    participation: number;
    quorum_met: boolean;
    outcome: { kind: 'passed' | 'rejected' | 'no-quorum' | 'tie' | 'winners'; winners?: string[]; tied?: string[]; reason?: string };
  }[];
}

export interface LogEntry {
  seq: number;
  /** The record itself: a signed record, a coordinator multi-signed record, or a voter envelope. */
  entry: unknown;
}

export interface ElectionBundle {
  manifest: MultiSignedRecord<Manifest>;
  /** Out-of-band manifest hash (hex32). */
  manifest_hash: Hex;
  /** Voter public keys (hex), sorted ascending bytewise. */
  roll: Hex[];
  log: LogEntry[];
}
