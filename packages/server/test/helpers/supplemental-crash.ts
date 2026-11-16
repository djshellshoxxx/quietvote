// A real process exits immediately after SQLite commit, before projection/event completion or publication.
import { cosignLine } from '@quietvote/board';
import { World } from './world.ts';

const mode = process.argv[2];
if (mode !== 'append' && mode !== 'witness') throw new Error('unknown crash mode');
const w = new World({ seed: 'supplemental-crash', n: 3, t: 2, voters: 2, witnessQuorum: 1 });
await w.start();
await w.setupOrgAndElection();
if (mode === 'witness') await w.publishManifest();
const rt = (await w.server.pool.get(w.electionId))!;
await new Promise<void>((resolve, reject) => {
  process.stdout.write(JSON.stringify({ dir: w.dir, electionId: w.electionId, clock: w.clock }) + '\n', (error) => error ? reject(error) : resolve());
});
const tx = rt.edb.tx.bind(rt.edb);
rt.edb.tx = <T>(fn: () => T): T => {
  const result = tx(fn);
  if (mode === 'append' ? rt.edb.hasAppendCompletions() : rt.witnessInfo().have > 0) process.exit(73);
  return result;
};
if (mode === 'append') await w.publishManifest();
else {
  const cp = rt.edb.store.latestCheckpoint()!;
  const text = cp.note.split('\n').slice(0, 3).join('\n') + '\n';
  const witness = w.witnesses[0]!;
  await rt.attachCosignatures(cp.size, [cosignLine('w1', witness.secretKey, witness.publicKey, text, w.nowSec)]);
}
throw new Error('crash injection did not run');
