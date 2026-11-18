import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { NO_SUPERSEDES } from '@quietvote/protocol';
import { ApiClient, type FetchLike } from '../src/api/client.ts';
import { BallotController } from '../src/flow/ballot-controller.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { LiveElection, type LiveChange, type LiveTarget } from '../src/flow/live.ts';
import { inlineSealer } from '../src/flow/seal.ts';
import { BallotIndex, receiptStanding } from '../src/flow/supersede.ts';
import { createSigner } from '../src/key/signer.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { FakeBoard, sharedSim } from './helpers/fake-board.ts';
import { FakeSseServer, checkpointEvent, entryEvent, until } from './helpers/fake-sse.ts';

async function setup() {
  const sim = await sharedSim();
  const board = new FakeBoard(sim);
  const sse = new FakeSseServer();
  const fetch: FetchLike = (i, init) => (i.endsWith('/events') ? sse.fetch(i, init) : board.fetch(i, init));
  const api = new ApiClient({ fetch, sleep: async () => undefined });
  const all = await api.allEntries(board.apiId);
  const records = all.entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
  const r = await deriveElectionContext(records);
  assert.ok(r.ok);
  const target: LiveTarget = { apiId: board.apiId, api, records, ctx: r.value };
  const storage = new MemoryStorage();
  const cast = async (voter: number, supersedes: string, sel: Record<string, string[]>): Promise<{ code: string; seq: number }> => {
    const signer = await createSigner(sim.voters[voter]!.secretKey.slice());
    const c = new BallotController({
      ctx: r.value, apiElectionId: board.apiId, origin: board.origin, signer, api, sealer: inlineSealer, storage,
      rng: streamRng(`live-${voter}-${supersedes.slice(0, 4)}-${board.entries.length}`), logPk: board.logKey.publicKey, supersedes, clientBuild: 't', now: () => 1_790_000_100,
    });
    c.select(sel);
    c.review();
    await c.seal();
    c.codeRendered();
    const rep = await c.cast();
    assert.equal(rep?.outcome, 'ACCEPTED_RECORDED');
    return { code: c.codeHex!, seq: rep!.seq! };
  };
  return { sim, board, sse, api, target, ctx: r.value, cast, storage };
}

const SEL = { budget: ['yes'], board: ['p'] };

test('live: an entry event makes the page read exactly the new log entries and re-derive the context', async () => {
  const { board, sse, target, cast } = await setup();
  const changes: LiveChange[] = [];
  const live = new LiveElection(target, { debounceMs: 1, onChange: (c) => changes.push(c) });
  live.start();
  const conn = await sse.connection(1);
  const before = target.records.length;
  const a = await cast(0, NO_SUPERSEDES, SEL);
  conn.frame(1, 'entry', entryEvent(a.seq));
  conn.frame(2, 'checkpoint', checkpointEvent(board.tree.size));
  await live.settled();
  await until(() => changes.length === 1);
  assert.equal(target.records.length, before + 1);
  assert.equal(changes[0]!.added, 1);
  assert.equal(changes[0]!.phaseChanged, false);
  assert.equal(target.records.at(-1)!.seq, a.seq);
  live.close();
});

test('live: bursts are coalesced into one re-read; hints for entries already held and witness events cost nothing', async () => {
  const { board, sse, target, cast } = await setup();
  const live = new LiveElection(target, { debounceMs: 20 });
  live.start();
  const conn = await sse.connection(1);
  const a = await cast(0, NO_SUPERSEDES, SEL);
  const b = await cast(1, NO_SUPERSEDES, SEL);
  const reads = (): number => board.requests.filter((r) => r.method === 'GET' && r.url.includes('/log/entries?')).length;
  const base = reads();
  conn.frame(1, 'entry', entryEvent(a.seq));
  conn.frame(2, 'entry', entryEvent(b.seq));
  conn.frame(3, 'checkpoint', checkpointEvent(board.tree.size));
  conn.frame(4, 'witness', { witness: 'w', lag_seconds: 1, quorum_met: false });
  await live.settled();
  await until(() => target.records.length === board.entries.length);
  assert.equal(reads() - base, 1, 'one fetch for three hints');
  const again = reads();
  conn.frame(5, 'entry', entryEvent(a.seq)); // already held: no read
  conn.frame(6, 'witness', { witness: 'w', lag_seconds: 2, quorum_met: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reads(), again);
  live.close();
});

test('live: close of the election arrives as a phase change and the context follows the signed marker, not the event', async () => {
  const { board, sse, target } = await setup();
  const changes: LiveChange[] = [];
  const live = new LiveElection(target, { debounceMs: 1, onChange: (c) => changes.push(c) });
  live.start();
  const conn = await sse.connection(1);
  assert.equal(target.ctx!.phase, 'open');
  // a forged phase event alone changes nothing
  conn.frame(1, 'phase', { from: 'OPEN', to: 'CLOSED', seq: 99 });
  await live.settled();
  assert.equal(target.ctx!.phase, 'open');
  board.close();
  conn.frame(2, 'phase', { from: 'OPEN', to: 'CLOSED', seq: board.entries.length - 1 });
  await until(() => changes.some((c) => c.phaseChanged));
  assert.equal(target.ctx!.phase, 'closed');
  live.close();
});

test('live: alerts are surfaced, refresh errors are reported and do not stop the stream, close stops everything', async () => {
  const { sse, target } = await setup();
  const alerts: string[] = [];
  const errors: unknown[] = [];
  const live = new LiveElection(target, { debounceMs: 1, onAlert: (a) => alerts.push(a.detailCode), onError: (e) => errors.push(e) });
  live.start();
  const conn = await sse.connection(1);
  conn.frame(1, 'alert', { kind: 'quarantine', detail_code: 'LOG_QUARANTINED' });
  await until(() => alerts.length === 1);
  const real = target.api.allEntries.bind(target.api);
  target.api.allEntries = async () => { throw new Error('boom'); };
  conn.frame(2, 'checkpoint', checkpointEvent(1));
  await until(() => errors.length === 1);
  target.api.allEntries = real;
  live.close();
  assert.equal(conn.aborted, true);
  assert.equal(sse.conns.length, 1);
});

test('receipt standing: a revote marks the earlier receipt superseded; the newest stays current; others are untouched', async () => {
  const { board, ctx, cast, api } = await setup();
  const first = await cast(0, NO_SUPERSEDES, SEL);
  const other = await cast(1, NO_SUPERSEDES, SEL);
  const reload = async (): Promise<{ seq: number; record: unknown }[]> => (await api.allEntries(board.apiId)).entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
  const w = { openSeq: ctx.openSeq, closeSeq: ctx.closeSeq, maxPerVoter: ctx.manifest.ballots.max_per_voter };
  let recs = await reload();
  const idx = new BallotIndex(ctx.params.ctx);
  idx.update(recs);
  assert.deepEqual(idx.standing(first.seq, first.code, w), { state: 'current' });
  assert.deepEqual(idx.standing(other.seq, other.code, w), { state: 'current' });
  assert.equal(idx.standing(first.seq + 50, first.code, w).state, 'unknown', 'not in the loaded record yet');
  // the voter revotes (possibly on another device): the old receipt is now superseded
  const second = await cast(0, first.code, { budget: ['no'], board: ['q'] });
  recs = await reload();
  idx.update(recs); // incremental: only the new entry is verified
  assert.equal(idx.indexedUpTo, recs.at(-1)!.seq);
  assert.deepEqual(idx.standing(first.seq, first.code, w), { state: 'superseded', bySeq: second.seq, byCode: second.code });
  assert.deepEqual(idx.standing(second.seq, second.code, w), { state: 'current' });
  assert.deepEqual(idx.standing(other.seq, other.code, w), { state: 'current' });
  // one-shot helper agrees
  assert.equal(receiptStanding(recs, ctx.params.ctx, first.seq, first.code, w).state, 'superseded');
  // a receipt that names the wrong code for that entry is never "current"
  assert.equal(idx.standing(first.seq, second.code, w).state, 'mismatch');
  assert.equal(idx.standing(first.seq, '00'.repeat(32), w).state, 'mismatch');
});

test('receipt standing: window, revote limit and forged envelopes are handled like the verifier', async () => {
  const { board, ctx, cast, api } = await setup();
  const a = await cast(2, NO_SUPERSEDES, SEL);
  const b = await cast(2, a.code, SEL);
  const recs = (await api.allEntries(board.apiId)).entries.map((e) => ({ seq: e.seq, record: entryRecord(e) }));
  const base = { openSeq: ctx.openSeq, closeSeq: ctx.closeSeq, maxPerVoter: ctx.manifest.ballots.max_per_voter };
  assert.equal(receiptStanding(recs, ctx.params.ctx, a.seq, a.code, base).state, 'superseded');
  // a later ballot outside the voting window (after the close marker) replaces nothing
  assert.equal(receiptStanding(recs, ctx.params.ctx, a.seq, a.code, { ...base, closeSeq: b.seq }).state, 'current');
  // beyond max_per_voter the newer ballot is not admissible
  assert.equal(receiptStanding(recs, ctx.params.ctx, a.seq, a.code, { ...base, maxPerVoter: 1 }).state, 'current');
  // a forged "later ballot" whose signature does not verify never supersedes anything
  const forged = recs.map((r) => {
    if (r.seq !== b.seq) return r;
    const rec = JSON.parse(JSON.stringify(r.record)) as { sig: string };
    rec.sig = (rec.sig[0] === 'a' ? 'b' : 'a') + rec.sig.slice(1);
    return { seq: r.seq, record: rec };
  });
  assert.equal(receiptStanding(forged, ctx.params.ctx, a.seq, a.code, base).state, 'current');
  assert.ok(bytesToHex(ctx.params.ctx).length === 64);
});

test('wiring: the UI starts the stream per election, stops it when leaving, shows receipt standing with catalog strings only', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.ok(app.includes('new LiveElection(L,') && app.includes('startLive(L)'));
  assert.ok(/if \(r\.name !== 'election'\) stopLive\(\)/.test(app), 'stream closed when the voter leaves the election pages');
  assert.ok(app.includes("t('qv.live.failed')") || app.includes("t('qv.live.") , 'status text comes from the catalog');
  for (const k of ['current', 'superseded', 'supersededNote', 'unknown', 'mismatch']) assert.ok(app.includes(`qv.receipt.standing.${k}`), k);
  assert.ok(app.includes('new BallotIndex('), 'standing uses the incremental index');
  assert.ok(app.includes('repaint = () =>'), 'receipt standing refreshes in place on live updates');
  // live data never carries a secret: the only request detail is the election id
  const client = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8');
  assert.ok(/`\$\{API\}\/elections\/\$\{enc\(id\)\}\/events`/.test(client));
  assert.ok(!/last_event_id|lastEventId[^\n]*query/.test(client));
  const { EN } = await import('../src/i18n/en.ts');
  const { LOCALES } = await import('../src/i18n/locales.ts');
  for (const k of Object.keys(EN).filter((x) => x.startsWith('qv.receipt.standing.') || x.startsWith('qv.live.'))) {
    assert.equal(EN[k as keyof typeof EN].sensitivity, 'normal', `${k} is not guarantee copy`);
    for (const l of LOCALES.filter((x) => x.tier !== 'source')) assert.ok(l.messages[k as keyof typeof EN], `${l.tag} has ${k}`);
    for (const l of LOCALES.filter((x) => x.tier !== 'source')) assert.equal(l.review[k as keyof typeof EN], undefined, `${l.tag}/${k} is not marked reviewed`);
  }
});
