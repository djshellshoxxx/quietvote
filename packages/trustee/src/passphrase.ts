import type { Rng } from '@quietvote/crypto';
import { TrusteeError } from './errors.ts';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford, 32 symbols = exactly 5 bits each

/**
 * Client-generated passphrase: 20 symbols x 5 bits = 100 bits (QV-17-REQ-021), shown as XXXXX-XXXXX-XXXXX-XXXXX.
 * (A word-based form is planned once the 2048-word list, QV-17 Q4, is chosen.)
 */
export function generatePassphrase(rng: Rng): string {
  const b = rng.bytes(20);
  let s = '';
  for (let i = 0; i < 20; i++) {
    s += B32[b[i]! & 31]!;
    if (i % 5 === 4 && i < 19) s += '-';
  }
  return s;
}

export const GENERATED_BITS = 100;
const COMMON = new Set(['password', 'passw0rd', 'letmein', 'qwerty', 'qwertyuiop', 'iloveyou', 'trustno1', 'admin', 'welcome', '123456789', '12345678', 'correcthorsebatterystaple']);

/**
 * Deliberately conservative estimate (bits). Pool-size model with repeat/sequence penalties; lower-case-only
 * text is capped at 2 bits/char because natural-language phrases are far from uniform. Not a guarantee.
 */
export function estimateEntropyBits(p: string): number {
  if (p.length === 0 || COMMON.has(p.toLowerCase().replace(/[\s-]/g, ''))) return 0;
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[0-9]/.test(p)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
  const seen = new Set<string>();
  let eff = 0;
  let prev = -2;
  let run = 0;
  for (const ch of p) {
    const c = ch.codePointAt(0)!;
    const step = c - prev;
    run = step === 1 || step === -1 || step === 0 ? run + 1 : 0;
    prev = c;
    if (seen.has(ch)) eff += 0.25;
    else {
      seen.add(ch);
      eff += run >= 2 ? 0.25 : 1;
    }
  }
  let bits = eff * Math.log2(Math.max(pool, 2));
  if (/^[a-z\s]+$/.test(p)) bits = Math.min(bits, p.length * 2);
  return Math.floor(bits);
}

export const MIN_USER_BITS = 60;

/** QV-17-REQ-022: user-chosen passphrases below 60 estimated bits are refused. */
export function assertPassphraseStrength(p: string, generated = false): void {
  if (generated) return;
  const bits = estimateEntropyBits(p);
  if (bits < MIN_USER_BITS) throw new TrusteeError('REFUSED', 'WEAK_PASSPHRASE', `estimated ${bits} bits < ${MIN_USER_BITS}; use a generated passphrase`);
}
