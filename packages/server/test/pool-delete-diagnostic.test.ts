// Operator-facing deletion diagnostics must match the already-authorized state policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '../src/problem.ts';
import { World } from './helpers/world.ts';

test('rejected deletion lists IMPORTED among the pre-existing permitted states', async () => {
  const w = new World({ seed: 'pool-delete-diagnostic', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    assert.equal((await w.publishManifest()).status, 201);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const control = w.server.env.control;
    const before = control.election(w.electionId)!;
    assert.equal(before.state, 'CEREMONY');
    await w.server.pool.evict(w.electionId); // The authoritative replay and health guards remain part of this diagnostic.
    await assert.rejects(
      w.server.pool.remove(w.electionId),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, 'STATE_CONFLICT');
        assert.equal(error.status, 409);
        assert.match(error.message, /state must be DRAFT, ARCHIVED, CANCELLED, ABORTED or IMPORTED$/);
        return true;
      },
    );
    const after = control.election(w.electionId);
    assert.ok(after, 'a refused deletion must not erase its registration');
    assert.equal(after.state, 'CEREMONY');
    assert.deepEqual(after.dek_wrapped, before.dek_wrapped, 'a refused deletion must not erase the election key');
    assert.ok(existsSync(join(w.dir, before.db_path)));
    assert.deepEqual(control.pendingElectionCleanup(), []);
    assert.equal((await w.server.pool.get(w.electionId))!.log.size, 2);
  } finally { await w.stop(); }
});
