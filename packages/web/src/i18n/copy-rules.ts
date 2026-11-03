// Plain-language rules for voter-facing copy. Enforced by test/copy.test.ts.
import { EN, MESSAGE_KEYS, type MessageKey } from './en.ts';

/** Key prefixes shown to voters. Organizer (qv.org), observer (qv.verify) and help/about text are outside the 20-word rule. */
export const VOTER_PREFIXES = ['qv.home', 'qv.how', 'qv.step', 'qv.election', 'qv.key', 'qv.ballot', 'qv.vote', 'qv.audit', 'qv.receipt', 'qv.err', 'qv.status', 'qv.shell', 'qv.device', 'qv.results'];
export const BANNED_WORDS = [
  'ciphertext', 'ciphertexts', 'nonce', 'benaloh', 'dkg', 'cryptographic', 'cryptography', 'homomorphic', 'zero-knowledge', 'argon2', 'argon2id',
  'elgamal', 'ristretto', 'merkle', 'ed25519', 'hash', 'kdf', 'aead', 'sth', 'checkpoint', 'spoil', 'spoiled', 'randomness', 'entropy', 'payload', 'api',
];
export const MAX_WORDS_PER_SENTENCE = 20;

export function isVoterFacing(k: MessageKey): boolean {
  return VOTER_PREFIXES.some((p) => k.startsWith(`${p}.`)) && EN[k].sensitivity === 'normal';
}

/** English words in the message outside {placeholders}. */
export function sentences(message: string): string[] {
  const flat = message.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' x ');
  return flat.split(/(?<=[.!?…])\s+|\n/).map((s) => s.trim()).filter(Boolean);
}
export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

export function violations(): string[] {
  const out: string[] = [];
  for (const k of MESSAGE_KEYS) {
    if (!isVoterFacing(k)) continue;
    const msg = EN[k].message;
    for (const s of sentences(msg)) if (wordCount(s) > MAX_WORDS_PER_SENTENCE) out.push(`${k}: ${wordCount(s)} words: "${s}"`);
    const lower = msg.toLowerCase();
    for (const w of BANNED_WORDS) if (new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(lower)) out.push(`${k}: banned word "${w}"`);
  }
  return out;
}

const SCREENS: [string, string][] = [
  ['Shell and navigation', 'qv.shell'], ['Banners and status', 'qv.banner'], ['Home and "How this works"', 'qv.how'], ['Home', 'qv.home'],
  ['Election page (step 1)', 'qv.election'], ['Privacy panel (More details)', 'qv.privacy'], ['Voting key (step 2)', 'qv.key'], ['Ballot', 'qv.ballot'],
  ['Vote screen', 'qv.vote'], ['Double-check step (optional)', 'qv.audit'], ['Receipt', 'qv.receipt'], ['Results', 'qv.results'], ['Errors', 'qv.err'],
  ['Anti-phishing', 'qv.phish'], ['Glossary', 'qv.glossary'], ['Step indicator', 'qv.step'], ['Device', 'qv.device'], ['Status chips', 'qv.status'],
  ['Verify an election', 'qv.verify'], ['Organizer', 'qv.org'], ['Help', 'qv.help'], ['Navigation', 'qv.nav'], ['Accessibility names', 'qv.a11y'],
];
export function renderCopyDoc(): string {
  const lines = ['# QuietVote web copy', '', 'Generated from `src/i18n/en.ts` by `test/copy.test.ts` (run `UPDATE_COPY=1 npm test -w @quietvote/web` to refresh). Edit the catalog, not this file.', '',
    `Voter-facing rules: sentences of at most ${MAX_WORDS_PER_SENTENCE} words and none of: ${BANNED_WORDS.join(', ')}. Marked **[normative]** strings are guarantee copy from QV-10 section 7 and shown under "More details".`, ''];
  for (const [title, prefix] of SCREENS) {
    const keys = MESSAGE_KEYS.filter((k) => k.startsWith(`${prefix}.`));
    if (keys.length === 0) continue;
    lines.push(`## ${title}`, '');
    for (const k of keys) lines.push(`- \`${k}\`${EN[k].sensitivity === 'guarantee' ? ' **[normative]**' : ''}: ${EN[k].message}`);
    lines.push('');
  }
  return lines.join('\n');
}
