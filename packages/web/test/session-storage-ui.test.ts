// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-26-REQ-011, QV-10-REQ-020, QV-19-REQ-008
// Actual startApp on the deterministic DOM/task adapter; the production device journey separately exercises IndexedDB.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamRng } from '@quietvote/crypto';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { FakeBoard } from './helpers/fake-board.ts';
import { startApp } from '../src/ui/app.ts';
import { MemoryStorage, type DeviceStorage } from '../src/key/storage.ts';
import { StorageSession } from '../src/key/storage-session.ts';
import { createSigner } from '../src/key/signer.ts';
import { boardStorage } from '../src/key/board-storage.ts';
import { defaultDeps, serializeContainer, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import { keySlot } from '../src/flow/onboarding.ts';
import { parseBallotCodeInput } from '../src/flow/receipt-code.ts';

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
  click(): void { if (this.disabled) return; if (this.tag === 'a' && this.attrs.has('download')) downloads.push({ name: this.attrs.get('download')!, blob: blobs.get(this.attrs.get('href')!)! }); this.dispatch('click'); }
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


const blobs = new Map<string, Blob>(), downloads: { name: string; blob: Blob }[] = [];
URL.createObjectURL = (blob: Blob): string => { const url = `blob:session-${blobs.size}`; blobs.set(url, blob); return url; };
URL.revokeObjectURL = () => {};
const sim = await setup({ seed: 'page-session-storage', n: 3, t: 2, voters: 4, minCounted: 3 });
let board = new FakeBoard(sim), otherBoard = new FakeBoard(sim);
const id = board.apiId, page = location.origin, remote = 'https://other-board.test';
const requests: { method: string; origin: string; body?: string }[] = [];
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (input: string, init?: RequestInit) => {
  const url = new URL(String(input), page);
  requests.push({ method: init?.method ?? 'GET', origin: url.origin, ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
  assert.equal(url.hash, '');
  if (url.pathname.endsWith('/events')) return new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  assert.ok(url.origin === page || url.origin === remote);
  return (url.origin === page ? board : otherBoard).fetch(url.pathname + url.search, init);
} });
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) { await tick(); for (const [id, task] of [...tasks].filter(([, task]) => task.delay <= 30)) { tasks.delete(id); task.run(); } }
}
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 5000; i++) { await tick(); if (predicate()) return; } assert.fail('UI operation did not finish'); }
const get = (predicate: (element: Element) => boolean, label = 'element'): Element => { const found = root.find(predicate)[0]; assert.ok(found, `${label} not found`); return found; };
const hasButton = (text: string): boolean => root.find((element) => element.tag === 'button' && element.textContent === text).length > 0;
const button = (text: string): Element => get((element) => element.tag === 'button' && element.textContent === text, text);
const main = (): Element => get((element) => element.tag === 'main');
const field = (label: string): Element => {
  const name = get((element) => element.tag === 'label' && element.textContent.trim() === label, label);
  return name.attrs.has('for') ? get((element) => element.id === name.attrs.get('for')) : name.children.find((element) => element.tag === 'input')!;
};
async function navigate(view: string, hash = location.hash): Promise<void> {
  location.pathname = view === '/' ? '/' : `/e/${id}/${view}`; location.hash = hash; events.dispatch('popstate'); await drain();
}
let started = false;
async function boot(blocked = true, view = 'key') {
  if (started) await navigate('/', '');
  events.listeners.clear(); documentEvents.listeners.clear(); tasks.clear(); intervals.length = 0; downloads.length = 0;
  focused = undefined;
  board = new FakeBoard(sim); otherBoard = new FakeBoard(sim); requests.length = 0;
  const durable = new MemoryStorage(), status = { blocked, clears: 0 };
  const refused = new Proxy(durable, { get(target, name) {
    const value: unknown = Reflect.get(target, name);
    if (typeof value !== 'function') return value;
    return (...args: unknown[]): unknown => {
      if (name === 'clearAll') status.clears++;
      if (status.blocked) return Promise.reject(new Error('IndexedDB denied'));
      return Reflect.apply(value, target, args);
    };
  } }) as DeviceStorage;
  const session = new StorageSession(refused);
  location.href = `${page}/e/${id}/${view}`;
  startApp({ root: root as unknown as HTMLElement, storage: refused, storageSession: session, boardOrigins: [remote], build: { version: 'test', id: 'session' } });
  started = true; await drain();
  return { durable, status, session };
}
const passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('session-key') }, FLOOR_PARAMS);
const otherKey = await wrapSeed(sim.voters[1]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('other-session-key') }, FLOOR_PARAMS);
const postCount = (): number => requests.filter((request) => request.method === 'POST').length;

for (const sessionOnly of [false, true]) test(`confirmed ${sessionOnly ? 'page-session' : 'device'} clearing remains visible after a live-stream failure`, async () => {
  const { session, durable, status } = await boot(sessionOnly);
  if (sessionOnly) { button('Use this page only').click(); await drain(); }
  await session.current.putKey(keySlot(id), wrapped.container);
  if (sessionOnly) await durable.putKey('inaccessible-sentinel', otherKey.container);
  await navigate('key');
  assert.ok(hasButton('Unlock key'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => new URL(String(input), page).pathname.endsWith('/events')
    ? new Response('{}', { status: 404 }) : originalFetch(input, init);
  try {
    button(sessionOnly ? 'Clear this page session' : 'Clear this device').click();
    const dialog = get((element) => element.tag === 'dialog');
    dialog.find((element) => element.tag === 'button' && element.textContent !== 'Cancel')[0]!.click();
    await drain();
    assert.deepEqual(await session.current.listKeySlots(), []);
    const message = sessionOnly
      ? 'This page session was cleared. Saved browser data was not cleared.'
      : 'This device has been cleared. If you saved your receipt file, you can still check your ballot later.';
    assert.ok(main().textContent.includes(message),
      'successful clearing needs a visible confirmation independent of the shared live announcer');
    assert.equal(focused?.textContent, message, 'focus presents the confirmation without adding another live region');
    if (sessionOnly) {
      assert.equal(await durable.getKey('inaccessible-sentinel'), otherKey.container);
      assert.equal(status.clears, 0);
    }
  } finally { globalThis.fetch = originalFetch; await navigate('/', ''); }
});

test('cancelled or failed clearing never shows a success confirmation or removes the saved key', async () => {
  const { durable, status } = await boot(false);
  await durable.putKey(keySlot(id), wrapped.container); await navigate('key');
  button('Clear this device').click();
  get((element) => element.tag === 'dialog').find((element) => element.tag === 'button' && element.textContent === 'Cancel')[0]!.click();
  await drain();
  assert.equal(status.clears, 0);
  assert.equal(main().textContent.includes('This device has been cleared.'), false);
  status.blocked = true;
  button('Clear this device').click();
  get((element) => element.tag === 'dialog').find((element) => element.tag === 'button' && element.textContent !== 'Cancel')[0]!.click();
  await drain();
  assert.equal(status.clears, 1);
  assert.equal(main().textContent.includes('This device has been cleared.'), false);
  assert.equal(await durable.getKey(keySlot(id)), wrapped.container);
  status.blocked = false; await navigate('key');
  assert.ok(hasButton('Unlock key'));
});

for (const clearBeforeResponse of [false, true]) test(`late receipt handoff ${clearBeforeResponse ? 'cannot reinstall a result after explicit clearing' : 'refreshes a returned pending view once and preserves the download opt-out'}`, async () => {
  const { session, durable } = await boot(false);
  await durable.putKey(keySlot(id), wrapped.container);
  await navigate('key'); await unlock();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await session.current.updateSettings((settings) => ({ ...settings, rememberReceipts: false }));
  await navigate('vote');
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => root.find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  const originalFetch = globalThis.fetch;
  let submitted!: () => void, release!: () => void;
  const sawPost = new Promise<void>((resolve) => { submitted = resolve; });
  const holdResponse = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (String(input).endsWith('/log/entries') && init?.method === 'POST') { submitted(); await holdResponse; }
    return response;
  };
  try {
    button('Send my vote').click(); await sawPost;
    await navigate('rules'); await navigate('vote');
    assert.equal(hasButton('Save receipt file'), false);
    if (clearBeforeResponse) {
      button('Clear this device').click();
      const dialog = get((element) => element.tag === 'dialog');
      const confirm = dialog.find((element) => element.tag === 'button' && element.textContent !== 'Cancel');
      assert.equal(confirm.length, 1); confirm[0]!.click(); await drain();
      assert.deepEqual(await session.current.listKeySlots(), []);
    }
    release(); await drain();
    assert.equal(postCount(), 1);
    assert.deepEqual(await session.current.getReceipts(id), []);
    if (clearBeforeResponse) {
      await navigate('vote');
      assert.equal(hasButton('Save receipt file'), false, 'a completed old response cannot repopulate cleared session state');
      assert.equal(await session.current.getPendingCast(board.origin, id), undefined);
    } else {
      await until(() => hasButton('Save receipt file'));
      assert.ok(main().textContent.includes('Your vote was recorded. Here is your receipt.'));
      assert.equal(hasButton('Send my vote'), false);
      button('Save receipt file').click();
      const receipt = JSON.parse(await downloads.at(-1)!.blob.text());
      assert.equal(receipt.format, 'qv-receipt/1'); assert.equal(receipt.election, id);
      await navigate('rules'); await navigate('vote');
      assert.ok(hasButton('Review my choices'), 'a result that was presented does not become a new unresolved-vote gate');
      assert.equal(hasButton('Save receipt file'), false, 'the public handoff is consumed after its first presentation');
      assert.deepEqual(await session.current.getReceipts(id), []);
    }
  } finally { release(); globalThis.fetch = originalFetch; }
});

async function unlock(): Promise<void> {
  field('Passphrase').value = passphrase; button('Unlock key').click();
  await until(() => hasButton('Download key file'));
}
async function sealAndSend(): Promise<void> {
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => root.find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  button('Send my vote').click();
  await until(() => !main().textContent.includes('Sending your ballot'));
}

test('actual overview and key refusals require a choice, preserve normal retry, and never infer an empty durable store', async () => {
  const { durable, status, session } = await boot(true, '');
  await durable.putKey(keySlot(id), wrapped.container);
  assert.equal(session.isSession, false); assert.ok(hasButton('Use this page only'));
  assert.equal(postCount(), 0);
  status.blocked = false; button('Retry browser storage').click(); await drain();
  assert.equal(session.isSession, false); assert.equal(hasButton('Use this page only'), false);
  await navigate('key'); await unlock();
  await until(() => main().textContent.includes('You are on the voter list.'));
  // A settings refusal after unlock offers the same explicit switch; the prior signer must be invalidated.
  const savedKey = await durable.getKey(keySlot(id));
  status.blocked = true; field('This is a shared or public device').toggle(true); await drain();
  button('Use this page only').click(); await drain();
  assert.equal(session.isSession, true); assert.equal(await session.current.requestPersistence(), false);
  assert.equal(await session.current.getKey(keySlot(id)), undefined);
  assert.equal(await durable.getKey(keySlot(id)), savedKey); assert.equal(status.clears, 0);
  assert.ok(root.textContent.includes('can make its keys, receipts and pending ballots unavailable'));
  assert.ok(root.textContent.includes('Leaving does not guarantee erasure; use Clear this page session to clear its data from the app.'));
  await navigate('vote'); assert.equal(hasButton('Review my choices'), false);
  assert.ok(main().textContent.includes('Your key is locked.'));
});

test('actual session import requires a key download, keeps exact retry bytes across routes, and refuses other board, read key or signing key contexts', async () => {
  const { durable, status, session } = await boot();
  button('Use this page only').click(); await drain();
  field('Use a key file I saved before').dispatch('change');
  const text = serializeContainer(wrapped.container);
  field('Key file').files = [{ size: text.length, text: async () => text }];
  field('Passphrase').value = passphrase; button('Create key').click();
  await until(() => hasButton('Download key file'));
  assert.ok(main().textContent.includes('Download your key file before continuing.'));
  assert.equal(postCount(), 0);
  await navigate('vote'); assert.equal(hasButton('Review my choices'), false);
  assert.ok(main().textContent.includes('Download your key file before continuing.'));
  await navigate('key'); await unlock(); button('Download key file').click();
  await until(() => main().textContent.includes('You are on the voter list.'));
  assert.equal(downloads.length, 1); assert.equal(downloads[0]!.name.endsWith('.qvkey'), true);
  assert.deepEqual(JSON.parse(await downloads[0]!.blob.text()), wrapped.container);
  await session.current.updateSettings((settings) => ({ ...settings, rememberReceipts: false }));
  await navigate('vote'); board.faults = ['drop-response'];
  await sealAndSend(); await until(() => main().textContent.includes("We\'re not sure your ballot arrived"));
  const pending = await session.current.getPendingCast(board.origin, id); assert.ok(pending);
  assert.equal(postCount(), 1); const original = requests.find((request) => request.method === 'POST')!.body;
  await navigate('rules');
  await navigate('vote', `#board=${encodeURIComponent(remote)}`);
  assert.equal(hasButton('Send my vote'), false); assert.equal(hasButton('Review my choices'), false);
  await navigate('vote', '#read=sessionReadKey0001');
  assert.equal(hasButton('Send my vote'), false, 'a new credential context may only check the public marker');
  assert.equal(hasButton('Review my choices'), false); assert.equal(postCount(), 1);
  await navigate('vote', '');
  assert.ok(hasButton('Send my vote')); assert.equal(hasButton('Review my choices'), false);
  button('Save ballot code').click();
  const codeFile = downloads.at(-1)!; assert.equal(codeFile.name, 'qv-ballot-code.txt');
  const codeLines = (await codeFile.blob.text()).trim().split('\n');
  assert.equal(codeLines[0], id); assert.equal(codeLines.length, 2);
  assert.deepEqual(parseBallotCodeInput(codeLines[1]!), { kind: 'hex', value: pending.code });
  button('Send my vote').click();
  await until(() => main().textContent.includes('Your vote was recorded. Here is your receipt.'));
  assert.equal(postCount(), 2); assert.equal(requests.filter((request) => request.method === 'POST')[1]!.body, original);
  assert.equal(board.entries.filter((entry) => (entry.record as { intent?: string }).intent === 'cast').length, 1);
  assert.equal(await session.current.getPendingCast(board.origin, id), undefined);
  assert.deepEqual(await session.current.getReceipts(id), [], 'receipt opt-out does not remove the download');
  button('Save receipt file').click();
  const receipt = JSON.parse(await downloads.at(-1)!.blob.text());
  assert.equal(receipt.format, 'qv-receipt/1'); assert.equal(receipt.ballot_code, pending.code);
  // A second unresolved send cannot be replayed after the stored signing identity changes.
  await navigate('vote'); board.faults = ['network']; await sealAndSend();
  await until(() => main().textContent.includes("We\'re not sure your ballot arrived"));
  const second = await session.current.getPendingCast(board.origin, id); assert.ok(second);
  const before = postCount();
  await session.current.putKey(keySlot(id), otherKey.container);
  await navigate('rules'); await navigate('vote');
  assert.equal(hasButton('Send my vote'), false); assert.equal(hasButton('Review my choices'), false); assert.equal(postCount(), before);
  assert.deepEqual(await session.current.getPendingCast(board.origin, id), second);
  await session.current.putKey(keySlot(id), wrapped.container); await navigate('vote');
  assert.equal(hasButton('Send my vote'), false, 'restoring a key cannot revive a discarded retry controller');
  assert.equal((await boardStorage(session.current, remote, page).listKeySlots()).length, 0);
  await durable.putKey('inaccessible-sentinel', otherKey.container);
  button('Clear this page session').click();
  const dialog = get((element) => element.tag === 'dialog');
  dialog.find((element) => element.tag === 'button' && element.textContent === 'Clear this page session')[0]!.click(); await drain();
  assert.deepEqual(await session.current.listKeySlots(), []);
  assert.equal(await session.current.getPendingCast(board.origin, id), undefined);
  assert.equal(await durable.getKey('inaccessible-sentinel'), otherKey.container); assert.equal(status.clears, 0);
  assert.ok(root.textContent.includes('Saved browser data was not cleared.'));
});

test('actual persistent ballot refuses a storage-mode switch after the ballot begins and retries storage in place', async () => {
  const { durable, status, session } = await boot(false);
  await durable.putKey(keySlot(id), wrapped.container); await navigate('key'); await unlock();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await navigate('vote'); assert.ok(hasButton('Review my choices'));
  status.blocked = true; field('This is a shared or public device').toggle(true); await drain();
  assert.ok(root.textContent.includes('A ballot has started.'));
  assert.equal(hasButton('Use this page only'), false); assert.equal(session.selectSession(), false);
  assert.equal(session.isSession, false); assert.ok(hasButton('Review my choices'));
  status.blocked = false; button('Retry browser storage').click(); await drain();
  assert.ok(hasButton('Review my choices')); assert.equal(session.isSession, false);
  assert.equal(postCount(), 0); await navigate('/', '');
});

// No voter key is unlocked in this case: only an organizer's short-lived guarded signer is held.
test('actual app warns and expires an organizer-only protected signer on interval, pointer and keyboard boundaries', async () => {
  const realNow = Date.now;
  let clock = realNow(), active: StorageSession | undefined;
  Date.now = () => clock;
  try {
    for (const trigger of ['interval', 'pointerdown', 'keydown']) {
      clock = realNow();
      const { session } = await boot(false); active = session;
      const signer = await createSigner(new Uint8Array(32).fill(40));
      await session.protectSigner(async () => signer, () => true);
      assert.equal(intervals.length, 1);
      clock += 8 * 60_000; intervals[0]!();
      assert.ok(hasButton('Stay unlocked'), `${trigger}: organizer-only key receives the unchanged two-minute warning`);
      clock += 2 * 60_000; intervals[0]!();
      assert.equal(signer.locked, false, `${trigger}: the exact ten-minute boundary retains the existing strict policy`);
      clock++;
      if (trigger === 'interval') intervals[0]!(); else documentEvents.dispatch(trigger);
      assert.equal(signer.locked, true, `${trigger}: expiry locks before activity can reset the timer`);
      await assert.rejects(signer.sign(new Uint8Array([1])));
    }
  } finally { active?.lockSigners(); Date.now = realNow; }
});

test('independent: a successful cast completed while away still offers its returned receipt with remembering off', async () => {
  const { session } = await boot();
  button('Use this page only').click(); await drain();
  field('Use a key file I saved before').dispatch('change');
  const text = serializeContainer(wrapped.container);
  field('Key file').files = [{ size: text.length, text: async () => text }];
  field('Passphrase').value = passphrase; button('Create key').click();
  await until(() => hasButton('Download key file'));
  button('Download key file').click();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await session.current.updateSettings((settings) => ({ ...settings, rememberReceipts: false }));
  await navigate('vote');
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => root.find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  const originalFetch = globalThis.fetch;
  let submitted!: () => void, release!: () => void;
  const sawPost = new Promise<void>((resolve) => { submitted = resolve; });
  const holdResponse = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (String(input).endsWith('/log/entries') && init?.method === 'POST') { submitted(); await holdResponse; }
    return response;
  };
  try {
    button('Send my vote').click();
    await sawPost;
    assert.ok(await session.current.getPendingCast(board.origin, id));
    await navigate('rules');
    release(); await drain();
    assert.equal(await session.current.getPendingCast(board.origin, id), undefined, 'response was processed and verified');
    assert.deepEqual(await session.current.getReceipts(id), [], 'receipt remembering remains off');
    assert.equal(postCount(), 1);
    await navigate('vote');
    assert.ok(hasButton('Save receipt file'), 'the signed response must remain available when the voter returns');
  } finally { release(); globalThis.fetch = originalFetch; }
});

test('independent: a durable-mode successful cast completed while away still offers its returned receipt with remembering off', async () => {
  const { session, durable } = await boot(false);
  await durable.putKey(keySlot(id), wrapped.container);
  await navigate('key'); await unlock();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await session.current.updateSettings((settings) => ({ ...settings, rememberReceipts: false }));
  await navigate('vote');
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => root.find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  const originalFetch = globalThis.fetch;
  let submitted!: () => void, release!: () => void;
  const sawPost = new Promise<void>((resolve) => { submitted = resolve; });
  const holdResponse = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (String(input).endsWith('/log/entries') && init?.method === 'POST') { submitted(); await holdResponse; }
    return response;
  };
  try {
    button('Send my vote').click();
    await sawPost;
    assert.ok(await session.current.getPendingCast(board.origin, id));
    await navigate('rules');
    release(); await drain();
    assert.equal(await session.current.getPendingCast(board.origin, id), undefined, 'response was processed and verified');
    assert.deepEqual(await session.current.getReceipts(id), [], 'receipt remembering remains off');
    assert.equal(postCount(), 1);
    await navigate('vote');
    assert.ok(hasButton('Save receipt file'), 'the signed response must remain available when the voter returns');
  } finally { release(); globalThis.fetch = originalFetch; }
});

test('independent: an inclusion alarm completed while away still offers its returned receipt with remembering off', async () => {
  const { session } = await boot();
  button('Use this page only').click(); await drain();
  field('Use a key file I saved before').dispatch('change');
  const text = serializeContainer(wrapped.container);
  field('Key file').files = [{ size: text.length, text: async () => text }];
  field('Passphrase').value = passphrase; button('Create key').click();
  await until(() => hasButton('Download key file'));
  button('Download key file').click();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await session.current.updateSettings((settings) => ({ ...settings, rememberReceipts: false }));
  await navigate('vote');
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => root.find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  const originalFetch = globalThis.fetch;
  let submitted!: () => void, release!: () => void;
  const sawPost = new Promise<void>((resolve) => { submitted = resolve; });
  const holdResponse = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (String(input).endsWith('/log/entries') && init?.method === 'POST') { submitted(); await holdResponse; }
    return response;
  };
  try {
    board.tamper.inclusionPath = true;
    button('Send my vote').click();
    await sawPost;
    assert.ok(await session.current.getPendingCast(board.origin, id));
    await navigate('rules');
    release(); await drain();
    assert.ok(await session.current.getPendingCast(board.origin, id), 'an unverified inclusion must retain the public pending gate');
    assert.equal(board.entries.filter((entry) => (entry.record as { intent?: string }).intent === 'cast').length, 1, 'the board recorded the ballot despite its invalid inclusion path');
    assert.deepEqual(await session.current.getReceipts(id), [], 'receipt remembering remains off');
    assert.equal(postCount(), 1);
    await navigate('vote');
    assert.ok(hasButton('Save receipt file'), 'the returned receipt must remain available as evidence despite the inclusion alarm');
    assert.equal(hasButton('Send my vote'), false, 'the alarm must not create an exact-retry action');
    assert.equal(hasButton('Review my choices'), false, 'the public pending marker must still gate a fresh ballot');
  } finally { release(); globalThis.fetch = originalFetch; }
});

test('independent: a durable-mode inclusion alarm completed while away still offers its returned receipt with remembering off', async () => {
  const { session, durable } = await boot(false);
  await durable.putKey(keySlot(id), wrapped.container);
  await navigate('key'); await unlock();
  await until(() => main().textContent.includes('You are on the voter list.'));
  await session.current.updateSettings((settings) => ({ ...settings, rememberReceipts: false }));
  await navigate('vote');
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => root.find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  const originalFetch = globalThis.fetch;
  let submitted!: () => void, release!: () => void;
  const sawPost = new Promise<void>((resolve) => { submitted = resolve; });
  const holdResponse = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (String(input).endsWith('/log/entries') && init?.method === 'POST') { submitted(); await holdResponse; }
    return response;
  };
  try {
    board.tamper.inclusionPath = true;
    button('Send my vote').click();
    await sawPost;
    assert.ok(await session.current.getPendingCast(board.origin, id));
    await navigate('rules');
    release(); await drain();
    assert.ok(await session.current.getPendingCast(board.origin, id), 'an unverified inclusion must retain the public pending gate');
    assert.equal(board.entries.filter((entry) => (entry.record as { intent?: string }).intent === 'cast').length, 1, 'the board recorded the ballot despite its invalid inclusion path');
    assert.deepEqual(await session.current.getReceipts(id), [], 'receipt remembering remains off');
    assert.equal(postCount(), 1);
    await navigate('vote');
    assert.ok(hasButton('Save receipt file'), 'the returned receipt must remain available as evidence despite the inclusion alarm');
    assert.equal(hasButton('Send my vote'), false, 'the alarm must not create an exact-retry action');
    assert.equal(hasButton('Review my choices'), false, 'the public pending marker must still gate a fresh ballot');
  } finally { release(); globalThis.fetch = originalFetch; }
});
