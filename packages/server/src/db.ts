// node:sqlite helpers: pragmas (QV-28-REQ-003), forward-only checksummed migrations (REQ-010), nested transactions.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createMigrationBackup } from './migration-backup.ts';
import { assertMigrationInvariants, captureMigrationInvariants } from './migration-invariants.ts';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export type SqlValue = string | number | bigint | Uint8Array | null;

const depth = new WeakMap<DatabaseSync, number>();
const cache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

export function prep(db: DatabaseSync, sql: string): StatementSync {
  let m = cache.get(db);
  if (m === undefined) cache.set(db, (m = new Map()));
  let s = m.get(sql);
  if (s === undefined) m.set(sql, (s = db.prepare(sql)));
  return s;
}

export function run(db: DatabaseSync, sql: string, ...p: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
  return prep(db, sql).run(...p);
}
export function get<T = Record<string, SqlValue>>(db: DatabaseSync, sql: string, ...p: SqlValue[]): T | undefined {
  return prep(db, sql).get(...p) as T | undefined;
}
export function all<T = Record<string, SqlValue>>(db: DatabaseSync, sql: string, ...p: SqlValue[]): T[] {
  return prep(db, sql).all(...p) as T[];
}

/** BEGIN IMMEDIATE at depth 0, SAVEPOINT when nested. Rolls back on throw. */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  const d = depth.get(db) ?? 0;
  const sp = `sp${d}`;
  db.exec(d === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const r = fn();
    depth.set(db, d);
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return r;
  } catch (e) {
    depth.set(db, d);
    try {
      db.exec(d === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    } catch {
      /* connection already rolled back */
    }
    throw e;
  }
}

export interface OpenOpts {
  path: string;
  applicationId: number;
  /** `FULL` for election DBs and control recovery anchors (QV-28-REQ-003, B2-07). */
  synchronous: 'FULL' | 'NORMAL';
  migrations: readonly Migration[];
  appVersion: string;
  readOnly?: boolean;
  /** Explicit maintenance can write supported data without implicitly upgrading an archive. */
  allowMigrations?: boolean;
  /** Explicit operator override for a pending upgrade while an election is OPEN. */
  forceMigrateOpen?: boolean;
  /** Reserved for the explicit archive-copy migration command, never ordinary readers. */
  allowArchiveMigration?: boolean;
}

export function openDb(o: OpenOpts): DatabaseSync {
  const db = new DatabaseSync(o.path, { readOnly: o.readOnly ?? false, enableForeignKeyConstraints: true, allowExtension: false, timeout: 5000 });
  try {
    const ver = (get<{ v: string }>(db, 'SELECT sqlite_version() AS v')?.v ?? '0').split('.').map(Number);
    if ((ver[0] ?? 0) < 3 || ((ver[0] ?? 0) === 3 && (ver[1] ?? 0) < 37)) throw new Error('SQLite >= 3.37 (STRICT tables) required');
    // These are connection-local protections, including on a native read-only handle.
    db.exec('PRAGMA trusted_schema=OFF');
    db.exec('PRAGMA cell_size_check=ON');
    db.exec('PRAGMA foreign_keys=ON');
    db.exec('PRAGMA busy_timeout=5000');
    const appId = get<{ application_id: number }>(db, 'PRAGMA application_id')?.application_id ?? 0;
    const cur = get<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0;
    if (appId !== o.applicationId && !(appId === 0 && cur === 0 && o.readOnly !== true)) {
      throw new Error(`unexpected application_id ${appId} in ${o.path}`);
    }
    if (cur === 0 && get<{ n: number }>(db, "SELECT count(*) AS n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")!.n !== 0) {
      throw new Error('uninitialized database is not empty; refusing to claim its contents');
    }
    const current = validateSchema(db, o.migrations, o.readOnly === true || o.allowMigrations === false);
    const pending = current < (o.migrations.at(-1)?.version ?? 0);
    if (current > 0 && pending && o.readOnly !== true && o.allowMigrations !== false) assertMigrationPolicy(db, o);
    if (o.readOnly !== true) {
      db.exec('PRAGMA journal_mode=WAL');
      db.exec(`PRAGMA synchronous=${o.synchronous}`);
      db.exec('PRAGMA secure_delete=ON');
      if (appId === 0) db.exec(`PRAGMA application_id=${o.applicationId}`);
      if (o.allowMigrations !== false && pending) migrate(db, o, current);
    }
    // startup self-test: read the pragmas back
    const fk = get<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')?.foreign_keys;
    const ts = get<{ trusted_schema: number }>(db, 'PRAGMA trusted_schema')?.trusted_schema;
    if (fk !== 1 || ts !== 0) throw new Error('sqlite pragma self-test failed');
    return db;
  } catch (error) {
    try { db.close(); } catch { /* preserve the initialization error */ }
    throw error;
  }
}

function sha(s: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(s).digest());
}

/** Inspect the complete applied prefix before any migration or persistent pragma write. */
export function validateSchema(db: DatabaseSync, ms: readonly Migration[], requireCurrent = false): number {
  const cur = get<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0;
  const latest = ms.at(-1)?.version ?? 0;
  if (!Number.isSafeInteger(cur) || cur < 0 || ms.some((m, i) => m.version !== i + 1)) throw new Error('invalid database migration sequence');
  if (cur > latest) throw new Error('database schema is newer than this server; use a compatible binary');
  for (const m of ms) {
    if (m.version <= cur) {
      // verify the checksum of already-applied migrations
      const row = get<{ sha256: Uint8Array }>(db, 'SELECT sha256 FROM schema_migration WHERE version = ?', m.version);
      if (row === undefined || Buffer.compare(Buffer.from(row.sha256), Buffer.from(sha(m.sql))) !== 0) {
        throw new Error(`migration ${m.version} (${m.name}) checksum mismatch`);
      }
    }
  }
  if (cur > 0 && get<{ n: number }>(db, 'SELECT count(*) AS n FROM schema_migration')!.n !== cur) {
    throw new Error('migration ledger does not match user_version');
  }
  if (requireCurrent && cur !== latest) throw new Error('database schema requires explicit migration before this reader can open it');
  return cur;
}

/** Checked before persistent pragma writes and again under the upgrade lock. */
function assertMigrationPolicy(db: DatabaseSync, options: OpenOpts): void {
  const present = (name: string): boolean => get(db, "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", name) !== undefined;
  if (options.applicationId === 0x51564442) {
    // Every shipped election schema contains these tables. The generic invariant
    // collector permits absent board tables for control/genesis; an established
    // election must never treat missing evidence as a legitimate empty baseline.
    for (const table of ['election', 'log_entry', 'checkpoint']) {
      if (!present(table)) throw new Error(`established election is missing required ${table} table; migration refused`);
    }
    const hasImported = all<{ name: string }>(db, 'PRAGMA table_info(election)').some((column) => column.name === 'imported');
    const archived = get(db, "SELECT 1 FROM election WHERE state IN ('ARCHIVED','IMPORTED')" + (hasImported ? ' OR imported=1' : '') + ' LIMIT 1');
    if (archived !== undefined && options.allowArchiveMigration !== true) throw new Error('database requires explicit archive migration');
    if (options.forceMigrateOpen !== true && get(db, "SELECT 1 FROM election WHERE state='OPEN' LIMIT 1") !== undefined) {
      throw new Error('OPEN election schema migration refused; use --force-migrate-open only for an explicitly planned upgrade');
    }
  }
  if (options.applicationId === 0x51564343 && present('election_registry') && options.forceMigrateOpen !== true &&
      get(db, "SELECT 1 FROM election_registry WHERE state='OPEN' LIMIT 1") !== undefined) {
    throw new Error('OPEN election prevents control schema migration; use --force-migrate-open only for an explicitly planned upgrade');
  }
}

/** SQLite delimits complete statements, including trigger bodies and quoted semicolons. */
function migrationSql(db: DatabaseSync, sql: string): void {
  let remaining = sql;
  while (remaining.length > 0) {
    remaining = remaining.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');
    if (remaining.length === 0) return;
    // The runner owns transaction control, PRAGMAs and the sole database.
    const keyword = /^[a-z]+/i.exec(remaining)?.[0]?.toUpperCase();
    if (!['CREATE', 'ALTER', 'INSERT', 'UPDATE', 'DELETE', 'DROP'].includes(keyword ?? '')) {
      throw new Error('unsupported migration SQL statement; transaction and database controls belong to the runner');
    }
    const statement = db.prepare(remaining), consumed = statement.sourceSQL;
    if (consumed.length === 0 || !remaining.startsWith(consumed)) throw new Error('unable to delimit migration SQL');
    statement.run();
    if (!db.isTransaction) throw new Error('migration transaction ended unexpectedly');
    remaining = remaining.slice(consumed.length);
  }
}

function migrate(db: DatabaseSync, options: OpenOpts, expectedVersion: number): void {
  // One outer lock binds the committed backup snapshot and all pending SQL.
  // A failure in a later step rolls back the complete upgrade chain.
  db.exec('BEGIN EXCLUSIVE');
  try {
    const current = validateSchema(db, options.migrations);
    if (current !== expectedVersion) throw new Error('database schema changed while acquiring the migration lock');
    if (current > 0) assertMigrationPolicy(db, options);
    let baseline = captureMigrationInvariants(db);
    if (current > 0) {
      const path = createMigrationBackup({ path: options.path, applicationId: options.applicationId,
        fromVersion: current, toVersion: options.migrations.at(-1)!.version, appVersion: options.appVersion });
      const copy = new DatabaseSync(path, { readOnly: true, allowExtension: false });
      try {
        copy.exec('PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON');
        if (validateSchema(copy, options.migrations) !== current) throw new Error('pre-migration backup schema changed');
        assertMigrationInvariants(copy, baseline);
      } finally { copy.close(); }
    }
    for (const migration of options.migrations) {
      if (migration.version <= current) continue;
      migrationSql(db, migration.sql);
      run(db, 'INSERT INTO schema_migration(version,name,sha256,applied_at,app_version) VALUES (?,?,?,?,?)',
        migration.version, migration.name, sha(migration.sql), Date.now(), options.appVersion);
      db.exec(`PRAGMA user_version=${migration.version}`);
      validateSchema(db, options.migrations);
      if (db.prepare('PRAGMA foreign_key_check').get() !== undefined) throw new Error('migration foreign key check failed');
      assertMigrationInvariants(db, baseline);
      baseline = captureMigrationInvariants(db);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* retain the migration or backup error */ }
    throw error;
  }
}

export function closeDb(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
