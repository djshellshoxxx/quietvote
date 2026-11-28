// Instance-wide OPEN policy, called under the existing data-directory lock before any database writes.
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS as CONTROL_MIGRATIONS } from './controldb.ts';
import { MIGRATIONS as ELECTION_MIGRATIONS } from './electiondb.ts';
import { validateSchema } from './db.ts';

function inspect(path: string, applicationId: number, allowEmptyInitialization = false): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false, enableForeignKeyConstraints: true, timeout: 5000 });
  try {
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON; PRAGMA busy_timeout=5000');
    const storedId = db.prepare('PRAGMA application_id').get()?.['application_id'];
    // DatabaseSync creates the file before openDb writes its application ID. Only
    // a truly empty, unversioned file at an initialization target may cross this cut.
    const emptyInitialization = allowEmptyInitialization && storedId === 0 &&
      db.prepare('PRAGMA user_version').get()?.['user_version'] === 0 &&
      db.prepare('SELECT 1 FROM sqlite_schema LIMIT 1').get() === undefined;
    if (storedId !== applicationId && !emptyInitialization) throw new Error('unexpected database application_id during migration preflight');
    return db;
  } catch (error) { db.close(); throw error; }
}

/**
 * Admission commits the opening and its completion intent before updating either
 * state projection. An ordered stored opening therefore remains a migration hold
 * until a later close/cancellation. This is a conservative local policy check,
 * not board signature verification. In particular it does not authenticate and
 * interpret notice controls: PAUSED or INVALIDATED without a close still holds.
 */
function unresolvedOpening(db: DatabaseSync): boolean {
  return db.prepare(`SELECT 1 FROM log_entry AS opening WHERE opening.type='election_open'
    AND NOT EXISTS (SELECT 1 FROM log_entry AS ending WHERE ending.seq>opening.seq
      AND ending.type IN ('election_close','election_cancel')) LIMIT 1`).get() !== undefined;
}

/** Current schemas remain usable during voting. Any pending active schema blocks automatic upgrade. */
export function preflightOpenMigrations(dataDir: string, forceMigrateOpen = false): void {
  const controlPath = join(dataDir, 'control.sqlite');
  if (!existsSync(controlPath)) return;
  const control = inspect(controlPath, 0x51564343, true);
  try {
    const version = validateSchema(control, CONTROL_MIGRATIONS);
    if (version === 0) return;
    const refuse = (): never => { throw new Error('OPEN election prevents automatic schema upgrade; use --force-migrate-open only for an explicitly planned upgrade'); };
    let pending = version < CONTROL_MIGRATIONS.length;
    let open = false;
    let inspectionError: unknown;
    // Registry and election.state can both lag the committed board after a crash.
    // Imported mirrors do not represent an election this instance is conducting.
    for (const row of control.prepare("SELECT db_path,state FROM election_registry WHERE state NOT IN ('DELETED','IMPORTED') AND imported=0").iterate()) {
      let election: DatabaseSync | undefined;
      let candidatePending = false;
      let candidateOpen = row['state'] === 'OPEN';
      try {
        const storedPath = String(row['db_path']);
        if (isAbsolute(storedPath)) throw new Error('invalid election database path during migration preflight');
        const path = realpathSync.native(resolve(dataDir, storedPath)), contained = relative(dataDir, path);
        if (contained === '..' || contained.startsWith('..' + sep) || isAbsolute(contained)) throw new Error('election database escapes data directory during migration preflight');
        election = inspect(path, 0x51564442, row['state'] === 'DRAFT');
        const electionVersion = validateSchema(election, ELECTION_MIGRATIONS);
        if (electionVersion === 0) {
          if (election.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get() !== undefined) {
            throw new Error('uninitialized election storage is not empty during migration preflight');
          }
          continue; // An empty creation target has no existing schema to upgrade.
        }
        candidatePending = row['state'] !== 'ARCHIVED' && electionVersion < ELECTION_MIGRATIONS.length;
        const stored = election.prepare('SELECT state,imported FROM election LIMIT 1').get();
        if (stored?.['imported'] === 1 || stored?.['state'] === 'IMPORTED') {
          candidatePending = false; candidateOpen = false;
          continue;
        }
        const archived = row['state'] === 'ARCHIVED' || stored?.['state'] === 'ARCHIVED' ||
          election.prepare("SELECT 1 FROM log_entry WHERE type='audit_close' LIMIT 1").get() !== undefined;
        candidateOpen = unresolvedOpening(election) || (!archived && (candidateOpen || stored?.['state'] === 'OPEN'));
        // Historical archives need their distinct explicit migration operation;
        // their schema debt does not become an automatic upgrade target here.
        candidatePending = !archived && electionVersion < ELECTION_MIGRATIONS.length;
      } catch (error) {
        inspectionError ??= error;
      } finally {
        pending ||= candidatePending; open ||= candidateOpen;
        election?.close();
      }
      if (pending && open && !forceMigrateOpen) refuse();
    }
    if (pending && open && !forceMigrateOpen) refuse();
    // With current schemas, missing creation targets and other recovery work
    // still belong to the existing startup path. A pending upgrade cannot infer
    // that there is no unresolved opening from storage it could not inspect.
    // --force-migrate-open only overrides a known opening hold, not an unreadable target.
    if (pending && inspectionError !== undefined) {
      throw new Error('cannot safely inspect election storage before automatic schema migration', { cause: inspectionError });
    }
  } finally { control.close(); }
}
