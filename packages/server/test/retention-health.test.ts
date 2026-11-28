import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/app.ts';

test('BT-12: missing and corrupt databases produce durable count-only failures and recover', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-retention-'));
  const logs: string[] = [];
  const s = buildServer({ dataDir: dir, retentionSweepMs: 0, logSink: (l) => logs.push(l) });
  try {
    const org = s.env.control.createOrg('private-canary', 'a'.repeat(16), Buffer.alloc(32));
    for (const [id, path] of [['a'.repeat(32), 'missing.sqlite'], ['b'.repeat(32), 'corrupt.sqlite']]) {
      s.env.control.insertElection({ election_id: id!, org_id: org.org_id, db_path: path!, access: 'public', title: 'private-canary', dek_wrapped: Buffer.alloc(32) });
    }
    writeFileSync(join(dir, 'corrupt.sqlite'), 'not a database');
    assert.equal(await s.retention.runOnce(), 0);
    assert.equal(existsSync(join(dir, 'missing.sqlite')), false, 'never recreate a missing election database');
    assert.equal(s.retention.status.failedDatabases, 2);
    assert.equal(s.retention.status.consecutiveFailures, 1);
    assert.equal(s.retention.status.lastSuccessAt, null);
    const rows = s.env.control.db.prepare("SELECT target,detail FROM operator_audit WHERE action='retention.sweep'").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!['target'], null);
    assert.deepEqual(JSON.parse(String(rows[0]!['detail'])), { checked: 2, failed: 2, purged: 0, migration_backups_pruned: 0, complete: false });
    const event = logs.map((l) => JSON.parse(l)).find((r) => r.event === 'retention_sweep');
    assert.equal(event.code, 'RETENTION_SWEEP_FAILED');
    assert.ok(!logs.join('').includes('canary'));
    s.env.control.markDeleted('a'.repeat(32));
    s.env.control.markDeleted('b'.repeat(32));
    await s.retention.runOnce();
    assert.equal(s.retention.status.consecutiveFailures, 0);
    assert.equal(s.retention.status.failedDatabases, 0);
    assert.notEqual(s.retention.status.lastSuccessAt, null);
  } finally {
    await s.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});


test('BT-12: top-level sweep failure is visible, retry recovers, shutdown drains a shared sweep', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-retention-'));
  const logs: string[] = [];
  const s = buildServer({ dataDir: dir, retentionSweepMs: 0, logSink: (l) => logs.push(l) });
  const original = s.env.control.listAllElections;
  try {
    s.env.control.listAllElections = () => { throw new Error('private failure canary'); };
    await assert.rejects(s.retention.runOnce(), /private failure canary/);
    assert.equal(s.retention.status.consecutiveFailures, 1);
    assert.ok(logs.some((l) => JSON.parse(l).code === 'RETENTION_SWEEP_FAILED'));
    assert.ok(!logs.join('').includes('canary'));
    s.env.control.listAllElections = original;
    const org = s.env.control.createOrg('test', 'a'.repeat(16), Buffer.alloc(32));
    s.env.control.insertElection({ election_id: 'a'.repeat(32), org_id: org.org_id, db_path: 'missing.sqlite', access: 'public', title: 'test', dek_wrapped: Buffer.alloc(32) });
    const running = s.retention.runOnce();
    assert.equal(s.retention.runOnce(), running, 'concurrent callers share the sweep');
    await s.stop();
    await running;
    assert.equal(s.retention.status.failedDatabases, 1);
  } finally {
    s.env.control.listAllElections = original;
    // stop is not called twice: the existing server closes its database once.
    rmSync(dir, { recursive: true, force: true });
  }
});


test('BT-12: audit storage failure still emits an operational alarm and never marks success', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-retention-'));
  const logs: string[] = [];
  const s = buildServer({ dataDir: dir, retentionSweepMs: 0, logSink: (l) => logs.push(l) });
  const original = s.env.control.audit;
  try {
    s.env.control.audit = () => { throw new Error('private audit failure canary'); };
    await assert.rejects(s.retention.runOnce(), /private audit failure canary/);
    assert.equal(s.retention.status.lastSuccessAt, null);
    assert.equal(s.retention.status.consecutiveFailures, 1);
    assert.ok(logs.some((l) => JSON.parse(l).code === 'RETENTION_AUDIT_FAILED'));
    assert.ok(!logs.join('').includes('canary'));
    s.env.control.audit = original;
    await s.retention.runOnce();
    assert.equal(s.retention.status.consecutiveFailures, 0);
  } finally {
    s.env.control.audit = original;
    await s.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
