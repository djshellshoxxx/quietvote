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
import { MemoryStorage } from '../src/key/storage.ts';
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
