// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-10-REQ-010: real startApp and real checked snapshots, no unlocked key or login.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from '../src/ui/app.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { standingApi, standingBoard, standingFixture } from './helpers/standing-fixture.ts';
import type { FetchLike } from '../src/api/client.ts';

const fixture = await standingFixture('web-standing-ui');
const api = standingApi(fixture.sim, fixture.election);
type Listener = (event: { target: Element; currentTarget: Element; button: number; preventDefault(): void }) => unknown;
class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, Listener[]>();
  text = ''; value = ''; disabled = false; hidden = false; checked = false;
  writes: string[] = [];
  files: { size: number; text(): Promise<string> }[] = [];
  parent: Element | undefined;
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
  append(...children: Element[]): void { for (const child of children) { child.remove(); child.parent = this; this.children.push(child); } }
  replaceChildren(...children: Element[]): void { for (const child of [...this.children]) child.remove(); this.text = ''; this.append(...children); }
  get firstChild(): Element | undefined { return this.children[0]; }
  removeChild(child: Element): void { this.children = this.children.filter((item) => item !== child); child.parent = undefined; }
  remove(): void { this.parent?.removeChild(this); }
  showModal(): void {}
  close(): void {}
  addEventListener(key: string, listener: Listener): void { this.listeners.set(key, [...(this.listeners.get(key) ?? []), listener]); }
  dispatch(key: string): void { for (const listener of this.listeners.get(key) ?? []) void listener({ target: this, currentTarget: this, button: 0, preventDefault() {} }); }
  click(): void { if (this.disabled) return; this.dispatch('click'); }
  toggle(checked: boolean): void { assert.equal(this.disabled, false); this.checked = checked; this.dispatch('change'); }
  focus(): void { focused = this; }
  find(predicate: (element: Element) => boolean): Element[] { return [...(predicate(this) ? [this] : []), ...this.children.flatMap((child) => child.find(predicate))]; }
  querySelector(selector: string): Element | null { return this.find((element) => element.attrs.get('class')?.split(' ').includes(selector.slice(1)) === true)[0] ?? null; }
}
let focused: Element | undefined;
const root = new Element('root'), events = new Element('window'), documentEvents = new Element('document');
const intervals: (() => void)[] = [];
const location = new URL('https://quietvote.test/');
const tasks = new Map<number, { delay: number; run(): void }>();
let nextTask = 0;
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  documentElement: new Element('html'), body: root, hidden: false, addEventListener: documentEvents.addEventListener.bind(documentEvents),
  getElementById: (id: string) => root.find((element) => element.id === id)[0] ?? null,
  createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => { const element = new Element('#text'); element.textContent = text; return element; },
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: events.addEventListener.bind(events), scrollTo() {} } });
Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
Object.defineProperty(globalThis, 'history', { configurable: true, value: { pushState: (_state: unknown, _title: string, path: string) => { location.href = new URL(path, location).href; } } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en'], clipboard: { writeText: async () => {} } } });
Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: (run: () => void) => { intervals.push(run); return intervals.length; } });
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (run: () => void, delay = 0) => {
  const id = ++nextTask; tasks.set(id, { delay, run });
  if (delay === 0) setImmediate(() => { const task = tasks.get(id); tasks.delete(id); task?.run(); });
  return id;
} });
Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: (id: number) => { tasks.delete(id); } });

let override: FetchLike | undefined;
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (input: string, init?: RequestInit) => {
  const url = new URL(input, location);
  assert.equal(init?.method, 'GET', 'receipt checking never writes to the board');
  if (url.pathname.endsWith('/events')) return new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener('abort', () => { try { controller.close(); } catch { /* already cancelled */ } }, { once: true });
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  if (override && (url.pathname.endsWith('/export.json') || url.pathname.endsWith('/log/checkpoint'))) return override(input, init);
  return api.fetch(input, init);
} });
const storage = new MemoryStorage();
const saved = api.receiptFile(fixture.old);
await storage.putReceipt({ electionId: api.apiId, code: fixture.old.code, seq: fixture.old.seq, json: JSON.stringify(saved) });
let pinWrites = 0;
const putHead = storage.putHead.bind(storage);
storage.putHead = async (head) => { pinWrites++; await putHead(head); };
location.pathname = `/e/${api.apiId}/receipt`;
startApp({ root: root as unknown as HTMLElement, storage, build: { version: 'test', id: 'test' } });
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1500; i++) {
    await tick();
    if (predicate()) return;
    for (const [id, task] of [...tasks].filter(([, task]) => task.delay <= 30)) { tasks.delete(id); task.run(); }
  }
  assert.fail('receipt UI did not settle');
}
async function drain(): Promise<void> {
  for (let i = 0; i < 15; i++) { await tick(); for (const [id, task] of [...tasks].filter(([, task]) => task.delay <= 30)) { tasks.delete(id); task.run(); } }
}
const get = (predicate: (element: Element) => boolean): Element => { const element = root.find(predicate)[0]; assert.ok(element); return element; };
const button = (text: string): Element => get((element) => element.tag === 'button' && element.textContent === text);
const codeInput = (): Element => root.find((element) => element.tag === 'input' && element.attrs.get('type') === 'text')[0]!;
const pinInput = (): Element => root.find((element) => element.tag === 'input' && element.attrs.get('type') === 'text')[1]!;
const fileInput = (): Element => get((element) => element.tag === 'input' && element.attrs.get('type') === 'file');
const panels = (): Element[] => root.find((element) => element.attrs.get('class')?.split(' ').includes('qv-standing') === true);
const included = (): boolean => /Included in the public record at entry/.test(root.textContent);
async function reset(): Promise<void> {
  const previous = root.find((element) => element.tag === 'input' && element.attrs.get('type') === 'text')[0];
  override = undefined; location.pathname = `/e/${api.apiId}/receipt`; events.dispatch('popstate');
  await until(() => root.find((element) => element.tag === 'button' && element.textContent === 'Check ballot code').length === 1 && !button('Check ballot code').disabled && codeInput() !== previous);
}
function typeCode(code = fixture.old.code, pin = fixture.election.manifest_hash): void {
  codeInput().value = code; codeInput().dispatch('input'); pinInput().value = pin; pinInput().dispatch('input');
}
const complete = async (): Promise<void> => { await until(() => !button('Check ballot code').disabled && panels().length === 1); };
function checkSnapshot(state: 'superseded' | 'counted' | 'unverified', code = fixture.old.code): void {
  assert.equal(included(), true); assert.equal(panels().length, 1);
  const panel = panels()[0]!;
  assert.equal(panel.attrs.get('data-ballot-code'), code); assert.ok(panel.attrs.get('class')?.split(' ').includes(state));
  assert.match(panel.textContent, /does not establish that the record is up to date or that the result is final/);
  assert.doesNotMatch(panel.textContent, /\byour\b|\bLatest\b|counts instead|Only your newest/i);
}

test('typed code keeps verified inclusion without an independent status anchor or a voting key', async () => {
  await reset();
  assert.equal(panels().length, 0, 'saved receipts make no unchecked standing claim');
  const downloads = api.requests.filter((request) => request.path.includes('/export.json')).length;
  typeCode(fixture.old.code, ''); button('Check ballot code').click(); await complete();
  checkSnapshot('unverified'); assert.match(panels()[0]!.textContent, /separate trusted source/);
  assert.equal(api.requests.filter((request) => request.path.includes('/export.json')).length, downloads);
  assert.equal(storage.keys.size, 0);
});

test('typed, uploaded and saved receipts share one exact-code qualified standing operation', async () => {
  for (const source of ['typed', 'file', 'saved']) {
    await reset(); typeCode();
    if (source === 'typed') button('Check ballot code').click();
    else if (source === 'saved') button('Check').click();
    else { fileInput().files = [{ size: JSON.stringify(saved).length, text: async () => JSON.stringify(saved) }]; fileInput().dispatch('change'); }
    await complete(); checkSnapshot('superseded');
    assert.ok(panels()[0]!.textContent.includes(fixture.middle.code));
    assert.ok(panels()[0]!.textContent.includes(`entry #${fixture.middle.seq}`));
    assert.equal(storage.keys.size, 0);
  }
});

test('edits and missing codes clear all previous standing instead of retaining a file or saved status', async () => {
  await reset(); typeCode(); button('Check').click(); await complete(); checkSnapshot('superseded');
  codeInput().value = 'ab'.repeat(32); codeInput().dispatch('input');
  assert.equal(panels().length, 0); assert.equal(included(), false);
  button('Check ballot code').click(); await until(() => !button('Check ballot code').disabled);
  assert.match(root.textContent, /Not found \(yet\)/); assert.equal(panels().length, 0);
});

test('status failures and incomplete tallies preserve inclusion without untrusted diagnostics', async () => {
  for (const response of ['CANARY<svg/onload=alert(1)>', 'incomplete']) {
    await reset(); typeCode();
    const noTally = { ...fixture.election, log: fixture.election.log.slice(0, -1) };
    override = async (input, init) => input.includes('/export.json') ? new Response(response === 'incomplete' ? standingBoard(fixture.sim, noTally).text : response) : api.fetch(input, init);
    button('Check ballot code').click(); await complete(); checkSnapshot('unverified');
    assert.ok(!root.textContent.includes('CANARY')); assert.equal(root.find((element) => element.tag === 'svg').length, 0);
    if (response === 'incomplete') assert.match(panels()[0]!.textContent, /not established while voting is open/);
  }
});

test('cancelling a delayed status download and starting a new file check suppresses the old result', async () => {
  await reset(); typeCode();
  let release!: (response: Response) => void, requestSignal: AbortSignal | null | undefined;
  override = async (input, init) => input.includes('/export.json') ? new Promise<Response>((resolve) => { release = resolve; requestSignal = init?.signal; }) : api.fetch(input, init);
  button('Check ballot code').click(); await until(() => release !== undefined);
  assert.equal(included(), true); button('Cancel').click(); assert.equal(requestSignal?.aborted, true);
  assert.equal(focused, button('Check ballot code'));
  assert.equal(panels().length, 0); assert.match(root.textContent, /Verification cancelled/);
  override = undefined;
  const latest = JSON.stringify(api.receiptFile(fixture.latest));
  fileInput().files = [{ size: latest.length, text: async () => latest }]; fileInput().dispatch('change');
  await complete(); checkSnapshot('counted', fixture.latest.code);
  release(new Response(api.text)); await drain(); checkSnapshot('counted', fixture.latest.code);
});

test('cooperative ballot-work cancellation produces no completed status and permits a retry', async () => {
  await reset(); typeCode(); button('Check ballot code').click();
  await until(() => root.find((element) => element.tag === 'progress' && !element.hidden && element.attrs.get('data-stage') === 'ballots').length === 1);
  button('Cancel').click(); await drain(); assert.equal(panels().length, 0);
  button('Check ballot code').click(); await complete(); checkSnapshot('superseded');
});

for (const event of ['input', 'pagehide', 'navigation']) test(`late inclusion cannot write a pin or status after ${event} invalidation`, async () => {
  await reset(); typeCode();
  let release!: (response: Response) => void;
  override = async (input, init) => input.endsWith('/log/checkpoint') ? new Promise<Response>((resolve) => { release = resolve; }) : api.fetch(input, init);
  const before = pinWrites;
  button('Check ballot code').click(); await until(() => release !== undefined);
  if (event === 'input') { codeInput().value = fixture.latest.code; codeInput().dispatch('input'); }
  else if (event === 'pagehide') events.dispatch('pagehide');
  else { location.pathname = '/'; events.dispatch('popstate'); }
  release(new Response(api.head.note)); await drain();
  assert.equal(pinWrites, before); assert.equal(panels().length, 0);
});
