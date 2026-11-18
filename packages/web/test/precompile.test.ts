import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { argNames, format, parse, type Args, type Node } from '../src/i18n/icu.ts';
import { EN } from '../src/i18n/en.ts';
import { ES } from '../src/i18n/catalogs/es.ts';
import { FR } from '../src/i18n/catalogs/fr.ts';
import { DE } from '../src/i18n/catalogs/de.ts';
import { PT_BR } from '../src/i18n/catalogs/pt-BR.ts';
import { AR } from '../src/i18n/catalogs/ar.ts';
import { compiledFormatter, formatCompiled, registerCompiledMessages } from '../src/i18n/compiled-runtime.ts';
import { compileCatalog, precompileI18nPlugin } from '../src/build/precompile.ts';

const catalogs: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ['en', Object.fromEntries(Object.entries(EN).map(([key, entry]) => [key, entry.message]))],
  ['es', ES], ['fr', FR], ['de', DE], ['pt-BR', PT_BR], ['ar', AR],
];

function representativeArgs(nodes: readonly Node[]): Args {
  const args: Record<string, string | number | Date | readonly string[]> = {};
  const visit = (list: readonly Node[]): void => {
    for (const node of list) {
      if (node.k === 'arg' && args[node.name] === undefined) args[node.name] = 'Example';
      else if (node.k === 'num' && args[node.name] === undefined) args[node.name] = 2;
      else if (node.k === 'date' && args[node.name] === undefined) args[node.name] = new Date('2026-01-02T03:04:05Z');
      else if (node.k === 'list' && args[node.name] === undefined) args[node.name] = ['Alpha', 'Beta'];
      else if (node.k === 'select') {
        if (args[node.name] === undefined) args[node.name] = Object.keys(node.cases).find((key) => key !== 'other') ?? 'other';
        for (const body of Object.values(node.cases)) visit(body);
      } else if (node.k === 'plural') {
        if (args[node.name] === undefined) args[node.name] = 2;
        for (const body of Object.values(node.cases)) visit(body);
      }
    }
  };
  visit(nodes);
  return args;
}

test('precompiled formatters match the source formatter across every catalog message', () => {
  for (const [locale, table] of catalogs) {
    const asts = compileCatalog(table);
    for (const [key, source] of Object.entries(table)) {
      const ast = asts[key]!;
      const args = representativeArgs(ast);
      const options = { locale };
      assert.equal(compiledFormatter(ast)(args, options), format(source, args, options), `${locale}:${key}`);
    }
  }
});

test('compiled runtime preserves plural, select, and bidi formatting and accepts registered custom sources', () => {
  const source = '{n, plural, one {# vote} other {{name} has # votes}} — {mode, select, short {short} other {full}}';
  const ast = parse(source);
  const args = { n: 2, name: 'Ada', mode: 'short' };
  registerCompiledMessages({ custom: source }, { custom: compiledFormatter(ast) });
  assert.equal(formatCompiled(source, args, { locale: 'en' }), format(source, args, { locale: 'en' }));
  const bidi = 'Hello {name}';
  registerCompiledMessages({ customBidi: bidi }, { customBidi: compiledFormatter(parse(bidi)) });
  assert.equal(formatCompiled(bidi, { name: 'Ada' }, { locale: 'en' }), `Hello ⁨Ada⁩`);
  assert.ok(argNames(ast).has('name'));
});

test('build-time catalog compilation rejects invalid ICU messages', () => {
  assert.throws(() => compileCatalog({ broken: '{name' }), /IcuSyntaxError/);
});

test('esbuild substitutes the source translator, keeps lazy locale chunks, and omits the runtime parser', async () => {
  const testDir = fileURLToPath(new URL('.', import.meta.url));
  const webDir = resolve(testDir, '..');
  const result = await build({
    absWorkingDir: webDir,
    entryPoints: ['fixture.ts'],
    outdir: 'out',
    bundle: true,
    splitting: true,
    format: 'esm',
    write: false,
    metafile: true,
    plugins: [precompileI18nPlugin(), {
        name: 'precompile-test-entry',
        setup(p) {
          p.onResolve({ filter: /^fixture\.ts$/ }, () => ({ path: 'fixture.ts', namespace: 'precompile-test' }));
          p.onResolve({ filter: /ui\.ts$/ }, () => ({ path: 'ui.ts', namespace: 'precompile-test-ui' }));
          p.onLoad({ filter: /.*/, namespace: 'precompile-test' }, () => ({
            contents: `
              import { createTranslator, format as precompiledFormat, SOURCE_ONLY } from './i18n/index.ts';
              import { make as fromUi } from './ui.ts';
              import { ES } from '../src/i18n/catalogs/es.ts';
              import { AR } from '../src/i18n/catalogs/ar.ts';
              import { FR } from '../src/i18n/catalogs/fr.ts';
              import { DE } from '../src/i18n/catalogs/de.ts';
              import { PT_BR } from '../src/i18n/catalogs/pt-BR.ts';
              import { loadLocaleDefs } from '../src/i18n/runtime.ts';
              import { LOCALE_META } from '../src/i18n/locales-core.ts';
              export const registeredTables = [ES, FR, DE, PT_BR, AR];
              export const uiLocale = fromUi();
              export function formatMessage(source, args, locale) { return precompiledFormat(source, args, { locale }); }
              export async function run() {
                const esMeta = { tag:'es', dir:'ltr', autonym:'Español', tier:1, review:{} };
                const arMeta = { tag:'ar', dir:'rtl', autonym:'العربية', tier:1, review:{} };
                const es = createTranslator('es', { defs:[...SOURCE_ONLY, {...esMeta, messages:ES}] });
                const ar = createTranslator('ar', { defs:[...SOURCE_ONLY, {...arMeta, messages:AR}] });
                const base = createTranslator('es-MX', { defs:[...SOURCE_ONLY, {...esMeta, messages:ES}, {...esMeta, tag:'es-MX', messages:{}}] });
                const sourceFallback = createTranslator('xx', { defs:[...SOURCE_ONLY, {...esMeta, tag:'xx', messages:{}}] });
                const missingGuarantee = createTranslator('es', { defs:[...SOURCE_ONLY, {...esMeta, messages:{}}] });
                let guaranteeThrows = false;
                try { missingGuarantee.t('qv.privacy.headline'); } catch (e) { guaranteeThrows = String(e).includes('not available in es'); }
                let loaderCalled = false;
                const lazyDefs = await loadLocaleDefs({ es: async () => { loaderCalled = true; return ES; } });
                return {
                  en:createTranslator('en').t('qv.app.name'),
                  es:es.t('qv.home.title'),
                  ar:ar.t('qv.home.title'),
                  base:base.t('qv.home.title'),
                  sourceFallback:sourceFallback.t('qv.home.title'),
                  guaranteeThrows,
                  loaderCalled,
                  esLoaded:Object.keys(lazyDefs.find(d => d.tag === 'es').messages).length,
                  esReviewCount:Object.keys(LOCALE_META.find(d => d.tag === 'es').review).length,
                };
              }
            `,
            loader: 'ts',
            resolveDir: testDir,
          }));
          p.onLoad({ filter: /.*/, namespace: 'precompile-test-ui' }, () => ({
            contents: `import { createTranslator } from '../i18n/index.ts'; export function make(){ return createTranslator('en').t('qv.app.name'); }`,
            loader: 'ts',
            resolveDir: resolve(webDir, 'src/ui'),
          }));
        },
    }],
  });
  const output = result.outputFiles.map((file) => file.text).join('\n');
  assert.equal(output.includes('IcuSyntaxError'), false);
  assert.equal(/function parse\s*\(/.test(output), false);
  assert.equal(output.includes('identifier expected'), false);
  assert.match(output, /function evaluate\s*\(/);
  assert.ok(output.includes('Votos privados que cualquiera puede comprobar'));
  assert.ok(Object.keys(result.metafile!.outputs).length > 1, JSON.stringify(Object.keys(result.metafile!.outputs)));
  const inputs = Object.keys(result.metafile!.inputs).map((path) => path.replace(/\\/g, '/'));
  assert.ok(inputs.some((path) => path.endsWith('/catalogs/es.ts')));
  assert.ok(inputs.some((path) => path.endsWith('/catalogs/ar.ts')));
  assert.equal(inputs.filter((path) => path.includes('/src/i18n/index.ts')).length, 1, JSON.stringify(inputs.filter((path) => path.includes('/src/i18n/index.ts'))));
  const temp = await mkdtemp(join(tmpdir(), 'quietvote-precompile-'));
  try {
    await writeFile(join(temp, 'package.json'), JSON.stringify({ type: 'module' }));
    for (const file of result.outputFiles) {
      const outputPath = isAbsolute(file.path) ? relative(webDir, file.path) : file.path;
      const target = join(temp, outputPath);
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, file.contents);
    }
    const entry = result.outputFiles.find((file) => file.path.replace(/\\/g, '/').endsWith('/out/fixture.js'));
    assert.ok(entry, 'entry output should be present');
    const built = await import(`${pathToFileURL(join(temp, isAbsolute(entry.path) ? relative(webDir, entry.path) : entry.path)).href}?test=${Date.now()}`);
    assert.deepEqual(await built.run(), {
      en: 'QuietVote',
      es: 'Votos privados que cualquiera puede comprobar',
      ar: 'اقتراعات خاصة يستطيع أي شخص التحقق منها',
      base: 'Votos privados que cualquiera puede comprobar',
      sourceFallback: 'Private votes that anyone can check',
      guaranteeThrows: true,
      loaderCalled: false,
      esLoaded: 0,
      esReviewCount: 0,
    });
    assert.equal(built.uiLocale, 'QuietVote');
    for (const [locale, table] of catalogs) {
      for (const source of Object.values(table)) {
        const ast = parse(source);
        const args = representativeArgs(ast);
        const options = { locale };
        let actual: string;
        try { actual = built.formatMessage(source, args, locale); }
        catch (error) { throw new Error(`${locale}: ${source.slice(0, 80)}`, { cause: error }); }
        assert.equal(actual, format(source, args, options), `${locale}:${source.slice(0, 60)}`);
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
