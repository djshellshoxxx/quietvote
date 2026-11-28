// SPDX-License-Identifier: AGPL-3.0-or-later
// Actual startApp and default Argon2id/AES key operations on the deterministic DOM adapter.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { startApp } from '../src/ui/app.ts';
import { keySlot, ORGANIZER_SLOT } from '../src/flow/onboarding.ts';
import { defaultDeps, DEFAULT_PARAMS, serializeContainer, wrapSeed, type QvKey1 } from '../src/key/keystore.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { encodeRecoveryCode } from '../src/key/recovery.ts';
import { FakeBoard } from './helpers/fake-board.ts';

type Listener = (event: { target: Element; currentTarget: Element; button: number; preventDefault(): void }) => unknown;
class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, Listener[]>();
  text = ''; value = ''; disabled = false; hidden = false; checked = false;
  files: { size: number; text(): Promise<string> }[] = []; parent: Element | undefined;
  readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  set id(value: string) { this.attrs.set('id', value); }
  get id(): string { return this.attrs.get('id') ?? ''; }
  set textContent(value: string) { this.text = value; this.children = []; }
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
  focus(): void {}
  addEventListener(key: string, listener: Listener): void { this.listeners.set(key, [...(this.listeners.get(key) ?? []), listener]); }
  async dispatch(key: string): Promise<void> {
    await Promise.all((this.listeners.get(key) ?? []).map((listener) => listener({ target: this, currentTarget: this, button: 0, preventDefault() {} })));
  }
  click(): Promise<void> { return this.disabled ? Promise.resolve() : this.dispatch('click'); }
  find(predicate: (element: Element) => boolean): Element[] { return [...(predicate(this) ? [this] : []), ...this.children.flatMap((child) => child.find(predicate))]; }
  querySelector(selector: string): Element | null { return this.find((element) => element.attrs.get('class')?.split(' ').includes(selector.slice(1)) === true)[0] ?? null; }
}
const root = new Element('root'), events = new Element('window'), documentEvents = new Element('document');
const location = new URL('https://quietvote.test/'), tasks = new Map<number, { delay: number; run(): void }>();
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
Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: () => 1 });
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (run: () => void, delay = 0) => {
  const id = ++nextTask; tasks.set(id, { delay, run });
  if (delay === 0) setImmediate(() => { const task = tasks.get(id); tasks.delete(id); task?.run(); });
  return id;
} });
Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: (id: number) => { tasks.delete(id); } });
URL.createObjectURL = () => 'blob:local-key-file'; URL.revokeObjectURL = () => {};
const sim = await setup({ seed: 'voter-key-single-flight-ui', n: 3, t: 2, voters: 4, minCounted: 3 });
let board = new FakeBoard(sim);
const id = board.apiId, passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('voter-key-single-flight') }, DEFAULT_PARAMS);
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (input: string, init?: RequestInit) => {
  const url = new URL(String(input), location.origin);
  if (url.pathname.endsWith('/events')) return new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  return board.fetch(url.pathname + url.search, init);
} });
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) { await tick(); for (const [id, task] of [...tasks].filter(([, task]) => task.delay <= 30)) { tasks.delete(id); task.run(); } }
}
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 20_000; i++) { await tick(); if (predicate()) return; } assert.fail('UI operation did not finish'); }
const get = (predicate: (element: Element) => boolean, name = 'element'): Element => { const element = root.find(predicate)[0]; assert.ok(element, name); return element; };
const button = (name: string): Element => get((element) => element.tag === 'button' && element.textContent === name, name);
const field = (name: string): Element => {
  const label = get((element) => element.tag === 'label' && element.textContent.trim() === name, name);
  return label.attrs.has('for') ? get((element) => element.id === label.attrs.get('for')) : label.children.find((element) => element.tag === 'input')!;
};
const main = (): Element => get((element) => element.tag === 'main');
const visibleCodes = (): string[] => root.find((element) => element.tag === 'bdi' && element.attrs.get('class') === 'code')
  .map((element) => element.find((child) => child.attrs.get('aria-hidden') === 'true').map((child) => child.textContent).join(''));
class CountedStorage extends MemoryStorage {
  attempts = 0; installed = 0;
  override async installKeyIfAbsent(slot: string, container: QvKey1, current?: () => boolean): Promise<boolean> {
    this.attempts++; const installed = await super.installKeyIfAbsent(slot, container, current);
    if (installed) this.installed++;
    return installed;
  }
}
let started = false;
async function navigate(view: string): Promise<void> {
  location.pathname = view === '/' ? '/' : `/e/${id}/${view}`; await events.dispatch('popstate'); await drain();
}
async function boot(container?: QvKey1, organizer = false): Promise<CountedStorage> {
  if (started) await navigate('/');
  events.listeners.clear(); documentEvents.listeners.clear(); tasks.clear(); board = new FakeBoard(sim);
  const storage = new CountedStorage(); if (container) await storage.putKey(organizer ? ORGANIZER_SLOT : keySlot(id), container);
  location.href = organizer ? `${location.origin}/new` : `${location.origin}/e/${id}/key`;
  startApp({ root: root as unknown as HTMLElement, storage, build: { version: 'test', id: 'key-single-flight' } });
  started = true; await drain(); return storage;
}
function aesGate(t: TestContext) {
  const original = crypto.subtle.importKey.bind(crypto.subtle);
  let release!: () => void, completedDerivations = 0;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  t.mock.method(crypto.subtle, 'importKey', async (...args: unknown[]) => {
    if (args[2] === 'AES-GCM') { completedDerivations++; await wait; }
    return Reflect.apply(original, undefined, args);
  });
  return { release, completed: () => completedDerivations };
}
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const form = (): Element => get((element) => element.attrs.has('aria-busy') && element.find((child) => child === field('Passphrase')).length > 0);
function assertBusy(expected: boolean): void {
  assert.equal(form().attrs.get('aria-busy'), String(expected));
  for (const control of form().find((element) => element.tag === 'input' || element.tag === 'button')) assert.equal(control.disabled, expected, control.tag + ' ' + control.textContent);
}
async function selectImport(): Promise<void> { const mode = field('Use a key file I saved before'); mode.checked = true; await mode.dispatch('change'); }
const keyFile = () => ({ size: serializeContainer(wrapped.container).length, text: async () => serializeContainer(wrapped.container) });

test('voter key: duplicate Create does only one wrap/unlock pair and one installation', async (t) => {
  const storage = await boot(), gate = aesGate(t); field('Passphrase').value = passphrase;
  const first = button('Create key').click(), second = button('Create key').click();
  try { await until(() => gate.completed() > 0); }
  finally { gate.release(); await Promise.all([first, second]); }
  await until(() => root.find((element) => element.tag === 'button' && element.textContent === 'Unlock key').length === 1);
  assert.equal(gate.completed(), 2, 'one real default Argon2id wrap and one unlock, without a second concurrent create');
  assert.equal(storage.attempts, 1); assert.equal(storage.installed, 1);
  const saved = await storage.getKey(keySlot(id)); assert.ok(saved);
  assert.deepEqual({ m: saved.m, t: saved.t, p: saved.p }, DEFAULT_PARAMS);
});

test('voter key: duplicate Unlock performs one real derivation and preserves the saved key', async (t) => {
  const storage = await boot(wrapped.container), gate = aesGate(t); field('Passphrase').value = passphrase;
  const first = button('Unlock key').click(), second = button('Unlock key').click();
  try { await until(() => gate.completed() > 0); }
  finally { gate.release(); await Promise.all([first, second]); }
  await until(() => main().textContent.includes('You are on the voter list.'));
  assert.equal(gate.completed(), 1, 'a second unlock must not start another default Argon2id operation');
  assert.equal(storage.attempts, 0); assert.deepEqual(await storage.getKey(keySlot(id)), wrapped.container);
});

test('voter key: pending file import disables every control and preserves the selected file/password', async () => {
  const storage = await boot(), gate = signal(); let reads = 0, replacementReads = 0;
  await selectImport(); field('Passphrase').value = passphrase;
  const file = field('Key file'); file.files = [{ ...keyFile(), text: async () => { reads++; await gate.promise; return serializeContainer(wrapped.container); } }];
  const create = button('Create key'), generate = button('Generate 7 words for me'), first = create.click();
  try {
    await until(() => reads === 1); assertBusy(true);
    await create.click(); await create.dispatch('click'); // Native disabled control and direct duplicate callback are both guarded.
    await generate.click(); await generate.dispatch('click'); assert.equal(field('Passphrase').value, passphrase);
    const modes = form().find((element) => element.attrs.get('type') === 'radio');
    for (const mode of modes) await mode.dispatch('change');
    // Even programmatic mutation cannot substitute new inputs for the operation already awaiting the original file.
    field('Passphrase').value = 'different password while pending';
    file.files = [{ ...keyFile(), text: async () => { replacementReads++; throw new Error('replacement must not be read'); } }];
    assert.equal(reads, 1); assert.equal(replacementReads, 0);
  } finally { gate.resolve(); await first; }
  await until(() => main().textContent.includes('You are on the voter list.'));
  assertBusy(false); assert.equal(storage.attempts, 1); assert.equal(storage.installed, 1);
  const saved = await storage.getKey(keySlot(id)); assert.ok(saved);
  assert.equal(serializeContainer(saved), serializeContainer(wrapped.container)); assert.equal(replacementReads, 0);
});

test('voter key: recovery restoration is single-flight and keeps the default KDF parameters', async (t) => {
  const storage = await boot(), gate = aesGate(t);
  const recovery = form().find((element) => element.attrs.get('type') === 'radio')[2]!;
  recovery.checked = true; await recovery.dispatch('change');
  const input = form().find((element) => element.attrs.get('type') === 'text')[0]!;
  input.value = encodeRecoveryCode(sim.voters[0]!.secretKey); field('Passphrase').value = passphrase;
  const first = button('Create key').click(), second = button('Create key').click();
  try { await until(() => gate.completed() > 0); assertBusy(true); }
  finally { gate.release(); await Promise.all([first, second]); }
  await until(() => main().textContent.includes('You are on the voter list.'));
  assert.equal(gate.completed(), 2); assert.equal(storage.attempts, 1); assert.equal(storage.installed, 1); assert.equal(input.value, '');
  const saved = await storage.getKey(keySlot(id)); assert.ok(saved);
  assert.deepEqual({ m: saved.m, t: saved.t, p: saved.p }, DEFAULT_PARAMS); assertBusy(false);
});

test('voter key: cancelling the cost prompt releases controls, performs no derivation and permits retry', async (t) => {
  // An untrusted but well-formed cost profile is refused before deriving; a subsequent ordinary key remains usable.
  const costly = { ...wrapped.container, t: DEFAULT_PARAMS.t + 1 };
  const storage = await boot(costly), gate = aesGate(t); gate.release(); field('Passphrase').value = passphrase;
  const first = button('Unlock key').click();
  await until(() => root.find((element) => element.tag === 'dialog').length === 1); assertBusy(true);
  await button('Unlock key').dispatch('click'); assert.equal(root.find((element) => element.tag === 'dialog').length, 1);
  await button('Cancel').click(); await first;
  assertBusy(false); assert.equal(gate.completed(), 0); assert.equal(storage.attempts, 0);
  assert.deepEqual(await storage.getKey(keySlot(id)), costly); assert.ok(main().textContent.includes('Unlock cancelled. Nothing was unlocked.'));
  await storage.putKey(keySlot(id), wrapped.container); await button('Unlock key').click();
  await until(() => main().textContent.includes('You are on the voter list.')); assertBusy(false); assert.equal(gate.completed(), 1);
});

test('voter key: wrong passphrase releases controls and a later correct unlock succeeds', async (t) => {
  const storage = await boot(wrapped.container), gate = aesGate(t); gate.release();
  field('Passphrase').value = 'not the right secret at all'; await button('Unlock key').click();
  assertBusy(false); assert.equal(storage.attempts, 0); assert.deepEqual(await storage.getKey(keySlot(id)), wrapped.container);
  field('Passphrase').value = passphrase; await button('Unlock key').click();
  await until(() => main().textContent.includes('You are on the voter list.')); assertBusy(false); assert.equal(gate.completed(), 2);
});

test('voter key: a failed file read releases controls without installation and can be retried', async () => {
  const storage = await boot(); await selectImport(); field('Passphrase').value = passphrase;
  field('Key file').files = [{ ...keyFile(), text: async () => { throw new Error('file unavailable'); } }];
  await button('Create key').click(); assertBusy(false); assert.equal(storage.attempts, 0); assert.equal(await storage.getKey(keySlot(id)), undefined);
  field('Key file').files = [keyFile()]; await button('Create key').click();
  await until(() => main().textContent.includes('You are on the voter list.')); assertBusy(false); assert.equal(storage.installed, 1);
});

for (const confirmed of [false, true]) test(`voter key: ${confirmed ? 'confirmed' : 'cancelled'} clear during creation preserves lifecycle and releases controls`, async (t) => {
  const storage = await boot(), gate = aesGate(t); field('Passphrase').value = passphrase;
  const action = button('Create key').click();
  try {
    await until(() => gate.completed() === 1); assertBusy(true);
    await button('Clear this device').click(); await until(() => root.find((element) => element.tag === 'dialog').length === 1);
    await button(confirmed ? 'Remove my key, receipts and drafts from this browser' : 'Cancel').click(); await drain();
    if (confirmed) assert.equal(field('Passphrase').value, '', 'confirmed clear retires the old input');
    else assertBusy(true);
  } finally { gate.release(); await action; }
  await drain(); assertBusy(false);
  assert.equal(storage.installed, confirmed ? 0 : 1);
  assert.equal((await storage.listKeySlots()).length, confirmed ? 0 : 1);
  if (confirmed) assert.equal(main().textContent.includes('Download key file'), false, 'a cleared in-flight result cannot return as a backup/signer');
});

test('voter key: navigation retires the input and a delayed unlock cannot install an active signer', async (t) => {
  const storage = await boot(wrapped.container), gate = aesGate(t), password = field('Passphrase'); password.value = passphrase;
  const action = button('Unlock key').click();
  try { await until(() => gate.completed() === 1); await navigate('rules'); assert.equal(password.value, ''); }
  finally { gate.release(); await action; }
  await navigate('vote'); assert.equal(main().textContent.includes('Review my choices'), false);
  assert.equal(storage.attempts, 0); assert.deepEqual(await storage.getKey(keySlot(id)), wrapped.container);
  await navigate('key'); assertBusy(false); assert.equal(field('Passphrase').value, '');
});

test('voter key: recovery preview cannot start while the initial unlock awaits membership', async (t) => {
  await boot(wrapped.container); field('Passphrase').value = passphrase;
  const membership = signal(), reached = signal(), native = fetch, gate = aesGate(t); gate.release();
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    if (new URL(String(input), location.origin).pathname.endsWith('/roll')) { reached.resolve(); await membership.promise; }
    return native(input, init);
  });
  const action = button('Unlock key').click();
  try {
    await reached.promise;
    const preview = button('Show recovery code'); await preview.dispatch('click');
    assert.equal(gate.completed(), 1, 'membership wait must not allow a second KDF through recovery preview');
    assert.equal(preview.disabled, true); assert.equal(button('Download key file').disabled, true); assertBusy(true);
  } finally { membership.resolve(); await action; }
  await drain(); assert.equal(button('Show recovery code').disabled, false); assert.equal(button('Download key file').disabled, false); assertBusy(false);
});

test('voter key: repeated recovery preview derives once and preserves backup actions and the signer', async (t) => {
  const storage = await boot(wrapped.container); field('Passphrase').value = passphrase; await button('Unlock key').click(); await drain();
  const gate = aesGate(t), first = button('Show recovery code').click(), second = button('Show recovery code').click();
  try { await until(() => gate.completed() >= 1); }
  finally { gate.release(); await Promise.all([first, second]); }
  assert.equal(gate.completed(), 1, 'repeated preview must not duplicate its Argon2id operation');
  assert.ok(visibleCodes().includes(encodeRecoveryCode(sim.voters[0]!.secretKey)));
  assert.equal(button('Show recovery code').disabled, false); assert.equal(button('Download key file').disabled, false); assertBusy(false);
  assert.deepEqual(await storage.getKey(keySlot(id)), wrapped.container); assert.equal(storage.attempts, 0);
  await navigate('vote'); assert.equal(main().textContent.includes('Review my choices'), true, 'preview must not invalidate the already unlocked signer');
});

test('voter key: hiding an existing code cancels a pending redisplay without invalidating the signer', async (t) => {
  await boot(wrapped.container); field('Passphrase').value = passphrase; await button('Unlock key').click(); await drain();
  await button('Show recovery code').click();
  const gate = aesGate(t), action = button('Show recovery code').click();
  try { await until(() => gate.completed() === 1); await button('I have written it down').click(); }
  finally { gate.release(); await action; }
  assert.equal(visibleCodes().includes(encodeRecoveryCode(sim.voters[0]!.secretKey)), false, 'only the public Election ID may remain');
  assertBusy(false); assert.equal(button('Download key file').disabled, false);
  await navigate('vote'); assert.equal(main().textContent.includes('Review my choices'), true);
});

for (const clearDevice of [false, true]) test(`voter key: delayed recovery preview stays hidden after ${clearDevice ? 'confirmed clear' : 'navigation'}`, async (t) => {
  const storage = await boot(wrapped.container); field('Passphrase').value = passphrase; await button('Unlock key').click(); await drain();
  const gate = aesGate(t), action = button('Show recovery code').click();
  try {
    await until(() => gate.completed() === 1);
    if (clearDevice) {
      await button('Clear this device').click(); await button('Remove my key, receipts and drafts from this browser').click(); await drain();
    } else await navigate('rules');
  } finally { gate.release(); await action; }
  assert.equal(root.find((element) => element.tag === 'button' && element.textContent === 'I have written it down').length, 0);
  await navigate('vote'); assert.equal(main().textContent.includes('Review my choices'), !clearDevice);
  assert.equal((await storage.listKeySlots()).length, clearDevice ? 0 : 1);
});

test('voter key: failed recovery preview releases the shared guard and permits a correct retry', async () => {
  await boot(wrapped.container); field('Passphrase').value = passphrase; await button('Unlock key').click(); await drain();
  field('Passphrase').value = 'not the right secret at all'; await button('Show recovery code').click();
  assertBusy(false); assert.equal(button('Show recovery code').disabled, false); assert.equal(button('Download key file').disabled, false);
  field('Passphrase').value = passphrase; await button('Show recovery code').click();
  assert.ok(button('I have written it down')); assertBusy(false);
});

test('organizer: a previously unlocked key disables Freeze election through pending unlock, failure and cancellation', async (t) => {
  const storage = await boot(wrapped.container, true); field('Passphrase').value = passphrase;
  await button('Unlock key').click(); await drain();
  assert.ok(main().textContent.includes(bytesToHex(sim.voters[0]!.publicKey)), 'an earlier successful unlock makes the preview eligible');
  const preview = button('Freeze election'); assert.equal(preview.disabled, false);
  const gate = aesGate(t); field('Passphrase').value = passphrase; const action = button('Unlock key').click();
  try {
    await until(() => gate.completed() === 1); assert.equal(preview.disabled, true);
    const before = main().textContent; await preview.dispatch('click'); assert.equal(main().textContent, before, 'pending work must not clear/rebuild the preview');
  } finally { gate.release(); await action; }
  assert.equal(preview.disabled, false);
  field('Passphrase').value = 'not the right secret at all'; await button('Unlock key').click(); assert.equal(preview.disabled, false);
  await storage.putKey(ORGANIZER_SLOT, { ...wrapped.container, t: DEFAULT_PARAMS.t + 1 }); field('Passphrase').value = passphrase;
  const cancelled = button('Unlock key').click(); await until(() => root.find((element) => element.tag === 'dialog').length === 1);
  assert.equal(preview.disabled, true); await button('Cancel').click(); await cancelled;
  assert.equal(preview.disabled, false); assert.equal(field('Passphrase').value, ''); assert.equal(storage.attempts, 0);
});
