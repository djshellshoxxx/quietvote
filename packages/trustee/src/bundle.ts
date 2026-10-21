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
    attestation?: SignedRecord<KeyDestructionBody>;
    compromise: SignedRecord<CompromiseBody>[];
  };
  sas: { compared_with: number[]; at: string }[];
  backups: { path: string; at: string; epoch: number }[];
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

export async function writeBundle(path: string, d: BundleData, pass: string, deps: VaultDeps): Promise<void> {
  const plain = encodeBundle(d);
  try {
    const sealed = await sealWithPassphrase(plain, pass, deps.rng, { aad: AAD, ...(deps.logN !== undefined ? { logN: deps.logN } : {}), ...(deps.allowWeak === true ? { allowWeak: true } : {}) });
    await atomicWrite(path, sealed, 0o600);
  } finally {
    wipe(plain);
  }
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
    return decodeBundle(plain);
  } finally {
    wipe(plain);
  }
}
