// node:sqlite helpers: pragmas (QV-28-REQ-003), forward-only checksummed migrations (REQ-010), nested transactions.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

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

export function run(db: DatabaseSync, sql: string, ...p: SqlValue[]): { changes: number | bigint } {
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
  /** `FULL` for election DBs, `NORMAL` for control (QV-28-REQ-003). */
  synchronous: 'FULL' | 'NORMAL';
  migrations: Migration[];
  appVersion: string;
  readOnly?: boolean;
}

export function openDb(o: OpenOpts): DatabaseSync {
  const db = new DatabaseSync(o.path, { readOnly: o.readOnly ?? false, enableForeignKeyConstraints: true, allowExtension: false, timeout: 5000 });
  const ver = (get<{ v: string }>(db, 'SELECT sqlite_version() AS v')?.v ?? '0').split('.').map(Number);
  if ((ver[0] ?? 0) < 3 || ((ver[0] ?? 0) === 3 && (ver[1] ?? 0) < 37)) throw new Error('SQLite >= 3.37 (STRICT tables) required');
  if (o.readOnly !== true) {
    db.exec('PRAGMA journal_mode=WAL');
    db.exec(`PRAGMA synchronous=${o.synchronous}`);
    db.exec('PRAGMA trusted_schema=OFF');
    db.exec('PRAGMA secure_delete=ON');
    db.exec('PRAGMA cell_size_check=ON');
    db.exec('PRAGMA foreign_keys=ON');
    db.exec('PRAGMA busy_timeout=5000');
    const appId = get<{ application_id: number }>(db, 'PRAGMA application_id')?.application_id ?? 0;
    if (appId === 0) db.exec(`PRAGMA application_id=${o.applicationId}`);
    else if (appId !== o.applicationId) throw new Error(`unexpected application_id ${appId} in ${o.path}`);
    migrate(db, o.migrations, o.appVersion);
  }
  // startup self-test: read the pragmas back
  const fk = get<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')?.foreign_keys;
  const ts = get<{ trusted_schema: number }>(db, 'PRAGMA trusted_schema')?.trusted_schema;
  if (fk !== 1 || ts !== 0) throw new Error('sqlite pragma self-test failed');
  return db;
}

function sha(s: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(s).digest());
}

function migrate(db: DatabaseSync, ms: Migration[], appVersion: string): void {
  const cur = get<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0;
  for (const m of ms) {
    if (m.version <= cur) {
      // verify the checksum of already-applied migrations
      const row = get<{ sha256: Uint8Array }>(db, 'SELECT sha256 FROM schema_migration WHERE version = ?', m.version);
      if (row === undefined || Buffer.compare(Buffer.from(row.sha256), Buffer.from(sha(m.sql))) !== 0) {
        throw new Error(`migration ${m.version} (${m.name}) checksum mismatch`);
      }
      continue;
    }
    tx(db, () => {
      db.exec(m.sql);
      run(db, 'INSERT INTO schema_migration(version,name,sha256,applied_at,app_version) VALUES (?,?,?,?,?)', m.version, m.name, sha(m.sql), Date.now(), appVersion);
      db.exec(`PRAGMA user_version=${m.version}`);
    });
  }
}

export function closeDb(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}
