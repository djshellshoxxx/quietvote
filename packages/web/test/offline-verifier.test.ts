// Real shared verifier with a small DOM and a deterministic task queue. Browser coverage lives in e2e/verifier.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

class Element {
  children: Element[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, () => void>();
  text = '';
  value: string | number = '';
  max = 1;
  disabled = false;
  hidden = false;
  files: { size: number; text(): Promise<string> }[] = [];
  set textContent(text: string) { this.text = text; this.children = []; }
  get textContent(): string { return this.text + this.children.map((e) => e.textContent).join(''); }
  setAttribute(key: string, value: string): void { this.attrs.set(key, value); }
  append(...children: Element[]): void { this.children.push(...children); }
  replaceChildren(...children: Element[]): void { this.text = ''; this.children = children; }
  addEventListener(type: string, callback: () => void): void { this.listeners.set(type, callback); }
  dispatch(type: string): void { this.listeners.get(type)?.(); }
  focus(): void { focused = this; }
}
let focused: Element | undefined;
const nodes = new Map(['file', 'anchor', 'run', 'cancel', 'progress', 'progress-detail', 'out', 'live'].map((id) => [id, new Element()]));
const node = (id: string): Element => nodes.get(id)!;
const windowEvents = new Element();
Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: node, createElement: () => new Element() } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: windowEvents });
const tasks: (() => void)[] = [];
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (callback: () => void) => { tasks.push(callback); return 0; } });
await import('../src/verifier/page.ts');
const good = readFileSync(new URL('../../../test-vectors/v1/elections/tiny-yesno-3v/bundle.json', import.meta.url), 'utf8');
const settle = async (): Promise<void> => { await new Promise<void>((resolve) => setImmediate(resolve)); };
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    await settle();
    if (predicate()) return;
    assert.ok(tasks.length, 'verification must finish or yield a task');
    tasks.shift()!();
  }
  assert.fail('bounded task queue did not settle');
}
const select = (text: () => Promise<string>): void => {
  node('file').files = [{ size: good.length, text }];
  node('file').dispatch('change');
};
const finished = (): boolean => !node('run').disabled;
const pass = (): boolean => node('out').textContent.includes('Supplied checks passed');
const fail = (): boolean => node('out').textContent.includes('A check failed');
function deferred() {
  let resolve!: (text: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('offline controls cancel suspended ballot work, retry, and discard old catch/finally', async () => {
  select(async () => good); node('run').dispatch('click');
  await until(() => node('progress-detail').textContent.startsWith('Checking ballot proofs:'));
  assert.equal(node('run').disabled, true);
  assert.equal(node('cancel').disabled, false);
  assert.equal(node('out').attrs.get('aria-busy'), 'true');
  node('cancel').dispatch('click');
  assert.equal(focused, node('run'));
  assert.match(node('out').textContent, /cancelled.*No report/);
  assert.equal(pass(), false);
  select(async () => '{'); node('run').dispatch('click');
  await until(finished);
  assert.equal(fail(), true);
  assert.equal(node('cancel').disabled, true);
  assert.equal(node('out').attrs.get('aria-busy'), 'false');
  select(async () => good); node('run').dispatch('click');
  await until(finished); assert.equal(pass(), true);
});

test('file replacement ignores delayed read success and rejection after a newer verdict', async () => {
  for (const rejected of [false, true]) {
    const old = deferred(); select(() => old.promise); node('run').dispatch('click');
    select(async () => '{'); node('run').dispatch('click');
    await until(finished); assert.equal(fail(), true);
    const message = node('out').textContent;
    if (rejected) old.reject(new Error('late failure')); else old.resolve(good);
    await settle();
    assert.equal(node('out').textContent, message);
    assert.equal(node('run').disabled, false);
    assert.equal(tasks.length, 0, 'an obsolete file read never enters verification');
  }
});

test('anchor edits and pagehide invalidate pending runs and previous verdicts', async () => {
  select(async () => good); node('run').dispatch('click');
  await until(finished); assert.equal(pass(), true);
  node('anchor').value = 'different'; node('anchor').dispatch('input');
  assert.equal(pass(), false);
  node('anchor').value = ''; node('anchor').dispatch('input');
  for (const event of ['input', 'pagehide']) {
    const old = deferred(); select(() => old.promise); node('run').dispatch('click');
    if (event === 'input') node('anchor').dispatch(event); else windowEvents.dispatch(event);
    old.resolve(good); await settle();
    assert.equal(pass(), false); assert.equal(finished(), true);
    assert.equal(tasks.length, 0);
  }
});

test('a current unreadable file fails and permits retry', async () => {
  select(async () => { throw new Error('file unreadable'); }); node('run').dispatch('click');
  await until(finished); assert.equal(fail(), true); assert.match(node('out').textContent, /file unreadable/);
  select(async () => good); node('run').dispatch('click');
  await until(finished); assert.equal(pass(), true);
});
