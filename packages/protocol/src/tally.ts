import {
  G, QvCryptoError, bytesToHex, combineShares, decProve, decVerify, dlogSolve, dlogTable, hexToBytes, pointFromBytes,
  pointSub, pointToBytes, scalarFromBytes, scalarToBytes, spoilDecProve, spoilDecVerify, type Point, type Rng, type Scalar,
} from '@quietvote/crypto';
import { type Aggregate, type CountedBallot, aggregate, countedRoot, type SpoilRecord } from './ballotlog.ts';
import { effectiveMinCounted } from './manifest.ts';
import { evaluateAll } from './rules.ts';
import type { ElectionParams } from './ballot.ts';
import { PROTO_ID, err, ok, type ErrorCode, type Result, type TallyBody } from './types.ts';

const H = bytesToHex;
const PT = (h: string): Point => pointFromBytes(hexToBytes(h, 32));
const SC = (h: string): Scalar => scalarFromBytes(hexToBytes(h, 32));

export interface TrusteeKey {
  j: number;
  sj: Scalar;
  Yj: Point;
}
export interface ShareProof {
  M: Point;
  c: Scalar;
  s: Scalar;
}
/** Key "cid/oid" -> share. */
export type ShareSet = Map<string, ShareProof>;
export const shareKey = (cid: string, oid: string): string => `${cid}/${oid}`;

/**
 * Trustee side (§5.16). The trustee recomputes the aggregates from the counted set itself and refuses to decrypt
 * anything else. `claimed` (the coordinator's asserted aggregates) is only compared, never used.
 */
export function trusteeDecryptTally(
  p: ElectionParams,
  key: TrusteeKey,
  counted: readonly CountedBallot[],
  claimed: ReadonlyMap<string, ReadonlyMap<string, Aggregate>> | undefined,
  rollSize: number,
  rng: Rng,
): Result<ShareSet> {
  // P2: the floor counts distinct voters. A repeated voter or ballot code would let a caller pad the floor with copies of one ballot.
  if (new Set(counted.map((c) => c.voter)).size !== counted.length || new Set(counted.map((c) => c.code)).size !== counted.length) {
    return err('E_TRUSTEE_REFUSE', 'counted set repeats a voter or ballot code');
  }
  if (counted.length < effectiveMinCounted(p.manifest, rollSize)) return err('E_BELOW_FLOOR', 'refusing: fewer counted voters than the privacy floor');
  const aggs = aggregate(p, counted);
  if (claimed !== undefined) {
    for (const [cid, m] of aggs) {
      for (const [oid, a] of m) {
        const c = claimed.get(cid)?.get(oid);
        if (c === undefined || !c.A.equals(a.A) || !c.B.equals(a.B)) return err('E_TRUSTEE_REFUSE', `claimed aggregate for ${cid}/${oid} differs from recomputation`);
      }
    }
    for (const [cid, m] of claimed) if (m.size !== (aggs.get(cid)?.size ?? -1)) return err('E_TRUSTEE_REFUSE', 'claimed aggregate has extra ciphertexts');
    if (claimed.size !== aggs.size) return err('E_TRUSTEE_REFUSE', 'claimed aggregate has extra contests');
  }
  const out: ShareSet = new Map();
  for (const [cid, m] of aggs) {
    for (const [oid, a] of m) {
      const { M, proof } = decProve({ ctx: p.ctx, cid, oid, j: key.j, Yj: key.Yj, A: a.A, B: a.B }, key.sj, rng);
      out.set(shareKey(cid, oid), { M, c: proof.c, s: proof.s });
    }
  }
  return ok(out);
}

/** Spoil-mode decryption (§5.13.4); only for a published trustee-mode spoil record and only if the manifest enables it. */
export function trusteeDecryptSpoiled(p: ElectionParams, key: TrusteeKey, rec: SpoilRecord, rng: Rng): Result<ShareSet> {
  if (p.manifest.spoil_trustee_decrypt !== true) return err('E_TRUSTEE_REFUSE', 'trustee-mode spoil decryption disabled by manifest');
  if (rec.env.reveal_digest !== '00'.repeat(32)) return err('E_TRUSTEE_REFUSE', 'spoil record is not in trustee-decryption mode');
  const out: ShareSet = new Map();
  for (const c of rec.env.body.contests) {
    const mc = p.manifest.contests.find((x) => x.id === c.id)!;
    for (let k = 0; k < mc.options.length; k++) {
      const s = c.sel[k]!;
      const { M, proof } = spoilDecProve(
        { ctx: p.ctx, ballotCode: hexToBytes(rec.code, 32), cid: c.id, oid: s.opt, j: key.j, Yj: key.Yj, alpha: PT(s.a), beta: PT(s.b) },
        key.sj,
        rng,
      );
      out.set(shareKey(c.id, s.opt), { M, c: proof.c, s: proof.s });
    }
  }
  return ok(out);
}

export interface DecryptionOutcome {
  S: number[];
  validSet: number[];
  invalid: number[];
  counts: Map<string, Map<string, number>>;
}

/** §5.16-5.18: verify shares, choose canonical S, Lagrange-combine, BSGS. `Y` is recomputed from the DKG by the caller. */
export function decryptAggregates(
  p: ElectionParams,
  Y: ReadonlyMap<number, Point>,
  decrypters: ReadonlySet<number>,
  aggs: ReadonlyMap<string, ReadonlyMap<string, Aggregate>>,
  V: number,
  shares: ReadonlyMap<number, ShareSet>,
): Result<DecryptionOutcome> {
  const t = p.manifest.t;
  const valid: number[] = [];
  const invalid: number[] = [];
  for (const [j, set] of shares) {
    const Yj = Y.get(j);
    if (Yj === undefined || !decrypters.has(j)) {
      invalid.push(j);
      continue;
    }
    let good = true;
    for (const [cid, m] of aggs) {
      for (const [oid, a] of m) {
        const sp = set.get(shareKey(cid, oid));
        if (sp === undefined || !decVerify({ ctx: p.ctx, cid, oid, j, Yj, A: a.A, B: a.B, M: sp.M }, { c: sp.c, s: sp.s })) good = false;
      }
    }
    (good ? valid : invalid).push(j);
  }
  valid.sort((a, b) => a - b);
  if (valid.length < t) return err('E_TALLY_INSUFFICIENT', `${valid.length} valid decrypters < t=${t}`);
  const S = valid.slice(0, t);
  const S2 = valid.slice(valid.length - t);
  const table = dlogTable(V);
  const counts = new Map<string, Map<string, number>>();
  for (const [cid, m] of aggs) {
    const cm = new Map<string, number>();
    for (const [oid, a] of m) {
      const comb = (set: number[]): Point => {
        const mm = new Map<number, Point>();
        for (const j of set) mm.set(j, shares.get(j)!.get(shareKey(cid, oid))!.M);
        return combineShares(set, mm);
      };
      const D = pointSub(a.B, comb(S));
      if (valid.length > t && !pointSub(a.B, comb(S2)).equals(D)) return err('E_DEC_PROOF', 'subset mismatch despite valid proofs');
      const T = dlogSolve(D, table);
      if (T === null) return err('E_DLOG_RANGE', `${cid}/${oid}`);
      cm.set(oid, T);
    }
    const mc = p.manifest.contests.find((x) => x.id === cid)!;
    if (mc.selection_limit !== undefined) {
      let sum = 0;
      for (const v of cm.values()) sum += v;
      if (sum > mc.selection_limit * V) return err('E_DLOG_RANGE', `sum bound exceeded in ${cid}`);
    }
    counts.set(cid, cm);
  }
  return ok({ S, validSet: valid, invalid, counts });
}

export interface SpoilTrusteeOutcome {
  selections: Record<string, string[]>;
}

/** Verify and decode a trustee-mode spoil: each bit is a single comparison (T = O or G). */
export function decryptSpoiled(
  p: ElectionParams,
  Y: ReadonlyMap<number, Point>,
  decrypters: ReadonlySet<number>,
  rec: { code: string; body: import('./types.ts').BallotBody },
  shares: ReadonlyMap<number, ShareSet>,
): Result<SpoilTrusteeOutcome> {
  const t = p.manifest.t;
  const valid: number[] = [];
  for (const [j, set] of shares) {
    const Yj = Y.get(j);
    if (Yj === undefined || !decrypters.has(j)) continue;
    let good = true;
    for (const c of rec.body.contests) {
      const mc = p.manifest.contests.find((x) => x.id === c.id)!;
      for (let k = 0; k < mc.options.length; k++) {
        const s = c.sel[k]!;
        const sp = set.get(shareKey(c.id, s.opt));
        if (
          sp === undefined ||
          !spoilDecVerify({ ctx: p.ctx, ballotCode: hexToBytes(rec.code, 32), cid: c.id, oid: s.opt, j, Yj, alpha: PT(s.a), beta: PT(s.b), M: sp.M }, { c: sp.c, s: sp.s })
        ) good = false;
      }
    }
    if (good) valid.push(j);
  }
  valid.sort((a, b) => a - b);
  if (valid.length < t) return err('E_DEC_PROOF', 'not enough valid spoil shares');
  const S = valid.slice(0, t);
  const selections: Record<string, string[]> = {};
  for (const c of rec.body.contests) {
    const mc = p.manifest.contests.find((x) => x.id === c.id)!;
    const chosen: string[] = [];
    for (let k = 0; k < mc.options.length; k++) {
      const s = c.sel[k]!;
      const mm = new Map<number, Point>();
      for (const j of S) mm.set(j, shares.get(j)!.get(shareKey(c.id, s.opt))!.M);
      const D = pointSub(PT(s.b), combineShares(S, mm));
      if (D.is0()) continue;
      if (D.equals(G)) chosen.push(s.opt);
      else return err('E_DLOG_RANGE', 'spoiled selection is not 0/1');
    }
    selections[c.id] = chosen;
  }
  return ok({ selections });
}

// -------------------------------------------------------------------- record (de)serialisation

export function shareToHex(j: number, sp: ShareProof): { j: number; M: string; c: string; s: string } {
  return { j, M: H(pointToBytes(sp.M)), c: H(scalarToBytes(sp.c)), s: H(scalarToBytes(sp.s)) };
}
export function shareFromHex(x: { M: string; c: string; s: string }): Result<ShareProof> {
  try {
    return ok({ M: PT(x.M), c: SC(x.c), s: SC(x.s) });
  } catch (e) {
    if (e instanceof QvCryptoError) return err(e.code === 'E_SCALAR_RANGE' ? 'E_SCALAR_RANGE' : 'E_POINT_DECODE');
    throw e;
  }
}

export interface TallyInputs {
  analysis: { counted: CountedBallot[] };
  shares: ReadonlyMap<number, ShareSet>;
  Y: ReadonlyMap<number, Point>;
  decrypters: ReadonlySet<number>;
  rollSize: number;
  spoiled: { rec: SpoilRecord; mode: 'reveal' | 'trustees'; selections: Record<string, string[]>; shares?: ReadonlyMap<number, ShareSet> }[];
}

export interface AggregateTallyInputs extends Omit<TallyInputs, 'analysis'> {
  nCounted: number;
  countedRoot: Uint8Array;
  aggs: ReadonlyMap<string, ReadonlyMap<string, Aggregate>>;
}

/** Coordinator convenience: assemble the §5.19.1 record. It is verified, not trusted. */
export function buildTally(p: ElectionParams, inp: TallyInputs): Result<{ body: TallyBody; counts: Map<string, Map<string, number>> }, ErrorCode> {
  const counted = inp.analysis.counted;
  return buildTallyFromAggregate(p, { ...inp, nCounted: counted.length, countedRoot: countedRoot(counted), aggs: aggregate(p, counted) });
}

/** Coordinator convenience over an independently admitted/recomputed aggregate. Still verifies all decryption proofs.
 * Does not establish the aggregate's counted-ballot binding; verifiers/trustees independently recompute that binding.
 */
export function buildTallyFromAggregate(p: ElectionParams, inp: AggregateTallyInputs): Result<{ body: TallyBody; counts: Map<string, Map<string, number>> }, ErrorCode> {
  const V = inp.nCounted;
  const aggs = inp.aggs;
  const dec = decryptAggregates(p, inp.Y, inp.decrypters, aggs, V, inp.shares);
  if (!dec.ok) return dec;
  const contests: TallyBody['contests'] = [];
  for (const [cid, m] of aggs) {
    contests.push({
      id: cid,
      options: [...m].map(([oid, a]) => ({
        id: oid,
        A: H(pointToBytes(a.A)),
        B: H(pointToBytes(a.B)),
        shares: [...inp.shares].filter(([, s]) => s.has(shareKey(cid, oid))).map(([j, s]) => shareToHex(j, s.get(shareKey(cid, oid))!)),
        T: dec.value.counts.get(cid)!.get(oid)!,
      })),
    });
  }
  const spoiled: TallyBody['spoiled'] = inp.spoiled.map((s) => {
    const e: TallyBody['spoiled'][number] = { code: s.rec.code, mode: s.mode, selections: s.selections };
    if (s.mode === 'trustees' && s.shares !== undefined) {
      e.shares = [...s.shares].flatMap(([j, set]) =>
        [...set].map(([k, sp]) => {
          const [contest, opt] = k.split('/') as [string, string];
          return { contest, opt, ...shareToHex(j, sp) };
        }),
      );
    }
    return e;
  });
  const body: TallyBody = {
    proto: PROTO_ID,
    type: 'tally',
    ctx: H(p.ctx),
    n_counted: V,
    counted_root: H(inp.countedRoot),
    decrypters: dec.value.validSet, // §5.19: T_valid (P11), not every trustee that sent something
    contests,
    spoiled,
    results: evaluateAll(p.manifest, dec.value.counts, V, inp.rollSize),
  };
  return ok({ body, counts: dec.value.counts });
}
