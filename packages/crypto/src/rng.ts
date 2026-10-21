import { sha512 } from '@noble/hashes/sha2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { concatBytes, u64, utf8 } from './bytes.ts';

/** Injected randomness source (QV-30 S7). Production: {@link systemRng}. */
export interface Rng {
  bytes(n: number): Uint8Array;
}

/** CSPRNG: `globalThis.crypto.getRandomValues` only. Never Math.random. */
export const systemRng: Rng = {
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    // getRandomValues is limited to 65536 bytes per call.
    for (let o = 0; o < n; o += 65536) globalThis.crypto.getRandomValues(out.subarray(o, Math.min(n, o + 65536)));
    return out;
  },
};

/** Deterministic counter-mode stream RNG (SHA-512) for tests and vector generation ONLY. */
export function streamRng(seed: Uint8Array | string): Rng {
  const s = typeof seed === 'string' ? utf8(seed) : seed;
  let counter = 0n;
  let buf = new Uint8Array(0);
  return {
    bytes(n: number): Uint8Array {
      while (buf.length < n) {
        buf = concatBytes(buf, sha512(concatBytes(utf8('QV-STREAM-RNG'), s, u64(counter))));
        counter++;
      }
      const out = buf.slice(0, n);
      buf = buf.slice(n);
      return out;
    },
  };
}

/** A deliberately broken RNG that always returns the same byte; used to test hedging (REQ-013). */
export function constantRng(byte = 0): Rng {
  return { bytes: (n: number) => new Uint8Array(n).fill(byte) };
}

/** QV-34 §8.1 `vecrng-v1`: HKDF-SHA256(salt = SHA-256("QuietVote test vectors v1"), ikm = id, info = label). */
export function vecrng(vectorId: string, label: string, n: number): Uint8Array {
  const salt = sha256(utf8('QuietVote test vectors v1'));
  return hkdf(sha256, utf8(vectorId), salt, utf8(label), n);
}
