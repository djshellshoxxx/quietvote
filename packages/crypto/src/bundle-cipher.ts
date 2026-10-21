import { hkdf } from '@noble/hashes/hkdf.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, ctEqual, u8, utf8, wipe } from './bytes.ts';
import { QvCryptoError } from './errors.ts';
import type { Rng } from './rng.ts';

/**
 * Passphrase-encrypted container for local secret files (QV-17 trustee bundles). age-STYLE, not age-compatible:
 * a random 32-byte file key is wrapped under an scrypt-derived key (N = 2^logN, r = 8, p = 1, 16-byte salt) and
 * the payload is AES-256-GCM under HKDF(file key, payload nonce). A fresh file key, salt and nonces are drawn on
 * every seal. The whole header is bound as AAD of both AEAD layers.
 *
 *   magic "QVBUNDL1" | logN u8 | salt 16 | wrapNonce 12 | wrapped 48 | payloadNonce 12 | ct||tag
 */
const MAGIC = utf8('QVBUNDL1');
const HDR = MAGIC.length + 1 + 16 + 12 + 48 + 12;
export const BUNDLE_MIN_LOGN = 18;
export const BUNDLE_MAX_LOGN = 22;
export const BUNDLE_DEFAULT_LOGN = 18;

export interface SealOpts {
  logN?: number;
  /** Extra authenticated (not encrypted) context, e.g. the election id. */
  aad?: Uint8Array;
  /** Test hook: permit logN < 18. Never set in production code. */
  allowWeak?: boolean;
}

async function aesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', new Uint8Array(raw), { name: 'AES-GCM' }, false, [usage]);
}

async function kdf(passphrase: Uint8Array, salt: Uint8Array, logN: number): Promise<Uint8Array> {
  return scryptAsync(passphrase, concatBytes(utf8('qv-bundle-v1'), salt), { N: 2 ** logN, r: 8, p: 1, dkLen: 32, maxmem: 2 ** logN * 8 * 8 * 2 + 4096 });
}

function payloadKey(fileKey: Uint8Array, nonce: Uint8Array): Uint8Array {
  return hkdf(sha256, fileKey, nonce, utf8('qv-bundle-v1/payload'), 32);
}

export async function sealWithPassphrase(plaintext: Uint8Array, passphrase: string, rng: Rng, opts: SealOpts = {}): Promise<Uint8Array> {
  const logN = opts.logN ?? BUNDLE_DEFAULT_LOGN;
  if (!Number.isInteger(logN) || logN > BUNDLE_MAX_LOGN || logN < (opts.allowWeak === true ? 4 : BUNDLE_MIN_LOGN)) throw new QvCryptoError('E_ARG', 'scrypt work factor out of range');
  if (passphrase.length === 0) throw new QvCryptoError('E_ARG', 'empty passphrase');
  const salt = rng.bytes(16);
  const wrapNonce = rng.bytes(12);
  const payloadNonce = rng.bytes(12);
  const fileKey = rng.bytes(32);
  const pw = utf8(passphrase.normalize('NFKC'));
  const wrapKey = await kdf(pw, salt, logN);
  const head = concatBytes(MAGIC, u8(logN), salt, wrapNonce);
  const aad = concatBytes(head, opts.aad ?? new Uint8Array(0));
  const wrapped = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(wrapNonce), additionalData: new Uint8Array(aad), tagLength: 128 }, await aesKey(wrapKey, 'encrypt'), new Uint8Array(fileKey)),
  );
  const hdr = concatBytes(head, wrapped, payloadNonce);
  const pk = payloadKey(fileKey, payloadNonce);
  const body = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: new Uint8Array(concatBytes(hdr, opts.aad ?? new Uint8Array(0))), tagLength: 128 },
      await aesKey(pk, 'encrypt'),
      new Uint8Array(plaintext),
    ),
  );
  wipe(fileKey); wipe(wrapKey); wipe(pw); wipe(pk);
  return concatBytes(hdr, body);
}

/** Throws E_AEAD on a wrong passphrase or any tampering, E_PARSE on a malformed container. */
export async function openWithPassphrase(file: Uint8Array, passphrase: string, opts: Pick<SealOpts, 'aad' | 'allowWeak'> = {}): Promise<Uint8Array> {
  if (file.length < HDR + 16 || !ctEqual(file.subarray(0, MAGIC.length), MAGIC)) throw new QvCryptoError('E_PARSE', 'not a QV bundle');
  const logN = file[MAGIC.length]!;
  if (logN > BUNDLE_MAX_LOGN || logN < (opts.allowWeak === true ? 4 : BUNDLE_MIN_LOGN)) throw new QvCryptoError('E_PARSE', 'unacceptable scrypt work factor');
  let o = MAGIC.length + 1;
  const salt = file.subarray(o, (o += 16));
  const wrapNonce = file.subarray(o, (o += 12));
  const head = file.subarray(0, o);
  const wrapped = file.subarray(o, (o += 48));
  const payloadNonce = file.subarray(o, (o += 12));
  const hdr = file.subarray(0, o);
  const extra = opts.aad ?? new Uint8Array(0);
  const pw = utf8(passphrase.normalize('NFKC'));
  const wrapKey = await kdf(pw, salt, logN);
  let fileKey: Uint8Array;
  try {
    fileKey = new Uint8Array(
      await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(wrapNonce), additionalData: new Uint8Array(concatBytes(head, extra)), tagLength: 128 }, await aesKey(wrapKey, 'decrypt'), new Uint8Array(wrapped)),
    );
  } catch {
    throw new QvCryptoError('E_AEAD', 'wrong passphrase or corrupted bundle');
  } finally {
    wipe(wrapKey); wipe(pw);
  }
  const pk = payloadKey(fileKey, payloadNonce);
  try {
    return new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: new Uint8Array(concatBytes(hdr, extra)), tagLength: 128 },
        await aesKey(pk, 'decrypt'),
        new Uint8Array(file.subarray(o)),
      ),
    );
  } catch {
    throw new QvCryptoError('E_AEAD', 'bundle payload authentication failed');
  } finally {
    wipe(fileKey); wipe(pk);
  }
}
