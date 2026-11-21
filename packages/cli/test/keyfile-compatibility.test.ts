import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bytesToHex, hexToBytes, sha256, streamRng, wipe } from '@quietvote/crypto';
import { canonicalKeyPassphrase, keyPassphraseUnlockCandidates, KEY_PASSPHRASE_WORDS as WORDS } from '@quietvote/protocol';
import { FLOOR_PARAMS, parseContainer, unwrapSeed as unwrapCli, wrapSeed as wrapCli, type QvKey1 } from '../src/keyfile.ts';
import { defaultDeps, KeyError, unwrapSeed as unwrapWeb, wrapSeed as wrapWeb, type KeystoreDeps } from '../../web/src/key/keystore.ts';

const raw = readFileSync(new URL('./fixtures/qvkey1-legacy.json', import.meta.url));
const fixture = JSON.parse(raw.toString()) as {
  source: string; seed_hex: string; canonical_words: string;
  fixtures: { name: string; writer: string; passphrase: string; container: QvKey1 }[];
};
const seed = hexToBytes(fixture.seed_hex, 32);
const words = fixture.canonical_words;
const variant = fixture.fixtures[0]!.passphrase;
const wrongVariant = WORDS.slice(30, 36).join('-').toUpperCase();

test('legacy compatibility fixtures remain byte-pinned to pre-change CLI and web writers', () => {
  assert.equal(bytesToHex(sha256(raw)), 'ff1edf18ff3c1cf82168072e6dbb2ba3901c6acdcf8227ee67c7b8eae5f5541d');
  assert.equal(fixture.source, 'bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912');
  assert.equal(fixture.fixtures.length, 3);
});

test('canonical words share one input; arbitrary passphrases retain case, spacing and NFKC semantics', () => {
  for (const value of [words, variant, words.toUpperCase(), words.replaceAll(' ', '\t-\n')]) {
    assert.equal(canonicalKeyPassphrase(value), words);
    assert.ok(keyPassphraseUnlockCandidates(value).length <= 2);
  }
  for (const value of ['  Arbitrary Phrase-０7!  ', WORDS.slice(0, 5).join('-').toUpperCase(), 'NotInList-' + words]) {
    assert.equal(canonicalKeyPassphrase(value), value.normalize('NFKC'));
    assert.deepEqual(keyPassphraseUnlockCandidates(value), [value.normalize('NFKC')]);
  }
  // Preserve the old web's ordering: recognize its list before the NFKC fallback.
  const wide = words.replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replaceAll(' ', '-');
  assert.equal(canonicalKeyPassphrase(wide), words.replaceAll(' ', '-'));
  assert.deepEqual(keyPassphraseUnlockCandidates(words), [words]);
  assert.deepEqual(keyPassphraseUnlockCandidates(variant), [words, variant.normalize('NFKC')]);
});

test('both shipped QVKEY1 implementations unlock immutable legacy CLI and web files', async () => {
  for (const f of fixture.fixtures) {
    const c = parseContainer(f.container);
    for (const unlock of [unwrapCli, unwrapWeb]) {
      const got = await unlock(c, f.passphrase);
      assert.deepEqual(got.seed, seed, f.name);
      wipe(got.seed);
    }
  }
  // A legacy CLI file retains the original spelling; the canonical word list
  // cannot reconstruct capitalization/separators that were part of its old KDF.
  await assert.rejects(unwrapCli(fixture.fixtures[0]!.container, words), /wrong passphrase/);
  await assert.rejects(unwrapWeb(fixture.fixtures[0]!.container, words), /wrong passphrase/);
  // Legacy web files already used the canonical input and now accept variants in either client.
  assert.deepEqual((await unwrapCli(fixture.fixtures[1]!.container, words.toUpperCase())).seed, seed);
  assert.deepEqual((await unwrapWeb(fixture.fixtures[2]!.container, fixture.fixtures[2]!.passphrase.normalize('NFKC'))).seed, seed);
});

test('new CLI and web containers are interchangeable across list-word input variants', async () => {
  const c = await wrapCli(seed, variant, streamRng('new cross-client fixture'), FLOOR_PARAMS);
  const w = (await wrapWeb(seed, words, { ...defaultDeps(), rng: streamRng('new cross-client fixture') }, FLOOR_PARAMS)).container;
  assert.deepEqual(c, w, 'same canonical input, seed and RNG produce identical bytes in both implementations');
  for (const [container, input] of [[c, words.toUpperCase()], [w, variant]] as const) {
    for (const unlock of [unwrapCli, unwrapWeb]) {
      const got = await unlock(container, input);
      assert.deepEqual(got.seed, seed);
      wipe(got.seed);
    }
  }
});

test('CLI wrong-password unlock derives at most twice, once for identical candidates, never for invalid parameters', async (t) => {
  const subtle = globalThis.crypto.subtle;
  const original = subtle.importKey.bind(subtle);
  let calls = 0;
  t.mock.method(subtle, 'importKey', async (...args: Parameters<SubtleCrypto['importKey']>) => {
    calls++;
    return original(...args);
  });
  const c = fixture.fixtures[0]!.container;
  await assert.rejects(unwrapCli(c, wrongVariant), /wrong passphrase/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(unwrapCli(c, 'not a correct arbitrary phrase'), /wrong passphrase/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(unwrapCli({ ...c, m: 999999999 }, variant), /ceiling/);
  assert.equal(calls, 0);
});

function countingDeps(): { deps: KeystoreDeps; inputs: string[]; passwords: Uint8Array[]; keys: Uint8Array[] } {
  const inputs: string[] = [], passwords: Uint8Array[] = [], keys: Uint8Array[] = [];
  return { inputs, passwords, keys, deps: { ...defaultDeps(), rng: streamRng('candidate count'),
    kdf: async (pw) => {
      inputs.push(new TextDecoder().decode(pw)); passwords.push(pw);
      const key = sha256(pw); keys.push(key); return key;
    },
  } };
}

test('web wrong-password fallback is bounded, wipes both candidate buffers and preserves cost cancellation', async () => {
  const wrapping = countingDeps();
  const c = (await wrapWeb(seed, words, wrapping.deps, FLOOR_PARAMS)).container;
  const r = countingDeps();
  await assert.rejects(unwrapWeb(c, wrongVariant, r.deps), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_LOCKED');
  assert.deepEqual(r.inputs, keyPassphraseUnlockCandidates(wrongVariant));
  assert.ok([...r.passwords, ...r.keys].every((buf) => buf.every((byte) => byte === 0)));
  const same = countingDeps();
  await assert.rejects(unwrapWeb(c, 'not a correct arbitrary phrase', same.deps), /wrong passphrase/);
  assert.equal(same.inputs.length, 1);
  const cancelled = countingDeps(); let confirms = 0;
  cancelled.deps.confirmCost = async () => { confirms++; return false; };
  await assert.rejects(unwrapWeb({ ...c, m: 131072 }, variant, cancelled.deps), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_CANCELLED');
  assert.equal(confirms, 1); assert.equal(cancelled.inputs.length, 0);
});

test('KDF errors propagate without retries and password bytes are wiped', async () => {
  const r = countingDeps();
  r.deps.kdf = async (pw) => { r.passwords.push(pw); throw new RangeError('allocation refused'); };
  await assert.rejects(unwrapWeb(fixture.fixtures[0]!.container, variant, r.deps), /allocation refused/);
  assert.equal(r.passwords.length, 1);
  assert.ok(r.passwords[0]!.every((byte) => byte === 0));
});
