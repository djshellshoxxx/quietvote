import {
  IDENTITY,
  ORDER,
  baseMul,
  pointAdd,
  pointMul,
  pointSum,
  scalarAdd,
  scalarFromInt,
  scalarInv,
  scalarMod,
  scalarMul,
  scalarSub,
  type Point,
  type Scalar,
} from './ristretto.ts';
import { QvCryptoError } from './errors.ts';

/** f(x) = sum_k coeffs[k] x^k mod l, Horner. */
export function polyEval(coeffs: readonly Scalar[], x: number): Scalar {
  const xs = scalarFromInt(x);
  let acc = 0n;
  for (let k = coeffs.length - 1; k >= 0; k--) acc = scalarAdd(scalarMul(acc, xs), coeffs[k]!);
  return acc;
}

/** Feldman commitments A_k = [a_k]G. */
export function feldmanCommit(coeffs: readonly Scalar[]): Point[] {
  return coeffs.map((a) => baseMul(a));
}

/** sum_k [j^k] A_k by Horner on points. */
export function feldmanEval(commitments: readonly Point[], j: number): Point {
  if (commitments.length === 0) return IDENTITY;
  const js = scalarFromInt(j);
  let P = commitments[commitments.length - 1]!;
  for (let k = commitments.length - 2; k >= 0; k--) P = pointAdd(pointMul(P, js), commitments[k]!);
  return P;
}

/** Equation (F): [y]G == sum_k [j^k] A_k. */
export function feldmanVerifyShare(y: Scalar, commitments: readonly Point[], j: number): boolean {
  if (y < 0n || y >= ORDER) return false;
  return baseMul(y).equals(feldmanEval(commitments, j));
}

/** Public key share Y_j = sum over dealers of feldmanEval(A_i, j). */
export function publicKeyShare(dealerCommitments: readonly (readonly Point[])[], j: number): Point {
  return pointSum(dealerCommitments.map((c) => feldmanEval(c, j)));
}

/** Lagrange coefficient at 0 for index j within index set S: prod_{m in S, m != j} m / (m - j). */
export function lagrangeAtZero(S: readonly number[], j: number): Scalar {
  if (!S.includes(j)) throw new QvCryptoError('E_ARG', 'j not in S');
  if (new Set(S).size !== S.length) throw new QvCryptoError('E_ARG', 'duplicate index');
  let num = 1n;
  let den = 1n;
  for (const m of S) {
    if (m === j) continue;
    if (m <= 0 || j <= 0) throw new QvCryptoError('E_ARG', 'index must be >= 1');
    num = scalarMul(num, scalarFromInt(m));
    den = scalarMul(den, scalarSub(scalarFromInt(m), scalarFromInt(j)));
  }
  return scalarMul(num, scalarInv(den));
}

/** Combine partial decryption shares M_j for indices S: sum [lambda_j] M_j. */
export function combineShares(S: readonly number[], shares: ReadonlyMap<number, Point>): Point {
  let acc = IDENTITY;
  for (const j of S) {
    const M = shares.get(j);
    if (M === undefined) throw new QvCryptoError('E_ARG', `missing share ${j}`);
    acc = pointAdd(acc, pointMul(M, lagrangeAtZero(S, j)));
  }
  return acc;
}

/** Reconstruct the secret from scalar shares (tests / recovery). */
export function reconstructSecret(S: readonly number[], shares: ReadonlyMap<number, Scalar>): Scalar {
  let acc = 0n;
  for (const j of S) {
    const y = shares.get(j);
    if (y === undefined) throw new QvCryptoError('E_ARG', `missing share ${j}`);
    acc = scalarMod(acc + y * lagrangeAtZero(S, j));
  }
  return acc;
}
