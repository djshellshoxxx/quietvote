// L4 regressions (web cast delivery honesty): a board alarm raised after the board accepted the ballot POST must keep the
// receipt the board returned, store it like any other receipt, and never leave the voter with a button that does nothing.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { streamRng } from '@quietvote/crypto';
import { NO_SUPERSEDES } from '@quietvote/protocol';
import { ApiClient } from '../src/api/client.ts';
import { deriveElectionContext, type ElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { BallotController } from '../src/flow/ballot-controller.ts';
import { canNewSeal, initialBallotState, reduce, type BallotState } from '../src/flow/ballot-machine.ts';
import { inlineSealer } from '../src/flow/seal.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { IdbStorage, MemoryStorage } from '../src/key/storage.ts';
import { FakeBoard, sharedSim } from './helpers/fake-board.ts';

const SEL = { budget: ['yes'], board: ['p', 'q'] };

async function env() {
  const sim = await sharedSim();
  const board = new FakeBoard(sim);
  const api = new ApiClient({ fetch: board.fetch, sleep: async () => undefined });
  const all = await api.allEntries(board.apiId);
  const recs = all.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
  const r = await deriveElectionContext(recs);
  assert.ok(r.ok);
  return { sim, board, api, ctx: r.value as ElectionContext, storage: new MemoryStorage(), signer: (i: number): Promise<Signer> => createSigner(sim.voters[i]!.secretKey.slice()) };
}
type Env = Awaited<ReturnType<typeof env>>;
function controller(e: Env, signer: Signer): BallotController {
  return new BallotController({
    ctx: e.ctx, apiElectionId: e.board.apiId, origin: e.board.origin, signer, api: e.api, sealer: inlineSealer, storage: e.storage,
    rng: streamRng('l4'), logPk: e.board.logKey.publicKey, supersedes: NO_SUPERSEDES, clientBuild: 't', now: () => 1_790_000_100,
  });
}
async function sealed(c: BallotController): Promise<void> {
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
}

before(async () => {
  await sharedSim();
});

test('L4: a board alarm after the board accepted the ballot keeps and stores the receipt the board returned', async () => {
  const e = await env();
  e.board.tamper.inclusionPath = true;
  const c = controller(e, await e.signer(3));
  await sealed(c);
  const rep = await c.cast();
  assert.equal(rep?.error?.ux, 'E-BOARD-INCL-FAIL');
  assert.equal(e.board.entries.filter((x) => (x.record as { intent?: string }).intent === 'cast').length, 1, 'the board recorded the ballot');
  assert.ok(rep?.receipt, 'receipt offered despite the alarm');
  assert.equal(rep.receipt.ballot_code, rep.codeHex);
  assert.equal(c.lastCast?.receipt, rep.receipt);
  const stored = await e.storage.getReceipts(e.board.apiId);
  assert.equal(stored.length, 1, 'receipt stored');
  assert.equal(stored[0]?.code, rep.codeHex);
  assert.equal(await e.storage.getHead(e.board.apiId), undefined, 'an unverified head is never pinned');
  assert.equal((c.state as Extract<BallotState, { kind: 'failed' }>).retryCast, false);
});

test('L4: the New seal button is offered only where the machine accepts NEW_SEAL (no dead button after a board alarm)', async () => {
  const e = await env();
  e.board.tamper.inclusionPath = true;
  const c = controller(e, await e.signer(3));
  await sealed(c);
  await c.cast();
  assert.equal(c.state.kind, 'failed');
  assert.equal(canNewSeal(c.state), false, 'alarm after a POST: no New seal');
  assert.equal(reduce(c.state, { type: 'NEW_SEAL' }), c.state, 'and the machine indeed refuses it');
  assert.equal(canNewSeal({ kind: 'failed', selections: {}, spoiled: [], error: 'x', retryCast: false }), true, 'failed before any sealed ballot');
  assert.equal(canNewSeal(initialBallotState()), false);
  assert.equal(canNewSeal({ kind: 'audited', selections: {}, sealed: { code: '00', attempt: 0 }, spoiled: [], posted: false }), true);
});

// @verifies QV-19-REQ-014 QV-19-REQ-015
// Durable markers survive controller destruction, contain no replayable ballot, and are resolved only by verified reads.
import { recoverCast } from '../src/flow/cast-recovery.ts';
import { b64uEncode } from '../src/util/hex.ts';

function recoveryApi(e: Env): ApiClient {
  return new ApiClient({ fetch: async (input, init) => {
    const url = new URL(input, 'https://board.test');
    const leaf = url.searchParams.get('leaf_hash');
    if (leaf) {
      const entry = e.board.entries.find((x) => b64uEncode(x.leaf) === leaf);
      if (!entry) return new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/problem+json' } });
      url.searchParams.delete('leaf_hash'); url.searchParams.set('seq', String(entry.seq));
      input = url.pathname + url.search;
    }
    return e.board.fetch(input, init);
  } });
}
async function recovery(e: Env, api = recoveryApi(e)) {
  const pending = await e.storage.getPendingCast(e.board.origin, e.board.apiId);
  assert.ok(pending);
  return recoverCast({ pending, origin: e.board.origin, electionId: e.board.apiId, manifestHash: e.ctx.manifestHashHex,
    api, logPk: e.board.logKey.publicKey, storage: e.storage });
}

test('lost response persists public metadata with receipts off, and reload recovery sends only GETs', async () => {
  const e = await env();
  e.storage.settings.rememberReceipts = false;
  e.board.faults = ['drop-response'];
  let c: BallotController | undefined = controller(e, await e.signer(3));
  await sealed(c);
  const report = await c.cast();
  assert.equal(report?.outcome, 'PENDING_UNCONFIRMED');
  assert.equal(e.board.requests.filter((r) => r.method === 'POST').length, 1, 'no automatic mutation retry');
  const marker = await e.storage.getPendingCast(e.board.origin, e.board.apiId);
  assert.ok(marker);
  assert.deepEqual(Object.keys(marker).sort(), ['code', 'electionId', 'leafHash', 'manifestHash', 'origin']);
  c = undefined; // all prepared request bytes and secrets are lost, as on reload
  const before = e.board.requests.length;
  const result = await recovery(e);
  assert.equal(result.state, 'included');
  assert.ok(e.board.requests.slice(before).every((r) => r.method === 'GET'));
  assert.equal(await e.storage.getPendingCast(e.board.origin, e.board.apiId), undefined);
  assert.equal(e.storage.receipts.length, 0);
});

test('not found and invalid inclusion retain the reload gate; confirmed recovery clears it', async () => {
  const e = await env();
  e.board.faults = ['network'];
  const c = controller(e, await e.signer(3));
  await sealed(c); await c.cast();
  assert.equal((await recovery(e)).state, 'not-found');
  assert.ok(await e.storage.getPendingCast(e.board.origin, e.board.apiId));
  await c.cast(); // explicit retry of the same bytes is still supported
  assert.equal(await e.storage.getPendingCast(e.board.origin, e.board.apiId), undefined);
  e.board.faults = ['drop-response'];
  const other = controller(e, await e.signer(2));
  await sealed(other); await other.cast();
  e.board.tamper.inclusionPath = true;
  await assert.rejects(recovery(e), { code: 'E-BOARD-INCL-FAIL' });
  assert.ok(await e.storage.getPendingCast(e.board.origin, e.board.apiId));
  e.board.tamper.inclusionPath = false;
  assert.equal((await recovery(e)).state, 'included');
});

test('pending reservation/storage failure prevents POST; clear device removes pending data', async () => {
  const e = await env();
  const storage = e.storage;
  storage.putPendingCast = async () => { throw new Error('disk full'); };
  const c = controller(e, await e.signer(3)); await sealed(c);
  assert.equal((await c.cast())?.error?.ux, 'E-KEY-STORAGE');
  assert.equal(e.board.requests.filter((r) => r.method === 'POST').length, 0);
  const fresh = new MemoryStorage();
  const p = { origin: e.board.origin, electionId: e.board.apiId, manifestHash: e.ctx.manifestHashHex, code: '00'.repeat(32), leafHash: 'a' };
  await fresh.putPendingCast(p);
  assert.throws(() => fresh.putPendingCast({ ...p, leafHash: 'b' }), /unresolved/);
  await fresh.deletePendingCast({ ...p, leafHash: 'b' });
  assert.ok(await fresh.getPendingCast(p.origin, p.electionId));
  await fresh.clearAll();
  assert.equal(await fresh.getPendingCast(p.origin, p.electionId), undefined);
});

test('recovery refuses another manifest or lookup leaf before clearing pending data', async () => {
  const e = await env(); e.board.faults = ['drop-response'];
  const c = controller(e, await e.signer(3)); await sealed(c); await c.cast();
  const p = await e.storage.getPendingCast(e.board.origin, e.board.apiId); assert.ok(p);
  const args = { pending: p, origin: e.board.origin, electionId: e.board.apiId, manifestHash: '00'.repeat(32), api: recoveryApi(e), logPk: e.board.logKey.publicKey, storage: e.storage };
  await assert.rejects(recoverCast(args), { code: 'E-BOARD-INCL-FAIL' });
  const bad = new ApiClient({ fetch: async () => new Response(JSON.stringify({ seq: 0, leaf_hash: 'wrong' })) });
  await assert.rejects(recovery(e, bad), { code: 'E-BOARD-INCL-FAIL' });
  assert.ok(await e.storage.getPendingCast(e.board.origin, e.board.apiId));
});

test('a refusal on explicit retry cannot erase an earlier uncertain send', async () => {
  const e = await env(); e.board.faults = ['drop-response', 'wrong-phase'];
  const c = controller(e, await e.signer(3)); await sealed(c);
  assert.equal((await c.cast())?.outcome, 'PENDING_UNCONFIRMED');
  assert.equal((await c.cast())?.outcome, 'PENDING_UNCONFIRMED');
  assert.ok(await e.storage.getPendingCast(e.board.origin, e.board.apiId));
  assert.equal((await recovery(e)).state, 'included');
});

test('IndexedDB reservation and device clearing wait for commit and surface transaction aborts', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const p = { origin: 'log', electionId: 'id', manifestHash: '00'.repeat(32), code: '00'.repeat(32), leafHash: 'leaf' };
  let complete: () => void = () => { throw new Error('transaction not opened'); };
  let abort: () => void = complete;
  const db = { transaction: () => {
    const tx = { oncomplete: () => {}, onabort: () => {}, onerror: () => {}, error: new Error('transaction aborted'),
      objectStore: () => ({ get: () => {
        const read = { result: undefined, onsuccess: () => {} };
        queueMicrotask(() => read.onsuccess());
        return read;
      }, put: () => undefined, clear: () => undefined }) };
    complete = () => tx.oncomplete(); abort = () => tx.onabort();
    return tx;
  } };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => {
    const request = { result: db, onsuccess: () => {} };
    queueMicrotask(() => request.onsuccess()); return request;
  } } });
  try {
    const storage = new IdbStorage();
    let resolved = false;
    const first = storage.putPendingCast(p).then(() => { resolved = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(resolved, false, 'request success cannot permit a POST yet');
    complete(); await first;
    const second = storage.putPendingCast(p);
    const refused = assert.rejects(second, /transaction aborted/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    abort(); await refused;
    resolved = false;
    const clearing = storage.clearAll().then(() => { resolved = true; });
    const clearRefused = assert.rejects(clearing, /transaction aborted/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(resolved, false, 'successful clear requests cannot announce device clearing before commit');
    abort(); await clearRefused;
    const cleared = storage.clearAll().then(() => { resolved = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(resolved, false);
    complete(); await cleared;
    assert.equal(resolved, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
