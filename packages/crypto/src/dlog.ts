import { bytesToHex } from './bytes.ts';
import { G, IDENTITY, baseMul, pointAdd, pointNeg, pointToBytes, type Point } from './ristretto.ts';

export interface DlogTable {
  m: number;
  bound: number;
  baby: Map<string, number>;
  giant: Point; // [-m]G
}

/** Baby-step table for bound V: m = ceil(sqrt(V+1)); entries pt([i]G) -> i (QV-16 §5.18). */
export function dlogTable(bound: number): DlogTable {
  if (!Number.isSafeInteger(bound) || bound < 0 || bound > 2 ** 40) throw new RangeError('dlog bound out of range');
  const m = Math.ceil(Math.sqrt(bound + 1));
  const baby = new Map<string, number>();
  let P = IDENTITY;
  for (let i = 0; i < m; i++) {
    baby.set(bytesToHex(pointToBytes(P)), i);
    P = pointAdd(P, G);
  }
  return { m, bound, baby, giant: pointNeg(baseMul(BigInt(m))) };
}

/**
 * Finds T in [0, bound] with [T]G == D, or null. The caller must still treat null as a failure
 * (never as zero) and the result is explicitly re-verified here.
 */
export function dlogSolve(D: Point, table: DlogTable): number | null {
  let P = D;
  for (let k = 0; k <= table.m; k++) {
    const hit = table.baby.get(bytesToHex(pointToBytes(P)));
    if (hit !== undefined) {
      const T = k * table.m + hit;
      if (T > table.bound) return null;
      return baseMul(BigInt(T)).equals(D) ? T : null;
    }
    P = pointAdd(P, table.giant);
  }
  return null;
}
