import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { concatBytes, lp, u32, utf8 } from './bytes.ts';
import { QvCryptoError } from './errors.ts';
import { scalarFromWide, type Scalar } from './ristretto.ts';

/** Suite identifier hashed into every frame (QV-16 §5.3). */
export const SUITE = 'qv1-r255-sha2';

/**
 * Label registry (QV-16 §5.4). Every framed hash uses exactly one of these.
 * The value is the output kind. Adding a label requires a spec revision.
 */
export const LABELS = {
  manifest: 'H256',
  'dkg-commit': 'H256',
  'dkg-transcript': 'H256',
  'dkg-dealing': 'H256',
  'election-ctx': 'H256',
  pok: 'hs',
  'pok-share': 'hs',
  'cp-dh': 'hs',
  cds01: 'hs',
  'cp-limit': 'hs',
  'cp-dec': 'hs',
  'cp-dec-spoil': 'hs',
  'ballot-code': 'H256',
  'binder-roll': 'H256',
  'sig-cast': 'H256',
  'sig-spoil': 'H256',
  'sig-record': 'H256',
  'voter-nonce-key': 'H256',
  'ballot-seed': 'H512',
  selvec: 'H256',
  'enc-nonce': 'hs_nz',
  'proof-w': 'hs_nz',
  'proof-csim': 'hs',
  'proof-ssim': 'hs',
  'limit-w': 'hs_nz',
  'cp-dec-nonce': 'hs_nz',
  reveal: 'H256',
} as const;

export type Label = keyof typeof LABELS;
type Kind = (typeof LABELS)[Label];

function check(label: string, kind: Kind): asserts label is Label {
  const k = (LABELS as Record<string, Kind | undefined>)[label];
  if (k === undefined) throw new QvCryptoError('E_DOMAIN_UNKNOWN', `unregistered label ${label}`);
  if (k !== kind) throw new QvCryptoError('E_DOMAIN_UNKNOWN', `label ${label} is registered for ${k}, not ${kind}`);
}

/**
 * FRAME(L; f_1..f_m) = lp("QV1-HASH") || lp(suite) || lp(L) || u32(m) || lp(f_1) || ... || lp(f_m)
 * Fields are raw bytes; callers are responsible for fixed widths (checked at the call sites).
 */
export function frame(label: string, fields: readonly Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [lp(utf8('QV1-HASH')), lp(utf8(SUITE)), lp(utf8(label)), u32(fields.length)];
  for (const f of fields) parts.push(lp(f));
  return concatBytes(...parts);
}

export function h256(label: Label, ...fields: Uint8Array[]): Uint8Array {
  check(label, 'H256');
  return sha256(frame(label, fields));
}
export function h512(label: Label, ...fields: Uint8Array[]): Uint8Array {
  check(label, 'H512');
  return sha512(frame(label, fields));
}
/** hs(L; f...) = LE_int(H512(frame)) mod l. */
export function hs(label: Label, ...fields: Uint8Array[]): Scalar {
  check(label, 'hs');
  return scalarFromWide(sha512(frame(label, fields)));
}

/**
 * Runs `derive(counter)` for counter = 0,1,2,... until a non-zero scalar results.
 * Exposed separately so tests can force the retry path (REQ-003).
 */
export function firstNonZero(derive: (counter: number) => Scalar): Scalar {
  for (let c = 0; c < 256; c++) {
    const s = derive(c);
    if (s !== 0n) return s;
  }
  throw new QvCryptoError('E_ARG', 'hs_nz exhausted');
}

/** hs_nz: counter u32(c) is ALWAYS the last field, starting at 0. */
export function hsNz(label: Label, ...fields: Uint8Array[]): Scalar {
  check(label, 'hs_nz');
  return firstNonZero((c) => scalarFromWide(sha512(frame(label, [...fields, u32(c)]))));
}

/** Test/vector hook: framed preimage for a registered label (any kind). */
export function framedPreimage(label: Label, ...fields: Uint8Array[]): Uint8Array {
  if ((LABELS as Record<string, Kind | undefined>)[label] === undefined) throw new QvCryptoError('E_DOMAIN_UNKNOWN', label);
  return frame(label, fields);
}
