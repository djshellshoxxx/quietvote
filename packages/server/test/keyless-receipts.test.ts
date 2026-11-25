// Recover the B2-12 behavior from historical 13b86c2 without its unrelated migration/control changes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCheckpoint, verifyLogSignature } from '@quietvote/board';
import { ed25519Keypair } from '@quietvote/crypto';
import { exportQvb, fullElection, importAndWait } from './helpers/full.ts';
import { World } from './helpers/world.ts';

test('keyless archived and imported runtimes refuse receipt reissuance over HTTP', { timeout: 240_000 }, async (t) => {
  const source = await fullElection('keyless-source');
  t.after(() => source.stop());
  const id = source.electionId;
  const archive = await exportQvb(source);
  const records = await source.get(`/api/v1/elections/${id}/log/entries?from=0&limit=1000`);
  assert.equal(records.status, 200, records.text);
  const entries = records.json.entries as { header_b64u: string; body_b64u: string }[];
  const entry = entries[1]!;
  const resubmit = (world: World) => world.req('POST', `/api/v1/elections/${id}/log/entries`, { header: entry.header_b64u, body: entry.body_b64u });
  const zeroPublicKey = ed25519Keypair(new Uint8Array(32)).publicKey;

  async function assertKeyless(world: World): Promise<void> {
    const runtime = (await world.server.pool.get(id))!;
    assert.equal(runtime.edb.row().log_sk_enc, null, 'the persistent log signing key is absent');
    const response = await resubmit(world);
    assert.equal(response.status, 503, response.text);
    assert.equal(response.json.code, 'LOG_UNAVAILABLE');
    assert.equal(response.json.receipt, undefined);
    assert.equal(runtime.log.size, entries.length, 'a duplicate did not append anything');
    const direct = runtime.log.getReceipt(1);
    assert.ok(!direct.ok && direct.error.code === 'QV_BOARD_READ_ONLY');
    const checkpoint = await world.get(`/api/v1/elections/${id}/log/checkpoint`);
    assert.equal(checkpoint.status, 200, checkpoint.text);
    const parsed = parseCheckpoint(checkpoint.text);
    assert.ok(parsed.ok && verifyLogSignature(parsed.value, runtime.logPk));
    assert.ok(parsed.ok && !verifyLogSignature(parsed.value, zeroPublicKey));
    const proof = runtime.log.inclusionProof(1);
    assert.ok(proof.ok, 'stored inclusion evidence remains available');
    const late = await world.post('notice', source.coord[0]!, source.control('security-notice'), id, source.origin);
    assert.ok(late.status === 409 || late.status === 503, late.text);
    assert.equal(runtime.log.size, entries.length);
  }

  await t.test('reloaded archived source has no replacement signing key', async () => {
    assert.equal((await source.get(`/api/v1/elections/${id}/state`)).json.phase, 'ARCHIVED');
    await source.server.pool.closeAll();
    await assertKeyless(source);
  });
  await t.test('imported mirror never signs using the zero seed', async () => {
    const mirror = new World({ seed: 'keyless-mirror', n: 3, t: 2, voters: 1, witnessQuorum: 0 });
    t.after(() => mirror.stop());
    await mirror.start();
    await mirror.setupOrgAndElection();
    const imported = await importAndWait(mirror, archive);
    assert.equal(imported.state, 'done', JSON.stringify(imported));
    assert.equal((await mirror.server.pool.get(id))!.imported, true);
    await assertKeyless(mirror);
  });
});
