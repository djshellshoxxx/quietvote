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

/** Strict verification (ZIP-215 off): rejects non-canonical encodings. */
export function ed25519Verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
