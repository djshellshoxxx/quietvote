import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, u8, utf8 } from './bytes.ts';
import { QvCryptoError } from './errors.ts';
import type { Rng } from './rng.ts';
import {
  baseMul,
  pointFromBytes,
  pointMul,
  pointToBytes,
  scalarFromBytes,
  scalarRandomNonZero,
  scalarToBytes,
  type Point,
  type Scalar,
} from './ristretto.ts';

export interface EncryptedShare {
  R: Uint8Array; // 32
  ct: Uint8Array; // 32
  tag: Uint8Array; // 16
}

const ZERO_IV = new Uint8Array(12);

function deriveKey(mh: Uint8Array, S: Point, i: number, j: number, R: Uint8Array): Uint8Array {
  const info = concatBytes(utf8('qv1-r255-sha2/dkg-share'), u8(i), u8(j), R);
  return hkdf(sha256, pointToBytes(S), mh, info, 32);
}
function aad(mh: Uint8Array, i: number, j: number, R: Uint8Array): Uint8Array {
  return concatBytes(mh, u8(i), u8(j), R);
}

async function aes(key: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [usage]);
}

/** §5.7.4: ephemeral-static DH to E_j, HKDF-SHA-256, AES-256-GCM with a single-use key and zero IV. */
export async function encryptShare(
  mh: Uint8Array,
  i: number,
  j: number,
  Ej: Point,
  y: Scalar,
  rng: Rng,
): Promise<EncryptedShare> {
  const r = scalarRandomNonZero(rng);
  const R = pointToBytes(baseMul(r));
  const S = pointMul(Ej, r);
  const key = await aes(deriveKey(mh, S, i, j, R), 'encrypt');
  const out = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ZERO_IV, additionalData: aad(mh, i, j, R), tagLength: 128 },
      key,
      scalarToBytes(y),
    ),
  );
  return { R, ct: out.slice(0, 32), tag: out.slice(32) };
}

/**
 * Decrypts given the DH value S (= [e_j]R, or the value revealed in a complaint).
 * Throws E_AEAD on authentication failure and E_SCALAR_RANGE on a non-canonical plaintext.
 */
export async function decryptShareWithDh(mh: Uint8Array, i: number, j: number, S: Point, pkg: EncryptedShare): Promise<Scalar> {
  if (pkg.ct.length !== 32 || pkg.tag.length !== 16 || pkg.R.length !== 32) throw new QvCryptoError('E_LENGTH', 'bad share package');
  const key = await aes(deriveKey(mh, S, i, j, pkg.R), 'decrypt');
  let pt: Uint8Array;
  try {
    pt = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ZERO_IV, additionalData: aad(mh, i, j, pkg.R), tagLength: 128 },
        key,
        concatBytes(pkg.ct, pkg.tag),
      ),
    );
  } catch {
    throw new QvCryptoError('E_AEAD', 'share authentication failed');
  }
  return scalarFromBytes(pt);
}

export async function decryptShare(mh: Uint8Array, i: number, j: number, ej: Scalar, pkg: EncryptedShare): Promise<Scalar> {
  const R = pointFromBytes(pkg.R, { nonIdentity: true });
  return decryptShareWithDh(mh, i, j, pointMul(R, ej), pkg);
}
