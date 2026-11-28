// SPDX-License-Identifier: AGPL-3.0-or-later
// QV-28 §13: explicit offline archive copy, preservation checks and atomic publication.
import { closeSync, chmodSync, fsyncSync, lstatSync, mkdtempSync, openSync, realpathSync, renameSync, rmSync, type Stats } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BoardLog } from '@quietvote/board';
import { MIGRATIONS as CONTROL_MIGRATIONS, type RegistryRow, type RuntimeAnchor } from './controldb.ts';
import { MIGRATIONS, SqliteBoardStore } from './electiondb.ts';
import { openDb, validateSchema } from './db.ts';
import { lockDataDirectory } from './data-lock.ts';
import { captureMigrationInvariants, assertMigrationInvariants, type MigrationInvariants } from './migration-invariants.ts';
import { createMigrationBackup } from './migration-backup.ts';
import { assertArchiveSchema, assertControlSchema, captureArchivePreservation, assertArchivePreserved, type ArchivePreservation } from './archive-preservation.ts';
import { anchorMatches } from './runtime-anchor.ts';
import { SERVER_VERSION } from './election.ts';

const ELECTION_APPLICATION_ID = 0x51564442, CONTROL_APPLICATION_ID = 0x51564343;
export type ArchivePublication = 'not_published' | 'possibly_published';
type ArchiveAnchorStatus = 'preserved' | 'absent' | 'not_owned';
export class ArchiveMigrationError extends Error {
  readonly code: string;
  readonly publication: ArchivePublication;
  readonly backupPath: string | undefined;
  constructor(code: string, publication: ArchivePublication = 'not_published', backupPath?: string) {
    super(code); this.code = code; this.publication = publication; this.backupPath = backupPath;
  }
}
function fail(code: string): never { throw new ArchiveMigrationError(code); }
export interface ArchiveMigrationReport {
  format: 'qv-archive-migration/v1';
  outcome: 'already_current' | 'migrated';
  verification_scope: 'storage_preservation';
  runtime_anchor: ArchiveAnchorStatus;
  election_id: string;
  from_version: number;
  to_version: number;
  tree_size: number;
  root: string;
  backup_path?: string;
  directory_sync: 'not_needed' | 'completed' | 'unsupported';
}
export type ArchiveMigrationPhase = 'copied' | 'migrated' | 'verified' | 'before_replace' | 'after_replace';
/** Internal fault boundaries for local tests; none are exposed through argv, config or environment variables. */
export interface ArchiveMigrationOperations {
  backup?: typeof createMigrationBackup;
  checkpoint?: (database: DatabaseSync, kind: 'copy' | 'source') => void;
  replace?: typeof renameSync;
  syncDirectory?: (path: string) => void;
  observe?: (phase: ArchiveMigrationPhase, copyPath: string) => void;
}

function regular(path: string): Stats {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('ARCHIVE_FILE');
  return stat;
}
function optionalRegular(path: string): Stats | undefined {
  try { return regular(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
function checkSidecars(path: string): void {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const stat = optionalRegular(path + suffix);
    if (stat !== undefined && suffix === '-journal' && stat.size > 0) fail('ARCHIVE_SIDE_FILES');
  }
}
function inspect(path: string, applicationId: number): DatabaseSync {
  regular(path); checkSidecars(path);
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false, enableForeignKeyConstraints: true, timeout: 5000 });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON; PRAGMA busy_timeout=5000');
    if (db.prepare('PRAGMA application_id').get()?.['application_id'] !== applicationId) fail('ARCHIVE_APPLICATION_ID');
    return db;
  } catch (error) { db.close(); throw error; }
}
function structural(db: DatabaseSync): void {
  const result = db.prepare('PRAGMA integrity_check').all();
  if (result.length !== 1 || result[0]?.['integrity_check'] !== 'ok' || db.prepare('PRAGMA foreign_key_check').get() !== undefined) {
    fail('ARCHIVE_DATABASE');
  }
}
function checkpoint(db: DatabaseSync): void {
  if (db.prepare('PRAGMA journal_mode').get()?.['journal_mode'] !== 'wal') return;
  const result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  if (result?.['busy'] !== 0 || result['log'] !== 0 || result['checkpointed'] !== 0) fail('ARCHIVE_CHECKPOINT');
}
function clearClosedSidecars(path: string): void {
  // Called only after all our handles close under the data-directory lock. Never remove live WAL frames.
  for (const suffix of ['-wal', '-journal']) {
    const stat = optionalRegular(path + suffix);
    if (stat !== undefined && stat.size !== 0) fail('ARCHIVE_SIDE_FILES');
  }
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (optionalRegular(path + suffix) !== undefined) rmSync(path + suffix);
  }
}
function syncFile(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory(path: string): void {
  // Matches the migration-backup primitive. Native Windows directory durability remains unqualified.
  if (process.platform === 'win32') return;
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function boundRow(db: DatabaseSync, registry: RegistryRow): { origin: string; log_pk: Uint8Array; imported: number } {
  const imported = registry.imported ?? 0;
  const row = db.prepare('SELECT election_id,org_id,origin,log_pk,state,imported FROM election').get();
  if (!row || row['election_id'] !== registry.election_id || row['org_id'] !== registry.org_id || row['imported'] !== imported ||
      typeof row['origin'] !== 'string' || !(row['log_pk'] instanceof Uint8Array) || row['log_pk'].length !== 32 ||
      db.prepare('SELECT COUNT(*) AS n FROM election').get()?.['n'] !== 1) fail('ARCHIVE_BINDING');
  if (imported === 1 ? registry.state !== 'IMPORTED' || row['state'] !== 'IMPORTED' : registry.state !== 'ARCHIVED' || row['state'] !== 'ARCHIVED') {
    fail('ARCHIVE_NOT_TERMINAL');
  }
  return { origin: row['origin'], log_pk: row['log_pk'], imported };
}
function checkAnchor(control: DatabaseSync, db: DatabaseSync, registry: RegistryRow): ArchiveAnchorStatus {
  const row = boundRow(db, registry);
  const present = control.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='runtime_anchor'").get() !== undefined;
  const anchor = present ? control.prepare('SELECT * FROM runtime_anchor WHERE election_id=?').get(registry.election_id) as unknown as RuntimeAnchor | undefined : undefined;
  if (row.imported === 1) {
    if (anchor !== undefined) fail('ARCHIVE_ANCHOR'); // A mirror cannot inherit native ownership evidence.
    return 'not_owned';
  }
  if (anchor === undefined) return 'absent'; // Historical absence is preserved, never converted into a new trust claim.
  const log = new BoardLog({ origin: row.origin, store: new SqliteBoardStore(db), publicKey: row.log_pk, clock: () => 0 });
  if (log.status.state !== 'ok' || !anchorMatches(anchor, row.origin, row.log_pk, log)) fail('ARCHIVE_ANCHOR');
  return 'preserved';
}
interface Baseline { version: number; board: MigrationInvariants; storage: ArchivePreservation; anchor: ArchiveAnchorStatus }
function baseline(db: DatabaseSync, control: DatabaseSync, registry: RegistryRow): Baseline {
  const version = validateSchema(db, MIGRATIONS);
  assertArchiveSchema(db, version); structural(db); boundRow(db, registry);
  const board = captureMigrationInvariants(db);
  if (board.log.size > BigInt(Number.MAX_SAFE_INTEGER)) fail('ARCHIVE_LIMIT');
  const anchor = checkAnchor(control, db, registry);
  return { version, board, storage: captureArchivePreservation(db, version), anchor };
}
function preserved(db: DatabaseSync, control: DatabaseSync, registry: RegistryRow, before: Baseline, version: number): void {
  if (validateSchema(db, MIGRATIONS) !== version) fail('ARCHIVE_VERSION');
  assertArchiveSchema(db, version); structural(db); boundRow(db, registry);
  assertMigrationInvariants(db, before.board); assertArchivePreserved(db, before.storage);
  if (checkAnchor(control, db, registry) !== before.anchor) fail('ARCHIVE_ANCHOR');
}

/** Offline only: no server, KEK, network, control migration, anchor mutation or automatic archive upgrade. */
export function migrateArchive(dataDirectory: string, electionId: string, operations: ArchiveMigrationOperations = {}): ArchiveMigrationReport {
  if (!/^[0-9a-f]{32}$/.test(electionId)) fail('ARCHIVE_ELECTION_ID');
  let lock: ReturnType<typeof lockDataDirectory> | undefined;
  let control: DatabaseSync | undefined, source: DatabaseSync | undefined, copy: DatabaseSync | undefined;
  let staging: string | undefined, retained: string | undefined, report: ArchiveMigrationReport | undefined;
  let publication: ArchivePublication = 'not_published', failure: unknown, failed = false;
  const recordFailure = (error: unknown): void => { if (!failed) { failed = true; failure = error; } };
  try {
    const directory = realpathSync.native(resolve(dataDirectory));
    if (!lstatSync(directory).isDirectory()) fail('ARCHIVE_DIRECTORY');
    lock = lockDataDirectory(directory);
    control = inspect(join(directory, 'control.sqlite'), CONTROL_APPLICATION_ID);
    const controlVersion = validateSchema(control, CONTROL_MIGRATIONS);
    if (controlVersion < 1) fail('ARCHIVE_CONTROL');
    assertControlSchema(control, controlVersion); structural(control);
    const registry = control.prepare('SELECT * FROM election_registry WHERE election_id=?').get(electionId) as unknown as RegistryRow | undefined;
    if (!registry || registry.state === 'DELETED') fail('ARCHIVE_NOT_FOUND');
    const relative = join('elections', electionId.slice(0, 2), `${electionId}.sqlite`);
    if (registry.db_path !== relative) fail('ARCHIVE_BINDING');
    const path = join(directory, relative);
    if (realpathSync.native(path) !== path) fail('ARCHIVE_BINDING');
    const identity = regular(path);
    source = inspect(path, ELECTION_APPLICATION_ID);
    source.exec('BEGIN');
    const before = baseline(source, control, registry), latest = MIGRATIONS.at(-1)!.version;
    report = { format: 'qv-archive-migration/v1', outcome: 'already_current', election_id: electionId,
      verification_scope: 'storage_preservation', runtime_anchor: before.anchor,
      from_version: before.version, to_version: latest, tree_size: Number(before.board.log.size), root: before.board.log.root,
      directory_sync: 'not_needed' };
    if (before.version < latest) {
      // The instance lock excludes every cooperating writer. A read transaction pins the original while the
      // native backup worker copies it; the verified copy must also reproduce this exact baseline.
      retained = (operations.backup ?? createMigrationBackup)({ path, applicationId: ELECTION_APPLICATION_ID,
        fromVersion: before.version, toVersion: latest, appVersion: SERVER_VERSION });
      const backup = inspect(retained, ELECTION_APPLICATION_ID);
      try { preserved(backup, control, registry, before, before.version); } finally { backup.close(); }
      source.exec('COMMIT'); // VACUUM INTO owns its snapshot and cannot run within a transaction.
      staging = mkdtempSync(join(dirname(path), '.qv-archive-migration-')); chmodSync(staging, 0o700);
      const candidate = join(staging, 'database.sqlite');
      const fd = openSync(candidate, 'wx', 0o600); closeSync(fd);
      source.prepare('VACUUM INTO ?').run(candidate);
      operations.observe?.('copied', candidate);
      copy = openDb({ path: candidate, applicationId: ELECTION_APPLICATION_ID, synchronous: 'FULL', migrations: MIGRATIONS,
        appVersion: SERVER_VERSION, allowArchiveMigration: true });
      operations.observe?.('migrated', candidate);
      preserved(copy, control, registry, before, latest);
      operations.observe?.('verified', candidate);
      (operations.checkpoint ?? checkpoint)(copy, 'copy');
      copy.exec('PRAGMA journal_mode=DELETE');
      copy.close(); copy = undefined;
      clearClosedSidecars(candidate); syncFile(candidate);
      // Re-inspect the sealed bytes that will be published, after every preparation operation.
      copy = inspect(candidate, ELECTION_APPLICATION_ID);
      preserved(copy, control, registry, before, latest);
      copy.close(); copy = undefined;
      preserved(source, control, registry, before, before.version);
      const current = regular(path);
      if (current.dev !== identity.dev || current.ino !== identity.ino) fail('ARCHIVE_SOURCE_CHANGED');
      source.close(); source = undefined;
      // The only source maintenance is checkpointing its unchanged committed state after candidate verification.
      source = new DatabaseSync(path, { allowExtension: false, enableForeignKeyConstraints: true, timeout: 5000 });
      source.exec('PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000');
      preserved(source, control, registry, before, before.version);
      (operations.checkpoint ?? checkpoint)(source, 'source');
      source.close(); source = undefined;
      clearClosedSidecars(path); syncFile(path);
      operations.observe?.('before_replace', candidate);
      // A replacement syscall may have happened even when a surrounding operation reports failure.
      publication = 'possibly_published';
      (operations.replace ?? renameSync)(candidate, path);
      operations.observe?.('after_replace', path);
      (operations.syncDirectory ?? syncDirectory)(dirname(path));
      report = { ...report, outcome: 'migrated', backup_path: retained,
        directory_sync: process.platform === 'win32' ? 'unsupported' : 'completed' };
    }
  } catch (error) { recordFailure(error); }
  finally {
    for (const db of [copy, source, control]) {
      try { if (db?.isOpen) db.close(); } catch (error) { recordFailure(error); }
    }
    try { if (staging !== undefined) rmSync(staging, { recursive: true, force: true }); } catch (error) { recordFailure(error); }
    try { lock?.release(); } catch (error) { recordFailure(error); }
  }
  if (failed) throw new ArchiveMigrationError(failure instanceof ArchiveMigrationError ? failure.code : 'ARCHIVE_MIGRATION_FAILED', publication, retained);
  if (report === undefined) fail('ARCHIVE_MIGRATION_FAILED');
  return report;
}

export const ARCHIVE_MIGRATION_USAGE = `Usage: qv-migrate-archive --data-dir DIR --election ID [--json]
       qv-migrate-archive --help
Stop all QuietVote processes using the data directory before migration.
`;
export function archiveMigrationMain(args: string[], out: (text: string) => void, err: (text: string) => void): number {
  if (args.length === 1 && args[0] === '--help') { out(ARCHIVE_MIGRATION_USAGE); return 0; }
  let directory: string | undefined, election: string | undefined, json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json' && !json) json = true;
    else if (arg === '--data-dir' && directory === undefined && args[i + 1] && !args[i + 1]!.startsWith('-')) directory = args[++i];
    else if (arg === '--election' && election === undefined && args[i + 1] && !args[i + 1]!.startsWith('-')) election = args[++i];
    else { err(ARCHIVE_MIGRATION_USAGE); return 2; }
  }
  if (directory === undefined || election === undefined || !/^[0-9a-f]{32}$/.test(election)) { err(ARCHIVE_MIGRATION_USAGE); return 2; }
  try {
    const result = migrateArchive(directory, election);
    out(json ? JSON.stringify(result) + '\n' : `Archive ${result.outcome === 'migrated' ? 'migrated' : 'already current'}: ${result.election_id}; schema ${result.from_version} -> ${result.to_version}.\n` +
      `Verification scope: storage preservation; runtime anchor: ${result.runtime_anchor}.\n` +
      (result.backup_path === undefined ? '' : `Retained backup: ${result.backup_path}\n`) +
      (result.directory_sync === 'unsupported' ? 'Directory durability on Windows still requires native qualification.\n' : ''));
    return 0;
  } catch (error) {
    const failure = error instanceof ArchiveMigrationError ? error : new ArchiveMigrationError('ARCHIVE_MIGRATION_FAILED');
    const message = { code: failure.code, publication: failure.publication,
      ...(failure.backupPath === undefined ? {} : { backup_path: failure.backupPath }) };
    err(json ? JSON.stringify(message) + '\n' : `qv-migrate-archive: ${failure.code}; ${failure.publication === 'possibly_published'
      ? 'replacement may already be published; inspect the current file before recovery or retry' : 'replacement was not published'}.\n` +
      (failure.backupPath === undefined ? '' : `Retained backup: ${failure.backupPath}\n`));
    return 1;
  }
}
