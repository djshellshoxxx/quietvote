import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { assertMigrationInvariants, captureMigrationInvariants } from '../src/migration-invariants.ts';

// Match the stored protected fields, deliberately without append-only triggers:
// a migration can drop those triggers, so the independent guard must still fail.
const SCHEMA = `
CREATE TABLE log_entry (
  seq INTEGER PRIMARY KEY, type TEXT NOT NULL, author TEXT NOT NULL,
  author_nonce BLOB NOT NULL CHECK(length(author_nonce)=16), nonce_key TEXT NOT NULL UNIQUE,
  header BLOB NOT NULL, leaf_hash BLOB NOT NULL CHECK(length(leaf_hash)=32),
  body_digest BLOB NOT NULL CHECK(length(body_digest)=32), body BLOB, body_len INTEGER NOT NULL,
  received_at INTEGER NOT NULL, redacted_at INTEGER,
  UNIQUE(author,type,author_nonce), UNIQUE(leaf_hash)) STRICT;
CREATE TABLE checkpoint (
  tree_size INTEGER PRIMARY KEY, root_hash BLOB NOT NULL CHECK(length(root_hash)=32),
  note_text TEXT NOT NULL, issued_at INTEGER NOT NULL, witnessed INTEGER NOT NULL DEFAULT 0 CHECK(witnessed IN (0,1)),
  UNIQUE(root_hash,tree_size)) STRICT;
`;
const CACHE_SCHEMA = `CREATE TABLE merkle_node (
  level INTEGER NOT NULL CHECK(level>=1), idx INTEGER NOT NULL CHECK(idx>=0),
  hash BLOB NOT NULL CHECK(length(hash)=32), PRIMARY KEY(level,idx)) STRICT, WITHOUT ROWID`;
const invariantError = /migration invariant violation:/;

function digest(...parts: Uint8Array[]): Buffer {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
}

// Independent RFC 9162 definition: recursive largest-power-of-two partition,
// rather than the production incremental frontier or any BoardStore helper.
function referenceRoot(headers: readonly Uint8Array[]): Buffer {
  if (headers.length === 0) return digest(new Uint8Array());
  if (headers.length === 1) return digest(new Uint8Array([0]), headers[0]!);
  let split = 1;
  while (split * 2 < headers.length) split *= 2;
  return digest(new Uint8Array([1]), referenceRoot(headers.slice(0, split)), referenceRoot(headers.slice(split)));
}

function database(t: TestContext): DatabaseSync {
  const db = new DatabaseSync(':memory:', { allowExtension: false });
  t.after(() => db.close());
  return db;
}

function append(db: DatabaseSync, seq: number, body = Buffer.from(`retained-body-${seq}`)): Buffer {
  const header = Buffer.from(`header\0${seq}\0binary`, 'utf8');
  const nonce = Buffer.alloc(16);
  nonce.writeUInt32BE(seq);
  db.prepare(`INSERT INTO log_entry(seq,type,author,author_nonce,nonce_key,header,leaf_hash,body_digest,body,body_len,received_at,redacted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(seq, 'ballot', 'public-author', nonce, `nonce-${seq}`, header,
    digest(new Uint8Array([0]), header), digest(body), body, body.length, 1_700_000_000_000 + seq);
  return header;
}

function checkpoint(db: DatabaseSync, headers: readonly Uint8Array[], size: number): void {
  db.prepare('INSERT INTO checkpoint(tree_size,root_hash,note_text,issued_at,witnessed) VALUES(?,?,?,?,?)')
    .run(size, referenceRoot(headers.slice(0, size)), `signed-note-${size}\nlog-signature\nwitness-signature\n`, 1_700_000_001_000 + size, size % 2);
}

function cache(db: DatabaseSync, headers: readonly Uint8Array[]): void {
  db.exec(CACHE_SCHEMA);
  const insert = db.prepare('INSERT INTO merkle_node(level,idx,hash) VALUES(?,?,?)');
  for (let width = 2, level = 1; width <= headers.length; width *= 2, level++) {
    for (let start = 0; start + width <= headers.length; start += width) {
      insert.run(level, start / width, referenceRoot(headers.slice(start, start + width)));
    }
  }
}

function fixture(t: TestContext, count = 5, sizes = [0, 1, 3], withCache = false) {
  const db = database(t);
  db.exec(SCHEMA);
  const headers = Array.from({ length: count }, (_, seq) => append(db, seq));
  for (const size of sizes) checkpoint(db, headers, size);
  if (withCache) cache(db, headers);
  return { db, headers };
}

for (const count of [0, 1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 33, 257]) {
  test(`streaming root and every checkpoint match independent RFC 9162 roots: ${count} leaves`, (t) => {
    const { db, headers } = fixture(t, count, Array.from({ length: count + 1 }, (_, size) => size), true);
    const before = captureMigrationInvariants(db);
    assert.equal(before.log.root, referenceRoot(headers).toString('hex'));
    assert.equal(before.log.size, BigInt(count));
    assert.equal(before.log.maxSeq, count === 0 ? null : BigInt(count - 1));
    assert.equal(before.tables.log_entry?.rows, BigInt(count));
    assert.equal(before.tables.checkpoint?.rows, BigInt(count + 1));
    assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  });
}

test('a lagging latest checkpoint is valid; every earlier prefix is still checked', (t) => {
  const { db, headers } = fixture(t);
  const before = captureMigrationInvariants(db);
  assert.equal(before.log.size, 5n);
  assert.equal(db.prepare('SELECT MAX(tree_size) AS n FROM checkpoint').get()?.n, 3);
  assert.equal(before.log.root, referenceRoot(headers).toString('hex'));
  db.prepare('UPDATE checkpoint SET root_hash=? WHERE tree_size=1').run(referenceRoot(headers.slice(0, 3)));
  assert.throws(() => captureMigrationInvariants(db), /checkpoint root mismatch at size 1/);
});

test('log entries without any checkpoint and sparse valid subtree caches are supported', (t) => {
  const { db, headers } = fixture(t, 7, [], true);
  db.exec('DELETE FROM merkle_node WHERE level=1 AND idx=1');
  assert.equal(captureMigrationInvariants(db).log.root, referenceRoot(headers).toString('hex'));
  assert.equal(captureMigrationInvariants(db).tables.merkle_node?.rows, 3n);
});

test('an actual header hash is required, even if all stored commitments agree with a false leaf', (t) => {
  const { db } = fixture(t, 1, [1]);
  const falseLeaf = digest(Buffer.from('not the header leaf'));
  db.prepare('UPDATE log_entry SET leaf_hash=?').run(falseLeaf);
  db.prepare('UPDATE checkpoint SET root_hash=?').run(falseLeaf);
  assert.throws(() => captureMigrationInvariants(db), /leaf hash mismatch at sequence 0/);
});

for (const [name, sql] of [
  ['nonzero first sequence', 'UPDATE log_entry SET seq=9 WHERE seq=0'],
  ['gap', 'DELETE FROM log_entry WHERE seq=2'],
  ['negative sequence', 'UPDATE log_entry SET seq=-1 WHERE seq=0'],
  ['checkpoint beyond the log', 'UPDATE checkpoint SET tree_size=6 WHERE tree_size=3'],
  ['negative checkpoint', 'UPDATE checkpoint SET tree_size=-1 WHERE tree_size=0'],
  ['invalid empty root', 'UPDATE checkpoint SET root_hash=zeroblob(32) WHERE tree_size=0'],
] as const) {
  test(`refuses malformed historical commitments: ${name}`, (t) => {
    const { db } = fixture(t);
    db.exec(sql);
    assert.throws(() => captureMigrationInvariants(db), invariantError);
  });
}

test('missing constraints cannot hide duplicate log sequences or checkpoint sizes', (t) => {
  const { db } = fixture(t);
  db.exec('ALTER TABLE log_entry RENAME TO old_log; CREATE TABLE log_entry AS SELECT * FROM old_log; INSERT INTO log_entry SELECT * FROM old_log WHERE seq=0');
  assert.throws(() => captureMigrationInvariants(db), /sequence is not contiguous/);
  db.exec('DROP TABLE log_entry; ALTER TABLE old_log RENAME TO log_entry; ALTER TABLE checkpoint RENAME TO old_cp; CREATE TABLE checkpoint AS SELECT * FROM old_cp; INSERT INTO checkpoint SELECT * FROM old_cp WHERE tree_size=0');
  assert.throws(() => captureMigrationInvariants(db), /checkpoint sizes must be nonnegative and unique/);
});

for (const [name, sql] of [
  ['type', "UPDATE log_entry SET type='notice' WHERE seq=0"],
  ['author', "UPDATE log_entry SET author='another-public-author' WHERE seq=0"],
  ['author nonce', "UPDATE log_entry SET author_nonce=X'01010101010101010101010101010101' WHERE seq=0"],
  ['nonce key', "UPDATE log_entry SET nonce_key='changed-nonce' WHERE seq=0"],
  ['body digest', 'UPDATE log_entry SET body_digest=zeroblob(32) WHERE seq=0'],
  ['body bytes', "UPDATE log_entry SET body=X'00' WHERE seq=0"],
  ['body length', 'UPDATE log_entry SET body_len=body_len+1 WHERE seq=0'],
  ['received timestamp', 'UPDATE log_entry SET received_at=received_at+1 WHERE seq=0'],
  ['redaction timestamp', 'UPDATE log_entry SET redacted_at=9 WHERE seq=0'],
  ['checkpoint note', "UPDATE checkpoint SET note_text=note_text||'changed' WHERE tree_size=1"],
  ['checkpoint issued timestamp', 'UPDATE checkpoint SET issued_at=issued_at+1 WHERE tree_size=1'],
  ['checkpoint witnessed flag', 'UPDATE checkpoint SET witnessed=0 WHERE tree_size=1'],
  ['deleted checkpoint', 'DELETE FROM checkpoint WHERE tree_size=1'],
  ['deleted cache row', 'DELETE FROM merkle_node WHERE level=1 AND idx=0'],
] as const) {
  test(`migration comparison protects ${name} even when the Merkle root is unchanged`, (t) => {
    const { db } = fixture(t, 5, [0, 1, 3], true);
    const before = captureMigrationInvariants(db);
    db.exec(sql);
    assert.equal(captureMigrationInvariants(db).log.root, before.log.root);
    assert.throws(() => assertMigrationInvariants(db, before), /protected rows changed/);
  });
}

test('coordinated header, leaf, and checkpoint rewrites remain forbidden', (t) => {
  const { db, headers } = fixture(t, 5, [0, 1, 3, 5]);
  const before = captureMigrationInvariants(db);
  headers[0] = Buffer.from('rewritten-header');
  db.prepare('UPDATE log_entry SET header=?,leaf_hash=? WHERE seq=0').run(headers[0], referenceRoot(headers.slice(0, 1)));
  for (const size of [1, 3, 5]) db.prepare('UPDATE checkpoint SET root_hash=? WHERE tree_size=?').run(referenceRoot(headers.slice(0, size)), size);
  assert.notEqual(captureMigrationInvariants(db).log.root, before.log.root);
  assert.throws(() => assertMigrationInvariants(db, before), /log_entry protected rows changed/);
});

test('moving a checkpoint to another valid prefix remains forbidden', (t) => {
  const { db, headers } = fixture(t);
  const before = captureMigrationInvariants(db);
  db.prepare('UPDATE checkpoint SET tree_size=2,root_hash=? WHERE tree_size=3').run(referenceRoot(headers.slice(0, 2)));
  assert.doesNotThrow(() => captureMigrationInvariants(db));
  assert.throws(() => assertMigrationInvariants(db, before), /checkpoint protected rows changed/);
});

test('existing legitimate redactions are preserved exactly; migrations cannot newly redact or restore bodies', (t) => {
  const { db } = fixture(t);
  db.exec('UPDATE log_entry SET body=NULL,redacted_at=1700000009000 WHERE seq=0');
  const before = captureMigrationInvariants(db);
  assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  for (const sql of [
    'UPDATE log_entry SET body=NULL,redacted_at=1700000009000 WHERE seq=1',
    "UPDATE log_entry SET body=X'726573746F726564' WHERE seq=0",
    'UPDATE log_entry SET redacted_at=redacted_at+1 WHERE seq=0',
  ]) {
    db.exec('SAVEPOINT mutation');
    db.exec(sql);
    assert.throws(() => assertMigrationInvariants(db, before), /log_entry protected rows changed/);
    db.exec('ROLLBACK TO mutation; RELEASE mutation');
    assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  }
});

for (const [name, sql] of [
  ['wrong hash', 'UPDATE merkle_node SET hash=zeroblob(32) WHERE level=1 AND idx=0'],
  ['incomplete subtree', 'INSERT INTO merkle_node VALUES(1,2,zeroblob(32))'],
  ['out of range subtree', 'INSERT INTO merkle_node VALUES(62,0,zeroblob(32))'],
  ['invalid level', 'PRAGMA ignore_check_constraints=ON; UPDATE merkle_node SET level=0 WHERE level=2'],
  ['excessive level', 'UPDATE merkle_node SET level=64 WHERE level=2'],
  ['negative index', 'PRAGMA ignore_check_constraints=ON; UPDATE merkle_node SET idx=-1 WHERE level=2'],
  ['wrong hash length', "PRAGMA ignore_check_constraints=ON; UPDATE merkle_node SET hash=X'00' WHERE level=2"],
  ['duplicate coordinates', 'ALTER TABLE merkle_node RENAME TO old_nodes; CREATE TABLE merkle_node AS SELECT * FROM old_nodes; INSERT INTO merkle_node SELECT * FROM old_nodes WHERE level=2'],
] as const) {
  test(`optional historical subtree cache rejects ${name}`, (t) => {
    const { db } = fixture(t, 5, [0, 3], true);
    db.exec(sql);
    assert.throws(() => captureMigrationInvariants(db), invariantError);
  });
}

for (const table of ['log_entry', 'checkpoint', 'merkle_node']) {
  test(`a previously present ${table} cannot be dropped, even when empty`, (t) => {
    const { db } = fixture(t, 0, [], true);
    const before = captureMigrationInvariants(db);
    db.exec(`DROP TABLE ${table}`);
    assert.throws(() => assertMigrationInvariants(db, before), new RegExp(`${table} was dropped`));
  });
}

test('table renames, views, removed columns, and temporary shadows cannot stand in for protected storage', (t) => {
  const { db } = fixture(t);
  const before = captureMigrationInvariants(db);
  for (const sql of [
    'ALTER TABLE log_entry RENAME TO renamed_log',
    'ALTER TABLE log_entry RENAME TO saved_log; CREATE VIEW log_entry AS SELECT * FROM saved_log',
    'ALTER TABLE log_entry DROP COLUMN received_at',
    'ALTER TABLE log_entry RENAME COLUMN body TO previous_body',
    'CREATE TEMP TABLE log_entry(x)',
    'CREATE TEMP VIEW checkpoint AS SELECT * FROM main.checkpoint',
  ]) {
    db.exec('SAVEPOINT mutation');
    db.exec(sql);
    assert.throws(() => assertMigrationInvariants(db, before), invariantError, sql);
    db.exec('ROLLBACK TO mutation; RELEASE mutation');
  }
});

test('a checkpoint requires a log table; malformed protected schemas are refused', (t) => {
  const { db } = fixture(t, 0, [0]);
  db.exec('DROP TABLE log_entry');
  assert.throws(() => captureMigrationInvariants(db), /checkpoint exists without log_entry/);
  db.exec('CREATE TABLE log_entry(seq INTEGER)');
  assert.throws(() => captureMigrationInvariants(db), /missing a required column/);
});

test('initially absent tables may be introduced empty and become protected in the next baseline', (t) => {
  const db = database(t);
  const absent = captureMigrationInvariants(db);
  assert.deepEqual(absent.tables, { log_entry: null, checkpoint: null, merkle_node: null });
  db.exec(SCHEMA);
  db.exec(CACHE_SCHEMA);
  assert.doesNotThrow(() => assertMigrationInvariants(db, absent));
  const empty = captureMigrationInvariants(db);
  db.exec('DROP TABLE merkle_node');
  assert.throws(() => assertMigrationInvariants(db, empty), /merkle_node was dropped/);
});

test('new tables cannot introduce protected rows, and existing tables cannot acquire new rows', (t) => {
  const { db, headers } = fixture(t);
  const before = captureMigrationInvariants(db);
  db.exec(CACHE_SCHEMA);
  assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  db.prepare('INSERT INTO merkle_node VALUES(1,0,?)').run(referenceRoot(headers.slice(0, 2)));
  assert.throws(() => assertMigrationInvariants(db, before), /merkle_node was created with protected rows/);
  db.exec('DROP TABLE merkle_node');
  checkpoint(db, headers, 5);
  assert.throws(() => assertMigrationInvariants(db, before), /checkpoint protected rows changed/);
  db.exec('DELETE FROM checkpoint WHERE tree_size=5');
  append(db, 5);
  assert.throws(() => assertMigrationInvariants(db, before), /log_entry protected rows changed/);
});

test('expand migrations may add columns without losing protection of any existing field', (t) => {
  const { db } = fixture(t);
  const before = captureMigrationInvariants(db);
  db.exec(`ALTER TABLE log_entry ADD COLUMN future_value ANY;
    ALTER TABLE checkpoint ADD COLUMN "future\"\"note" TEXT DEFAULT 'new default';
    UPDATE log_entry SET future_value=X'0102'`);
  assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  const expanded = captureMigrationInvariants(db);
  assert.ok(expanded.tables.log_entry?.columns.includes('future_value'));
  assert.ok(expanded.tables.checkpoint?.columns.includes('future"note'));
  db.exec("UPDATE log_entry SET future_value=X'0103' WHERE seq=0");
  assert.throws(() => assertMigrationInvariants(db, expanded), /log_entry protected rows changed/);
  db.exec('UPDATE log_entry SET received_at=received_at+1 WHERE seq=1');
  assert.throws(() => assertMigrationInvariants(db, before), /log_entry protected rows changed/);
});

for (const [name, initial, changed] of [
  ['TEXT and BLOB with identical bytes', "'abc'", "X'616263'"],
  ['INTEGER and REAL with identical numeric value', '7', 'CAST(7 AS REAL)'],
  ['exact integers beyond JavaScript safe precision', '9223372036854775806', '9223372036854775807'],
  ['malformed UTF-8 TEXT bytes', "CAST(X'80' AS TEXT)", "CAST(X'81' AS TEXT)"],
  ['TEXT beyond embedded NUL', "CAST(X'610062' AS TEXT)", "CAST(X'610063' AS TEXT)"],
  ['NULL and empty BLOB', 'NULL', "X''"],
] as const) {
  test(`canonical row digest distinguishes ${name}`, (t) => {
    const { db } = fixture(t);
    db.exec(`ALTER TABLE log_entry ADD COLUMN exact_value ANY; UPDATE log_entry SET exact_value=${initial} WHERE seq=0`);
    const before = captureMigrationInvariants(db);
    db.exec(`UPDATE log_entry SET exact_value=${changed} WHERE seq=0`);
    assert.throws(() => assertMigrationInvariants(db, before), /log_entry protected rows changed/);
  });
}

test('length framing distinguishes field boundaries with identical concatenated content', (t) => {
  const { db } = fixture(t);
  db.exec("UPDATE log_entry SET author='ab',type='c' WHERE seq=0");
  const before = captureMigrationInvariants(db);
  db.exec("UPDATE log_entry SET author='a',type='bc' WHERE seq=0");
  assert.throws(() => assertMigrationInvariants(db, before), /log_entry protected rows changed/);
});

test('row streams never use all(); summaries remain bounded and contain no row content', (t) => {
  const db = database(t);
  db.exec(SCHEMA);
  const body = Buffer.alloc(16 * 1024, 0x61);
  const headers: Buffer[] = [];
  db.exec('BEGIN');
  for (let seq = 0; seq < 2_049; seq++) headers.push(append(db, seq, body));
  checkpoint(db, headers, 1_023);
  db.exec('COMMIT');
  t.mock.method(StatementSync.prototype, 'all', () => { throw new Error('materializing row collections is forbidden'); });
  const before = captureMigrationInvariants(db);
  assert.equal(before.log.root, referenceRoot(headers).toString('hex'));
  assert.equal(before.log.size, 2_049n);
  assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  const serialized = JSON.stringify(before, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  assert.ok(serialized.length < 2_000, `summary grew to ${serialized.length} bytes`);
  assert.ok(!serialized.includes('header\u0000') && !serialized.includes('signed-note-'));
  assert.ok(Object.isFrozen(before) && Object.isFrozen(before.tables) && Object.isFrozen(before.tables.log_entry?.columns));
});

test('failed capture releases its iterators so transactional DDL can roll back and retry', (t) => {
  const { db } = fixture(t, 5, [0, 1, 3], true);
  const before = captureMigrationInvariants(db);
  db.exec('BEGIN EXCLUSIVE; UPDATE log_entry SET leaf_hash=zeroblob(32) WHERE seq=0');
  assert.throws(() => assertMigrationInvariants(db, before), /leaf hash mismatch/);
  assert.doesNotThrow(() => db.exec('ROLLBACK'));
  assert.doesNotThrow(() => assertMigrationInvariants(db, before));
  assert.doesNotThrow(() => db.exec('BEGIN EXCLUSIVE; DROP TABLE checkpoint; ROLLBACK'));
});
