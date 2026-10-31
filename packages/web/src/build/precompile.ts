import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin } from 'esbuild';
import { parse, type Node } from '../i18n/icu.ts';

type MessageTable = Readonly<Record<string, string>>;
type CatalogModule = Record<string, unknown>;

const i18nDir = fileURLToPath(new URL('../i18n/', import.meta.url));
const i18nIndexPath = fileURLToPath(new URL('../i18n/index.ts', import.meta.url));
const catalogNames = ['es', 'fr', 'de', 'pt-BR', 'ar'] as const;
const catalogExports = { es: 'ES', fr: 'FR', de: 'DE', 'pt-BR': 'PT_BR', ar: 'AR' } as const;

async function loadModule(path: string, source: string): Promise<CatalogModule> {
  const digest = createHash('sha256').update(source).digest('hex');
  return await import(`${pathToFileURL(path).href}?build=${digest}`) as CatalogModule;
}

function stringTable(value: unknown, name: string): MessageTable {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.values(value).some((entry) => typeof entry !== 'string')) {
    throw new Error(`${name} is not a string message table`);
  }
  return value as MessageTable;
}

/** Parse a catalog during the build and return immutable ASTs keyed by message key. */
export function compileCatalog(messages: MessageTable): Readonly<Record<string, readonly Node[]>> {
  return Object.fromEntries(Object.entries(messages).map(([key, source]) => [key, parse(source)]));
}

function registration(tableName: string, messages: MessageTable): string {
  const asts = compileCatalog(messages);
  const formatters = Object.entries(asts)
    .filter(([key, ast]) => !(ast.length === 1 && ast[0]?.k === 'text' && ast[0].v === messages[key]))
    .map(([key, ast]) => `${JSON.stringify(key)}: compiledFormatter(${JSON.stringify(ast)})`)
    .join(',');
  // The source catalog has already been parsed here. Omitted entries are exact one-node text literals.
  return `registerCompiledMessages(${tableName}, {${formatters}}, true);`;
}

async function catalogRegistration(name: typeof catalogNames[number]): Promise<string> {
  const path = `${i18nDir}catalogs/${name}.ts`;
  const source = await readFile(path, 'utf8');
  const mod = await loadModule(path, source);
  const tableName = catalogExports[name];
  const messages = stringTable(mod[tableName], tableName);
  return registration(tableName, messages);
}

async function sourceModule(): Promise<string> {
  const enPath = `${i18nDir}en.ts`;
  const enSource = await readFile(enPath, 'utf8');
  const en = await loadModule(enPath, enSource);
  const raw = en.EN;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('missing EN catalog export');
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || !('message' in value) || typeof value.message !== 'string') {
      throw new Error(`invalid EN catalog entry ${key}`);
    }
    messages[key] = value.message;
  }
  const reg = registration('EN', messages);
  return `
import type { Args } from './icu.ts';
import { compiledFormatter, formatCompiled, registerCompiledMessages } from './compiled-runtime.ts';
import { EN, MESSAGE_KEYS, type MessageKey } from './en.ts';
import { SOURCE_ONLY, dirOf, type LocaleDef } from './locales-core.ts';
export { EN, MESSAGE_KEYS, type MessageKey } from './en.ts';
export { offeredLocales, negotiateLocale, gate, dirOf, SOURCE_ONLY, type LocaleDef } from './locales-core.ts';
export type { Args } from './icu.ts';
export interface Translator { readonly locale: string; readonly dir: 'ltr' | 'rtl'; t(key: MessageKey, args?: Args): string; has(key: MessageKey): boolean; }
export interface TranslatorOptions { timeZone?: string; defs?: readonly LocaleDef[]; }
${reg}
export function createTranslator(locale: string, o: TranslatorOptions = {}): Translator {
  const defs = o.defs ?? SOURCE_ONLY;
  const def = defs.find((d) => d.tag === locale);
  const lang = locale.split('-')[0]!;
  const base = defs.find((d) => d.tag === lang);
  const fo = { locale, ...(o.timeZone === undefined ? {} : { timeZone: o.timeZone }) };
  const lookup = (key: MessageKey): string => {
    const entry = EN[key];
    const own = def?.messages[key] ?? (entry.sensitivity === 'guarantee' ? undefined : base?.messages[key]);
    if (own !== undefined) return own;
    if (locale !== 'en' && entry.sensitivity === 'guarantee' && def?.tier !== 'source') throw new Error(\`guarantee string \${key} is not available in \${locale}\`);
    return entry.message;
  };
  return { locale, dir: dirOf(locale, defs), t(key: MessageKey, args: Args = {}) { return formatCompiled(lookup(key), args, fo); }, has(key: MessageKey) { return key in EN; } };
}
export function format(src: string, args: Args, options: { locale: string; isolate?: boolean; timeZone?: string }): string { return formatCompiled(src, args, options); }
`;
}

/** esbuild-only substitution. Do not attach this plugin to the standalone verifier build. */
export function precompileI18nPlugin(): Plugin {
  let compiledIndex: string | undefined;
  return {
    name: 'quietvote-precompile-i18n',
    setup(build) {
      build.onStart(async () => {
        // Parsing every source table here makes malformed ICU a build error.
        compiledIndex = await sourceModule();
        for (const name of catalogNames) await catalogRegistration(name);
      });
      build.onResolve({ filter: /(?:^|[\\/])i18n[\\/]index\.ts$/ }, () => ({ path: i18nIndexPath, namespace: 'quietvote-compiled-i18n' }));
      build.onLoad({ filter: /.*/, namespace: 'quietvote-compiled-i18n' }, async () => ({
        contents: compiledIndex ?? await sourceModule(),
        loader: 'ts',
        resolveDir: i18nDir,
      }));
      build.onLoad({ filter: /[\\/]i18n[\\/]catalogs[\\/](?:es|fr|de|pt-BR|ar)\.ts$/ }, async (args) => {
        const normalizedPath = args.path.replace(/\\/g, '/');
        const name = /\/catalogs\/([^/]+)\.ts$/.exec(normalizedPath)?.[1] as typeof catalogNames[number] | undefined;
        if (name === undefined || !catalogNames.includes(name)) return;
        const source = await readFile(args.path, 'utf8');
        const mod = await loadModule(args.path, source);
        const tableName = catalogExports[name];
        const messages = stringTable(mod[tableName], tableName);
        return {
          contents: `${source}\nimport { compiledFormatter, registerCompiledMessages } from '../compiled-runtime.ts';\n${registration(tableName, messages)}\n`,
          loader: 'ts',
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}
