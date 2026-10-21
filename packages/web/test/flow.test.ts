import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { bytesToHex, streamRng, systemRng } from '@quietvote/crypto';
import { NO_SUPERSEDES, verifyElection } from '@quietvote/protocol';
import { parseCheckpoint } from '@quietvote/board';
import { ApiClient } from '../src/api/client.ts';
import { deriveElectionContext, type ElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { BallotController } from '../src/flow/ballot-controller.ts';
import { canAudit, canCast } from '../src/flow/ballot-machine.ts';
import { BoardIntegrityError, checkInclusion } from '../src/flow/receipt.ts';
import { checkAuditPackage, parseAuditPackage } from '../src/flow/audit.ts';
import { inlineSealer } from '../src/flow/seal.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { ApiError } from '../src/api/errors.ts';
import { b64uDecode } from '../src/util/hex.ts';
import { FakeBoard, sharedSim } from './helpers/fake-board.ts';

interface Env {
  board: FakeBoard;
  api: ApiClient;
  ctx: ElectionContext;
  signer: (i: number) => Promise<Signer>;
  storage: MemoryStorage;
}

async function env(): Promise<Env> {
  const sim = await sharedSim();
  const board = new FakeBoard(sim);
  const api = new ApiClient({ fetch: board.fetch, sleep: async () => undefined });
  const all = await api.allEntries(board.apiId);
  const recs = all.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
  const r = await deriveElectionContext(recs);
  assert.ok(r.ok, r.ok ? '' : r.detail);
  return {
    board, api, ctx: r.value, storage: new MemoryStorage(),
    signer: (i) => createSigner(sim.voters[i]!.secretKey.slice()),
  };
}

function controller(e: Env, signer: Signer, supersedes = NO_SUPERSEDES): BallotController {
  return new BallotController({
    ctx: e.ctx, apiElectionId: e.board.apiId, origin: e.board.origin, signer, api: e.api, sealer: inlineSealer, storage: e.storage,
    rng: streamRng('ctl'), logPk: e.board.logKey.publicKey, supersedes, clientBuild: 'test-build', now: () => 1_790_000_100,
  });
}

const SEL = { budget: ['yes'], board: ['p', 'q'] };

before(async () => {
  await sharedSim();
});

test('election context is derived from the log, not from the server (K and ctx recomputed)', async () => {
  const e = await env();
  const sim = await sharedSim();
  assert.equal(e.ctx.phase, 'open');
  assert.equal(bytesToHex(e.ctx.params.ctx), bytesToHex(sim.params!.ctx));
  assert.equal(e.ctx.manifestHashHex, bytesToHex(sim.mh));
  assert.equal(e.ctx.rollSize, 4);
  // wrong expected hash is refused
  const all = await e.api.allEntries(e.board.apiId);
  const recs = all.entries.map((x) => ({ seq: x.seq, record: entryRecord(x) }));
  const bad = await deriveElectionContext(recs, '00'.repeat(32));
  assert.equal(bad.ok, false);
  // a log truncated before the ceremony finished yields no params
  const short = await deriveElectionContext(recs.slice(0, 5));
  assert.equal(short.ok, false);
});

test('Benaloh gating: CAST/AUDIT are unavailable until the code is rendered; nothing is sent before CAST (REQ-011)', async () => {
  const e = await env();
  const c = controller(e, await e.signer(0));
  c.select(SEL);
  c.review();
  await c.seal();
  assert.equal(c.state.kind, 'sealed');
  assert.equal(canCast(c.state), false);
  assert.equal(canAudit(c.state), false);
  const before = c.state;
  assert.equal(await c.cast(), undefined);
  assert.equal(c.state, before, 'cast ignored before the code is rendered');
  assert.equal(await c.audit({ post: false, publishReveal: false }), undefined);
  assert.equal(e.board.requests.filter((r) => r.method === 'POST').length, 0, 'no ciphertext left the device');
  c.codeRendered();
  assert.equal(canCast(c.state), true);
  assert.equal(canAudit(c.state), true);
  assert.match(c.codeDisplay!, /^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/);
});

test('cast: signed entry accepted, inclusion proof + STH verified, receipt stored, randomness dropped, no bearer sent (REQ-014/015, 09-REQ-005)', async () => {
  const e = await env();
  const c = controller(e, await e.signer(0));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'ACCEPTED_RECORDED');
  assert.equal(c.state.kind, 'cast');
  assert.equal(rep?.codeHex, c.codeHex);
  const posts = e.board.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 1);
  assert.ok(!('authorization' in posts[0]!.headers));
  assert.ok(!posts[0]!.body!.includes('"selections"'), 'selections never leave the device with a cast');
  const stored = await e.storage.getReceipts(e.board.apiId);
  assert.equal(stored.length, 1);
  assert.ok(!stored[0]!.json.includes(c.state.kind === 'cast' ? '"xi"' : 'x'), 'receipt has no randomness');
  assert.ok(!stored[0]!.json.includes('"budget"'), 'receipt has no selections');
  assert.ok(await e.storage.getHead(e.board.apiId));
  // the board's log verifies end to end with the protocol verifier (after close, so the window is defined)
  e.board.close();
  const rep2 = await verifyElection(e.board.bundle());
  assert.equal(rep2.counts.cast, 1);
  assert.equal(rep2.checks['chk.ballots.valid'], 'pass');
  assert.equal(rep2.findings.filter((f) => f.cls === 'F').length, 0);
  // the in-memory randomness was released
  assert.equal((c as unknown as { xi?: Uint8Array }).xi, undefined);
});

test('test (audit) path: spoil is posted without its reveal, package re-checks independently, new seal has a new code, cast works (REQ-012)', async () => {
  const e = await env();
  const c = controller(e, await e.signer(1));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const firstCode = c.codeHex!;
  const res = await c.audit({ post: true, publishReveal: false });
  assert.ok(res?.ok, JSON.stringify(res));
  assert.equal(c.state.kind, 'audited');
  assert.equal(c.lastAudit?.posted, true);
  // posted as ballot_audit, reveal absent (QV-ADR-020 default)
  const posted = e.board.entries.at(-1)!.record as { intent: string; reveal?: unknown; reveal_digest: string };
  assert.equal(posted.intent, 'spoil');
  assert.equal(posted.reveal, undefined);
  assert.notEqual(posted.reveal_digest, '00'.repeat(32));
  // second-device check from the pasted package/link, using only the election parameters
  const pkg = parseAuditPackage(c.lastAudit!.link);
  assert.ok(pkg);
  const again = checkAuditPackage(e.ctx.params, pkg!);
  assert.ok(again.ok);
  assert.deepEqual(JSON.parse(JSON.stringify(again.selections)), SEL);
  const tampered = structuredClone(pkg!);
  tampered.reveal.selections = { budget: ['no'], board: ['p', 'q'] };
  assert.equal(checkAuditPackage(e.ctx.params, tampered).ok, false);
  const tampered2 = structuredClone(pkg!);
  tampered2.body.contests[0]!.sel[0]!.c0 = tampered2.body.contests[0]!.sel[0]!.c1;
  assert.equal(checkAuditPackage(e.ctx.params, tampered2).ok, false);
  // cannot cast the tested ballot
  assert.equal(await c.cast(), undefined);
  // re-seal: different randomness, different code, then cast
  c.newSeal();
  assert.equal(c.state.kind, 'reviewing');
  await c.seal();
  c.codeRendered();
  assert.notEqual(c.codeHex, firstCode);
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'ACCEPTED_RECORDED');
  e.board.close();
  const verdict = await verifyElection(e.board.bundle());
  assert.equal(verdict.counts.spoiled, 1);
  assert.equal(verdict.counts.cast, 1);
  assert.equal(verdict.checks['chk.benaloh.spoiled'], 'pass');
});

test('opt-in publishing of the reveal is explicit', async () => {
  const e = await env();
  const c = controller(e, await e.signer(2));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  await c.audit({ post: true, publishReveal: true });
  const posted = e.board.entries.at(-1)!.record as { reveal?: { selections: unknown } };
  assert.deepEqual(JSON.parse(JSON.stringify(posted.reveal?.selections)), SEL);
});

test('revote chains by supersedes and the verifier counts only the newest', async () => {
  const e = await env();
  const s = await e.signer(0);
  const c1 = controller(e, s);
  c1.select({ budget: ['yes'], board: ['p'] });
  c1.review();
  await c1.seal();
  c1.codeRendered();
  await c1.cast();
  const code1 = c1.codeHex!;
  const s2 = await e.signer(0);
  const c2 = controller(e, s2, code1);
  c2.select({ budget: ['no'], board: ['q'] });
  c2.review();
  await c2.seal();
  c2.codeRendered();
  const r2 = await c2.cast();
  assert.equal(r2?.outcome, 'ACCEPTED_RECORDED');
  e.board.close();
  const v = await verifyElection(e.board.bundle());
  assert.equal(v.counts.cast, 2);
  assert.equal(v.counts.counted, 1);
  assert.equal(v.countedBallots?.[0]?.code, c2.codeHex);
});

test('transient network failure: retry resends the SAME bytes; the log gets one entry (idempotent)', async () => {
  const e = await env();
  e.board.faults = ['network', '503'];
  const c = controller(e, await e.signer(3));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const before = e.board.entries.length;
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'ACCEPTED_RECORDED');
  const posts = e.board.requests.filter((r) => r.method === 'POST');
  assert.equal(posts.length, 3);
  assert.equal(new Set(posts.map((p) => p.body)).size, 1, 'identical bytes on every attempt');
  assert.equal(e.board.entries.length, before + 1);
});

test('lost response after the server recorded the ballot: retry returns the original receipt (no double entry)', async () => {
  const e = await env();
  e.board.faults = ['drop-response'];
  const c = controller(e, await e.signer(3));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const before = e.board.entries.length;
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'ACCEPTED_RECORDED');
  assert.equal(e.board.entries.length, before + 1);
});

test('persistent network failure leaves an unknown delivery that can be retried safely (E-NET-TIMEOUT)', async () => {
  const e = await env();
  e.board.faults = ['network', 'network', 'network', 'network'];
  const c = controller(e, await e.signer(3));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'PENDING_UNCONFIRMED');
  assert.equal(rep?.error?.ux, 'E-NET-TIMEOUT');
  assert.equal(c.state.kind, 'failed');
  const rep2 = await c.cast(); // retry: same sealed ballot, same bytes
  assert.equal(rep2?.outcome, 'ACCEPTED_RECORDED');
  assert.equal(rep2?.codeHex, rep?.codeHex);
});

test('after close the ballot is not counted: AFTER_CLOSE (E-VOT-CLOSED)', async () => {
  const e = await env();
  const c = controller(e, await e.signer(3));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  e.board.close();
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'AFTER_CLOSE');
  assert.equal(rep?.error?.ux, 'E-VOT-CLOSED');
  assert.equal(c.state.kind, 'cast');
});

test('tampered inclusion proof is E-BOARD-INCL-FAIL', async () => {
  const e = await env();
  e.board.tamper.inclusionPath = true;
  const c = controller(e, await e.signer(0));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const rep = await c.cast();
  assert.equal(rep?.error?.ux, 'E-BOARD-INCL-FAIL');
  assert.notEqual(rep?.outcome, 'ACCEPTED_RECORDED');
});

test('sequenced-only answer is PENDING_UNCONFIRMED, then inclusion is verified later against the log key', async () => {
  const e = await env();
  e.board.lazyCheckpoints = true;
  const c = controller(e, await e.signer(0));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'PENDING_UNCONFIRMED');
  const entry = e.board.entries.at(-1)!;
  const inc = await checkInclusion({ api: e.api, apiElectionId: e.board.apiId, logPk: e.board.logKey.publicKey, leafHash: entry.leaf, seq: entry.seq, pinned: undefined });
  assert.equal(inc.state, 'included');
});

test('checkInclusion distinguishes rollback, fork and bad proofs (REQ-015)', async () => {
  const e = await env();
  const c = controller(e, await e.signer(0));
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const rep = await c.cast();
  assert.equal(rep?.outcome, 'ACCEPTED_RECORDED');
  const entry = e.board.entries.at(-1)!;
  const pinned = await e.storage.getHead(e.board.apiId);
  assert.ok(pinned);
  const args = { api: e.api, apiElectionId: e.board.apiId, logPk: e.board.logKey.publicKey, leafHash: entry.leaf, seq: entry.seq, pinned };
  const ok = await checkInclusion(args);
  assert.equal(ok.state, 'included');
  // more entries appended later: consistent growth passes
  e.board.close();
  assert.equal((await checkInclusion(args)).state, 'included');
  // rolled back to an earlier size than the pin
  e.board.tamper.rollbackTo = parseCheckpoint(pinned!.note).ok ? (parseCheckpoint(pinned!.note) as { ok: true; value: { size: number } }).value.size - 1 : 1;
  await assert.rejects(() => checkInclusion(args), (x: unknown) => x instanceof BoardIntegrityError && x.code === 'E-BOARD-ROLLBACK');
  e.board.tamper = {};
  // forked: same size, different root
  const fresh = new FakeBoard(await sharedSim());
  fresh.tamper.forkRoot = true;
  fresh.checkpoint();
  const api2 = new ApiClient({ fetch: fresh.fetch });
  const pinFromOther = { electionId: 'x', size: fresh.tree.size, note: new FakeBoard(await sharedSim()).checkpoint() };
  await assert.rejects(
    () => checkInclusion({ api: api2, apiElectionId: fresh.apiId, logPk: fresh.logKey.publicKey, leafHash: fresh.entries[1]!.leaf, seq: 1, pinned: pinFromOther }),
    (x: unknown) => x instanceof BoardIntegrityError && x.code === 'E-BOARD-FORK',
  );
  // bad inclusion proof
  e.board.tamper.inclusionPath = true;
  await assert.rejects(() => checkInclusion({ ...args, pinned: undefined }), (x: unknown) => x instanceof BoardIntegrityError && x.code === 'E-BOARD-INCL-FAIL');
});

test('rejected proofs map to a non-retried 4xx; wrong voter key is E-VOT-NOTONROLL', async () => {
  const e = await env();
  const sim = await sharedSim();
  void sim;
  const outsider = await createSigner(streamRng('outsider').bytes(32));
  const c = controller(e, outsider);
  c.select(SEL);
  c.review();
  await c.seal();
  c.codeRendered();
  const rep = await c.cast();
  assert.equal(rep?.error?.ux, 'E-VOT-NOTONROLL');
  assert.equal(e.board.requests.filter((r) => r.method === 'POST').length, 1, '4xx rejects are not retried');
});

test('api client: problem+json, Retry-After and timeout classification', async () => {
  const board = new FakeBoard(await sharedSim());
  board.faults = ['429'];
  const waits: number[] = [];
  const api = new ApiClient({ fetch: board.fetch, sleep: async (ms) => void waits.push(ms) });
  await assert.rejects(() => api.postEntry(board.apiId, 'AA', 'AA'), (x: unknown) => x instanceof ApiError && x.status === 429 && x.code === 'RATE_LIMITED' && x.retryAfter === 1);
  await assert.rejects(() => api.entry(board.apiId, 9999), (x: unknown) => x instanceof ApiError && x.code === 'NOT_FOUND');
  board.faults = ['timeout'];
  const quick = new ApiClient({ fetch: board.fetch, timeoutMs: 20 });
  await assert.rejects(() => quick.postEntry(board.apiId, 'AA', 'AA'), (x: unknown) => x instanceof ApiError && x.code === 'TIMEOUT');
  board.faults = ['429', '429', 'wrong-phase'];
  await assert.rejects(() => api.postEntryWithRetry(board.apiId, 'AA', 'AA'), (x: unknown) => x instanceof ApiError && x.code === 'WRONG_PHASE');
  assert.deepEqual(waits, [1000, 1000]);
  const decoded = b64uDecode('AA');
  assert.ok(decoded);
  void systemRng;
});
