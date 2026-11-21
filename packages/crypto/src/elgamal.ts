import {
  G,
  IDENTITY,
  ORDER,
  baseMul,
  isIdentity,
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
  // C4: r must be a canonical non-zero scalar; r = l (or any multiple) would reduce to 0 and give A = O.
  if (typeof r !== 'bigint' || r <= 0n || r >= ORDER) throw new Error('ElGamal randomness must be in [1, l)');
  return { A: baseMul(r), B: pointAdd(baseMul(BigInt(m)), pointMul(K, r)) };
}

/**
 * Add an encryption of zero using fresh caller-supplied randomness in [1, ORDER).
 * The result encrypts the same plaintext with randomness old_r + r (mod ORDER).
 * Refuse cancellation to the identity A, which would reveal the plaintext point;
 * the caller must draw fresh randomness and retry. K must be non-identity.
 * This transforms ciphertexts only: existing proofs and signatures are invalidated
 * and must not be reused. It does not authorize modifying a submitted ballot.
 */
export function elgamalRerandomize(K: Point, ct: Ciphertext, r: Scalar): Ciphertext {
  if (isIdentity(K)) throw new Error('ElGamal key must not be identity');
  const result = ctAdd(ct, elgamalEncrypt(K, 0, r));
  if (isIdentity(result.A)) throw new Error('ElGamal randomness cancels to identity');
  return result;
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
