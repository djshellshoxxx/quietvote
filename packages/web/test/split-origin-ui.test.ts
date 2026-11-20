// SPDX-License-Identifier: AGPL-3.0-or-later
// Actual startApp behavior on a deterministic DOM/task harness. Browser layout/IndexedDB checks remain separate.
// @verifies QV-08-REQ-034, QV-19-REQ-022, QV-09-REQ-009
// Independent regression: only the DOM adapter is shared with device-settings-ui.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamRng } from '@quietvote/crypto';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { FakeBoard } from './helpers/fake-board.ts';
import { startApp } from '../src/ui/app.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { boardStorage } from '../src/key/board-storage.ts';
import { defaultDeps, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import { keySlot } from '../src/flow/onboarding.ts';
import { LiveElection } from '../src/flow/live.ts';

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

const sim = await setup({ seed: 'independent-split-router', n: 3, t: 2, voters: 4, minCounted: 3 });
const boardA = new FakeBoard(sim), boardB = new FakeBoard(sim), localBoard = new FakeBoard(sim);
const a = 'https://board-a.test', b = 'https://board-b.test', page = location.origin;
const id = boardA.apiId;
let enrollmentReadKey: string | undefined, ceremonyReady = false, changedLogClaim: 'key' | 'origin' | undefined;
const seen: { origin: string; path: string; read: string | null; method: string; body?: string }[] = [];
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (input: string, init?: RequestInit) => {
  const url = new URL(String(input), page), headers = new Headers(init?.headers);
  seen.push({ origin: url.origin, path: url.pathname + url.search, read: headers.get('qv-read-key'), method: init?.method ?? 'GET', ...(typeof init?.body === 'string' ? { body: init.body } : {}) });
  assert.equal(url.hash, '', 'fragments never reach fetch');
  const board = url.origin === a ? boardA : url.origin === b ? boardB : url.origin === page ? localBoard : undefined;
  assert.ok(board, `unexpected API origin ${url.origin}`);
  if (url.pathname.endsWith('/events')) return new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  if (headers.get('qv-read-key') === enrollmentReadKey) {
    if (!ceremonyReady && url.pathname.endsWith('/log/entries')) return Response.json({ entries: [], from: 0, next_from: null, tree_size: 0 });
    if (changedLogClaim && url.pathname === `/api/v1/elections/${id}`) {
      const summary = await (await board.fetch(url.pathname, init)).json();
      return Response.json({ ...summary, ...(changedLogClaim === 'key' ? { log_pk: Buffer.alloc(32, 1).toString('base64url') } : { origin: 'quietvote/v1/different' }) });
    }
  }
  return board.fetch(url.pathname + url.search, init);
} });
const storage = new MemoryStorage();
const reads: string[] = [];
const getKey = storage.getKey.bind(storage);
storage.getKey = async (slot) => { reads.push(slot); return getKey(slot); };
startApp({ root: root as unknown as HTMLElement, storage, apiBase: a, boardOrigins: [a, b], build: { version: 'test', id: 'independent-split-routing' } });
const get = (predicate: (element: Element) => boolean): Element => { const found = root.find(predicate)[0]; assert.ok(found); return found; };
const button = (text: string): Element => get((element) => element.tag === 'button' && element.textContent === text);
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) { await tick(); for (const [id, task] of [...tasks].filter(([, task]) => task.delay <= 30)) { tasks.delete(id); task.run(); } }
}
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 3000; i++) { await tick(); if (predicate()) return; } assert.fail('UI operation did not finish'); }
const main = (): Element => get((element) => element.tag === 'main');
const fragment = (board: string, read = 'reviewReadKey0001'): string => `#board=${encodeURIComponent(board)}&read=${read}`;
async function navigate(view: string, hash: string): Promise<void> { location.pathname = view === '/' ? '/' : `/e/${id}/${view}`; location.hash = hash; events.dispatch('popstate'); await drain(); }
const electionReads = (origin: string) => seen.filter((request) => request.origin === origin && request.path === `/api/v1/elections/${id}`);

const passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('independent-split-key') }, FLOOR_PARAMS);
await storage.putKey(keySlot(id), wrapped.container);

test('actual router uses each selected board for the same server election ID', async () => {
  await navigate('rules', fragment(a));
  assert.ok(main().textContent.includes(sim.manifest.title));
  assert.equal(electionReads(a).at(-1)?.read, 'reviewReadKey0001');
  const count = electionReads(b).length;
  await navigate('rules', fragment(b));
  assert.equal(electionReads(b).length, count + 1, 'a cached same-ID election from A must not satisfy B');
  assert.equal(electionReads(b).at(-1)?.read, 'reviewReadKey0001');
});

test('actual router distinguishes changed and removed read credentials on the same board', async () => {
  let count = electionReads(a).length;
  await navigate('rules', fragment(a, 'reviewReadKey0002'));
  assert.equal(electionReads(a).length, count + 1);
  assert.equal(electionReads(a).at(-1)?.read, 'reviewReadKey0002');
  count = electionReads(a).length;
  await navigate('rules', `#board=${encodeURIComponent(a)}`);
  assert.equal(electionReads(a).length, count + 1, 'removing a read key cannot reuse a credentialed cached client');
  assert.equal(electionReads(a).at(-1)?.read, null);
  assert.ok(seen.every((request) => !request.path.includes('reviewReadKey')));
});

test('invalid or unallowed board fragments stop before requests or stored-key lookups', async () => {
  for (const hash of ['#board=%', '#board=', `#board=${encodeURIComponent('https://unlisted.test')}`, `${fragment(a)}&board=${encodeURIComponent(b)}`]) {
    const network = seen.length, keys = reads.length;
    await navigate('key', hash);
    assert.equal(seen.length, network, hash);
    assert.equal(reads.length, keys, hash);
    assert.ok(!main().textContent.includes('Your voting key'));
  }
});

test('internal election links retain board and read-only fragments without an invitation token', async () => {
  const hash = fragment(b, 'reviewReadKey0003');
  await navigate('rules', hash);
  const links = main().find((element) => element.tag === 'a' && (element.attrs.get('href') ?? '').startsWith(`/e/${id}`));
  assert.ok(links.length >= 7);
  for (const link of links) assert.ok(link.attrs.get('href')!.endsWith(hash), link.attrs.get('href'));
});


test('remote board key slots are disjoint while the original same-origin key slot remains usable', async () => {
  await navigate('key', fragment(a, 'reviewReadKey0004'));
  const slotA = reads.at(-1)!;
  assert.notEqual(slotA, keySlot(id), 'remote board must not silently inherit the legacy same-origin voter key');
  assert.equal(main().find((element) => element.tag === 'button' && element.textContent === 'Unlock key').length, 0);
  await navigate('key', fragment(b, 'reviewReadKey0004'));
  assert.notEqual(reads.at(-1), slotA);
  assert.notEqual(reads.at(-1), keySlot(id));
  await navigate('key', fragment(page, 'reviewReadKey0004'));
  assert.equal(reads.at(-1), keySlot(id));
  assert.equal(button('Unlock key').disabled, false);
});

test('actual unlock and cast preserve API ID and fragment while a second board does not inherit the signer', async () => {
  const hash = fragment(a, 'reviewReadKey0005');
  await navigate('key', hash);
  await storage.putKey(reads.at(-1)!, wrapped.container);
  await navigate('key', hash);
  get((element) => element.attrs.get('type') === 'password').value = passphrase;
  button('Unlock key').click();
  await until(() => main().textContent.includes('You are on the voter list.'));
  const successLink = main().find((element) => element.tag === 'a' && element.attrs.get('class') === 'btn primary').at(-1)!;
  assert.equal(successLink.attrs.get('href'), `/e/${id}/vote${hash}`);
  await navigate('vote', hash);
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => main().find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  button('Send my vote').click();
  await until(() => main().find((element) => element.tag === 'a' && element.textContent === 'Check inclusion now').length === 1);
  const submitted = seen.filter((request) => request.method === 'POST' && request.path.endsWith('/log/entries')).at(-1)!;
  assert.equal(submitted.origin, a); assert.equal(submitted.path, `/api/v1/elections/${id}/log/entries`);
  assert.equal(submitted.read, 'reviewReadKey0005');
  const receipt = main().find((element) => element.tag === 'a' && element.textContent === 'Check inclusion now')[0]!;
  assert.equal(receipt.attrs.get('href'), `/e/${id}/receipt${hash}`);
  assert.equal(storage.receipts.length, 1);
  assert.notEqual(storage.receipts[0]!.electionId, id, 'stored receipt is scoped, while the transmitted server ID stays exact');
  await navigate('vote', fragment(b, 'reviewReadKey0005'));
  assert.equal(main().find((element) => element.tag === 'button' && element.textContent === 'Review my choices').length, 0);
  assert.ok(main().find((element) => element.tag === 'a' && element.textContent === 'Unlock key').length > 0);
  await navigate('/', '');
});

test('enrollment-to-ready hash navigation refreshes a cached draft even when live hints have not arrived', async (t) => {
  enrollmentReadKey = 'enrollment_transition_no_hint'; ceremonyReady = false;
  await boardStorage(storage, a, page).putKey(keySlot(id), wrapped.container);
  t.mock.method(LiveElection.prototype, 'start', () => {});
  t.after(async () => { enrollmentReadKey = undefined; await navigate('/', ''); });
  const hash = fragment(a, enrollmentReadKey);
  await navigate('key', '#inv=AAECAwQFBgcICQoLDA0ODw&' + hash.slice(1));
  assert.equal(button('Unlock key').disabled, false, 'the enrollment view loaded the board-scoped key');
  const before = electionReads(a).length;
  ceremonyReady = true;
  location.hash = hash; events.dispatch('hashchange'); await drain();
  assert.equal(electionReads(a).length, before + 1, 'removing the invitation must refresh an unbound draft snapshot');
  assert.equal(button('Unlock key').disabled, false, 'the same document reaches the verified election without a reload');
});

test('same-document enrollment navigation retires the old key form before pending reads complete', async (t) => {
  enrollmentReadKey = 'enrollment_transition_pending_route'; ceremonyReady = false;
  await boardStorage(storage, a, page).putKey(keySlot(id), wrapped.container);
  t.mock.method(LiveElection.prototype, 'start', () => {});
  const hash = fragment(a, enrollmentReadKey);
  await navigate('key', '#inv=AAECAwQFBgcICQoLDA0ODw&' + hash.slice(1));
  const priorButton = button('Unlock key');
  const originalFetch = globalThis.fetch;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (new URL(String(input), page).pathname === `/api/v1/elections/${id}`) await pending;
    return response;
  };
  try {
    ceremonyReady = true;
    location.hash = hash;
    // Native fragment navigation can emit both events before its asynchronous route has settled.
    events.dispatch('popstate'); events.dispatch('hashchange');
    assert.equal(main().find((element) => element === priorButton).length, 0,
      'an invalidated enrollment form must not consume the next passphrase or Unlock action');
    assert.ok(main().textContent.includes('Loading…'));
    release(); await drain();
    get((element) => element.attrs.get('type') === 'password').value = passphrase;
    button('Unlock key').click();
    await until(() => main().textContent.includes('You are on the voter list.'));
    assert.equal(seen.filter((request) => request.read === enrollmentReadKey && request.method === 'POST').length, 0,
      'leaving enrollment must not resubmit the invitation');
  } finally {
    release(); globalThis.fetch = originalFetch;
    enrollmentReadKey = undefined; await navigate('/', '');
  }
});

test('live enrollment completion binds the signed log before an actual cast uses its receipt key', async (t) => {
  enrollmentReadKey = 'enrollment_transition_live_hint'; ceremonyReady = false;
  await boardStorage(storage, a, page).putKey(keySlot(id), wrapped.container);
  let live: LiveElection | undefined;
  t.mock.method(LiveElection.prototype, 'start', function (this: LiveElection) { live = this; });
  t.after(async () => { enrollmentReadKey = undefined; await navigate('/', ''); });
  const hash = fragment(a, enrollmentReadKey);
  await navigate('key', '#inv=AAECAwQFBgcICQoLDA0ODw&' + hash.slice(1));
  assert.ok(live); ceremonyReady = true; await live.refresh();
  location.hash = hash; events.dispatch('hashchange'); await drain();
  get((element) => element.attrs.get('type') === 'password').value = passphrase;
  button('Unlock key').click(); await until(() => main().textContent.includes('You are on the voter list.'));
  await navigate('vote', hash);
  button('Review my choices').click(); button('Seal my ballot').click();
  await until(() => main().find((element) => element.id === 'cast-btn' && !element.disabled).length === 1);
  button('Send my vote').click();
  await until(() => main().find((element) => element.tag === 'a' && element.textContent === 'Check inclusion now').length === 1);
  assert.ok(main().textContent.includes('Your vote was recorded. Here is your receipt.'), main().textContent);
  const submitted = seen.filter((request) => request.method === 'POST' && request.path.endsWith('/log/entries')).at(-1)!;
  assert.equal(submitted.origin, a); assert.equal(submitted.read, enrollmentReadKey);
});

for (const claim of ['key', 'origin'] as const) test(`live enrollment completion cannot bypass a mismatched server log ${claim}`, async (t) => {
  enrollmentReadKey = `enrollment_transition_wrong_${claim}`; ceremonyReady = false; changedLogClaim = claim;
  await boardStorage(storage, a, page).putKey(keySlot(id), wrapped.container);
  let live: LiveElection | undefined;
  t.mock.method(LiveElection.prototype, 'start', function (this: LiveElection) { live = this; });
  t.after(async () => { enrollmentReadKey = undefined; changedLogClaim = undefined; await navigate('/', ''); });
  const hash = fragment(a, enrollmentReadKey);
  await navigate('key', '#inv=AAECAwQFBgcICQoLDA0ODw&' + hash.slice(1));
  assert.ok(live); ceremonyReady = true; await live.refresh();
  location.hash = hash; events.dispatch('hashchange'); await drain();
  assert.equal(main().find((element) => element.tag === 'button' && element.textContent === 'Unlock key').length, 0);
  assert.ok(main().textContent.includes(`the server names a log ${claim} that is not the one in the signed manifest`));
});

test('independent: live enrollment with an omitted log key remains refused after same-document navigation', async (t) => {
  enrollmentReadKey = 'independent_missing_summary_log_key'; ceremonyReady = false;
  await boardStorage(storage, a, page).putKey(keySlot(id), wrapped.container);
  let live: LiveElection | undefined;
  t.mock.method(LiveElection.prototype, 'start', function (this: LiveElection) { live = this; });
  const originalFetch = globalThis.fetch;
  const postsBefore = seen.filter((request) => request.method === 'POST').length;
  let omittedSummaries = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), page);
    const read = new Headers(init?.headers).get('qv-read-key');
    const response = await originalFetch(input, init);
    if (read === enrollmentReadKey && url.pathname === `/api/v1/elections/${id}`) {
      const summary = await response.json();
      delete summary.log_pk;
      omittedSummaries++;
      return Response.json(summary);
    }
    return response;
  };
  try {
    const hash = fragment(a, enrollmentReadKey), readsBefore = electionReads(a).length;
    await navigate('key', '#inv=AAECAwQFBgcICQoLDA0ODw&' + hash.slice(1));
    assert.ok(electionReads(a).length > readsBefore);
    assert.ok(omittedSummaries >= 1, 'the cached draft summary omitted log_pk');
    assert.equal(button('Unlock key').disabled, false, 'pre-manifest enrollment remains available');
    assert.ok(live);
    ceremonyReady = true;
    await live.refresh();
    location.hash = hash; events.dispatch('hashchange'); await drain();
    assert.equal(main().find((element) => element.tag === 'button' && element.textContent === 'Unlock key').length, 0,
      'a live callback exception must not leave an unbound context usable after enrollment');
    assert.ok(main().textContent.includes('the server names a log key that is not the one in the signed manifest'));
    assert.equal(seen.filter((request) => request.method === 'POST').length, postsBefore);
  } finally {
    enrollmentReadKey = undefined; ceremonyReady = false;
    globalThis.fetch = originalFetch;
    await navigate('/', '');
  }
});
