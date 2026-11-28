// Real same-election records and closed SQLite snapshots for lifecycle admission tests.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cosignLine, parseCheckpoint, type EntryType } from '@quietvote/board';
import { streamRng, type Ed25519Keypair } from '@quietvote/crypto';
import { signRecord } from '@quietvote/protocol';
import type { ElectionStateName } from '../../src/controldb.ts';
import { World } from './world.ts';

export const STALL_SECONDS = 120;
export interface Sample { type: EntryType; who: Ed25519Keypair; record: unknown }
interface Snapshot { dir: string; clock: number; controlSeq: number }
export async function phase(w: World): Promise<ElectionStateName> {
  const r = await w.get(`/api/v1/elections/${w.electionId}/state`); assert.equal(r.status, 200, r.text); return r.json.phase;
}
export async function boardState(w: World) {
  const rt = (await w.server.pool.get(w.electionId))!;
  const cp = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`);
  assert.ok(cp.status === 200 || (cp.status === 503 && cp.json.code === 'LOG_UNAVAILABLE'));
  return { phase: await phase(w), base: rt.st.state, size: rt.log.size, checkpoint: cp.status === 200 ? cp.text : null,
    bytes: rt.edb.totalBodyBytes(), controlSeq: rt.st.controlSeq, halts: rt.st.halts };
}
async function witness(w: World): Promise<void> {
  const cp = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`); assert.equal(cp.status, 200);
  const parsed = parseCheckpoint(cp.text); assert.ok(parsed.ok); const key = w.witnesses[0]!;
  const r = await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, {
    checkpoint_size: parsed.value.size, lines: [cosignLine('w1', key.secretKey, key.publicKey, parsed.value.text, w.nowSec)],
  });
  assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.accepted, ['w1']);
}

export async function lifecycleWorld() {
  const seed = 'lifecycle-http-model', snapshots = new Map<ElectionStateName, Snapshot>(), samples = new Map<EntryType, Sample>();
  const saved = mkdtempSync(join(tmpdir(), 'qv-lifecycle-prefixes-'));
  const w = new World({ seed, n: 3, t: 2, voters: 4, witnessQuorum: 1, freshConnections: true, server: { stalledMaxSec: STALL_SECONDS } });
  async function capture(state: ElectionStateName): Promise<void> {
    assert.equal(await phase(w), state); assert.equal(snapshots.has(state), false);
    // Snapshot only after a clean stop; no copying live WAL files or setting runtime states.
    await w.server.stop(); const dir = join(saved, state); cpSync(w.dir, dir, { recursive: true });
    snapshots.set(state, { dir, clock: w.clock, controlSeq: w.controlSeq });
    await w.start(); assert.equal(await phase(w), state, `replayed ${state} snapshot`);
  }
  const post = w.post.bind(w);
  w.post = async (...args: Parameters<World['post']>) => {
    const result = await post(...args), [type, who, record] = args;
    if (result.status === 201) {
      if (!samples.has(type)) samples.set(type, { type, who, record: structuredClone(record) });
      const state = ({ manifest: 'SETUP', ceremony_start: 'CEREMONY', joint_key: 'SETUP_KEYED', roll_commit: 'READY',
        election_open: 'OPEN', election_close: 'CLOSED', tally_result: 'AUDIT' } as Partial<Record<EntryType, ElectionStateName>>)[type];
      if (state !== undefined) await capture(state);
      if (type === 'notice' && (record as { body?: { action?: string } }).body?.action === 'pause') await capture('PAUSED');
    }
    return result;
  };
  try {
    await w.start(); await w.setupOrgAndElection(); await w.registerVoters(); await capture('DRAFT');
    assert.equal((await w.publishManifest()).status, 201); await w.ceremony(); await witness(w);
    assert.equal((await w.open()).status, 201);
    for (let i = 0; i < 4; i++) assert.equal((await w.cast(i, { budget: [i % 2 ? 'yes' : 'no'], chair: ['ann'] })).status, 201);
    assert.equal((await w.spoil(0, { budget: ['no'], chair: ['bob'] }, 'publish')).status, 201);
    assert.equal((await w.post('notice', w.coord[0]!, w.control('pause', 'AVAILABILITY'))).status, 201);
    assert.equal((await w.post('notice', w.coord[0]!, w.control('resume'))).status, 201);
    assert.equal((await w.close()).status, 201);
    const tallyingSince = w.nowSec;
    await witness(w); assert.equal(await phase(w), 'TALLYING'); await capture('TALLYING');
    // The aggregate was admitted at the injected second above. STALLED is derived,
    // with no new log record; equality must remain TALLYING and the next second changes it.
    w.clock = (tallyingSince + STALL_SECONDS) * 1000;
    assert.equal(await phase(w), 'TALLYING', 'exact stalledMaxSec equality is not STALLED');
    const atBoundary = await boardState(w);
    w.clock += 1000; assert.equal(await phase(w), 'STALLED');
    const afterBoundary = await boardState(w);
    assert.deepEqual({ ...afterBoundary, phase: 'TALLYING' }, atBoundary, 'the derived view changes without any append or persisted state change');
    await capture('STALLED');
    for (const j of [1, 3]) {
      const r = await w.trusteeShares(j); assert.equal(r.status, 201, r.text); w.tick(); assert.equal(await phase(w), 'STALLED');
    }
    const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`); assert.equal(draft.status, 200, draft.text);
    const c0 = w.coord[0]!, tally = signRecord(c0.secretKey, c0.publicKey, w.params.ctx, draft.json.body);
    assert.equal((await w.post('tally_result', c0, tally)).status, 201, 'a verified tally recovers STALLED to AUDIT');
    const record = w.control('audit-close'), packet = w.entry('audit_close', c0, record);
    const receipt = await w.submit(packet.headerBytes, packet.body); assert.equal(receipt.status, 201, receipt.text);
    samples.set('audit_close', { type: 'audit_close', who: c0, record }); assert.equal(await phase(w), 'ARCHIVED');

    return {
      w, samples, snapshots, archivedRetry: { packet, receipt: receipt.json.receipt },
      async restore(state: ElectionStateName): Promise<World> {
        const snapshot = snapshots.get(state); assert.ok(snapshot, state);
        const fork = new World(w.o); rmSync(fork.dir, { recursive: true, force: true }); cpSync(snapshot.dir, fork.dir, { recursive: true });
        fork.clock = snapshot.clock; fork.controlSeq = snapshot.controlSeq; fork.rng = streamRng(`${seed}/probe/${state}`);
        Object.assign(fork, { electionId: w.electionId, orgId: w.orgId, origin: w.origin, logPkHex: w.logPkHex, manifest: w.manifest, mh: w.mh, params: w.params, rollHex: w.rollHex });
        try { await fork.start(); assert.equal(await phase(fork), state); return fork; }
        catch (error) { await fork.stop(); throw error; }
      },
      async close(): Promise<void> { await w.stop(); rmSync(saved, { recursive: true, force: true }); },
    };
  } catch (error) { if (w.server) await w.stop(); else rmSync(w.dir, { recursive: true, force: true }); rmSync(saved, { recursive: true, force: true }); throw error; }
}
