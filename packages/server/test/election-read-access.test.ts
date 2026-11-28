// @verifies QV-28-REQ-015
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ElectionDb } from '../src/electiondb.ts';

function fixture(): { dir: string; db: ElectionDb } {
  const dir = mkdtempSync(join(tmpdir(), 'qv-reader-'));
  const db = new ElectionDb(join(dir, 'election.sqlite'), 'test');
  db.init({ election_id: 'a'.repeat(32), origin: 'quietvote/v1/' + 'a'.repeat(26), state: 'DRAFT', log_pk: new Uint8Array(32),
    log_sk_enc: null, srv_pk: new Uint8Array(32), srv_sk_enc: null, access: 'public', read_key_hash: null,
    title: 'test', org_id: 'o'.repeat(26), created_at: 1 });
  return { dir, db };
}

test('read-only election reader remains read-only during maintenance and the separate writer closes', () => {
  const { dir, db } = fixture();
  db.setMeta('fixture', 'before');
  db.close();
  const reader = new ElectionDb(db.path, 'test', { readOnly: true });
  const connection = reader.db;
  let escaped: ElectionDb | undefined;
  try {
    assert.equal(reader.readOnly, true);
    assert.throws(() => reader.setMeta('fixture', 'forbidden'), /readonly database/);
    const result = reader.withMaintenance('retention', (writer) => {
      escaped = writer;
      assert.notEqual(writer.db, connection);
      assert.equal(reader.db, connection);
      assert.throws(() => reader.setMeta('fixture', 'still-forbidden'), /readonly database/);
      writer.tx(() => writer.setMeta('fixture', 'maintained'));
      return 17;
    });
    assert.equal(result, 17);
    assert.equal(reader.db, connection);
    assert.equal(reader.meta('fixture'), 'maintained');
    assert.equal(escaped!.db.isOpen, false);
    assert.throws(() => reader.setMeta('fixture', 'forbidden-again'), /readonly database/);
  } finally { reader.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('maintenance rollback and callback rejection close the writer without changing the reader', () => {
  const { dir, db } = fixture();
  db.setMeta('fixture', 'before');
  db.makeReadOnly();
  const connection = db.db;
  let escaped: ElectionDb | undefined;
  try {
    assert.throws(() => db.withMaintenance('recovery', (writer) => {
      escaped = writer;
      return writer.tx(() => { writer.setMeta('fixture', 'rolled-back'); throw new Error('injected failure'); });
    }), /injected failure/);
    assert.equal(escaped!.db.isOpen, false);
    assert.equal(db.db, connection);
    assert.equal(db.meta('fixture'), 'before');
    assert.throws(() => db.withMaintenance('recovery', () => Promise.resolve()), /must be synchronous/);
    assert.equal(db.db, connection);
    db.withMaintenance('recovery', (writer) => {
      db.withMaintenance('integrity', (nested) => assert.equal(nested, writer, 'nested named operations share only the scoped writer'));
    });
    assert.throws(() => db.setMeta('fixture', 'forbidden'), /readonly database/);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('writer retires once while the board adapter and later read connection stay stable', () => {
  const { dir, db } = fixture();
  const old = db.db, store = db.store;
  try {
    db.store.setReadOnly(true);
    assert.throws(() => db.tx(() => db.makeReadOnly()), /inside a transaction/);
    assert.equal(old.isOpen, true);
    db.makeReadOnly();
    const reader = db.db;
    assert.equal(old.isOpen, false);
    assert.equal(db.store, store);
    assert.equal(store.isReadOnly(), true);
    assert.throws(() => store.setReadOnly(false), /readonly database/);
    db.makeReadOnly();
    assert.equal(db.db, reader);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('explicit maintenance refuses an unmigrated database before persistent initialization', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-maintenance-schema-')), path = join(dir, 'empty.sqlite');
  try {
    assert.throws(() => new ElectionDb(path, 'test', { allowMigrations: false }), /requires explicit migration/);
    assert.equal(statSync(path).size, 0);
    assert.deepEqual(readFileSync(path), Buffer.alloc(0));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
