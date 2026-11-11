// Trustees-mode spoiled-ballot shares in the web client (QV-ADR-020, QV-16 §5.13.4). Mirrors `qv election spoil-collect`:
// the client re-derives which codes are decryptable spoils from the public log, verifies every trustee share itself with the
// protocol functions (a server list is never trusted), decodes the selections once t distinct valid trustees exist, and can
// verify then POST a record produced by `qv-trustee spoil-release`.
import { bytesToHex, hexToBytes, parseQvJson, pointFromBytes, spoilDecVerify, type Point } from '@quietvote/crypto';
import {
  analyzeBallotLog, ballotCode, collectAlphas, collectSpoilShares, decryptSpoiled, shareKey,
  type BallotBody, type ShareSet, type SpoilRecord, type SpoilShareBody,
} from '@quietvote/protocol';
import { ApiError } from '../api/errors.ts';
import type { ApiClient } from '../api/client.ts';
import type { ElectionContext } from './election.ts';

const ZERO32 = '00'.repeat(32);
/** The server accepts at most 1 MiB per POST (app.ts maxBody); refuse bigger input before parsing. */
export const MAX_SHARE_BYTES = 1_048_576;

export type ShareReason =
  | 'schema' | 'wrong-election' | 'bad-signature' | 'undecodable' | 'not-decrypter' | 'wrong-spoil' | 'incomplete' | 'proof'
  | 'cast-code' | 'unknown-code' | 'not-trustees-mode';

export interface SpoilTargets {
  ctx: ElectionContext;
  /** Verified trustees-mode spoils that no cast envelope carries or re-wraps (the gate the trustees apply). */
  spoils: ReadonlyMap<string, SpoilRecord>;
  /** Codes of verified spoils that may never be decrypted by trustees (reveal-mode, or re-wrapping a cast ciphertext). */
  refused: ReadonlyMap<string, 'not-trustees-mode'>;
  castCodes: ReadonlySet<string>;
}

export type TargetsResult = { ok: true; value: SpoilTargets } | { ok: false; reason: 'not-enabled' | 'not-closed' | 'no-key' };

/** Re-derives the decryptable spoils from the already-derived election context and the full log + roll. */
export function deriveSpoilTargets(ctx: ElectionContext, records: readonly { seq: number; record: unknown }[], roll: readonly string[]): TargetsResult {
  if (ctx.manifest.spoil_trustee_decrypt !== true) return { ok: false, reason: 'not-enabled' };
  if (ctx.openSeq === undefined || ctx.closeSeq === undefined) return { ok: false, reason: 'not-closed' };
  const voter = records.filter((r) => r.seq !== 0 && typeof r.record === 'object' && r.record !== null && 'intent' in r.record).map((r) => ({ seq: r.seq, raw: r.record }));
  const an = analyzeBallotLog(ctx.params, new Set(roll), voter, ctx.openSeq, ctx.closeSeq);
  const castCodes = new Set<string>(an.counted.map((c) => c.code));
  for (const { raw } of voter) {
    const e = raw as { intent?: unknown; body?: BallotBody };
    if (e.intent === 'cast' && e.body !== undefined) {
      try {
        castCodes.add(bytesToHex(ballotCode(ctx.params.ctx, e.body)));
      } catch {
        // an undecodable cast cannot carry this code
      }
    }
  }
  const spoils = new Map<string, SpoilRecord>();
  const refused = new Map<string, 'not-trustees-mode'>();
  for (const [code, rec] of an.spoiled) {
    if (castCodes.has(code)) continue;
    const mine = new Set<string>();
    collectAlphas(rec.env.body, mine);
    const rewrap = [...mine].some((a) => an.castAlphas.has(a));
    if (rec.env.reveal_digest !== ZERO32 || rec.env.reveal !== undefined || rewrap) refused.set(code, 'not-trustees-mode');
    else spoils.set(code, rec);
  }
  return { ok: true, value: { ctx, spoils, refused, castCodes } };
}

export type ShareCheck = { ok: true; j: number; code: string; set: ShareSet } | { ok: false; j?: number; code?: string; reason: ShareReason };

const HEX64 = /^[0-9a-f]{64}$/;

/** Verifies ONE signed spoil-share record against the log-derived spoil. Same gates as the server's addSpoilShare. */
export function checkSpoilShare(tg: SpoilTargets, raw: unknown): ShareCheck {
  const code = (raw as { body?: { code?: unknown } } | null)?.body?.code;
  if (typeof code !== 'string' || !HEX64.test(code)) return { ok: false, reason: 'schema' };
  if (tg.castCodes.has(code)) return { ok: false, code, reason: 'cast-code' };
  if (tg.refused.has(code)) return { ok: false, code, reason: 'not-trustees-mode' };
  const spoil = tg.spoils.get(code);
  if (spoil === undefined) return { ok: false, code, reason: 'unknown-code' };
  const { manifest, params } = tg.ctx;
  const col = collectSpoilShares(manifest, params.ctx, code, [raw]);
  const rej = col.rejected[0];
  if (rej !== undefined) {
    const w = rej.why;
    const reason: ShareReason = w.startsWith('schema') ? 'schema' : w.startsWith('wrong') ? 'wrong-election' : w.startsWith('bad') ? 'bad-signature' : 'undecodable';
    return rej.j === undefined ? { ok: false, code, reason } : { ok: false, j: rej.j, code, reason };
  }
  const body = (raw as { body: SpoilShareBody }).body;
  const j = body.j;
  const set = col.sets.get(j);
  if (set === undefined) return { ok: false, j, code, reason: 'undecodable' };
  if (body.spoil_seq !== spoil.seq) return { ok: false, j, code, reason: 'wrong-spoil' };
  if (!tg.ctx.decrypters.has(j)) return { ok: false, j, code, reason: 'not-decrypter' };
  const expected = spoil.env.body.contests.reduce((n, c) => n + c.sel.length, 0);
  if (set.size !== expected || body.shares.length !== expected) return { ok: false, j, code, reason: 'incomplete' };
  const Yj = tg.ctx.shareKeys.get(j);
  if (Yj === undefined || !setProofsValid(params.ctx, Yj, spoil, j, set)) return { ok: false, j, code, reason: 'proof' };
  return { ok: true, j, code, set };
}

function setProofsValid(ctx: Uint8Array, Yj: Point, spoil: SpoilRecord, j: number, set: ShareSet): boolean {
  try {
    for (const c of spoil.env.body.contests) {
      for (const s of c.sel) {
        const sp = set.get(shareKey(c.id, s.opt));
        if (sp === undefined) return false;
        const alpha = pointFromBytes(hexToBytes(s.a, 32), { nonIdentity: true });
        const beta = pointFromBytes(hexToBytes(s.b, 32), { nonIdentity: true });
        if (!spoilDecVerify({ ctx, ballotCode: hexToBytes(spoil.code, 32), cid: c.id, oid: s.opt, j, Yj, alpha, beta, M: sp.M }, { c: sp.c, s: sp.s })) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export interface InvalidShare {
  /** Trustee index claimed by the record, when it could be read. */
  j?: number;
  reason: ShareReason;
}
export type SpoilStatus =
  | { kind: 'waiting'; code: string; valid: number[]; need: number }
  | { kind: 'decoded'; code: string; valid: number[]; need: number; selections: Record<string, string[]>; invalid: InvalidShare[] }
  | { kind: 'invalid-share'; code: string; valid: number[]; need: number; invalid: InvalidShare[] }
  | { kind: 'decode-failed'; code: string; valid: number[]; need: number; invalid: InvalidShare[]; error: string };

/** Pure: status of one code from candidate records (from the server or a user). Each record is verified on its own, first valid per trustee wins. */
export function statusFor(tg: SpoilTargets, code: string, candidates: readonly unknown[]): SpoilStatus {
  const need = tg.ctx.manifest.t;
  const spoil = tg.spoils.get(code);
  const good = new Map<number, ShareSet>();
  const invalid: InvalidShare[] = [];
  for (const raw of candidates) {
    const r = checkSpoilShare(tg, raw);
    if (!r.ok) invalid.push(r.j === undefined ? { reason: r.reason } : { j: r.j, reason: r.reason });
    else if (r.code !== code) invalid.push({ j: r.j, reason: 'wrong-spoil' });
    else if (good.has(r.j)) continue; // a byte-identical or repeated valid record from the same trustee adds nothing
    else good.set(r.j, r.set);
  }
  const valid = [...good.keys()].sort((a, b) => a - b);
  if (spoil === undefined || valid.length < need) {
    return invalid.length === 0 ? { kind: 'waiting', code, valid, need } : { kind: 'invalid-share', code, valid, need, invalid };
  }
  const out = decryptSpoiled(tg.ctx.params, tg.ctx.shareKeys as ReadonlyMap<number, Point>, tg.ctx.decrypters, { code, body: spoil.env.body }, good);
  if (!out.ok) return { kind: 'decode-failed', code, valid, need, invalid, error: out.error };
  return { kind: 'decoded', code, valid, need, selections: out.value.selections, invalid };
}

/** Fetches the server's records for every decryptable code, verifying each locally. One failed code fetch fails the refresh. */
export async function loadSpoilStatuses(api: ApiClient, apiId: string, tg: SpoilTargets): Promise<SpoilStatus[]> {
  return Promise.all([...tg.spoils.keys()].sort().map(async (code) => {
    const { items } = await api.getSpoilShares(apiId, code);
    return statusFor(tg, code, (Array.isArray(items) ? items : []).slice(0, 64).map((x) => x?.record));
  }));
}

export type SubmitOutcome =
  | { kind: 'accepted' | 'duplicate'; j: number; code: string }
  | { kind: 'rejected-local'; j?: number; code?: string; reason: ShareReason }
  | { kind: 'rejected-server'; j?: number; code?: string; status: number; apiCode: string; reason?: string };

/**
 * Accepts text pasted or uploaded by the user: a single signed `spoil-share` record (what `qv-trustee spoil-release` writes), an array
 * of records, or a `qv-ceremony-packet/v1` packet of round `spoil-share`. Returns the records found, or undefined if unreadable.
 */
export function parseShareInput(text: string): unknown[] | undefined {
  if (text.length > MAX_SHARE_BYTES * 4) return undefined;
  let v: unknown;
  try {
    v = parseQvJson(text);
  } catch {
    return undefined;
  }
  if (Array.isArray(v)) return v.length > 0 && v.length <= 64 ? v : undefined;
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as { format?: unknown; round?: unknown; records?: unknown };
  if (o.format === 'qv-ceremony-packet/v1') return o.round === 'spoil-share' && Array.isArray(o.records) && o.records.length > 0 && o.records.length <= 64 ? o.records : undefined;
  return [v];
}

/** Verifies each record locally and POSTs only those that pass. The record is sent unchanged (the body IS the record). */
export async function submitShares(api: ApiClient, apiId: string, tg: SpoilTargets, records: readonly unknown[]): Promise<SubmitOutcome[]> {
  const out: SubmitOutcome[] = [];
  for (const raw of records) {
    const r = checkSpoilShare(tg, raw);
    if (!r.ok) {
      out.push({ kind: 'rejected-local', ...(r.j === undefined ? {} : { j: r.j }), ...(r.code === undefined ? {} : { code: r.code }), reason: r.reason });
      continue;
    }
    try {
      const res = await api.postSpoilShare(apiId, raw);
      out.push({ kind: res.status === 'duplicate' ? 'duplicate' : 'accepted', j: r.j, code: r.code });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      out.push({ kind: 'rejected-server', j: r.j, code: r.code, status: e.status, apiCode: e.code, ...(e.reason === undefined ? {} : { reason: e.reason }) });
      if (e.status === 0) break; // network failure or timeout: status 0 means no response, so stop and let the user retry the rest
    }
  }
  return out;
}
