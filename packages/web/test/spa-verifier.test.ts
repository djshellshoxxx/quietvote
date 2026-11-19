// Exercise the real SPA and shared verifier with a deterministic browser task queue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MemoryStorage } from '../src/key/storage.ts';
import { startApp } from '../src/ui/app.ts';

class Element {
  children: Element[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, (() => void)[]>();
  text = '';
  value = '';
  disabled = false;
  hidden = false;
  files: { size: number; text(): Promise<string> }[] = [];
  readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  set id(v: string) { this.attrs.set('id', v); }
  get id(): string { return this.attrs.get('id') ?? ''; }
  set textContent(v: string) { this.text = v; this.children = []; }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); if (k === 'disabled') this.disabled = true; if (k === 'hidden') this.hidden = true; }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  append(...kids: Element[]): void { this.children.push(...kids); }
  replaceChildren(...kids: Element[]): void { this.text = ''; this.children = kids; }
  get firstChild(): Element | undefined { return this.children[0]; }
  removeChild(c: Element): void { this.children = this.children.filter((x) => x !== c); }
  addEventListener(k: string, f: () => void): void { this.listeners.set(k, [...(this.listeners.get(k) ?? []), f]); }
  dispatch(k: string): void { for (const f of this.listeners.get(k) ?? []) f(); }
  click(): void { if (!this.disabled) this.dispatch('click'); }
  focus(): void { focused = this; }
  find(p: (e: Element) => boolean): Element[] { return [...(p(this) ? [this] : []), ...this.children.flatMap((e) => e.find(p))]; }
  querySelector(selector: string): Element | null { return this.find((e) => e.attrs.get('class') === selector.slice(1))[0] ?? null; }
}
let focused: Element | undefined;
const root = new Element('root'), events = new Element('window');
const tasks: (() => void)[] = [];
const location = new URL('https://quietvote.test/verify');
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  documentElement: new Element('html'), body: root, addEventListener: () => {},
  createElement: (t: string) => new Element(t), createTextNode: (v: string) => { const e = new Element('#text'); e.textContent = v; return e; },
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: events.addEventListener.bind(events), scrollTo: () => {} } });
Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en'] } });
Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: () => 0 });
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (f: () => void) => { tasks.push(f); return 0; } });
startApp({ root: root as unknown as HTMLElement, storage: new MemoryStorage(), build: { version: 'test', id: 'test' } });
const get = (p: (e: Element) => boolean): Element => { const e = root.find(p)[0]; assert.ok(e); return e; };
const button = (text: string): Element => get((e) => e.tag === 'button' && e.textContent === text);
const file = (): Element => get((e) => e.tag === 'input' && e.attrs.get('type') === 'file');
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../test-vectors/v1/elections/log-layer-4v/${name}.json`, import.meta.url), 'utf8'));
const good = JSON.stringify({ ...(read('bundle') as object), board: read('board') });
const settle = async (): Promise<void> => { await new Promise<void>((r) => setImmediate(r)); };
async function until(p: () => boolean): Promise<void> {
  for (let n = 0; n < 1000; n++) { await settle(); if (p()) return; assert.ok(tasks.length, 'verification must finish or yield'); tasks.shift()!(); }
  assert.fail('verification did not settle');
}
async function drain(): Promise<void> { for (let n = 0; n < 1000; n++) { await settle(); if (!tasks.length) return; tasks.shift()!(); } assert.fail('task queue did not drain'); }
function select(text: () => Promise<string>): void { file().files = [{ size: good.length, text }]; file().dispatch('change'); }
const passed = (): boolean => root.find((e) => e.tag === 'h2' && e.textContent === 'Supplied checks passed').length > 0;
const ballotWork = (): boolean => root.find((e) => e.tag === 'progress' && !e.hidden && e.attrs.get('data-stage') === 'ballots').length > 0;

test('SPA verifier yields during ballot work, cancels without a verdict, and retries', async () => {
  select(async () => good); button('Run checks').click();
  await until(ballotWork);
  assert.equal(button('Run checks').disabled, true);
  assert.equal(button('Cancel').disabled, false);
  button('Cancel').click();
  assert.match(root.textContent, /Verification cancelled\. No report was produced\./);
  assert.equal(passed(), false);
  assert.equal(focused, button('Run checks'));
  select(async () => good); button('Run checks').click();
  await until(() => !button('Run checks').disabled);
  assert.equal(passed(), true);
  assert.equal(button('Cancel').disabled, true);
});

test('SPA edits invalidate pending reads and an old rejection cannot replace a new verdict', async () => {
  let reject!: (e: Error) => void;
  select(() => new Promise<string>((_r, no) => { reject = no; })); button('Run checks').click();
  select(async () => good); button('Run checks').click();
  await until(() => !button('Run checks').disabled); assert.equal(passed(), true);
  reject(new Error('obsolete read failed')); await drain();
  assert.equal(passed(), true);
  const input = get((e) => e.tag === 'input' && e.attrs.get('type') === 'text');
  input.value = 'changed'; input.dispatch('input'); assert.equal(passed(), false);
  input.value = ''; input.dispatch('input');
});

test('SPA navigation and pagehide stop active verification without stale output', async () => {
  for (const kind of ['pagehide', 'popstate']) {
    select(async () => good); button('Run checks').click(); await until(ballotWork);
    if (kind === 'popstate') location.pathname = '/';
    events.dispatch(kind); await drain();
    assert.equal(passed(), false);
    if (kind === 'pagehide') assert.equal(button('Run checks').disabled, false);
    else assert.ok(root.find((e) => e.tag === 'input' && e.attrs.get('type') === 'file').length === 0);
  }
});
