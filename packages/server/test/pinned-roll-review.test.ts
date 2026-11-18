// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-04-REQ-009, QV-09-REQ-001
// Independent review regressions: local storage integrity and the management authorization boundary.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { b64u } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { parsePinnedRoll } from '../src/pinned-roll.ts';
import { World, kp } from './helpers/world.ts';

test('review: list provisioning requires an authenticated key from the election organization', { timeout: 20_000 }, async () => {
  const w = new World({ seed: 'review-pinned-authorization', n: 3, t: 2, voters: 3, witnessQuorum: 0 });
  try {
    await w.start(); await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const other = kp('review-pinned-authorization', 'other-owner');
    const created = await w.req('POST', '/api/v1/orgs', {
      name: 'Separate organization', owner_key: { pk: b64u(other.publicKey), alg: 'ed25519' },
    }, { key: other, headers: w.idemKey() });
    assert.equal(created.status, 201, created.text);
    const path = `/api/v1/elections/${w.electionId}/pinned-roll`;
    const body = { pinned_roll: w.voters.map((key) => bytesToHex(key.publicKey)).sort() };
    const unsigned = await w.req('PUT', path, body, { headers: w.idemKey() });
    assert.equal(unsigned.status, 401, unsigned.text);
    const crossOrganization = await w.signed('PUT', path, body, other, w.idemKey());
    assert.equal(crossOrganization.status, 404, crossOrganization.text);
    assert.equal(rt.edb.pinnedRoll(), undefined);
    assert.equal(rt.edb.voterCount(), 0);
    assert.equal(rt.log.size, 0);
    const allowed = await w.signed('PUT', path, body, w.owner, w.idemKey());
    assert.equal(allowed.status, 200, allowed.text);
    assert.deepEqual(rt.edb.pinnedRoll()!.keys, body.pinned_roll);
    assert.equal(rt.edb.voterCount(), 0);
    assert.equal(rt.log.size, 0);
  } finally { await w.stop(); }
});

test('review: a stored canonical list cannot disagree with the signed manifest after restart', { timeout: 20_000 }, async () => {
  const w = new World({ seed: 'review-pinned-manifest-binding', n: 3, t: 2, voters: 3, pinnedRoll: true, witnessQuorum: 0 });
  try {
    await w.start(); await w.setupOrgAndElection();
    const published = await w.publishManifest();
    assert.equal(published.status, 201, published.text);
    const relative = w.server.env.control.election(w.electionId)!.db_path;
    const different = parsePinnedRoll(w.coord.map((key) => bytesToHex(key.publicKey)).sort());
    assert.notEqual(different.root, w.manifest.roll.root);
    await w.server.stop();
    const db = new DatabaseSync(join(w.dir, relative));
    try {
      // Simulate corrupted offline storage. No signed manifest or public log bytes change.
      db.exec('DROP TRIGGER pinned_roll_noupdate');
      db.prepare('UPDATE pinned_roll SET root=?,size=?,keys_json=?').run(different.root, different.size, JSON.stringify(different.keys));
    } finally { db.close(); }
    await w.start();
    await assert.rejects(w.server.pool.get(w.electionId), /pinned_roll does not match the signed manifest/);
  } finally { await w.stop(); }
});

test('review: malformed stored membership is rejected before a draft has a manifest', { timeout: 20_000 }, async () => {
  const w = new World({ seed: 'review-pinned-draft-binding', n: 3, t: 2, voters: 3, pinnedRoll: true, witnessQuorum: 0 });
  try {
    await w.start(); await w.setupOrgAndElection();
    const relative = w.server.env.control.election(w.electionId)!.db_path;
    await w.server.stop();
    const db = new DatabaseSync(join(w.dir, relative));
    try {
      db.exec('DROP TRIGGER pinned_roll_noupdate');
      db.prepare('UPDATE pinned_roll SET keys_json=?').run('[]');
    } finally { db.close(); }
    await w.start();
    await assert.rejects(w.server.pool.get(w.electionId), /stored pinned roll is invalid/);
  } finally { await w.stop(); }
});
