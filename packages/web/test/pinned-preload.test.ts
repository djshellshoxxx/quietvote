// QV-ADR-027 W15: lazy imports wait for every integrity-pinned modulepreload and are refused when one fails.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pinnedPreloads, resetPinnedPreloads } from '../src/util/pinned-preload.ts';
import { loadLocaleDefs } from '../src/i18n/runtime.ts';
import { LOCALE_META, type LocaleMeta } from '../src/i18n/locales-core.ts';
import { ES } from '../src/i18n/catalogs/es.ts';

type Outcome = 'load' | 'error' | 'never';
function fakeDoc(links: Record<string, string>, outcome: (href: string) => Outcome) {
  const created: { href: string; integrity: string; rel: string; crossOrigin: string | null; removed: boolean }[] = [];
  const doc = {
    querySelectorAll: (sel: string) => {
      assert.equal(sel, 'link[rel="modulepreload"][integrity]');
      return Object.entries(links).map(([href, integrity]) => ({ getAttribute: (n: string) => (n === 'href' ? href : n === 'integrity' ? integrity : null) }));
    },
    createElement: (tag: 'link') => {
      assert.equal(tag, 'link');
      const fns: Record<string, () => void> = {};
      const l = { rel: '', href: '', integrity: '', crossOrigin: null as string | null, removed: false, addEventListener: (t: string, f: () => void) => { fns[t] = f; }, remove: () => { l.removed = true; } };
      created.push(l);
      return Object.assign(l, { fire: () => { const o = outcome(l.href); if (o !== 'never') queueMicrotask(() => fns[o]!()); } });
    },
    head: { append: (l: { fire(): void }) => { l.fire(); } },
  };
  return { doc: doc as unknown as NonNullable<Parameters<typeof pinnedPreloads>[0]>, created };
}

test('W15: every pinned preload is re-requested with the same integrity; all load -> resolves, links removed, memoized', async () => {
  resetPinnedPreloads();
  const { doc, created } = fakeDoc({ '/assets/app.js': 'sha384-A', '/assets/charts-X.js': 'sha384-C' }, () => 'load');
  await pinnedPreloads(doc);
  assert.deepEqual(created.map((l) => [l.rel, l.href, l.integrity, l.crossOrigin, l.removed]), [
    ['modulepreload', '/assets/app.js', 'sha384-A', 'anonymous', true],
    ['modulepreload', '/assets/charts-X.js', 'sha384-C', 'anonymous', true],
  ]);
  await pinnedPreloads(doc);
  assert.equal(created.length, 2, 'a module already in the map is not requested again');
});

test('W15 negative: one failed (tampered) preload rejects, and keeps rejecting', async () => {
  resetPinnedPreloads();
  const { doc, created } = fakeDoc({ '/assets/app.js': 'sha384-A', '/assets/charts-X.js': 'sha384-BAD' }, (h) => (h.includes('charts') ? 'error' : 'load'));
  await assert.rejects(pinnedPreloads(doc), /integrity-pinned module failed to load: \/assets\/charts-X\.js/);
  await assert.rejects(pinnedPreloads(doc), /charts-X/);
  assert.ok(created.every((l) => l.removed));
});

test('W15 negative: a preload without href or integrity is refused instead of waiting for an event that never comes', async () => {
  resetPinnedPreloads();
  await assert.rejects(pinnedPreloads(fakeDoc({ '': 'sha384-A' }, () => 'never').doc), /without href or integrity/);
  resetPinnedPreloads();
  await assert.rejects(pinnedPreloads(fakeDoc({ '/assets/x.js': '' }, () => 'never').doc), /without href or integrity/);
});

test('W15 negative: a reviewed catalog is not imported when the pinned preloads fail (locale stays unoffered)', async () => {
  resetPinnedPreloads();
  const meta: LocaleMeta[] = LOCALE_META.map((m) => (m.tag === 'es' ? { ...m, review: { 'qv.privacy.g1': 'x' } } : m));
  const g = globalThis as { document?: unknown };
  g.document = fakeDoc({ '/assets/es-X.js': 'sha384-BAD' }, () => 'error').doc;
  try {
    const defs = await loadLocaleDefs(undefined, meta);
    assert.deepEqual(defs.find((d) => d.tag === 'es')!.messages, {});
    resetPinnedPreloads();
    g.document = fakeDoc({ '/assets/es-X.js': 'sha384-OK' }, () => 'load').doc;
    const ok = await loadLocaleDefs(undefined, meta);
    assert.equal(ok.find((d) => d.tag === 'es')!.messages['qv.shell.skip'], ES['qv.shell.skip'], 'positive control: the same path imports once the preloads load');
  } finally {
    delete g.document; resetPinnedPreloads();
  }
});

test('W15 wiring: every lazy import() in the app waits for pinnedPreloads() first', () => {
  const runtime = readFileSync(new URL('../src/i18n/runtime.ts', import.meta.url), 'utf8');
  const imports = [...runtime.matchAll(/import\('\.\/catalogs\/[^']+'\)/g)];
  assert.equal(imports.length, 5);
  assert.equal([...runtime.matchAll(/\{ await pinnedPreloads\(\); return \(await import\('\.\/catalogs\//g)].length, 5);
  const app = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.equal([...app.matchAll(/import\('/g)].length, 1, 'the chart is the only lazy import in app.ts');
  assert.match(app, /if \(await pinnedPreloads\(\)\.then\(\(\) => true, \(\) => false\)\) \{\n\s+const charts = await import\('\.\/charts\.ts'\)/);
});
