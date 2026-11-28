// SPDX-License-Identifier: AGPL-3.0-or-later
// ADR-029: complete authenticated membership remains distinct from invitation enrollment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { authorKeyId, b64u, unb64u } from '@quietvote/board';
import { bytesToHex, hexToBytes, sha256, utf8 } from '@quietvote/crypto';
import { manifestHash, mth, rollLeaf, signRecord, verifyElectionText } from '@quietvote/protocol';
import { parsePinnedRoll } from '../src/pinned-roll.ts';
import { exportQvb, importAndWait } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const path = (w: World, suffix: string) => `/api/v1/elections/${w.electionId}/${suffix}`;
const keysOf = (w: World) => w.voters.map((voter) => bytesToHex(voter.publicKey)).sort();
const kidOf = (publicKey: Uint8Array) => b64u(authorKeyId('ed25519', publicKey));

async function fixture(seed: string, pinnedRoll = true, voters = 4): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters, pinnedRoll, freshConnections: true });
  await w.start(); await w.setupOrgAndElection(); return w;
}
async function issue(w: World, count = 1): Promise<{ invite_id: string; code: string }[]> {
  const result = await w.signed('POST', path(w, 'invites'), { count }, w.owner, w.idemKey());
  assert.equal(result.status, 201, result.text); return result.json.invites;
}
async function attach(w: World, keys = keysOf(w), headers = w.idemKey()) {
  return w.signed('PUT', path(w, 'pinned-roll'), { pinned_roll: keys }, w.owner, headers);
}
async function publish(w: World, body = w.buildManifest()) {
  w.manifest = body; w.mh = manifestHash(body);
  return w.post('manifest', w.owner, w.multi(w.mh, body));
}
/** A real schema9 snapshot: no new table, trigger or migration row survives. */
async function schema9WithoutList(w: World): Promise<void> {
  const relative = w.server.env.control.election(w.electionId)!.db_path;
  await w.server.pool.evict(w.electionId);
  const db = new DatabaseSync(join(w.dir, relative));
  try { db.exec('DROP TABLE export_record; DROP TABLE pinned_roll; ALTER TABLE append_completion DROP COLUMN events_committed; DELETE FROM schema_migration WHERE version>=10; PRAGMA user_version=9'); }
  finally { db.close(); }
}

test('pinned creation validates canonical full lists before mutation and binds exact idempotent retries', async () => {
  const w = await fixture('pinned-create-validation', false, 70);
  try {
    const url = `/api/v1/orgs/${w.orgId}/elections`, keys = keysOf(w), count = w.server.env.control.countElections(w.orgId);
    for (const list of [[], 'not-an-array', [false], [keys[0]!.toUpperCase()], [keys[0], keys[0]], [...keys].reverse(), ['00'.repeat(32)], ['ff'.repeat(32)], ['ab']]) {
      const result = await w.signed('POST', url, { title: 'Invalid', pinned_roll: list }, w.owner, w.idemKey());
      assert.equal(result.status, 422, result.text); assert.equal(result.json.code, 'PINNED_ROLL_INVALID');
      assert.equal(w.server.env.control.countElections(w.orgId), count);
    }
    const headers = w.idemKey(), body = { title: 'Full membership', pinned_roll: keys };
    assert.ok(JSON.stringify(body).length > 4096, 'exercise the expanded route while retaining the global ceiling');
    const result = await w.signed('POST', url, body, w.owner, headers);
    assert.equal(result.status, 201, result.text);
    const rt = (await w.server.pool.get(result.json.election_id))!;
    assert.deepEqual(rt.edb.pinnedRoll(), parsePinnedRoll(keys));
    assert.equal(rt.edb.voterCount(), 0, 'membership provisioning never registers a voter');
    const replay = await w.signed('POST', url, body, w.owner, headers);
    assert.equal(replay.status, 201); assert.equal(replay.json.election_id, result.json.election_id);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    const conflict = await w.signed('POST', url, { ...body, pinned_roll: keys.slice(1) }, w.owner, headers);
    assert.equal(conflict.status, 422); assert.equal(conflict.json.code, 'IDEMPOTENCY_MISMATCH');
    assert.equal(w.server.env.control.countElections(w.orgId), count + 1);
    const originalLimit = w.server.env.cfg.maxVotersPerElection;
    w.server.env.cfg.maxVotersPerElection = 1;
    try {
      const over = await w.signed('POST', url, { title: 'Over configured limit', pinned_roll: keys.slice(0, 2) }, w.owner, w.idemKey());
      assert.equal(over.status, 422); assert.equal(over.json.code, 'PINNED_ROLL_INVALID');
    } finally { w.server.env.cfg.maxVotersPerElection = originalLimit; }
  } finally { await w.stop(); }
});

test('provisioned membership restricts enrollment before manifest and exact manifest binding cannot be bypassed by a draft', async () => {
  const w = await fixture('pinned-pre-manifest');
  try {
    const [invite] = await issue(w), rt = (await w.server.pool.get(w.electionId))!;
    const outsider = kp('pinned-pre-manifest', 'outside'), off = w.registrationBody(invite!.code, outsider);
    const before = rt.edb.inviteById(invite!.invite_id)!;
    const badPop = await w.req('POST', path(w, 'registrations'), { ...off, pop: b64u(new Uint8Array(64)) });
    assert.equal(badPop.status, 401); assert.equal(badPop.json.code, 'BAD_SIGNATURE');
    const unknown = await w.req('POST', path(w, 'registrations'), w.registrationBody(b64u(new Uint8Array(16)), outsider));
    assert.equal(unknown.status, 409); assert.equal(unknown.json.code, 'INVITE_USED');
    const refusal = await w.req('POST', path(w, 'registrations'), off);
    assert.equal(refusal.status, 403); assert.equal(refusal.json.code, 'VOTER_NOT_ON_PINNED_ROLL');
    assert.deepEqual(rt.edb.inviteById(invite!.invite_id), before);
    assert.equal(rt.edb.voterCount(), 0); assert.equal(rt.log.size, 0);
    assert.equal((await w.signed('PUT', path(w, 'draft'), { pinned_roll: [bytesToHex(outsider.publicKey)] })).status, 200);
    assert.deepEqual(rt.edb.pinnedRoll()!.keys, keysOf(w));
    const m = w.buildManifest();
    for (const roll of [
      { scheme: 'ed25519-roll-v1' as const, weights: 'uniform' as const },
      { ...m.roll, root: '00'.repeat(32) }, { ...m.roll, size: m.roll.size! - 1 },
    ]) {
      const denied = await publish(w, { ...m, roll });
      assert.equal(denied.status, 422, denied.text); assert.equal(denied.json.code, 'PINNED_ROLL_MISMATCH');
      assert.equal(rt.log.size, 0);
    }
    const enrolled = await w.req('POST', path(w, 'registrations'), w.registrationBody(invite!.code, w.voters[1]!));
    assert.equal(enrolled.status, 201, enrolled.text);
    assert.equal((await publish(w, m)).status, 201);
    for (const secret of [invite!.code, off.invite_code, off.pop]) assert.ok(!w.logs.join('\n').includes(secret));
  } finally { await w.stop(); }
});

test('an absent pinned member survives commitment, restart, pagination, quorum, export and readonly import without fabricated enrollment', { timeout: 240_000 }, async () => {
  const w = await fixture('pinned-complete-lifecycle');
  let mirror: World | undefined;
  try {
    const absent = w.voters[0]!, absentKid = kidOf(absent.publicKey), keys = keysOf(w);
    await w.registerVoters(1); // The first pinned member never redeems an invitation.
    const m = w.buildManifest(); m.quorum = { type: 'fraction', basis: 'roll', num: 1, den: 1 };
    assert.equal((await publish(w, m)).status, 201);
    const setupExport = await w.get(path(w, 'export.json'));
    assert.equal(setupExport.status, 200); assert.deepEqual(setupExport.json.roll, keys);
    await w.ceremony();
    await w.server.pool.evict(w.electionId);
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.state, 'READY'); assert.deepEqual([...rt.st.rollSet!].sort(), keys);
    assert.equal(rt.edb.voterCount(), 3); assert.equal(rt.edb.voter(absentKid), undefined);
    const status = await w.get(path(w, `voters/${absentKid}`));
    assert.equal(status.json.registered, false); assert.equal(status.json.registration_known, true);
    const collected: any[] = [];
    let cursor: string | null = null;
    do {
      const page = await w.get(path(w, `roll?limit=1${cursor === null ? '' : `&cursor=${cursor}`}`));
      assert.equal(page.status, 200, page.text); assert.equal(page.json.roll_size, 4);
      collected.push(...page.json.items); cursor = page.json.next_cursor;
    } while (cursor !== null);
    assert.deepEqual(collected.map((v) => bytesToHex(unb64u(v.pk)!)), keys);
    const unregistered = collected.find((v) => v.voter_kid === absentKid)!;
    assert.equal(unregistered.registered, false); assert.equal(unregistered.status, 'unregistered');
    assert.equal(unregistered.roll_index, keys.indexOf(bytesToHex(absent.publicKey)));
    const absentCursor = await w.get(path(w, `roll?cursor=${absentKid}&limit=500`));
    assert.equal(absentCursor.status, 200, absentCursor.text);
    assert.deepEqual(absentCursor.json.items.map((v: any) => bytesToHex(unb64u(v.pk)!)), keys.slice(unregistered.roll_index + 1));
    assert.equal((await w.open()).status, 201);
    const outsiderBallot = await w.cast(0, { budget: ['yes'], chair: ['ann'] });
    assert.equal(outsiderBallot.status, 403, outsiderBallot.text);
    for (const i of [1, 2, 3]) assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    assert.equal((await w.close()).status, 201);
    for (const j of [1, 3]) assert.equal((await w.trusteeShares(j)).status, 201);
    const draft = await w.get(path(w, 'tally/draft?decrypters=1,3'));
    assert.equal(draft.status, 200, draft.text);
    assert.ok(draft.json.body.results.every((contest: any) => contest.quorum_met === false), 'three of four members cannot satisfy a full-roll quorum');
    const coord = w.coord[0]!;
    assert.equal((await w.post('tally_result', coord, signRecord(coord.secretKey, coord.publicKey, w.params.ctx, draft.json.body))).status, 201);
    const exported = await w.get(path(w, 'export.json'));
    assert.deepEqual(exported.json.roll, keys);
    const report = await verifyElectionText(exported.text);
    assert.equal(report.verdict, 'INCOMPLETE', JSON.stringify(report.findings));
    assert.equal(report.counts.counted, 3);
    const bundle = await exportQvb(w);
    mirror = await fixture('pinned-complete-import', false, 0);
    const job = await importAndWait(mirror, bundle);
    assert.equal(job.state, 'done', JSON.stringify(job));
    const mirrored = (await mirror.server.pool.get(w.electionId))!;
    assert.equal(mirrored.imported, true); assert.deepEqual(mirrored.canonicalRollKeys(), keys);
    const importedStatus = await mirror.get(`/api/v1/elections/${w.electionId}/voters/${absentKid}`);
    assert.equal(importedStatus.json.registered, null); assert.equal(importedStatus.json.registration_known, false);
    const unknownStatus = await mirror.get(`/api/v1/elections/${w.electionId}/voters/${kidOf(kp('pinned-import', 'unknown').publicKey)}`);
    assert.equal(unknownStatus.json.registered, false); assert.equal(unknownStatus.json.registration_known, false);
    const importedRoll = await mirror.get(`/api/v1/elections/${w.electionId}/roll?cursor=${absentKid}&limit=500`);
    assert.equal(importedRoll.status, 200); assert.ok(importedRoll.json.items.every((v: any) => v.registered === null && v.registration_known === false));
    const refused = await mirror.signed('PUT', `/api/v1/elections/${w.electionId}/pinned-roll`, { pinned_roll: keys }, mirror.owner, mirror.idemKey());
    assert.equal(refused.status, 503); assert.equal(refused.json.code, 'LOG_UNAVAILABLE');
    const importedExport = await mirror.get(`/api/v1/elections/${w.electionId}/export.json`);
    assert.deepEqual(importedExport.json, exported.json);
  } finally { if (mirror) await mirror.stop(); await w.stop(); }
});

test('historical pinned setup requires authenticated recovery before writes; off-roll consumed retries do not become successes', async () => {
  const w = await fixture('pinned-historical-recovery');
  try {
    const [used, fresh] = await issue(w, 2), outsider = kp('pinned-historical-recovery', 'outsider');
    assert.equal((await publish(w)).status, 201);
    const previous = (await w.server.pool.get(w.electionId))!;
    // Reproduce a pre-upgrade off-roll registration fact without inventing current admission.
    previous.edb.tx(() => {
      previous.edb.consumeInvite(used!.invite_id, w.clock);
      previous.edb.addVoter({ voter_kid: kidOf(outsider.publicKey), pk: outsider.publicKey, alg: 'ed25519', status: 'approved', registered_at: w.clock });
    });
    const signatures = previous.edb.entries(0, 10).rows.map((row) => Buffer.from(row.body!).toString('hex'));
    await schema9WithoutList(w);
    const rt = (await w.server.pool.get(w.electionId))!;
    const usedBody = w.registrationBody(used!.code, outsider), matchingBody = w.registrationBody(fresh!.code, w.voters[0]!);
    for (const body of [usedBody, matchingBody]) {
      const denied = await w.req('POST', path(w, 'registrations'), body);
      assert.equal(denied.status, 503); assert.equal(denied.json.code, 'PINNED_ROLL_UNAVAILABLE');
    }
    assert.equal((await w.get(path(w, 'roll'))).json.code, 'PINNED_ROLL_UNAVAILABLE');
    assert.equal((await w.get(path(w, 'export.json'))).json.code, 'PINNED_ROLL_UNAVAILABLE');
    const wrong = await attach(w, keysOf(w).slice(1));
    assert.equal(wrong.status, 422); assert.equal(wrong.json.code, 'PINNED_ROLL_MISMATCH');
    assert.equal(rt.edb.pinnedRoll(), undefined);
    const accepted = await attach(w);
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.json.roll_root, w.manifest.roll.root); assert.equal(accepted.json.roll_size, 4);
    const refused = await w.req('POST', path(w, 'registrations'), usedBody);
    assert.equal(refused.status, 403); assert.equal(refused.json.code, 'VOTER_NOT_ON_PINNED_ROLL');
    assert.equal(rt.edb.voter(kidOf(outsider.publicKey))!.registered_at, w.clock);
    assert.equal((await w.req('POST', path(w, 'registrations'), matchingBody)).status, 201);
    assert.deepEqual(rt.edb.entries(0, 10).rows.map((row) => Buffer.from(row.body!).toString('hex')), signatures);
    assert.equal((await attach(w)).status, 200, 'identical attachment remains idempotent under a fresh request key');
    const replacement = await attach(w, keysOf(w).slice(1));
    assert.equal(replacement.status, 409); assert.equal(replacement.json.code, 'PINNED_ROLL_IMMUTABLE');
    assert.throws(() => rt.edb.db.prepare('UPDATE pinned_roll SET size=size+1').run(), /immutable/);
    assert.throws(() => rt.edb.db.prepare('DELETE FROM pinned_roll').run(), /immutable/);
    const publicKeys = (await w.get(path(w, 'roll'))).json.items.map((v: any) => bytesToHex(unb64u(v.pk)!));
    assert.deepEqual(publicKeys, keysOf(w));
    assert.equal(rt.edb.voterCount(), 2, 'the historical registration fact is retained separately from membership');
  } finally { await w.stop(); }
});

test('legacy drafts can attach a list; conflicting attachments serialize and the next manifest binds the winning list', async () => {
  const w = await fixture('pinned-draft-race', false);
  try {
    await schema9WithoutList(w);
    const rt = (await w.server.pool.get(w.electionId))!, keys = keysOf(w);
    const before = rt.edb.db.prepare('SELECT version,hex(sha256) AS checksum FROM schema_migration WHERE version<=9 ORDER BY version').all();
    assert.equal(rt.edb.db.prepare('PRAGMA user_version').get()!.user_version, 12);
    const first = attach(w, keys), other = attach(w, keys.slice(1));
    const results = await Promise.all([first, other]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const winner = rt.edb.pinnedRoll()!;
    assert.deepEqual(rt.edb.db.prepare('SELECT version,hex(sha256) AS checksum FROM schema_migration WHERE version<=9 ORDER BY version').all(), before);
    const manifest = w.buildManifest(); manifest.roll.root = winner.root; manifest.roll.size = winner.size;
    assert.equal((await publish(w, manifest)).status, 201);
    const current = await attach(w, [...winner.keys]);
    assert.equal(current.status, 200);
    assert.equal(rt.edb.voterCount(), 0);
  } finally { await w.stop(); }
});

test('attachment and registration share lifecycle serialization, rechecking membership after a pending attachment', { timeout: 20_000 }, async () => {
  const w = await fixture('pinned-registration-attach-race', false);
  let release: (() => void) | undefined;
  try {
    const [invite] = await issue(w), rt = (await w.server.pool.get(w.electionId))!;
    const hold = rt.mutex.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const installing = attach(w);
    for (let i = 0; i < 100 && rt.mutex.pending < 2; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(rt.mutex.pending, 2, 'attachment waits behind the held lifecycle lock');
    const outsider = kp('pinned-registration-attach-race', 'outsider');
    const registering = w.req('POST', path(w, 'registrations'), w.registrationBody(invite!.code, outsider));
    for (let i = 0; i < 100 && rt.mutex.pending < 3; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(rt.mutex.pending, 3, 'registration waits behind attachment, rather than mutating the old membership state');
    release!(); await hold;
    const [attached, registration] = await Promise.all([installing, registering]);
    assert.equal(attached.status, 200, attached.text);
    assert.equal(registration.status, 403); assert.equal(registration.json.code, 'VOTER_NOT_ON_PINNED_ROLL');
    assert.equal(rt.edb.voterCount(), 0); assert.equal(rt.edb.inviteById(invite!.invite_id)!.state, 'issued');
  } finally { release?.(); await w.stop(); }
});

test('queued manifest publication validates the immutable list installed by a preceding attachment', { timeout: 20_000 }, async () => {
  const w = await fixture('pinned-manifest-attach-race', false);
  let release: (() => void) | undefined;
  try {
    const rt = (await w.server.pool.get(w.electionId))!, pinned = parsePinnedRoll(keysOf(w));
    const manifest = w.buildManifest(); manifest.roll.root = pinned.root; manifest.roll.size = pinned.size;
    const hold = rt.mutex.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const installing = attach(w);
    for (let i = 0; i < 100 && rt.mutex.pending < 2; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(rt.mutex.pending, 2);
    const publishing = publish(w, manifest);
    for (let i = 0; i < 100 && rt.mutex.pending < 3; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(rt.mutex.pending, 3);
    release!(); await hold;
    const [attached, published] = await Promise.all([installing, publishing]);
    assert.equal(attached.status, 200, attached.text); assert.equal(published.status, 201, published.text);
    assert.equal(rt.log.size, 1); assert.deepEqual(rt.canonicalRollKeys(), pinned.keys);
  } finally { release?.(); await w.stop(); }
});

test('queued registration cannot consume an invitation after the preceding full-roll commitment closes enrollment', { timeout: 120_000 }, async () => {
  const w = await fixture('pinned-commit-registration-race');
  let release: (() => void) | undefined;
  try {
    await w.registerVoters(1); assert.equal((await publish(w)).status, 201);
    const [invite] = await issue(w), rt = (await w.server.pool.get(w.electionId))!;
    const ok = w.ok.bind(w);
    let pendingCommit: unknown;
    w.ok = async (type, who, record) => {
      if (type === 'roll_commit') {
        pendingCommit = record;
        return { status: 201, headers: new Headers(), json: {}, text: '' };
      }
      return ok(type, who, record);
    };
    await w.ceremony(); // Stage the real signed commitment for controlled request ordering below.
    assert.equal(rt.st.rollSet, undefined); assert.notEqual(pendingCommit, undefined);
    const hold = rt.mutex.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const committing = w.post('roll_commit', w.coord[0]!, pendingCommit);
    for (let i = 0; i < 100 && rt.mutex.pending < 2; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(rt.mutex.pending, 2);
    const registering = w.req('POST', path(w, 'registrations'), w.registrationBody(invite!.code, w.voters[0]!));
    for (let i = 0; i < 100 && rt.mutex.pending < 3; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(rt.mutex.pending, 3);
    release!(); await hold;
    const [committed, registered] = await Promise.all([committing, registering]);
    assert.equal(committed.status, 201, committed.text);
    assert.equal(registered.status, 403); assert.equal(registered.json.code, 'REGISTRATION_CLOSED');
    assert.equal(rt.edb.inviteById(invite!.invite_id)!.state, 'issued');
    assert.equal(rt.edb.voter(kidOf(w.voters[0]!.publicKey)), undefined);
  } finally { release?.(); await w.stop(); }
});

test('the default decryption floor uses eight pinned members even when only three register', { timeout: 120_000 }, async () => {
  const w = await fixture('pinned-full-denominator', true, 8);
  try {
    await w.registerVoters(5); assert.equal((await publish(w)).status, 201); await w.ceremony();
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.voterCount(), 3); assert.equal(rt.st.rollSet!.size, 8);
    assert.equal((await w.get(path(w, 'tally'))).json.min_counted, 5);
  } finally { await w.stop(); }
});

test('attachment requires a signed request from this election organization and does not expose another organization', async () => {
  const w = await fixture('pinned-auth-boundary', false);
  try {
    const rt = (await w.server.pool.get(w.electionId))!, other = kp('pinned-auth-boundary', 'other-owner');
    const organization = await w.req('POST', '/api/v1/orgs', { name: 'Separate organization', owner_key: { pk: b64u(other.publicKey), alg: 'ed25519' } }, { key: other, headers: w.idemKey() });
    assert.equal(organization.status, 201);
    const body = { pinned_roll: keysOf(w) };
    assert.equal((await w.req('PUT', path(w, 'pinned-roll'), body, { headers: w.idemKey() })).status, 401);
    assert.equal((await w.signed('PUT', path(w, 'pinned-roll'), body, other, w.idemKey())).status, 404);
    assert.equal(rt.edb.pinnedRoll(), undefined); assert.equal(rt.edb.voterCount(), 0); assert.equal(rt.log.size, 0);
    assert.equal((await attach(w)).status, 200);
  } finally { await w.stop(); }
});

test('startup rejects a canonical but manifest-mismatched list and malformed membership in an unpublished draft', async () => {
  for (const published of [true, false]) {
    const w = await fixture(`pinned-startup-binding-${published}`);
    try {
      if (published) assert.equal((await publish(w)).status, 201);
      const relative = w.server.env.control.election(w.electionId)!.db_path;
      await w.server.pool.evict(w.electionId);
      const db = new DatabaseSync(join(w.dir, relative));
      try {
        db.exec('DROP TRIGGER pinned_roll_noupdate');
        if (published) {
          const other = parsePinnedRoll(w.coord.map((key) => bytesToHex(key.publicKey)).sort());
          db.prepare('UPDATE pinned_roll SET root=?,size=?,keys_json=?').run(other.root, other.size, JSON.stringify(other.keys));
        } else db.prepare('UPDATE pinned_roll SET keys_json=?').run('[]');
      } finally { db.close(); }
      await assert.rejects(w.server.pool.get(w.electionId), published ? /pinned_roll does not match the signed manifest/ : /stored pinned roll is invalid/);
    } finally { await w.stop(); }
  }
});

test('attachment commits with its management receipt and recovers a lost response without duplicate mutation', async () => {
  const w = await fixture('pinned-operation-recovery', false);
  try {
    const rt = (await w.server.pool.get(w.electionId))!, store = rt.edb.storeOperationReceipt.bind(rt.edb);
    rt.edb.storeOperationReceipt = () => { throw new Error('injected election journal failure'); };
    const failed = await attach(w);
    assert.equal(failed.status, 500); assert.equal(rt.edb.pinnedRoll(), undefined, 'journal failure rolls back membership');
    rt.edb.storeOperationReceipt = store;
    const ctl = w.server.env.control, save = ctl.storeIdem.bind(ctl), headers = w.idemKey();
    ctl.storeIdem = (...args) => { if (args[3] === path(w, 'pinned-roll') && args[5] === 200) throw new Error('injected response-cache failure'); save(...args); };
    const lost = await attach(w, keysOf(w), headers);
    assert.equal(lost.status, 500); assert.deepEqual(rt.edb.pinnedRoll()!.keys, keysOf(w));
    await w.server.stop(); await w.start();
    const retry = await attach(w, keysOf(w), headers);
    assert.equal(retry.status, 200, retry.text); assert.equal(retry.headers.get('idempotent-replay'), 'true');
    assert.equal((await w.server.pool.get(w.electionId))!.edb.db.prepare('SELECT COUNT(*) AS n FROM pinned_roll').get()!.n, 1);
  } finally { await w.stop(); }
});

test('historical committed pinned rolls reconstruct only exact committed membership, while malformed stored bindings fail startup', { timeout: 120_000 }, async () => {
  const w = await fixture('pinned-legacy-committed');
  try {
    await w.registerVoters(); assert.equal((await publish(w)).status, 201); await w.ceremony();
    await schema9WithoutList(w);
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.pinnedRoll(), undefined); assert.deepEqual(rt.canonicalRollKeys(), keysOf(w));
    assert.deepEqual((await w.get(path(w, 'export.json'))).json.roll, keysOf(w));
    assert.equal((await attach(w)).status, 200, 'active committed history may persist the exact recovered full list');
    const relative = w.server.env.control.election(w.electionId)!.db_path;
    await w.server.pool.evict(w.electionId);
    const db = new DatabaseSync(join(w.dir, relative));
    try { db.exec("DROP TRIGGER pinned_roll_noupdate; UPDATE pinned_roll SET root='" + '00'.repeat(32) + "'"); }
    finally { db.close(); }
    await assert.rejects(w.server.pool.get(w.electionId), /stored pinned roll binding is invalid/);
  } finally { await w.stop(); }
});

test('pinned storage retains the existing large-import capacity', { timeout: 120_000 }, async () => {
  const w = await fixture('pinned-import-capacity', false);
  try {
    // 17,216 public keys exceed 1,153,434 JSON bytes. A .qvb import already has a
    // separate larger bounded upload route; its valid membership must fit storage.
    // Native key derivation preserves the deterministic fixture without thousands
    // of JavaScript scalar multiplications on slower CI runners.
    const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const keys = Array.from({ length: 17_216 }, (_, i) => {
      const key = createPrivateKey({
        key: Buffer.concat([prefix, sha256(utf8(`pinned-capacity/${i}`))]), type: 'pkcs8', format: 'der',
      });
      return createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    }).sort();
    const encoded = JSON.stringify(keys);
    assert.equal(Buffer.byteLength(encoded), 1_153_473);
    assert.ok(Buffer.byteLength(encoded) > w.server.env.cfg.maxRequestBytes);
    // Construct the expected binding without a redundant third validation pass.
    // Both attachment and the uncached read below still validate every strict key.
    const pinned = { root: bytesToHex(mth(keys.map((key) => rollLeaf(hexToBytes(key))))), size: keys.length, keys };
    const rt = (await w.server.pool.get(w.electionId))!;
    rt.edb.tx(() => rt.edb.attachPinnedRoll(pinned)); // The same validated storage method used by commitImport.
    assert.deepEqual(rt.edb.pinnedRoll(), pinned);
  } finally { await w.stop(); }
});

test('pinned management requests retain the global body cap before reading the body or mutating storage', { timeout: 30_000 }, async (t) => {
  const w = await fixture('pinned-management-body-cap', false);
  try {
    const maximum = 1_153_434, count = w.server.env.control.countElections(w.orgId);
    assert.equal(w.server.env.cfg.maxRequestBytes, maximum);
    for (const [method, target] of [
      ['POST', `/api/v1/orgs/${w.orgId}/elections`], ['PUT', path(w, 'pinned-roll')],
    ] as const) {
      const request = httpRequest(new URL(target, w.base), {
        method, agent: false, timeout: 10_000, signal: t.signal,
        headers: { 'content-type': 'application/json', 'content-length': String(maximum + 1), connection: 'close' },
      });
      try {
        const response = new Promise<{ status: number | undefined; text: string }>((resolve, reject) => {
          request.once('error', reject);
          request.once('timeout', () => request.destroy(new Error('oversized request was not rejected from its headers')));
          request.once('response', (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => { text += chunk; });
            res.once('error', reject);
            res.once('end', () => resolve({ status: res.statusCode, text }));
          });
        });
        // The server deliberately closes after rejecting Content-Length. Sending
        // only headers avoids racing that close with an in-flight Windows upload.
        request.flushHeaders();
        const oversized = await response;
        assert.equal(oversized.status, 413, oversized.text);
        assert.equal(JSON.parse(oversized.text).code, 'PAYLOAD_TOO_LARGE');
      } finally { request.destroy(); }
    }
    assert.equal(w.server.env.control.countElections(w.orgId), count);
    assert.equal((await w.server.pool.get(w.electionId))!.edb.pinnedRoll(), undefined);
  } finally { await w.stop(); }
});
