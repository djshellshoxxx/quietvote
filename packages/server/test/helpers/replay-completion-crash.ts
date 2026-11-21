import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ElectionDb } from '../../src/electiondb.ts';
import { World } from './world.ts';

const info = JSON.parse(process.argv[2]!) as { dir: string; electionId: string; clock: number };
const w = new World({ seed: 'supplemental-crash', n: 3, t: 2, voters: 2, witnessQuorum: 1 });
rmSync(w.dir, { recursive: true });
w.dir = info.dir; w.electionId = info.electionId; w.clock = info.clock;
const tx = ElectionDb.prototype.tx;
if (process.argv[3] === 'registry') {
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) {
    const statement = prepare.call(this, sql);
    if (sql === 'UPDATE election_registry SET state=? WHERE election_id=?') {
      const run = statement.run.bind(statement);
      statement.run = (...args) => { Reflect.apply(run, statement, args); process.exit(76); };
    }
    return statement;
  };
} else {
  ElectionDb.prototype.tx = function <T>(fn: () => T): T {
    const before = this.hasAppendCompletions();
    const result = tx.call(this, fn) as T;
    if (before && !this.hasAppendCompletions()) process.exit(75);
    return result;
  };
}
await w.start();
await w.server.pool.get(w.electionId);
throw new Error('replay completion boundary was not reached');
