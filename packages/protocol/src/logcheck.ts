// QV-16 Appendix C step 11 (C3), QV-05 V4/V7 and receipts (QV-05 §4.3, QV-18 §7-§9, §13) for the protocol verifier.
// No cryptography of its own: Merkle/checkpoint/cosignature/receipt primitives are @quietvote/board's, signatures are
// strict Ed25519 from @quietvote/crypto. Every function is total (never throws on hostile input) and offline.
// Spec readings taken here are NOTES.md errata X-21..X-30.
import { bytesToHex, hexToBytes, isHex, jcs, sha256, utf8 } from '@quietvote/crypto';
import {
  MerkleTree, authorKeyId, bundleFromJson, bytesEqual, checkEntry, decodeHeader, hashLeaf, nonceKey, parseCheckpoint,
  receiptFromJson, unb64, verifyConsistency, verifyLogSignature, verifyReceipt, witnessStatus,
  type Checkpoint, type EntryHeader, type EntryType, type LogBundle, type PolicyWitness, type WitnessPolicy,
} from '@quietvote/board';
import type { Finding, FindingClass } from './ballotlog.ts';
import { validTs } from './manifest.ts';
import { err, ok, type ErrorCode, type Hex, type Manifest, type Result } from './types.ts';

const H = bytesToHex;

// ---------------------------------------------------------------- bindings (X-21, X-22)

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** RFC 4648 base32, lower case, unpadded (16 bytes -> 26 chars); same as the server's origin derivation. */
function base32(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32.charAt((acc >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += B32.charAt((acc << (5 - bits)) & 31);
  return out;
}

/** X-21: log origin of an election = `quietvote/v1/` + base32(election_id bytes). */
export function logOrigin(m: Manifest): string {
  return `quietvote/v1/${base32(hexToBytes(m.election_id, 16))}`;
}

/** X-21: `bb.log_id` = hex(SHA-256(origin)) (the tlog-witness monitoring path component). */
export function expectedLogId(origin: string): Hex {
  return H(sha256(utf8(origin)));
}

/** X-23: trusted witness keys = manifest `bb.witnesses` (pinned by the manifest hash), else caller anchors. Never the bundle's copy. */
export function witnessAnchors(m: Manifest, caller?: readonly WitnessAnchor[]): { anchors: PolicyWitness[]; source: 'manifest' | 'caller' | 'none' } {
  const conv = (ws: readonly WitnessAnchor[]): PolicyWitness[] | undefined => {
    const out: PolicyWitness[] = [];
    const names = new Set<string>();
    for (const w of ws) {
      if (typeof w?.name !== 'string' || !isHex(w.pk, 32) || names.has(w.name) || w.name.length === 0 || /[\s+]/.test(w.name)) return undefined;
      names.add(w.name);
      out.push({ name: w.name, alg: 'ed25519', publicKey: hexToBytes(w.pk, 32) });
    }
    return out;
  };
  if (m.bb.witnesses !== undefined) return { anchors: conv(m.bb.witnesses) ?? [], source: 'manifest' };
  if (caller !== undefined && caller.length > 0) {
    const c = conv(caller);
    return c === undefined ? { anchors: [], source: 'none' } : { anchors: c, source: 'caller' };
  }
  return { anchors: [], source: 'none' };
}

export interface WitnessAnchor {
  name: string;
  /** Ed25519 public key (hex). */
  pk: Hex;
}

/** A voter-held receipt submitted to the verifier (QV-34 `chk.receipts.sample`). */
export interface ReceiptClaim {
  /** Board receipt, JSON form (`board.receiptToJson`). */
  receipt: unknown;
  /** The voter key the receipt holder says submitted the entry (hex). */
  voter: Hex;
  /** Optional ballot code the voter recorded at cast time (hex). */
  code?: Hex;
}

/** Log-layer evidence handed to `verifyElection` (second argument). */
export interface LogEvidence {
  /** The QV-18 log export, JSON form of `board.LogBundle` (`board.bundleToJson`). Entry bodies are JCS bytes of the protocol records. */
  board: unknown;
  /** Witness trust anchors, used only when the manifest lists none (X-23). */
  witnesses?: WitnessAnchor[];
  /** Checkpoint notes seen elsewhere: the verifier's own pin, gossip peers, witness monitoring endpoints (QV-18 §9.5). */
  observed?: string[];
  /** Voter receipts to check against the log. */
  receipts?: ReceiptClaim[];
  /** Author keys (hex) accepted for entries whose body is not a QV-16 record (X-22). */
  extraAuthorKeys?: Hex[];
}

const kidOf = (pk: Uint8Array): string => H(authorKeyId('ed25519', pk));
const hex32 = (x: unknown): x is string => isHex(x, 32);

interface Binding {
  /** Allowed header types; undefined = any (unrecognised body, X-22). */
  types?: readonly EntryType[];
  /** Header author KeyId (hex) -> public key, restricted to the keys authorised for this record. */
  keys: Map<string, Uint8Array>;
  /** For voter envelopes: the voter key (hex). */
  voter?: string;
}

const MARKER_TYPE: Record<string, EntryType> = {
  'dkg-open': 'ceremony_start', 'dkg-final': 'joint_key', 'election-open': 'election_open', 'election-close': 'election_close',
  'dkg-r1-open': 'notice', 'dkg-r1-close': 'notice', 'dkg-r2-close': 'notice', 'dkg-r3-close': 'notice',
};
const DKG_TYPE: Record<string, [EntryType, string]> = {
  'dkg-commit': ['dkg_round1', 'i'], 'dkg-dealing': ['dkg_round1', 'i'], 'dkg-shares': ['dkg_round2', 'i'],
  'dkg-complaint': ['dkg_complaint', 'accuser'], 'dkg-keyconf': ['key_confirm', 'j'],
};

class Keys {
  readonly coord = new Map<string, Uint8Array>();
  readonly trustee = new Map<number, [string, Uint8Array]>();
  readonly roll: ReadonlySet<string>;
  readonly extra = new Map<string, Uint8Array>();
  constructor(m: Manifest, roll: readonly string[], extra: readonly unknown[]) {
    for (const k of m.coordinator.keys) this.coord.set(kidOf(hexToBytes(k)), hexToBytes(k));
    for (const t of m.trustees) this.trustee.set(t.index, [kidOf(hexToBytes(t.sign_pk)), hexToBytes(t.sign_pk)]);
    this.roll = new Set(roll);
    for (const k of extra) if (hex32(k)) this.extra.set(kidOf(hexToBytes(k)), hexToBytes(k));
  }
  one(pkHex: string): Map<string, Uint8Array> {
    const pk = hexToBytes(pkHex);
    return new Map([[kidOf(pk), pk]]);
  }
  /** X-22: map a protocol record to its QV-18 entry type(s) and authorised author key(s). */
  bind(rec: unknown, isManifest: boolean): Binding {
    const o = (typeof rec === 'object' && rec !== null ? rec : {}) as Record<string, unknown>;
    if (isManifest) return { types: ['manifest'], keys: this.coord };
    const body = (typeof o['body'] === 'object' && o['body'] !== null ? o['body'] : {}) as Record<string, unknown>;
    if ('intent' in o) {
      const voter = body['voter'];
      const types: EntryType[] | undefined = o['intent'] === 'cast' ? ['ballot'] : o['intent'] === 'spoil' ? ['ballot_audit'] : undefined;
      // QV-18 §5.3 step 4: a ballot author must be on the committed roll.
      if (types === undefined || !hex32(voter) || !this.roll.has(voter)) return { types: [], keys: new Map() };
      return { types, keys: this.one(voter), voter };
    }
    const type = body['type'];
    if (type === 'marker') {
      const t = MARKER_TYPE[String(body['name'])];
      return t === undefined ? { types: [], keys: new Map() } : { types: [t], keys: this.coord };
    }
    if (type === 'roll-commit') return { types: ['roll_commit'], keys: this.coord };
    const dkg = typeof type === 'string' ? DKG_TYPE[type] : undefined;
    if (dkg !== undefined) {
      const idx = body[dkg[1]];
      const tk = typeof idx === 'number' ? this.trustee.get(idx) : undefined;
      return { types: [dkg[0]], keys: tk === undefined ? new Map() : new Map([tk]) };
    }
    if (type === 'tally') {
      // QV-18 §5.2: tally_result may be posted by anyone; the header author must be the key that signed the record.
      const sig = o['sig'] as { key?: unknown } | undefined;
      return { types: ['tally_result'], keys: hex32(sig?.key) ? this.one(sig.key) : new Map() };
    }
    const keys = new Map([...this.coord, ...[...this.trustee.values()], ...this.extra]);
    return { keys };
  }
}

// ---------------------------------------------------------------- structure (C3: entries, tree, tree heads, observed views)

export interface LogStructure {
  ok: boolean;
  findings: Finding[];
  warnings: string[];
  origin: string;
  logPk: Uint8Array;
  tree: MerkleTree;
  /** Valid, prefix-consistent checkpoints of the bundle, sorted by size ascending (one per size). */
  checkpoints: Checkpoint[];
  headers: (EntryHeader | undefined)[];
  bindings: (Binding | undefined)[];
  records: Map<number, unknown>;
}

const fnd = (code: ErrorCode, detail: string, seq?: number, cls: FindingClass = 'F'): Finding =>
  seq === undefined ? { code, cls, detail } : { code, cls, seq, detail };

/**
 * Checks a log export against the (already verified, hash-pinned) manifest: origin/log_id/log key binding, every entry's
 * header (strict parse, origin, author authorisation and strict Ed25519 signature, body digest) and its byte-exact
 * correspondence with the protocol record at the same sequence number, the Merkle tree, every tree head (log signature,
 * prefix root), forks, and externally observed tree heads (rollback / split view).
 */
export function verifyLogStructure(
  m: Manifest,
  manifestRecord: unknown,
  roll: readonly string[],
  log: readonly { seq: number; entry: unknown }[],
  ev: LogEvidence,
): LogStructure {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const F = (code: ErrorCode, d: string, seq?: number, cls: FindingClass = 'F'): void => void findings.push(fnd(code, d, seq, cls));
  const origin = logOrigin(m);
  const logPk = hexToBytes(m.bb.log_pk, 32);
  const tree = new MerkleTree();
  const out: LogStructure = {
    ok: false, findings, warnings, origin, logPk, tree, checkpoints: [], headers: [], bindings: [], records: new Map(),
  };
  const done = (): LogStructure => {
    out.ok = !findings.some((f) => f.cls === 'F');
    return out;
  };

  if (m.bb.log_id !== expectedLogId(origin)) F('E_LOG_BINDING', 'manifest bb.log_id is not SHA-256 of the election log origin');
  const parsed = bundleFromJson(ev.board);
  if (!parsed.ok) {
    F('E_LOG_FORMAT', `log export invalid: ${parsed.error.message}`);
    return done();
  }
  const b: LogBundle = parsed.value;
  if (b.origin !== origin) {
    F('E_LOG_BINDING', `log origin ${b.origin} is not ${origin}`);
    return done();
  }
  // The bundle's own copy of the log key is self-attested; a different value means a different log.
  if (!bytesEqual(b.policy.logPublicKey, logPk)) F('E_LOG_BINDING', 'log export names a log key other than manifest bb.log_pk');

  const keys = new Keys(m, roll, ev.extraAuthorKeys ?? []);
  const bySeq = new Map<number, unknown>();
  for (const e of log) bySeq.set(e.seq, e.entry);
  out.records = bySeq;
  const n = b.entries.length;
  for (const s of bySeq.keys()) if (s < 1 || s >= n) F('E_LOG_BINDING', 'protocol log entry has no counterpart in the log', s);
  const redacted = new Set(b.redactions.map((r) => r.seq));
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const e = b.entries[i]!;
    tree.appendLeaf(e.headerBytes);
    out.headers.push(undefined);
    out.bindings.push(undefined);
    if (e.seq !== i) {
      F('E_LOG_ORDER', `log export sequence not gapless (expected ${i}, got ${e.seq})`, i);
      continue;
    }
    const rec = i === 0 ? manifestRecord : bySeq.get(i);
    if (i > 0 && !bySeq.has(i)) {
      F('E_LOG_BINDING', 'log entry missing from the protocol log (hidden or dropped from the verified view)', i);
      continue;
    }
    let canon: Uint8Array;
    try {
      canon = jcs(rec);
    } catch {
      F('E_LOG_BINDING', 'protocol record is not canonicalisable', i);
      continue;
    }
    const bind = keys.bind(rec, i === 0);
    out.bindings[i] = bind;
    const c = checkEntry(e.headerBytes, canon, origin, (h) => bind.keys.get(H(h.author)), i);
    if (!c.ok) {
      const code: ErrorCode = c.error.code === 'QV_BOARD_BODY_DIGEST' || c.error.code === 'QV_BOARD_AUTHOR_UNRESOLVED' ? 'E_LOG_BINDING' : 'E_LOG_FORMAT';
      F(code, `entry header: ${c.error.code}: ${c.error.message}`, i);
      continue;
    }
    const h = c.value;
    if (e.body === null) {
      if (!redacted.has(i)) F('E_LOG_BINDING', 'entry body missing without a recorded redaction', i);
    } else if (!bytesEqual(e.body, canon)) F('E_LOG_BINDING', 'entry body bytes differ from the canonical protocol record', i);
    if (bind.types !== undefined && !bind.types.includes(h.type)) F('E_LOG_BINDING', `entry type ${h.type} does not match its record`, i);
    const nk = nonceKey(H(h.author), h.type, H(h.authorNonce));
    if (seen.has(nk)) F('E_LOG_BINDING', 'duplicate (author, type, nonce)', i);
    seen.add(nk);
    out.headers[i] = h;
  }
  if (n === 0) F('E_LOG_FORMAT', 'log export is empty');
  if (b.treeSize !== n || (n > 0 && !bytesEqual(b.root, tree.root()))) F('E_LOG_FORMAT', 'log export tree_size/root differ from its entries');

  // Tree heads in the export.
  const bySize = new Map<number, Checkpoint>();
  for (const note of b.checkpoints) {
    const cp = signedNote(note, origin, logPk);
    if (typeof cp === 'string') {
      F('E_LOG_CHECKPOINT', `tree head rejected: ${cp}`);
      continue;
    }
    const prev = bySize.get(cp.size);
    if (prev !== undefined && !bytesEqual(prev.root, cp.root)) {
      F('E_LOG_FORK', `two log-signed roots for size ${cp.size}`);
      continue;
    }
    const v = againstTree(cp, tree);
    if (v !== undefined) {
      F(v[0], `tree head: ${v[1]}`);
      continue;
    }
    if (prev !== undefined) {
      // same root, merge cosignature lines (deduplicated by witnessStatus per name)
      bySize.set(cp.size, { ...prev, lines: [...prev.lines, ...cp.lines] });
    } else bySize.set(cp.size, cp);
  }
  if (n > 0 && !bySize.has(n)) F('E_LOG_CHECKPOINT', `no log-signed tree head covers the whole log (size ${n})`);
  out.checkpoints = [...bySize.values()].sort((x, y) => x.size - y.size);

  // Views obtained elsewhere (QV-18 §9.5). Only log-signed notes are evidence (X-26).
  for (const note of ev.observed ?? []) {
    const cp = typeof note === 'string' ? signedNote(note, origin, logPk) : 'not a string';
    if (typeof cp === 'string') {
      warnings.push(`observed tree head ignored (not evidence): ${cp}`);
      continue;
    }
    const v = againstTree(cp, tree);
    if (v !== undefined) F(v[0], `observed tree head: ${v[1]}`);
  }
  return done();
}

/** Parses a note and requires origin + log signature. Returns the reason string on failure. */
function signedNote(note: string, origin: string, logPk: Uint8Array): Checkpoint | string {
  const p = parseCheckpoint(note);
  if (!p.ok) return p.error.message;
  if (p.value.origin !== origin) return 'origin mismatch';
  if (!verifyLogSignature(p.value, logPk)) return 'log signature invalid';
  return p.value;
}

/** A log-signed head must be a prefix of the verified tree: larger = tail dropped / rollback, different root = fork. */
function againstTree(cp: Checkpoint, tree: MerkleTree): [ErrorCode, string] | undefined {
  if (cp.size > tree.size) return ['E_LOG_ROLLBACK', `ROLLBACK_DETECTED: log-signed size ${cp.size} > log size ${tree.size} (tail dropped)`];
  if (!bytesEqual(tree.root(cp.size), cp.root)) return ['E_LOG_FORK', `EQUIVOCATION: log-signed root at size ${cp.size} is not a prefix of this log`];
  return undefined;
}

// ---------------------------------------------------------------- witnesses, gating, witnessed times (X-23..X-25)

export interface PhaseSeqs {
  /** Last setup commitment that election-open binds: max(seq(dkg-final), seq(roll-commit)). */
  setupEnd: number;
  open: number;
  close: number;
  tally?: number;
}

export interface WitnessOutcome {
  status: 'pass' | 'fail' | 'not_run';
  findings: Finding[];
  caveats: string[];
  /** True iff the open/close times were checked against quorum-witnessed tree heads and passed. */
  timesWitnessed: boolean;
  /** True iff some time check failed. */
  windowFailed: boolean;
}

export function verifyWitnessing(m: Manifest, ls: LogStructure, ev: LogEvidence, seqs: PhaseSeqs | undefined): WitnessOutcome {
  const findings: Finding[] = [];
  const caveats: string[] = [];
  const res: WitnessOutcome = { status: 'not_run', findings, caveats, timesWitnessed: false, windowFailed: false };
  const F = (code: ErrorCode, d: string, seq?: number, cls: FindingClass = 'F'): void => void findings.push(fnd(code, d, seq, cls));
  const k = m.bb.witness_quorum;
  if (k === 0) {
    caveats.push('NOT WITNESSED: manifest witness_quorum = 0 (QV-18 REQ-023); tree heads and election times are operator-attested only');
    return res;
  }
  const { anchors, source } = witnessAnchors(m, ev.witnesses);
  if (source === 'caller') caveats.push('witness keys supplied by the verifier caller (manifest lists none)');
  if (m.bb.witnesses !== undefined && ev.witnesses !== undefined && ev.witnesses.length > 0) caveats.push('caller witness keys ignored: the manifest lists its witnesses');
  if (anchors.length < k) {
    F('E_LOG_WITNESS', `witness_quorum ${k} cannot be met: ${anchors.length} trusted witness key(s)`);
    res.status = 'fail';
    return res;
  }
  // Per-witness monotone timestamps over increasing tree sizes (QV-18 §9.6 witness_conflict). A witness that violates it
  // is excluded from counting (ALARM: a single witness must not be able to force a FAIL, nor to help reach quorum).
  const excluded = new Set<string>();
  const policyAll: WitnessPolicy = { witnesses: anchors, quorum: k, noneAcknowledged: false };
  const lastTs = new Map<string, number>();
  for (const cp of ls.checkpoints) {
    for (const [w, ts] of witnessStatus(cp, policyAll).valid) {
      if ((lastTs.get(w) ?? -1) > ts && !excluded.has(w)) {
        excluded.add(w);
        F('E_LOG_WITNESS', `witness ${w}: cosignature timestamps not monotone in tree size; witness excluded`, undefined, 'ALARM');
      }
      lastTs.set(w, Math.max(ts, lastTs.get(w) ?? -1));
    }
  }
  const policy: WitnessPolicy = { witnesses: anchors.filter((w) => !excluded.has(w.name)), quorum: k, noneAcknowledged: false };
  const status = new Map(ls.checkpoints.map((cp) => [cp.size, witnessStatus(cp, policy)]));
  const witnessed = (cp: Checkpoint): boolean => status.get(cp.size)?.witnessed === true;
  const latest = ls.checkpoints.at(-1);
  if (latest === undefined || latest.size !== ls.tree.size || !witnessed(latest)) caveats.push('NOT WITNESSED: the latest tree head lacks witness quorum');
  if (seqs === undefined) return res; // phases unknown (earlier failure): gating not evaluated
  let failed = false;
  const inRange = (lo: number, hi: number): Checkpoint | undefined => ls.checkpoints.find((c) => c.size >= lo && c.size <= hi && witnessed(c));
  // QV-18 §9.4: election-open only after a quorum-witnessed head covering every setup commitment it binds, and not the open itself.
  if (inRange(seqs.setupEnd + 1, seqs.open) === undefined) {
    failed = true;
    F('E_LOG_WITNESS', `no quorum-witnessed tree head of size in [${seqs.setupEnd + 1}, ${seqs.open}] before election-open`, seqs.open);
  }
  // QV-18 §9.4: the final ballot set (size >= seq(close)) witnessed before the tally record.
  if (seqs.tally !== undefined) {
    if (inRange(seqs.close, seqs.tally) === undefined) {
      failed = true;
      F('E_LOG_WITNESS', `no quorum-witnessed tree head of size in [${seqs.close}, ${seqs.tally}] between close and tally`, seqs.tally);
    }
    if (inRange(seqs.tally + 1, Number.MAX_SAFE_INTEGER) === undefined) caveats.push('NOT WITNESSED: tally record');
  } else if (inRange(seqs.close, Number.MAX_SAFE_INTEGER) === undefined) caveats.push('NOT WITNESSED: final ballot set (no tally yet)');

  // QV-16 §5.14.3 witnessed times: earliest quorum-witnessed head covering the marker; >= k of its cosignature
  // timestamps must satisfy the bound (X-25).
  const openMs = validTs(m.voting_open);
  const closeMs = validTs(m.voting_close);
  const skew = m.clock_skew_s;
  const covering = (seq: number): Checkpoint | undefined => inRange(seq + 1, Number.MAX_SAFE_INTEGER);
  const agree = (cp: Checkpoint, okTs: (ts: number) => boolean): boolean =>
    [...(status.get(cp.size)?.valid.values() ?? [])].filter(okTs).length >= k;
  let timesOk = openMs !== null && closeMs !== null;
  const o = covering(seqs.open);
  if (o === undefined || openMs === null) {
    timesOk = false;
    if (seqs.tally !== undefined) {
      failed = true;
      res.windowFailed = true;
      F('E_TIME_WINDOW', 'no quorum-witnessed tree head covers election-open', seqs.open);
    }
  } else if (!agree(o, (ts) => ts >= openMs / 1000 - skew)) {
    timesOk = false;
    res.windowFailed = true;
    failed = true;
    F('E_TIME_WINDOW', 'election-open witnessed before voting_open - clock_skew_s', seqs.open);
  }
  const c = covering(seqs.close);
  if (c === undefined || closeMs === null) {
    timesOk = false;
    if (seqs.tally !== undefined) {
      failed = true;
      res.windowFailed = true;
      F('E_TIME_WINDOW', 'no quorum-witnessed tree head covers election-close', seqs.close);
    }
  } else if (!agree(c, (ts) => ts >= closeMs / 1000 - skew && ts <= closeMs / 1000 + skew)) {
    timesOk = false;
    res.windowFailed = true;
    failed = true;
    F('E_TIME_WINDOW', 'election-close not witnessed within voting_close +/- clock_skew_s (early close or late cutoff)', seqs.close);
  }
  res.timesWitnessed = timesOk;
  res.status = failed ? 'fail' : 'pass';
  return res;
}

// ---------------------------------------------------------------- receipts (X-27, X-28)

export interface ReceiptOutcome {
  status: 'pass' | 'fail' | 'not_run';
  findings: Finding[];
}

/**
 * QV-34 `chk.receipts.sample` / QV-05 G-V2. Each claim: the log-key promise and any inclusion proof verify; the promised
 * leaf is the log's leaf at that seq (else broken promise: dropped/replaced entry, e.g. a silently dropped revote);
 * the receipt's own tree head is a prefix of the log (else split view / rollback); the entry is the claimant's own voter
 * envelope (else clash: the server handed the voter a receipt for someone else's ballot).
 * `ballotCodeAt(seq)` returns the ballot code (hex) of the voter envelope at seq, when known.
 */
export function verifyReceiptClaims(
  ls: LogStructure,
  claims: readonly ReceiptClaim[],
  ballotCodeAt: (seq: number) => string | undefined,
): ReceiptOutcome {
  const findings: Finding[] = [];
  if (claims.length === 0) return { status: 'not_run', findings };
  let failed = false;
  const F = (code: ErrorCode, d: string, seq: number | undefined, cls: FindingClass): void => {
    failed = true;
    findings.push(fnd(code, d, seq, cls));
  };
  const holders = new Map<number, string>();
  for (const claim of claims) {
    const r = receiptFromJson(claim?.receipt);
    if (!r.ok || typeof claim.voter !== 'string') {
      // Not evidence of anything: fails the named check, does not flip the verdict (X-27).
      F('E_LOG_RECEIPT', 'receipt malformed', undefined, 'I');
      continue;
    }
    const rc = r.value;
    const v = verifyReceipt(rc, ls.logPk);
    if (!v.ok || rc.origin !== ls.origin) {
      F('E_LOG_RECEIPT', `receipt does not verify under the election log key: ${v.ok ? 'origin mismatch' : v.error.message}`, rc.seq, 'I');
      continue;
    }
    // From here the receipt is a valid log-key promise: anything the log fails to honour is conclusive (F).
    const lh = rc.seq < ls.tree.size ? ls.tree.leafHash(rc.seq) : undefined;
    if (lh === undefined) {
      F('E_LOG_RECEIPT', `broken promise: receipt for seq ${rc.seq} but the log has ${ls.tree.size} entries (tail dropped)`, rc.seq, 'F');
      continue;
    }
    if (!bytesEqual(lh, rc.leafHash)) {
      F('E_LOG_RECEIPT', 'broken promise: the log holds a different entry at the receipt seq (dropped or replaced)', rc.seq, 'F');
      continue;
    }
    if (rc.inclusion !== undefined) {
      const cp = parseCheckpoint(rc.inclusion.checkpointNote);
      const bad = cp.ok ? againstTree(cp.value, ls.tree) : undefined;
      if (bad !== undefined) F(bad[0], `receipt tree head: ${bad[1]}`, rc.seq, 'F');
    }
    // Voter binding (clash, R-01 §11.2 #4). Not provable to third parties (anyone can fetch any receipt): ALARM (X-28).
    const h = ls.headers[rc.seq];
    const bind = ls.bindings[rc.seq];
    const ownKid = hex32(claim.voter) ? kidOf(hexToBytes(claim.voter)) : '';
    if (h === undefined || bind?.voter === undefined || bind.voter !== claim.voter || H(h.author) !== ownKid) {
      F('E_LOG_RECEIPT_CLASH', 'receipt names an entry that is not this voter\'s ballot', rc.seq, 'ALARM');
      continue;
    }
    if (claim.code !== undefined && ballotCodeAt(rc.seq) !== claim.code) {
      F('E_LOG_RECEIPT_CLASH', 'ballot code at the receipt seq differs from the code the voter recorded', rc.seq, 'ALARM');
      continue;
    }
    const prev = holders.get(rc.seq);
    if (prev !== undefined && prev !== claim.voter) {
      F('E_LOG_RECEIPT_CLASH', 'two voters hold receipts for the same entry', rc.seq, 'ALARM');
      continue;
    }
    holders.set(rc.seq, claim.voter);
  }
  return { status: failed ? 'fail' : 'pass', findings };
}

// ---------------------------------------------------------------- voter-side receipt chain (QV-05 §4.3, QV-18 §7)

export interface ReceiptChainInput {
  /** Manifest body the voter verified against the out-of-band hash. */
  manifest: Manifest;
  /** Board receipt JSON; must carry an inclusion proof. */
  receipt: unknown;
  /** The voter's own entry header bytes (LeafBytes), kept by the client at submission. */
  header?: Uint8Array;
  /** Voter key (hex) expected as the entry author. */
  voter?: Hex;
  /** A later (e.g. final) log-signed tree head. */
  latest: string;
  /** RFC 9162 consistency proof (base64 std hashes) from the receipt's tree size to `latest`'s size. */
  consistency: readonly string[];
  /** Witness anchors when the manifest lists none (X-23). */
  witnesses?: WitnessAnchor[];
}

/**
 * Recorded-as-cast check a voter client runs after close: receipt promise + inclusion to a log-signed head, the leaf is
 * the voter's own header, and the later head is an append-only extension of the receipt's head (consistency proof).
 * When `witness_quorum > 0` the later head must carry the quorum (split-view defence). Fail closed on every step.
 */
export function verifyReceiptChain(i: ReceiptChainInput): Result<{ seq: number; size: number; witnessed: boolean }> {
  try {
    const m = i.manifest;
    const origin = logOrigin(m);
    if (m.bb.log_id !== expectedLogId(origin)) return err('E_LOG_BINDING', 'bb.log_id does not bind the log origin');
    const logPk = hexToBytes(m.bb.log_pk, 32);
    const r = receiptFromJson(i.receipt);
    if (!r.ok) return err('E_LOG_RECEIPT', 'receipt malformed');
    const rc = r.value;
    if (rc.origin !== origin) return err('E_LOG_RECEIPT', 'receipt is for another log');
    const v = verifyReceipt(rc, logPk);
    if (!v.ok) return err('E_LOG_RECEIPT', v.error.message);
    if (rc.inclusion === undefined) return err('E_LOG_RECEIPT', 'receipt carries no inclusion proof yet');
    if (i.header !== undefined) {
      if (!bytesEqual(hashLeaf(i.header), rc.leafHash)) return err('E_LOG_RECEIPT_CLASH', 'receipt leaf is not this entry');
      const d = decodeHeader(i.header);
      if (!d.ok || d.value.origin !== origin) return err('E_LOG_RECEIPT_CLASH', 'entry header invalid for this log');
      if (i.voter !== undefined && (!hex32(i.voter) || H(d.value.author) !== kidOf(hexToBytes(i.voter)))) {
        return err('E_LOG_RECEIPT_CLASH', 'entry author is not this voter');
      }
    } else if (i.voter !== undefined) return err('E_LOG_RECEIPT_CLASH', 'voter binding needs the entry header');
    const cp = signedNote(i.latest, origin, logPk);
    if (typeof cp === 'string') return err('E_LOG_CHECKPOINT', `later tree head: ${cp}`);
    const first = parseCheckpoint(rc.inclusion.checkpointNote);
    if (!first.ok) return err('E_LOG_RECEIPT', 'receipt tree head malformed');
    if (cp.size < first.value.size) return err('E_LOG_ROLLBACK', 'ROLLBACK_DETECTED: later tree head is smaller than the receipt head');
    const proof = i.consistency.map((p) => (typeof p === 'string' ? unb64(p) : undefined));
    if (proof.some((p) => p === undefined)) return err('E_LOG_FORK', 'consistency proof malformed');
    if (!verifyConsistency(first.value.size, cp.size, first.value.root, cp.root, proof as Uint8Array[])) {
      return err('E_LOG_FORK', 'EQUIVOCATION_SUSPECTED: later head is not an extension of the receipt head');
    }
    const k = m.bb.witness_quorum;
    let witnessed = false;
    if (k > 0) {
      const { anchors } = witnessAnchors(m, i.witnesses);
      if (anchors.length < k) return err('E_LOG_WITNESS', 'witness quorum cannot be met with trusted keys');
      witnessed = witnessStatus(cp, { witnesses: anchors, quorum: k, noneAcknowledged: false }).witnessed;
      if (!witnessed) return err('E_LOG_WITNESS', 'later tree head lacks witness quorum (split view not excluded)');
    }
    return ok({ seq: rc.seq, size: cp.size, witnessed });
  } catch {
    return err('E_LOG_RECEIPT', 'receipt chain input malformed');
  }
}
