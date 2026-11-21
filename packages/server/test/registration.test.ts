import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { b64u, unb64u } from '@quietvote/board';
import { ed25519Sign, sha256, utf8 } from '@quietvote/crypto';
import { ApiClient } from '../../web/src/api/client.ts';
import { registrationBody } from '../../web/src/flow/onboarding.ts';
import { createSigner } from '../../web/src/key/signer.ts';
import { World, kp } from './helpers/world.ts';

async function fixture(seed: string) {
  const w = new World({ seed, n: 3, t: 2, voters: 0 });
  await w.start(); await w.setupOrgAndElection(); return w;
}
async function issue(w: World, count = 1, expires_at?: string): Promise<{ invite_id: string; code: string }[]> {
  const r = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count, ...(expires_at ? { expires_at } : {}) }, w.owner, w.idemKey());
  assert.equal(r.status, 201, r.text); return r.json.invites;
}
const path = (w: World) => `/api/v1/elections/${w.electionId}/registrations`;

test('B2-10 unknown, revoked and consumed invitations expose the same refusal body', async () => {
  const w = await fixture('registration-oracle');
  try {
    const [used, revoked] = await issue(w, 2), first = kp('registration', 'oracle-first'), other = kp('registration', 'oracle-other');
    assert.equal((await w.req('POST', path(w), w.registrationBody(used!.code, first))).status, 201);
    await w.signed('DELETE', `/api/v1/elections/${w.electionId}/invites/${revoked!.invite_id}`);
    const results = [];
    for (const code of [used!.code, revoked!.code, b64u(new Uint8Array(16))]) {
      const r = await w.req('POST', path(w), w.registrationBody(code, other));
      assert.equal(r.status, 409);
      const { request_id: _id, ...problem } = r.json; results.push(problem);
    }
    assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  } finally { await w.stop(); }
});

test('an invitation expires exactly at its recorded deadline', async () => {
  const w = await fixture('registration-expiry-boundary');
  try {
    const [invite] = await issue(w, 1, new Date(w.clock).toISOString());
    assert.equal((await w.req('POST', path(w), w.registrationBody(invite!.code, kp('registration', 'boundary')))).status, 422);
    assert.equal((await w.server.pool.get(w.electionId))!.edb.voterCount(), 0);
  } finally { await w.stop(); }
});

test('ADR028 real browser client enrolls first voter before manifest; stored hash is not the wire bearer', async () => {
  const w = await fixture('registration-browser-adapter');
  const signer = await createSigner(kp('registration', 'browser').secretKey.slice(), { preferWebCrypto: false });
  try {
    const [invite] = await issue(w); const token = unb64u(invite!.code)!, hash = sha256(token);
    const rt = (await w.server.pool.get(w.electionId))!;
    const stored = rt.edb.inviteById(invite!.invite_id)!.code_hash;
    assert.equal(rt.edb.inviteById(invite!.invite_id)!.expires_at, w.clock + 14 * 86_400_000);
    assert.deepEqual(Buffer.from(stored), Buffer.from(sha256(new Uint8Array([...utf8('QV-INVITE-HASH-v1\0'), ...hash]))));
    assert.notDeepEqual(Buffer.from(stored), Buffer.from(hash));
    const body = await registrationBody({ apiElectionId: w.electionId, token, signer });
    assert.equal(body.invite_code, b64u(hash));
    const client = new ApiClient({ baseUrl: w.base });
    const result = await client.register(w.electionId, body);
    assert.equal(result.status, 'approved'); assert.equal(rt.edb.voterCount(), 1);
    assert.equal((await client.register(w.electionId, body)).voter_kid, result.voter_kid);
    assert.equal(rt.edb.voterCount(), 1);
    assert.equal(rt.edb.inviteById(invite!.invite_id)!.state, 'registered');
    assert.equal(rt.log.size, 0, 'enrollment does not invent a manifest or membership log record');
    for (const secret of [invite!.code, b64u(hash), body.pop]) assert.ok(!w.logs.join('\n').includes(secret));
  } finally { signer.lock(); await w.stop(); }
});

test('modern enrollment binds invite, election, key and canonical widths; no legacy signature fallback', async () => {
  const w = await fixture('registration-binding');
  try {
    const [a, b] = await issue(w, 2), key = kp('registration', 'binding'), other = kp('registration', 'other');
    const valid = w.registrationBody(a!.code, key), second = w.registrationBody(b!.code, key);
    const oldPop = b64u(ed25519Sign(key.secretKey, new Uint8Array([...utf8(`QV-REG-v1\0${w.electionId}\0`), ...key.publicKey])));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const alias = valid.invite_code.slice(0, -1) + alphabet[alphabet.indexOf(valid.invite_code.at(-1)!) | 1];
    assert.deepEqual(Buffer.from(alias, 'base64url'), Buffer.from(valid.invite_code, 'base64url'));
    for (const [body, status] of [
      [{ ...valid, invite_code: second.invite_code }, 401], [{ ...valid, pk: b64u(other.publicKey) }, 401],
      [{ ...valid, pop: oldPop }, 401], [{ ...valid, invite_code: a!.code }, 400],
      [{ ...valid, invite_code: alias }, 400], [{ ...valid, invite_code: valid.invite_code + '=' }, 400],
      [{ ...valid, scheme: 'legacy-raw-v1' }, 400],
    ] as const) assert.equal((await w.req('POST', path(w), body)).status, status);
    const wrongElection = b64u(ed25519Sign(key.secretKey, new Uint8Array([...utf8(`QV-REG-v1\0${'00'.repeat(16)}\0`), ...unb64u(valid.invite_code)!, ...key.publicKey])));
    assert.equal((await w.req('POST', path(w), { ...valid, pop: wrongElection })).status, 401);
    assert.equal((await w.server.pool.get(w.electionId))!.edb.voterCount(), 0);
    assert.equal((await w.req('POST', path(w), valid)).status, 201);
  } finally { await w.stop(); }
});

test('one modern invite cannot concurrently enroll two keys; revoked/expired/unknown bearers remain unusable', async () => {
  const w = await fixture('registration-race');
  try {
    const inv = await issue(w, 3), keys = [kp('registration', 'race-a'), kp('registration', 'race-b')];
    const race = await Promise.all(keys.map((key) => w.req('POST', path(w), w.registrationBody(inv[0]!.code, key))));
    assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
    const rt = (await w.server.pool.get(w.electionId))!; assert.equal(rt.edb.voterCount(), 1);
    await w.signed('DELETE', `/api/v1/elections/${w.electionId}/invites/${inv[1]!.invite_id}`);
    rt.edb.setInviteState(inv[2]!.invite_id, 'expired', w.clock);
    const [past] = await issue(w, 1, new Date(w.clock - 1).toISOString());
    for (const [code, status] of [[inv[1]!.code, 409], [inv[2]!.code, 422], [past!.code, 422], [b64u(new Uint8Array(16)), 409]] as const) {
      assert.equal((await w.req('POST', path(w), w.registrationBody(code, kp('registration', 'fresh')))).status, status);
    }
    assert.equal(rt.edb.voterCount(), 1);
  } finally { await w.stop(); }
});

test('actual schema8 upgrade preserves legacy invitations and exposes a read-only migration preview', async () => {
  const w = await fixture('registration-upgrade');
  try {
    const [invite] = await issue(w), legacy = sha256(utf8(`QV-INVITE-v1\0${invite!.code}`));
    const rel = w.server.env.control.election(w.electionId)!.db_path;
    await w.server.stop();
    const db = new DatabaseSync(join(w.dir, rel));
    db.prepare('UPDATE voter_invite SET code_hash=?').run(legacy);
    db.exec('DROP TABLE export_record; DROP TABLE pinned_roll; ALTER TABLE election DROP COLUMN registration_scheme; DELETE FROM schema_migration WHERE version>=9; PRAGMA user_version=8'); db.close();
    await w.start();
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.row().registration_scheme, 'legacy-raw-v1');
    assert.deepEqual(Buffer.from(rt.edb.inviteById(invite!.invite_id)!.code_hash), Buffer.from(legacy));
    const preview = await w.signed('GET', `/api/v1/elections/${w.electionId}/registration-migration`);
    assert.equal(preview.status, 200); assert.equal(preview.json.outstanding_invites, 1);
    assert.equal(preview.json.automatic_conversion, false); assert.equal(preview.json.disposition, 'legacy_preserved');
    const key = kp('registration', 'legacy'), client = new ApiClient({ baseUrl: w.base });
    await assert.rejects(client.register(w.electionId, w.registrationBody(invite!.code, key)), /REGISTRATION_UNAVAILABLE/);
    const pop = ed25519Sign(key.secretKey, new Uint8Array([...utf8(`QV-REG-v1\0${w.electionId}\0`), ...key.publicKey]));
    const accepted = await w.req('POST', path(w), { invite_code: invite!.code, pk: b64u(key.publicKey), alg: 'ed25519', pop: b64u(pop) });
    assert.equal(accepted.status, 201); assert.equal(rt.edb.row().registration_scheme, 'legacy-raw-v1');
    await w.signed('PUT', `/api/v1/elections/${w.electionId}/draft`, { registration_scheme: 'hashed-pop-v1' });
    assert.equal(rt.edb.row().registration_scheme, 'legacy-raw-v1');
    assert.equal(rt.edb.inviteById(invite!.invite_id)!.state, 'registered');
  } finally { await w.stop(); }
});
