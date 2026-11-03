import { u8, u16, u32, utf8 } from './bytes.ts';
import { QvCryptoError } from './errors.ts';
import type { Rng } from './rng.ts';
import { hs, hsNz } from './transcript.ts';
import {
  G,
  ORDER,
  baseMul,
  isIdentity,
  pointMul,
  pointSub,
  pointToBytes,
  scalarAdd,
  scalarMul,
  scalarRandomNonZero,
  scalarSub,
  scalarToBytes,
  type Point,
  type Scalar,
} from './ristretto.ts';
import type { Ciphertext } from './elgamal.ts';

/** (c, s) compact proof (commitments are recomputed by the verifier, never transmitted). */
export interface CompactProof {
  c: Scalar;
  s: Scalar;
}

const pt = pointToBytes;
const sc = scalarToBytes;
const inRange = (x: Scalar): boolean => typeof x === 'bigint' && x >= 0n && x < ORDER;

function guard(fn: () => boolean): boolean {
  try {
    return fn();
  } catch (e) {
    if (e instanceof QvCryptoError) return false;
    throw e;
  }
}

/** a' = [s]B1 - [c]X1 */
function commit(B1: Point, X1: Point, c: Scalar, s: Scalar): Point {
  return pointSub(pointMul(B1, s), pointMul(X1, c));
}

// ------------------------------------------------------------------ Schnorr PoK (DKG, §5.7.2)

export function pokProve(manifestHash: Uint8Array, i: number, k: number, a: Scalar, A: Point, rng: Rng): CompactProof {
  const u = scalarRandomNonZero(rng);
  const R = baseMul(u);
  const c = hs('pok', manifestHash, u8(i), u16(k), pt(A), pt(R));
  return { c, s: scalarAdd(u, scalarMul(c, a)) };
}

export function pokVerify(manifestHash: Uint8Array, i: number, k: number, A: Point, proof: CompactProof): boolean {
  return guard(() => {
    if (isIdentity(A) || !inRange(proof.c) || !inRange(proof.s)) return false;
    const R = commit(G, A, proof.c, proof.s);
    return proof.c === hs('pok', manifestHash, u8(i), u16(k), pt(A), pt(R));
  });
}

// ------------------------------------------------------------------ Schnorr PoK of final share (§5.7.8)

export function shareKeyProve(ctx: Uint8Array, j: number, Yj: Point, sj: Scalar, rng: Rng): CompactProof {
  const u = scalarRandomNonZero(rng);
  const R = baseMul(u);
  const c = hs('pok-share', ctx, u8(j), pt(Yj), pt(R));
  return { c, s: scalarAdd(u, scalarMul(c, sj)) };
}

export function shareKeyVerify(ctx: Uint8Array, j: number, Yj: Point, proof: CompactProof): boolean {
  return guard(() => {
    if (isIdentity(Yj) || !inRange(proof.c) || !inRange(proof.s)) return false;
    const R = commit(G, Yj, proof.c, proof.s);
    return proof.c === hs('pok-share', ctx, u8(j), pt(Yj), pt(R));
  });
}

// ------------------------------------------------------------------ DH-reveal DLEQ for complaints (§5.7.5)

/** Proves log_G(Ej) == log_R(S). */
export function dhProve(mh: Uint8Array, i: number, j: number, Ej: Point, R: Point, S: Point, ej: Scalar, rng: Rng): CompactProof {
  const u = scalarRandomNonZero(rng);
  const a1 = baseMul(u);
  const a2 = pointMul(R, u);
  const c = hs('cp-dh', mh, u8(i), u8(j), pt(Ej), pt(R), pt(S), pt(a1), pt(a2));
  return { c, s: scalarAdd(u, scalarMul(c, ej)) };
}

export function dhVerify(mh: Uint8Array, i: number, j: number, Ej: Point, R: Point, S: Point, proof: CompactProof): boolean {
  return guard(() => {
    if (!inRange(proof.c) || !inRange(proof.s)) return false;
    const a1 = commit(G, Ej, proof.c, proof.s);
    const a2 = commit(R, S, proof.c, proof.s);
    return proof.c === hs('cp-dh', mh, u8(i), u8(j), pt(Ej), pt(R), pt(S), pt(a1), pt(a2));
  });
}

// ------------------------------------------------------------------ CDS 0/1 (§5.10.1)

export interface CdsProof {
  c0: Scalar;
  s0: Scalar;
  c1: Scalar;
  s1: Scalar;
}

export interface CdsStatement {
  ctx: Uint8Array;
  binder: Uint8Array;
  cid: string;
  oid: string;
  K: Point;
  ct: Ciphertext;
}

function cdsChallenge(st: CdsStatement, a0: Point, b0: Point, a1: Point, b1: Point): Scalar {
  return hs('cds01', st.ctx, st.binder, utf8(st.cid), utf8(st.oid), pt(st.K), pt(st.ct.A), pt(st.ct.B), pt(a0), pt(b0), pt(a1), pt(b1));
}

/** Deterministic CDS prover: all nonces derive from the 64-byte ballot seed xi (§5.11). */
export function cdsProve(st: CdsStatement, m: 0 | 1, r: Scalar, xi: Uint8Array): CdsProof {
  const cidB = utf8(st.cid);
  const oidB = utf8(st.oid);
  const w = hsNz('proof-w', xi, cidB, oidB, u8(m));
  const cSim = hs('proof-csim', xi, cidB, oidB);
  const sSim = hs('proof-ssim', xi, cidB, oidB);
  const { A, B } = st.ct;
  const beta = [B, pointSub(B, G)] as const;
  const real = m;
  const sim = (1 - m) as 0 | 1;
  const aReal = baseMul(w);
  const bReal = pointMul(st.K, w);
  const aSim = commit(G, A, cSim, sSim);
  const bSim = commit(st.K, beta[sim], cSim, sSim);
  const a = real === 0 ? [aReal, aSim] : [aSim, aReal];
  const b = real === 0 ? [bReal, bSim] : [bSim, bReal];
  const c = cdsChallenge(st, a[0]!, b[0]!, a[1]!, b[1]!);
  const cReal = scalarSub(c, cSim);
  const sReal = scalarAdd(w, scalarMul(cReal, r));
  return real === 0 ? { c0: cReal, s0: sReal, c1: cSim, s1: sSim } : { c0: cSim, s0: sSim, c1: cReal, s1: sReal };
}

export function cdsVerify(st: CdsStatement, p: CdsProof): boolean {
  return guard(() => {
    if (![p.c0, p.s0, p.c1, p.s1].every(inRange)) return false;
    if (isIdentity(st.ct.A) || isIdentity(st.ct.B) || isIdentity(st.K)) return false;
    const beta1 = pointSub(st.ct.B, G);
    const a0 = commit(G, st.ct.A, p.c0, p.s0);
    const b0 = commit(st.K, st.ct.B, p.c0, p.s0);
    const a1 = commit(G, st.ct.A, p.c1, p.s1);
    const b1 = commit(st.K, beta1, p.c1, p.s1);
    const c = cdsChallenge(st, a0, b0, a1, b1);
    return scalarAdd(p.c0, p.c1) === c;
  });
}

// ------------------------------------------------------------------ selection-limit proof (§5.10.2)

export interface LimitStatement {
  ctx: Uint8Array;
  binder: Uint8Array;
  cid: string;
  L: number;
  K: Point;
  /** Sum of all alpha / beta of the contest (real + placeholders). */
  Asum: Point;
  Bsum: Point;
}

function limitChallenge(st: LimitStatement, a: Point, b: Point): Scalar {
  return hs('cp-limit', st.ctx, st.binder, utf8(st.cid), u32(st.L), pt(st.K), pt(st.Asum), pt(st.Bsum), pt(a), pt(b));
}

export function limitProve(st: LimitStatement, R: Scalar, xi: Uint8Array): CompactProof {
  const u = hsNz('limit-w', xi, utf8(st.cid));
  const a = baseMul(u);
  const b = pointMul(st.K, u);
  const c = limitChallenge(st, a, b);
  return { c, s: scalarAdd(u, scalarMul(c, R)) };
}

export function limitVerify(st: LimitStatement, p: CompactProof): boolean {
  return guard(() => {
    if (!inRange(p.c) || !inRange(p.s) || isIdentity(st.K)) return false;
    const a = commit(G, st.Asum, p.c, p.s);
    const b = commit(st.K, pointSub(st.Bsum, baseMul(BigInt(st.L))), p.c, p.s);
    return p.c === limitChallenge(st, a, b);
  });
}

// ------------------------------------------------------------------ partial decryption (§5.16)

export interface DecStatement {
  ctx: Uint8Array;
  cid: string;
  oid: string;
  j: number;
  Yj: Point;
  A: Point;
  B: Point;
  M: Point;
}

function decChallenge(st: DecStatement, a: Point, b: Point): Scalar {
  return hs('cp-dec', st.ctx, utf8(st.cid), utf8(st.oid), u8(st.j), pt(st.Yj), pt(st.A), pt(st.B), pt(st.M), pt(a), pt(b));
}

/** Computes M = [s_j]A and the Chaum-Pedersen proof; nonce is hedged (secret, ctx, ids, 32 CSPRNG bytes). */
export function decProve(
  st: Omit<DecStatement, 'M'>,
  sj: Scalar,
  rng: Rng,
): { M: Point; proof: CompactProof } {
  const M = pointMul(st.A, sj);
  const full: DecStatement = { ...st, M };
  const u = hsNz('cp-dec-nonce', sc(sj), st.ctx, utf8(st.cid), utf8(st.oid), rng.bytes(32));
  const a = baseMul(u);
  const b = pointMul(st.A, u);
  const c = decChallenge(full, a, b);
  return { M, proof: { c, s: scalarAdd(u, scalarMul(c, sj)) } };
}

export function decVerify(st: DecStatement, p: CompactProof): boolean {
  return guard(() => {
    if (!inRange(p.c) || !inRange(p.s)) return false;
    const a = commit(G, st.Yj, p.c, p.s);
    const b = commit(st.A, st.M, p.c, p.s);
    return p.c === decChallenge(st, a, b);
  });
}

export interface SpoilDecStatement {
  ctx: Uint8Array;
  ballotCode: Uint8Array;
  cid: string;
  oid: string;
  j: number;
  Yj: Point;
  alpha: Point;
  beta: Point;
  M: Point;
}

function spoilChallenge(st: SpoilDecStatement, a: Point, b: Point): Scalar {
  return hs(
    'cp-dec-spoil',
    st.ctx,
    st.ballotCode,
    utf8(st.cid),
    utf8(st.oid),
    u8(st.j),
    pt(st.Yj),
    pt(st.alpha),
    pt(st.beta),
    pt(st.M),
    pt(a),
    pt(b),
  );
}

export function spoilDecProve(
  st: Omit<SpoilDecStatement, 'M'>,
  sj: Scalar,
  rng: Rng,
): { M: Point; proof: CompactProof } {
  const M = pointMul(st.alpha, sj);
  const full: SpoilDecStatement = { ...st, M };
  // The registry's cp-dec-nonce field list is (s_j, ctx, cid, oid, rand32); for spoiled ballots the ballot
  // code is appended to the oid field so a failed RNG cannot repeat u across different ballots (erratum E-12).
  const oidField = new Uint8Array([...utf8(st.oid), 0, ...st.ballotCode]);
  const u = hsNz('cp-dec-nonce', sc(sj), st.ctx, utf8(st.cid), oidField, rng.bytes(32));
  const a = baseMul(u);
  const b = pointMul(st.alpha, u);
  const c = spoilChallenge(full, a, b);
  return { M, proof: { c, s: scalarAdd(u, scalarMul(c, sj)) } };
}

export function spoilDecVerify(st: SpoilDecStatement, p: CompactProof): boolean {
  return guard(() => {
    if (!inRange(p.c) || !inRange(p.s)) return false;
    const a = commit(G, st.Yj, p.c, p.s);
    const b = commit(st.alpha, st.M, p.c, p.s);
    return p.c === spoilChallenge(st, a, b);
  });
}
