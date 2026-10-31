import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamRng } from '@quietvote/crypto';
import { NO_SUPERSEDES } from '@quietvote/protocol';
import { ApiClient } from '../src/api/client.ts';
import { ApiError, isRetryable } from '../src/api/errors.ts';
import { BallotController } from '../src/flow/ballot-controller.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { inlineSealer } from '../src/flow/seal.ts';
import { createSigner } from '../src/key/signer.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { FakeBoard, sharedSim } from './helpers/fake-board.ts';

async function fixture() {
  const sim = await sharedSim();
  const board = new FakeBoard(sim);
  const api = new ApiClient({ fetch: board.fetch, sleep: async () => undefined });
  const r = await deriveElectionContext((await api.allEntries(board.apiId)).entries.map((e) => ({ seq: e.seq, record: entryRecord(e) })));
  assert.ok(r.ok);
  const signer = await createSigner(sim.voters[0]!.secretKey.slice());
  const storage = new MemoryStorage();
  const ctl = new BallotController({ ctx: r.value, apiElectionId: board.apiId, origin: board.origin, signer, api, storage,
    sealer: inlineSealer, rng: streamRng('audit3'), logPk: board.logKey.publicKey, supersedes: NO_SUPERSEDES, clientBuild: 't' });
  ctl.select({ budget: ['yes'], board: ['p'] });
  ctl.review();
  await ctl.seal();
  ctl.codeRendered();
  return { ctl, board, api, storage, signer };
}

test('B3: concurrent cast calls submit one signed entry and return one recorded ballot', async () => {
  const { ctl, board } = await fixture();
  const before = board.entries.length;
  const results = await Promise.all([ctl.cast(), ctl.cast()]);
  assert.equal(board.requests.filter((r) => r.method === 'POST' && r.url.endsWith('/log/entries')).length, 1);
  assert.equal(board.entries.length, before + 1);
  assert.equal(results[0]?.outcome, 'ACCEPTED_RECORDED');
});

test('B3-13: signed promise-only append remains downloadable and stored for later inclusion checks', async () => {
  const { ctl, board, storage } = await fixture();
  board.lazyCheckpoints = true;
  const result = await ctl.cast();
  assert.equal(result?.outcome, 'PENDING_UNCONFIRMED');
  assert.ok(result?.receipt, 'retain the verified signed promise');
  assert.equal((await storage.getReceipts(board.apiId)).length, 1);
  assert.equal(result.receipt.receipt.promise.sequenced_at, result.sequencedAt);
});

test('B3-11: locking prevents a controller from sealing with its wiped signer', async () => {
  const { ctl, signer } = await fixture();
  signer.lock();
  ctl.lockSession();
  await ctl.seal();
  assert.notEqual(ctl.state.kind, 'sealed');
  assert.equal(await ctl.cast(), undefined);
});

test('B3-14: an explicit final REVOTE_LIMIT is never retried despite HTTP 429', () => {
  assert.equal(isRetryable(new ApiError({ status: 429, code: 'REVOTE_LIMIT', retryable: false })), false);
  assert.equal(isRetryable(new ApiError({ status: 429, code: 'RATE_LIMITED', retryable: true })), true);
});

test('B3-20: a fast unlock upgrades a below-default key and still unlocks it', async () => {
  const { unlockKey } = await import('../src/flow/onboarding.ts');
  const { defaultDeps, FLOOR_PARAMS, wrapSeed } = await import('../src/key/keystore.ts');
  const { sha256, utf8 } = await import('@quietvote/crypto');
  const storage = new MemoryStorage();
  const deps = { ...defaultDeps(), rng: streamRng('fast-unlock'), kdf: async (pw: Uint8Array, salt: Uint8Array) => sha256(new Uint8Array([...pw, ...salt, ...utf8('test-kdf')])) };
  const wrapped = await wrapSeed(streamRng('upgrade-seed').bytes(32), 'correct horse battery staple', deps, FLOOR_PARAMS);
  await storage.putKey('upgrade', wrapped.container);
  let calls = 0;
  const unlocked = await unlockKey({ storage, slot: 'upgrade', passphrase: 'correct horse battery staple', deps, now: () => calls++ === 0 ? 0 : 100 });
  assert.equal(unlocked.rewrapped, true);
  assert.ok((await storage.getKey('upgrade'))!.m > FLOOR_PARAMS.m);
  unlocked.signer.lock();
});

test('B3-22: prototype-named ICU selector values fall back and unknown message ids reject cleanly', async () => {
  const { format, createTranslator } = await import('../src/i18n/index.ts');
  for (const id of ['constructor', '__proto__', 'toString']) assert.equal(format('{v, select, yes {Y} other {N}}', { v: id }, { locale: 'en' }), 'N');
  assert.throws(() => createTranslator('en').t('__proto__' as never), /unknown message/);
});

test('recorded delivery stays recorded and downloadable if saving the local receipt fails', async () => {
  const { ctl, storage } = await fixture();
  storage.putReceipt = async () => { throw new Error('storage quota exceeded'); };
  const result = await ctl.cast();
  assert.equal(result?.outcome, 'ACCEPTED_RECORDED');
  assert.ok(result?.receipt);
  assert.equal(result.storageFailed, true);
});
