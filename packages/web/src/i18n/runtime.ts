// Lazy locale tables. Each translated catalog is its own chunk (about 60 kB raw each), fetched only for a locale that can be
// offered, i.e. one that has review records. Today none has, so the app loads no catalog at all. A locale without review records
// cannot pass gate() whatever its table holds, so skipping its table changes nothing a voter can see.
import type { LocaleDef } from './locales-core.ts';
import { LOCALE_META, type LocaleMeta } from './locales-core.ts';

type Table = LocaleDef['messages'];
const LOADERS: Record<string, () => Promise<Table>> = {
  es: async () => (await import('./catalogs/es.ts')).ES,
  fr: async () => (await import('./catalogs/fr.ts')).FR,
  de: async () => (await import('./catalogs/de.ts')).DE,
  'pt-BR': async () => (await import('./catalogs/pt-BR.ts')).PT_BR,
  ar: async () => (await import('./catalogs/ar.ts')).AR,
};

export const hasReviews = (m: { review: object }): boolean => Object.keys(m.review).length > 0;

/** Locale definitions for the app: tables are loaded only where review records exist. A failed chunk load leaves that locale unoffered. */
export async function loadLocaleDefs(load: Record<string, () => Promise<Table>> = LOADERS, meta: readonly LocaleMeta[] = LOCALE_META): Promise<LocaleDef[]> {
  return Promise.all(meta.map(async (m): Promise<LocaleDef> => {
    const loader = load[m.tag];
    let messages: Table = {};
    if (loader !== undefined && hasReviews(m)) {
      try {
        messages = await loader();
      } catch {
        messages = {};
      }
    }
    return { ...m, messages };
  }));
}
