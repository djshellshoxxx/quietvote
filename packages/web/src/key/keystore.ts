// QVKEY1 wrapped-seed container (QV-19 §5.3). Only the Argon2id/AES-256-GCM-wrapped seed is ever persisted (QV-ADR-P19-1).
import {
  argon2idKdfAsync, bytesToHex, ed25519Keypair, hexToBytes, isHex, jcs, parseQvJson, sha256, systemRng, utf8,
  type Rng,
} from '@quietvote/crypto';
import { wipe } from '../util/hex.ts';
import { canonicalPassphrase } from './passphrase.ts';

export interface KdfParams {
  m: number;
  t: number;
  p: number;
}
/** QV-19-REQ-004. */
export const DEFAULT_PARAMS: Readonly<KdfParams> = Object.freeze({ m: 65536, t: 3, p: 1 });
export const FLOOR_PARAMS: Readonly<KdfParams> = Object.freeze({ m: 19456, t: 2, p: 1 });
/** Upper bound so a hostile key file cannot make the client allocate unbounded memory. */
export const CEILING_PARAMS: Readonly<KdfParams> = Object.freeze({ m: 262144, t: 10, p: 4 });

export type KeyErrorCode = 'E_KEY_LOCKED' | 'E_KEY_FORMAT' | 'E_KEY_PARAMS' | 'E_KEY_CHECKSUM' | 'E_KEY_MISMATCH';
export class KeyError extends Error {
  readonly code: KeyErrorCode;
  constructor(code: KeyErrorCode, message: string) {
    super(message);
    this.name = 'KeyError';
    this.code = code;
  }
}

export interface QvKey1 {
  v: 1;
  kdf: 'argon2id';
  m: number;
  t: number;
  p: number;
  salt: string;
  aead: 'A256GCM';
  iv: string;
  aad: string;
  ct: string;
  keyId: string;
}

export interface KeystoreDeps {
  rng: Rng;
  kdf: (password: Uint8Array, salt: Uint8Array, prm: KdfParams, onProgress?: (f: number) => void) => Promise<Uint8Array>;
  subtle: SubtleCrypto;
  floor: KdfParams;
}

export function defaultDeps(): KeystoreDeps {
  return {
    rng: systemRng,
    kdf: (pw, salt, prm, onProgress) => argon2idKdfAsync(pw, salt, { ...prm, dkLen: 32 }, onProgress),
    subtle: globalThis.crypto.subtle,
    floor: FLOOR_PARAMS,
  };
}

export const keyIdOf = (publicKey: Uint8Array): string => bytesToHex(sha256(publicKey).slice(0, 8));
const aadFor = (keyId: string): string => `qv-key-v1|${keyId}`;

export function validateParams(prm: KdfParams, floor: KdfParams = FLOOR_PARAMS): void {
  const ints = [prm.m, prm.t, prm.p].every((x) => Number.isInteger(x));
  if (!ints) throw new KeyError('E_KEY_PARAMS', 'KDF parameters must be integers');
  if (prm.m < floor.m || prm.t < floor.t || prm.p < 1) throw new KeyError('E_KEY_PARAMS', 'KDF parameters are below the floor');
  if (prm.m > CEILING_PARAMS.m || prm.t > CEILING_PARAMS.t || prm.p > CEILING_PARAMS.p) {
    throw new KeyError('E_KEY_PARAMS', 'KDF parameters exceed the ceiling');
  }
}

async function importKek(subtle: SubtleCrypto, raw: Uint8Array): Promise<CryptoKey> {
  const k = await subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  wipe(raw);
  return k;
}

export interface WrapResult {
  container: QvKey1;
  params: KdfParams;
  /** True when memory pressure forced the floor parameters; the UI must warn (REQ-005). */
  atFloor: boolean;
}

function isAllocationFailure(e: unknown): boolean {
  return e instanceof RangeError || (e instanceof Error && /memory|alloc/i.test(e.message));
}

/** Wraps a 32-byte Ed25519 seed. The passphrase string is canonicalised (NFKC / word list) before encoding. */
export async function wrapSeed(
  seed: Uint8Array,
  passphrase: string,
  deps: KeystoreDeps = defaultDeps(),
  params: KdfParams = DEFAULT_PARAMS,
  onProgress?: (f: number) => void,
): Promise<WrapResult> {
  if (seed.length !== 32) throw new KeyError('E_KEY_FORMAT', 'seed must be 32 bytes');
  validateParams(params, deps.floor);
  const publicKey = ed25519Keypair(seed).publicKey;
  const keyId = keyIdOf(publicKey);
  const salt = deps.rng.bytes(16);
  const iv = deps.rng.bytes(12);
  const pw = utf8(canonicalPassphrase(passphrase));
  let used = params;
  let kek: Uint8Array;
  try {
    kek = await deps.kdf(pw, salt, used, onProgress);
  } catch (e) {
    if (!isAllocationFailure(e) || (used.m === deps.floor.m && used.t >= deps.floor.t)) throw e;
    used = { m: deps.floor.m, t: Math.max(deps.floor.t, used.t), p: used.p };
    kek = await deps.kdf(pw, salt, used, onProgress);
  } finally {
    wipe(pw);
  }
  const key = await importKek(deps.subtle, kek);
  const plain = new Uint8Array(64);
  plain.set(seed, 0);
  plain.set(publicKey, 32);
  const aad = utf8(aadFor(keyId));
  const ct = new Uint8Array(await deps.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource }, key, plain as BufferSource));
  wipe(plain);
  const container: QvKey1 = {
    v: 1, kdf: 'argon2id', m: used.m, t: used.t, p: used.p, salt: bytesToHex(salt), aead: 'A256GCM', iv: bytesToHex(iv),
    aad: aadFor(keyId), ct: bytesToHex(ct), keyId,
  };
  return { container, params: used, atFloor: used.m <= deps.floor.m };
}

export function serializeContainer(c: QvKey1): string {
  return new TextDecoder().decode(jcs(c));
}

/** Strict parse + validation of a stored/imported container. Rejects below-floor parameters (REQ-004). */
export function parseContainer(input: string | unknown, floor: KdfParams = FLOOR_PARAMS): QvKey1 {
  let v: unknown;
  try {
    v = typeof input === 'string' ? parseQvJson(input) : input;
  } catch {
    throw new KeyError('E_KEY_FORMAT', 'not a QVKEY1 file');
  }
  const o = v as Partial<Record<keyof QvKey1, unknown>> | null;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) throw new KeyError('E_KEY_FORMAT', 'not a QVKEY1 file');
  const allowed = new Set(['v', 'kdf', 'm', 't', 'p', 'salt', 'aead', 'iv', 'aad', 'ct', 'keyId']);
  for (const k of Object.keys(o)) if (!allowed.has(k)) throw new KeyError('E_KEY_FORMAT', `unknown field ${k}`);
  if (o.v !== 1 || o.kdf !== 'argon2id' || o.aead !== 'A256GCM') throw new KeyError('E_KEY_FORMAT', 'unsupported key container version');
  if (typeof o.m !== 'number' || typeof o.t !== 'number' || typeof o.p !== 'number') throw new KeyError('E_KEY_FORMAT', 'bad parameters');
  if (!isHex(o.salt, 16) || !isHex(o.iv, 12) || !isHex(o.keyId, 8) || !isHex(o.ct, 80)) throw new KeyError('E_KEY_FORMAT', 'bad field encoding');
  if (o.aad !== aadFor(o.keyId)) throw new KeyError('E_KEY_FORMAT', 'bad aad');
  validateParams({ m: o.m, t: o.t, p: o.p }, floor);
  return o as QvKey1;
}

export interface Unwrapped {
  seed: Uint8Array;
  publicKey: Uint8Array;
  /** Milliseconds the KDF + decrypt took (drives the 0.5-3 s calibration, REQ-005). */
  elapsedMs: number;
}

/** Unlocks the container. Throws `E_KEY_LOCKED` for a wrong passphrase. The caller owns (and must wipe) `seed`. */
export async function unwrapSeed(
  container: QvKey1,
  passphrase: string,
  deps: KeystoreDeps = defaultDeps(),
  onProgress?: (f: number) => void,
  now: () => number = () => Date.now(),
): Promise<Unwrapped> {
  const c = parseContainer(container, deps.floor);
  const start = now();
  const pw = utf8(canonicalPassphrase(passphrase));
  let kek: Uint8Array;
  try {
    kek = await deps.kdf(pw, hexToBytes(c.salt, 16), { m: c.m, t: c.t, p: c.p }, onProgress);
  } finally {
    wipe(pw);
  }
  const key = await importKek(deps.subtle, kek);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await deps.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(c.iv, 12) as BufferSource, additionalData: utf8(c.aad) as BufferSource }, key, hexToBytes(c.ct, 80) as BufferSource),
    );
  } catch {
    throw new KeyError('E_KEY_LOCKED', 'wrong passphrase or damaged key');
  }
  const seed = plain.slice(0, 32);
  const stored = plain.slice(32, 64);
  wipe(plain);
  const derived = ed25519Keypair(seed).publicKey;
  const same = derived.length === stored.length && derived.every((b, i) => b === stored[i]);
  if (!same || keyIdOf(derived) !== c.keyId) {
    wipe(seed);
    throw new KeyError('E_KEY_MISMATCH', 'key container is inconsistent');
  }
  return { seed, publicKey: derived, elapsedMs: now() - start };
}

/** REQ-005: keep unlock between 0.5 s and 3 s by adapting memory inside [floor, ceiling]. Pure. */
export function adaptParams(current: KdfParams, elapsedMs: number, floor: KdfParams = FLOOR_PARAMS): { params: KdfParams; atFloor: boolean; changed: boolean } {
  let m = current.m;
  if (elapsedMs > 3000) m = Math.max(floor.m, Math.floor(current.m / 2));
  else if (elapsedMs < 500) m = Math.min(DEFAULT_PARAMS.m, current.m * 2);
  return { params: { ...current, m }, atFloor: m <= floor.m, changed: m !== current.m };
}

/** Transparent re-wrap predicate: the container is weaker than the current defaults. */
export function needsRewrap(c: QvKey1, target: KdfParams = DEFAULT_PARAMS): boolean {
  return c.m < target.m || c.t < target.t;
}
