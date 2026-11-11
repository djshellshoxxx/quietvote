// Locale registry with every message table loaded (tests, tooling). The app does not import this module: it loads tables lazily
// through runtime.ts. es, fr, de, pt-BR and ar have complete message tables (catalogs/*.ts, machine-drafted, not native-reviewed).
// Their `review` maps (in locales-core.ts) stay empty, so they are NOT offered to voters until native review records exist.
import { ES } from './catalogs/es.ts';
import { FR } from './catalogs/fr.ts';
import { DE } from './catalogs/de.ts';
import { PT_BR } from './catalogs/pt-BR.ts';
import { AR } from './catalogs/ar.ts';
import { LOCALE_META, dirOf as dirOfCore, offeredLocales as offeredCore, type LocaleDef } from './locales-core.ts';

export * from './locales-core.ts';

const TABLES: Record<string, LocaleDef['messages']> = { es: ES, fr: FR, de: DE, 'pt-BR': PT_BR, ar: AR };

export const LOCALES: readonly LocaleDef[] = LOCALE_META.map((m) => ({ ...m, messages: TABLES[m.tag] ?? {} }));

export const offeredLocales = (defs: readonly LocaleDef[] = LOCALES): LocaleDef[] => offeredCore(defs);
export const dirOf = (tag: string, defs: readonly LocaleDef[] = LOCALES): 'ltr' | 'rtl' => dirOfCore(tag, defs);
