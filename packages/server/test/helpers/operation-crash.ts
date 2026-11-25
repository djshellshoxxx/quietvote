// Exit after the election-owned mutation commits, before its response/audit control transaction commits.
import { cosignLine } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { World, kp } from './world.ts';

const mode = process.argv[2];
if (mode !== 'create' && mode !== 'invites' && mode !== 'clear') throw new Error('unknown crash mode');
const admin = kp('operation-crash', 'admin');
const w = new World({ seed: 'operation-crash', n: 3, t: 2, voters: 2, server: { adminKeys: [bytesToHex(admin.publicKey)] } });
await w.start(); await w.setupOrgAndElection();
let path: string;
let body: Record<string, unknown>;
if (mode === 'create') {
  path = `/api/v1/orgs/${w.orgId}/elections`;
  body = { title: 'Committed crash creation', access: 'link' };
} else if (mode === 'invites') {
  path = `/api/v1/elections/${w.electionId}/invites`;
  body = { items: [{ label: 'PRIVATE_LABEL_CANARY', contact: 'PRIVATE_CONTACT_CANARY' }, {}] };
} else {
  await w.publishManifest();
  const rt = (await w.server.pool.get(w.electionId))!;
  const cp = rt.edb.store.latestCheckpoint()!, wk = w.witnesses[0]!;
  await rt.attachCosignatures(cp.size, [cosignLine('w1', wk.secretKey, wk.publicKey, cp.note.split('\n').slice(0, 3).join('\n') + '\n', w.nowSec)]);
  const incident = rt.markQuarantine('TEST_INCIDENT', 1, 'quarantine');
  path = `/api/v1/admin/elections/${w.electionId}/quarantine/clear`;
  body = { ack: incident, verified_against: ['witness:w1'] };
}
const headers = { 'idempotency-key': `operation-crash-${mode}` };
await new Promise<void>((resolve, reject) => {
  process.stdout.write(JSON.stringify({ dir: w.dir, orgId: w.orgId, electionId: w.electionId, clock: w.clock, path, body, headers }) + '\n', (error) => error ? reject(error) : resolve());
});
const store = w.server.env.control.storeIdem.bind(w.server.env.control);
w.server.env.control.storeIdem = (...args) => { if (args[1] === headers['idempotency-key'] && args[5] > 0) process.exit(74); store(...args); };
const r = await w.signed('POST', path, body, mode === 'clear' ? admin : w.owner, headers);
throw new Error(`crash injection did not run: ${r.status} ${r.text}`);
