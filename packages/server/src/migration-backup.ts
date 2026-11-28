// QV-28-REQ-010: complete a real, verified online backup before synchronous migration.
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export interface MigrationBackupOptions {
  path: string;
  applicationId: number;
  fromVersion: number;
  toVersion: number;
  appVersion: string;
}

/** POSIX directory durability; Windows directory FlushFileBuffers needs native qualification. */
function syncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** Called while the parent owns the migration write lock. Never launches a shell. */
export function createMigrationBackup(options: MigrationBackupOptions): string {
  const source = resolve(options.path), root = source + '.pre-migrations';
  let directory: string | undefined;
  try {
    try { mkdirSync(root, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('migration backup directory is not a real directory');
    chmodSync(root, 0o700);
    directory = mkdtempSync(join(root, '.pending-'));
    chmodSync(directory, 0o700);
    const destination = join(directory, 'database.sqlite');
    // backup() replaces its destination. Reserve it exclusively in our private directory.
    const destinationFd = openSync(destination, 'wx', 0o600); closeSync(destinationFd);
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./migration-backup-worker.mjs', import.meta.url)),
      source, destination, String(options.applicationId), String(options.fromVersion)], {
      encoding: 'utf8', windowsHide: true, timeout: 300_000, maxBuffer: 64 * 1024,
    });
    if (child.error || child.status !== 0 || child.signal) throw new Error('migration backup worker did not complete');
    const result = JSON.parse(child.stdout) as { byte_length?: unknown; sha256?: unknown };
    if (!Number.isSafeInteger(result.byte_length) || (result.byte_length as number) < 512 ||
        typeof result.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(result.sha256)) throw new Error('invalid migration backup receipt');
    const createdAt = Date.now();
    const manifestPath = join(directory, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ format: 'qv-migration-backup/v1', source: basename(source),
      application_id: options.applicationId, from_version: options.fromVersion, to_version: options.toVersion,
      app_version: options.appVersion, created_at: createdAt, byte_length: result.byte_length, sha256: result.sha256 }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
    const manifestFd = openSync(manifestPath, 'r');
    try { fsyncSync(manifestFd); } finally { closeSync(manifestFd); }
    syncDirectory(directory);
    const finalDirectory = join(root, `v${options.fromVersion}-${createdAt}-${basename(directory).slice('.pending-'.length)}`);
    renameSync(directory, finalDirectory);
    directory = undefined; // Retain completed backups even if migration later fails.
    syncDirectory(root);
    syncDirectory(dirname(root));
    return join(finalDirectory, 'database.sqlite');
  } catch (error) {
    if (directory !== undefined) try { rmSync(directory, { recursive: true, force: true }); } catch { /* preserve the original failure */ }
    throw new Error('pre-migration backup failed; schema migration refused', { cause: error });
  }
}
