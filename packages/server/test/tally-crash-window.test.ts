// L3(a): a crash after election_close is durable and before the tally aggregate is posted must be recovered on the next
// open of the election, and the aggregate must be posted exactly once. The crash is simulated by making the aggregate step
// throw right after the close append; the server is then stopped and restarted on the same data directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ElectionRuntime } from '../src/election.ts';
import { fullElection } from './helpers/full.ts';
import type { World } from './helpers/world.ts';

const countEntries = (w: World, id: string, type: string): number => {
  const reg = w.server.env.control.election(id)!;
  const db = new DatabaseSync(join(w.dir, reg.db_path), { readOnly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM log_entry WHERE type=?').get(type) as { n: number }).n;
  } finally {
    db.close();
  }
};

const proto = ElectionRuntime.prototype as unknown as { maybeAggregateLocked: () => Promise<void> };

test('crash between election_close and tally_aggregate is recovered on reopen, posting one aggregate', { timeout: 180_000 }, async () => {
  const w = await fullElection('tally-crash-window', { stopAt: 'OPEN' });
  try {
    const id = w.electionId;
    const real = proto.maybeAggregateLocked;
    proto.maybeAggregateLocked = async () => {
      throw new Error('simulated crash before the tally aggregate');
    };
    try {
      await w.close();
    } finally {
      proto.maybeAggregateLocked = real;
    }
    // the crash window: the close is durable and the registry says CLOSED, but no aggregate was posted
    assert.equal(w.server.env.control.election(id)!.state, 'CLOSED');
    assert.equal(countEntries(w, id, 'election_close'), 1);
    assert.equal(countEntries(w, id, 'tally_aggregate'), 0);

    await w.server.stop();
    await w.start();
    const open = await w.get(`/api/v1/elections/${id}`);
    assert.equal(open.status, 200, open.text);
    assert.equal(countEntries(w, id, 'tally_aggregate'), 1, 'the interrupted aggregate must be recovered on open');

    // recovery is idempotent: another restart must not post a second aggregate
    await w.server.stop();
    await w.start();
    assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 200);
    assert.equal(countEntries(w, id, 'tally_aggregate'), 1, 'a second open must not double-count the aggregate');
  } finally {
    await w.stop();
  }
});

test('a normal close posts one aggregate, and reopening does not post another', { timeout: 180_000 }, async () => {
  const w = await fullElection('tally-no-double', { stopAt: 'OPEN' });
  try {
    const id = w.electionId;
    assert.equal((await w.close()).status, 201);
    assert.equal(countEntries(w, id, 'tally_aggregate'), 1);
    await w.server.stop();
    await w.start();
    assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 200);
    assert.equal(countEntries(w, id, 'tally_aggregate'), 1, 'reopen must not post a second aggregate');
  } finally {
    await w.stop();
  }
});
