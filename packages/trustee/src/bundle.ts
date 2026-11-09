import {
  QvCryptoError, openWithPassphrase, sealWithPassphrase, utf8, wipe, type Rng,
} from '@quietvote/crypto';
import type { CommitBody, ComplaintBody, DealingBody, KeyconfBody, LogEntry, Manifest, MultiSignedRecord, SharesBody, SignedRecord } from '@quietvote/protocol';
import { TrusteeError } from './errors.ts';
import { atomicWrite, exists, readSecretFile } from './fsutil.ts';
import type { TrusteeState } from './machine.ts';

/** Public record produced by the drill (fire drill, QV-17-REQ-016). Not yet part of QV-16. */
export interface KeycheckBody {
  proto: string;
  type: 'keycheck';
  ctx: string;
  j: number;
  M: string;
  c: string;
  s: string;
}
export interface TallyShareBody {
  proto: string;
  type: 'tally-share';
  ctx: string;
  j: number;
  n_counted: number;
  counted_root: string;
  shares: { contest: string; opt: string; M: string; c: string; s: string }[];
}
/** Trustee-mode spoil decryption share (QV-ADR-020): partial decryption of one spoiled ballot, `cp-dec-spoil` proofs. */
export interface SpoilShareBody {
  proto: string;
  type: 'spoil-share';
  ctx: string;
  j: number;
  code: string;
  /** Log position of the spoil record the trustee decrypted. */
  spoil_seq: number;
  shares: { contest: string; opt: string; M: string; c: string; s: string }[];
}
export interface KeyDestructionBody {
  proto: string;
  type: 'key-destruction';
  ctx: string;
  j: number;
  destroyed_at: string;
  method: string;
  statement: string;
}
export interface CompromiseBody {
  proto: string;
  type: 'trustee-compromise-report';
  manifest_hash: string;
  j: number;
  severity: 'suspected' | 'confirmed';
  reported_at: string;
  affects: ('share' | 'bundle+passphrase' | 'sign-key')[];
}

/** Plaintext of the encrypted `.qvtb` file. Secret fields are hex strings (strings cannot be wiped: best effort only, R-02 §3). */
export interface BundleData {
  bundle_version: 1;
  created_at: string;
  backup_epoch: number;
  state: TrusteeState;
  sk_sign: string;
  sign_pk: string;
  /** Absolute path this bundle was created (or restored) at; locates its public release ledger on restore. */
  home?: string;
  election_id?: string;
  trustee_id?: number;
  ceremony_id?: string;
  manifest_hash?: string;
  manifest?: MultiSignedRecord<Manifest>;
  transcript_hash?: string;
  /** Public log entries seen (validated on import). */
  log: LogEntry[];
  /** Round-1 secrets; coefficients are dropped once the shares package is persisted. */
  dealer?: { coeffs?: string[]; e?: string };
  own_y?: string;
  received: Record<string, string>;
  sk_i?: string;
  derived?: { Yj: string; K: string; ctx: string; qmask: number; Q: number[]; fp_words: string[]; fp_hex: string };
  out: {
    commit?: SignedRecord<CommitBody>;
    dealing?: SignedRecord<DealingBody>;
    shares?: SignedRecord<SharesBody>;
    complaints: SignedRecord<ComplaintBody>[];
    keyconf?: SignedRecord<KeyconfBody>;
    keycheck?: SignedRecord<KeycheckBody>;
    release?: SignedRecord<TallyShareBody>;
    /** Replay guard + audit trail: one entry per ballot code already released (hex code -> signed share). */
    spoil?: Record<string, SignedRecord<SpoilShareBody>>;
    attestation?: SignedRecord<KeyDestructionBody>;
    compromise: SignedRecord<CompromiseBody>[];
  };
  sas: { compared_with: number[]; at: string }[];
  /** Canonical absolute path and fingerprint of the sealed backup bytes. Older bundles may lack the fingerprint. */
  backups: { path: string; at: string; epoch: number; sha256?: string }[];
  /** Typed safety overrides used (kept local; also surfaced in the exported transcript summary events). */
  overrides: { what: string; at: string }[];
  events: { t: string; note: string }[];
}

export interface VaultDeps {
  rng: Rng;
  now: () => Date;
  /** scrypt log2(N); production default 18. Tests inject a lower value together with allowWeak. */
  logN?: number;
  allowWeak?: boolean;
}

const AAD = utf8('qv-trustee-bundle/v1');
export const tombstonePath = (bundle: string): string => `${bundle}.destroyed`;

export function encodeBundle(d: BundleData): Uint8Array {
  return utf8(JSON.stringify(d));
}

/** Seals and atomically writes the bundle; returns the sealed bytes written. */
export async function sealBundle(d: BundleData, pass: string, deps: VaultDeps): Promise<Uint8Array> {
  const plain = encodeBundle(d);
  try {
    const sealed = await sealWithPassphrase(plain, pass, deps.rng, { aad: AAD, ...(deps.logN !== undefined ? { logN: deps.logN } : {}), ...(deps.allowWeak === true ? { allowWeak: true } : {}) });
    return sealed;
  } finally {
    wipe(plain);
  }
}

export async function writeBundle(path: string, d: BundleData, pass: string, deps: VaultDeps): Promise<Uint8Array> {
  const sealed = await sealBundle(d, pass, deps);
  await atomicWrite(path, sealed, 0o600);
  return sealed;
}

export function decodeBundle(plain: Uint8Array): BundleData {
  let d: BundleData;
  try {
    d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)) as BundleData;
  } catch {
    throw new TrusteeError('VERIFY', 'BUNDLE_CORRUPT', 'payload is not valid');
  }
  if (typeof d !== 'object' || d === null || d.bundle_version !== 1 || typeof d.sk_sign !== 'string' || !Array.isArray(d.log)) throw new TrusteeError('VERIFY', 'BUNDLE_CORRUPT', 'unsupported bundle');
  return d;
}

export async function readBundle(path: string, pass: string, deps: Pick<VaultDeps, 'allowWeak'>): Promise<BundleData> {
  return (await readBundleSealed(path, pass, deps)).data;
}

/** As `readBundle`, plus the sealed file bytes that were opened (for the compare-before-write check, audit TR-03). */
export async function readBundleSealed(path: string, pass: string, deps: Pick<VaultDeps, 'allowWeak'>): Promise<{ data: BundleData; sealed: Uint8Array }> {
  if (!(await exists(path))) {
    if (await exists(tombstonePath(path))) throw new TrusteeError('STATE', 'DESTROYED', 'this share was destroyed');
    throw new TrusteeError('USAGE', 'NO_SUCH_FILE', path);
  }
  const file = await readSecretFile(path);
  let plain: Uint8Array;
  try {
    plain = await openWithPassphrase(file, pass, { aad: AAD, ...(deps.allowWeak === true ? { allowWeak: true } : {}) });
  } catch (e) {
    if (e instanceof QvCryptoError) {
      if (e.code === 'E_AEAD') throw new TrusteeError('LOCKED', 'BAD_PASSPHRASE', 'wrong passphrase or corrupted file');
      throw new TrusteeError('VERIFY', 'BUNDLE_FORMAT', e.message);
    }
    throw e;
  }
  try {
    return { data: decodeBundle(plain), sealed: file };
  } finally {
    wipe(plain);
  }
}
