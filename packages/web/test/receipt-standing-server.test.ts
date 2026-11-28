// SPDX-License-Identifier: AGPL-3.0-or-later
// Ordinary final-server exports remain deliberately UNVERIFIED until the derived-record/author contract is adopted.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cosignLine } from '@quietvote/board';
import { bytesToHex, hexToBytes } from '@quietvote/crypto';
import { expectedLogId, signRecord, verifyElection } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { ApiClient } from '../src/api/client.ts';
import { lookupBallotCode } from '../src/flow/receipt-code.ts';
import { verifyReceiptStanding } from '../src/flow/receipt-standing.ts';

async function witness(world: World): Promise<void> {
  const checkpoint = await world.get(`/api/v1/elections/${world.electionId}/log/checkpoint`);
  assert.equal(checkpoint.status, 200, checkpoint.text);
  const text = checkpoint.text.slice(0, checkpoint.text.indexOf('\n\n') + 1), key = world.witnesses[0]!;
  const response = await world.req('POST', `/api/v1/elections/${world.electionId}/log/cosignatures`, {
    checkpoint_size: Number(checkpoint.text.split('\n')[1]), lines: [cosignLine('w1', key.secretKey, key.publicKey, text, world.nowSec)],
  });
  assert.equal(response.status, 200, response.text);
}

test('real witnessed server tally preserves code inclusion but refuses unsupported derived-record standing', { timeout: 120_000 }, async () => {
  const world = new World({ seed: 'web-standing-real-server', n: 3, t: 2, voters: 3, witnessQuorum: 1, freshConnections: true });
  world.owner = world.coord[0]!;
  await world.start();
  try {
    await world.setupOrgAndElection(); await world.registerVoters();
    const original = world.buildManifest.bind(world);
    world.buildManifest = () => {
      const manifest = original(); manifest.bb.log_id = expectedLogId(world.origin);
      manifest.bb.witnesses = [{ name: 'w1', pk: bytesToHex(world.witnesses[0]!.publicKey) }]; return manifest;
    };
    assert.equal((await world.publishManifest()).status, 201); await world.ceremony(); await witness(world);
    assert.equal((await world.open()).status, 201); await witness(world);
    for (let voter = 0; voter < 3; voter++) assert.equal((await world.cast(voter, { budget: ['yes'], chair: ['ann'] })).status, 201);
    await witness(world); assert.equal((await world.close()).status, 201);
    for (const trustee of [1, 2]) { assert.equal((await world.trusteeShares(trustee)).status, 201); world.tick(); }
    await witness(world);
    const draft = await world.get(`/api/v1/elections/${world.electionId}/tally/draft?decrypters=1,2`); assert.equal(draft.status, 200, draft.text);
    const coordinator = world.coord[0]!;
    assert.equal((await world.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, world.params.ctx, draft.json.body))).status, 201);
    await witness(world);
    const requests: { method: string; authorization: string | null }[] = [];
    const api = new ApiClient({ baseUrl: world.base, fetch: async (input, init) => {
      requests.push({ method: init?.method ?? 'GET', authorization: new Headers(init?.headers).get('Authorization') });
      return fetch(input, init);
    } });
    const code = world.last.get(bytesToHex(world.voters[0]!.publicKey))!;
    const included = await lookupBallotCode({ input: code, api, apiElectionId: world.electionId, ctx: world.params.ctx,
      logPk: hexToBytes(world.manifest.bb.log_pk, 32), expectedOrigin: world.origin, pinned: undefined });
    assert.equal(included.state, 'included');
    const text = await api.receiptStatusBundle(world.electionId, new AbortController().signal);
    const serverKey = bytesToHex((await world.server.pool.get(world.electionId))!.srvPk);
    const bundle = JSON.parse(text);
    const report = await verifyElection(bundle, { log: { board: bundle.board, extraAuthorKeys: [serverKey] } });
    assert.equal(report.verdict, 'PASS'); assert.equal(report.checks['chk.board.append_only'], 'pass'); assert.equal(report.checks['chk.board.witness'], 'pass');
    assert.equal(report.checks['chk.encoding.canonical'], 'fail');
    assert.deepEqual(report.findings.filter((finding) => finding.code === 'E_VERSION').map((finding) => finding.detail),
      ['unknown record type tally-aggregate', 'unknown record type dec-shares', 'unknown record type dec-shares']);
    const result = await verifyReceiptStanding(text, { manifestHash: bytesToHex(world.mh), code, seq: included.seq, head: included.head, extraAuthorKeys: [serverKey] });
    assert.equal(result.state, 'unverified'); assert.equal(result.reason, 'failed');
    assert.equal(result.freshnessVerified, false); assert.equal(result.finalityVerified, false);
    assert.ok(requests.every((request) => request.method === 'GET' && request.authorization === null));
  } finally { await world.stop(); }
});
