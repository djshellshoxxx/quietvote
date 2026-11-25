// An export receipt cannot override independent rollback evidence during deletion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex } from '@quietvote/crypto';
import { assertArchiveExportReady } from '../src/public-exports.ts';
import { fullElection, waitJob } from './helpers/full.ts';
import { kp } from './helpers/world.ts';

test('a matching acknowledged ARCHIVED export cannot authorize deletion behind an independent rollback floor', { timeout: 120_000 }, async () => {
  const admin = kp('archive-rollback-delete', 'admin');
  const w = await fullElection('archive-rollback-delete', { server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  try {
    const path = `/api/v1/elections/${w.electionId}`;
    const request = await w.signed('POST', `${path}/exports`, { kind: 'public' }, w.owner, w.idemKey());
    assert.equal(request.status, 202, request.text);
    const job = await waitJob(w, request.json.job_id);
    assert.equal(job.state, 'done');
    const record = (await w.signed('GET', job.result_ref)).json;
    const ack = await w.signed('POST', record.acknowledgement_url,
      { tree_size: record.tree_size, root_hash: record.root_hash, sha256: record.sha256 }, w.owner, w.idemKey());
    assert.equal(ack.status, 200, ack.text);
    await w.server.pool.assertDeletable(w.electionId); // Positive control: the final archive is otherwise deletable.
    const rt = (await w.server.pool.get(w.electionId))!;
    const reg = w.server.env.control.election(w.electionId)!;
    // Fault injection models a restored older election file beside a newer independent control floor.
    assert.equal(w.server.env.control.raiseRuntimeAnchor(w.electionId, rt.origin, rt.logPk,
      rt.log.size + 1, new Uint8Array(32).fill(7)), 'advanced');
    await w.server.pool.evict(w.electionId);
    const restored = (await w.server.pool.get(w.electionId))!;
    assert.equal(restored.logState, 'ARCHIVED');
    assert.ok(restored.quarantineReason());
    assert.doesNotThrow(() => assertArchiveExportReady(restored), 'archive and acknowledgement still match the older tree');
    await assert.rejects(w.server.pool.assertDeletable(w.electionId), /quarantined/);
    for (const [target, signer] of [[path, w.owner], [`/api/v1/admin/elections/${w.electionId}`, admin]] as const) {
      const refusal = await w.signed('DELETE', target, { confirm: reg.title }, signer, w.idemKey());
      assert.equal(refusal.status, 503, refusal.text);
      assert.equal(refusal.json.code, 'QUARANTINED');
    }
    await assert.rejects(w.server.pool.remove(w.electionId), /quarantined/);
    assert.ok(existsSync(join(w.dir, reg.db_path)));
    assert.ok(w.server.env.control.election(w.electionId)?.dek_wrapped);
    assert.equal(w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM job WHERE kind='delete'").get()?.['n'], 0);
    assert.equal((await w.signed('GET', job.result_ref)).status, 200, 'forensic export metadata remains readable');
  } finally { await w.stop(); }
});
