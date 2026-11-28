// @verifies QV-29-REQ-008 (new-issuance lifetime only), QV-02-REQ-010 and QV-ADR-028 compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import { b64u, unb64u } from '@quietvote/board';
import { ed25519Sign, sha256, utf8 } from '@quietvote/crypto';
import { ApiClient } from '../../web/src/api/client.ts';
import { parseFragment } from '../../web/src/flow/invite.ts';
import { registrationBody } from '../../web/src/flow/onboarding.ts';
import { createSigner } from '../../web/src/key/signer.ts';
import { World, kp } from './helpers/world.ts';

const DAY = 86_400_000;
type Scheme = 'hashed-pop-v1' | 'legacy-raw-v1';
interface Invite { invite_id: string; code: string }
async function fixture(seed: string, scheme: Scheme = 'hashed-pop-v1'): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 0 });
  try {
    await w.start(); await w.setupOrgAndElection();
    // Select the existing persisted compatibility mode. Actual schema-8 upgrade is covered by registration.test.ts.
    if (scheme === 'legacy-raw-v1') (await w.server.pool.get(w.electionId))!.edb.db.prepare('UPDATE election SET registration_scheme=?').run(scheme);
    return w;
  } catch (error) { await w.stop(); throw error; }
}
const invitesPath = (w: World): string => `/api/v1/elections/${w.electionId}/invites`;
const registrationsPath = (w: World): string => `/api/v1/elections/${w.electionId}/registrations`;
async function issue(w: World, expires_at?: string): Promise<Invite> {
  const response = await w.signed('POST', invitesPath(w), { count: 1, ...(expires_at === undefined ? {} : { expires_at }) }, w.owner, w.idemKey());
  assert.equal(response.status, 201, response.text);
  const invite = response.json.invites[0] as Invite;
  const bytes = unb64u(invite.code);
  assert.ok(bytes); assert.equal(bytes.length, 16); assert.equal(b64u(bytes), invite.code);
  return invite;
}
function legacyBody(w: World, code: string, key: ReturnType<typeof kp>) {
  const msg = new Uint8Array([...utf8(`QV-REG-v1\0${w.electionId}\0`), ...key.publicKey]);
  return { invite_code: code, pk: b64u(key.publicKey), alg: 'ed25519', pop: b64u(ed25519Sign(key.secretKey, msg)) };
}

test('invite expiry cap rejects one millisecond over 30 days before invite or idempotency mutation', async () => {
  const w = await fixture('invite-cap-refusal');
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const old = await w.signed('POST', invitesPath(w), { items: [{ label: 'cap-label-canary', contact: 'cap-contact-canary' }] }, w.owner, w.idemKey());
    assert.equal(old.status, 201);
    rt.edb.setInviteState(old.json.invites[0].invite_id, 'expired', w.clock - 8 * DAY);
    const snapshot = () => ({
      invites: rt.edb.db.prepare('SELECT * FROM voter_invite ORDER BY invite_id').all(),
      idempotency: w.server.env.control.db.prepare('SELECT * FROM idempotency ORDER BY principal,idem_key').all(),
      receipts: rt.edb.db.prepare('SELECT * FROM operation_receipt ORDER BY principal,idem_key').all(),
      size: rt.log.size, root: rt.log.root(),
    });
    for (const content of [{ count: 2 }, { items: [{ label: 'new-cap-label' }] }]) {
      const key = w.idemKey(), before = snapshot();
      const denied = await w.signed('POST', invitesPath(w), { ...content, expires_at: new Date(w.clock + 30 * DAY + 1).toISOString() }, w.owner, key);
      assert.equal(denied.status, 422, 'over-limit issuance must be refused'); assert.equal(denied.json.code, 'VALIDATION_FAILED');
      assert.deepEqual(snapshot(), before, 'refusal precedes invite purge, issuance and both replay journals');
      const corrected = { ...content, expires_at: new Date(w.clock + 30 * DAY).toISOString() };
      const accepted = await w.signed('POST', invitesPath(w), corrected, w.owner, key);
      assert.equal(accepted.status, 201, accepted.text);
      for (const row of accepted.json.invites as Invite[]) assert.equal(rt.edb.inviteById(row.invite_id)!.expires_at, w.clock + 30 * DAY);
      const replay = await w.signed('POST', invitesPath(w), corrected, w.owner, key);
      assert.equal(replay.status, 201); assert.equal(replay.headers.get('idempotent-replay'), 'true');
      assert.deepEqual(replay.json.invites, accepted.json.invites.map((i: Invite) => ({ invite_id: i.invite_id, code_withheld: true })));
    }
  } finally { await w.stop(); }
});

test('exactly 30 days is accepted and current browser hashed enrollment preserves the 14-day default', async () => {
  const w = await fixture('invite-cap-browser'), key = kp('invite-cap', 'browser');
  const signer = await createSigner(key.secretKey.slice(), { preferWebCrypto: false });
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const ordinary = await issue(w);
    assert.equal(rt.edb.inviteById(ordinary.invite_id)!.expires_at, w.clock + 14 * DAY);
    const boundary = await issue(w, new Date(w.clock + 30 * DAY).toISOString());
    assert.equal(rt.edb.inviteById(boundary.invite_id)!.expires_at, w.clock + 30 * DAY);
    const token = parseFragment(`#inv=${boundary.code}`).token;
    assert.ok(token); assert.equal(token.length, 16);
    const body = await registrationBody({ apiElectionId: w.electionId, token, signer });
    assert.equal(body.invite_code, b64u(sha256(token)));
    const client = new ApiClient({ baseUrl: w.base });
    const registered = await client.register(w.electionId, body);
    assert.equal(registered.status, 'approved');
    assert.deepEqual(await client.register(w.electionId, body), registered);
    assert.equal(rt.edb.voterCount(), 1);
    assert.equal(rt.log.size, 0);
    for (const secret of [boundary.code, body.invite_code, body.pop]) assert.ok(!w.logs.join('\n').includes(secret));
  } finally { signer.lock(); await w.stop(); }
});

test('invalid dates still fail and explicitly past deadlines are issued but cannot enroll', async () => {
  const w = await fixture('invite-cap-past');
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const malformed = await w.signed('POST', invitesPath(w), { count: 1, expires_at: 'not-a-date' }, w.owner, w.idemKey());
    assert.equal(malformed.status, 400); assert.equal(malformed.json.code, 'BAD_REQUEST');
    assert.equal(rt.edb.inviteCount(), 0);
    for (const offset of [0, -1]) {
      const invite = await issue(w, new Date(w.clock + offset).toISOString());
      assert.equal(rt.edb.inviteById(invite.invite_id)!.expires_at, w.clock + offset);
      const refused = await w.req('POST', registrationsPath(w), w.registrationBody(invite.code, kp('invite-cap-past', String(offset))));
      assert.equal(refused.status, 422); assert.equal(refused.json.code, 'INVITE_EXPIRED');
    }
    assert.equal(rt.edb.voterCount(), 0);
  } finally { await w.stop(); }
});

test('legacy mode keeps canonical 16-byte issuance, old hash/PoP and the same 30-day cap', async () => {
  const w = await fixture('invite-cap-legacy', 'legacy-raw-v1');
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const denied = await w.signed('POST', invitesPath(w), { count: 1, expires_at: new Date(w.clock + 30 * DAY + 1).toISOString() }, w.owner, w.idemKey());
    assert.equal(denied.status, 422); assert.equal(rt.edb.inviteCount(), 0);
    const invite = await issue(w, new Date(w.clock + 30 * DAY).toISOString());
    assert.deepEqual(new Uint8Array(rt.edb.inviteById(invite.invite_id)!.code_hash), sha256(utf8(`QV-INVITE-v1\0${invite.code}`)));
    const body = legacyBody(w, invite.code, kp('invite-cap', 'legacy'));
    const accepted = await w.req('POST', registrationsPath(w), body);
    assert.equal(accepted.status, 201, accepted.text);
    const replay = await w.req('POST', registrationsPath(w), body);
    assert.equal(replay.status, 201); assert.deepEqual(replay.json, accepted.json); assert.equal(rt.edb.voterCount(), 1);
    assert.equal(rt.edb.row().registration_scheme, 'legacy-raw-v1');
  } finally { await w.stop(); }
});

test('pre-existing long and null expiries remain authoritative after reopening either registration scheme', async () => {
  for (const scheme of ['hashed-pop-v1', 'legacy-raw-v1'] as const) {
    const w = await fixture(`invite-cap-existing-${scheme}`, scheme);
    try {
      const rt = (await w.server.pool.get(w.electionId))!, long = await issue(w), unlimited = await issue(w);
      const expiry = w.clock + 60 * DAY;
      // Represent rows issued by an older server; the new-issuance cap must not rewrite their stored policy.
      rt.edb.db.prepare('UPDATE voter_invite SET expires_at=? WHERE invite_id=?').run(expiry, long.invite_id);
      rt.edb.db.prepare('UPDATE voter_invite SET expires_at=NULL WHERE invite_id=?').run(unlimited.invite_id);
      const hashes = [long, unlimited].map((i) => new Uint8Array(rt.edb.inviteById(i.invite_id)!.code_hash));
      await w.server.stop(); w.clock += 31 * DAY; await w.start();
      const reopened = (await w.server.pool.get(w.electionId))!;
      assert.equal(reopened.edb.row().registration_scheme, scheme);
      assert.equal(reopened.edb.inviteById(long.invite_id)!.expires_at, expiry);
      assert.equal(reopened.edb.inviteById(unlimited.invite_id)!.expires_at, null);
      for (const [index, invite] of [long, unlimited].entries()) {
        assert.deepEqual(new Uint8Array(reopened.edb.inviteById(invite.invite_id)!.code_hash), hashes[index]);
        const key = kp(`invite-cap-${scheme}`, String(index));
        const body = scheme === 'hashed-pop-v1' ? w.registrationBody(invite.code, key) : legacyBody(w, invite.code, key);
        const enrolled = await w.req('POST', registrationsPath(w), body);
        assert.equal(enrolled.status, 201, enrolled.text);
      }
      assert.equal(reopened.edb.voterCount(), 2);
    } finally { await w.stop(); }
  }
});
