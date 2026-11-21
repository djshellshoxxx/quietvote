// QVKEY1 compatibility policy (QV-ADR-027 / B3-25). These rules are part of the
// existing container's KDF input and must not change without legacy fixtures.
import { WORD_INDEX } from './key-wordlist.ts';

export const KEY_PASSPHRASE_MIN_WORDS = 6;

export function splitKeyPassphraseWords(input: string): string[] {
  return input.trim().toLowerCase().split(/[\s-]+/).filter((word) => word.length > 0);
}

/** Existing web policy: fold list-word phrases; otherwise preserve NFKC text. */
export function canonicalKeyPassphrase(input: string): string {
  const words = splitKeyPassphraseWords(input);
  if (words.length >= KEY_PASSPHRASE_MIN_WORDS && words.every((word) => WORD_INDEX.has(word))) return words.join(' ');
  return input.normalize('NFKC');
}

/** Canonical first, then the old CLI's NFKC-only spelling, never a duplicate KDF. */
export function keyPassphraseUnlockCandidates(input: string): readonly string[] {
  const canonical = canonicalKeyPassphrase(input);
  const legacy = input.normalize('NFKC');
  return canonical === legacy ? [canonical] : [canonical, legacy];
}
