// L3(b): the delete guard must decide from the election's own log, not from the registry. The registry is a projection
// written after the election's state row, so a crash can leave it behind (here: DRAFT while the log is OPEN). A deletion
// that trusts the registry would erase an open election.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bytesToHex } from '@quietvote/crypto';
import { fullElection, waitJob } from './helpers/full.ts';
import { kp } from './helpers/world.ts';

const admin = kp('admin', 'admin1');

test('a stale DRAFT registry does not allow deleting an OPEN election', { timeout: 180_000 }, async () => {
  const w = await fullElection('delete-stale-registry', { stopAt: 'OPEN', server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  try {
    const id = w.electionId;
    const reg = w.server.env.control.election(id)!;
    assert.equal(reg.state, 'OPEN');
    await w.server.stop();
    // crash window: the registry row lags the election's own state
    const ctl = new DatabaseSync(join(w.dir, 'control.sqlite'));
    ctl.prepare("UPDATE election_registry SET state='DRAFT' WHERE election_id=?").run(id);
    ctl.close();
    await w.start();

    const r = await w.signed('DELETE', `/api/v1/admin/elections/${id}`, { confirm: reg.title }, admin, w.idemKey());
    assert.equal(r.status, 202, r.text);
    const job = await waitJob(w, r.json.job_id, admin);
    assert.equal(job.state, 'failed', `an OPEN election must not be deleted: ${JSON.stringify(job)}`);
    assert.equal(w.server.env.control.election(id)?.state, 'OPEN', 'the registry is healed from the log');
    assert.ok(existsSync(join(w.dir, reg.db_path)), 'the election database must survive a refused deletion');
    assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 200);
  } finally {
    await w.stop();
  }
});
