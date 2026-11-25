import test from 'node:test';
import assert from 'node:assert/strict';
import { ElectionRuntime } from '../src/election.ts';
import { World } from './helpers/world.ts';

test('failed load recovery closes its handle and releases the occupied slot', async (t) => {
  const w = new World({ seed: 'pool-failed-recovery-capacity', n: 3, t: 2, voters: 1, server: { maxOpenElections: 1 } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.server.pool.closeAll();
    let failed: ElectionRuntime | undefined;
    const original = ElectionRuntime.open;
    const mocked = t.mock.method(ElectionRuntime, 'open', async (...args: Parameters<typeof ElectionRuntime.open>) => {
      const rt = await original(...args);
      failed = rt;
      rt.recoverEvents = () => { throw new Error('injected load recovery failure'); };
      return rt;
    });
    await assert.rejects(w.server.pool.get(w.electionId), /injected load recovery failure/);
    assert.ok(failed);
    assert.equal(failed.poisoned, true);
    assert.equal(failed.edb.db.isOpen, false);
    assert.equal(w.server.pool.openCount(), 0);
    mocked.mock.restore();
    const retry = await w.server.pool.get(w.electionId);
    assert.ok(retry);
    assert.notEqual(retry, failed);
    assert.equal(retry.edb.row().election_id, w.electionId);
    assert.equal(w.server.pool.openCount(), 1);
  } finally { await w.stop(); }
});
