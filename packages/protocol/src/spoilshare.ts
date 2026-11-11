// Trustee-mode spoil shares (QV-16 §5.13.4, QV-ADR-020): wire record + coordinator-side collection.
// The record is signed by the trustee's `sign_pk` under scope = ctx; it is not in the QV-16 closed record list,
// so it is never part of the board log, it travels in packets and is published via `tally.spoiled[].shares`.
import { bytesToHex, hexToBytes, pointFromBytes, scalarFromBytes, type Point, type Scalar } from '@quietvote/crypto';
import { arr, check, hex as hexS, int, lit, obj, S, str } from './schema.ts';
import { verifySig } from './records.ts';
import { PROTO_ID, type Manifest, type SignedRecord } from './types.ts';

export interface SpoilShareBody {
  proto: string;
  type: 'spoil-share';
  ctx: string;
  j: number;
  code: string;
  /** Log position of the spoil record the trustee decrypted. */
  spoil_seq: number;
  shares: { contest: string; opt: string; M: string; c: string; s: string }[];
}

const spoilShareSchema = obj({
  proto: lit(PROTO_ID), type: lit('spoil-share'), ctx: hexS(32), j: int(1, 32), code: hexS(32), spoil_seq: int(0, 1 << 30),
  shares: arr(obj({ contest: str(64), opt: str(66), M: hexS(32), c: hexS(32), s: hexS(32) }), 1, 4096),
});
export const spoilShareRecordSchema = S.signed(spoilShareSchema);

/**
 * Collects `spoil-share` records for ONE ballot code into the per-trustee ShareSets `decryptSpoiled` consumes.
 * Rejects wrong ctx/code, out-of-range index, bad trustee signature, duplicates (first wins) and undecodable points.
 * Proof validity is NOT checked here: `decryptSpoiled` (and the verifier) check every DLEQ proof.
 */
export function collectSpoilShares(
  m: Manifest,
  ctx: Uint8Array,
  code: string,
  records: readonly unknown[],
): { sets: Map<number, Map<string, { M: Point; c: Scalar; s: Scalar }>>; rejected: { j?: number; why: string }[] } {
  const sets = new Map<number, Map<string, { M: Point; c: Scalar; s: Scalar }>>();
  const rejected: { j?: number; why: string }[] = [];
  const ctxHex = bytesToHex(ctx);
  for (const raw of records) {
    const e = check(spoilShareRecordSchema, raw);
    if (e !== null) {
      rejected.push({ why: `schema: ${e}` });
      continue;
    }
    const rec = raw as SignedRecord<SpoilShareBody>;
    const j = rec.body.j;
    if (rec.body.ctx !== ctxHex || rec.body.code !== code || j > m.n) {
      rejected.push({ j, why: 'wrong ctx, code or index' });
      continue;
    }
    if (!verifySig(ctx, 'spoil-share', rec.body, rec.sig, m.trustees[j - 1]?.sign_pk)) {
      rejected.push({ j, why: 'bad signature' });
      continue;
    }
    if (sets.has(j)) {
      rejected.push({ j, why: 'duplicate' });
      continue;
    }
    try {
      const mp = new Map<string, { M: Point; c: Scalar; s: Scalar }>();
      for (const s of rec.body.shares) {
        const k = `${s.contest}/${s.opt}`;
        if (mp.has(k)) throw new Error('duplicate share key');
        mp.set(k, {
          M: pointFromBytes(hexToBytes(s.M, 32), { nonIdentity: true }),
          c: scalarFromBytes(hexToBytes(s.c, 32)),
          s: scalarFromBytes(hexToBytes(s.s, 32)),
        });
      }
      sets.set(j, mp);
    } catch {
      rejected.push({ j, why: 'undecodable or duplicate share' });
    }
  }
  return { sets, rejected };
}
