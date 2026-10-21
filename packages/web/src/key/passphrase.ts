// Passphrase policy (QV-19 §5.3, REQ-007): >= 12 characters OR >= 6 words from the embedded list; generator defaults to 7 words.
// No composition rules (WCAG 3.3.8). Strength is a small in-repo heuristic (no zxcvbn).
import type { Rng } from '@quietvote/crypto';
import { WORDS, WORD_INDEX } from './wordlist.ts';

export const MIN_CHARS = 12;
export const MIN_WORDS = 6;
export const DEFAULT_GENERATED_WORDS = 7;
export const BITS_PER_WORD = Math.log2(WORDS.length);

export type PassphraseProblem = 'tooShort' | 'commonPattern' | 'repetitive';
export interface PassphraseCheck {
  ok: boolean;
  mode: 'words' | 'chars';
  estimatedBits: number;
  /** i18n message keys (qv.key.pp.*) for the first problem; empty when ok. */
  problems: PassphraseProblem[];
}

const COMMON = ['password', 'passphrase', 'qwerty', 'letmein', 'iloveyou', '123456', 'abcdef', 'quietvote', 'welcome', 'admin', 'vote'];

export function splitWords(s: string): string[] {
  return s.trim().toLowerCase().split(/[\s-]+/).filter((w) => w.length > 0);
}

/** Rough bits estimate for free-text input: pool size by classes, discounted for repetition, runs and common substrings. */
export function estimateBits(s: string): number {
  const cps = [...s.normalize('NFKC')];
  if (cps.length === 0) return 0;
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/[0-9]/.test(s)) pool += 10;
  if (/[^A-Za-z0-9]/.test(s)) pool += 33;
  if (/[^\u0000-\u007f]/.test(s)) pool += 100;
  const uniq = new Set(cps).size;
  let bits = cps.length * Math.log2(Math.max(pool, 2));
  // Repetition: only distinct symbols add much.
  bits = Math.min(bits, uniq * Math.log2(Math.max(pool, 2)) + (cps.length - uniq) * 1);
  // Sequential runs (abc, 123, aaa).
  let runs = 0;
  for (let i = 2; i < cps.length; i++) {
    const a = cps[i - 2]!.codePointAt(0)!;
    const b = cps[i - 1]!.codePointAt(0)!;
    const c = cps[i]!.codePointAt(0)!;
    if (b - a === c - b && Math.abs(b - a) <= 1) runs++;
  }
  bits -= runs * Math.log2(Math.max(pool, 2)) * 0.8;
  const lower = s.toLowerCase();
  for (const w of COMMON) if (lower.includes(w)) bits -= Math.min(bits, w.length * 3);
  return Math.max(0, Math.round(bits));
}

export function checkPassphrase(input: string): PassphraseCheck {
  const words = splitWords(input);
  if (words.length >= 2 && words.every((w) => WORD_INDEX.has(w))) {
    // Built only from list words: entropy is counted per word, not per character.
    const distinct = new Set(words).size;
    const bits = Math.floor(distinct * BITS_PER_WORD);
    if (distinct < words.length) return { ok: false, mode: 'words', estimatedBits: bits, problems: ['repetitive'] };
    if (words.length < MIN_WORDS) return { ok: false, mode: 'words', estimatedBits: bits, problems: ['tooShort'] };
    return { ok: true, mode: 'words', estimatedBits: bits, problems: [] };
  }
  const len = [...input.normalize('NFKC')].length;
  const bits = estimateBits(input);
  if (len < MIN_CHARS) return { ok: false, mode: 'chars', estimatedBits: bits, problems: ['tooShort'] };
  if (new Set([...input]).size < 5) return { ok: false, mode: 'chars', estimatedBits: bits, problems: ['repetitive'] };
  if (bits < 36) return { ok: false, mode: 'chars', estimatedBits: bits, problems: ['commonPattern'] };
  return { ok: true, mode: 'chars', estimatedBits: bits, problems: [] };
}

/** Uniform word index in [0, 1296) by rejection sampling over 16-bit draws. */
export function randomIndex(rng: Rng): number {
  const limit = Math.floor(65536 / WORDS.length) * WORDS.length;
  for (;;) {
    const b = rng.bytes(2);
    const v = (b[0]! << 8) | b[1]!;
    if (v < limit) return v % WORDS.length;
  }
}

export function generatePassphrase(rng: Rng, words: number = DEFAULT_GENERATED_WORDS): string {
  if (!Number.isInteger(words) || words < MIN_WORDS) throw new RangeError(`at least ${MIN_WORDS} words`);
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDS[randomIndex(rng)]!);
  return out.join(' ');
}

/** Canonical form fed to the KDF: NFKC, words lower-cased and single-space joined when it is a word passphrase. */
export function canonicalPassphrase(input: string): string {
  const words = splitWords(input);
  if (words.length >= MIN_WORDS && words.every((w) => WORD_INDEX.has(w))) return words.join(' ');
  return input.normalize('NFKC');
}

/** 8-word fingerprint of a public key for display (QV-19 §6.1). Display-only: slight modulo bias is irrelevant here. */
export function fingerprintWords(digest32: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < 8; i++) out.push(WORDS[((digest32[2 * i]! << 8) | digest32[2 * i + 1]!) % WORDS.length]!);
  return out;
}
