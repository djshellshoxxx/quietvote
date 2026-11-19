// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-26-REQ-011, QV-10-REQ-020
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryStorage } from '../src/key/storage.ts';
import { StorageSession } from '../src/key/storage-session.ts';
import { boardStorage } from '../src/key/board-storage.ts';
import type { QvKey1 } from '../src/key/keystore.ts';

const key = { keyId: '0123456789abcdef' } as QvKey1;
const marker = { origin: 'log', electionId: 'id', manifestHash: '00'.repeat(32), code: '11'.repeat(32), leafHash: 'leaf' };
const refuse = async (): Promise<never> => { throw new Error('browser storage refused'); };

test('failure offers an explicit choice, while retry retains the original store and no automatic fallback occurs', async () => {
  const durable = new MemoryStorage(); await durable.putKey('key', key);
  const session = new StorageSession(durable), original = session.current;
  assert.equal(session.selectSession(), false);
  durable.getSettings = refuse;
  await assert.rejects(session.current.getSettings(), /refused/);
  assert.equal(session.current, original); assert.equal(session.isSession, false);
  assert.equal(session.canSelectSession, true);
  session.retry();
  durable.getSettings = MemoryStorage.prototype.getSettings.bind(durable);
  assert.deepEqual(await session.current.getSettings(), durable.settings);
  assert.equal(session.selectSession(), false);
  assert.equal(await session.current.getKey('key'), key);
});

test('explicit memory operation reports nonpersistence and neither copies nor clears inaccessible durable state', async () => {
  const durable = new MemoryStorage(); await durable.putKey('key', key);
  const session = new StorageSession(durable), prior = session.current;
  durable.getSettings = refuse; await assert.rejects(prior.getSettings());
  assert.equal(session.selectSession(), true);
  assert.equal(session.isSession, true); assert.equal(await session.current.requestPersistence(), false);
  assert.equal(await session.current.getKey('key'), undefined);
  await assert.rejects(prior.putKey('stale', key), /context changed/);
  assert.equal(await durable.getKey('stale'), undefined);
  await session.current.putKey('session', key); await session.current.putPendingCast(marker);
  await session.clear();
  assert.deepEqual(await session.current.listKeySlots(), []);
  assert.equal(await session.current.getPendingCast(marker.origin, marker.electionId), undefined);
  assert.equal(await durable.getKey('key'), key, 'session clearing does not erase the durable store');
  const nextPage = new StorageSession(durable);
  assert.equal(nextPage.isSession, false, 'the page-session choice never becomes a saved fallback preference');
});

test('late reads cannot reinstall a prior context after a deliberate session switch', async () => {
  const durable = new MemoryStorage(); let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  durable.getKey = async () => { await wait; return key; };
  durable.getSettings = refuse;
  const session = new StorageSession(durable);
  const late = session.current.getKey('key');
  const rejected = assert.rejects(late, /context changed/);
  await assert.rejects(session.current.getSettings());
  assert.equal(session.selectSession(), true); release(); await rejected;
  assert.equal(await session.current.getKey('key'), undefined);
});

test('a ballot prevents a mode switch, and a refused clear preserves its original pending context', async () => {
  const durable = new MemoryStorage(); await durable.putPendingCast(marker);
  const session = new StorageSession(durable), active = session.current;
  session.beginBallot(); durable.getSettings = refuse; durable.clearAll = refuse;
  await assert.rejects(session.current.getSettings());
  assert.equal(session.canSelectSession, false); assert.equal(session.selectSession(), false);
  await assert.rejects(session.clear(), /refused/);
  assert.deepEqual(await active.getPendingCast(marker.origin, marker.electionId), marker);
  assert.equal(session.selectSession(), false); assert.equal(session.isSession, false);
});

test('session keys, receipts and unresolved markers preserve the same board-origin namespaces', async () => {
  const durable = new MemoryStorage(); durable.getSettings = refuse;
  const session = new StorageSession(durable); await assert.rejects(session.current.getSettings()); session.selectSession();
  const a = boardStorage(session.current, 'https://a.test', 'https://page.test');
  const b = boardStorage(session.current, 'https://b.test', 'https://page.test');
  await a.putKey('voter:id', key); await a.putPendingCast(marker);
  await a.putReceipt({ electionId: 'id', code: marker.code, seq: 1, json: '{}' });
  assert.equal(await b.getKey('voter:id'), undefined);
  assert.equal(await b.getPendingCast(marker.origin, marker.electionId), undefined);
  assert.deepEqual(await b.getReceipts('id'), []);
  assert.equal(await a.getKey('voter:id'), key);
  assert.deepEqual(await a.getPendingCast(marker.origin, marker.electionId), marker);
});

// The retry remains inside the controller, never in DeviceStorage or a file.
import { streamRng } from '@quietvote/crypto';
import { NO_SUPERSEDES } from '@quietvote/protocol';
import { ApiClient } from '../src/api/client.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { BallotController } from '../src/flow/ballot-controller.ts';
import { inlineSealer } from '../src/flow/seal.ts';
import { createSigner } from '../src/key/signer.ts';
import { FakeBoard, sharedSim } from './helpers/fake-board.ts';

test('leaving a session ballot view retains only an unresolved exact retry and drops choices', async () => {
  const sim = await sharedSim(), board = new FakeBoard(sim), storage = new MemoryStorage();
  const api = new ApiClient({ fetch: board.fetch });
  const all = await api.allEntries(board.apiId);
  const context = await deriveElectionContext(all.entries.map((entry) => ({ seq: entry.seq, record: entryRecord(entry) })));
  assert.ok(context.ok);
  const signer = await createSigner(sim.voters[0]!.secretKey.slice());
  const controller = new BallotController({ ctx: context.value, apiElectionId: board.apiId, origin: board.origin,
    signer, api, sealer: inlineSealer, storage, rng: streamRng('session-retention'), logPk: board.logKey.publicKey,
    supersedes: NO_SUPERSEDES, clientBuild: 'session-test' });
  controller.select({ budget: ['yes'], board: ['p', 'q'] }); controller.review();
  await controller.seal(); controller.codeRendered();
  board.faults = ['network']; await controller.cast();
  assert.equal(controller.retainPendingRetry(), true);
  assert.ok('selections' in controller.state); assert.deepEqual(controller.state.selections, {});
  signer.lock();
  assert.ok(await storage.getPendingCast(board.origin, board.apiId));
  const retried = await controller.cast(); assert.equal(retried?.outcome, 'ACCEPTED_RECORDED');
  const requests = board.requests.filter((request) => request.method === 'POST');
  assert.equal(requests.length, 2); assert.equal(requests[0]!.body, requests[1]!.body);
  assert.equal(controller.retainPendingRetry(), false);
  assert.equal(await storage.getPendingCast(board.origin, board.apiId), undefined);
});

test('session selection locks an organizer still unlocking and discards a signature that finishes after invalidation', async () => {
  const durable = new MemoryStorage(), session = new StorageSession(durable);
  durable.getSettings = refuse; await assert.rejects(session.current.getSettings());
  let releaseLoad!: () => void;
  const loading = new Promise<void>((resolve) => { releaseLoad = resolve; });
  const lateSigner = await createSigner(new Uint8Array(32).fill(31));
  const late = session.protectSigner(async () => { await loading; return lateSigner; }, () => true);
  const lateRefusal = assert.rejects(late, /context changed/);
  assert.equal(session.selectSession(), true); releaseLoad(); await lateRefusal;
  assert.equal(lateSigner.locked, true);

  const signer = await createSigner(new Uint8Array(32).fill(32));
  let finishSign!: (signature: Uint8Array) => void;
  signer.sign = () => new Promise<Uint8Array>((resolve) => { finishSign = resolve; });
  const protectedSigner = await session.protectSigner(async () => signer, () => true);
  const pending = protectedSigner.sign(new Uint8Array([1]));
  const refusal = assert.rejects(pending, /context changed/);
  session.lockSigners(); assert.equal(protectedSigner.locked, true);
  const signature = new Uint8Array(64).fill(9); finishSign(signature); await refusal;
  assert.deepEqual(signature, new Uint8Array(64), 'a late signature is not returned to a request builder');
  let loads = 0;
  await assert.rejects(session.protectSigner(async () => { loads++; return lateSigner; }, () => false), /context changed/);
  assert.equal(loads, 0, 'an already stale operation must not unlock a key');
});

import { enrollOrganization } from '../src/flow/publish-ui.ts';

test('an organizer waiting on instance discovery cannot sign or send after a storage-mode switch', async () => {
  const durable = new MemoryStorage(), session = new StorageSession(durable);
  const signer = await createSigner(new Uint8Array(32).fill(33));
  let discovered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { discovered = resolve; });
  const pause = new Promise<void>((resolve) => { release = resolve; });
  let posts = 0;
  const work = enrollOrganization({ name: 'Council', token: 'test-token', idempotencyKey: 'test-attempt', passphrase: 'fixture',
    storage: session.current, apiBase: 'https://board.test', origin: 'https://page.test',
    unlock: () => session.protectSigner(async () => signer, () => true),
    makeClient: (options) => new ApiClient({ ...options, fetch: async (url, init) => {
      if (String(url).endsWith('/instance')) { discovered(); await pause; return Response.json({ instance_id: 'instance', api_versions: ['1'], server_version: 'test' }); }
      if (init?.method === 'POST') posts++;
      return Response.json({ org_id: 'org', name: 'Council' });
    } }) });
  const refused = assert.rejects(work);
  await started;
  durable.getSettings = refuse; await assert.rejects(session.current.getSettings());
  assert.equal(session.selectSession(), true); assert.equal(signer.locked, true);
  release(); await refused;
  assert.equal(posts, 0);
});
