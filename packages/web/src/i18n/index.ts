// Runtime translator. Fallback chain xx-YY -> xx -> en for normal strings; `guarantee` strings never fall back to a
// different language (REQ-064): a locale that lacks one is not offered, and asking for one anyway throws.
import { format, parse, evaluate, type Args, type Node } from './icu.ts';
import { EN, type MessageKey } from './en.ts';
import { SOURCE_ONLY, dirOf, type LocaleDef } from './locales-core.ts';

export { EN, MESSAGE_KEYS, type MessageKey } from './en.ts';
// LOCALES (all tables loaded) is in ./locales.ts; the app loads tables on demand through ./runtime.ts.
export { offeredLocales, negotiateLocale, gate, dirOf, SOURCE_ONLY, type LocaleDef } from './locales-core.ts';
export type { Args } from './icu.ts';

export interface Translator {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  t(key: MessageKey, args?: Args): string;
  has(key: MessageKey): boolean;
}

export interface TranslatorOptions {
  timeZone?: string;
  /** Test hook: extra locale definitions (e.g. pseudo-locales). */
  defs?: readonly LocaleDef[];
}

export function createTranslator(locale: string, o: TranslatorOptions = {}): Translator {
  const defs = o.defs ?? SOURCE_ONLY;
  const def = defs.find((d) => d.tag === locale);
  const lang = locale.split('-')[0]!;
  const base = defs.find((d) => d.tag === lang);
  const cache = new Map<string, Node[]>();
  const fo = { locale, ...(o.timeZone === undefined ? {} : { timeZone: o.timeZone }) };
  const lookup = (key: MessageKey): string => {
    const entry = EN[key];
    const own = def?.messages[key] ?? (entry.sensitivity === 'guarantee' ? undefined : base?.messages[key]);
    if (own !== undefined) return own;
    if (locale !== 'en' && entry.sensitivity === 'guarantee' && (def?.tier !== 'source')) {
      throw new Error(`guarantee string ${key} is not available in ${locale}`);
    }
    return entry.message;
  };
  return {
    locale,
    dir: dirOf(locale, defs),
    t(key: MessageKey, args: Args = {}): string {
      const src = lookup(key);
      let ast = cache.get(src);
      if (ast === undefined) {
        ast = parse(src);
        cache.set(src, ast);
      }
      return evaluate(ast, args, fo);
    },
    has(key: MessageKey): boolean {
      return key in EN;
    },
  };
}

export { format };
