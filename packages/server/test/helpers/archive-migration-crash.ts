// SPDX-License-Identifier: AGPL-3.0-or-later
import { DatabaseSync } from 'node:sqlite';
import { migrateArchive } from '../../src/archive-migration.ts';

const [mode, path, argument] = process.argv.slice(2);
if (!path) throw new Error('missing fixture input');
if (mode === 'wal') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; PRAGMA synchronous=FULL');
  const table = argument === 'control' ? 'instance_meta' : 'meta';
  db.prepare(`INSERT INTO ${table}(key,value) VALUES (?,?)`).run('archive_wal_fixture', 'committed');
  process.exit(73); // Deliberately keep committed frames outside the main file, as after an interrupted process.
}
if (mode !== 'before_replace' && mode !== 'after_replace') throw new Error('unknown crash fixture phase');
if (!argument) throw new Error('missing election fixture');
migrateArchive(path, argument, { observe: (phase) => { if (phase === mode) process.exit(74); } });
throw new Error('fixture did not reach its crash boundary');
