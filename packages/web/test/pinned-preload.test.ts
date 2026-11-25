import assert from 'node:assert/strict';
import { test } from 'node:test';

// Each browser realm gets its own module instance; fresh imports isolate the injected test documents.
let instance = 0;
const fresh = (): Promise<typeof import('../src/util/pinned-preload.ts')> => import(new URL(`../src/util/pinned-preload.ts?case=${++instance}`, import.meta.url).href);

class Pin {
  readonly rel = 'modulepreload';
  readonly crossOrigin = 'anonymous';
  onload: ((event: Event) => unknown) | undefined;
  onerror: ((event: Event) => unknown) | undefined;
  readonly relList: { supports: (rel: string) => boolean };
  readonly rawHref: string | null;
  readonly integrity: string;
  readonly supported: boolean;
  constructor(rawHref: string | null = '/assets/charts.js', integrity = 'sha384-test', supported = true) {
    this.rawHref = rawHref; this.integrity = integrity; this.supported = supported;
    this.relList = { supports: (rel) => supported && rel === this.rel };
  }
  // Like HTMLLinkElement, an empty present href resolves to the document URL.
  get href(): string { return this.rawHref === null ? '' : new URL(this.rawHref, 'https://vote.example/results').href; }
  getAttribute(name: string): string | null { return name === 'href' ? this.rawHref : null; }
  cloneNode(): Pin { return new Pin(this.rawHref, this.integrity, this.supported); }
}

function documentOf(pins: Pin[]): { doc: Document; appended: Pin[] } {
  const appended: Pin[] = [];
  const doc = {
    querySelectorAll: (selector: string) => { assert.equal(selector, 'link[rel=modulepreload]'); return pins; },
    head: { append: (pin: Pin) => { appended.push(pin); } },
  } as unknown as Document;
  return { doc, appended };
}

test('W15: no document in Node tooling requires no browser preload', async () => {
  const { pinnedPreloads } = await fresh();
  await pinnedPreloads();
});

test('W15: all pinned loads must finish; concurrent and later calls reuse the same check', async () => {
  const { pinnedPreloads } = await fresh();
  const pins = [new Pin('/assets/dependency.js'), new Pin()];
  const { doc, appended } = documentOf(pins);
  let done = false;
  const first = pinnedPreloads(doc).then(() => { done = true; });
  const second = pinnedPreloads(doc);
  assert.equal(appended.length, 2);
  assert.ok(appended.every((p, i) => p !== pins[i] && p.integrity === pins[i]!.integrity && p.crossOrigin === 'anonymous'));
  appended[0]!.onload!(new Event('load'));
  await Promise.resolve(); assert.equal(done, false);
  appended[1]!.onload!(new Event('load'));
  await Promise.all([first, second]); assert.equal(done, true);
  await pinnedPreloads(doc); assert.equal(appended.length, 2, 'no additional fetch pass after success');
});

test('W15: a rejected preload prevents imports and remains rejected after later load events', async () => {
  const { pinnedPreloads } = await fresh();
  const { doc, appended } = documentOf([new Pin(), new Pin('/assets/dependency.js')]);
  let imported = false;
  const request = pinnedPreloads(doc).then(() => { imported = true; });
  appended[0]!.onerror!(new Event('error'));
  await assert.rejects(request);
  appended[0]!.onload!(new Event('load')); appended[1]!.onload!(new Event('load'));
  await assert.rejects(pinnedPreloads(doc));
  assert.equal(imported, false);
  assert.equal(appended.length, 2, 'a failed check does not retry or fall through to import');
});

for (const [name, pins] of [
  ['missing pin set', []], ['absent href', [new Pin(null)]], ['empty href', [new Pin('')]],
  ['missing integrity', [new Pin('/assets/charts.js', '')]], ['unsupported modulepreload', [new Pin('/assets/charts.js', 'sha384-test', false)]],
] as const) {
  test(`W15: ${name} rejects promptly without relying on browser load/error events`, async () => {
    const { pinnedPreloads } = await fresh();
    const { doc, appended } = documentOf([...pins]);
    if (name === 'empty href') assert.equal(pins[0]!.href, 'https://vote.example/results', 'resolved href alone cannot detect an empty attribute');
    const state = await Promise.race([
      pinnedPreloads(doc).then(() => 'loaded', () => 'refused'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);
    assert.equal(state, 'refused');
    assert.equal(appended.length, 0);
  });
}

test('W15: a failed integrity check leaves a reviewed locale unoffered without invoking its loader', async () => {
  const { loadLocaleDefs } = await import('../src/i18n/runtime.ts');
  const { LOCALE_META } = await import('../src/i18n/locales-core.ts');
  const meta = [{ ...LOCALE_META.find((m) => m.tag === 'es')!, review: { 'qv.privacy.g1': 'synthetic-review' } }];
  const { doc, appended } = documentOf([new Pin()]);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  let imports = 0;
  const loaders = { es: async () => { imports++; return {}; } };
  try {
    const loading = loadLocaleDefs(loaders, meta);
    assert.equal(appended.length, 1);
    assert.equal(imports, 0, 'reviewed catalogs still wait for the integrity gate');
    appended[0]!.onerror!(new Event('error'));
    assert.deepEqual((await loading)[0]!.messages, {});
    assert.deepEqual((await loadLocaleDefs(loaders, meta))[0]!.messages, {});
    assert.equal(imports, 0, 'a failed or retried load cannot evaluate the catalog');
    assert.equal(appended.length, 1, 'the failure stays cached for this realm');
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
