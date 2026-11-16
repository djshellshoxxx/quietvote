// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex } from '@quietvote/crypto';
import { expectedLogId } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { exportQvb } from '../../server/test/helpers/full.ts';
import { qv, spawnQv, tmp } from './helpers.ts';

test('draft-record executable generates each ceremony, roll, open and close body from an authenticated archive', { timeout: 180_000 }, async () => {
  const w = new World({ seed: 'cli-lifecycle-drafts', n: 3, t: 2, voters: 3 });
  w.owner = w.coord[0]!; // Existing archive author policy; separate-organizer support remains held.
  await w.start();
  let serial = 0;
  const file = (name: string) => join(w.dir, `${serial++}-${name}`);
  const snapshots = new Map<string, string>();
  const snapshot = async () => { const path = file('archive.qvb'); writeFileSync(path, await exportQvb(w)); return path; };
  const draft = (archive: string, kind: string, out = file('draft.json'), pin = bytesToHex(w.mh)) => ({
    out, result: spawnQv(['election', 'draft-record', archive, '--manifest-hash', pin, '--kind', kind, '--out', out, '--json']),
  });
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    const build = w.buildManifest.bind(w);
    w.buildManifest = () => { const m = build(); m.bb.log_id = expectedLogId(w.origin); return m; };
    assert.equal((await w.publishManifest()).status, 201);
    const nativePost = w.post.bind(w);
    const generated: string[] = [];
    let checkedKeyconfFloor = false;
    w.post = async (type, who, record, election, origin) => {
      const body = (record as { body?: { type: string; name?: string } })?.body;
      if (body?.type === 'dkg-keyconf' && !checkedKeyconfFloor) {
        checkedKeyconfFloor = true;
        const { result, out } = draft(await snapshot(), 'dkg-final');
        assert.equal(result.code, 1, result.err);
        assert.match(result.err, /timely verified trustee key confirmations/);
        assert.equal(existsSync(out), false);
      }
      if (body?.type === 'marker' || body?.type === 'roll-commit') {
        const kind = body.type === 'marker' ? body.name! : body.type;
        const archive = await snapshot(); snapshots.set(kind, archive);
        const { result, out } = draft(archive, kind);
        assert.equal(result.code, 0, result.err);
        const summary = JSON.parse(result.out);
        assert.equal(summary.signed, false); assert.equal(summary.admitted, false);
        assert.equal(summary.witness_quorum_verified, false); assert.equal(summary.freshness_verified, false);
        if (kind === 'roll-commit') assert.equal(summary.roll_source, 'uncommitted-proposal');
        assert.equal(summary.entry_type, type);
        const actual = JSON.parse(readFileSync(out, 'utf8'));
        assert.deepEqual(actual, body, kind);
        if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
        const preserved = readFileSync(out);
        assert.equal(draft(archive, kind, out).result.code, 4, 'existing outputs cannot be overwritten');
        assert.deepEqual(readFileSync(out), preserved);
        generated.push(kind);
      }
      return nativePost(type, who, record, election, origin);
    };
    await w.ceremony();
    assert.equal((await w.open()).status, 201);
    assert.equal((await w.close()).status, 201);
    assert.deepEqual(generated, ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final', 'roll-commit', 'election-open', 'election-close']);
    assert.equal(checkedKeyconfFloor, true);
    for (const [snapshotKind, requested] of [['dkg-open', 'dkg-r1-open'], ['dkg-r1-open', 'dkg-open'], ['election-open', 'roll-commit'], ['election-close', 'election-open']]) {
      const { result, out } = draft(snapshots.get(snapshotKind!)!, requested!);
      assert.equal(result.code, 1, result.err); assert.equal(existsSync(out), false);
    }
    const afterClose = draft(await snapshot(), 'election-close');
    assert.equal(afterClose.result.code, 1); assert.equal(existsSync(afterClose.out), false);
    const badPin = draft(snapshots.get('dkg-open')!, 'dkg-open', file('pin.json'), '00'.repeat(32));
    assert.equal(badPin.result.code, 1); assert.equal(existsSync(badPin.out), false);
    const corrupt = file('corrupt.qvb'), bytes = readFileSync(snapshots.get('dkg-final')!);
    bytes[512] = bytes[512]! ^ 1; writeFileSync(corrupt, bytes);
    const damaged = draft(corrupt, 'dkg-final');
    assert.equal(damaged.result.code, 4); assert.equal(existsSync(damaged.out), false);
  } finally { await w.stop(); }
});

test('draft-record rejects malformed invocation before touching the input or output', async () => {
  const dir = tmp(), output = join(dir, 'output.json');
  try {
    const args = ['election', 'draft-record', '/missing.qvb', '--kind', 'dkg-open', '--out', output];
    assert.equal((await qv(args)).code, 2, 'manifest pin is mandatory');
    assert.equal((await qv([...args, '--manifest-hash', 'AB'.repeat(32)])).code, 2);
    assert.equal((await qv([...args, '--manifest-hash', 'ab'.repeat(32), '--kind', 'dkg-open'])).code, 2);
    assert.equal((await qv(['election', 'draft-record', '/missing.qvb', '--manifest-hash', 'ab'.repeat(32), '--kind', 'arbitrary', '--out', output])).code, 2);
    assert.equal(existsSync(output), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
