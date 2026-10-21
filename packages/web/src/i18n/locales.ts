// Locale registry and quality gating (QV-13 §9.3, §9.6, REQ-064).
// Translations are NOT machine-generated here: es, fr, de, pt-BR and ar ship their key tables empty, so they are not offered to
// voters until native-reviewed translations and review records exist. A locale is offered iff every `guarantee` key has a
// message AND a review record whose source hash equals the hash of the current English string.
import { bytesToHex, sha256, utf8 } from '@quietvote/crypto';
import { EN, MESSAGE_KEYS, type MessageKey } from './en.ts';

export type Dir = 'ltr' | 'rtl';
export interface LocaleDef {
  tag: string;
  dir: Dir;
  /** Name of the language in its own script (C-LANG). */
  autonym: string;
  tier: 'source' | 1 | 2 | 'pseudo';
  messages: Partial<Record<MessageKey, string>>;
  /** key -> source hash recorded at review time (i18n/review/<locale>.json equivalent). */
  review: Partial<Record<MessageKey, string>>;
}

/** Hash recorded in review records: first 16 hex chars of SHA-256 of the English message. */
export const sourceHash = (key: MessageKey): string => bytesToHex(sha256(utf8(EN[key].message))).slice(0, 16);

export const GUARANTEE_KEYS: readonly MessageKey[] = MESSAGE_KEYS.filter((k) => EN[k].sensitivity === 'guarantee');

const empty = (): Partial<Record<MessageKey, string>> => ({});

export const LOCALES: readonly LocaleDef[] = [
  { tag: 'en', dir: 'ltr', autonym: 'English', tier: 'source', messages: {}, review: {} },
  { tag: 'es', dir: 'ltr', autonym: 'Español', tier: 1, messages: empty(), review: empty() },
  { tag: 'fr', dir: 'ltr', autonym: 'Français', tier: 1, messages: empty(), review: empty() },
  { tag: 'de', dir: 'ltr', autonym: 'Deutsch', tier: 1, messages: empty(), review: empty() },
  { tag: 'pt-BR', dir: 'ltr', autonym: 'Português (Brasil)', tier: 1, messages: empty(), review: empty() },
  { tag: 'ar', dir: 'rtl', autonym: 'العربية', tier: 1, messages: empty(), review: empty() },
];

/** Why a locale is (not) offered. `missing` lists guarantee keys without a message or with a stale/absent review. */
export function gate(def: LocaleDef): { offered: boolean; missing: MessageKey[] } {
  if (def.tier === 'source') return { offered: true, missing: [] };
  if (def.tier === 'pseudo') return { offered: false, missing: [] };
  const missing = GUARANTEE_KEYS.filter((k) => def.messages[k] === undefined || def.review[k] !== sourceHash(k));
  return { offered: missing.length === 0, missing };
}

export function offeredLocales(defs: readonly LocaleDef[] = LOCALES): LocaleDef[] {
  return defs.filter((d) => gate(d).offered);
}

/** Catalog lint: locale tables only contain known keys. */
export function unknownKeys(def: LocaleDef): string[] {
  return Object.keys(def.messages).filter((k) => !(k in EN));
}

export function dirOf(tag: string, defs: readonly LocaleDef[] = LOCALES): Dir {
  const d = defs.find((x) => x.tag === tag);
  if (d) return d.dir;
  return /^(ar|he|fa|ur)(-|$)/.test(tag) ? 'rtl' : 'ltr';
}

/** QV-13-REQ-063: ?lang= > stored preference > browser languages > en. Only offered locales can win. */
export function negotiateLocale(inp: { query?: string | undefined; stored?: string | undefined; browser?: readonly string[] | undefined; offered: readonly string[] }): string {
  const match = (want: string | undefined): string | undefined => {
    if (!want) return undefined;
    const w = want.toLowerCase();
    const exact = inp.offered.find((o) => o.toLowerCase() === w);
    if (exact) return exact;
    const lang = w.split('-')[0]!;
    return inp.offered.find((o) => o.toLowerCase() === lang) ?? inp.offered.find((o) => o.toLowerCase().split('-')[0] === lang);
  };
  for (const c of [inp.query, inp.stored, ...(inp.browser ?? [])]) {
    const m = match(c);
    if (m) return m;
  }
  return 'en';
}
