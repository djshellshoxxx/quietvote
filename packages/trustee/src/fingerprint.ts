import { bytesToHex, concatBytes, lp, sha256, utf8, pointToBytes, type Point } from '@quietvote/crypto';

const C = 'bdfghjklmnprstvz'; // 16 consonants
const V = ['a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'ou']; // 8 vowel groups

export interface Fingerprint {
  words: string[];
  hex: string;
}

/**
 * SAS (QV-17 §8.3): F = SHA-256(lp("QV-TRUSTEE-FPR-v1") || lp(K) || lp(ctx) || lp(manifest hash)); the first 66 bits
 * become 6 pronounceable 11-bit words (consonant, vowel group, consonant). PLACEHOLDER encoding until the published
 * 2048-word list (QV-17 Q4) is chosen; the hex form (first 8 bytes) is authoritative.
 */
export function fingerprintOf(K: Point, ctx: Uint8Array, mh: Uint8Array): Fingerprint {
  const f = sha256(concatBytes(lp(utf8('QV-TRUSTEE-FPR-v1')), lp(pointToBytes(K)), lp(ctx), lp(mh)));
  const words: string[] = [];
  for (let w = 0; w < 6; w++) {
    let v = 0;
    for (let b = 0; b < 11; b++) {
      const bit = w * 11 + b;
      v = (v << 1) | ((f[bit >> 3]! >> (7 - (bit & 7))) & 1);
    }
    words.push(`${C[v >> 7]!}${V[(v >> 4) & 7]!}${C[v & 15]!}`);
  }
  return { words, hex: bytesToHex(f.subarray(0, 8)) };
}
