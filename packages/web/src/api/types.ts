// Wire types for the subset of QV-09 the web client uses. Responses may gain members (QV-09 §4.1); unknown members are ignored.
export interface Instance {
  instance_id: string;
  api_versions: string[];
  server_version: string;
  protocol_suites?: string[];
  registration_mode?: 'open' | 'token' | 'closed';
  logging?: { ip: boolean; user_agent: boolean };
  features?: string[];
  limits?: { max_entry_bytes?: number; max_revotes?: number };
}

export interface ElectionSummary {
  election_id: string;
  origin: string;
  /** Log public key, base64url. */
  log_pk: string;
  state: string;
  title?: string;
  access?: 'public' | 'link';
}

export interface ElectionState {
  election_id: string;
  phase: string;
  tree_size: number;
  witnessed: boolean;
  manifest_hash?: string;
  integrity: string;
}

export interface EntryView {
  seq: number;
  type: string;
  author?: string;
  leaf_hash: string;
  header_b64u: string;
  body_b64u: string | null;
  redacted?: boolean;
}
export interface EntryPage {
  entries: EntryView[];
  from: number;
  next_from: number | null;
  tree_size: number;
}

export interface InclusionProofView {
  seq: number;
  leaf_hash: string;
  tree_size: number;
  /** Standard base64 hashes (QV-09 §4.1). */
  path: string[];
  checkpoint_note?: string;
}
export interface ConsistencyProofView {
  old_size: number;
  new_size: number;
  path: string[];
}

export interface ReceiptView {
  origin: string;
  seq: number;
  leaf_hash: string;
  promise: { sequenced_at: number; checkpoint_deadline: number };
  promise_sig: string;
  inclusion?: InclusionProofView;
}
export interface AppendResult {
  status: 'included' | 'sequenced';
  receipt: ReceiptView;
}

export interface RegistrationBody {
  invite_code: string;
  pk: string;
  alg: 'ed25519';
  pop: string;
}
export interface RegistrationResult {
  voter_kid: string;
  status: 'pending' | 'approved';
}

export interface RollPage {
  items: { voter_kid: string; pk: string; alg: string; status: string; roll_index?: number | null }[];
  next_cursor: string | null;
  roll_root?: string;
  roll_size?: number;
}

export interface Challenge {
  challenge_id: string;
  nonce: string;
  audience: string;
  expires_at: string;
}
export interface Session {
  token: string;
  expires_at: string;
  role: string;
  org_id?: string;
}
export interface InviteResult {
  /** `code` is present only on the first (non-replayed) response; replays carry `code_withheld: true`. */
  invites: { invite_id: string; code?: string; code_withheld?: boolean; label?: string }[];
}
export interface VoterStatus {
  registered: boolean;
  status: string;
  ballot_count: number;
  first_seq?: number;
  latest_seq?: number;
}
