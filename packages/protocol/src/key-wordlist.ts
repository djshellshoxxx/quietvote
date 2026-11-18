// Placeholder 1,296-word list for passphrases and key fingerprints (QV-19 §5.3, open question "EFF short vs custom").
// It is generated, not copied: pronounceable consonant-vowel words, 6400 candidates thinned deterministically to 1296.
// It carries no third-party licence. Replace with a reviewed list under QV-19 §17 before 1.0; the size (1296 = 6^4) is what
// the entropy accounting relies on, and test/wordlist.test.ts pins uniqueness and size.
const CONS = 'bdfghjklmnprstvz'; // 16
const VOW = 'aeiou'; // 5

function build(): readonly string[] {
  const all: string[] = [];
  for (const c1 of CONS) for (const v1 of VOW) for (const c2 of CONS) for (const v2 of VOW) all.push(`${c1}${v1}${c2}${v2}`);
  const out: string[] = [];
  for (let i = 0; i < 1296; i++) out.push(all[Math.floor((i * all.length) / 1296)]!);
  return Object.freeze(out);
}

export const WORDS: readonly string[] = build();
export const WORD_INDEX: ReadonlyMap<string, number> = new Map(WORDS.map((w, i) => [w, i]));
