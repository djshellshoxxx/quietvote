import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { buildSite } from '../src/build/site.ts';
import { LOCALE_META, type LocaleMeta } from '../src/i18n/locales-core.ts';
import { hasReviews, loadLocaleDefs } from '../src/i18n/runtime.ts';
import { gate, offeredLocales } from '../src/i18n/locales-core.ts';
import { ES } from '../src/i18n/catalogs/es.ts';
import { AR } from '../src/i18n/catalogs/ar.ts';

let built: Promise<{ dir: string; assets: { path: string; sha384: string }[] }> | undefined;
const build = (): Promise<{ dir: string; assets: { path: string; sha384: string }[] }> =>
  (built ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qvL-'));
    const r = await buildSite(dir);
    return { dir, assets: r.assets };
  })());

const text = (dir: string, p: string): string => readFileSync(join(dir, p), 'utf8');
/** esbuild writes non-ASCII as \\uXXXX escapes by default. */
const esc = (s: string): string => [...s].map((c) => (c.charCodeAt(0) > 126 ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c)).join('').toLowerCase();

test('build splits the app: translated catalogs and the results chart are separate chunks, not part of the entry', async () => {
  const { dir, assets } = await build();
  const names = readdirSync(join(dir, 'assets'));
  const entry = names.find((n) => /^app\.[0-9a-f]{12}\.js$/.test(n))!;
  assert.ok(entry);
  for (const l of ['es', 'fr', 'de', 'pt-BR', 'ar', 'charts']) assert.ok(names.some((n) => n.startsWith(`${l}-`) && n.endsWith('.js')), `chunk for ${l}`);
  const entryText = text(dir, `assets/${entry}`);
  // distinctive translated strings must be in their chunk only
  for (const [tag, sample] of [['es', ES['qv.shell.skip']], ['ar', AR['qv.shell.skip']]] as const) {
    assert.ok(sample.length > 5);
    assert.ok(!entryText.toLowerCase().includes(esc(sample)), `${tag} text is not in the entry`);
    const chunk = names.find((n) => n.startsWith(`${tag}-`))!;
    assert.ok(text(dir, `assets/${chunk}`).toLowerCase().includes(esc(sample)), `${tag} text is in its chunk`);
  }
  assert.ok(!entryText.includes('qv-bar-svg'), 'chart code is not in the entry');
  assert.ok(text(dir, `assets/${names.find((n) => n.startsWith('charts-'))!}`).includes('qv-bar-svg'));
  // the entry references its chunks by relative path and every referenced file exists
  const refs = [...entryText.matchAll(/import\("\.\/([A-Za-z0-9_.-]+\.js)"\)/g)].map((m) => m[1]!);
  assert.ok(refs.length >= 6, 'entry has dynamic imports for 5 catalogs and the chart');
  for (const r of refs) assert.ok(names.includes(r), `${r} exists`);
  // every emitted file is in the asset manifest with a matching digest
  const mani = JSON.parse(text(dir, 'asset-manifest.json')) as { client_assets: { path: string; sha384: string }[] };
  for (const n of names) {
    const m = mani.client_assets.find((x) => x.path === `assets/${n}`);
    assert.ok(m, `${n} is in the manifest`);
    assert.equal(createHash('sha384').update(readFileSync(join(dir, 'assets', n))).digest('hex'), m!.sha384);
  }
  assert.equal(mani.client_assets.length, assets.length);
});

test('index.html loads only the entry; the CSP still has no inline allowance and chunks fall under script-src self', async () => {
  const { dir } = await build();
  const html = text(dir, 'index.html');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0]!, /^\/assets\/app\.[0-9a-f]{12}\.js$/);
  assert.match(html, /script-src 'self';/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(html));
});

test('size: the initial JavaScript (entry, gzip) stays well under the 200 kB budget; the 200 kB limit itself is unchanged', async () => {
  const { dir } = await build();
  const names = readdirSync(join(dir, 'assets'));
  const entry = names.find((n) => /^app\./.test(n))!;
  const gz = gzipSync(readFileSync(join(dir, 'assets', entry))).length;
  assert.ok(gz < 110 * 1024, `entry is ${(gz / 1024).toFixed(1)} kB gzip`);
  const all = names.filter((n) => n.endsWith('.js')).reduce((a, n) => a + gzipSync(readFileSync(join(dir, 'assets', n))).length, 0);
  assert.ok(all < 200 * 1024, `all JS ${(all / 1024).toFixed(1)} kB gzip`);
  const cli = readFileSync(new URL('../src/build/cli.ts', import.meta.url), 'utf8');
  assert.ok(cli.includes('js > 200 * 1024'), 'budget check untouched');
  const site = readFileSync(new URL('../src/build/site.ts', import.meta.url), 'utf8');
  assert.ok(site.includes('>= 400 * 1024'), 'verifier.html limit untouched');
});

test('locale tables load only for locales that can be offered (no review record, no download)', async () => {
  const calls: string[] = [];
  const log = (t: string): void => { calls.push(t); };
  const loaders = Object.fromEntries(['es', 'fr', 'de', 'pt-BR', 'ar'].map((t) => [t, async () => { log(t); return {}; }]));
  const defs = await loadLocaleDefs(loaders);
  assert.deepEqual(calls, [], 'as shipped no table is fetched');
  assert.deepEqual(defs.map((d) => d.tag), LOCALE_META.map((m) => m.tag));
  assert.deepEqual(offeredLocales(defs).map((d) => d.tag), ['en']);
  assert.ok(LOCALE_META.every((m) => m.tier === 'source' || !hasReviews(m)), 'no review is claimed for any draft locale');
  // with a review record present the table is fetched (and the gate still decides)
  const meta: LocaleMeta[] = LOCALE_META.map((m) => (m.tag === 'es' ? { ...m, review: { 'qv.privacy.g1': 'x' } } : m));
  const defs2 = await loadLocaleDefs({ ...loaders, es: async () => { log('es'); return ES; } }, meta);
  assert.deepEqual(calls, ['es']);
  const es = defs2.find((d) => d.tag === 'es')!;
  assert.equal(es.messages['qv.shell.skip'], ES['qv.shell.skip']);
  assert.equal(gate(es).offered, false, 'a partial or stale review does not offer the locale');
  // a failed chunk fetch leaves the locale unoffered instead of breaking startup
  const defs3 = await loadLocaleDefs({ ...loaders, es: async () => { throw new Error('offline'); } }, meta);
  assert.deepEqual(defs3.find((d) => d.tag === 'es')!.messages, {});
});

test('main.ts loads locale tables before starting and passes them in; the app has no static import of the catalogs', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('loadLocaleDefs()') && main.includes('locales'));
  for (const f of ['../src/ui/app.ts', '../src/main.ts', '../src/i18n/index.ts', '../src/i18n/runtime.ts', '../src/i18n/locales-core.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/^import .*catalogs\//m.test(src), `${f} has no static catalog import`);
    assert.ok(!/from '\.\/locales\.ts'|from '\.\.\/i18n\/locales\.ts'/.test(src), `${f} does not pull the all-locales module`);
  }
});
