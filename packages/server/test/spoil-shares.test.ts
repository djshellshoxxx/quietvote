// QV-ADR-020: trustees-mode spoil shares over HTTP (POST/GET /spoil-shares, tally.spoiled[].shares).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { signRecord, verifyElectionText } from '@quietvote/protocol';
import { World } from './helpers/world.ts';

const sel = (i: number) => ({ budget: [i % 2 ? 'no' : 'yes'], chair: [['ann', 'bob', 'cy'][i % 3]!] });
let w: World;
let codeT = '';
let codeR = '';
let codeCast = '';
let early: any;

before(async () => {
  w = new World({ seed: 'spoilsh', n: 3, t: 2, voters: 5, spoilTrustees: true });
  await w.start();
  await w.setupOrgAndElection();
  await w.registerVoters();
  assert.equal((await w.publishManifest()).status, 201);
  await w.ceremony();
  await w.open();
  for (let i = 0; i < 4; i++) assert.equal((await w.cast(i, sel(i))).status, 201);
  assert.equal((await w.spoil(4, { budget: ['yes'], chair: ['bob'] }, 'trustees')).status, 201);
  assert.equal((await w.spoil(3, { budget: ['no'], chair: ['ann'] }, 'publish')).status, 201);
  const an0 = await w.analysis();
  for (const [c, r] of an0.spoiled) (r.env.reveal === undefined ? (codeT = c) : (codeR = c));
  codeCast = an0.counted[0]!.code;
  early = await w.spoilShareRecord(1, codeT);
}, { timeout: 300_000 });
after(async () => {
  await w.stop();
});

test('before election-close: 409 WRONG_PHASE', async () => {
  const r = await w.postSpoilShare(early);
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'WRONG_PHASE');
});

test('close; adversarial submissions are refused', async () => {
  assert.equal((await w.close()).status, 201);
  const post = (rec: unknown) => w.postSpoilShare(rec);
  // wrong signer (trustee 2 signs a record that claims j=1)
  assert.equal((await post(await w.spoilShareRecord(1, codeT, undefined, 2))).status, 422);
  // wrong ctx for the signature scope
  assert.equal((await post(await w.spoilShareRecord(1, codeT, undefined, 1, new Uint8Array(32).fill(7)))).status, 422);
  // wrong ctx in the body
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.ctx = '11'.repeat(32); }))).status, 422);
  // bad proof (flip a response scalar by swapping c and s) with a valid signature
  const bad = await w.spoilShareRecord(1, codeT, (b) => { const x = b.shares[0]; [x.c, x.s] = [x.s, x.c]; });
  const rb = await post(bad);
  assert.equal(rb.status, 422);
  assert.equal(rb.json.reason, 'E_DEC_PROOF');
  // swapped M between options
  const sw = await w.spoilShareRecord(1, codeT, (b) => { [b.shares[0].M, b.shares[1].M] = [b.shares[1].M, b.shares[0].M]; });
  assert.equal((await post(sw)).status, 422);
  // missing / duplicated share
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.shares.pop(); }))).status, 422);
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.shares[1] = b.shares[0]; }))).status, 422);
  // wrong spoil_seq
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.spoil_seq += 1; }))).status, 422);
  // a cast code and an unknown code
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.code = codeCast; }))).status, 404);
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.code = 'ab'.repeat(32); }))).status, 404);
  // reveal-mode code
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.code = codeR; }))).status, 422);
  // trustee index out of range / garbage
  assert.equal((await post(await w.spoilShareRecord(1, codeT, (b) => { b.j = 9; }))).status, 403);
  assert.equal((await post({ nope: 1 })).status, 422);
  // nothing was stored
  const l = await w.get(`/api/v1/elections/${w.electionId}/spoil-shares`);
  assert.deepEqual(l.json.items, []);
});

test('fewer than t shares: spoil omitted from the draft; replay and conflicting duplicate handled', async () => {
  const a = await w.spoilShareRecord(1, codeT);
  assert.equal((await w.postSpoilShare(a)).status, 201);
  const again = await w.postSpoilShare(a);
  assert.equal(again.status, 200);
  assert.equal(again.json.status, 'duplicate');
  // same trustee, different (re-proved) record for the same code
  const second = await w.spoilShareRecord(1, codeT);
  assert.equal((await w.postSpoilShare(second)).status, 409);
  for (const j of [1, 3]) assert.equal((await w.trusteeShares(j)).status, 201);
  const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
  assert.deepEqual(draft.json.body.spoiled.map((s: any) => s.mode), ['reveal']);
  const gl = await w.get(`/api/v1/elections/${w.electionId}/spoil-shares?code=${codeT}`);
  assert.deepEqual(gl.json.items.map((x: any) => x.j), [1]);
});

test('t shares: tally posted with spoiled shares, verifyElection passes chk.benaloh.spoiled', { timeout: 300_000 }, async () => {
  assert.equal((await w.postSpoilShare(await w.spoilShareRecord(3, codeT))).status, 201);
  assert.equal((await w.postSpoilShare(await w.spoilShareRecord(2, codeT))).status, 201);
  const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
  const sp = draft.json.body.spoiled.find((s: any) => s.mode === 'trustees');
  assert.deepEqual(sp.selections, { budget: ['yes'], chair: ['bob'] });
  assert.deepEqual([...new Set(sp.shares.map((x: any) => x.j))], [1, 2]); // exactly the t lowest valid trustee sets
  assert.equal(sp.shares.length, 10); // 5 options x 2 trustees
  const c0 = w.coord[0]!;
  assert.equal((await w.post('tally_result', c0, signRecord(c0.secretKey, c0.publicKey, w.params.ctx, draft.json.body))).status, 201);
  // after the tally is posted, no more spoil shares
  assert.equal((await w.postSpoilShare(await w.spoilShareRecord(1, codeT))).status, 409);
  assert.equal((await w.post('audit_close', c0, w.control('audit-close'))).status, 201);
  const ex = await w.get(`/api/v1/elections/${w.electionId}/export.json`);
  const rep = await verifyElectionText(ex.text);
  assert.equal(rep.verdict, 'PASS', JSON.stringify(rep.findings.filter((f) => f.cls === 'F')));
  assert.equal(rep.counts.spoiled, 2);
  assert.equal(rep.checks['chk.benaloh.spoiled'], 'pass');
  assert.deepEqual(Object.values(rep.checks).filter((c) => c === 'fail'), []);
});
