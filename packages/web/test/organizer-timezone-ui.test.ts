// SPDX-License-Identifier: AGPL-3.0-or-later
// Actual startApp behavior on a deterministic DOM/task harness. Browser layout/IndexedDB checks remain separate.
// @verifies QV-13-REQ-092
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex, ed25519Verify, sha256, streamRng, utf8 } from '@quietvote/crypto';
import { requestMessage } from '@quietvote/board';
import { manifestHash, verifyMultiSig, type Manifest, type MultiSignedRecord } from '@quietvote/protocol';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { FakeBoard } from './helpers/fake-board.ts';
import { startApp } from '../src/ui/app.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { boardStorage } from '../src/key/board-storage.ts';
import { defaultDeps, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import { ORGANIZER_SLOT } from '../src/flow/onboarding.ts';

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
const sim = await setup({ seed: 'organizer-timezone-dom', n: 3, t: 2, voters: 4, minCounted: 3 });
const board = new FakeBoard(sim);
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: board.fetch });
const storage = new MemoryStorage();
const apiBase = 'https://api.quietvote.test';
startApp({ root: root as unknown as HTMLElement, storage, apiBase, boardOrigins: [apiBase], build: { version: 'test', id: 'organizer-timezone' } });
const get = (predicate: (element: Element) => boolean): Element => { const found = root.find(predicate)[0]; assert.ok(found); return found; };
const button = (text: string): Element => get((element) => element.tag === 'button' && element.textContent === text);
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

const input = (label: string): Element => {
  const field = get((element) => element.tag === 'label' && element.textContent === label);
  return get((element) => element.id === field.attrs.get('for'));
};
const enter = (label: string, value: string): Element => {
  const field = input(label); field.value = value; field.dispatch('input'); return field;
};
const radio = (name: string): Element => get((element) => element.tag === 'label' && element.textContent.trim() === name).find((element) => element.tag === 'input')[0]!;

test('organizer rejects gaps, requires an explicit fold offset, resets it on edits, and previews UTC independently of the host zone', async () => {
  await navigate('/new');
  enter('Time zone of this election', 'Europe/Berlin');
  const opens = enter('Voting opens', '2027-03-28T02:30');
  assert.equal(opens.attrs.get('aria-invalid'), 'true');
  assert.match(main().textContent.replace(/[\u2068\u2069]/g, ''), /That local time does not exist in Europe\/Berlin/);
  assert.ok(main().textContent.includes('2027-03-28 01:30'));
  assert.ok(main().textContent.includes('2027-03-28 03:30'));
  enter('Voting opens', '2027-10-31T02:30');
  assert.equal(opens.attrs.get('aria-invalid'), 'true');
  assert.equal(radio('UTC+02:00').checked, false);
  assert.equal(radio('UTC+01:00').checked, false);
  radio('UTC+01:00').toggle(true);
  assert.equal(opens.attrs.get('aria-invalid'), 'false');
  assert.ok(main().textContent.includes('2027-10-31T01:30:00Z'));
  radio('UTC+02:00').toggle(true);
  assert.ok(main().textContent.includes('2027-10-31T00:30:00Z'));
  enter('Voting opens', '2027-10-31T02:45');
  assert.equal(opens.attrs.get('aria-invalid'), 'true');
  assert.equal(radio('UTC+02:00').checked, false);
  enter('Time zone of this election', 'Asia/Kolkata');
  assert.ok(main().textContent.includes('2027-10-30T21:15:00Z'));
  enter('Time zone of this election', 'not/a-zone');
  assert.equal(opens.attrs.get('aria-invalid'), 'true');
  enter('Time zone of this election', 'UTC');
  enter('Voting opens', '2027-02-30T12:00');
  assert.equal(opens.attrs.get('aria-invalid'), 'true', 'calendar overflow must not silently normalize');
  enter('Voting opens', '0099-01-01T00:00');
  assert.equal(opens.attrs.get('aria-invalid'), 'false');
  assert.ok(main().textContent.includes('0099-01-01T00:00:00Z'), 'preview must preserve the entered year');
  assert.ok(!main().textContent.includes('1999-01-01T00:00:00Z'));
  await navigate('/');
});

test('separate-board publication uses scoped organizer state, server-bound authentication and the exact selected UTC instants', async () => {
  const passphrase = 'correct horse battery staple';
  const wrapped = await wrapSeed(sim.coord[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('organizer-timezone-key') }, FLOOR_PARAMS);
  await boardStorage(storage, apiBase, location.origin).putKey(ORGANIZER_SLOT, wrapped.container);
  assert.equal(await storage.getKey(ORGANIZER_SLOT), undefined, 'publishing must use the separate board organizer slot');
  await navigate('/new');
  enter('Passphrase', passphrase); button('Unlock key').click();
  await until(() => main().find((element) => element.tag === 'code').length === 1);
  enter('Name of decision', 'Timezone decision');
  enter('Question', 'Proceed?');
  enter('Voting method', 'yes-no');
  enter('Voter public keys', sim.rollHex.join('\n'));
  enter('Trustees', sim.trusteeKeys.map((key, i) => `T${i + 1},${bytesToHex(key.publicKey)}`).join('\n'));
  enter('Time zone of this election', 'Europe/Berlin');
  enter('Voting opens', '2027-10-31T02:30');
  enter('Voting closes', '2027-11-01T12:00');
  button('Freeze election').click();
  assert.equal(main().find((element) => element.tag === 'button' && element.textContent === 'Publish election').length, 0);
  assert.equal(input('Voting opens').attrs.get('aria-invalid'), 'true');
  radio('UTC+01:00').toggle(true);
  button('Freeze election').click();
  assert.equal(button('Publish election').disabled, false);
  enter('Voting closes', '2027-11-01T13:00');
  assert.equal(main().find((element) => element.tag === 'button' && element.textContent === 'Publish election').length, 0, 'old frozen times must not remain publishable after an edit');
  button('Freeze election').click();
  let captured: MultiSignedRecord<Manifest> | undefined;
  const requests: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    requests.push({ url: path, init: init! });
    if (path.endsWith('/instance')) return Response.json({ instance_id: 'timezone-instance' });
    if (path.endsWith('/orgs/test-org/elections')) return Response.json({ election_id: sim.manifest.election_id, origin: board.origin, log_pk: Buffer.from(board.logKey.publicKey).toString('base64url') });
    if (path.endsWith('/log/entries')) {
      const body = JSON.parse(String(init?.body)) as { body: string };
      captured = JSON.parse(Buffer.from(body.body, 'base64url').toString()) as MultiSignedRecord<Manifest>;
      return Response.json({ code: 'REFUSED', retryable: false }, { status: 400 });
    }
    throw new Error(`unexpected publication request ${path}`);
  };
  try {
    enter('Organization ID', 'test-org');
    main().find((element) => element.attrs.get('type') === 'password').at(-1)!.value = passphrase;
    button('Publish election').click();
    await until(() => captured !== undefined);
    assert.ok(captured);
    assert.equal(captured.body.voting_open, '2027-10-31T01:30:00Z');
    assert.equal(captured.body.voting_close, '2027-11-01T12:00:00Z');
    assert.equal(captured.body.bb.log_id, bytesToHex(sha256(utf8(board.origin))), 'the manifest binds the returned board log origin');
    assert.ok(verifyMultiSig(manifestHash(captured.body), captured, [bytesToHex(sim.coord[0]!.publicKey)], 1));
    assert.equal(Object.hasOwn(captured.body, 'display_time_zone'), false);
    assert.equal(Object.hasOwn(captured.body, 'opens_at'), false);
    assert.ok(requests.every((r) => new URL(r.url).origin === apiBase), 'every publication request uses the configured API');
    const create = requests.find((r) => r.url.endsWith('/orgs/test-org/elections'))!;
    const auth = /^QV-Sig keyid=([^,]+),ts=(\d+),nonce=([^,]+),sig=([^,]+)$/.exec(new Headers(create.init.headers).get('Authorization') ?? '');
    assert.ok(auth, 'creation carries request authentication');
    const msg = (origin: string): Uint8Array => requestMessage('POST', new URL(create.url).pathname, `qv:timezone-instance@${origin}`,
      Number(auth[2]), Buffer.from(auth[3]!, 'base64url'), utf8(String(create.init.body)));
    const signature = Buffer.from(auth[4]!, 'base64url');
    assert.equal(ed25519Verify(sim.coord[0]!.publicKey, signature, msg(apiBase)), true);
    assert.equal(ed25519Verify(sim.coord[0]!.publicKey, signature, msg(location.origin)), false, 'page-origin authorization must not authenticate the API request');
    await drain();
  } finally { globalThis.fetch = original; await navigate('/'); }
});
