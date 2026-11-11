// B3-28 (option A, QV-ADR-027): a key file whose KDF cost exceeds the defaults needs an explicit confirm before any derivation.
// Floor and ceiling are unchanged; previously valid files still unlock.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamRng } from '@quietvote/crypto';
import { importKeyFile, unlockKey } from '../src/flow/onboarding.ts';
import {
  CEILING_PARAMS, DEFAULT_PARAMS, FLOOR_PARAMS, KeyError, defaultDeps, kdfCostDecision, unwrapSeed, wrapSeed, serializeContainer,
  type KdfParams, type KeystoreDeps,
} from '../src/key/keystore.ts';
import { MemoryStorage } from '../src/key/storage.ts';

const PASS = 'correct horse battery staple';
const SEED = new Uint8Array(32).fill(7);

/** A deterministic stand-in KDF so the test never pays for a real 64 MiB derivation; it records every call. */
function spyDeps(extra: Partial<KeystoreDeps> = {}): { deps: KeystoreDeps; calls: KdfParams[] } {
  const calls: KdfParams[] = [];
  const deps: KeystoreDeps = {
    ...defaultDeps(), rng: streamRng('cost'),
    kdf: async (_pw, _salt, prm) => { calls.push({ ...prm }); return new Uint8Array(32).fill(3); },
    ...extra,
  };
  return { deps, calls };
}
async function containerWith(prm: KdfParams) {
  const { deps } = spyDeps();
  return (await wrapSeed(SEED, PASS, deps, prm)).container;
}

test('B3-28: decision is pure: defaults and anything at or below them need no confirm', () => {
  assert.equal(kdfCostDecision(DEFAULT_PARAMS).confirm, false);
  assert.equal(kdfCostDecision(FLOOR_PARAMS).confirm, false);
  assert.equal(kdfCostDecision({ m: DEFAULT_PARAMS.m, t: DEFAULT_PARAMS.t, p: 1 }).confirm, false);
});

test('B3-28: any parameter above the default (m, t or p) requires confirm; the decision carries the figures to show', () => {
  for (const prm of [{ m: 65537, t: 3, p: 1 }, { m: 65536, t: 4, p: 1 }, { m: 65536, t: 3, p: 2 }, CEILING_PARAMS]) {
    const d = kdfCostDecision(prm);
    assert.equal(d.confirm, true, JSON.stringify(prm));
    assert.deepEqual(d.params, prm);
  }
});

test('B3-28: default-cost file unlocks without ever asking', async () => {
  const c = await containerWith(DEFAULT_PARAMS);
  let asked = 0;
  const { deps, calls } = spyDeps({ confirmCost: async () => { asked++; return false; } });
  const u = await unwrapSeed(c, PASS, deps);
  assert.equal(asked, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual([...u.seed], [...SEED]);
});

test('B3-28: above-default file asks first, is told the parameters, and unlocks only after a yes', async () => {
  const prm = { m: 131072, t: 4, p: 1 };
  const c = await containerWith(prm);
  const order: string[] = [];
  const seen: KdfParams[] = [];
  const { deps, calls } = spyDeps({
    confirmCost: async (p) => { order.push('confirm'); seen.push(p); return true; },
    kdf: async (_a, _b, p) => { order.push('kdf'); calls2.push(p); return new Uint8Array(32).fill(3); },
  });
  const calls2: KdfParams[] = [];
  const u = await unwrapSeed(c, PASS, deps);
  assert.deepEqual(order, ['confirm', 'kdf']);
  assert.deepEqual(seen, [prm]);
  assert.equal(calls.length, 0);
  assert.deepEqual([...u.seed], [...SEED]);
});

test('B3-28: cancel aborts before any KDF run (spy is never called)', async () => {
  const c = await containerWith({ m: 131072, t: 4, p: 1 });
  const { deps, calls } = spyDeps({ confirmCost: async () => false });
  await assert.rejects(unwrapSeed(c, PASS, deps), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_CANCELLED');
  assert.equal(calls.length, 0);
});

test('B3-28: cancel through the real import and unlock flows runs no KDF and stores nothing', async () => {
  const c = await containerWith({ m: 131072, t: 4, p: 1 });
  const storage = new MemoryStorage();
  const { deps, calls } = spyDeps({ confirmCost: async () => false });
  await assert.rejects(importKeyFile({ storage, slot: 's', text: serializeContainer(c), passphrase: PASS, deps }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_CANCELLED');
  assert.equal(await storage.getKey('s'), undefined);
  await storage.putKey('s', c);
  await assert.rejects(unlockKey({ storage, slot: 's', passphrase: PASS, deps }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_CANCELLED');
  assert.equal(calls.length, 0);
});

test('B3-28: the ceiling and the floor are unchanged: above the ceiling and below the floor are still rejected, with no prompt and no KDF', async () => {
  assert.deepEqual({ ...CEILING_PARAMS }, { m: 262144, t: 10, p: 4 });
  assert.deepEqual({ ...FLOOR_PARAMS }, { m: 19456, t: 2, p: 1 });
  const c = await containerWith(DEFAULT_PARAMS);
  for (const bad of [{ ...c, m: CEILING_PARAMS.m + 1 }, { ...c, t: CEILING_PARAMS.t + 1 }, { ...c, p: CEILING_PARAMS.p + 1 }, { ...c, m: FLOOR_PARAMS.m - 1 }]) {
    let asked = 0;
    const { deps, calls } = spyDeps({ confirmCost: async () => { asked++; return true; } });
    await assert.rejects(unwrapSeed(bad, PASS, deps), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_PARAMS');
    assert.equal(asked, 0);
    assert.equal(calls.length, 0);
  }
});

test('B3-28: a file exactly at the ceiling (previously valid) still unlocks after a yes', async () => {
  const c = await containerWith(CEILING_PARAMS);
  const { deps } = spyDeps({ confirmCost: async () => true });
  const u = await unwrapSeed(c, PASS, deps);
  assert.deepEqual([...u.seed], [...SEED]);
});

test('B3-28 wiring: every unlock/import/recovery-code call in the UI passes the cost-confirming deps (source check; no browser here)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  const calls = src.match(/\b(?:unlockKey|importKeyFile|recoveryCodeFor|runPublish)\([^;\n]*?(?:\}\)|keyDeps\(\)\))/g) ?? [];
  assert.ok(calls.length >= 6, `found ${calls.length} call sites`);
  for (const c of calls) assert.match(c, /keyDeps\(\)/, c);
});
