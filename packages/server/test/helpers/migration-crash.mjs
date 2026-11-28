// Child-only fault injection: block before the actual outer migration COMMIT, after all pending SQL.
import { writeSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../../src/db.ts';

const [path, encoded] = process.argv.slice(2);
const migrations = JSON.parse(encoded);
const execute = DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec = function (sql) {
  if (sql === 'COMMIT' && this.prepare('PRAGMA user_version').get().user_version === migrations.length) {
    writeSync(1, 'MIGRATION_BEFORE_COMMIT\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    throw new Error('unreachable migration crash cut');
  }
  return execute.call(this, sql);
};
openDb({ path, applicationId: 0x51564343, synchronous: 'FULL', migrations, appVersion: 'crash-fixture' }).close();
throw new Error('migration did not reach its requested crash cut');
