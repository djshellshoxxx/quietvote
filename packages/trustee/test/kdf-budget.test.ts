import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealWithPassphrase, streamRng, utf8 } from '@quietvote/crypto';
import { readBundle } from '../src/bundle.ts';
import { main } from '../src/cli.ts';

test('BT-14: trustee refuses a forged high-cost header before authentication', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qv-budget-')));
  try {
    const file = Buffer.alloc(113);
    file.write('QVBUNDL1');
    file[8] = 19;
    const path = join(dir, 'hostile.qvtb');
    writeFileSync(path, file, { mode: 0o600 });
    await assert.rejects(readBundle(path, 'test', {}), (e: any) => e.code === 'BUNDLE_FORMAT' && /work factor/.test(e.message));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('BT-14: malformed CLI budgets fail before prompting or accessing a bundle', async () => {
  for (const value of ['17', '21', 'NaN', '18.5', '018', 'Infinity']) {
    let prompts = 0;
    const code = await main(['status', '--bundle', '/missing', '--max-kdf-logn', value], {
      out() {}, err() {}, async promptSecret() { prompts++; return ''; },
    }, { rng: { bytes: () => { throw new Error('unexpected RNG'); } }, now: () => new Date() });
    assert.equal(code, 2);
    assert.equal(prompts, 0);
  }
});


test('BT-14: explicit vault budget is honored without changing encrypted bytes', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qv-budget-')));
  try {
    const path = join(dir, 'budget.qvtb');
    const data = { bundle_version: 1, sk_sign: 'synthetic', log: [] };
    const file = await sealWithPassphrase(utf8(JSON.stringify(data)), 'test', streamRng(new Uint8Array(32).fill(3)), {
      logN: 10, allowWeak: true, aad: utf8('qv-trustee-bundle/v1'),
    });
    writeFileSync(path, file, { mode: 0o600 });
    await assert.rejects(readBundle(path, 'test', { allowWeak: true, maxLogN: 9 }), { code: 'BUNDLE_FORMAT' });
    assert.deepEqual(await readBundle(path, 'test', { allowWeak: true, maxLogN: 10 }), data);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('BT-14: CLI accepts supported opening budgets and rejects them on keygen', async () => {
  for (const value of ['18', '19', '20']) {
    let prompts = 0;
    const io = { out() {}, err() {}, async promptSecret() { prompts++; return 'test'; } };
    const deps = { rng: { bytes: () => { throw new Error('unexpected RNG'); } }, now: () => new Date() };
    // Missing bundle fails after argument validation and the prompt, before any KDF.
    assert.equal(await main(['status', '--bundle', '/missing', '--max-kdf-logn', value], io, deps), 2);
    assert.equal(prompts, 1);
    prompts = 0;
    assert.equal(await main(['keygen', '--bundle', '/missing', '--max-kdf-logn', value], io, deps), 2);
    assert.equal(prompts, 0);
  }
});
