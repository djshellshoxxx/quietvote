import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex, ed25519Keypair, ed25519Verify, sha256, streamRng, utf8 } from '@quietvote/crypto';
import { requestMessage } from '../src/api/signing.ts';
import { b64uDecode } from '../src/util/hex.ts';
import { ApiClient } from '../src/api/client.ts';
import { enrollOrganization } from '../src/flow/publish-ui.ts';
import { ORGANIZER_SLOT, createKey } from '../src/flow/onboarding.ts';
import { buildManifest, type ManifestForm } from '../src/flow/organizer.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { FLOOR_PARAMS, defaultDeps, serializeContainer, type KeystoreDeps } from '../src/key/keystore.ts';
import { createSigner } from '../src/key/signer.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { organizerKeyPanel } from '../src/ui/organizer-key.ts';

class Element {
  children: Element[] = []; attrs = new Map<string, string>(); listeners = new Map<string, () => Promise<void>>();
  value = ''; disabled = false; files: { size: number; text(): Promise<string> }[] = []; id = '';
  readonly tag: string; private text: string;
  constructor(tag: string, text = '') { this.tag = tag; this.text = text; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  addEventListener(k: string, f: () => Promise<void>): void { this.listeners.set(k, f); }
  append(...c: Element[]): void { this.children.push(...c); }
  get firstChild(): Element | undefined { return this.children[0]; }
  removeChild(c: Element): void { this.children.splice(this.children.indexOf(c), 1); }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  find(p: (x: Element) => boolean): Element[] { return [...(p(this) ? [this] : []), ...this.children.flatMap((c) => c.find(p))]; }
  click(): Promise<void> { return this.listeners.get('click')?.() ?? Promise.resolve(); }
}
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => new Element(tag), createTextNode: (text: string) => new Element('#text', text) } });
const tr = createTranslator('en');
const password = 'correct horse battery staple';
function panel(storage = new MemoryStorage(), hasKey = false, beforeKdf: () => Promise<void> = async () => {}, backupRequired = false) {
  const ready: string[] = []; const downloads: string[] = []; const state = { current: true, derivations: 0 };
  const deps: KeystoreDeps = { ...defaultDeps(), rng: streamRng('organizer-panel'), kdf: async (pw, salt) => { state.derivations++; await beforeKdf(); return sha256(new Uint8Array([...pw, ...salt])); } };
  const view = organizerKeyPanel({ tr, storage, deps: () => deps, hasKey, backupRequired, current: () => state.current,
    ready: (pk) => ready.push(pk), error: () => new Element('p', 'error') as unknown as HTMLElement, download: (text) => downloads.push(text) });
  const root = view.element as unknown as Element;
  const input = root.find((x) => x.attrs.get('type') === 'password')[0]!;
  const file = root.find((x) => x.attrs.get('type') === 'file')[0]!;
  const button = (key: Parameters<typeof tr.t>[0]) => root.find((x) => x.tag === 'button' && x.textContent === tr.t(key))[0]!;
  return { view, root, input, file, button, storage, state, ready, downloads, deps };
}

test('organizer key creation is single-flight, stores the organizer slot, clears password and exports a reusable encrypted backup', async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => { release = r; });
  const p = panel(undefined, false, () => wait);
  p.input.value = password;
  const first = p.button('qv.key.create').click();
  await p.button('qv.key.create').click();
  assert.equal(p.root.attrs.get('aria-busy'), 'true');
  assert.equal(p.input.value, '');
  release(); await first;
  assert.equal(p.state.derivations, 1);
  assert.equal(p.ready.length, 1);
  assert.ok(await p.storage.getKey(ORGANIZER_SLOT));
  await p.button('qv.key.download').click();
  assert.equal(p.downloads.length, 1);
  const imported = panel(); imported.input.value = password;
  imported.file.files = [{ size: p.downloads[0]!.length, text: async () => p.downloads[0]! }];
  await imported.button('qv.org.importKey').click();
  assert.deepEqual(imported.ready, p.ready);
  assert.equal(imported.input.value, '');
  assert.equal(imported.button('qv.key.create').disabled, true);
  // Even a synthetic click cannot overwrite the saved organizer.
  const before = serializeContainer((await imported.storage.getKey(ORGANIZER_SLOT))!);
  await imported.button('qv.key.create').click();
  assert.equal(serializeContainer((await imported.storage.getKey(ORGANIZER_SLOT))!), before);
});

test('organizer unlock refuses wrong password, preserves the saved key and suppresses stale completions', async () => {
  const p = panel(); p.input.value = password; await p.button('qv.key.create').click();
  const before = serializeContainer((await p.storage.getKey(ORGANIZER_SLOT))!);
  p.input.value = 'wrong password'; await p.button('qv.key.unlock').click();
  assert.equal(p.ready.length, 1); assert.ok(p.root.textContent.includes(tr.t('qv.err.E-KEY-LOCKED.title')));
  assert.equal(serializeContainer((await p.storage.getKey(ORGANIZER_SLOT))!), before);
  p.input.value = password; await p.button('qv.key.unlock').click();
  assert.equal(p.ready.length, 2); assert.equal(p.ready[0], p.ready[1]);
  p.view.lock(); assert.equal(p.input.value, ''); assert.equal(p.root.find((x) => x.tag === 'code').length, 0);
  let release!: () => void; const pending = new Promise<void>((r) => { release = r; });
  const late = panel(undefined, false, () => pending); late.input.value = password;
  const action = late.button('qv.key.create').click(); late.state.current = false;
  release(); await action; assert.deepEqual(late.ready, []);
});

test('organizer import bounds files before reading', async () => {
  const p = panel(); let reads = 0;
  p.file.files = [{ size: 65537, text: async () => { reads++; return '{}'; } }];
  p.input.value = password; await p.button('qv.org.importKey').click();
  assert.equal(reads, 0); assert.equal(await p.storage.getKey(ORGANIZER_SLOT), undefined);
});

for (const action of ['qv.key.create', 'qv.org.importKey'] as const) {
  test(`stale organizer panel reports a locked key when ${action} starts after another panel installs`, async () => {
    const p = panel();
    const other = panel(p.storage); other.input.value = password; await other.button('qv.key.create').click();
    const saved = serializeContainer((await p.storage.getKey(ORGANIZER_SLOT))!);
    let reads = 0;
    p.file.files = [{ size: saved.length, text: async () => { reads++; return saved; } }];
    p.input.value = password; await p.button(action).click();
    assert.equal(p.state.derivations, 0); assert.equal(reads, 0); assert.deepEqual(p.ready, []);
    assert.ok(p.root.textContent.includes(tr.t('qv.key.locked')), 'occupied preflight must report the same locked state as atomic installation');
    assert.equal(p.root.attrs.get('aria-busy'), 'false');
    assert.equal(p.input.value, ''); assert.equal(p.file.value, '');
    assert.equal(p.button('qv.key.create').disabled, true);
    assert.equal(p.button('qv.org.importKey').disabled, true);
    assert.equal(p.button('qv.key.unlock').disabled, false);
    assert.equal(serializeContainer((await p.storage.getKey(ORGANIZER_SLOT))!), saved);
    p.input.value = password; await p.button('qv.key.unlock').click();
    assert.deepEqual(p.ready, other.ready);
    assert.equal(serializeContainer((await p.storage.getKey(ORGANIZER_SLOT))!), saved);
  });
}

test('organization enrollment sends the existing self-signed contract, one request per explicit attempt and locks on success or refusal', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const signers: Awaited<ReturnType<typeof createSigner>>[] = [];
  let refuse = false;
  const makeClient = (options: ConstructorParameters<typeof ApiClient>[0]) => new ApiClient({ ...options, fetch: async (url, init) => {
    calls.push({ url: String(url), init: init! });
    if (String(url).endsWith('/instance')) return Response.json({ instance_id: 'instance', api_versions: ['1'], server_version: 'test' });
    return refuse ? Response.json({ code: 'REGISTRATION_CLOSED' }, { status: 403 }) : Response.json({ org_id: 'org-id', name: 'Council' });
  } });
  const run = () => enrollOrganization({ name: ' Council ', token: 'secret-token', idempotencyKey: 'stable-key', passphrase: password,
    storage: new MemoryStorage(), apiBase: 'https://vote.example', origin: 'https://vote.example', makeClient,
    unlock: async () => { const signer = await createSigner(new Uint8Array(32).fill(7)); signers.push(signer); return signer; } });
  assert.equal(await run(), 'org-id');
  const post = calls.find((c) => c.init.method === 'POST')!;
  assert.equal(post.url, 'https://vote.example/api/v1/orgs');
  const headers = post.init.headers as Record<string, string>;
  const auth = /^QV-Sig keyid=([A-Za-z0-9_-]+),ts=(\d+),nonce=([A-Za-z0-9_-]+),sig=([A-Za-z0-9_-]+)$/.exec(headers.Authorization!);
  assert.ok(auth);
  assert.ok(ed25519Verify(signers[0]!.publicKey, b64uDecode(auth[4]!)!, requestMessage('POST', '/api/v1/orgs', 'qv:instance@https://vote.example', Number(auth[2]), b64uDecode(auth[3]!)!, utf8(String(post.init.body)))));
  assert.equal(headers['Idempotency-Key'], 'stable-key');
  assert.deepEqual(JSON.parse(String(post.init.body)), { name: 'Council', owner_key: { pk: Buffer.from(signers[0]!.publicKey).toString('base64url'), alg: 'ed25519' }, registration_token: 'secret-token' });
  assert.equal(signers[0]!.locked, true);
  refuse = true; await assert.rejects(run()); assert.equal(signers[1]!.locked, true);
  assert.equal(calls.filter((c) => c.init.method === 'POST').length, 2, 'refusal is never automatically retried');
});

test('organizer form honors k, quorum and the reference server ballot bound before publishing', () => {
  const pk = (i: number) => bytesToHex(ed25519Keypair(new Uint8Array(32).fill(i)).publicKey);
  const form: ManifestForm = { title: 'Council', contests: [{ template: 'k-of-n', question: 'Choose', options: ['A', 'B', 'C', 'D'], k: 3 }],
    opensIso: '2027-01-01T00:00:00Z', closesIso: '2027-01-02T00:00:00Z', maxBallots: 20, quorumCount: 3,
    trustees: [1, 2, 3].map((i) => ({ name: `T${i}`, signPkHex: pk(i) })), t: 2, coordinatorPkHex: pk(8), logPkHex: pk(9),
    origin: 'https://vote.example', rollHex: [10, 11, 12, 13].map(pk).sort(), electionIdHex: '12'.repeat(16) };
  const result = buildManifest(form); assert.ok(result.ok);
  assert.equal(result.manifest.contests[0]!.selection_limit, 3); assert.equal(result.manifest.contests[0]!.winners, 3);
  assert.deepEqual(result.manifest.quorum, { type: 'count', value: 3 });
  for (const maxBallots of [0, 21, 1.5, NaN]) assert.equal(buildManifest({ ...form, maxBallots }).ok, false);
  for (const quorumCount of [-1, 1.5, 5, NaN]) assert.equal(buildManifest({ ...form, quorumCount }).ok, false);
  assert.equal(buildManifest({ ...form, contests: [{ ...form.contests[0]!, k: 5 }] }).ok, false);
});

test('concurrent organizer creation in two panels installs exactly one key without overwriting the winner', async () => {
  const storage = new MemoryStorage();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered = 0;
  let both!: () => void;
  const started = new Promise<void>((r) => { both = r; });
  const derive = async () => { if (++entered === 2) both(); await gate; };
  const first = panel(storage, false, derive), second = panel(storage, false, derive);
  first.input.value = password; second.input.value = password;
  const operations = [first.button('qv.key.create').click(), second.button('qv.key.create').click()];
  await started; release(); await Promise.all(operations);
  assert.equal(first.ready.length + second.ready.length, 1);
  const winner = first.ready.length ? first : second;
  const loser = first.ready.length ? second : first;
  const saved = serializeContainer((await storage.getKey(ORGANIZER_SLOT))!);
  loser.input.value = password; await loser.button('qv.key.unlock').click();
  assert.deepEqual(loser.ready, winner.ready, 'losing panel unlocks the winning key');
  assert.equal(serializeContainer((await storage.getKey(ORGANIZER_SLOT))!), saved);
});

test('concurrent imports of different organizer backups install exactly one and the loser unlocks the winner', async () => {
  const sources = [panel(), panel()];
  for (const source of sources) { source.input.value = password; await source.button('qv.key.create').click(); }
  assert.notEqual(sources[0]!.ready[0], sources[1]!.ready[0]);
  const backups = await Promise.all(sources.map(async (source) => serializeContainer((await source.storage.getKey(ORGANIZER_SLOT))!)));
  let release!: () => void, both!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const started = new Promise<void>((r) => { both = r; });
  let entered = 0;
  const derive = async () => { if (++entered === 2) both(); await gate; };
  const storage = new MemoryStorage();
  const panels = [panel(storage, false, derive), panel(storage, false, derive)];
  const operations = panels.map((p, i) => {
    p.input.value = password;
    p.file.files = [{ size: backups[i]!.length, text: async () => backups[i]! }];
    return p.button('qv.org.importKey').click();
  });
  await started; release(); await Promise.all(operations);
  assert.equal(panels[0]!.ready.length + panels[1]!.ready.length, 1);
  const winnerIndex = panels[0]!.ready.length ? 0 : 1;
  const winner = panels[winnerIndex]!, loser = panels[1 - winnerIndex]!;
  assert.deepEqual(winner.ready, sources[winnerIndex]!.ready);
  assert.equal(serializeContainer((await storage.getKey(ORGANIZER_SLOT))!), backups[winnerIndex]);
  assert.ok(loser.root.textContent.includes(tr.t('qv.key.locked')));
  for (const p of panels) {
    assert.equal(p.input.value, '');
    assert.equal(p.root.attrs.get('aria-busy'), 'false');
    assert.equal(p.button('qv.key.create').disabled, true);
    assert.equal(p.button('qv.org.importKey').disabled, true);
    assert.equal(p.button('qv.key.unlock').disabled, false);
  }
  loser.input.value = password; await loser.button('qv.key.unlock').click();
  assert.deepEqual(loser.ready, winner.ready);
  assert.equal(serializeContainer((await storage.getKey(ORGANIZER_SLOT))!), backups[winnerIndex]);
});

test('organizer creation fails closed when an embedding lacks atomic installation', async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(storage, 'installKeyIfAbsent', { value: undefined });
  const p = panel(storage); p.input.value = password; await p.button('qv.key.create').click();
  assert.deepEqual(p.ready, []);
  assert.equal(await storage.getKey(ORGANIZER_SLOT), undefined);
});

test('locking then clearing during organizer derivation or file import cannot restore the cleared key', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  const creating = panel(undefined, false, async () => { entered(); await gate; });
  creating.input.value = password;
  const operation = creating.button('qv.key.create').click();
  await started;
  creating.view.lock(); await creating.storage.clearAll();
  release(); await operation;
  assert.equal(await creating.storage.getKey(ORGANIZER_SLOT), undefined);
  assert.deepEqual(creating.ready, []);

  const source = panel(); source.input.value = password; await source.button('qv.key.create').click();
  const backup = serializeContainer((await source.storage.getKey(ORGANIZER_SLOT))!);
  let finishRead!: (text: string) => void;
  let reading!: () => void;
  const readStarted = new Promise<void>((r) => { reading = r; });
  const fileRead = new Promise<string>((r) => { finishRead = r; });
  const importing = panel(); importing.input.value = password;
  importing.file.files = [{ size: backup.length, text: () => { reading(); return fileRead; } }];
  const restore = importing.button('qv.org.importKey').click();
  await readStarted;
  importing.view.lock(); await importing.storage.clearAll();
  finishRead(backup); await restore;
  assert.equal(await importing.storage.getKey(ORGANIZER_SLOT), undefined);
  assert.deepEqual(importing.ready, []);
});


test('fingerprint-only organizer unlock cannot rewrap a cleared weak container after locking', async () => {
  const storage = new MemoryStorage();
  const source = panel(storage);
  await createKey({ storage, slot: ORGANIZER_SLOT, passphrase: password, deps: source.deps, params: FLOOR_PARAMS });
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  const p = panel(storage, true, async () => { entered(); await gate; });
  p.input.value = password;
  const operation = p.button('qv.key.unlock').click();
  await started; p.view.lock(); await storage.clearAll();
  release(); await operation;
  assert.equal(await storage.getKey(ORGANIZER_SLOT), undefined);
  assert.deepEqual(p.ready, []);
});

// @verifies QV-19-REQ-008, QV-26-REQ-011
test('session organizer continuation waits for an explicit encrypted key download and rejects stale backup actions', async () => {
  const p = panel(undefined, false, async () => {}, true);
  p.input.value = password; await p.button('qv.key.create').click();
  assert.deepEqual(p.ready, []); assert.deepEqual(p.downloads, []);
  const backup = p.button('qv.key.download'); await backup.click();
  assert.equal(p.ready.length, 1); assert.equal(p.downloads.length, 1);
  p.view.lock(); await backup.click();
  assert.equal(p.ready.length, 1); assert.equal(p.downloads.length, 1);
});
