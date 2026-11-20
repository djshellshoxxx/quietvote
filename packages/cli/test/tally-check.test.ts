// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cosignLine } from '@quietvote/board';
import { bytesToHex, jcs, sha256 } from '@quietvote/crypto';
import { expectedLogId } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { qv, spawnQv, tmp, writeJson } from './helpers.ts';

async function witness(w: World): Promise<void> {
  const cp = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`);
  assert.equal(cp.status, 200, cp.text);
  const text = cp.text.slice(0, cp.text.indexOf('\n\n') + 1), key = w.witnesses[0]!;
  const response = await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, {
    checkpoint_size: Number(cp.text.split('\n')[1]),
    lines: [cosignLine('w1', key.secretKey, key.publicKey, text, w.nowSec)],
  });
  assert.equal(response.status, 200, response.text);
}

async function fixture(quorum: number) {
  const w = new World({ seed: `cli-tally-check-${quorum}`, n: 3, t: 2, voters: 3,
    witnessQuorum: quorum, freshConnections: true });
  // Keep the archive preparer's existing manifest-author boundary explicit.
  w.owner = w.coord[0]!;
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    const build = w.buildManifest.bind(w);
    w.buildManifest = () => {
      const m = build(); m.bb.log_id = expectedLogId(w.origin);
      if (quorum) m.bb.witnesses = [{ name: 'w1', pk: bytesToHex(w.witnesses[0]!.publicKey) }];
      return m;
    };
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    if (quorum) await witness(w);
    assert.equal((await w.open()).status, 201);
    if (quorum) await witness(w);
    for (let i = 0; i < 3; i++) assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    if (quorum) await witness(w);
    assert.equal((await w.close()).status, 201);
    for (const j of [1, 2]) { assert.equal((await w.trusteeShares(j)).status, 201); w.tick(); }
    const draft = join(w.dir, 'proposal.json');
    const fetched = await qv(['online', 'election-tally-draft', '--server', w.base, '--id', w.electionId,
      '--decrypters', '1,2', '--out', draft, '--json']);
    assert.equal(fetched.code, 0, fetched.err);
    assert.equal(JSON.parse(fetched.out).verified, false);
    const archive = async (name: string) => {
      const response = await fetch(`${w.base}/api/v1/elections/${w.electionId}/export.qvb`, { headers: { connection: 'close' } });
      assert.equal(response.status, 200);
      const path = join(w.dir, name);
      writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
      return path;
    };
    return { w, draft, archive, options: ['--manifest-hash', bytesToHex(w.mh), '--draft', draft] };
  } catch (error) { await w.stop(); throw error; }
}

test('check-tally compares a real closed snapshot and requires its declared witness coverage', { timeout: 120_000 }, async () => {
  const { w, draft, archive, options } = await fixture(1);
  try {
    // A normal export while the close checkpoint awaits its required cosignature.
    const pending = await archive('awaiting-witness.qvb');
    const pendingResult = await qv(['election', 'check-tally', pending, ...options, '--json']);
    assert.equal(pendingResult.code, 1, pendingResult.err + pendingResult.out);
    const incomplete = JSON.parse(pendingResult.out);
    assert.equal(incomplete.verdict, 'FAIL');
    assert.equal(incomplete.checks['chk.board.witness'], 'fail');
    assert.ok(incomplete.findings.some((finding: { code: string }) => finding.code === 'E_TIME_WINDOW'));
    assert.equal((await qv(['election', 'check-tally', pending, ...options, '--content-only', '--json'])).code, 1);

    await witness(w);
    const path = await archive('witnessed.qvb'), before = readFileSync(path), draftBefore = readFileSync(draft);
    const checked = spawnQv(['election', 'check-tally', path, ...options, '--json']);
    assert.equal(checked.code, 0, checked.err + checked.out);
    const report = JSON.parse(checked.out);
    assert.equal(report.verdict, 'MATCH');
    assert.equal(report.scope, 'tally-draft');
    assert.equal(report.bodyMatchesSnapshot, true);
    assert.equal(report.published, false);
    assert.equal(report.freshnessVerified, false);
    assert.equal(report.checks['chk.board.witness'], 'pass');
    assert.equal(report.checks['chk.time.window'], 'pass');
    assert.equal(report.snapshot.origin, w.origin);
    assert.match(report.snapshot.root_hash, /^[0-9a-f]{64}$/);
    assert.ok(report.snapshot.tree_size > 0);
    assert.equal(report.draft_body_sha256, bytesToHex(sha256(jcs(JSON.parse(draftBefore.toString('utf8'))))));
    assert.deepEqual(readFileSync(path), before);
    assert.deepEqual(readFileSync(draft), draftBefore);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'TALLYING');
    const wrongPin = await qv(['election', 'check-tally', path, '--manifest-hash', '00'.repeat(32), '--draft', draft]);
    assert.equal(wrongPin.code, 1, wrongPin.err);
  } finally { await w.stop(); }
});

test('check-tally keeps zero-witness results incomplete unless content-only is explicit', { timeout: 120_000 }, async () => {
  const { w, archive, options } = await fixture(0);
  try {
    const path = await archive('no-witness.qvb');
    const strict = await qv(['election', 'check-tally', path, ...options, '--json']);
    assert.equal(strict.code, 3, strict.err + strict.out);
    const report = JSON.parse(strict.out);
    assert.equal(report.verdict, 'INCOMPLETE');
    assert.equal(report.bodyMatchesSnapshot, true);
    assert.equal(report.checks['chk.board.witness'], 'not_run');
    const content = await qv(['election', 'check-tally', path, ...options, '--content-only']);
    assert.equal(content.code, 0, content.err + content.out);
    assert.match(content.out, /tally draft MATCH/);
    assert.match(content.out, /CONTENT-ONLY/);
    assert.match(content.out, /NOT WITNESSED/);
    assert.ok(content.out.includes(w.origin));
    assert.match(content.out, /publication and freshness remain unchecked/);
  } finally { await w.stop(); }
});

test('check-tally requires a pin and bounds its public proposal input', async () => {
  const dir = tmp();
  try {
    const draft = writeJson(dir, 'draft.json', {}), archive = join(dir, 'archive.qvb');
    const invoke = (path: string) => qv(['election', 'check-tally', archive, '--manifest-hash', '00'.repeat(32), '--draft', path]);
    assert.equal((await qv(['election', 'check-tally', archive, '--draft', draft])).code, 2);
    truncateSync(draft, 1024 * 1024 + 1);
    assert.equal((await invoke(draft)).code, 4);
    writeFileSync(draft, '{');
    assert.equal((await invoke(draft)).code, 4);
    assert.equal((await invoke(dir)).code, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
