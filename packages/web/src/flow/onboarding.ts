// Voter onboarding services (QV-19 §6.1): key generation, import, restore, unlock, registration.
import { bytesToHex, ed25519Keypair, hexToBytes, sha256, systemRng, utf8, type Rng } from '@quietvote/crypto';
import type { RegistrationBody } from '../api/types.ts';
import {
  DEFAULT_PARAMS, KeyError, adaptParams, defaultDeps, needsRewrap, parseContainer, serializeContainer, unwrapSeed, wrapSeed,
  type KdfParams, type KeystoreDeps, type QvKey1,
} from '../key/keystore.ts';
import { checkPassphrase, fingerprintWords } from '../key/passphrase.ts';
import { decodeRecoveryCode, encodeRecoveryCode } from '../key/recovery.ts';
import { createSigner, type Signer } from '../key/signer.ts';
import type { DeviceStorage } from '../key/storage.ts';
import { b64uEncode, wipe } from '../util/hex.ts';
import { inviteHash } from './invite.ts';

/** Per-election voter keys are the default (QV-ADR-P19-5). */
export const keySlot = (apiElectionId: string): string => `voter:${apiElectionId}`;
export const ORGANIZER_SLOT = 'organizer';

export interface CreatedKey {
  container: QvKey1;
  publicKey: Uint8Array;
  fingerprint: string[];
  atFloor: boolean;
  keyFileText: string;
}

export class PassphrasePolicyError extends Error {
  constructor() {
    super('passphrase does not meet the policy');
    this.name = 'PassphrasePolicyError';
  }
}

export async function createKey(a: {
  storage: DeviceStorage;
  slot: string;
  passphrase: string;
  rng?: Rng;
  deps?: KeystoreDeps;
  params?: KdfParams;
  onProgress?: (f: number) => void;
}): Promise<CreatedKey> {
  if (!checkPassphrase(a.passphrase).ok) throw new PassphrasePolicyError();
  const rng = a.rng ?? systemRng;
  const seed = rng.bytes(32); // crypto.getRandomValues only (REQ-003)
  try {
    return await storeSeed(seed, a);
  } finally {
    wipe(seed);
  }
}

async function storeSeed(seed: Uint8Array, a: { storage: DeviceStorage; slot: string; passphrase: string; deps?: KeystoreDeps | undefined; params?: KdfParams | undefined; onProgress?: ((f: number) => void) | undefined }): Promise<CreatedKey> {
  const publicKey = ed25519Keypair(seed).publicKey;
  const w = await wrapSeed(seed, a.passphrase, a.deps ?? defaultDeps(), a.params ?? DEFAULT_PARAMS, a.onProgress);
  await a.storage.putKey(a.slot, w.container);
  return { container: w.container, publicKey, fingerprint: fingerprintWords(sha256(publicKey)), atFloor: w.atFloor, keyFileText: serializeContainer(w.container) };
}

/** Imports a `.qvkey` file: validates it, proves the passphrase unlocks it, then stores it unchanged. */
export async function importKeyFile(a: { storage: DeviceStorage; slot: string; text: string; passphrase: string; deps?: KeystoreDeps }): Promise<{ publicKey: Uint8Array; fingerprint: string[] }> {
  const container = parseContainer(a.text, a.deps?.floor);
  const u = await unwrapSeed(container, a.passphrase, a.deps ?? defaultDeps());
  wipe(u.seed);
  await a.storage.putKey(a.slot, container);
  return { publicKey: u.publicKey, fingerprint: fingerprintWords(sha256(u.publicKey)) };
}

export async function restoreFromRecovery(a: { storage: DeviceStorage; slot: string; code: string; passphrase: string; deps?: KeystoreDeps; params?: KdfParams }): Promise<CreatedKey> {
  if (!checkPassphrase(a.passphrase).ok) throw new PassphrasePolicyError();
  const seed = decodeRecoveryCode(a.code);
  try {
    return await storeSeed(seed, a);
  } finally {
    wipe(seed);
  }
}

/** Shown once; requires the passphrase again (QV-19 §5.3). The returned text is the explicit secret-display exception. */
export async function recoveryCodeFor(container: QvKey1, passphrase: string, deps?: KeystoreDeps): Promise<string> {
  const u = await unwrapSeed(container, passphrase, deps ?? defaultDeps());
  try {
    return encodeRecoveryCode(u.seed);
  } finally {
    wipe(u.seed);
  }
}

export interface Unlocked {
  signer: Signer;
  fingerprint: string[];
  elapsedMs: number;
  /** Parameters were weaker than current defaults / out of the 0.5-3 s window and the stored blob was re-wrapped. */
  rewrapped: boolean;
  atFloor: boolean;
}

export async function unlockKey(a: { storage: DeviceStorage; slot: string; passphrase: string; deps?: KeystoreDeps; now?: () => number; onProgress?: (f: number) => void }): Promise<Unlocked> {
  const container = await a.storage.getKey(a.slot);
  if (container === undefined) throw new KeyError('E_KEY_FORMAT', 'no key on this device');
  const deps = a.deps ?? defaultDeps();
  const u = await unwrapSeed(container, a.passphrase, deps, a.onProgress, a.now);
  let rewrapped = false;
  let atFloor = container.m <= deps.floor.m;
  const adapt = adaptParams({ m: container.m, t: container.t, p: container.p }, u.elapsedMs, deps.floor);
  atFloor = adapt.atFloor;
  if (needsRewrap(container) && adapt.changed === false && u.elapsedMs < 3000) {
    // Stronger parameters are affordable on this device: transparent re-wrap at unlock.
    const w = await wrapSeed(u.seed, a.passphrase, deps, { m: Math.max(container.m, Math.min(DEFAULT_PARAMS.m, container.m * 2)), t: Math.max(container.t, DEFAULT_PARAMS.t), p: container.p }, a.onProgress);
    await a.storage.putKey(a.slot, w.container);
    rewrapped = true;
  }
  const signer = await createSigner(u.seed);
  return { signer, fingerprint: fingerprintWords(sha256(u.publicKey)), elapsedMs: u.elapsedMs, rewrapped, atFloor };
}

const REG_DOMAIN = utf8('QV-REG-v1\0');

/**
 * Registration request (QV-19 §6.1): `invite_code` carries SHA-256(token) so the server never receives a usable credential
 * (REQ-010); the proof of possession signs (election id, SHA-256(token), pk) under the registration domain.
 */
export async function registrationBody(a: { apiElectionId: string; token: Uint8Array; signer: Signer }): Promise<RegistrationBody> {
  const h = sha256(a.token);
  const msg = new Uint8Array([...REG_DOMAIN, ...utf8(a.apiElectionId), 0, ...h, ...a.signer.publicKey]);
  return { invite_code: inviteHash(a.token), pk: b64uEncode(a.signer.publicKey), alg: 'ed25519', pop: b64uEncode(await a.signer.sign(msg)) };
}

export const pkHexOf = (s: Signer): string => bytesToHex(s.publicKey);
export { hexToBytes };
