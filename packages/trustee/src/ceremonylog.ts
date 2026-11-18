import { bytesToHex, jcs, pointToBytes } from '@quietvote/crypto';
import {
  PROTO_ID, S, check, checkDealing, dealingCommitHash, verifyMultiSig, verifySig,
  type CommitBody, type ComplaintBody, type DealingBody, type KeyconfBody, type LogEntry, type Manifest, type MarkerBody,
  type MarkerName, type MultiSignedRecord, type ParsedDealing, type SharesBody, type SignedRecord,
} from '@quietvote/protocol';

const H = bytesToHex;
export type DkgType = 'dkg-commit' | 'dkg-dealing' | 'dkg-shares' | 'dkg-complaint' | 'dkg-keyconf';

export interface ImportReport {
  accepted: number;
  duplicate: number;
  /** Election markers need the ctx scope, known only after finalize. */
  deferred: number;
  ignored: number;
  rejected: { seq: number; why: string }[];
}

/** Which trustee index is the author of a DKG record. */
export function authorOf(body: { type?: unknown } & Record<string, unknown>): number | undefined {
  switch (body.type) {
    case 'dkg-commit': case 'dkg-dealing': case 'dkg-shares': return body.i as number;
    case 'dkg-complaint': return body.accuser as number;
    case 'dkg-keyconf': return body.j as number;
    default: return undefined;
  }
}

/**
 * Validates one public entry against the manifest. Returns 'ok' | 'deferred' | 'ignored' | rejection text.
 * Trustee records must be signed (scope = manifest hash) by the manifest key of the trustee they name; markers need
 * m coordinator signatures (scope = manifest hash for dkg-*, ctx for election-*).
 */
export function validateEntry(m: Manifest, mh: Uint8Array, ctx: Uint8Array | undefined, entry: unknown): 'ok' | 'deferred' | 'ignored' | string {
  const o = entry as Record<string, unknown> | null;
  if (typeof o !== 'object' || o === null) return 'entry is not an object';
  if ('intent' in o) return 'ignored';
  const body = o.body as ({ type?: unknown; proto?: unknown } & Record<string, unknown>) | undefined;
  if (typeof body !== 'object' || body === null || typeof body.type !== 'string') return 'unrecognised entry';
  if (body.proto !== PROTO_ID) return 'unknown proto';
  const type = body.type;
  if (type === 'marker') {
    const e = check(S.multiSigned(S.marker), entry);
    if (e !== null) return `marker schema: ${e}`;
    const rec = entry as MultiSignedRecord<MarkerBody>;
    const election = rec.body.name === 'election-open' || rec.body.name === 'election-close';
    if (election && ctx === undefined) return 'deferred';
    return verifyMultiSig(election ? ctx! : mh, rec, m.coordinator.keys, m.coordinator.m) ? 'ok' : 'marker lacks m valid coordinator signatures';
  }
  let sch;
  switch (type) {
    case 'dkg-commit': sch = S.dkgCommit; break;
    case 'dkg-dealing': sch = S.dkgDealing(m.t); break;
    case 'dkg-shares': sch = S.dkgShares; break;
    case 'dkg-complaint': sch = S.dkgComplaint; break;
    case 'dkg-keyconf': sch = S.dkgKeyconf; break;
    default: return 'ignored';
  }
  const e = check(S.signed(sch), entry);
  if (e !== null) return `${type} schema: ${e}`;
  const idx = authorOf(body);
  if (idx === undefined || idx < 1 || idx > m.n) return 'trustee index out of range';
  const rec = entry as SignedRecord<{ type: string }>;
  return verifySig(mh, type, rec.body, rec.sig, m.trustees[idx - 1]?.sign_pk) ? 'ok' : `${type} signature invalid`;
}

/** Merges validated entries into `log` (sorted by seq). A different entry at a known seq is a log fork and throws. */
export function mergeEntries(m: Manifest, mh: Uint8Array, ctx: Uint8Array | undefined, log: LogEntry[], incoming: readonly LogEntry[]): ImportReport {
  const rep: ImportReport = { accepted: 0, duplicate: 0, deferred: 0, ignored: 0, rejected: [] };
  const bySeq = new Map(log.map((e) => [e.seq, e]));
  for (const e of incoming) {
    if (!Number.isSafeInteger(e.seq) || e.seq < 0) {
      rep.rejected.push({ seq: e.seq, why: 'bad seq' });
      continue;
    }
    const v = validateEntry(m, mh, ctx, e.entry);
    if (v === 'ignored') rep.ignored++;
    else if (v === 'deferred') rep.deferred++;
    else if (v !== 'ok') rep.rejected.push({ seq: e.seq, why: v });
    else {
      const prev = bySeq.get(e.seq);
      if (prev === undefined) {
        bySeq.set(e.seq, e);
        rep.accepted++;
      } else if (H(jcs(prev.entry)) === H(jcs(e.entry))) rep.duplicate++;
      else rep.rejected.push({ seq: e.seq, why: 'LOG_FORK: different entry at known seq' });
    }
  }
  log.length = 0;
  log.push(...[...bySeq.values()].sort((a, b) => a.seq - b.seq));
  return rep;
}

export function markerSeq(log: readonly LogEntry[], name: MarkerName): number | undefined {
  for (const e of log) {
    const b = (e.entry as { body?: MarkerBody }).body;
    if (b?.type === 'marker' && b.name === name) return e.seq;
  }
  return undefined;
}
export function markerBody(log: readonly LogEntry[], name: MarkerName): MarkerBody | undefined {
  for (const e of log) {
    const b = (e.entry as { body?: MarkerBody }).body;
    if (b?.type === 'marker' && b.name === name) return b;
  }
  return undefined;
}

export interface DkgRecords {
  commits: { seq: number; body: CommitBody }[];
  dealings: { seq: number; body: DealingBody }[];
  shares: { seq: number; body: SharesBody }[];
  complaints: { seq: number; body: ComplaintBody }[];
  keyconfs: { seq: number; body: KeyconfBody }[];
}
export function takeDkg(log: readonly LogEntry[]): DkgRecords {
  const r: DkgRecords = { commits: [], dealings: [], shares: [], complaints: [], keyconfs: [] };
  for (const { seq, entry } of log) {
    const b = (entry as { body?: { type?: string } }).body;
    if (b === undefined) continue;
    if (b.type === 'dkg-commit') r.commits.push({ seq, body: b as CommitBody });
    else if (b.type === 'dkg-dealing') r.dealings.push({ seq, body: b as DealingBody });
    else if (b.type === 'dkg-shares') r.shares.push({ seq, body: b as SharesBody });
    else if (b.type === 'dkg-complaint') r.complaints.push({ seq, body: b as ComplaintBody });
    else if (b.type === 'dkg-keyconf') r.keyconfs.push({ seq, body: b as KeyconfBody });
  }
  return r;
}

/** Last-writer-loses uniqueness used by the adjudicator: two different timely records from one author remove the author. */
export function uniqueBy<B extends { i: number }>(items: { seq: number; body: B }[], timely: (s: number) => boolean): { map: Map<number, B>; equivocators: Set<number> } {
  const map = new Map<number, B>();
  const eq = new Set<number>();
  for (const it of items) {
    if (!timely(it.seq)) continue;
    const prev = map.get(it.body.i);
    if (prev === undefined) map.set(it.body.i, it.body);
    else if (H(jcs(prev)) !== H(jcs(it.body))) eq.add(it.body.i);
  }
  for (const i of eq) map.delete(i);
  return { map, equivocators: eq };
}

export interface R1Result {
  R1: number[];
  parsed: Map<number, ParsedDealing>;
  out: Map<number, string>;
}

/**
 * Round-1 survivors exactly as `adjudicateDkg` computes them (commit present before r1-open, unique, reveal timely and
 * matching the commit, all PoKs valid, no duplicate A_0). Cross-checked against the adjudicator in the ceremony tests.
 */
export function computeR1(mh: Uint8Array, t: number, n: number, mk: { r1open: number; r1close: number }, rec: DkgRecords): R1Result {
  const out = new Map<number, string>();
  const commits = uniqueBy(rec.commits, (s) => s < mk.r1open);
  const dealings = uniqueBy(rec.dealings, (s) => s > mk.r1open && s < mk.r1close);
  const parsed = new Map<number, ParsedDealing>();
  for (let i = 1; i <= n; i++) {
    const d = dealings.map.get(i);
    const c = commits.map.get(i);
    if (d === undefined || c === undefined) {
      out.set(i, 'missing/late/equivocating commit or dealing');
      continue;
    }
    if (c.h !== H(dealingCommitHash(mh, i, d))) {
      out.set(i, 'reveal does not match commit');
      continue;
    }
    const r = checkDealing(mh, t, d);
    if (!r.ok) {
      out.set(i, r.detail ?? 'dealing invalid');
      continue;
    }
    parsed.set(i, r.value);
  }
  const a0 = new Map<string, number[]>();
  for (const [i, d] of parsed) {
    const k = H(pointToBytes(d.A[0]!));
    a0.set(k, [...(a0.get(k) ?? []), i]);
  }
  for (const group of a0.values()) {
    if (group.length > 1) {
      for (const i of group) {
        parsed.delete(i);
        out.set(i, 'duplicate A_0');
      }
    }
  }
  return { R1: [...parsed.keys()].sort((a, b) => a - b), parsed, out };
}

