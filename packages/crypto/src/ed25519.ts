import { ed25519 } from '@noble/curves/ed25519.js';

export interface Ed25519Keypair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function ed25519Keypair(seed?: Uint8Array): Ed25519Keypair {
  const secretKey = seed ?? ed25519.utils.randomSecretKey();
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

export function ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey);
}

/**
 * Strict public key / R-point check: canonical encoding (re-encodes identically), on the curve, and not of
 * small order (QV-16-REQ-016). This is a stricter policy than RFC 8032's minimum, chosen so that every
 * verifier agrees (QV-16 §5.12.2).
 */
export function ed25519IsStrictPoint(bytes: Uint8Array): boolean {
  try {
    if (bytes.length !== 32) return false;
    const P = ed25519.Point.fromBytes(bytes, false);
    const re = P.toBytes();
    for (let i = 0; i < 32; i++) if (re[i] !== bytes[i]) return false;
    return !P.isSmallOrder();
  } catch {
    return false;
  }
}

/** Strict verification (ZIP-215 off): rejects non-canonical S/A/R encodings and small-order A or R. */
export function ed25519Verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): boolean {
  try {
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    if (!ed25519IsStrictPoint(publicKey) || !ed25519IsStrictPoint(signature.subarray(0, 32))) return false;
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
