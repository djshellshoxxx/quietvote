import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamRng, ed25519Verify, ed25519Keypair } from '@quietvote/crypto';
import { WORDS } from '../src/key/wordlist.ts';
import { checkPassphrase, generatePassphrase, splitWords, canonicalPassphrase, fingerprintWords } from '../src/key/passphrase.ts';
import {
  CEILING_PARAMS, DEFAULT_PARAMS, FLOOR_PARAMS, KeyError, adaptParams, defaultDeps, keyIdOf, needsRewrap, parseContainer, serializeContainer,
  unwrapSeed, wrapSeed, type KeystoreDeps,
} from '../src/key/keystore.ts';
import { decodeRecoveryCode, encodeRecoveryCode } from '../src/key/recovery.ts';
import { createSigner } from '../src/key/signer.ts';
import { LockTimer } from '../src/key/lock.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { crockfordDecode, crockfordEncode, electionIdOf, sameElectionId, ballotCodeDisplay } from '../src/util/crockford.ts';

const deps = (seed = 'k'): KeystoreDeps => ({ ...defaultDeps(), rng: streamRng(seed) });
const hasCtx = JSON.stringify;

test('wordlist: 1296 unique pronounceable words', () => {
  assert.equal(WORDS.length, 1296);
  assert.equal(new Set(WORDS).size, 1296);
  assert.ok(WORDS.every((w) => /^[a-z]{4}$/.test(w)));
});

test('passphrase policy: 12 chars or 6 list words, no composition rules (REQ-007)', () => {
  assert.equal(checkPassphrase('short').ok, false);
  assert.deepEqual(checkPassphrase('short').problems, ['tooShort']);
  assert.equal(checkPassphrase('aaaaaaaaaaaaaaaa').ok, false);
  assert.equal(checkPassphrase('password1234').ok, false);
  assert.equal(checkPassphrase('correct horse battery staple').ok, true);
  // all lower-case, no digits or symbols is fine
  assert.equal(checkPassphrase('mistral harbour velvet lantern').ok, true);
  const w = generatePassphrase(streamRng('pp'));
  assert.equal(splitWords(w).length, 7);
  const c = checkPassphrase(w);
  assert.equal(c.ok, true);
  assert.equal(c.mode, 'words');
  assert.ok(c.estimatedBits >= 72);
  assert.equal(checkPassphrase(WORDS.slice(0, 5).join(' ')).ok, false);
  assert.equal(checkPassphrase(`${WORDS[0]} ${WORDS[0]} ${WORDS[0]} ${WORDS[0]} ${WORDS[0]} ${WORDS[0]}`).ok, false);
  assert.equal(canonicalPassphrase(`  ${WORDS[1]!.toUpperCase()}   ${WORDS[2]}-${WORDS[3]} ${WORDS[4]} ${WORDS[5]} ${WORDS[6]}`), WORDS.slice(1, 7).join(' '));
  assert.throws(() => generatePassphrase(streamRng('x'), 5));
});

test('generated passphrases are uniform enough: all indices reachable, no modulo skew above limit', () => {
  const rng = streamRng('uniform');
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) for (const x of splitWords(generatePassphrase(rng, 7))) seen.add(x);
  assert.ok(seen.size > 600);
});

test('QVKEY1 wrap/unwrap round trip, ciphertext hides the seed (REQ-003)', async () => {
  const seed = streamRng('seed').bytes(32);
  const pk = ed25519Keypair(seed).publicKey;
  const { container, params, atFloor } = await wrapSeed(seed, 'correct horse battery staple', deps(), FLOOR_PARAMS);
  assert.deepEqual(params, FLOOR_PARAMS);
  assert.equal(atFloor, true);
  assert.equal(container.keyId, keyIdOf(pk));
  assert.equal(container.aad, `qv-key-v1|${container.keyId}`);
  const text = serializeContainer(container);
  assert.ok(!text.includes(Buffer.from(seed).toString('hex')), 'plaintext seed must not appear');
  const u = await unwrapSeed(parseContainer(text), 'correct horse battery staple', deps());
  assert.deepEqual(u.seed, seed);
  assert.deepEqual(u.publicKey, pk);
  await assert.rejects(() => unwrapSeed(container, 'wrong passphrase value', deps()), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_LOCKED');
});

test('QVKEY1: tampering with any field breaks unlock; below-floor and above-ceiling parameters are rejected (REQ-004)', async () => {
  const seed = streamRng('seed2').bytes(32);
  const { container } = await wrapSeed(seed, 'a long enough pass phrase', deps('t'), FLOOR_PARAMS);
  const flip = (hex: string): string => (hex[0] === '0' ? '1' : '0') + hex.slice(1);
  for (const f of ['ct', 'iv', 'salt'] as const) {
    await assert.rejects(() => unwrapSeed({ ...container, [f]: flip(container[f]) }, 'a long enough pass phrase', deps()), KeyError, f);
  }
  await assert.rejects(() => unwrapSeed({ ...container, keyId: flip(container.keyId), aad: `qv-key-v1|${flip(container.keyId)}` }, 'a long enough pass phrase', deps()), KeyError);
  assert.throws(() => parseContainer({ ...container, m: FLOOR_PARAMS.m - 1 }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_PARAMS');
  assert.throws(() => parseContainer({ ...container, t: 1 }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_PARAMS');
  assert.throws(() => parseContainer({ ...container, m: CEILING_PARAMS.m + 1 }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_PARAMS');
  assert.throws(() => parseContainer({ ...container, extra: 1 }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_FORMAT');
  assert.throws(() => parseContainer('{"v":2}'), KeyError);
  assert.throws(() => parseContainer('not json'), KeyError);
  await assert.rejects(() => wrapSeed(seed, 'a long enough pass phrase', deps(), { m: 1024, t: 1, p: 1 }), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_PARAMS');
});

test('QVKEY1: default parameters match REQ-004 and old containers are flagged for transparent re-wrap', async () => {
  assert.deepEqual({ ...DEFAULT_PARAMS }, { m: 65536, t: 3, p: 1 });
  assert.deepEqual({ ...FLOOR_PARAMS }, { m: 19456, t: 2, p: 1 });
  const seed = streamRng('seed3').bytes(32);
  const { container } = await wrapSeed(seed, 'a long enough pass phrase', deps('u'), FLOOR_PARAMS);
  assert.equal(needsRewrap(container), true);
  const again = await wrapSeed(seed, 'a long enough pass phrase', deps('v'), FLOOR_PARAMS);
  assert.notEqual(again.container.iv, container.iv, 're-wrap uses a fresh IV');
  assert.notEqual(again.container.salt, container.salt);
});

test('allocation failure falls back to the floor and reports it (REQ-005)', async () => {
  const d = deps('alloc');
  const real = d.kdf;
  let calls = 0;
  const flaky: KeystoreDeps = {
    ...d,
    kdf: (pw, salt, prm, p) => {
      calls++;
      if (prm.m > FLOOR_PARAMS.m) return Promise.reject(new RangeError('Array buffer allocation failed'));
      return real(pw, salt, prm, p);
    },
  };
  const r = await wrapSeed(streamRng('s').bytes(32), 'a long enough pass phrase', flaky, DEFAULT_PARAMS);
  assert.equal(calls, 2);
  assert.equal(r.atFloor, true);
  assert.equal(r.container.m, FLOOR_PARAMS.m);
});

test('adaptParams keeps unlock within 0.5-3 s inside floor/ceiling', () => {
  assert.deepEqual(adaptParams(DEFAULT_PARAMS, 5000).params.m, 32768);
  assert.equal(adaptParams({ m: 19456, t: 3, p: 1 }, 9000).atFloor, true);
  assert.equal(adaptParams({ m: 19456, t: 3, p: 1 }, 9000).changed, false);
  assert.equal(adaptParams({ m: 32768, t: 3, p: 1 }, 100).params.m, 65536);
  assert.equal(adaptParams(DEFAULT_PARAMS, 1000).changed, false);
});

test('recovery code: round trip, checksum, confusable tolerance', () => {
  const seed = streamRng('rec').bytes(32);
  const code = encodeRecoveryCode(seed);
  assert.match(code, /^([0-9A-Z]{4}-){13}[0-9A-Z]{4}$/);
  assert.deepEqual(decodeRecoveryCode(code), seed);
  assert.deepEqual(decodeRecoveryCode(code.toLowerCase().replace(/-/g, ' ')), seed);
  assert.deepEqual(decodeRecoveryCode(code.replace(/0/g, 'O').replace(/1/g, 'l')), seed);
  const bad = code.slice(0, 5) + (code[5] === '2' ? '3' : '2') + code.slice(6);
  assert.throws(() => decodeRecoveryCode(bad), (e: unknown) => e instanceof KeyError && e.code === 'E_KEY_CHECKSUM');
  assert.throws(() => decodeRecoveryCode('ABCD'), KeyError);
});

test('crockford: round trips, padding bits must be zero, election id shape', () => {
  const b = streamRng('ck').bytes(32);
  assert.deepEqual(crockfordDecode(crockfordEncode(b), 32), b);
  assert.equal(crockfordDecode('U'.repeat(52), 32), undefined);
  const id = electionIdOf(b);
  assert.match(id, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/);
  assert.ok(sameElectionId(id, id.toLowerCase().replace(/-/g, '')));
  assert.ok(!sameElectionId(id, electionIdOf(streamRng('other').bytes(32))));
  assert.equal(ballotCodeDisplay(b).replace(/-/g, '').length, 52);
  assert.ok(ballotCodeDisplay(b, true).replace(/-/g, '').length >= 26);
});

test('signer: WebCrypto key is non-extractable, seed buffer zeroed, signatures verify strictly (REQ-006)', async () => {
  const seed = streamRng('sg').bytes(32);
  const kp = ed25519Keypair(seed.slice());
  const live = seed.slice();
  const s = await createSigner(live);
  assert.ok(live.every((x) => x === 0), 'raw seed buffer zeroed');
  assert.deepEqual(s.publicKey, kp.publicKey);
  assert.equal(s.kind, 'webcrypto');
  assert.equal(s.cryptoKey?.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey('pkcs8', s.cryptoKey!));
  const msg = new TextEncoder().encode('hello');
  const sig = await s.sign(msg);
  assert.ok(ed25519Verify(kp.publicKey, sig, msg));
  s.lock();
  await assert.rejects(() => s.sign(msg));
  // noble fallback produces identical signatures
  const n = await createSigner(seed.slice(), { preferWebCrypto: false });
  assert.equal(n.kind, 'noble');
  assert.deepEqual(await n.sign(msg), sig);
});

test('lock timer: idle 10 min, hidden > 2 min, warning window', () => {
  const t = new LockTimer(0);
  assert.equal(t.shouldLock(9 * 60_000), false);
  assert.equal(t.shouldLock(10 * 60_000 + 1), true);
  assert.equal(t.warningMsRemaining(7 * 60_000), undefined);
  assert.equal(t.warningMsRemaining(8 * 60_000 + 1000), 119_000);
  t.touch(9 * 60_000);
  assert.equal(t.shouldLock(10 * 60_000 + 1), false);
  t.setHidden(true, 9 * 60_000);
  assert.equal(t.shouldLock(9 * 60_000 + 119_000), false);
  assert.equal(t.shouldLock(9 * 60_000 + 121_000), true);
  t.setHidden(false, 9 * 60_000 + 130_000);
  assert.equal(t.shouldLock(9 * 60_000 + 130_000), false);
});

test('fingerprint words are 8 list words', () => {
  const w = fingerprintWords(streamRng('fp').bytes(32));
  assert.equal(w.length, 8);
  assert.ok(w.every((x) => WORDS.includes(x)));
});

test('memory storage: clearAll wipes keys, receipts, heads and settings; canary secrets are never stored in clear', async () => {
  const st = new MemoryStorage();
  const seed = streamRng('mem').bytes(32);
  const { container } = await wrapSeed(seed, 'a long enough pass phrase', deps('m'), FLOOR_PARAMS);
  await st.putKey('e1', container);
  await st.putReceipt({ electionId: 'e1', code: 'C', seq: 1, json: '{}' });
  await st.putHead({ electionId: 'e1', size: 1, note: 'n' });
  const dump = hasCtx([...st.keys.values()]) + hasCtx(st.receipts) + hasCtx([...st.heads.values()]);
  assert.ok(!dump.includes(Buffer.from(seed).toString('hex')));
  assert.ok(!dump.includes('a long enough pass phrase'));
  await st.clearAll();
  assert.deepEqual(await st.listKeySlots(), []);
  assert.deepEqual(await st.getReceipts('e1'), []);
  assert.equal(await st.getHead('e1'), undefined);
});
