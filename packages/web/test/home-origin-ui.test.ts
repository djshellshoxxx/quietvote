// SPDX-License-Identifier: AGPL-3.0-or-later
// Actual startApp callbacks on the same deterministic DOM/task adapter used by device-settings-ui.test.ts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startApp } from '../src/ui/app.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { boardStorage } from '../src/key/board-storage.ts';
import { apiOrigin, boardOrigins, boardPolicy, checkOrigin, safeBoardOrigin } from '../src/api/origins.ts';
import { csp } from '../src/build/site.ts';
import { siteConfig } from '../src/build/config.ts';

type Listener = (event: { target: Element; currentTarget: Element; button: number; preventDefault(): void }) => unknown;
class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, Listener[]>();
  text = ''; value = ''; disabled = false; hidden = false; checked = false;
  readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  set id(value: string) { this.attrs.set('id', value); }
  get id(): string { return this.attrs.get('id') ?? ''; }
  set className(value: string) { this.attrs.set('class', value); }
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  setAttribute(key: string, value: string): void { this.attrs.set(key, value); if (key === 'value') this.value = value; }
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
  focus(): void {}
  find(predicate: (element: Element) => boolean): Element[] { return [...(predicate(this) ? [this] : []), ...this.children.flatMap((child) => child.find(predicate))]; }
  querySelector(selector: string): Element | null { return this.find((element) => element.attrs.get('class')?.split(' ').includes(selector.slice(1)) === true)[0] ?? null; }
}

function fixture(origin: string, apiBase = '', allowed: string[] = []) {
  const root = new Element('root'), events = new Element('window'), location = new URL(origin + '/');
  const tasks = new Map<number, { delay: number; run(): void }>(); let nextTask = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    documentElement: new Element('html'), body: root, hidden: false, addEventListener() {},
    getElementById: (id: string) => root.find((element) => element.id === id)[0] ?? null,
    createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => { const e = new Element('#text'); e.textContent = text; return e; },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: events.addEventListener.bind(events), scrollTo() {} } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
  Object.defineProperty(globalThis, 'history', { configurable: true, value: { pushState: (_state: unknown, _title: string, path: string) => {
    const next = new URL(path, location); assert.equal(next.origin, origin, 'navigation must stay on the selected frontend'); location.href = next.href;
  } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en'] } });
  Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: () => 0 });
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (run: () => void, delay = 0) => {
    const id = ++nextTask; tasks.set(id, { delay, run });
    if (delay === 0) setImmediate(() => { const task = tasks.get(id); tasks.delete(id); task?.run(); });
    return id;
  } });
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: (id: number) => { tasks.delete(id); } });
  const requests: { url: URL; headers: Headers }[] = [];
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), location); requests.push({ url, headers: new Headers(init?.headers) });
    assert.equal(url.hash, '');
    if (url.pathname.endsWith('/events')) return new Response(new ReadableStream({ start(controller) {
      init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
    const data = url.pathname.endsWith('/log/entries') ? { entries: [], tree_size: 0, next_from: null } : {
      election_id: url.pathname.split('/')[4], origin: 'quietvote/v1/test', title: 'Draft election', registration_scheme: 'hashed-pop-v1',
    };
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } });
  const storage = new MemoryStorage(); let keyReads = 0;
  const getKey = storage.getKey.bind(storage); storage.getKey = async (slot) => { keyReads++; return getKey(slot); };
  startApp({ root: root as unknown as HTMLElement, storage, apiBase, boardOrigins: allowed, build: { version: 'test', id: 'home-origin' } });
  const drain = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      for (const [id, task] of [...tasks].filter(([, task]) => task.delay <= 30)) { tasks.delete(id); task.run(); }
    }
  };
  const paste = async (value: string): Promise<void> => {
    const input = root.find((e) => e.tag === 'input' && e.attrs.get('type') === 'text')[0]!; assert.ok(input);
    input.value = value;
    const button = root.find((e) => e.tag === 'button' && e.textContent === 'Open election')[0]!; assert.ok(button);
    button.click(); await drain();
  };
  const home = async (): Promise<void> => { location.pathname = '/'; location.hash = ''; events.dispatch('popstate'); await drain(); };
  return { root, location, requests, paste, home, keyReads: () => keyReads };
}

const frontend = 'https://client.example', board = 'https://board.example';
const token = 'AAECAwQFBgcICQoLDA0ODw', readKey = 'home_read_key_123456';
const fragment = `#inv=${token}&read=${readKey}&board=${encodeURIComponent(board)}`;
const legacyId = 'a'.repeat(26), currentId = '0123456789abcdef0123456789abcdef';

for (const [format, id] of [['legacy base32', legacyId], ['current hex', currentId]] as const) {
  test(`Home opens a ${format} election address and preserves its authentication fragment`, async () => {
    const f = fixture(frontend, '', [board]);
    await f.paste(`${frontend}/e/${id}/key${fragment}`);
    assert.equal(f.location.pathname, `/e/${id}/key`);
    assert.equal(f.location.hash, fragment); assert.equal(f.location.origin, frontend);
    assert.ok(f.requests.length >= 2);
    assert.ok(f.requests.every((r) => r.url.origin === board && r.headers.get('qv-read-key') === readKey));
    assert.ok(f.requests.every((r) => !r.url.href.includes(token) && !r.url.href.includes(readKey)));
    await f.home();
  });
}

test('Home accepts relative election routes but rejects foreign frontend, invalid ID and non-election routes before fetch', async () => {
  const f = fixture(frontend);
  await f.paste(`/e/${currentId}/rules`); assert.equal(f.location.pathname, `/e/${currentId}/rules`); assert.ok(f.requests.length >= 2);
  await f.home();
  for (const value of ['/new', '/help', '/verify', '/e/short', `/e/${currentId}/unknown`, `/e/${legacyId}extra`,
    `https://foreign.example/e/${legacyId}${fragment}`, `//foreign.example/e/${legacyId}${fragment}`, `javascript:/e/${legacyId}${fragment}`,
    `https://user:pass@client.example/e/${legacyId}${fragment}`]) {
    const before = f.requests.length;
    await f.paste(value);
    assert.equal(f.location.pathname, '/', value); assert.equal(f.requests.length, before, value);
    assert.ok(f.root.textContent.includes('That is not an election address on this server.'), value);
  }
});

test('Home keeps malformed and unallowed board fragments inside the SPA error route without fetching or reading keys', async () => {
  const f = fixture(frontend, '', [board]);
  for (const hash of ['#board=%', '#board=%E0%A4%A', `#read=${readKey}&board=${encodeURIComponent('https://unlisted.example')}`,
    `${fragment}&board=${encodeURIComponent(board)}`, `#read=${readKey}&board=${encodeURIComponent(board + '/path')}`]) {
    await f.paste(`/e/${legacyId}/key${hash}`);
    assert.ok(f.root.textContent.includes('Something went wrong'), hash);
    assert.equal(f.requests.length, 0); assert.equal(f.keyReads(), 0);
    await f.home();
  }
});

test('same-origin IPv6 uses canonical origin identity and legacy storage without external IPv6 CSP permissions', async () => {
  for (const origin of ['http://[::1]', 'http://[::1]:3000', 'https://[::1]', 'https://[2001:db8::1]:8443']) {
    const f = fixture(origin);
    assert.equal(checkOrigin(origin), origin); assert.equal(apiOrigin('', origin), origin);
    const policy = boardPolicy(origin); assert.equal(policy.defaultBoard, origin); assert.equal(policy.select(origin), origin);
    const storage = new MemoryStorage(); assert.equal(boardStorage(storage, origin, origin), storage);
    await f.paste(`/e/${legacyId}/rules`); assert.ok(f.requests.length >= 2);
    assert.ok(f.requests.every((r) => r.url.origin === origin)); await f.home();
    assert.throws(() => boardOrigins([origin]), /IPv6/);
    assert.throws(() => siteConfig({ apiBase: origin }), /IPv6/);
    assert.throws(() => csp([origin]), /IPv6/);
    assert.throws(() => boardPolicy(frontend).select(origin), /not allowed/);
  }
  for (const origin of ['https://[::1]/', 'https://[::1]:443', 'https://[0:0:0:0:0:0:0:1]', 'https://[2001:db8::zz]',
    'https://[::1%25eth0]', 'https://u:p@[::1]', 'https://[::1]:65536', 'http://[2001:db8::1]']) assert.equal(safeBoardOrigin(origin), undefined, origin);
  assert.match(csp().header, /connect-src 'self';/);
});
