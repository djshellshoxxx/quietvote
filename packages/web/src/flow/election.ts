// Deriving the election context (manifest, joint key K, ctx, phase) from the public log, the way a verifier does
// (QV-16 App. C steps 1-6). The client never trusts server-provided K: it re-runs the DKG adjudication itself.
import { bytesToHex, hexToBytes, pointToBytes } from '@quietvote/crypto';
import { b64uDecode } from '../util/hex.ts';
import {
  adjudicateDkg, logOrigin, manifestHash, rollRoot, validateManifest, verifyMultiSig, verifySig,
  type CommitBody, type ComplaintBody, type DealingBody, type ElectionParams, type ErrorCode, type Manifest, type MarkerBody,
  type MarkerSeqs, type MultiSignedRecord, type RollCommitBody, type SharesBody, type SignedRecord, type TallyBody,
} from '@quietvote/protocol';

const H = bytesToHex;

export type Phase = 'ceremony' | 'ready' | 'open' | 'closed' | 'tallied';

export interface ElectionContext {
  params: ElectionParams;
  manifest: Manifest;
  manifestHashHex: string;
  warnings: string[];
  phase: Phase;
  openSeq?: number;
  closeSeq?: number;
  rollSize: number;
  rollRootHex: string | undefined;
  tally?: TallyBody;
  tallySeq?: number;
}

export type ContextResult = { ok: true; value: ElectionContext } | { ok: false; error: ErrorCode | 'E_NO_DKG'; detail: string };

type Rec = { seq: number; record: unknown };

/**
 * @param entries every log entry as {seq, record} (record = parsed body; undefined for redacted/unparseable ones).
 * @param expectManifestHash optional out-of-band manifest hash (hex) the caller already trusts, e.g. from the Election ID check.
 * @param rollSizeHint size of the roll when the manifest does not carry it (taken from the roll-commit record otherwise).
 */
export async function deriveElectionContext(entries: readonly Rec[], expectManifestHash?: string, rollSizeHint?: number, opts: { allowMissingFinal?: boolean } = {}): Promise<ContextResult> {
  const first = entries.find((e) => e.seq === 0);
  const mrec = first?.record as MultiSignedRecord<Manifest> | undefined;
  if (mrec === undefined || typeof mrec !== 'object' || mrec === null || typeof mrec.body !== 'object') return { ok: false, error: 'E_MANIFEST', detail: 'entry 0 is not a manifest' };
  const rcs: { seq: number; body: RollCommitBody }[] = [];
  for (const e of entries) {
    const b = (e.record as { body?: { type?: string } } | undefined)?.body;
    if (b?.type === 'roll-commit') rcs.push({ seq: e.seq, body: b as RollCommitBody });
  }
  const rollSize = mrec.body.roll?.size ?? rcs[0]?.body.size ?? rollSizeHint;
  if (rollSize === undefined) return { ok: false, error: 'E_ROLL', detail: 'roll size unknown' };
  const mv = validateManifest(mrec.body, rollSize);
  if (!mv.ok) return { ok: false, error: mv.error, detail: mv.detail ?? '' };
  const m = mv.value.manifest;
  const mh = manifestHash(m);
  if (expectManifestHash !== undefined && H(mh) !== expectManifestHash) return { ok: false, error: 'E_MANIFEST_HASH', detail: 'manifest hash differs from the expected value' };
  if (!Array.isArray(mrec.sigs) || !verifyMultiSig(mh, { body: m, sigs: mrec.sigs }, m.coordinator.keys, m.coordinator.m)) {
    return { ok: false, error: 'E_MANIFEST_SIG', detail: 'manifest lacks enough valid coordinator signatures' };
  }
  const trusteeKey = (i: number): string | undefined => m.trustees[i - 1]?.sign_pk;
  const markers = new Map<string, number>();
  const pendingCtx: { seq: number; rec: MultiSignedRecord<MarkerBody> }[] = [];
  const commits: { seq: number; body: CommitBody }[] = [];
  const dealings: { seq: number; body: DealingBody }[] = [];
  const shares: { seq: number; body: SharesBody }[] = [];
  const complaints: { seq: number; body: ComplaintBody }[] = [];
  let finalMarker: MarkerBody | undefined;
  const tallies: { seq: number; rec: SignedRecord<TallyBody> }[] = [];
  for (const { seq, record } of entries) {
    if (seq === 0) continue;
    const o = record as { body?: { type?: string; proto?: string }; sig?: { key: string; sig: string } } | undefined;
    const b = o?.body;
    if (b === undefined || typeof b !== 'object' || b === null) continue;
    switch (b.type) {
      case 'marker': {
        const rec = record as MultiSignedRecord<MarkerBody>;
        if (rec.body.name === 'election-open' || rec.body.name === 'election-close') pendingCtx.push({ seq, rec });
        else if (verifyMultiSig(mh, rec, m.coordinator.keys, m.coordinator.m) && !markers.has(rec.body.name)) {
          markers.set(rec.body.name, seq);
          if (rec.body.name === 'dkg-final') finalMarker = rec.body;
        }
        break;
      }
      case 'dkg-commit': {
        const r = record as SignedRecord<CommitBody>;
        if (r.body.i <= m.n && r.sig && verifySig(mh, r.body.type, r.body, r.sig, trusteeKey(r.body.i))) commits.push({ seq, body: r.body });
        break;
      }
      case 'dkg-dealing': {
        const r = record as SignedRecord<DealingBody>;
        if (r.body.i <= m.n && r.sig && verifySig(mh, r.body.type, r.body, r.sig, trusteeKey(r.body.i))) dealings.push({ seq, body: r.body });
        break;
      }
      case 'dkg-shares': {
        const r = record as SignedRecord<SharesBody>;
        if (r.body.i <= m.n && r.sig && verifySig(mh, r.body.type, r.body, r.sig, trusteeKey(r.body.i))) shares.push({ seq, body: r.body });
        break;
      }
      case 'dkg-complaint': {
        const r = record as SignedRecord<ComplaintBody>;
        if (r.body.accuser <= m.n && r.sig && verifySig(mh, r.body.type, r.body, r.sig, trusteeKey(r.body.accuser))) complaints.push({ seq, body: r.body });
        break;
      }
      case 'tally':
        tallies.push({ seq, rec: record as SignedRecord<TallyBody> });
        break;
      default:
        break;
    }
  }
  const need = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final'] as const;
  const mk = {} as MarkerSeqs;
  for (const n of need) {
    const s = markers.get(n);
    if (s === undefined && n === 'dkg-final' && opts.allowMissingFinal === true) {
      mk[n] = Number.MAX_SAFE_INTEGER; // organizer computing the final marker: key confirmations come before it
      continue;
    }
    if (s === undefined) return { ok: false, error: 'E_NO_DKG', detail: `the key ceremony is not finished (missing ${n})` };
    mk[n] = s;
  }
  const adj = await adjudicateDkg({ mh, n: m.n, t: m.t, markers: mk, commits, dealings, shares, complaints });
  if (!adj.ok) return { ok: false, error: adj.error, detail: adj.detail ?? 'DKG failed' };
  const dkg = adj.value;
  if (finalMarker?.qmask !== undefined && (finalMarker.qmask !== dkg.qmask || finalMarker.K !== H(pointToBytes(dkg.K)))) {
    return { ok: false, error: 'E_DKG_FINAL', detail: 'the coordinator\'s joint key differs from the recomputed one' };
  }
  const params: ElectionParams = { manifest: m, mh, K: dkg.K, ctx: dkg.ctx };
  let openSeq: number | undefined;
  let closeSeq: number | undefined;
  for (const { seq, rec } of pendingCtx) {
    if (!verifyMultiSig(dkg.ctx, rec, m.coordinator.keys, m.coordinator.m)) continue;
    if (rec.body.name === 'election-open') openSeq ??= seq;
    else closeSeq ??= seq;
  }
  const rr = m.roll.root;
  const tally = tallies[0];
  const phase: Phase = tally ? 'tallied' : closeSeq !== undefined ? 'closed' : openSeq !== undefined ? 'open' : 'ready';
  const ctx: ElectionContext = {
    params, manifest: m, manifestHashHex: H(mh), warnings: mv.value.warnings, phase, rollSize, rollRootHex: rr ?? rcs[0]?.body.root,
  };
  if (openSeq !== undefined) ctx.openSeq = openSeq;
  if (closeSeq !== undefined) ctx.closeSeq = closeSeq;
  if (tally) {
    ctx.tally = tally.rec.body;
    ctx.tallySeq = tally.seq;
  }
  return { ok: true, value: ctx };
}

/** Is `pkHex` on the roll? Uses the server's roll listing; the root check needs the full list (see {@link checkRoll}). */
export function checkRoll(rollHex: readonly string[], expectedRootHex: string | undefined, myPkHex: string): { onRoll: boolean; rootOk: boolean } {
  const rr = rollRoot(rollHex);
  const rootOk = rr.ok && (expectedRootHex === undefined || H(rr.value) === expectedRootHex);
  return { onRoll: rootOk && rollHex.includes(myPkHex), rootOk };
}

/**
 * The log key and origin the client trusts for receipts and checkpoints are the ones in the signature-verified manifest
 * (`bb.log_pk`, `logOrigin`), never the server's own claim. A server that answers with a different key or origin
 * (so it could mint receipts for ballots it drops) is rejected; the returned values are the manifest's.
 */
export function bindServerLog(m: Manifest, server: { logPkB64u: string; origin: string }): { ok: true; logPk: Uint8Array; origin: string } | { ok: false; detail: string } {
  const logPk = hexToBytes(m.bb.log_pk, 32);
  const claimed = b64uDecode(server.logPkB64u);
  if (claimed === undefined || claimed.length !== 32 || !claimed.every((b, i) => b === logPk[i])) return { ok: false, detail: 'the server names a log key that is not the one in the signed manifest' };
  const origin = logOrigin(m);
  if (server.origin !== origin) return { ok: false, detail: 'the server names a log origin that is not the one in the signed manifest' };
  return { ok: true, logPk, origin };
}
