// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-18-REQ-032
// Real HTTP election/export. It must retain strict failures, never filter derived records to manufacture PASS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundleToJson, readChecksummedArchive } from '@quietvote/board';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { expectedLogId, logOrigin, signRecord, type Manifest } from '@quietvote/protocol';
import { loadBundle, verifyBundle } from '@quietvote/verifier';
import { electionBundle, logBundle, qvb } from '../src/export.ts';
import { World } from './helpers/world.ts';

class BoundWorld extends World {
  override buildManifest(): Manifest {
    const manifest = super.buildManifest();
    manifest.bb.log_id = expectedLogId(logOrigin(manifest));
    return manifest;
  }
}

test('archive: real server export equals full-board JSON before and after stored body redaction', { timeout: 120_000 }, async (t) => {
  const world = new BoundWorld({ seed: 'verifier-qvb-export', n: 3, t: 2, voters: 3, witnessQuorum: 0, freshConnections: true });
  await world.start();
  try {
    await world.setupOrgAndElection(); await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201);
    await world.ceremony(); assert.equal((await world.open()).status, 201);
    for (let i = 0; i < 3; i++) assert.equal((await world.cast(i, { budget: [i ? 'no' : 'yes'], chair: ['ann'] })).status, 201);
    assert.equal((await world.close()).status, 201);
    for (const index of [1, 3]) { assert.equal((await world.trusteeShares(index)).status, 201); world.tick(); }
    const path = `/api/v1/elections/${world.electionId}`;
    const draft = await world.get(`${path}/tally/draft?decrypters=1,3`), coordinator = world.coord[0]!;
    assert.equal(draft.status, 200);
    assert.equal((await world.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, world.params.ctx, draft.json.body))).status, 201);
    assert.equal((await world.post('audit_close', coordinator, world.control('audit-close'))).status, 201);
    const runtime = (await world.server.pool.get(world.electionId))!;
    const response = await fetch(world.base + path + '/export.qvb', { headers: { connection: 'close' } });
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(bytes, qvb(runtime), 'the HTTP route emits the actual server writer output');
    const content = electionBundle(runtime, { includeBoardRecords: true });
    const board = bundleToJson(logBundle(runtime));
    const files = readChecksummedArchive(bytes, { maxFiles: 1000 });
    const filtered = JSON.parse(new TextDecoder().decode(files.get('election.json')!));
    assert.ok(filtered.log.length < content.log.length, 'the convenience export really omits derived records');
    const loaded = loadBundle(bytes);
    assert.ok(loaded.ok, JSON.stringify(loaded));
    assert.deepEqual(jcs(loaded.value.election), jcs(content));
    assert.deepEqual(jcs(loaded.value.boardJson), jcs(board));
    const derived = content.log.filter((row) => ['tally-aggregate', 'dec-shares'].includes((row.entry as { body: { type: string } }).body?.type));
    assert.ok(derived.length >= 3, 'aggregate and both decryption records are present');
    // These are independently held fixture keys, not keys trusted because the archive contained them.
    for (const extraAuthorKeys of [[], [bytesToHex(world.owner.publicKey), bytesToHex(runtime.srvPk)]]) {
      const options = { pinnedManifestHash: content.manifest_hash, extraAuthorKeys };
      const report = await verifyBundle(bytes, options);
      assert.deepEqual(report, await verifyBundle(JSON.stringify({ ...content, board }), options));
      assert.equal(report.chk['chk.encoding.canonical'], 'fail', 'existing derived-record policy stays visible');
      for (const entry of derived) assert.ok(report.findings.some((finding) => finding.seq === entry.seq && finding.code === 'E_VERSION'));
      assert.notEqual(report.verdict, 'PASS', 'this zero-witness snapshot does not establish full verification');
    }

    // Exercise the existing SQLite primitive through an explicit maintenance writer. There is no body-retention
    // scheduler/HTTP workflow under test here; the fixture chooses an archived, older-than-retention snapshot.
    const before = logBundle(runtime), reader = runtime.edb.db;
    const cast = content.log.find((row) => (row.entry as { intent?: string }).intent === 'cast')!;
    world.clock += 366 * 24 * 60 * 60 * 1000; // also expires the route's existing ten-minute artifact cache
    const clock = t.mock.method(Date, 'now', () => world.clock);
    try { runtime.edb.withMaintenance('retention', (writer) => writer.tx(() => writer.store.redactBody(cast.seq))); }
    finally { clock.mock.restore(); }
    assert.equal(runtime.edb.db, reader); assert.equal(runtime.edb.readOnly, true);
    const after = logBundle(runtime);
    assert.equal(after.entries[cast.seq]!.body, null);
    assert.deepEqual(after.entries.map((entry) => entry.headerBytes), before.entries.map((entry) => entry.headerBytes));
    assert.equal(after.treeSize, before.treeSize); assert.deepEqual(after.root, before.root);
    assert.deepEqual(after.checkpoints, before.checkpoints);
    const redactedResponse = await fetch(world.base + path + '/export.qvb', { headers: { connection: 'close' } });
    assert.equal(redactedResponse.status, 200);
    const redactedBytes = new Uint8Array(await redactedResponse.arrayBuffer());
    assert.deepEqual(redactedBytes, qvb(runtime));
    const redactedContent = electionBundle(runtime, { includeBoardRecords: true }), redactedBoard = bundleToJson(after);
    const redactedLoad = loadBundle(redactedBytes);
    assert.ok(redactedLoad.ok, JSON.stringify(redactedLoad));
    assert.deepEqual(redactedLoad.value.board, after);
    assert.deepEqual(jcs(redactedLoad.value.election), jcs(redactedContent));
    assert.ok(!redactedContent.log.some((row) => row.seq === cast.seq));
    const options = { pinnedManifestHash: content.manifest_hash, extraAuthorKeys: [bytesToHex(world.owner.publicKey), bytesToHex(runtime.srvPk)] };
    const report = await verifyBundle(redactedBytes, options);
    assert.equal(report.board?.redacted, 1); assert.equal(report.board?.integrity, 'PARTIAL');
    assert.notEqual(report.verdict, 'PASS');
    assert.deepEqual(report, await verifyBundle(JSON.stringify({ ...redactedContent, board: redactedBoard }), options));
    assert.deepEqual(report, await verifyBundle({ ...redactedContent, board: redactedBoard }, options));
  } finally { await world.stop(); }
});
