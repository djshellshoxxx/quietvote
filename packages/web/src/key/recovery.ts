// Paper recovery code (QV-19 §5.3): the seed as Crockford base32 in groups of 4, plus a 4-symbol checksum.
import { sha256, utf8 } from '@quietvote/crypto';
import { crockfordDecode, crockfordEncode, crockfordNormalize, groupSymbols } from '../util/crockford.ts';
import { KeyError } from './keystore.ts';

function checksum(seed: Uint8Array): string {
  const d = sha256(new Uint8Array([...utf8('qv-recovery-v1'), ...seed]));
  return crockfordEncode(d, 20);
}

/** Shown once; the caller wipes `seed`. The returned string is the only place a seed becomes text (explicit exception, REQ-009). */
export function encodeRecoveryCode(seed: Uint8Array): string {
  if (seed.length !== 32) throw new KeyError('E_KEY_FORMAT', 'seed must be 32 bytes');
  return groupSymbols(crockfordEncode(seed) + checksum(seed));
}

export function decodeRecoveryCode(code: string): Uint8Array {
  const s = crockfordNormalize(code);
  if (s === undefined || s.length !== 52 + 4) throw new KeyError('E_KEY_CHECKSUM', 'recovery code has the wrong length or symbols');
  const seed = crockfordDecode(s.slice(0, 52), 32);
  if (seed === undefined || checksum(seed) !== s.slice(52)) throw new KeyError('E_KEY_CHECKSUM', 'recovery code checksum mismatch');
  return seed;
}
