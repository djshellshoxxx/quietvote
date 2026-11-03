import test from 'node:test';
import assert from 'node:assert/strict';
import { openWithPassphrase, sealWithPassphrase, streamRng, utf8 } from '../src/index.ts';

const weak = { logN: 10, allowWeak: true } as const;

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
