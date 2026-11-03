import { bytesToHex, concatBytes, jcs, lp, pointToBytes, sha256, utf8 } from '@quietvote/crypto';
import {
  PROTO_ID, S, adjudicateDkg, check, manifestHash, signRecord, verifyKeyconf, verifyMultiSig, verifySig,
  type DkgOutcome, type LogEntry, type Manifest, type MarkerSeqs, type MultiSignedRecord, type SignedRecord,
} from '@quietvote/protocol';
import { obj, str, lit, hex as hexS, oneOf, arr, int } from '@quietvote/protocol';
import { markerSeq, mergeEntries, takeDkg } from './ceremonylog.ts';
import { fingerprintOf } from './fingerprint.ts';

const H = bytesToHex;
export const TRANSCRIPT_FORMAT = 'qv-ceremony-transcript/v1';
export const CLIENT_ID = 'qv-trustee 0.0.0';
export type CeremonyMode = 'online-dkg' | 'airgap-dkg' | 'airgap-dealer';

export interface TranscriptCore {
  format: typeof TRANSCRIPT_FORMAT;
  election_id: string;
  origin: string;
  ceremony_id: string;
  mode: CeremonyMode;
  manifest_hash: string;
  n: number;
  t: number;
  qualified: number[];
  disqualified: { id: number; reason: string }[];
  joint_key: string;
  ctx: string;
  qmask: number;
  joint_key_fingerprint_words: string[];
  joint_key_fingerprint_hex: string;
  final_marker_present: boolean;
  log_hash: string;
  software: { client: string };
}
export interface SignatureBody {
  proto: string;
  type: 'ceremony-transcript';
  summary_hash: string;
  role: 'trustee' | 'scribe' | 'witness';
  signer: string;
  self_reported?: { network: 'online' | 'offline'; storage: 'passphrase'; backup_made: boolean };
  sas?: { compared_with: number[]; result: 'match' };
  events?: { t: string; note: string }[];
}
export interface Transcript extends TranscriptCore {
  summary_hash: string;
  manifest: MultiSignedRecord<Manifest>;
  log: LogEntry[];
  signatures: SignedRecord<SignatureBody>[];
}

const sigBodySchema = obj(
  { proto: lit(PROTO_ID), type: lit('ceremony-transcript'), summary_hash: hexS(32), role: oneOf('trustee', 'scribe', 'witness'), signer: str(64) },
  {
    self_reported: obj({ network: oneOf('online', 'offline'), storage: lit('passphrase'), backup_made: { t: 'bool' } }),
    sas: obj({ compared_with: arr(int(1, 32), 1, 32), result: lit('match') }),
    events: arr(obj({ t: str(40), note: str(500) }), 0, 100),
  },
);
const signedSigSchema = S.signed(sigBodySchema);

export const summaryHash = (core: TranscriptCore): string => H(sha256(concatBytes(lp(utf8('QV-CEREMONY-v1')), jcs(core))));

export type CoreResult = { ok: true; core: TranscriptCore; hash: string; outcome: DkgOutcome } | { ok: false; error: string };

/** Pure function of (manifest, public DKG log, mode, ceremony id): every honest trustee computes the same core. */
export async function buildCore(mrec: MultiSignedRecord<Manifest>, log: readonly LogEntry[], ceremonyId: string, mode: CeremonyMode): Promise<CoreResult> {
  const m = mrec.body;
  const mhb = manifestHash(m);
  const names = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close'] as const;
  const mk: Partial<MarkerSeqs> = {};
  for (const nm of names) {
    const s = markerSeq(log, nm);
    if (s === undefined) return { ok: false, error: `missing marker ${nm}` };
    mk[nm] = s;
  }
  const fin = markerSeq(log, 'dkg-final');
  const maxSeq = log.reduce((a, e) => Math.max(a, e.seq), 0);
  mk['dkg-final'] = fin ?? maxSeq + 2 ** 30;
  const rec = takeDkg(log);
  const adj = await adjudicateDkg({ mh: mhb, n: m.n, t: m.t, markers: mk as MarkerSeqs, commits: rec.commits, dealings: rec.dealings, shares: rec.shares, complaints: rec.complaints });
  if (!adj.ok) return { ok: false, error: `${adj.error}: ${adj.detail ?? ''}` };
  const o = adj.value;
  const fp = fingerprintOf(o.K, o.ctx, mhb);
  const disq: { id: number; reason: string }[] = [];
  for (let i = 1; i <= m.n; i++) {
    if (o.Q.includes(i)) continue;
    const ev = o.events.find((e) => e.who === i);
    disq.push({ id: i, reason: ev === undefined ? 'not_qualified' : `${ev.code}: ${ev.detail}` });
  }
  const entries = [...log].sort((a, b) => a.seq - b.seq);
  const core: TranscriptCore = {
    format: TRANSCRIPT_FORMAT,
    election_id: m.election_id,
    origin: `quietvote/v1/${m.bb.log_id}`,
    ceremony_id: ceremonyId,
    mode,
    manifest_hash: H(mhb),
    n: m.n,
    t: m.t,
    qualified: o.Q,
    disqualified: disq,
    joint_key: H(pointToBytes(o.K)),
    ctx: H(o.ctx),
    qmask: o.qmask,
    joint_key_fingerprint_words: fp.words,
    joint_key_fingerprint_hex: fp.hex,
    final_marker_present: fin !== undefined,
    log_hash: H(sha256(jcs(entries))),
    software: { client: CLIENT_ID },
  };
  return { ok: true, core, hash: summaryHash(core), outcome: o };
}

/** Log entries that belong in a ceremony transcript (no election-phase markers, no voter data). */
export function ceremonyEntries(log: readonly LogEntry[]): LogEntry[] {
  return log.filter((e) => {
    const b = (e.entry as { body?: { type?: string; name?: string } }).body;
    if (b === undefined) return false;
    if (b.type === 'marker') return typeof b.name === 'string' && b.name.startsWith('dkg-');
    return typeof b.type === 'string' && b.type.startsWith('dkg-');
  });
}

export async function makeTranscript(mrec: MultiSignedRecord<Manifest>, log: readonly LogEntry[], ceremonyId: string, mode: CeremonyMode): Promise<{ ok: true; transcript: Transcript } | { ok: false; error: string }> {
  const entries = ceremonyEntries(log);
  const r = await buildCore(mrec, entries, ceremonyId, mode);
  if (!r.ok) return r;
  return { ok: true, transcript: { ...r.core, summary_hash: r.hash, manifest: mrec, log: entries, signatures: [] } };
}

export function signTranscript(t: Transcript, sk: Uint8Array, pk: Uint8Array, scope: Uint8Array, body: Omit<SignatureBody, 'proto' | 'type' | 'summary_hash'>): Transcript {
  const full: SignatureBody = { proto: PROTO_ID, type: 'ceremony-transcript', summary_hash: t.summary_hash, ...body };
  const rec = signRecord(sk, pk, scope, full);
  const others = t.signatures.filter((s) => s.body.signer !== body.signer);
  return { ...t, signatures: [...others, rec] };
}

export interface TranscriptReport {
  ok: boolean;
  problems: string[];
  qualified: number[];
  trusteesSigned: number[];
  trusteesMissing: number[];
  keyconfirmed: number[];
  otherSigners: string[];
  fingerprint_words: string[];
  complete: boolean;
}

/** QV-17-REQ-060 `verify-transcript`: everything is re-derived from the embedded manifest + log. */
export async function verifyTranscript(input: unknown, opts: { witnessKeys?: Record<string, string> } = {}): Promise<TranscriptReport> {
  const rep: TranscriptReport = { ok: false, problems: [], qualified: [], trusteesSigned: [], trusteesMissing: [], keyconfirmed: [], otherSigners: [], fingerprint_words: [], complete: false };
  const bad = (s: string): TranscriptReport => {
    rep.problems.push(s);
    return rep;
  };
  const t = input as Transcript | null;
  if (typeof t !== 'object' || t === null || t.format !== TRANSCRIPT_FORMAT || !Array.isArray(t.log) || !Array.isArray(t.signatures) || typeof t.manifest !== 'object' || t.manifest === null) return bad('not a ceremony transcript');
  const mrec = t.manifest;
  const m = mrec.body;
  const mhb = manifestHash(m);
  if (H(mhb) !== t.manifest_hash) return bad('manifest hash mismatch');
  if (!Array.isArray(mrec.sigs) || !verifyMultiSig(mhb, mrec, m.coordinator.keys, m.coordinator.m)) return bad('manifest lacks m valid coordinator signatures');
  // every log entry must validate; invalid entries make the transcript invalid (it is a curated artifact)
  const probe: LogEntry[] = [];
  const mr = mergeEntries(m, mhb, undefined, probe, t.log);
  if (mr.rejected.length > 0 || mr.ignored > 0 || mr.deferred > 0) return bad(`log contains invalid or out-of-scope entries: ${mr.rejected.map((r) => `${r.seq}:${r.why}`).join('; ') || 'ignored/deferred entries'}`);
  const r = await buildCore(mrec, probe, t.ceremony_id, t.mode);
  if (!r.ok) return bad(`DKG re-derivation failed: ${r.error}`);
  const { summary_hash: sh, manifest: _m, log: _l, signatures: _s, ...claimed } = t;
  void _m; void _l; void _s;
  if (H(jcs(claimed)) !== H(jcs(r.core))) rep.problems.push('summary does not match the value re-derived from the log');
  if (sh !== r.hash || sh !== summaryHash(claimed as TranscriptCore)) rep.problems.push('summary_hash mismatch');
  rep.qualified = r.core.qualified;
  rep.fingerprint_words = r.core.joint_key_fingerprint_words;
  const rec = takeDkg(probe);
  const mkFinal = markerSeq(probe, 'dkg-final');
  const mk3 = markerSeq(probe, 'dkg-r3-close')!;
  const seen = new Set<number>();
  for (const k of rec.keyconfs) {
    if (!(k.seq > mk3 && (mkFinal === undefined || k.seq < mkFinal))) continue;
    const Yj = r.outcome.Y.get(k.body.j);
    if (Yj !== undefined && !seen.has(k.body.j) && verifyKeyconf(r.outcome.ctx, Yj, k.body)) {
      seen.add(k.body.j);
      rep.keyconfirmed.push(k.body.j);
    }
  }
  const signed = new Set<number>();
  const others = new Set<string>();
  for (const s of t.signatures) {
    const e = check(signedSigSchema, s);
    if (e !== null) {
      rep.problems.push(`signature schema: ${e}`);
      continue;
    }
    if (s.body.summary_hash !== t.summary_hash) {
      rep.problems.push(`signature by ${s.body.signer} covers a different summary`);
      continue;
    }
    if (s.body.role === 'trustee') {
      const idx = /^T(\d+)$/.exec(s.body.signer);
      const i = idx === null ? 0 : Number(idx[1]);
      if (!verifySig(mhb, 'ceremony-transcript', s.body, s.sig, m.trustees[i - 1]?.sign_pk)) rep.problems.push(`bad signature by ${s.body.signer}`);
      else signed.add(i);
    } else {
      const key = opts.witnessKeys?.[s.body.signer];
      if (key === undefined) rep.problems.push(`no known key for ${s.body.role} ${s.body.signer}`);
      else if (!verifySig(mhb, 'ceremony-transcript', s.body, s.sig, key)) rep.problems.push(`bad signature by ${s.body.signer}`);
      else others.add(s.body.signer);
    }
  }
  rep.trusteesSigned = [...signed].sort((a, b) => a - b);
  rep.trusteesMissing = r.core.qualified.filter((i) => !signed.has(i));
  rep.otherSigners = [...others].sort();
  rep.complete = rep.trusteesMissing.length === 0 && rep.keyconfirmed.length === r.core.qualified.length;
  rep.ok = rep.problems.length === 0 && rep.trusteesSigned.length > 0;
  return rep;
}
