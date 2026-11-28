// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-09-REQ-010, QV-28-REQ-015
// Independent review regression: real signed appends, real outbox bridge, test-only storage interruptions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { WebhookRequest } from '../src/ssrf.ts';
import { World } from './helpers/world.ts';
import { fullElection } from './helpers/full.ts';

for (const mode of ['registry', 'archive-erasure'] as const) test(`post-commit ${mode} failure must retire the incomplete runtime before recovery publication`, async t => {
  let w!: World, path = '';
  const delivered: { to: string; keysPresent: boolean; registry: string }[] = [];
  const server = { retentionSweepMs: 0,
    webhookResolver: async () => [{ address: '93.184.216.34', family: 4 as const }],
    webhookTransport: async (request: WebhookRequest) => {
      const payload = JSON.parse(request.body.toString('utf8')) as { data: { to: string } };
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        const row = db.prepare('SELECT log_sk_enc,srv_sk_enc FROM election').get()!;
        delivered.push({ to: payload.data.to, keysPresent: row['log_sk_enc'] !== null || row['srv_sk_enc'] !== null,
          registry: w.server.env.control.election(w.electionId)!.state });
      } finally { db.close(); }
      return { status: 200, truncated: false };
    },
  };
  if (mode === 'registry') {
    w = new World({ seed: 'review-outbox-registry-return', n: 3, t: 2, voters: 0, server });
    await w.start(); await w.setupOrgAndElection();
  } else w = await fullElection('review-outbox-archive-return', { stopAt: 'AUDIT', server });
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    const hook = await w.signed('POST', `/api/v1/orgs/${w.orgId}/webhooks`, {
      url: 'https://hooks.example.com/qv', events: ['phase'], election_id: w.electionId,
    }, w.owner, w.idemKey());
    assert.equal(hook.status, 201, hook.text);
    let reached = false;
    const sync = w.server.env.control.setState.bind(w.server.env.control), erase = rt.edb.eraseKeys.bind(rt.edb);
    if (mode === 'registry') w.server.env.control.setState = (...args) => {
      if (args[1] === 'SETUP') { reached = true; throw new Error('test-only registry write refusal'); }
      return sync(...args);
    };
    else rt.edb.eraseKeys = () => { erase(); reached = true; throw new Error('test-only erasure transaction rollback'); };
    const response = mode === 'registry' ? await w.publishManifest() : await w.post('audit_close', w.coord[0]!, w.control('audit-close'));
    w.server.env.control.setState = sync; rt.edb.eraseKeys = erase;
    assert.equal(reached, true); assert.equal(response.status, 500);
    const before = { poisoned: rt.poisoned, persisted: rt.edb.row().state,
      registry: w.server.env.control.election(w.electionId)!.state, intent: rt.edb.hasAppendCompletions(),
      keysPresent: rt.edb.row().log_sk_enc !== null, physicalReader: rt.edb.readOnly };
    const entry = rt.edb.store.getEntry(rt.log.size - 1)!;
    const acquired = (await w.server.pool.get(w.electionId))!;
    const retry = await w.submit(entry.headerBytes, entry.body!);
    await w.server.webhooks.idle();
    const after = { sameHandle: acquired === rt, retryStatus: retry.status,
      registry: w.server.env.control.election(w.electionId)!.state, intent: acquired.edb.hasAppendCompletions(),
      keysPresent: acquired.edb.row().log_sk_enc !== null, physicalReader: acquired.edb.readOnly, delivered };
    t.diagnostic(JSON.stringify({ mode, before, after }));
    assert.equal(before.poisoned, true, 'post-commit application/registry failure must force replay before exposing the cached handle');
    assert.equal(after.sameHandle, false);
    assert.equal(retry.status, 200, retry.text);
    assert.equal(after.intent, false);
    assert.equal(after.registry, mode === 'registry' ? 'SETUP' : 'ARCHIVED');
    assert.deepEqual(delivered.map(event => event.to), [mode === 'registry' ? 'SETUP' : 'ARCHIVED'],
      'the real outbox bridge must deliver the recovered phase exactly once');
    if (mode === 'archive-erasure') {
      assert.equal(after.keysPresent, false); assert.equal(after.physicalReader, true);
      assert.ok(delivered.every(event => !event.keysPresent && event.registry === 'ARCHIVED'));
      // Recovery loads a signer before finishing erasure. A subsequent clean archive open has no key.
      await w.server.pool.evict(w.electionId);
      const keyless = (await w.server.pool.get(w.electionId))!;
      assert.equal(keyless.edb.readOnly, true);
      const keylessRetry = await w.submit(entry.headerBytes, entry.body!);
      assert.equal(keylessRetry.status, 503, keylessRetry.text);
      assert.equal(keylessRetry.json.code, 'LOG_UNAVAILABLE');
      await w.server.webhooks.idle();
      assert.equal(delivered.length, 1, 'clean archive reload never replays an already forwarded phase');
    } else assert.ok(delivered.every(event => event.registry === 'SETUP'));
  } finally { await w.stop(); }
});
