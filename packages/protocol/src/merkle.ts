import { concatBytes, sha256 } from '@quietvote/crypto';

/** RFC 9162 §2.1.1 leaf and node hashing. */
export const leafHash = (data: Uint8Array): Uint8Array => sha256(concatBytes(Uint8Array.of(0), data));
export const nodeHash = (l: Uint8Array, r: Uint8Array): Uint8Array => sha256(concatBytes(Uint8Array.of(1), l, r));
const EMPTY = sha256(new Uint8Array(0));

/** Merkle tree hash over already-hashed leaves; unbalanced split at the largest power of two < n. */
export function mth(leafHashes: readonly Uint8Array[]): Uint8Array {
  const n = leafHashes.length;
  if (n === 0) return EMPTY;
  if (n === 1) return leafHashes[0]!;
  let k = 1;
  while (k * 2 < n) k *= 2;
  return nodeHash(mth(leafHashes.slice(0, k)), mth(leafHashes.slice(k)));
}
