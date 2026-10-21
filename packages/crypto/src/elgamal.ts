import {
  G,
  IDENTITY,
  baseMul,
  pointAdd,
  pointMul,
  pointSub,
  pointSum,
  type Point,
  type Scalar,
} from './ristretto.ts';

/** Exponential ElGamal ciphertext: A = [r]G, B = [m]G + [r]K. */
export interface Ciphertext {
  A: Point;
  B: Point;
}

export function elgamalEncrypt(K: Point, m: bigint | number, r: Scalar): Ciphertext {
  if (r === 0n) throw new Error('ElGamal randomness must be non-zero');
  return { A: baseMul(r), B: pointAdd(baseMul(BigInt(m)), pointMul(K, r)) };
}

export function ctAdd(x: Ciphertext, y: Ciphertext): Ciphertext {
  return { A: pointAdd(x.A, y.A), B: pointAdd(x.B, y.B) };
}
export function ctSum(cts: readonly Ciphertext[]): Ciphertext {
  return { A: pointSum(cts.map((c) => c.A)), B: pointSum(cts.map((c) => c.B)) };
}
export const ctZero = (): Ciphertext => ({ A: IDENTITY, B: IDENTITY });

/** Decrypt to the group element [m]G given the full secret x (tests only; production uses threshold shares). */
export function elgamalDecryptToPoint(ct: Ciphertext, x: Scalar): Point {
  return pointSub(ct.B, pointMul(ct.A, x));
}

export { G };
