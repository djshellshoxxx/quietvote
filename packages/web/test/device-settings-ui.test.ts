// SPDX-License-Identifier: AGPL-3.0-or-later
// Actual startApp behavior on a deterministic DOM/task harness. Browser layout/IndexedDB checks remain separate.
// @verifies QV-10-REQ-011, QV-13-REQ-060
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { FakeBoard } from './helpers/fake-board.ts';
import { startApp } from '../src/ui/app.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { defaultDeps, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import { keySlot } from '../src/flow/onboarding.ts';

type Listener = (event: { target: Element; currentTarget: Element; button: number; preventDefault(): void }) => unknown;
class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, Listener[]>();
  text = ''; value = ''; disabled = false; hidden = false; checked = false;
  writes: string[] = [];
  files: { size: number; text(): Promise<string> }[] = [];
  readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  set id(value: string) { this.attrs.set('id', value); }
  get id(): string { return this.attrs.get('id') ?? ''; }
  set className(value: string) { this.attrs.set('class', value); }
  set textContent(value: string) { this.text = value; this.children = []; this.writes.push(value); }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(key: string, value: string): void {
    this.attrs.set(key, value);
    if (key === 'disabled') this.disabled = true;
    if (key === 'hidden') this.hidden = true;
    if (key === 'checked') this.checked = true;
    if (key === 'value') this.value = value;
  }
  getAttribute(key: string): string | null { return this.attrs.get(key) ?? null; }
  hasAttribute(key: string): boolean { return this.attrs.has(key); }
  removeAttribute(key: string): void { this.attrs.delete(key); }
  append(...children: Element[]): void { this.children.push(...children); }
  replaceChildren(...children: Element[]): void { this.text = ''; this.children = children; }
  get firstChild(): Element | undefined { return this.children[0]; }
  removeChild(child: Element): void { this.children = this.children.filter((item) => item !== child); }
  addEventListener(key: string, listener: Listener): void { this.listeners.set(key, [...(this.listeners.get(key) ?? []), listener]); }
  dispatch(key: string): void { for (const listener of this.listeners.get(key) ?? []) void listener({ target: this, currentTarget: this, button: 0, preventDefault() {} }); }
  click(): void { if (!this.disabled) this.dispatch('click'); }
  toggle(checked: boolean): void { assert.equal(this.disabled, false); this.checked = checked; this.dispatch('change'); }
  focus(): void {}
  find(predicate: (element: Element) => boolean): Element[] { return [...(predicate(this) ? [this] : []), ...this.children.flatMap((child) => child.find(predicate))]; }
  querySelector(selector: string): Element | null { return this.find((element) => element.attrs.get('class')?.split(' ').includes(selector.slice(1)) === true)[0] ?? null; }
}
const root = new Element('root'), events = new Element('window');
const location = new URL('https://quietvote.test/');
const tasks = new Map<number, { delay: number; run(): void }>();
let nextTask = 0;
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  documentElement: new Element('html'), body: root, hidden: false, addEventListener() {},
  getElementById: (id: string) => root.find((element) => element.id === id)[0] ?? null,
  createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => { const element = new Element('#text'); element.textContent = text; return element; },
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: events.addEventListener.bind(events), scrollTo() {} } });
Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
Object.defineProperty(globalThis, 'history', { configurable: true, value: { pushState: (_state: unknown, _title: string, path: string) => { location.href = new URL(path, location).href; } } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en'] } });
Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: () => 0 });
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (run: () => void, delay = 0) => {
  const id = ++nextTask; tasks.set(id, { delay, run });
  if (delay === 0) setImmediate(() => { const task = tasks.get(id); tasks.delete(id); task?.run(); });
  return id;
} });
Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: (id: number) => { tasks.delete(id); } });
const sim = await setup({ seed: 'device-preferences-dom', n: 3, t: 2, voters: 4, minCounted: 3 });
const board = new FakeBoard(sim);
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: board.fetch });
const storage = new MemoryStorage();
startApp({ root: root as unknown as HTMLElement, storage, build: { version: 'test', id: 'device-preferences' } });
const get = (predicate: (element: Element) => boolean): Element => { const found = root.find(predicate)[0]; assert.ok(found); return found; };
const button = (text: string): Element => get((element) => element.tag === 'button' && element.textContent === text);
const link = (text: string): Element => get((element) => element.tag === 'a' && element.textContent === text);
const checkbox = (text: string): Element => get((element) => element.tag === 'label' && element.textContent.trim() === text).find((element) => element.tag === 'input')[0]!;
const shared = (): Element => checkbox('This is a shared or public device');
const remember = (): Element => checkbox('Remember receipts on this device');
const acknowledgment = (): Element => checkbox('I have read these rules and privacy limits');
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await tick();
    const ready = [...tasks].filter(([, task]) => task.delay <= 30);
    for (const [id, task] of ready) { tasks.delete(id); task.run(); }
  }
}
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 2000; i++) { await tick(); if (predicate()) return; }
  assert.fail('UI operation did not finish');
}
async function navigate(path: string): Promise<void> { location.pathname = path; events.dispatch('popstate'); await drain(); }
const main = (): Element => get((element) => element.tag === 'main');

test('actual SPA persists preferences, merges optional acknowledgments, and never clears existing device content', async () => {
  await drain();
  assert.equal(shared().checked, false); assert.equal(remember().checked, true);
  storage.receipts.push({ electionId: board.apiId, code: 'saved-code', seq: 1, json: '{}' });
  shared().toggle(true); remember().toggle(false); await drain();
  assert.equal((await storage.getSettings()).sharedDevice, true);
  assert.equal((await storage.getSettings()).rememberReceipts, false);
  assert.equal(storage.receipts.length, 1);
  await navigate(`/e/${board.apiId}/rules`);
  assert.equal(shared().checked, true); assert.equal(remember().checked, false);
  assert.equal(acknowledgment().checked, false);
  assert.equal(link('Continue').attrs.get('href'), `/e/${board.apiId}/key`);
  const writes = board.requests.filter((request) => request.method === 'POST').length;
  acknowledgment().toggle(true); await drain();
  assert.equal((await storage.getSettings()).rulesSeen[bytesToHex(sim.mh)], true);
  assert.equal(board.requests.filter((request) => request.method === 'POST').length, writes);
  await navigate(`/e/${board.apiId}/rules`);
  assert.equal(acknowledgment().checked, true);
  acknowledgment().toggle(false); await drain();
  link('Continue').click(); await drain();
  assert.ok(main().textContent.includes('Your voting key'));
  assert.equal((await storage.getSettings()).rulesSeen[bytesToHex(sim.mh)], false);
});

test('actual SPA reports failed reads and uncertain writes without silent defaults or a rules gate', async () => {
  const read = storage.getSettings.bind(storage), update = storage.updateSettings.bind(storage);
  storage.getSettings = async () => { throw new Error('denied'); };
  await navigate(`/e/${board.apiId}/rules`);
  assert.equal(shared().disabled, true); assert.equal(acknowledgment().disabled, true);
  assert.ok(main().textContent.includes('Could not confirm saved settings.'));
  assert.ok(main().textContent.includes('Optional. This note stays on this device.'));
  link('Continue').click(); await drain();
  assert.ok(main().textContent.includes('Your voting key'));
  storage.getSettings = read;
  await navigate('/');
  storage.updateSettings = async () => { throw new Error('aborted'); };
  shared().toggle(false); await drain();
  assert.equal(shared().checked, true); assert.equal(shared().disabled, true);
  assert.equal((await read()).sharedDevice, true);
  assert.ok(main().textContent.includes('Could not confirm saved settings.'));
  assert.ok(!main().textContent.includes('Done'));
  storage.updateSettings = update;
  button('Read device settings again').click(); await drain();
  assert.equal(shared().disabled, false); assert.equal(shared().checked, true);
});

test('actual SPA cancels stale settings updates and queued announcements after navigation', async () => {
  const update = storage.updateSettings.bind(storage);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  storage.updateSettings = async (change, current) => { await pending; return update(change, current); };
  shared().toggle(false); await tick();
  await navigate('/help');
  const live = get((element) => element.id === 'live-polite');
  const announcements = [...live.writes];
  release(); await drain();
  assert.equal((await storage.getSettings()).sharedDevice, true);
  assert.deepEqual(live.writes, announcements, 'late work must not touch the live region, even when its earlier text matches');
  assert.ok(!main().textContent.includes('Done'));
  storage.updateSettings = update;
  shared().toggle(false);
  await until(() => !shared().disabled); // Save has committed; the 30 ms announcement is still queued.
  location.pathname = '/'; events.dispatch('popstate'); await drain();
  assert.ok(!root.textContent.includes('Done'));
  assert.equal((await storage.getSettings()).sharedDevice, false);
});

test('actual ballot review identifies all method limits without gating blank ballots or leaking selections into settings', async () => {
  const passphrase = 'correct horse battery staple';
  const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('device-preferences-dom-key') }, FLOOR_PARAMS);
  await storage.putKey(keySlot(board.apiId), wrapped.container);
  await navigate(`/e/${board.apiId}/key`);
  get((element) => element.attrs.get('type') === 'password').value = passphrase;
  button('Unlock key').click();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await navigate(`/e/${board.apiId}/vote`);
  const before = structuredClone(await storage.getSettings());
  const notices = (): Element[] => main().find((element) => element.tag === 'p' && element.textContent === "You've selected fewer than the maximum. That is allowed.");
  button('Review my choices').click();
  assert.equal(notices().length, 4);
  assert.equal(button('Seal my ballot').disabled, false);
  button('Back').click();
  for (const value of ['yes', 'ann', 'a', 'b', 'p', 'q']) get((element) => element.tag === 'input' && element.attrs.get('value') === value).toggle(true);
  button('Review my choices').click();
  assert.equal(notices().length, 1);
  assert.ok(main().find((element) => element.tag === 'tr' && element.textContent.startsWith('Topics'))[0]!.textContent.includes('fewer than the maximum'));
  button('Back').click();
  for (const value of ['c', 'd']) get((element) => element.tag === 'input' && element.attrs.get('value') === value).toggle(true);
  button('Review my choices').click();
  assert.equal(notices().length, 0);
  assert.equal(get((element) => element.tag === 'table').attrs.get('translate'), 'no');
  assert.deepEqual(await storage.getSettings(), before, 'selections stay out of persistent settings');
  await navigate('/');
});
