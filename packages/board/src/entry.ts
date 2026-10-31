// Entry envelope (QV-18 §5.1). The byte encoding here is board-local and canonical
// (QV-16 `enc` is not yet available); see NOTES.md.
import { ed25519Sign, ed25519Verify, sha256 } from '@quietvote/crypto';
import { Reader, Writer, bytesEqual, concat, utf8 } from './bytes.ts';
import { err, ok, type Result } from './errors.ts';
import { hashLeaf } from './merkle.ts';

export const ENTRY_TYPES = [
  'manifest', 'trustee_accept', 'trustee_decline', 'ceremony_start', 'dkg_round1', 'dkg_round2',
  'dkg_complaint', 'dkg_justification', 'key_confirm', 'joint_key', 'keycheck', 'ceremony_abort',
  'roll_commit', 'election_open', 'ballot', 'ballot_audit', 'notice', 'election_close',
  'tally_aggregate', 'decryption_share', 'tally_result', 'trustee_compromise_report',
  'key_destruction', 'anchor', 'audit_close', 'election_cancel',
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

const TYPE_SET: ReadonlySet<string> = new Set(ENTRY_TYPES);
export function isEntryType(s: string): s is EntryType {
  return TYPE_SET.has(s);
}

export const MAX_HEADER_BYTES = 2048;
export const HARD_BODY_CAP = 1 << 20;
const KiB = 1024;
/** Per-type body caps from §5.2; n-dependent types use the hard cap. */
export const MAX_BODY: Readonly<Record<EntryType, number>> = {
  manifest: 256 * KiB, trustee_accept: 2 * KiB, trustee_decline: KiB, ceremony_start: KiB,
  dkg_round1: 8 * KiB, dkg_round2: HARD_BODY_CAP, dkg_complaint: 4 * KiB, dkg_justification: 4 * KiB,
  key_confirm: KiB, joint_key: HARD_BODY_CAP, keycheck: 4 * KiB, ceremony_abort: KiB,
  roll_commit: 4 * KiB, election_open: KiB, ballot: 256 * KiB, ballot_audit: 256 * KiB,
  notice: 4 * KiB, election_close: KiB, tally_aggregate: 64 * KiB, decryption_share: 16 * KiB,
  tally_result: 16 * KiB, trustee_compromise_report: 2 * KiB, key_destruction: 2 * KiB,
  anchor: 64 * KiB, audit_close: KiB, election_cancel: KiB,
};

export interface EntryHeader {
  v: number;
  origin: string;
  type: EntryType;
  /** KeyId(author_pk): see authorKeyId(). */
  author: Uint8Array;
  authorAlg: string;
  authorNonce: Uint8Array;
  createdAt: number;
  bodyLen: number;
  bodyDigest: Uint8Array;
  refs: number[];
  sig: Uint8Array;
}

const ORIGIN_RE = /^quietvote\/v1\/[a-z2-7]{26}$/;
export function isValidOrigin(o: string): boolean {
  return ORIGIN_RE.test(o);
}

/** Board-local KeyId: SHA-256("QV-KEYID-v1" 0x00 alg 0x00 pk). */
export function authorKeyId(alg: string, publicKey: Uint8Array): Uint8Array {
  return sha256(concat(utf8('QV-KEYID-v1\0'), utf8(alg), new Uint8Array([0]), publicKey));
}

/** body_digest = SHA-256("qv/body/v1" 0x00 body). */
export function bodyDigest(body: Uint8Array): Uint8Array {
  return sha256(concat(utf8('qv/body/v1\0'), body));
}

function encodeUnsigned(h: EntryHeader): Writer {
  const w = new Writer().u16(h.v).str(h.origin).str(h.type).raw(h.author).str(h.authorAlg);
  w.raw(h.authorNonce).u64(h.createdAt).u64(h.bodyLen).raw(h.bodyDigest).u16(h.refs.length);
  for (const r of h.refs) w.u64(r);
  return w;
}

/** enc(EntryHeader) = LeafBytes. */
export function encodeHeader(h: EntryHeader): Uint8Array {
  return encodeUnsigned(h).lp(h.sig).done();
}

const SIG_DOMAIN = utf8('QV-ENTRY-v1\0');
/** Signed message: domain || enc(header without sig). Covers origin and body_digest. */
export function signedBytes(h: EntryHeader): Uint8Array {
  return concat(SIG_DOMAIN, encodeUnsigned(h).done());
}

export function decodeHeader(bytes: Uint8Array): Result<EntryHeader> {
  if (bytes.length > MAX_HEADER_BYTES) return err('QV_BOARD_TOO_LARGE', 'header exceeds 2 KiB');
  try {
    const r = new Reader(bytes);
    const v = r.u16();
    if (v !== 1) return err('QV_BOARD_MALFORMED', `unsupported header version ${v}`);
    const origin = r.str();
    const type = r.str();
    const author = r.raw(32);
    const authorAlg = r.str();
    const authorNonce = r.raw(16);
    const createdAt = r.u64();
    const bodyLen = r.u64();
    const bodyDig = r.raw(32);
    const nrefs = r.u16();
    const refs: number[] = [];
    for (let i = 0; i < nrefs; i++) refs.push(r.u64());
    const sig = r.lp();
    if (!r.atEnd) return err('QV_BOARD_MALFORMED', 'trailing bytes in header');
    if (!isEntryType(type)) return err('QV_BOARD_MALFORMED', 'unknown entry type');
    if (!isValidOrigin(origin)) return err('QV_BOARD_MALFORMED', 'bad origin');
    const h: EntryHeader = { v, origin, type, author, authorAlg, authorNonce, createdAt, bodyLen, bodyDigest: bodyDig, refs, sig };
    if (!bytesEqual(encodeHeader(h), bytes)) return err('QV_BOARD_MALFORMED', 'non-canonical header');
    return ok(h);
  } catch {
    return err('QV_BOARD_MALFORMED', 'header does not parse');
  }
}

export interface BuiltEntry {
  header: EntryHeader;
  headerBytes: Uint8Array;
  body: Uint8Array;
  leafHash: Uint8Array;
}

export interface BuildEntryInput {
  origin: string;
  type: EntryType;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  nonce: Uint8Array;
  createdAt: number;
  body: Uint8Array;
  refs?: number[];
  authorAlg?: string;
}

/** Client-side helper: build and sign an entry (nonce and time supplied by the caller). */
export function buildEntry(i: BuildEntryInput): BuiltEntry {
  const alg = i.authorAlg ?? 'ed25519';
  const unsigned: EntryHeader = {
    v: 1, origin: i.origin, type: i.type, author: authorKeyId(alg, i.publicKey), authorAlg: alg,
    authorNonce: i.nonce, createdAt: i.createdAt, bodyLen: i.body.length, bodyDigest: bodyDigest(i.body),
    refs: i.refs ?? [], sig: new Uint8Array(0),
  };
  const header = { ...unsigned, sig: ed25519Sign(i.secretKey, signedBytes(unsigned)) };
  const headerBytes = encodeHeader(header);
  return { header, headerBytes, body: i.body, leafHash: hashLeaf(headerBytes) };
}

/** Resolves an author's public key from header context; return undefined if unknown. */
export type AuthorKeyResolver = (header: EntryHeader, seq: number) => Uint8Array | undefined;

/** Stateless checks shared by server admission and offline verification (§5.3 steps 1-3). */
export function checkEntry(
  headerBytes: Uint8Array,
  body: Uint8Array | null,
  origin: string,
  resolve: AuthorKeyResolver | undefined,
  seq: number,
): Result<EntryHeader> {
  const d = decodeHeader(headerBytes);
  if (!d.ok) return d;
  const h = d.value;
  if (h.origin !== origin) return err('QV_BOARD_ORIGIN_MISMATCH', 'entry origin differs from log origin');
  if (h.refs.some((r) => r >= seq)) return err('QV_BOARD_GRAMMAR', 'ref must point to an earlier entry');
  if (h.bodyLen > Math.min(MAX_BODY[h.type], HARD_BODY_CAP)) return err('QV_BOARD_TOO_LARGE', 'body_len exceeds type limit');
  if (body !== null) {
    if (body.length !== h.bodyLen) return err('QV_BOARD_BODY_DIGEST', 'body length mismatch');
    if (!bytesEqual(bodyDigest(body), h.bodyDigest)) return err('QV_BOARD_BODY_DIGEST', 'body digest mismatch');
  }
  if (resolve) {
    if (h.authorAlg !== 'ed25519') return err('QV_BOARD_UNSUPPORTED_ALG', 'unsupported author algorithm');
    const pk = resolve(h, seq);
    if (!pk) return err('QV_BOARD_AUTHOR_UNRESOLVED', 'author key not authorized');
    if (!bytesEqual(authorKeyId(h.authorAlg, pk), h.author)) return err('QV_BOARD_AUTHOR_UNRESOLVED', 'resolved key does not match author id');
    if (!ed25519Verify(pk, h.sig, signedBytes(h))) return err('QV_BOARD_BAD_SIGNATURE', 'entry signature invalid');
  }
  return ok(h);
}

// ---- Phase grammar (§5.3 step 5, §5.4). Shared by server and verifier. ----

export interface GrammarState {
  count: number;
  seen: Set<EntryType>;
  opened: boolean;
  closed: boolean;
  terminal: boolean;
  /** Manifest carries `roll.root` (static-roll mode, QV-ADR-015): a `roll_commit` entry is then optional. */
  staticRoll: boolean;
}

/** True iff the (JCS JSON) manifest body declares `roll.root`. Anything unparsable is "no": fail closed to roll_commit required. */
export function manifestDeclaresRoll(body: Uint8Array | null): boolean {
  if (body === null) return false;
  try {
    const m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as { roll?: { root?: unknown } } | null;
    return typeof m?.roll?.root === 'string';
  } catch {
    return false;
  }
}

export function newGrammar(): GrammarState {
  return { count: 0, seen: new Set(), opened: false, closed: false, terminal: false, staticRoll: false };
}

const ONCE: ReadonlySet<EntryType> = new Set<EntryType>([
  'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close', 'audit_close',
]);
const NEEDS: Partial<Record<EntryType, EntryType>> = {
  dkg_round1: 'ceremony_start', dkg_round2: 'ceremony_start', dkg_complaint: 'ceremony_start',
  dkg_justification: 'ceremony_start', key_confirm: 'ceremony_start', joint_key: 'ceremony_start',
  roll_commit: 'joint_key', election_open: 'roll_commit', election_close: 'election_open',
  // QV-18 lists tally_aggregate but QV-16 §5.15/QV-17 have verifiers and trustees recompute the aggregate: the entry is optional.
  tally_aggregate: 'election_close', decryption_share: 'election_close', tally_result: 'election_close',
  audit_close: 'election_close', key_destruction: 'audit_close',
};

/**
 * Types valid only while the election is not yet open (docs/18 §5.2 Phase column "S"). Ceremony types are
 * deliberately not tied to a finer sub-phase than "before election_open" (key_confirm/keycheck follow joint_key).
 */
const SETUP_ONLY: ReadonlySet<EntryType> = new Set<EntryType>([
  'trustee_accept', 'trustee_decline', 'ceremony_start', 'dkg_round1', 'dkg_round2', 'dkg_complaint',
  'dkg_justification', 'key_confirm', 'joint_key', 'keycheck', 'roll_commit',
]);

/** Validates and applies the next entry type. Returns an error string or undefined. */
export function grammarStep(g: GrammarState, type: EntryType, body: Uint8Array | null = null): string | undefined {
  if (g.terminal) return 'log is terminated';
  if (g.count === 0 && type !== 'manifest') return 'first entry must be manifest';
  if (g.count > 0 && type === 'manifest') return 'manifest only allowed at seq 0';
  if (ONCE.has(type) && g.seen.has(type)) return `${type} already present`;
  if (SETUP_ONLY.has(type) && g.opened) return `${type} not allowed after election_open`;
  // §5.4: ceremony_abort only from CEREMONY (ceremony_start seen, no joint_key yet); election_cancel only SETUP/READY/OPEN.
  if (type === 'ceremony_abort' && !(g.seen.has('ceremony_start') && !g.seen.has('joint_key'))) return 'ceremony_abort only during the key ceremony';
  if (type === 'election_cancel' && g.closed) return 'election_cancel not allowed after election_close';
  const need = NEEDS[type];
  const waived = type === 'election_open' && g.staticRoll; // QV-ADR-015: manifest roll.root replaces roll_commit
  if (need && !waived && !g.seen.has(need)) return `${type} requires prior ${need}`;
  if (type === 'tally_aggregate' && g.seen.has('tally_result')) return 'tally_aggregate after tally_result';
  if (type === 'election_open' && !g.seen.has('joint_key')) return 'election_open requires prior joint_key';
  if ((type === 'ballot' || type === 'ballot_audit') && !(g.opened && !g.closed)) return `${type} outside open phase`;
  g.seen.add(type);
  g.count++;
  if (type === 'manifest') g.staticRoll = manifestDeclaresRoll(body);
  if (type === 'election_open') g.opened = true;
  if (type === 'election_close') g.closed = true;
  if (type === 'election_cancel' || type === 'ceremony_abort') g.terminal = true;
  return undefined;
}
