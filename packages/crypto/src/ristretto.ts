import { ristretto255 } from '@noble/curves/ed25519.js';
import { QvCryptoError } from './errors.ts';
import { bigintToLe, leToBigint } from './bytes.ts';
import type { Rng } from './rng.ts';

const RP = ristretto255.Point;
export type Point = InstanceType<typeof RP>;
/** A scalar is a bigint in [0, ORDER). */
export type Scalar = bigint;

/** Prime order of ristretto255 (RFC 9496). */
export const ORDER: bigint = RP.Fn.ORDER;
export const G: Point = RP.BASE;
export const IDENTITY: Point = RP.ZERO;

// ---------------------------------------------------------------- scalars

export function scalarMod(x: bigint): Scalar {
  const r = x % ORDER;
  return r < 0n ? r + ORDER : r;
}
export const scalarAdd = (a: Scalar, b: Scalar): Scalar => scalarMod(a + b);
export const scalarSub = (a: Scalar, b: Scalar): Scalar => scalarMod(a - b);
export const scalarMul = (a: Scalar, b: Scalar): Scalar => scalarMod(a * b);
export const scalarNeg = (a: Scalar): Scalar => scalarMod(-a);

/** Modular inverse by extended Euclid; throws on zero. Not constant time (callers use it on public data only). */
export function scalarInv(a: Scalar): Scalar {
  const x = scalarMod(a);
  if (x === 0n) throw new QvCryptoError('E_ARG', 'inverse of zero');
  let [r0, r1] = [ORDER, x];
  let [t0, t1] = [0n, 1n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return scalarMod(t0);
}

/** Strict decode: exactly 32 bytes little-endian and < ORDER. Never reduces (QV-16-REQ-002). */
export function scalarFromBytes(b: Uint8Array): Scalar {
  if (!(b instanceof Uint8Array) || b.length !== 32) throw new QvCryptoError('E_LENGTH', 'scalar must be 32 bytes');
  const x = leToBigint(b);
  if (x >= ORDER) throw new QvCryptoError('E_SCALAR_RANGE', 'scalar >= l');
  return x;
}
export function scalarToBytes(s: Scalar): Uint8Array {
  if (s < 0n || s >= ORDER) throw new QvCryptoError('E_SCALAR_RANGE', 'scalar out of range');
  return bigintToLe(s, 32);
}
/** Wide reduction of exactly 64 bytes (bias ~2^-259). */
export function scalarFromWide(b: Uint8Array): Scalar {
  if (b.length !== 64) throw new QvCryptoError('E_LENGTH', 'wide reduction needs 64 bytes');
  return scalarMod(leToBigint(b));
}
/** Uniform non-zero scalar from the injected RNG; resamples on zero (QV-16-REQ-003). */
export function scalarRandomNonZero(rng: Rng): Scalar {
  for (let i = 0; i < 64; i++) {
    const s = scalarFromWide(rng.bytes(64));
    if (s !== 0n) return s;
  }
  throw new QvCryptoError('E_ARG', 'rng produced only zero scalars');
}
export function scalarFromInt(n: number): Scalar {
  if (!Number.isSafeInteger(n) || n < 0) throw new QvCryptoError('E_ARG', 'bad small int');
  return scalarMod(BigInt(n));
}

// ---------------------------------------------------------------- points

export function pointToBytes(p: Point): Uint8Array {
  return p.toBytes();
}

export interface DecodeOpts {
  /** Reject the identity element (protocol "non-identity" rule). Default false. */
  nonIdentity?: boolean;
}

/** Strict RFC 9496 decode: canonical, non-negative, square ratio; length exactly 32. */
export function pointFromBytes(b: Uint8Array, opts: DecodeOpts = {}): Point {
  if (!(b instanceof Uint8Array) || b.length !== 32) throw new QvCryptoError('E_POINT_DECODE', 'point must be 32 bytes');
  let p: Point;
  try {
    p = RP.fromBytes(b);
  } catch {
    throw new QvCryptoError('E_POINT_DECODE', 'invalid ristretto255 encoding');
  }
  // Defence in depth: the encoding must round-trip exactly (canonical form).
  const re = p.toBytes();
  for (let i = 0; i < 32; i++) if (re[i] !== b[i]) throw new QvCryptoError('E_POINT_DECODE', 'non-canonical encoding');
  if (opts.nonIdentity === true && p.is0()) throw new QvCryptoError('E_IDENTITY', 'identity not allowed');
  return p;
}

export const pointAdd = (a: Point, b: Point): Point => a.add(b);
export const pointSub = (a: Point, b: Point): Point => a.subtract(b);
export const pointNeg = (a: Point): Point => a.negate();
export const pointEq = (a: Point, b: Point): boolean => a.equals(b);
export const isIdentity = (a: Point): boolean => a.is0();

/** Scalar multiplication; handles the zero scalar (noble's `multiply` rejects 0). */
export function pointMul(p: Point, k: Scalar): Point {
  const s = scalarMod(k);
  if (s === 0n) return IDENTITY;
  return p.multiply(s);
}
export function baseMul(k: Scalar): Point {
  return pointMul(G, k);
}
export function pointSum(ps: readonly Point[]): Point {
  let acc = IDENTITY;
  for (const p of ps) acc = acc.add(p);
  return acc;
}
