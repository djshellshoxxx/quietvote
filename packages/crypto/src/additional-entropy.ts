// SPDX-License-Identifier: AGPL-3.0-or-later
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, u64, utf8 } from './bytes.ts';
import { QvCryptoError } from './errors.ts';
import type { Rng } from './rng.ts';

export interface AdditionalEntropyRng extends Rng { destroy(): void }

const INFO = utf8('QuietVote trustee additional entropy v1');
const MAX_BLOCK = 255 * 32; // HKDF-SHA256 expansion limit.
const MAX_REQUEST = 1024 * 1024;

/** QV-17 REQ-012 / N-28: optional local entropy supplements a required CSPRNG.
 * Every expansion block uses 32 freshly requested source bytes as HKDF input key
 * material. The additional entropy's SHA-256 digest is the salt; a local counter
 * separates calls/blocks. This is not a protocol encoding or a deterministic RNG.
 * A missing, malformed, throwing or all-zero source is refused, never replaced by
 * the additional entropy. The zero check is not a general RNG health guarantee.
 */
export function additionalEntropyRng(source: Rng, entropy: Uint8Array): AdditionalEntropyRng {
  if (!(entropy instanceof Uint8Array) || entropy.length === 0 || entropy.length > 8192) {
    throw new QvCryptoError('E_ARG', 'additional entropy must contain 1 to 8192 bytes');
  }
  const salt = sha256(entropy);
  let counter = 0n;
  let destroyed = false;
  return {
    bytes(n: number): Uint8Array {
      if (destroyed || !Number.isSafeInteger(n) || n < 0 || n > MAX_REQUEST) {
        throw new QvCryptoError('E_ARG', 'additional entropy RNG is closed or the request is out of bounds');
      }
      const output = new Uint8Array(n);
      try {
        for (let offset = 0; offset < n; offset += MAX_BLOCK) {
          let fresh: Uint8Array | undefined, expanded: Uint8Array | undefined;
          try {
            fresh = source.bytes(32);
            if (!(fresh instanceof Uint8Array) || fresh.length !== 32 || counter > 0xffff_ffff_ffff_ffffn) {
              throw new Error('source unavailable');
            }
            let nonzero = 0;
            for (const byte of fresh) nonzero |= byte;
            if (nonzero === 0) throw new Error('source unavailable');
            expanded = hkdf(sha256, fresh, salt, concatBytes(INFO, u64(counter++)), Math.min(MAX_BLOCK, n - offset));
            output.set(expanded, offset);
          } finally { fresh?.fill(0); expanded?.fill(0); }
        }
        return output;
      } catch {
        output.fill(0);
        throw new QvCryptoError('E_ARG', 'required randomness source is unavailable');
      }
    },
    destroy(): void { destroyed = true; salt.fill(0); },
  };
}
