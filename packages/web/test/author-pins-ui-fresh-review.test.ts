// Actual SPA controller with a small DOM; these checks are not browser qualification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ApiClient } from '../src/api/client.ts';
import { LiveElection } from '../src/flow/live.ts';

class Element {
  children: Element[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();
  ownText = '';
  value = '';
  files: Array<{ size: number; text(): Promise<string> }> = [];
  readonly tag: string;
  constructor(tag = 'div') { this.tag = tag; }
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  set textContent(text: string) { this.ownText = text; this.children = []; }
  get firstChild(): Element | undefined { return this.children[0]; }
  append(...children: Element[]): void { this.children.push(...children); }
  removeChild(child: Element): void { this.children.splice(this.children.indexOf(child), 1); }
  replaceChildren(...children: Element[]): void { this.ownText = ''; this.children = children; }
  setAttribute(key: string, value: string): void { this.attrs.set(key, value); }
  getAttribute(key: string): string | null { return this.attrs.get(key) ?? null; }
  hasAttribute(key: string): boolean { return this.attrs.has(key); }
  removeAttribute(key: string): void { this.attrs.delete(key); }
  toggleAttribute(key: string, force = !this.hasAttribute(key)): void { if (force) this.setAttribute(key, ''); else this.removeAttribute(key); }
  addEventListener(type: string, callback: () => unknown): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]); }
  async dispatch(type: string): Promise<void> { await Promise.all((this.listeners.get(type) ?? []).map((callback) => callback())); }
  focus(): void {}
  find(predicate: (element: Element) => boolean): Element | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) { const found = child.find(predicate); if (found) return found; }
    return undefined;
  }
  querySelector(selector: string): Element | null {
    return this.find((element) => selector.startsWith('.') ? element.attrs.get('class')?.split(' ').includes(selector.slice(1)) === true : element.tag === selector) ?? null;
  }
}
const root = new Element(), html = new Element('html'), body = new Element('body'), events = new Element();
const place = new URL('https://review.invalid/verify');
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  documentElement: html, body, hidden: false,
  createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => { const node = new Element('#text'); node.textContent = text; return node; },
  createElementNS: (_namespace: string, tag: string) => new Element(tag),
  addEventListener: () => {}, getElementById: (id: string) => root.find((element) => element.attrs.get('id') === id),
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: events.addEventListener.bind(events), scrollTo: () => {} } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en'] } });
Object.defineProperty(globalThis, 'location', { configurable: true, value: place });
Object.defineProperty(globalThis, 'history', { configurable: true, value: { pushState: () => {}, replaceState: () => {} } });
Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: () => 0 });
const { startApp } = await import('../src/ui/app.ts');
startApp({ root: root as unknown as HTMLElement, storage: {} as any, build: { version: 'review', id: 'review' } });

const read = (name: string): any => JSON.parse(readFileSync(new URL(`../../../test-vectors/v1/elections/log-layer-4v/${name}`, import.meta.url), 'utf8'));
const good = JSON.stringify({ ...read('bundle.json'), board: read('board.json') });
const key = '12'.repeat(32);
const settle = async () => { await new Promise<void>((resolve) => setImmediate(resolve)); };
const main = () => root.find((element) => element.attrs.get('id') === 'main')!;
const file = () => main().find((element) => element.attrs.get('type') === 'file')!;
const keys = () => main().find((element) => element.tag === 'textarea')!;
const run = () => main().find((element) => element.tag === 'button' && element.textContent === 'Run checks')!;
const passed = () => main().textContent.includes('Supplied checks passed');
const failed = () => main().textContent.includes('A check failed');
function deferred() {
  let resolve!: (value: string) => void, reject!: (reason: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function heldValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 1000; attempt++) { if (predicate()) return; await settle(); }
  assert.fail(`UI did not settle: ${main().textContent}`);
}
async function select(readText: () => Promise<string>) {
  file().files = [{ size: good.length, text: readText }];
  await file().dispatch('change');
}
async function navigate(path: string) { place.pathname = path; await events.dispatch('popstate'); await settle(); }

test('fresh author-pin SPA: key edits remove prior verdicts and stale reads cannot replace a newer result', async () => {
  assert.equal(keys().value, '', 'trust starts empty');
  assert.match(main().textContent, /keys obtained separately from a trusted source/);
  await select(async () => good); await run().dispatch('click'); assert.equal(passed(), true);
  keys().value = key; await keys().dispatch('input'); assert.equal(passed(), false);
  for (const rejected of [false, true]) {
    keys().value = key; await keys().dispatch('input');
    const old = deferred(); await select(() => old.promise); void run().dispatch('click'); await settle();
    keys().value = 'invalid-key'; await keys().dispatch('input');
    await run().dispatch('click'); assert.equal(failed(), true);
    const before = main().textContent;
    if (rejected) old.reject(new Error('obsolete private failure')); else old.resolve(good);
    await settle(); await settle();
    assert.equal(main().textContent, before);
    assert.equal(passed(), false);
    assert.ok(!main().textContent.includes('obsolete private failure'));
  }
  keys().value = key; await keys().dispatch('input');
  await select(async () => good); await run().dispatch('click'); assert.equal(passed(), true);
});

test('fresh author-pin SPA: navigation invalidates both pending read outcomes and clears trusted keys on return', async () => {
  for (const rejected of [false, true]) {
    await navigate('/verify'); keys().value = key; await keys().dispatch('input');
    const old = deferred(); await select(() => old.promise); void run().dispatch('click'); await settle();
    await navigate('/help');
    const before = main().textContent;
    if (rejected) old.reject(new Error('obsolete route failure')); else old.resolve(good);
    await settle(); await settle();
    assert.equal(main().textContent, before);
    assert.equal(passed(), false);
    await navigate('/verify'); assert.equal(keys().value, '');
    assert.equal(passed(), false);
  }
});

test('fresh author-pin live results: key edits, navigation and a signed-record refresh invalidate pending evidence', async (t) => {
  const bundle = read('bundle.json'), board = read('board.json');
  const id = bundle.manifest.body.election_id;
  let entries = [...board.entries];
  let live: LiveElection | undefined;
  let exportGate: ReturnType<typeof heldValue<unknown>> | undefined;
  let exports = 0;
  t.mock.method(LiveElection.prototype, 'start', function(this: LiveElection) { live = this; });
  t.mock.method(ApiClient.prototype, 'election', async () => ({ election_id: id,
    origin: board.origin, title: bundle.manifest.body.title,
    log_pk: Buffer.from(bundle.manifest.body.bb.log_pk, 'hex').toString('base64url'),
    // Untrusted metadata is deliberately present and must not prefill user trust.
    extraAuthorKeys: [key], signing_key: key }));
  t.mock.method(ApiClient.prototype, 'allEntries', async (_id: string, from = 0) => ({ entries: entries.slice(from), tree_size: entries.length }));
  t.mock.method(ApiClient.prototype, 'roll', async () => ({ items: bundle.roll.map((pk: string) => ({ pk: Buffer.from(pk, 'hex').toString('base64url') })), next_cursor: null }));
  t.mock.method(ApiClient.prototype, 'exportWithBoard', async () => {
    exports++;
    const held = exportGate; exportGate = undefined;
    return held ? held.promise : { ...bundle, board, extraAuthorKeys: [key] };
  });
  await navigate(`/e/${id}/results`); await until(passed);
  assert.equal(keys().value, ''); assert.ok(main().find((element) => element.tag === 'table'));

  const edited = heldValue<unknown>(); exportGate = edited;
  keys().value = key; await keys().dispatch('input');
  const beforeEdit = exports, pendingEdit = run().dispatch('click');
  await until(() => exports > beforeEdit);
  keys().value = 'invalid'; await keys().dispatch('input');
  edited.resolve({ ...bundle, board }); await pendingEdit;
  assert.equal(passed(), false); assert.equal(main().find((element) => element.tag === 'table'), undefined);

  keys().value = key; await keys().dispatch('input');
  const departed = heldValue<unknown>(); exportGate = departed;
  const beforeRoute = exports, pendingRoute = run().dispatch('click'); await until(() => exports > beforeRoute);
  await navigate('/help'); const help = main().textContent;
  departed.resolve({ ...bundle, board }); await pendingRoute;
  assert.equal(main().textContent, help);

  await navigate(`/e/${id}/results`); await until(passed); assert.equal(keys().value, '');
  keys().value = key; await keys().dispatch('input');
  const superseded = heldValue<unknown>(); exportGate = superseded;
  const beforeLive = exports, pendingLive = run().dispatch('click'); await until(() => exports > beforeLive);
  // Append a second real signed tally record. The old board export cannot bind
  // the refreshed record snapshot, so old success must never restore results.
  entries = [...entries, { ...entries.at(-1), seq: entries.length }];
  assert.ok(live); await live.refresh(); await until(failed);
  assert.equal(keys().value, '', 'live refresh does not silently carry trusted pins');
  superseded.resolve({ ...bundle, board }); await pendingLive;
  assert.equal(passed(), false); assert.equal(main().find((element) => element.tag === 'table'), undefined);
  await navigate('/verify');
});
