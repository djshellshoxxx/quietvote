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
const fragment = (board: string, read = 'reviewReadKey0001'): string => `#board=${encodeURIComponent(board)}&read=${read}`;
async function navigate(view: string, hash: string): Promise<void> { location.pathname = view === '/' ? '/' : `/e/${id}/${view}`; location.hash = hash; events.dispatch('popstate'); await drain(); }
const electionReads = (origin: string) => seen.filter((request) => request.origin === origin && request.path === `/api/v1/elections/${id}`);

const passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('independent-split-key') }, FLOOR_PARAMS);
await storage.putKey(keySlot(id), wrapped.container);

test('independent: an older draft refresh cannot replace a newer ready context or orphan its live stream', async (t) => {
  enrollmentReadKey = 'independent_draft_refresh_race'; ceremonyReady = false;
  await boardStorage(storage, a, page).putKey(keySlot(id), wrapped.container);
  const started: LiveElection[] = [];
  const originalStart = LiveElection.prototype.start;
  t.mock.method(LiveElection.prototype, 'start', function (this: LiveElection) {
    started.push(this); originalStart.call(this);
  });
  const originalFetch = globalThis.fetch;
  const streams: AbortSignal[] = [];
  const held: { ready: boolean; release(): void }[] = [];
  let holdRefreshes = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), page);
    const read = new Headers(init?.headers).get('qv-read-key');
    const readyAtCall = ceremonyReady;
    const response = await originalFetch(input, init);
    if (read === enrollmentReadKey && url.pathname.endsWith('/events')) {
      assert.ok(init?.signal, 'each real harness SSE request has an abort signal');
      streams.push(init.signal);
    }
    if (holdRefreshes && read === enrollmentReadKey && url.pathname.endsWith('/log/entries') && held.length < 2) {
      return new Promise<Response>((resolve) => { held.push({ ready: readyAtCall, release: () => resolve(response) }); });
    }
    return response;
  };
  try {
    const hash = fragment(a, enrollmentReadKey);
    await navigate('key', '#inv=AAECAwQFBgcICQoLDA0ODw&' + hash.slice(1));
    await until(() => streams.length === 1);
    assert.equal(button('Unlock key').disabled, false, 'the cached draft is an actual enrollment key view');
    holdRefreshes = true;
    await navigate('rules', hash);
    await until(() => held.length === 1);
    assert.equal(held[0]!.ready, false, 'the older response is an empty draft snapshot');
    ceremonyReady = true;
    await navigate('key', hash);
    await until(() => held.length === 2);
    assert.equal(held[1]!.ready, true, 'the newer response contains the signed ready election');
    held[1]!.release();
    await until(() => streams.length === 2);
    await drain();
    assert.equal(button('Unlock key').disabled, false, 'the newer ready route has become active');
    assert.equal(streams[0]!.aborted, true, 'refreshing the draft retired its original stream');
    assert.equal(streams[1]!.aborted, false, 'the ready view owns its live stream');
    const metadataReads = electionReads(a).length;
    held[0]!.release(); await drain();
    await navigate('rules', hash);
    const extraMetadataReads = electionReads(a).length - metadataReads;
    await navigate('/', '');
    assert.deepEqual({
      extraMetadataReads,
      streamCount: streams.length,
      unclosedStreams: streams.filter((signal) => !signal.aborted).length,
    }, { extraMetadataReads: 0, streamCount: 2, unclosedStreams: 0 },
    'the newer bound cache must remain reusable and every retired or departed live stream must close');
    assert.equal(seen.filter((request) => request.method === 'POST').length, 0);
  } finally {
    for (const response of held) response.release();
    await navigate('/', '');
    for (const live of started) live.close();
    globalThis.fetch = originalFetch;
    enrollmentReadKey = undefined; ceremonyReady = false;
    await drain();
  }
});
