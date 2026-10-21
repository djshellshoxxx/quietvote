// Voter key files. Protected form = QVKEY1 (Argon2id + AES-256-GCM wrapped seed, QV-19 section 5.3), the same container the
// web client writes, so a key made here can be imported there. The unprotected form exists only behind --no-passphrase.
import {
  argon2idKdfAsync, bytesToHex, ed25519Keypair, hexToBytes, isHex, jcs, parseQvJson, sha256, utf8, wipe, type Rng,
} from '@quietvote/crypto';
import { InputError, UsageError } from './args.ts';

export interface KdfParams { m: number; t: number; p: number }
export const DEFAULT_PARAMS: Readonly<KdfParams> = Object.freeze({ m: 65536, t: 3, p: 1 });
export const FLOOR_PARAMS: Readonly<KdfParams> = Object.freeze({ m: 19456, t: 2, p: 1 });
export const CEILING_PARAMS: Readonly<KdfParams> = Object.freeze({ m: 262144, t: 10, p: 4 });
export const MIN_PASSPHRASE_CHARS = 12;
export const PLAIN_FORMAT = 'qv-voter-key/v1';

export interface QvKey1 {
  v: 1; kdf: 'argon2id'; m: number; t: number; p: number; salt: string; aead: 'A256GCM'; iv: string; aad: string; ct: string; keyId: string;
}

export const keyIdOf = (publicKey: Uint8Array): string => bytesToHex(sha256(publicKey).slice(0, 8));
const aadFor = (keyId: string): string => `qv-key-v1|${keyId}`;
/** NFKC only: the web client additionally folds word-list passphrases (lower-case, single spaces), which is not replicated here. */
const canon = (s: string): string => s.normalize('NFKC');

export function validateParams(prm: KdfParams): void {
  if (![prm.m, prm.t, prm.p].every(Number.isInteger)) throw new UsageError('KDF parameters must be integers');
  if (prm.m < FLOOR_PARAMS.m || prm.t < FLOOR_PARAMS.t || prm.p < 1) throw new UsageError('KDF parameters are below the floor (m >= 19456 KiB, t >= 2)');
  if (prm.m > CEILING_PARAMS.m || prm.t > CEILING_PARAMS.t || prm.p > CEILING_PARAMS.p) throw new UsageError('KDF parameters exceed the ceiling');
}

async function kek(passphrase: string, salt: Uint8Array, prm: KdfParams): Promise<CryptoKey> {
  const pw = utf8(canon(passphrase));
  try {
    const raw = await argon2idKdfAsync(pw, salt, { ...prm, dkLen: 32 });
    const k = await globalThis.crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
    wipe(raw);
    return k;
  } finally {
    wipe(pw);
  }
}

export async function wrapSeed(seed: Uint8Array, passphrase: string, rng: Rng, prm: KdfParams = DEFAULT_PARAMS): Promise<QvKey1> {
  validateParams(prm);
  if ([...passphrase].length < MIN_PASSPHRASE_CHARS) throw new UsageError(`passphrase must have at least ${MIN_PASSPHRASE_CHARS} characters`);
  const publicKey = ed25519Keypair(seed).publicKey;
  const keyId = keyIdOf(publicKey);
  const salt = rng.bytes(16);
  const iv = rng.bytes(12);
  const key = await kek(passphrase, salt, prm);
  const plain = new Uint8Array(64);
  plain.set(seed, 0);
  plain.set(publicKey, 32);
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: utf8(aadFor(keyId)) as BufferSource }, key, plain as BufferSource));
  wipe(plain);
  return { v: 1, kdf: 'argon2id', m: prm.m, t: prm.t, p: prm.p, salt: bytesToHex(salt), aead: 'A256GCM', iv: bytesToHex(iv), aad: aadFor(keyId), ct: bytesToHex(ct), keyId };
}

export const serialize = (c: QvKey1): string => new TextDecoder().decode(jcs(c)) + '\n';

export function parseContainer(v: unknown): QvKey1 {
  const o = v as Partial<Record<keyof QvKey1, unknown>> | null;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) throw new InputError('not a QVKEY1 file');
  const allowed = new Set(['v', 'kdf', 'm', 't', 'p', 'salt', 'aead', 'iv', 'aad', 'ct', 'keyId']);
  for (const k of Object.keys(o)) if (!allowed.has(k)) throw new InputError(`QVKEY1: unknown field ${k}`);
  if (o.v !== 1 || o.kdf !== 'argon2id' || o.aead !== 'A256GCM') throw new InputError('QVKEY1: unsupported container version');
  if (typeof o.m !== 'number' || typeof o.t !== 'number' || typeof o.p !== 'number') throw new InputError('QVKEY1: bad parameters');
  if (!isHex(o.salt, 16) || !isHex(o.iv, 12) || !isHex(o.keyId, 8) || !isHex(o.ct, 80)) throw new InputError('QVKEY1: bad field encoding');
  if (o.aad !== aadFor(o.keyId)) throw new InputError('QVKEY1: bad aad');
  try {
    validateParams({ m: o.m, t: o.t, p: o.p });
  } catch (e) {
    throw new InputError(`QVKEY1: ${(e as Error).message}`);
  }
  return o as QvKey1;
}

export async function unwrapSeed(c: QvKey1, passphrase: string): Promise<{ seed: Uint8Array; publicKey: Uint8Array }> {
  const key = await kek(passphrase, hexToBytes(c.salt, 16), { m: c.m, t: c.t, p: c.p });
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(c.iv, 12) as BufferSource, additionalData: utf8(c.aad) as BufferSource }, key, hexToBytes(c.ct, 80) as BufferSource));
  } catch {
    throw new InputError('wrong passphrase or damaged key file');
  }
  const seed = plain.slice(0, 32);
  const stored = plain.slice(32, 64);
  wipe(plain);
  const derived = ed25519Keypair(seed).publicKey;
  if (!derived.every((b, i) => b === stored[i]) || keyIdOf(derived) !== c.keyId) {
    wipe(seed);
    throw new InputError('key file is inconsistent');
  }
  return { seed, publicKey: derived };
}

export function parseKeyJson(text: string): unknown {
  try {
    return parseQvJson(text);
  } catch {
    throw new InputError('key file is not valid JSON');
  }
}
