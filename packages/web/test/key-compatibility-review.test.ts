import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { argon2idKdfAsync, ed25519Keypair, ed25519Verify, hexToBytes, sha256, utf8, wipe } from '@quietvote/crypto';
import { defaultDeps, FLOOR_PARAMS, KeyError, unwrapSeed, wrapSeed, type KeystoreDeps, type QvKey1 } from '../src/key/keystore.ts';
import { createSigner } from '../src/key/signer.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { ORGANIZER_SLOT, unlockKey } from '../src/flow/onboarding.ts';

const fixture = JSON.parse(readFileSync(new URL('../../cli/test/fixtures/qvkey1-legacy.json', import.meta.url), 'utf8')) as {
  seed_hex: string; canonical_words: string;
  fixtures: { writer: string; passphrase: string; container: QvKey1 }[];
};
const legacy = fixture.fixtures[0]!;

test('review: legacy ciphertexts decrypt under their independently specified old KDF inputs', async () => {
  // Deliberately do not call either new canonicalizer or either container reader.
  for (const f of fixture.fixtures) {
    const c = f.container;
    const password = utf8(f.writer === 'web' ? fixture.canonical_words : f.passphrase.normalize('NFKC'));
    const raw = await argon2idKdfAsync(password, hexToBytes(c.salt, 16), { m: c.m, t: c.t, p: c.p, dkLen: 32 });
    let plain: Uint8Array | undefined;
    try {
      const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['decrypt']);
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(c.iv, 12) as BufferSource,
        additionalData: utf8(c.aad) as BufferSource }, key, hexToBytes(c.ct, 80) as BufferSource));
      const seed = hexToBytes(fixture.seed_hex, 32);
      try {
        assert.deepEqual(plain.slice(0, 32), seed);
        assert.deepEqual(plain.slice(32), ed25519Keypair(seed).publicKey);
      } finally { wipe(seed); }
    } finally { wipe(password); wipe(raw); if (plain) wipe(plain); }
  }
});

test('review: legacy fallback unlock does not rewrite a read-only organizer key', async () => {
  const storage = new MemoryStorage();
  const before = JSON.stringify(legacy.container);
  storage.keys.set(ORGANIZER_SLOT, structuredClone(legacy.container));
  let writes = 0;
  storage.putKey = async () => { writes++; throw new Error('read-only unlock attempted a write'); };
  const unlocked = await unlockKey({ storage, slot: ORGANIZER_SLOT, passphrase: legacy.passphrase, rewrap: false });
  try {
    assert.equal(unlocked.rewrapped, false);
    assert.equal(writes, 0);
    assert.equal(JSON.stringify(await storage.getKey(ORGANIZER_SLOT)), before);
    const message = utf8('independent organizer unlock review');
    assert.equal(ed25519Verify(unlocked.signer.publicKey, await unlocked.signer.sign(message), message), true);
  } finally { unlocked.signer.lock(); }
  await assert.rejects(unlocked.signer.sign(utf8('after lock')), /locked/);
});

function fastDeps(): { deps: KeystoreDeps; passwords: Uint8Array[]; keys: Uint8Array[]; calls: string[] } {
  const passwords: Uint8Array[] = [], keys: Uint8Array[] = [], calls: string[] = [];
  return { passwords, keys, calls, deps: { ...defaultDeps(), kdf: async (pw) => {
    calls.push(new TextDecoder().decode(pw)); passwords.push(pw);
    const key = sha256(pw); keys.push(key); return key;
  } } };
}

test('review: invalid metadata spends no KDF and approved expensive fallback prompts only once', async () => {
  const invalid = fastDeps(); let invalidPrompts = 0;
  invalid.deps.confirmCost = async () => { invalidPrompts++; return true; };
  await assert.rejects(unwrapSeed({ ...legacy.container, m: 262145 }, legacy.passphrase, invalid.deps),
    (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_PARAMS');
  assert.equal(invalidPrompts, 0); assert.deepEqual(invalid.calls, []);
  const high = fastDeps(); let prompts = 0;
  high.deps.confirmCost = async (p) => { prompts++; assert.equal(p.m, 131072); return true; };
  await assert.rejects(unwrapSeed({ ...legacy.container, m: 131072 }, legacy.passphrase, high.deps),
    (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_LOCKED');
  assert.equal(prompts, 1); assert.equal(high.calls.length, 2);
  assert.ok([...high.passwords, ...high.keys].every((b) => b.every((v) => v === 0)));
});

test('review: a failed AES key import wipes derived key and candidate bytes without fallback', async () => {
  const r = fastDeps(); let imports = 0;
  r.deps.subtle = { importKey: async () => { imports++; throw new Error('provider unavailable'); } } as unknown as SubtleCrypto;
  await assert.rejects(unwrapSeed(legacy.container, legacy.passphrase, r.deps), /provider unavailable/);
  assert.equal(imports, 1); assert.equal(r.calls.length, 1);
  assert.ok([...r.passwords, ...r.keys].every((b) => b.every((v) => v === 0)));
});

test('review: a failed container encryption wipes the plaintext but leaves caller-owned seed intact', async () => {
  const r = fastDeps(); let captured: Uint8Array | undefined;
  r.deps.subtle = {
    importKey: crypto.subtle.importKey.bind(crypto.subtle),
    encrypt: async (_algorithm: unknown, _key: unknown, data: Uint8Array) => { captured = data; throw new Error('encryption unavailable'); },
  } as unknown as SubtleCrypto;
  const seed = hexToBytes(fixture.seed_hex, 32), before = seed.slice();
  try {
    await assert.rejects(wrapSeed(seed, fixture.canonical_words, r.deps, FLOOR_PARAMS), /encryption unavailable/);
    assert.ok(captured); assert.equal(captured.length, 64); assert.ok(captured.every((v) => v === 0));
    assert.deepEqual(seed, before);
    assert.ok([...r.passwords, ...r.keys].every((b) => b.every((v) => v === 0)));
  } finally { wipe(seed); wipe(before); }
});

test('review: failed WebCrypto signer import wipes PKCS8 seed bytes before noble fallback', async () => {
  let captured: Uint8Array | undefined;
  const subtle = { importKey: async (_format: string, data: Uint8Array) => {
    captured = data; throw new Error('Ed25519 unavailable');
  } } as unknown as SubtleCrypto;
  const seed = hexToBytes(fixture.seed_hex, 32);
  const signer = await createSigner(seed, { subtle });
  try {
    assert.equal(signer.kind, 'noble');
    assert.ok(captured); assert.equal(captured.length, 48);
    assert.ok(captured.every((v) => v === 0), 'failed import must not retain a second seed copy');
    assert.ok(seed.every((v) => v === 0));
    const message = utf8('fallback remains functional');
    assert.equal(ed25519Verify(signer.publicKey, await signer.sign(message), message), true);
  } finally { signer.lock(); }
  assert.ok(signer.nonceKey.every((v) => v === 0));
});
