import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { hashLeaf, signPromise } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { logOrigin, manifestHash, signRecordRaw, type ElectionBundle } from '@quietvote/protocol';
import { bundleOf, clone, kp, setup, type Sim } from '../../protocol/test/helpers/sim.ts';
import type { AppendResult } from '../src/api/types.ts';
import { createTranslator, type MessageKey } from '../src/i18n/index.ts';
import { defaultDeps } from '../src/key/keystore.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { adminPanel } from '../src/ui/admin.ts';
import type { Announcer } from '../src/ui/dom.ts';
import { b64uDecode, b64uEncode } from '../src/util/hex.ts';

class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, (e: unknown) => void>();
  value = ''; files: { size: number; text(): Promise<string> }[] = []; id = ''; private text = '';
  readonly tag: string;
  constructor(tag: string) { this.tag = tag; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(k: string, f: (e: unknown) => void) { this.listeners.set(k, f); }
  append(...c: Element[]) { this.children.push(...c); }
  get firstChild() { return this.children[0]; }
  removeChild(c: Element) { this.children.splice(this.children.indexOf(c), 1); }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(text: string) { this.text = text; this.children = []; }
  find(p: (x: Element) => boolean): Element[] { return [...(p(this) ? [this] : []), ...this.children.flatMap((c) => c.find(p))]; }
  click() { this.listeners.get('click')?.({}); }
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => { const e = new Element('#text'); e.textContent = text; return e; },
} });
const tr = createTranslator('en'), tick = () => new Promise<void>((r) => setImmediate(r));
const seed = 'independent-organizer-ui-review';
let sim: Sim, election: ElectionBundle;
before(async () => {
  sim = await setup({ seed, n: 3, t: 2, voters: 3, boundLog: true });
  election = clone(bundleOf(sim)); election.log = [];
});
function receipt(header: string): AppendResult {
  const r = signPromise(kp(seed, 'log').secretKey, logOrigin(sim.manifest), 1, hashLeaf(b64uDecode(header)!), 1790000000);
  return { status: 'sequenced', receipt: { origin: r.origin, seq: r.seq, leaf_hash: b64uEncode(r.leafHash),
    promise: { sequenced_at: r.sequencedAt, checkpoint_deadline: r.checkpointDeadline }, promise_sig: b64uEncode(r.promiseSig) } };
}
function panel(reply: (header: string) => AppendResult | Promise<AppendResult> = receipt,
  options: { election?: ElectionBundle; unlock?: () => Promise<Signer> } = {}) {
  const state = { posts: [] as string[], downloads: [] as string[], unlocks: 0, signers: [] as Signer[] };
  const p = adminPanel({ tr, say: { say() {} } as unknown as Announcer,
    api: { exportJson: async () => options.election ?? election, tallyDraft: async () => undefined,
      postEntry: async (_id, header, body) => { state.posts.push(JSON.stringify({ header, body })); return reply(header); } },
    apiId: sim.manifest.election_id, storage: new MemoryStorage(), keyDeps: defaultDeps, current: () => true,
    download: (_name, text) => state.downloads.push(text), error: () => new Element('p') as unknown as HTMLElement,
    unlock: async () => { state.unlocks++; const signer = await (options.unlock?.() ?? createSigner(sim.coord[0]!.secretKey.slice())); state.signers.push(signer); return signer; },
  });
  const root = p.element as unknown as Element;
  root.find((x) => x.attrs.get('maxlength') === '64')[0]!.value = options.election?.manifest_hash ?? bytesToHex(sim.mh);
  root.find((x) => x.tag === 'select')[0]!.value = 'dkg-open';
  const button = (key: MessageKey) => root.find((x) => x.tag === 'button' && x.textContent === tr.t(key))[0]!;
  const idle = async () => { const deadline = Date.now() + 10000; while (root.attrs.get('aria-busy') === 'true' && Date.now() < deadline) await tick(); assert.notEqual(root.attrs.get('aria-busy'), 'true'); };
  const loadFile = (text: string) => { root.find((x) => x.attrs.get('type') === 'file')[0]!.files = [{ size: text.length, text: async () => text }]; };
  return { ...p, root, button, state, idle, loadFile };
}

test('review: malformed or wrong-entry acknowledgments retain exact public packet for retry', async () => {
  const mutations: ((r: AppendResult) => AppendResult)[] = [
    () => ({ status: 'sequenced' } as AppendResult),
    (r) => ({ ...r, receipt: { ...r.receipt, promise_sig: b64uEncode(new Uint8Array(64)) } }),
    (r) => ({ ...r, receipt: { ...r.receipt, leaf_hash: b64uEncode(new Uint8Array(32)) } }),
    (r) => ({ ...r, receipt: { ...r.receipt, origin: 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa' } }),
  ];
  for (const mutate of mutations) {
    const p = panel((header) => mutate(receipt(header)));
    p.button('qv.admin.prepare').click(); await p.idle();
    p.button('qv.admin.submit').click(); await p.idle();
    assert.equal(p.state.posts.length, 1);
    assert.ok(p.root.textContent.includes(tr.t('qv.admin.uncertain')));
    p.button('qv.admin.save').click(); assert.equal(p.state.downloads[0], p.state.posts[0]);
    p.button('qv.admin.submit').click(); await p.idle();
    assert.equal(p.state.posts[1], p.state.posts[0]);
    assert.equal(p.state.unlocks, 1);
  }
});

test('review: saved organizer packet can be resumed without unlocking or changing any signed bytes', async () => {
  const first = panel(); first.button('qv.admin.prepare').click(); await first.idle();
  first.button('qv.admin.save').click(); const saved = first.state.downloads[0]!;
  assert.ok(saved);
  const resumed = panel(); resumed.loadFile(saved);
  resumed.button('qv.admin.restore').click(); await resumed.idle();
  assert.equal(resumed.button('qv.admin.submit').attrs.has('disabled'), false);
  resumed.button('qv.admin.submit').click(); await resumed.idle();
  assert.deepEqual(resumed.state.posts, [saved]);
  assert.equal(resumed.state.unlocks, 0);
  assert.ok(resumed.root.textContent.includes(tr.t('qv.admin.accepted')));
});

test('review: stale append completion keeps the exact retry packet and does not display acceptance', async () => {
  let resolve!: (reply: AppendResult) => void;
  const response = new Promise<AppendResult>((done) => { resolve = done; });
  const p = panel(() => response);
  p.button('qv.admin.prepare').click(); await p.idle();
  assert.equal(p.state.signers[0]!.locked, true);
  p.button('qv.admin.submit').click(); await tick();
  assert.equal(p.state.posts.length, 1);
  p.invalidate();
  resolve(receipt((JSON.parse(p.state.posts[0]!) as { header: string }).header)); await p.idle();
  assert.ok(!p.root.textContent.includes(tr.t('qv.admin.accepted')));
  p.button('qv.admin.save').click(); assert.equal(p.state.downloads[0], p.state.posts[0]);
  assert.equal(p.button('qv.key.cancel').attrs.has('disabled'), true);
});

function multiElection() {
  const e = clone(election), other = kp(seed, 'second-coordinator');
  e.manifest.body.coordinator = { keys: [sim.coord[0]!, other].map((k) => bytesToHex(k.publicKey)), m: 2 };
  const mh = manifestHash(e.manifest.body); e.manifest_hash = bytesToHex(mh);
  e.manifest.sigs = [sim.coord[0]!, other].map((k) => signRecordRaw(k.secretKey, k.publicKey, mh, 'manifest', e.manifest.body));
  return { e, other };
}

test('review: partial restore cannot bypass the quorum gate even through a synthetic submit click', async () => {
  const { e } = multiElection(), first = panel(receipt, { election: e });
  first.button('qv.admin.prepare').click(); await first.idle();
  assert.equal(first.state.signers[0]!.locked, true);
  first.button('qv.admin.submit').click(); await first.idle(); assert.deepEqual(first.state.posts, []);
  first.button('qv.admin.save').click();
  const resumed = panel(receipt, { election: e }); resumed.loadFile(first.state.downloads[0]!);
  resumed.button('qv.admin.restore').click(); await resumed.idle();
  assert.ok(resumed.root.textContent.includes(tr.t('qv.admin.refused')));
  assert.equal(resumed.button('qv.admin.submit').attrs.has('disabled'), true);
  resumed.button('qv.admin.submit').click(); await resumed.idle();
  assert.deepEqual(resumed.state.posts, []); assert.equal(resumed.state.unlocks, 0);
});

test('review: late co-sign unlock after invalidation locks the signer and never exposes or submits a packet', async () => {
  const { e, other } = multiElection(), first = panel(receipt, { election: e });
  first.button('qv.admin.prepare').click(); await first.idle(); first.button('qv.admin.save').click();
  let resolve!: (signer: Signer) => void;
  const pending = new Promise<Signer>((done) => { resolve = done; });
  const p = panel(receipt, { election: e, unlock: () => pending });
  p.loadFile(first.state.downloads[0]!); p.button('qv.admin.cosign').click(); await tick();
  assert.equal(p.state.unlocks, 1); p.invalidate();
  const signer = await createSigner(other.secretKey.slice()); resolve(signer); await p.idle();
  assert.equal(signer.locked, true); assert.equal(p.button('qv.admin.submit').attrs.has('disabled'), true);
  p.button('qv.admin.save').click(); p.button('qv.admin.submit').click(); await p.idle();
  assert.deepEqual(p.state.downloads, []); assert.deepEqual(p.state.posts, []);
});

test('review: co-sign validation failure locks the unlocked signer and clears its passphrase', async () => {
  const { e, other } = multiElection();
  const p = panel(receipt, { election: e, unlock: () => createSigner(other.secretKey.slice()) });
  const pass = p.root.find((x) => x.attrs.get('type') === 'password')[0]!; pass.value = 'independent-review-passphrase';
  p.loadFile('{"body":{},"sigs":[]}'); p.button('qv.admin.cosign').click(); await p.idle();
  assert.equal(p.state.signers.length, 1); assert.equal(p.state.signers[0]!.locked, true);
  assert.equal(pass.value, ''); assert.equal(p.button('qv.admin.submit').attrs.has('disabled'), true);
  assert.deepEqual(p.state.posts, []);
});
