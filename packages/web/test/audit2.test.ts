// Second-wave triage regression tests (docs/audit/web-verifier.md, W1..W9).
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { streamRng } from '@quietvote/crypto';
import { NO_SUPERSEDES, signRecord } from '@quietvote/protocol';
import { signCheckpoint } from '@quietvote/board';
import { ApiClient } from '../src/api/client.ts';
import { deriveElectionContext, type ElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { BallotController } from '../src/flow/ballot-controller.ts';
import { reduce, type BallotState } from '../src/flow/ballot-machine.ts';
import { LiveElection, type LiveTarget } from '../src/flow/live.ts';
import { inlineSealer } from '../src/flow/seal.ts';
import { isoUtc } from '../src/flow/organizer.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { bytesToHex } from '@quietvote/crypto';
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
  return { sim, board, api, recs, ctx: r.value as ElectionContext, storage: new MemoryStorage(), signer: (i: number): Promise<Signer> => createSigner(sim.voters[i]!.secretKey.slice()) };
}
type Env = Awaited<ReturnType<typeof env>>;
function controller(e: Env, signer: Signer): BallotController {
  return new BallotController({
    ctx: e.ctx, apiElectionId: e.board.apiId, origin: e.board.origin, signer, api: e.api, sealer: inlineSealer, storage: e.storage,
    rng: streamRng('a2'), logPk: e.board.logKey.publicKey, supersedes: NO_SUPERSEDES, clientBuild: 't', now: () => 1_790_000_100,
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

for (const fault of ['500', 'bad-body'] as const) {
  test(`W1: a ${fault} answer to the ballot POST is an unknown delivery: same bytes can be retried, nothing is discarded`, async () => {
    const e = await env();
    e.board.faults = [fault, fault, fault, fault];
    const c = controller(e, await e.signer(3));
    await sealed(c);
    const rep = await c.cast();
    assert.equal(rep?.outcome, 'PENDING_UNCONFIRMED');
    assert.equal(c.state.kind, 'failed');
    assert.equal((c.state as Extract<BallotState, { kind: 'failed' }>).retryCast, true);
    e.board.faults = [];
    const rep2 = await c.cast();
    assert.equal(rep2?.outcome, 'ACCEPTED_RECORDED');
    const posts = e.board.requests.filter((r) => r.method === 'POST');
    assert.equal(new Set(posts.map((p) => p.body)).size, 1, 'identical bytes on every attempt');
    assert.equal(e.board.entries.filter((x) => (x.record as { intent?: string }).intent === 'cast').length, 1);
  });
}

test('W2: a receipt head that forks the pinned head is refused and does not overwrite the pin', async () => {
  const e = await env();
  const size = e.board.tree.size;
  const bad = signCheckpoint(e.board.origin, size, new Uint8Array(32).fill(9), e.board.logKey.secretKey, e.board.logKey.publicKey);
  await e.storage.putHead({ electionId: e.board.apiId, size, note: bad });
  const c = controller(e, await e.signer(3));
  await sealed(c);
  const rep = await c.cast();
  assert.equal(rep?.error?.ux, 'E-BOARD-FORK');
  assert.equal((await e.storage.getHead(e.board.apiId))?.note, bad, 'pin kept');
  assert.equal(c.lastCast?.receipt, undefined);
});

test('W2: a receipt head shorter than the pinned head is E-BOARD-ROLLBACK and the pin stays', async () => {
  const e = await env();
  const size = e.board.tree.size + 10;
  const far = signCheckpoint(e.board.origin, size, new Uint8Array(32).fill(9), e.board.logKey.secretKey, e.board.logKey.publicKey);
  await e.storage.putHead({ electionId: e.board.apiId, size, note: far });
  const c = controller(e, await e.signer(3));
  await sealed(c);
  const rep = await c.cast();
  assert.equal(rep?.error?.ux, 'E-BOARD-ROLLBACK');
  assert.equal((await e.storage.getHead(e.board.apiId))?.note, far);
});

test('W2: an honest growing head extends the pin (consistency proof checked) and is stored', async () => {
  const e = await env();
  const c0 = controller(e, await e.signer(0));
  await sealed(c0);
  assert.equal((await c0.cast())?.outcome, 'ACCEPTED_RECORDED');
  const first = await e.storage.getHead(e.board.apiId);
  const c = controller(e, await e.signer(1));
  await sealed(c);
  assert.equal((await c.cast())?.outcome, 'ACCEPTED_RECORDED');
  const second = await e.storage.getHead(e.board.apiId);
  assert.ok(second && first && second.size > first.size);
});

test('W3: after a board alarm on a cast the machine does not offer a New seal (the ballot may be recorded)', async () => {
  const e = await env();
  e.board.tamper.inclusionPath = true;
  const c = controller(e, await e.signer(3));
  await sealed(c);
  const rep = await c.cast();
  assert.equal(rep?.error?.ux, 'E-BOARD-INCL-FAIL');
  const before = c.state;
  c.newSeal();
  assert.equal(c.state, before, 'NEW_SEAL refused');
  // a failed SEAL (no cast attempted) still allows a new attempt
  const s: BallotState = { kind: 'failed', selections: {}, spoiled: [], error: 'x', retryCast: false };
  assert.equal(reduce(s, { type: 'NEW_SEAL' }).kind, 'reviewing');
});

test('W5: a tally record is only honoured when signed by a manifest coordinator key under ctx', async () => {
  const e = await env();
  const sim = e.sim;
  const ctxHex = bytesToHex(sim.params!.ctx);
  const body = { proto: 'qv1-r255-sha2', type: 'tally' as const, ctx: ctxHex, n_counted: 0, counted_root: '00'.repeat(32), decrypters: [], contests: [], spoiled: [] };
  const seq = e.recs.length;
  const withTally = (record: unknown) => [...e.recs, { seq, record }];
  const unsigned = await deriveElectionContext(withTally({ body }));
  assert.ok(unsigned.ok && unsigned.value.phase !== 'tallied', 'unsigned tally ignored');
  const other = sim.voters[0]!;
  const nonCoord = await deriveElectionContext(withTally(signRecord(other.secretKey, other.publicKey, sim.params!.ctx, body)));
  assert.ok(nonCoord.ok && nonCoord.value.phase !== 'tallied', 'non-coordinator signature ignored');
  const c = sim.coord[0]!;
  const wrongScope = await deriveElectionContext(withTally(signRecord(c.secretKey, c.publicKey, sim.mh, body)));
  assert.ok(wrongScope.ok && wrongScope.value.phase !== 'tallied', 'wrong scope ignored');
  const wrongCtx = await deriveElectionContext(withTally(signRecord(c.secretKey, c.publicKey, sim.params!.ctx, { ...body, ctx: '11'.repeat(32) })));
  assert.ok(wrongCtx.ok && wrongCtx.value.phase !== 'tallied', 'ctx mismatch ignored');
  const good = await deriveElectionContext(withTally(signRecord(c.secretKey, c.publicKey, sim.params!.ctx, body)));
  assert.ok(good.ok && good.value.phase === 'tallied');
});

test('W7: a non-contiguous page is reported and the next refresh reloads the log from the start (no endless gap)', async () => {
  const e = await env();
  const records = e.recs.slice(0, 3).map((r) => ({ ...r }));
  const target: LiveTarget = { apiId: e.board.apiId, api: e.api, records, ctx: e.ctx };
  const errors: unknown[] = [];
  let skip = true;
  const real = e.api.allEntries.bind(e.api);
  target.api = {
    allEntries: async (id: string, from?: number) => {
      const p = await real(id, from);
      return skip ? { ...p, entries: p.entries.filter((x) => x.seq !== (from ?? 0)) } : p;
    },
    events: e.api.events.bind(e.api),
  } as LiveTarget['api'];
  const live = new LiveElection(target, { onError: (x) => errors.push(x) });
  await live.refresh();
  assert.equal(errors.length, 1);
  assert.equal(records.length, 3, 'nothing half-applied');
  skip = false;
  await live.refresh();
  assert.equal(errors.length, 1);
  assert.equal(records.length, e.recs.length, 'recovered to the full log');
  assert.deepEqual(records.map((r) => r.seq), e.recs.map((r) => r.seq));
});

test('W8: a very large local log does not hit the argument-count limit', async () => {
  const e = await env();
  const records = Array.from({ length: 300_000 }, (_, i) => ({ seq: i, record: undefined as unknown }));
  const errors: unknown[] = [];
  let askedFrom = -1;
  const target = {
    apiId: 'x', records, ctx: e.ctx,
    api: { allEntries: async (_id: string, from?: number) => { askedFrom = from ?? 0; return { entries: [], next_from: null }; }, events: e.api.events.bind(e.api) },
  } as unknown as LiveTarget;
  await new LiveElection(target, { onError: (x) => errors.push(x) }).refresh();
  assert.deepEqual(errors, []);
  assert.equal(askedFrom, 300_000);
});

test('W4: auto-lock drops an unsubmitted sealed ballot (randomness wiped, back to review, never castable)', async () => {
  const e = await env();
  const c = controller(e, await e.signer(3));
  await sealed(c);
  assert.equal(c.state.kind, 'sealed');
  c.lockSession();
  assert.equal(c.state.kind, 'reviewing');
  assert.equal(c.codeHex, undefined);
  assert.equal(await c.cast(), undefined);
  assert.equal(await c.audit({ post: false, publishReveal: false }), undefined);
  assert.equal(e.board.requests.filter((r) => r.method === 'POST').length, 0);
});

test('W4: auto-lock does not abandon a submission in flight (signed bytes kept so the retry is the same ballot)', async () => {
  const e = await env();
  e.board.faults = ['network', 'network', 'network', 'network'];
  const c = controller(e, await e.signer(3));
  await sealed(c);
  assert.equal((await c.cast())?.outcome, 'PENDING_UNCONFIRMED');
  c.lockSession();
  assert.equal(c.state.kind, 'failed');
  assert.equal((await c.cast())?.outcome, 'ACCEPTED_RECORDED');
});

test('W10: a sealer that throws fails the seal instead of leaving the screen in "sealing"', async () => {
  const e = await env();
  const c = new BallotController({
    ctx: e.ctx, apiElectionId: e.board.apiId, origin: e.board.origin, signer: await e.signer(3), api: e.api,
    sealer: { seal: () => Promise.reject(new Error('worker crashed')) }, storage: e.storage, rng: streamRng('a2'),
    logPk: e.board.logKey.publicKey, supersedes: NO_SUPERSEDES, clientBuild: 't',
  });
  c.select(SEL);
  c.review();
  await c.seal();
  assert.equal(c.state.kind, 'failed');
});

test('W11: an invalid or empty date is reported, not thrown', () => {
  assert.equal(isoUtc(''), undefined);
  assert.equal(isoUtc('not a date'), undefined);
  assert.equal(isoUtc('2026-11-01T10:00:00.000Z'), '2026-11-01T10:00:00Z');
});

test('W6/W9/W12/W13/W14 (DOM, not unit-tested): source wiring checks', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.ok(!/catch \{ \/\* shown below as not on roll/.test(src), 'W6: registration failure is shown');
  assert.ok(!src.includes('e.status === 409'), 'B3-10: conflicts must not silently claim registration success');
  assert.ok(!/storage\.clearAll\(\)\.then/.test(src), 'W9: clearAll goes through clearDevice (caught)');
  assert.ok(!src.includes('see Election ID after signing'), 'W12');
  assert.ok(!/h\('span', \{ 'aria-label'/.test(src), 'W13');
  assert.ok(!/more\(h\('p', \{\}, t\('qv\.audit\.public'\)\)/.test(src), 'W14: the test-ballot-is-public warning is not collapsed');
});
