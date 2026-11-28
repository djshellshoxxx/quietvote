import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DATA_LOCK_NAME } from '../src/data-lock.ts';
import { ControlDb } from '../src/controldb.ts';
import { World } from './helpers/world.ts';

function crash(helper: string, args: string[], code: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--max-old-space-size=256', fileURLToPath(new URL(helper, import.meta.url)), ...args],
      { timeout: 120_000 }, (error, stdout, stderr) => error?.code === code ? resolve(stdout) : reject(new Error(`unexpected child exit: ${String(error)} ${stderr}`)));
  });
}

for (const mode of ['append', 'archive', 'registry'] as const) test(`second crash during ${mode} recovery preserves lifecycle projections and retention timestamp`, async () => {
  const info = JSON.parse((await crash('./helpers/supplemental-crash.ts', [mode === 'registry' ? 'archive' : mode], 73)).trim()) as { dir: string; electionId: string; clock: number };
  const w = new World({ seed: 'supplemental-crash', n: 3, t: 2, voters: 2, witnessQuorum: 1 });
  rmSync(w.dir, { recursive: true });
  w.dir = info.dir; w.electionId = info.electionId; w.clock = info.clock;
  try {
    // Each stale lock is removed only after its sole owning child has exited.
    rmdirSync(join(w.dir, DATA_LOCK_NAME));
    await crash('./helpers/replay-completion-crash.ts', [JSON.stringify(info), mode], mode === 'registry' ? 76 : 75);
    rmdirSync(join(w.dir, DATA_LOCK_NAME));
    await w.start();
    const expected = mode === 'append' ? 'SETUP' : 'ARCHIVED';
    const raw = new DatabaseSync(join(w.dir, 'elections', w.electionId.slice(0, 2), `${w.electionId}.sqlite`));
    try {
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM append_completion').get()!.n, 0);
      assert.equal(raw.prepare('SELECT state FROM election').get()!.state, expected, 'election projection survives second crash');
    } finally { raw.close(); }
    assert.equal(w.server.env.control.election(w.electionId)!.state, expected, 'registry projection survives second crash');
    if (mode !== 'append') assert.ok(w.server.env.control.election(w.electionId)!.archived_at, 'archive retention timestamp survives recovery');
  } finally {
    if (w.server) await w.server.stop();
    rmSync(w.dir, { recursive: true, force: true });
  }
});

for (const legacy of [false, true]) test(`${legacy ? 'legacy' : 'atomic'} failed registry sync retains all replay intents and their sequence-specific phase data`, async () => {
  const w = new World({ seed: `replay-registry-failure-${legacy}`, n: 3, t: 2, voters: 2 });
  const sync = ControlDb.prototype.setState;
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    rt.edb.finishAppendCompletion = () => { throw new Error('retain both phase intents'); };
    assert.equal((await w.publishManifest()).status, 201);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const timestamps = rt.edb.eventsAfter(0, 20).filter((row) => row.type === 'entry').map((row) => row.ts);
    const originalPhases = rt.edb.eventsAfter(0, 20).filter((row) => row.type === 'phase');
    if (legacy) {
      // Explicitly model pre-v12 intents, which had no committed supplemental rows.
      rt.edb.db.exec("DELETE FROM event WHERE type='phase'; UPDATE append_completion SET events_committed=0");
    }
    // Simulate the durable append crash boundary without rewinding any public log entry.
    rt.edb.db.exec("UPDATE election SET state='DRAFT'");
    w.server.env.control.db.exec("UPDATE election_registry SET state='DRAFT'");
    await w.server.stop();
    ControlDb.prototype.setState = function (...args) {
      sync.apply(this, args);
      throw new Error('lost completion after registry sync commit');
    };
    await w.start();
    const raw = new DatabaseSync(join(w.dir, 'elections', w.electionId.slice(0, 2), `${w.electionId}.sqlite`));
    try {
      assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM append_completion').get()!.n, 2);
      assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM event WHERE type='phase'").get()!.n, legacy ? 0 : 2);
    } finally { raw.close(); }
    await w.server.stop();
    ControlDb.prototype.setState = sync;
    await w.start();
    const recovered = (await w.server.pool.get(w.electionId))!;
    assert.equal(recovered.logState, 'CEREMONY');
    assert.equal(recovered.edb.hasAppendCompletions(), false);
    const phases = recovered.edb.eventsAfter(0, 20).filter((row) => row.type === 'phase');
    assert.deepEqual(phases.map((row) => JSON.parse(row.data)), [
      { from: 'DRAFT', to: 'SETUP', seq: 0 }, { from: 'SETUP', to: 'CEREMONY', seq: 1 },
    ]);
    assert.deepEqual(phases.map((row) => row.ts), timestamps);
    if (!legacy) assert.deepEqual(phases, originalPhases, 'new intents cannot allocate replacement event IDs during recovery');
    await w.server.stop(); await w.start();
    assert.deepEqual((await w.server.pool.get(w.electionId))!.edb.eventsAfter(0, 20).filter((row) => row.type === 'phase'), phases);
  } finally {
    ControlDb.prototype.setState = sync;
    await w.stop();
  }
});
