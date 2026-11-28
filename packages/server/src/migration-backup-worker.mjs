// A synchronous constructor launches this child and waits for its online backup.
import { backup, DatabaseSync } from 'node:sqlite';
import { closeSync, createReadStream, fsyncSync, openSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [source, destination, applicationIdText, versionText] = process.argv.slice(2);
const applicationId = Number(applicationIdText), version = Number(versionText);
let db;
try {
  if (!source || !destination || !Number.isSafeInteger(applicationId) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error('invalid migration backup arguments');
  }
  db = new DatabaseSync(source, { readOnly: true, allowExtension: false, enableForeignKeyConstraints: true, timeout: 5000 });
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON; PRAGMA busy_timeout=5000');
  if (db.prepare('PRAGMA application_id').get()?.application_id !== applicationId ||
      db.prepare('PRAGMA user_version').get()?.user_version !== version) throw new Error('migration source changed');
  await backup(db, destination);
  db.close(); db = undefined;
  db = new DatabaseSync(destination, { allowExtension: false, enableForeignKeyConstraints: true, timeout: 5000 });
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA cell_size_check=ON; PRAGMA synchronous=FULL');
  // Restore must not depend on unlisted WAL or SHM files.
  db.exec('PRAGMA journal_mode=DELETE');
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok' ||
      db.prepare('PRAGMA application_id').get()?.application_id !== applicationId ||
      db.prepare('PRAGMA user_version').get()?.user_version !== version) throw new Error('migration backup verification failed');
  db.close(); db = undefined;
  const fd = openSync(destination, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(destination, { highWaterMark: 64 * 1024 })) hash.update(chunk);
  process.stdout.write(JSON.stringify({ byte_length: statSync(destination).size, sha256: hash.digest('hex') }));
} catch {
  process.stderr.write('migration backup worker failed\n');
  process.exitCode = 1;
} finally {
  try { db?.close(); } catch { /* retain the original failure */ }
}
