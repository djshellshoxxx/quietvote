// QV-28 §13: retain completed pre-migration snapshots for at least 30 days.
// §10.1 protects the newest snapshot of a live database; §11.1 retains deleted-election backups for 90 days.
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseQvJson } from '@quietvote/crypto';

export const MIGRATION_BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const DELETED_BACKUP_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

interface Snapshot { path: string; createdAt: number; bytes: number; sha256: string }
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

/** Only the complete, private format written by createMigrationBackup is eligible for removal. */
function snapshot(root: string, name: string, source: string): Snapshot | undefined {
  const match = /^v([1-9][0-9]*)-([0-9]+)-[a-zA-Z0-9]{6}$/.exec(name);
  if (!match) return undefined;
  const path = join(root, name);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
  const members = readdirSync(path).sort();
  if (members.join(',') !== 'database.sqlite,manifest.json') return undefined;
  const metadataPath = join(path, 'manifest.json'), databasePath = join(path, 'database.sqlite');
  const metadata = lstatSync(metadataPath), database = lstatSync(databasePath);
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16 * 1024 ||
      !database.isFile() || database.nlink !== 1 || database.size < 512) return undefined;
  let value: unknown;
  try { value = parseQvJson(readFileSync(metadataPath)); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const m = value as Record<string, unknown>;
  if (Object.keys(m).sort().join(',') !== 'app_version,application_id,byte_length,created_at,format,from_version,sha256,source,to_version' ||
      m['format'] !== 'qv-migration-backup/v1' || m['source'] !== source ||
      ![0x51564343, 0x51564442].includes(m['application_id'] as number) ||
      typeof m['app_version'] !== 'string' || m['app_version'].length > 256 ||
      !Number.isSafeInteger(m['from_version']) || m['from_version'] !== Number(match[1]) ||
      !Number.isSafeInteger(m['to_version']) || (m['to_version'] as number) <= (m['from_version'] as number) ||
      !Number.isSafeInteger(m['created_at']) || m['created_at'] !== Number(match[2]) || (m['created_at'] as number) < 0 ||
      m['byte_length'] !== database.size || typeof m['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(m['sha256'])) return undefined;
  return { path, createdAt: m['created_at'] as number, bytes: database.size, sha256: m['sha256'] };
}

/** A corrupt newest artifact cannot justify deleting the only intact older snapshot. */
function verified(snapshot: Snapshot): boolean {
  const fd = openSync(join(snapshot.path, 'database.sqlite'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== snapshot.bytes) return false;
    const digest = createHash('sha256'), block = Buffer.alloc(64 * 1024);
    for (;;) {
      const count = readSync(fd, block, 0, block.length, null);
      if (count === 0) return digest.digest('hex') === snapshot.sha256;
      digest.update(block.subarray(0, count));
    }
  } finally { closeSync(fd); }
}

/**
 * Retention never opens an election database or changes an ordinary backup.
 * Unknown/partial directories are preserved for inspection. The newest complete live snapshot is
 * retained even after 30 days. Tombstones permit its removal only after the separate 90-day grace.
 */
export function pruneMigrationBackups(sourcePath: string, nowMs: number, deletedAt?: number): number {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      (deletedAt !== undefined && (!Number.isSafeInteger(deletedAt) || deletedAt < 0))) throw new Error('invalid migration backup retention time');
  if (deletedAt !== undefined && nowMs - deletedAt < DELETED_BACKUP_RETENTION_MS) return 0;
  const source = resolve(sourcePath), root = source + '.pre-migrations';
  let stat;
  try { stat = lstatSync(root); } catch (error) { if (missing(error)) return 0; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('migration backup retention root is not a real directory');
  const complete: Snapshot[] = [];
  for (const name of readdirSync(root)) {
    const item = snapshot(root, name, basename(source));
    if (item) complete.push(item);
  }
  complete.sort((a, b) => b.createdAt - a.createdAt || b.path.localeCompare(a.path));
  const due = complete.filter((item, index) => (index > 0 || deletedAt !== undefined) && nowMs - item.createdAt >= MIGRATION_BACKUP_RETENTION_MS);
  if (due.length === 0) return 0;
  // Only a sweep that would remove an older live backup pays for this bounded-memory read.
  if (deletedAt === undefined && !verified(complete[0]!)) throw new Error('retained migration backup checksum mismatch; cleanup refused');
  let removed = 0;
  for (const item of due) {
    // No recursive traversal of an unrecognized directory: recheck the exact owned membership.
    const current = snapshot(root, basename(item.path), basename(source));
    if (!current || current.createdAt !== item.createdAt) throw new Error('migration backup changed during retention');
    rmSync(item.path, { recursive: true });
    removed++;
  }
  return removed;
}
