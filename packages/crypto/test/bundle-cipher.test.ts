import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, openWithPassphrase, sealWithPassphrase, streamRng, utf8 } from '../src/index.ts';

const weak = { logN: 10, allowWeak: true } as const;

for (const failInput of ['cleanup passphrase', 'qv-bundle-v1']) {
  test(`sealing wipes allocated secrets on encoding failure in ${failInput === 'qv-bundle-v1' ? 'KDF' : 'passphrase'}`, async (t) => {
    const rng = streamRng('cleanup-encoding');
    let fileKey: Uint8Array | undefined;
    let passphrase: Uint8Array | undefined;
    const encode = TextEncoder.prototype.encode;
    const failure = new Error('injected encoding failure');
    t.mock.method(TextEncoder.prototype, 'encode', function (this: TextEncoder, input?: string) {
      if (input === failInput) throw failure;
      const bytes = encode.call(this, input);
      if (input === 'cleanup passphrase') passphrase = bytes;
      return bytes;
    });
    await assert.rejects(sealWithPassphrase(utf8('plaintext'), 'cleanup passphrase', {
      bytes(n) {
        const bytes = rng.bytes(n);
        if (n === 32) fileKey = bytes;
        return bytes;
      },
    }, weak), failure);
    assert.deepEqual(fileKey, new Uint8Array(32));
    if (failInput === 'qv-bundle-v1') assert.deepEqual(passphrase, new Uint8Array('cleanup passphrase'.length));
  });
}

for (const operation of ['importKey', 'encrypt'] as const) {
  for (const failAt of [1, 2]) {
    test(`sealing wipes owned secrets when ${operation} ${failAt} rejects`, async (t) => {
      const rng = streamRng(`cleanup-${operation}-${failAt}`);
      const drawn: Uint8Array[] = [];
      const encoded: Uint8Array[] = [];
      const encode = TextEncoder.prototype.encode;
      t.mock.method(TextEncoder.prototype, 'encode', function (this: TextEncoder, input?: string) {
        const bytes = encode.call(this, input);
        if (input === 'cleanup passphrase') encoded.push(bytes);
        return bytes;
      });
      const subtle = globalThis.crypto.subtle;
      const original = subtle[operation].bind(subtle);
      let calls = 0;
      const failure = new Error('injected crypto failure');
      t.mock.method(subtle, operation, (...args: Parameters<typeof original>) => {
        if (++calls === failAt) return Promise.reject(failure);
        return Reflect.apply(original, subtle, args);
      });
      const plaintext = utf8('caller-owned plaintext');
      await assert.rejects(sealWithPassphrase(plaintext, 'cleanup passphrase', {
        bytes(n) {
          const bytes = rng.bytes(n);
          drawn.push(bytes);
          return bytes;
        },
      }, weak), failure);
      assert.equal(calls, failAt);
      assert.equal(encoded.length, 1);
      assert.deepEqual(encoded[0], new Uint8Array('cleanup passphrase'.length));
      assert.equal(drawn[3]?.length, 32);
      assert.deepEqual(drawn[3], new Uint8Array(32), 'file key wiped even on failure');
      assert.deepEqual(plaintext, utf8('caller-owned plaintext'));
    });
  }
}

test('sealing cleanup preserves existing deterministic container bytes', async () => {
  const sealed = await sealWithPassphrase(utf8('cleanup compatibility'), 'test passphrase', streamRng('bt15-compat'), { logN: 4, allowWeak: true });
  assert.equal(bytesToHex(sealed), '515642554e444c3104d206c2bf7846d6f3df6d1c9a45356f4248d899d5da239015a0e91110a77c06bb8d52f3a10371d63b28ab700fdcad06d1eb58cda856f7ff51b982e5eaa2df2ee1b0af41eb4172be9277731ea4978441235c23a06ad6b720b32b955ca846f709c5c414972a1ac17f708586ea4efc8cbdf364417da34bcf4ede9cab0fdda6');
});

test('bundle cipher round-trips; wrong passphrase, tamper, wrong aad all fail with E_AEAD', async () => {
  const rng = streamRng('bc');
  const pt = utf8('top secret share');
  const f = await sealWithPassphrase(pt, 'correct horse', rng, { ...weak, aad: utf8('e1') });
  assert.deepEqual(await openWithPassphrase(f, 'correct horse', { allowWeak: true, aad: utf8('e1') }), pt);
  await assert.rejects(openWithPassphrase(f, 'wrong', { allowWeak: true, aad: utf8('e1') }), { code: 'E_AEAD' });
  await assert.rejects(openWithPassphrase(f, 'correct horse', { allowWeak: true, aad: utf8('e2') }), { code: 'E_AEAD' });
  for (const k of [9, 30, 60, f.length - 1]) {
    const g = f.slice();
    g[k] = g[k]! ^ 1;
    await assert.rejects(openWithPassphrase(g, 'correct horse', { allowWeak: true, aad: utf8('e1') }), (e: { code?: string }) => e.code === 'E_AEAD' || e.code === 'E_PARSE');
  }
  assert.ok(!Buffer.from(f).includes(Buffer.from(pt)), 'plaintext absent from ciphertext');
});

test('fresh file key, salt and nonces on every seal', async () => {
  const rng = streamRng('bc2');
  const a = await sealWithPassphrase(utf8('x'), 'p', rng, weak);
  const b = await sealWithPassphrase(utf8('x'), 'p', rng, weak);
  assert.notDeepEqual(a, b);
});

test('work factor policy: production floor is 2^18; open refuses weak and absurd headers', async () => {
  const rng = streamRng('bc3');
  await assert.rejects(sealWithPassphrase(utf8('x'), 'p', rng, { logN: 12 }), { code: 'E_ARG' });
  await assert.rejects(sealWithPassphrase(utf8('x'), '', rng, weak), { code: 'E_ARG' });
  const f = await sealWithPassphrase(utf8('x'), 'p', rng, weak);
  await assert.rejects(openWithPassphrase(f, 'p'), { code: 'E_PARSE' });
  const huge = f.slice();
  huge[8] = 30;
  await assert.rejects(openWithPassphrase(huge, 'p', { allowWeak: true }), { code: 'E_PARSE' });
  await assert.rejects(openWithPassphrase(utf8('junk'), 'p'), { code: 'E_PARSE' });
});

test('default work factor 2^18 round-trips', { timeout: 120000 }, async () => {
  const rng = streamRng('bc4');
  const f = await sealWithPassphrase(utf8('prod'), 'p', rng);
  assert.deepEqual(await openWithPassphrase(f, 'p'), utf8('prod'));
});
