import { hashLeaf, signPromise } from '@quietvote/board';
import { logOrigin } from '@quietvote/protocol';
import { b64uDecode, b64uEncode } from '../src/util/hex.ts';
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { bytesToHex } from '@quietvote/crypto';
import { bundleOf, clone, setup, kp, type Sim } from '../../protocol/test/helpers/sim.ts';
import type { ElectionBundle } from '@quietvote/protocol';
import { ApiError } from '../src/api/errors.ts';
import type { AppendResult } from '../src/api/types.ts';
import { createTranslator, type MessageKey } from '../src/i18n/index.ts';
import { defaultDeps } from '../src/key/keystore.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { adminPanel } from '../src/ui/admin.ts';
import type { Announcer } from '../src/ui/dom.ts';

class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, (e: unknown) => void>();
  value = ''; files: { size: number; text(): Promise<string> }[] = []; id = ''; readonly tag: string; private text: string;
  constructor(tag: string, text = '') { this.tag = tag; this.text = text; }
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
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => new Element('#text', text) } });
const tr = createTranslator('en');
const tick = () => new Promise<void>((r) => setImmediate(r));
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; };
let sim: Sim, election: ElectionBundle;
before(async () => { sim = await setup({ seed: 'admin-ui', n: 3, t: 2, voters: 3 }); election = clone(bundleOf(sim)); election.log = []; });
function panel(overrides: { unlock?: () => Promise<Signer>; exportJson?: () => Promise<unknown>; election?: ElectionBundle; secret?: Uint8Array } = {}) {
  const state = { current: true, posts: [] as string[], fail: true, unlocks: 0, signers: [] as Signer[], downloads: [] as string[] };
  const api = { exportJson: overrides.exportJson ?? (async () => overrides.election ?? election), tallyDraft: async () => undefined,
    postEntry: async (_id: string, header: string, body: string): Promise<AppendResult> => {
      state.posts.push(JSON.stringify({ header, body }));
      if (state.fail) throw new ApiError({ status: 0, code: 'NETWORK' });
      const r = signPromise(kp('admin-ui', 'log').secretKey, logOrigin(sim.manifest), 1, hashLeaf(b64uDecode(header)!), 1000);
      return { status: 'sequenced', receipt: { origin: r.origin, seq: r.seq, leaf_hash: b64uEncode(r.leafHash), promise_sig: b64uEncode(r.promiseSig),
        promise: { sequenced_at: r.sequencedAt, checkpoint_deadline: r.checkpointDeadline } } };
    } };
  const p = adminPanel({ tr, say: { say() {} } as unknown as Announcer, api, apiId: sim.manifest.election_id,
    storage: new MemoryStorage(), keyDeps: defaultDeps, current: () => state.current, download: (_name, text) => state.downloads.push(text),
    error: () => new Element('p', 'error') as unknown as HTMLElement,
    unlock: async () => { state.unlocks++; const signer = overrides.unlock ? await overrides.unlock() : await createSigner((overrides.secret ?? sim.coord[0]!.secretKey).slice()); state.signers.push(signer); return signer; },
  });
  const root = p.element as unknown as Element;
  const pin = root.find((x) => x.attrs.get('maxlength') === '64')[0]!; pin.value = overrides.election?.manifest_hash ?? bytesToHex(sim.mh);
  const action = root.find((x) => x.tag === 'select')[0]!; action.value = 'dkg-open';
  const pass = root.find((x) => x.attrs.get('type') === 'password')[0]!; pass.value = 'a private passphrase';
  const button = (key: MessageKey) => root.find((x) => x.tag === 'button' && x.textContent === tr.t(key))[0]!;
  const idle = async () => { const deadline = Date.now() + 10000; while (root.attrs.get('aria-busy') === 'true' && Date.now() < deadline) await new Promise<void>((r) => setTimeout(r, 2)); assert.notEqual(root.attrs.get('aria-busy'), 'true'); };
  return { ...p, root, pin, pass, action, button, state, idle };
}

test('console preparation serializes clicks, clears the phrase, locks the key and requires separate review before POST', async () => {
  const pending = deferred<unknown>(), p = panel({ exportJson: () => pending.promise });
  p.button('qv.admin.prepare').click(); p.button('qv.admin.prepare').click();
  assert.equal(p.pass.value, ''); assert.equal(p.root.attrs.get('aria-busy'), 'true');
  assert.equal(p.state.unlocks, 0); assert.deepEqual(p.state.posts, []);
  pending.resolve(election); await p.idle();
  assert.equal(p.state.unlocks, 1); assert.equal(p.state.signers[0]!.locked, true);
  assert.ok(p.root.textContent.includes('dkg-open')); assert.deepEqual(p.state.posts, []);
  p.button('qv.admin.save').click(); assert.equal(p.state.downloads.length, 1);
});

test('uncertain delivery preserves the downloadable packet and explicit retries resend identical bytes', async () => {
  const p = panel(); p.button('qv.admin.prepare').click(); await p.idle();
  p.button('qv.admin.submit').click(); await p.idle();
  assert.equal(p.state.posts.length, 1); assert.ok(p.root.textContent.includes(tr.t('qv.admin.uncertain')));
  assert.equal(p.button('qv.key.cancel').attrs.has('disabled'), true);
  assert.equal(p.button('qv.admin.prepare').attrs.has('disabled'), true);
  p.button('qv.admin.prepare').click(); await p.idle();
  assert.equal(p.state.unlocks, 1, 'synthetic clicks cannot replace an uncertain packet');
  p.button('qv.admin.save').click(); assert.equal(p.state.downloads[0], p.state.posts[0]);
  p.state.fail = false; p.button('qv.admin.submit').click(); await p.idle();
  assert.equal(p.state.posts.length, 2); assert.equal(p.state.posts[0], p.state.posts[1]);
  assert.equal(p.state.unlocks, 1); assert.ok(p.root.textContent.includes(tr.t('qv.admin.accepted')));
});

test('navigation or device clearing during unlock discards the result and locks the late signer', async () => {
  for (const kind of ['navigate', 'clear']) {
    const pending = deferred<Signer>(), p = panel({ unlock: () => pending.promise });
    p.button('qv.admin.prepare').click(); await tick();
    assert.equal(p.state.unlocks, 1);
    if (kind === 'navigate') p.state.current = false; else p.invalidate();
    const signer = await createSigner(sim.coord[0]!.secretKey.slice()); pending.resolve(signer); await p.idle();
    assert.equal(signer.locked, true); assert.deepEqual(p.state.posts, []);
    assert.equal(p.button('qv.admin.submit').attrs.has('disabled'), true);
  }
});

test('changed pin and oversized public file are refused before organizer unlock or file read', async () => {
  const p = panel(); p.pin.value = '00'.repeat(32); p.button('qv.admin.prepare').click(); await p.idle();
  assert.equal(p.state.unlocks, 0); assert.deepEqual(p.state.posts, []);
  const file = p.root.find((x) => x.attrs.get('type') === 'file')[0]!;
  let reads = 0; file.files = [{ size: 1024 * 1024 + 1, text: async () => { reads++; return '{}'; } }];
  p.button('qv.admin.relay').click(); await p.idle(); assert.equal(reads, 0);
});

test('partial coordinator packets cannot be sent, and another coordinator can import and complete the quorum', async () => {
  const { ed25519Keypair } = await import('@quietvote/crypto');
  const { manifestHash, signRecordRaw, verifyMultiSig } = await import('@quietvote/protocol');
  const other = ed25519Keypair(new Uint8Array(32).fill(87));
  const e = clone(election); e.manifest.body.coordinator = { keys: [sim.coord[0]!, other].map((k) => bytesToHex(k.publicKey)), m: 2 };
  const mh = manifestHash(e.manifest.body); e.manifest_hash = bytesToHex(mh);
  e.manifest.sigs = [sim.coord[0]!, other].map((k) => signRecordRaw(k.secretKey, k.publicKey, mh, 'manifest', e.manifest.body));
  const first = panel({ election: e }); first.button('qv.admin.prepare').click(); await first.idle();
  assert.ok(first.root.textContent.includes(tr.t('qv.admin.partial')));
  assert.equal(first.button('qv.admin.submit').attrs.has('disabled'), true);
  first.button('qv.admin.submit').click(); await first.idle(); assert.deepEqual(first.state.posts, []);
  first.button('qv.admin.save').click(); const saved = first.state.downloads[0]!;
  const next = panel({ election: e, secret: other.secretKey });
  next.root.find((x) => x.attrs.get('type') === 'file')[0]!.files = [{ size: saved.length, text: async () => saved }];
  next.button('qv.admin.cosign').click(); await next.idle();
  assert.equal(next.button('qv.admin.submit').attrs.has('disabled'), false);
  next.button('qv.admin.save').click();
  const packet = JSON.parse(next.state.downloads[0]!) as { body: string };
  const record = JSON.parse(new TextDecoder().decode(b64uDecode(packet.body)!));
  assert.equal(record.sigs.length, 2); assert.ok(verifyMultiSig(mh, record, e.manifest.body.coordinator.keys, 2));
  next.state.fail = false; next.button('qv.admin.submit').click(); await next.idle();
  assert.equal(next.state.posts.length, 1); assert.equal(next.state.signers[0]!.locked, true);
});
