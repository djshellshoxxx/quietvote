import {
  QvCryptoError, baseMul, bytesToHex, decryptShare, decryptShareWithDh, dhProve, dhVerify, encryptShare, feldmanCommit,
  feldmanEval, feldmanVerifyShare, h256, hexToBytes, jcs, pointFromBytes, pointMul, pointSum, pointToBytes, pokProve,
  pokVerify, polyEval, scalarAdd, scalarFromBytes, scalarRandomNonZero, scalarToBytes, shareKeyProve, shareKeyVerify,
  u32, u8, type Point, type Rng, type Scalar,
} from '@quietvote/crypto';
import {
  PROTO_ID, err, ok, type ComplaintBody, type CommitBody, type DealingBody, type ErrorCode, type KeyconfBody,
  type Result, type SharesBody,
} from './types.ts';

const PT = (h: string, nonId = true): Point => pointFromBytes(hexToBytes(h, 32), { nonIdentity: nonId });
const SC = (h: string): Scalar => scalarFromBytes(hexToBytes(h, 32));
const H = (b: Uint8Array): string => bytesToHex(b);
const KIND_E = 0xffff;

export interface DealerSecret {
  i: number;
  t: number;
  coeffs: Scalar[];
  e: Scalar;
}

/** Round 0/1 (§5.7.1-3): coefficients, encryption key, PoKs, dealing body and the round-0 commit. */
export function dkgDeal(mh: Uint8Array, i: number, t: number, rng: Rng, fixedA0?: Scalar): { secret: DealerSecret; body: DealingBody; commit: CommitBody } {
  const coeffs = Array.from({ length: t }, () => scalarRandomNonZero(rng));
  if (fixedA0 !== undefined) coeffs[0] = fixedA0; // tests / ceremony replays only
  const e = scalarRandomNonZero(rng);
  const E = baseMul(e);
  const A = feldmanCommit(coeffs);
  const ep = pokProve(mh, i, KIND_E, e, E, rng);
  const body: DealingBody = {
    proto: PROTO_ID,
    type: 'dkg-dealing',
    i,
    enc: { E: H(pointToBytes(E)), c: H(scalarToBytes(ep.c)), s: H(scalarToBytes(ep.s)) },
    coeffs: coeffs.map((a, k) => {
      const p = pokProve(mh, i, k, a, A[k]!, rng);
      return { A: H(pointToBytes(A[k]!)), c: H(scalarToBytes(p.c)), s: H(scalarToBytes(p.s)) };
    }),
  };
  return { secret: { i, t, coeffs, e }, body, commit: dkgCommitFor(mh, i, body) };
}

export function dealingCommitHash(mh: Uint8Array, i: number, body: DealingBody): Uint8Array {
  return h256('dkg-commit', mh, u8(i), jcs(body));
}
export function dkgCommitFor(mh: Uint8Array, i: number, body: DealingBody): CommitBody {
  return { proto: PROTO_ID, type: 'dkg-commit', i, h: H(dealingCommitHash(mh, i, body)) };
}
export function dealingDigest(mh: Uint8Array, body: DealingBody): Uint8Array {
  return h256('dkg-dealing', mh, u8(body.i), jcs(body));
}

export interface ParsedDealing {
  i: number;
  E: Point;
  A: Point[];
  digest: Uint8Array;
  body: DealingBody;
}

/** Round-1 content checks 2-3 (§5.7.3): shapes, decoding, non-identity, all t+1 PoKs. */
export function checkDealing(mh: Uint8Array, t: number, body: DealingBody): Result<ParsedDealing> {
  try {
    if (body.coeffs.length !== t) return err('E_DKG_R1', 'coefficient count');
    const E = PT(body.enc.E);
    if (!pokVerify(mh, body.i, KIND_E, E, { c: SC(body.enc.c), s: SC(body.enc.s) })) return err('E_DKG_R1', 'PoK of E');
    const A: Point[] = [];
    for (let k = 0; k < t; k++) {
      const c = body.coeffs[k]!;
      const P = PT(c.A);
      if (!pokVerify(mh, body.i, k, P, { c: SC(c.c), s: SC(c.s) })) return err('E_DKG_R1', `PoK of coefficient ${k}`);
      A.push(P);
    }
    return ok({ i: body.i, E, A, digest: dealingDigest(mh, body), body });
  } catch (e) {
    if (e instanceof QvCryptoError) return err('E_DKG_R1', e.code);
    throw e;
  }
}

/** Round 2 (§5.7.4). Shares for every j in R1 other than i, ascending. */
export async function dkgMakeShares(
  mh: Uint8Array,
  secret: DealerSecret,
  r1: ReadonlyMap<number, ParsedDealing>,
  rng: Rng,
): Promise<SharesBody> {
  const shares: SharesBody['shares'] = [];
  for (const j of [...r1.keys()].sort((a, b) => a - b)) {
    if (j === secret.i) continue;
    const pkg = await encryptShare(mh, secret.i, j, r1.get(j)!.E, polyEval(secret.coeffs, j), rng);
    shares.push({ j, R: H(pkg.R), ct: H(pkg.ct), tag: H(pkg.tag) });
  }
  return { proto: PROTO_ID, type: 'dkg-shares', i: secret.i, shares };
}

export type ReceiveResult = { ok: true; y: Scalar } | { ok: false; reason: 'aead' | 'scalar' | 'feldman' | 'decode' };

/** Round 3 (§5.7.5): decrypt and test equation (F). */
export async function dkgReceiveShare(
  mh: Uint8Array,
  j: number,
  ej: Scalar,
  dealing: ParsedDealing,
  entry: { R: string; ct: string; tag: string },
): Promise<ReceiveResult> {
  try {
    const pkg = { R: hexToBytes(entry.R, 32), ct: hexToBytes(entry.ct, 32), tag: hexToBytes(entry.tag, 16) };
    const y = await decryptShare(mh, dealing.i, j, ej, pkg);
    return feldmanVerifyShare(y, dealing.A, j) ? { ok: true, y } : { ok: false, reason: 'feldman' };
  } catch (e) {
    if (e instanceof QvCryptoError) return { ok: false, reason: e.code === 'E_AEAD' ? 'aead' : e.code === 'E_SCALAR_RANGE' ? 'scalar' : 'decode' };
    throw e;
  }
}

export function dkgMakeComplaint(
  mh: Uint8Array,
  accuser: number,
  ej: Scalar,
  Ej: Point,
  accused: number,
  entry: { R: string },
  rng: Rng,
): ComplaintBody {
  const R = PT(entry.R);
  const S = pointMul(R, ej);
  const p = dhProve(mh, accused, accuser, Ej, R, S, ej, rng);
  return { proto: PROTO_ID, type: 'dkg-complaint', accuser, accused, S: H(pointToBytes(S)), c: H(scalarToBytes(p.c)), s: H(scalarToBytes(p.s)) };
}

export type MarkerSeqs = Record<'dkg-open' | 'dkg-r1-open' | 'dkg-r1-close' | 'dkg-r2-close' | 'dkg-r3-close' | 'dkg-final', number>;

export interface DkgInput {
  mh: Uint8Array;
  n: number;
  t: number;
  markers: MarkerSeqs;
  commits: { seq: number; body: CommitBody }[];
  dealings: { seq: number; body: DealingBody }[];
  shares: { seq: number; body: SharesBody }[];
  complaints: { seq: number; body: ComplaintBody }[];
}

export interface DkgEvent {
  code: ErrorCode;
  who: number;
  detail: string;
}

export interface DkgOutcome {
  R1: number[];
  Q: number[];
  qmask: number;
  K: Point;
  Y: Map<number, Point>;
  dealings: Map<number, ParsedDealing>;
  transcriptHash: Uint8Array;
  ctx: Uint8Array;
  events: DkgEvent[];
}

export function qmaskOf(Q: readonly number[]): number {
  let m = 0;
  for (const i of Q) m += 2 ** (i - 1);
  return m;
}

export function computeCtx(mh: Uint8Array, K: Point, Q: readonly number[], dealings: ReadonlyMap<number, ParsedDealing>, t: number, n: number): { ctx: Uint8Array; transcriptHash: Uint8Array } {
  const qm = qmaskOf(Q);
  const qs = [...Q].sort((a, b) => a - b);
  const transcriptHash = h256('dkg-transcript', mh, u32(qm), ...qs.map((i) => dealings.get(i)!.digest));
  const ctx = h256('election-ctx', mh, pointToBytes(K), transcriptHash, u32(qm), u8(t), u8(n));
  return { ctx, transcriptHash };
}

/** Deterministic adjudication (§5.7.6) from the public record. */
export async function adjudicateDkg(inp: DkgInput): Promise<Result<DkgOutcome>> {
  const { mh, n, t, markers: mk } = inp;
  const order = [mk['dkg-open'], mk['dkg-r1-open'], mk['dkg-r1-close'], mk['dkg-r2-close'], mk['dkg-r3-close'], mk['dkg-final']];
  for (let k = 1; k < order.length; k++) if (!(order[k - 1]! < order[k]!)) return err('E_DKG_MARKERS', 'phase markers out of order');
  const events: DkgEvent[] = [];
  const out = new Set<number>(); // disqualified from R1
  const between = (seq: number, a: number, b: number): boolean => seq > a && seq < b;

  // ---- Round 1
  const uniq = <B extends { i: number }>(items: { seq: number; body: B }[], timely: (s: number) => boolean, what: string): Map<number, B> => {
    const m = new Map<number, B>();
    const bad = new Set<number>();
    for (const it of items) {
      if (!timely(it.seq)) continue;
      const i = it.body.i;
      const prev = m.get(i);
      if (prev === undefined) m.set(i, it.body);
      else if (H(jcs(prev)) !== H(jcs(it.body))) {
        bad.add(i);
        events.push({ code: 'E_DKG_EQUIVOCATION', who: i, detail: `two different ${what} records` });
      }
    }
    for (const i of bad) m.delete(i);
    return m;
  };
  const commits = uniq(inp.commits, (s) => s < mk['dkg-r1-open'], 'commit');
  const dealingsRaw = uniq(inp.dealings, (s) => between(s, mk['dkg-r1-open'], mk['dkg-r1-close']), 'dealing');
  const parsed = new Map<number, ParsedDealing>();
  for (let i = 1; i <= n; i++) {
    const d = dealingsRaw.get(i);
    const c = commits.get(i);
    if (d === undefined || c === undefined) {
      out.add(i);
      events.push({ code: 'E_DKG_R1', who: i, detail: 'missing/late commit or dealing' });
      continue;
    }
    if (c.h !== H(dealingCommitHash(mh, i, d))) {
      out.add(i);
      events.push({ code: 'E_DKG_R1', who: i, detail: 'reveal does not match commit' });
      continue;
    }
    const r = checkDealing(mh, t, d);
    if (!r.ok) {
      out.add(i);
      events.push({ code: 'E_DKG_R1', who: i, detail: r.detail ?? 'dealing invalid' });
      continue;
    }
    parsed.set(i, r.value);
  }
  // distinct A_0 among dealers that passed content checks (symmetric disqualification of copies)
  const a0 = new Map<string, number[]>();
  for (const [i, d] of parsed) {
    const k = H(pointToBytes(d.A[0]!));
    a0.set(k, [...(a0.get(k) ?? []), i]);
  }
  for (const group of a0.values()) {
    if (group.length > 1) {
      for (const i of group) {
        out.add(i);
        parsed.delete(i);
        events.push({ code: 'E_DKG_R1', who: i, detail: 'duplicate A_0' });
      }
    }
  }
  const R1 = [...parsed.keys()].sort((a, b) => a - b);

  // ---- Round 2
  const sharesRaw = uniq(inp.shares, (s) => between(s, mk['dkg-r1-close'], mk['dkg-r2-close']), 'shares');
  const disq = new Set<number>();
  const entries = new Map<number, Map<number, SharesBody['shares'][number]>>();
  for (const i of R1) {
    const rec = sharesRaw.get(i);
    const need = R1.filter((j) => j !== i);
    let valid = rec !== undefined && rec.shares.length === need.length;
    const em = new Map<number, SharesBody['shares'][number]>();
    if (rec !== undefined) {
      for (let k = 0; k < rec.shares.length; k++) {
        const s = rec.shares[k]!;
        em.set(s.j, s);
        if (valid && s.j !== need[k]) valid = false; // exactly one per j, ascending
        try {
          PT(s.R);
        } catch {
          valid = false;
        }
      }
    }
    entries.set(i, em);
    if (!valid) {
      disq.add(i);
      events.push({ code: 'E_DKG_R2', who: i, detail: 'missing, late or malformed share package' });
    }
  }

  // ---- Round 3: complaints
  for (const c of inp.complaints) {
    if (!between(c.seq, mk['dkg-r2-close'], mk['dkg-r3-close'])) continue;
    const { accuser: j, accused: i } = c.body;
    if (!parsed.has(i) || !parsed.has(j) || i === j) continue;
    const ent = entries.get(i)?.get(j);
    if (ent === undefined) continue;
    let S: Point;
    let R: Point;
    try {
      S = PT(c.body.S, false);
      R = PT(ent.R);
      if (!dhVerify(mh, i, j, parsed.get(j)!.E, R, S, { c: SC(c.body.c), s: SC(c.body.s) })) continue;
    } catch (e) {
      if (e instanceof QvCryptoError) continue;
      throw e;
    }
    let good = false;
    try {
      const y = await decryptShareWithDh(mh, i, j, S, { R: hexToBytes(ent.R, 32), ct: hexToBytes(ent.ct, 32), tag: hexToBytes(ent.tag, 16) });
      good = feldmanVerifyShare(y, parsed.get(i)!.A, j);
    } catch (e) {
      if (!(e instanceof QvCryptoError)) throw e;
    }
    if (good) {
      disq.add(j);
      events.push({ code: 'E_DKG_COMPLAINT', who: j, detail: `false complaint against ${i}` });
    } else {
      disq.add(i);
      events.push({ code: 'E_DKG_COMPLAINT', who: i, detail: `valid complaint by ${j}` });
    }
  }

  const Q = R1.filter((i) => !disq.has(i));
  if (Q.length < t) return err('E_DKG_QUORUM', `|Q|=${Q.length} < t=${t}`);
  const K = pointSum(Q.map((i) => parsed.get(i)!.A[0]!));
  if (K.is0()) return err('E_DKG_FINAL', 'joint key is the identity');
  const Y = new Map<number, Point>();
  for (const j of Q) Y.set(j, pointSum(Q.map((i) => feldmanEval(parsed.get(i)!.A, j))));
  const dealings = new Map<number, ParsedDealing>();
  for (const i of Q) dealings.set(i, parsed.get(i)!);
  const { ctx, transcriptHash } = computeCtx(mh, K, Q, dealings, t, n);
  return ok({ R1, Q, qmask: qmaskOf(Q), K, Y, dealings, transcriptHash, ctx, events });
}

/** Trustee j's final share s_j = sum_{i in Q} y_{i,j}; verified against Y_j before use (Appendix B item 16). */
export function dkgFinalShare(Q: readonly number[], ys: ReadonlyMap<number, Scalar>, Yj: Point): Result<Scalar> {
  let s = 0n;
  for (const i of Q) {
    const y = ys.get(i);
    if (y === undefined) return err('E_DKG_KEYCONF', `missing share from ${i}`);
    s = scalarAdd(s, y);
  }
  return baseMul(s).equals(Yj) ? ok(s) : err('E_DKG_KEYCONF', 'share does not match Y_j');
}

export function dkgKeyconf(ctx: Uint8Array, j: number, Yj: Point, sj: Scalar, rng: Rng): KeyconfBody {
  const p = shareKeyProve(ctx, j, Yj, sj, rng);
  return { proto: PROTO_ID, type: 'dkg-keyconf', j, c: H(scalarToBytes(p.c)), s: H(scalarToBytes(p.s)) };
}
export function verifyKeyconf(ctx: Uint8Array, Yj: Point, body: KeyconfBody): boolean {
  try {
    return shareKeyVerify(ctx, body.j, Yj, { c: SC(body.c), s: SC(body.s) });
  } catch {
    return false;
  }
}
