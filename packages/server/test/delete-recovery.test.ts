// QV-28-REQ-009/013: a crash or unlink failure after crypto-erasure must not orphan election files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { bytesToHex } from '@quietvote/crypto';
import { waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const admin = kp('delete-recovery', 'admin');
const makeWorld = (): World => new World({ seed: 'delete-recovery', n: 3, t: 2, voters: 2, server: { adminKeys: [bytesToHex(admin.publicKey)] } });

function assertErased(db: DatabaseSync, id: string): void {
  const row = db.prepare('SELECT state,dek_wrapped FROM election_registry WHERE election_id=?').get(id);
  assert.equal(row?.['state'], 'DELETED');
  assert.equal(row?.['dek_wrapped'], null);
}

test('failed file cleanup remains durable and startup finishes it before accepting work', async () => {
  const w = makeWorld();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const id = w.electionId;
    const reg = w.server.env.control.election(id)!;
    const base = join(w.dir, reg.db_path);
    const originalEvict = w.server.pool.evict.bind(w.server.pool);
    // Fail between the main DB unlink and WAL unlink, after all SQLite handles have closed.
    w.server.pool.evict = async (electionId) => {
      await originalEvict(electionId);
      if (electionId === id) mkdirSync(base + '-wal');
    };
    const response = await w.signed('DELETE', `/api/v1/admin/elections/${id}`, { confirm: reg.title }, admin, w.idemKey());
    assert.equal(response.status, 202, response.text);
    const job = await waitJob(w, response.json.job_id, admin);
    assert.equal(job.state, 'failed');
    assertErased(w.server.env.control.db, id);
    assert.equal(existsSync(base), false, 'main DB removal succeeded before WAL failure');
    assert.deepEqual(w.server.env.control.pendingElectionCleanup().map((row) => ({ ...row })), [{ election_id: id, db_path: reg.db_path }]);
    assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 404);
    await w.server.stop();

    // A persistent cleanup failure is visible at startup and must release ownership on failure.
    await assert.rejects(w.start());
    rmSync(base + '-wal', { recursive: true });
    writeFileSync(base + '-wal', 'interrupted WAL cleanup');
    writeFileSync(base + '-shm', 'interrupted SHM cleanup');
    await w.start();
    assertErased(w.server.env.control.db, id);
    for (const suffix of ['', '-wal', '-shm']) assert.equal(existsSync(base + suffix), false);
    assert.deepEqual(w.server.env.control.pendingElectionCleanup(), []);
    assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 404);
    const audits = w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='election.delete' AND target=?").get(id);
    assert.equal(audits?.['n'], 1, 'only completed cleanup is audited');
    await w.server.stop();
    await w.start();
    const again = w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='election.delete' AND target=?").get(id);
    assert.equal(again?.['n'], 1, 'completed cleanup is not repeated on the next restart');
  } finally {
    await w.stop();
  }
});

test('migration resumes deletion tombstones left by earlier versions', async () => {
  const w = makeWorld();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const id = w.electionId;
    const reg = w.server.env.control.election(id)!;
    const base = join(w.dir, reg.db_path);
    await w.server.stop();
    const db = new DatabaseSync(join(w.dir, 'control.sqlite'));
    try {
      // Recreate an actual pre-migration tombstone/crash window without a cleanup cursor.
      db.exec('DROP TABLE webhook_event_cursor; DROP TABLE election_cleanup; DELETE FROM schema_migration WHERE version>=6; PRAGMA user_version=5');
      db.prepare("UPDATE election_registry SET state='DELETED',dek_wrapped=NULL,deleted_at=? WHERE election_id=?").run(w.clock, id);
    } finally {
      db.close();
    }
    assert.equal(existsSync(base), true);
    await w.start();
    assertErased(w.server.env.control.db, id);
    assert.equal(existsSync(base), false);
    assert.deepEqual(w.server.env.control.pendingElectionCleanup(), []);
  } finally {
    await w.stop();
  }
});


test('a corrupted deletion path refuses startup without removing files outside its canonical election path', async () => {
  const w = makeWorld();
  const outside = mkdtempSync(join(tmpdir(), 'qv-cleanup-outside-'));
  const victim = join(outside, 'outside.sqlite');
  for (const suffix of ['', '-wal', '-shm']) writeFileSync(victim + suffix, `preserve${suffix}`);
  await w.start();
  try {
    await w.setupOrgAndElection();
    const id = w.electionId;
    const reg = w.server.env.control.election(id)!;
    w.server.env.control.markDeleted(id);
    w.server.env.control.db.prepare('UPDATE election_registry SET db_path=? WHERE election_id=?').run(relative(w.dir, victim), id);
    await w.server.stop();
    await assert.rejects(w.start(), /invalid election cleanup path/);
    for (const suffix of ['', '-wal', '-shm']) assert.equal(readFileSync(victim + suffix, 'utf8'), `preserve${suffix}`);
    assert.equal(existsSync(join(w.dir, reg.db_path)), true, 'no election files removed under malformed metadata');
    const db = new DatabaseSync(join(w.dir, 'control.sqlite'));
    try { db.prepare('UPDATE election_registry SET db_path=? WHERE election_id=?').run(reg.db_path, id); }
    finally { db.close(); }
    await w.start();
    assert.equal(existsSync(join(w.dir, reg.db_path)), false, 'operator-corrected canonical cleanup resumes normally');
    assert.deepEqual(w.server.env.control.pendingElectionCleanup(), []);
  } finally {
    await w.stop();
    rmSync(outside, { recursive: true, force: true });
  }
});
