// A real process exits immediately after SQLite commit, before projection/event completion or publication.
import { cosignLine } from '@quietvote/board';
import { signRecord } from '@quietvote/protocol';
import { fullElection } from './full.ts';
import { World } from './world.ts';

const mode = process.argv[2];
if (mode !== 'append' && mode !== 'witness' && mode !== 'archive' && mode !== 'archive_erase') throw new Error('unknown crash mode');
const archiving = mode === 'archive' || mode === 'archive_erase';
const w = archiving
  ? await fullElection('supplemental-crash', { stopAt: 'OPEN' })
  : new World({ seed: 'supplemental-crash', n: 3, t: 2, voters: 2, witnessQuorum: 1 });
if (!archiving) { await w.start(); await w.setupOrgAndElection(); }
else {
  const closed = await w.close();
  if (closed.status !== 201) throw new Error(closed.text);
  for (const j of [1, 3]) {
    const shares = await w.trusteeShares(j);
    if (shares.status !== 201) throw new Error(shares.text);
  }
  const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
  const coordinator = w.coord[0]!;
  const tally = await w.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, draft.json.body));
  if (tally.status !== 201) throw new Error(tally.text);
}
if (mode === 'witness') await w.publishManifest();
const rt = (await w.server.pool.get(w.electionId))!;
await new Promise<void>((resolve, reject) => {
  process.stdout.write(JSON.stringify({ dir: w.dir, electionId: w.electionId, clock: w.clock }) + '\n', (error) => error ? reject(error) : resolve());
});
const tx = rt.edb.tx.bind(rt.edb);
if (mode === 'archive_erase') {
  const erase = rt.edb.eraseKeys.bind(rt.edb);
  rt.edb.eraseKeys = () => { erase(); process.exit(73); };
}
rt.edb.tx = <T>(fn: () => T): T => {
  const result = tx(fn);
  if (mode !== 'archive_erase' && (mode === 'witness' ? rt.witnessInfo().have > 0 : rt.edb.hasAppendCompletions())) process.exit(73);
  return result;
};
if (mode === 'append') await w.publishManifest();
else if (archiving) await w.post('audit_close', w.coord[0]!, w.control('audit-close'));
else {
  const cp = rt.edb.store.latestCheckpoint()!;
  const text = cp.note.split('\n').slice(0, 3).join('\n') + '\n';
  const witness = w.witnesses[0]!;
  await rt.attachCosignatures(cp.size, [cosignLine('w1', witness.secretKey, witness.publicKey, text, w.nowSec)]);
}
throw new Error('crash injection did not run');
