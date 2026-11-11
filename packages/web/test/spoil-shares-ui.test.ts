// Spoil relay UI failures and route lifetime, with a small DOM and real signed protocol fixtures.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { PROTO_ID, ballotCode, shareToHex, signRecord, trusteeDecryptSpoiled, type SpoilShareBody } from '@quietvote/protocol';
import { bundleOf, closeElection, setup, spoilBallot, trusteeKeyFor, type Sim } from '../../protocol/test/helpers/sim.ts';
import { ApiClient } from '../src/api/client.ts';
import { deriveElectionContext, type ElectionContext } from '../src/flow/election.ts';
import { deriveSpoilTargets } from '../src/flow/spoil-shares.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { spoilSharesPanel } from '../src/ui/spoil-shares.ts';
import type { Announcer } from '../src/ui/dom.ts';

class Element {
  readonly children: Element[] = [];
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, (e: { preventDefault(): void }) => void>();
  value = '';
  files: { size: number; text(): Promise<string> }[] = [];
  private text = '';
  readonly tag: string;
  readonly data: string | undefined;
  constructor(tag: string, data?: string) { this.tag = tag; this.data = data; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  removeAttribute(k: string): void { this.attrs.delete(k); }
  append(...kids: Element[]): void { this.children.push(...kids); }
  get firstChild(): Element | undefined { return this.children[0]; }
  removeChild(c: Element): void { this.children.splice(this.children.indexOf(c), 1); }
  set textContent(v: string) { this.children.length = 0; this.text = v; }
  get textContent(): string { return this.data ?? this.text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(k: string, f: (e: { preventDefault(): void }) => void): void { this.listeners.set(k, f); }
  dispatch(type: string): void { this.listeners.get(type)?.({ preventDefault() {} }); }
  find(pred: (e: Element) => boolean): Element[] { return [...(pred(this) ? [this] : []), ...this.children.flatMap((c) => c.find(pred))]; }
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => new Element('#text', text),
} });
const settle = async (): Promise<void> => { await new Promise<void>((resolve) => setImmediate(resolve)); };
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
};
const tr = createTranslator('en');
let sim: Sim;
let ctx: ElectionContext;
let records: { seq: number; record: unknown }[];
let release: unknown;
before(async () => {
  sim = await setup({ seed: 'spoil-ui', n: 3, t: 2, voters: 4, minCounted: 3, spoilTrustees: true });
  const spoiled = spoilBallot(sim, 0, { budget: ['yes'], chair: ['ann'] }, 'trustees');
  closeElection(sim);
  records = [{ seq: 0, record: bundleOf(sim).manifest }, ...sim.log.map(({ seq, entry }) => ({ seq, record: entry }))];
  const derived = await deriveElectionContext(records);
  assert.ok(derived.ok, derived.ok ? '' : derived.detail);
  ctx = derived.value;
  const targets = deriveSpoilTargets(ctx, records, sim.rollHex);
  assert.ok(targets.ok);
  const code = bytesToHex(ballotCode(sim.params!.ctx, spoiled.env.body));
  const spoil = targets.value.spoils.get(code)!;
  const opened = trusteeDecryptSpoiled(sim.params!, trusteeKeyFor(sim, 1), spoil, streamRng('spoil-ui-release'));
  assert.ok(opened.ok);
  const shares: SpoilShareBody['shares'] = [...opened.value].map(([key, share]) => {
    const [contest, opt] = key.split('/') as [string, string];
    const { M, c, s } = shareToHex(1, share);
    return { contest, opt, M, c, s };
  });
  const body: SpoilShareBody = { proto: PROTO_ID, type: 'spoil-share', ctx: bytesToHex(sim.params!.ctx), j: 1, code, spoil_seq: spoil.seq, shares };
  release = signRecord(sim.trusteeKeys[0]!.secretKey, sim.trusteeKeys[0]!.publicKey, sim.params!.ctx, body);
});

function panel(roll: () => Promise<string[]> = async () => sim.rollHex, post?: () => Promise<Response>) {
  const messages: { text: string; urgent: boolean }[] = [];
  const state = { current: true, posts: 0 };
  const api = new ApiClient({ fetch: async (_input, init) => {
    if (init?.method === 'POST') state.posts++;
    if (init?.method === 'POST' && post) return post();
    return new Response(JSON.stringify(init?.method === 'POST' ? { status: 'accepted' } : { items: [] }), { status: 200 });
  } });
  const say = { say: (text: string, urgent = false) => messages.push({ text, urgent }) } as unknown as Announcer;
  const root = spoilSharesPanel({ tr, say, api, apiId: 'a'.repeat(26), ctx, records: () => records, roll, current: () => state.current }) as unknown as Element;
  const form = root.find((e) => e.tag === 'form')[0]!;
  const file = root.find((e) => e.attrs.get('type') === 'file')[0]!;
  const text = root.find((e) => e.tag === 'textarea')[0]!;
  const send = root.find((e) => e.attrs.get('type') === 'submit')[0]!;
  const refresh = root.find((e) => e.tag === 'button' && e.textContent === tr.t('qv.spoil.refresh'))[0]!;
  return { root, form, file, text, send, refresh, state, messages };
}

test('spoil upload serializes repeated submissions while the file is being read', async () => {
  const p = panel();
  await settle();
  const read = deferred<string>();
  let reads = 0;
  p.file.files = [{ size: 2000, text: () => { reads++; return read.promise; } }];
  p.form.dispatch('submit');
  p.form.dispatch('submit');
  assert.equal(reads, 1);
  assert.equal(p.send.attrs.has('disabled'), true);
  assert.equal(p.form.attrs.get('aria-busy'), 'true');
  read.resolve(JSON.stringify(release));
  await settle();
  assert.equal(p.state.posts, 1);
  assert.equal(p.send.attrs.has('disabled'), false);
  assert.equal(p.form.attrs.get('aria-busy'), 'false');
});

test('partly accepted spoil upload retains the original input for correction and retry', async () => {
  const p = panel();
  await settle();
  const input = JSON.stringify([release, {}]);
  p.text.value = input;
  p.form.dispatch('submit');
  await settle();
  assert.equal(p.state.posts, 1);
  assert.equal(p.text.value, input, 'one accepted record must not erase a rejected record');
  p.text.value = JSON.stringify(release);
  p.text.dispatch('input');
  p.form.dispatch('submit');
  await settle();
  assert.equal(p.state.posts, 2);
  assert.equal(p.text.value, '');
});

test('spoil upload discards a pending file read when the user replaces its input', async () => {
  const p = panel();
  await settle();
  const read = deferred<string>();
  p.file.files = [{ size: 2000, text: () => read.promise }];
  p.form.dispatch('submit');
  p.file.files = [{ size: 2, text: async () => '{}' }];
  p.file.dispatch('change');
  const before = [...p.messages];
  read.resolve(JSON.stringify(release));
  await settle();
  assert.equal(p.state.posts, 0);
  assert.deepEqual(p.messages, before);
  assert.equal(p.send.attrs.has('disabled'), false);
});

test('spoil upload completion cannot erase or announce over replacement input', async () => {
  const response = deferred<Response>();
  const p = panel(undefined, () => response.promise);
  await settle();
  p.text.value = JSON.stringify(release);
  p.form.dispatch('submit');
  assert.equal(p.state.posts, 1);
  p.text.value = 'replacement input';
  p.text.dispatch('input');
  const before = [...p.messages];
  response.resolve(new Response(JSON.stringify({ status: 'accepted' }), { status: 200 }));
  await settle();
  assert.equal(p.text.value, 'replacement input');
  assert.deepEqual(p.messages, before);
  assert.equal(p.send.attrs.has('disabled'), false);
});

test('partly accepted batch survives a network failure and can be retried', async () => {
  let requests = 0;
  const p = panel(undefined, async () => {
    if (++requests === 2) throw new TypeError('connection dropped');
    return new Response(JSON.stringify({ status: requests === 3 ? 'duplicate' : 'accepted' }), { status: 200 });
  });
  await settle();
  const input = JSON.stringify([release, release]);
  p.text.value = input;
  p.form.dispatch('submit');
  await settle();
  assert.equal(p.state.posts, 2);
  assert.equal(p.text.value, input);
  assert.equal(p.send.attrs.has('disabled'), false);
  p.form.dispatch('submit');
  await settle();
  assert.equal(p.state.posts, 4);
  assert.equal(p.text.value, '');
});

test('spoil upload reports a failed file read and remains usable for the next file', async () => {
  const p = panel();
  await settle();
  p.file.files = [{ size: 20, text: async () => { throw new Error('file no longer readable'); } }];
  p.form.dispatch('submit');
  await settle();
  assert.ok(p.root.textContent.includes(tr.t('qv.spoil.add.unreadable')));
  assert.deepEqual(p.messages.at(-1), { text: tr.t('qv.spoil.add.unreadable'), urgent: true });
  assert.equal(p.state.posts, 0);
  p.file.files = [{ size: 2000, text: async () => JSON.stringify(release) }];
  p.form.dispatch('submit');
  await settle();
  assert.equal(p.state.posts, 1, 'the next valid file can still be submitted');
});

test('spoil upload does not POST or announce after navigation during a file read', async () => {
  const p = panel();
  await settle();
  const read = deferred<string>();
  p.file.files = [{ size: 2000, text: () => read.promise }];
  p.form.dispatch('submit');
  const before = [...p.messages];
  p.state.current = false;
  read.resolve(JSON.stringify(release));
  await settle();
  assert.equal(p.state.posts, 0);
  assert.deepEqual(p.messages, before);
});

test('spoil upload suppresses a late file-read error after navigation', async () => {
  const p = panel();
  await settle();
  const read = deferred<string>();
  p.file.files = [{ size: 20, text: () => read.promise }];
  p.form.dispatch('submit');
  const before = [...p.messages];
  p.state.current = false;
  read.reject(new Error('file read failed after navigation'));
  await settle();
  assert.deepEqual(p.messages, before);
  assert.equal(p.state.posts, 0);
});

test('successful spoil refresh restores the upload form after an initial roll read failure', async () => {
  let attempts = 0;
  const p = panel(async () => { if (++attempts === 1) throw new Error('temporary failure'); return sim.rollHex; });
  await settle();
  assert.equal(p.form.attrs.has('hidden'), true);
  assert.ok(p.root.textContent.includes(tr.t('qv.err.E-API-UNAVAILABLE.body')));
  p.refresh.dispatch('click');
  await settle();
  assert.equal(attempts, 2);
  assert.equal(p.form.attrs.has('hidden'), false);
});

test('spoil panel delegates announcements to the shared live regions, including errors', async () => {
  const p = panel(async () => { throw new Error('temporary failure'); });
  await settle();
  assert.equal(p.root.find((e) => ['status', 'alert'].includes(e.attrs.get('role') ?? '') || e.attrs.has('aria-live')).length, 0);
  assert.deepEqual(p.messages.at(-1), { text: tr.t('qv.err.E-API-UNAVAILABLE.body'), urgent: true });
});
