// S1-01 repro (AI-assisted review; QuietVote is unaudited and not for real elections).
// Static-roll mode (manifest carries roll.root/roll.size, QV-ADR-015; the web organizer flow builds exactly this manifest):
// the server keeps accepting registrations of keys OUTSIDE the pinned roll after the manifest is published, and roll_commit must
// equal BOTH the manifest roll and the server's approved set. One invite holder can therefore make roll_commit impossible.
//
// Run: node --test packages/server/test/s1-static-roll-registration.repro.ts
// This file asserts the EXPECTED behaviour, so it FAILS while the defect exists. Observations are printed as diagnostics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { b64u } from '@quietvote/board';
import { bytesToHex, ed25519Sign, utf8, type Ed25519Keypair } from '@quietvote/crypto';
import { PROTO_ID, rollRoot, type Manifest } from '@quietvote/protocol';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;

class StaticRollWorld extends World {
  /** The roll the organizer pins in the manifest (keys collected out of band, as in packages/web/src/flow/publish.ts). */
  pinned: string[] = [];
  override buildManifest(): Manifest {
    const m = super.buildManifest();
    const rr = rollRoot(this.pinned);
    if (!rr.ok) throw new Error('roll');
    m.roll = { scheme: 'ed25519-roll-v1', weights: 'uniform', root: H(rr.value), size: this.pinned.length };
    return m;
  }
  register(code: string, k: Ed25519Keypair) {
    const pop = ed25519Sign(k.secretKey, new Uint8Array([...utf8(`QV-REG-v1\0${this.electionId}\0`), ...k.publicKey]));
    return this.req('POST', `/api/v1/elections/${this.electionId}/registrations`, { invite_code: code, pk: b64u(k.publicKey), alg: 'ed25519', pop: b64u(pop) });
  }
  rollCommit(keys: string[]) {
    const rr = rollRoot(keys);
    if (!rr.ok) throw new Error('roll');
    return this.post('roll_commit', this.coord[0]!, this.multi(this.mh, { proto: PROTO_ID, type: 'roll-commit', root: H(rr.value), size: keys.length } as { type: string }));
  }
}

test('S1-01: in static-roll mode one invite holder registers a key outside the pinned roll and roll_commit becomes impossible', { timeout: 240_000 }, async (t) => {
  const w = new StaticRollWorld({ seed: 's1-static-roll', n: 3, t: 2, voters: 4 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    // Organizer pins the four member keys in the manifest, then issues one invite per member (web flow order: manifest, then invites).
    w.pinned = w.voters.map((v) => H(v.publicKey)).sort();
    w.rollHex = w.pinned;
    assert.equal((await w.publishManifest()).status, 201);
    const inv = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 4 }, w.owner, w.idemKey());
    assert.equal(inv.status, 201, inv.text);
    const codes: string[] = inv.json.invites.map((i: { code: string }) => i.code);

    // Members 0..2 register the keys the organizer pinned.
    for (let i = 0; i < 3; i++) assert.equal((await w.register(codes[i]!, w.voters[i]!)).status, 201);

    // Member 3 (a legitimate invitee acting maliciously, or anyone holding the unredeemed code) registers a DIFFERENT key.
    const outsider = kp('s1-static-roll', 'not-in-pinned-roll');
    const late = await w.register(codes[3]!, outsider);
    t.diagnostic(`registration of a key outside the pinned manifest roll, after the manifest: ${late.status} ${late.text}`);

    // Run the DKG. World.ceremony() ends with roll_commit over w.rollHex (= the pinned roll) and throws when it is refused.
    let ceremonyError = '';
    try {
      await w.ceremony();
    } catch (e) {
      ceremonyError = (e as Error).message;
    }
    t.diagnostic(`roll_commit over the pinned manifest roll: ${ceremonyError || 'accepted'}`);

    // The organizer's only other option, committing what the server registered, contradicts the manifest.
    const approved = [...w.pinned.slice(0, 0), ...w.voters.slice(0, 3).map((v) => H(v.publicKey)), H(outsider.publicKey)].sort();
    const alt = await w.rollCommit(approved);
    t.diagnostic(`roll_commit over the server's approved set: ${alt.status} ${alt.json?.reason} ${alt.json?.detail}`);

    // Member 3 registering the pinned key too (the organizer issues another invite) does not help: the approved set now has 5 keys.
    const extra = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
    const fix = await w.register(extra.json.invites[0].code, w.voters[3]!);
    const again = await w.rollCommit(w.pinned);
    t.diagnostic(`after the pinned key is registered as well (${fix.status}): roll_commit over the pinned roll: ${again.status} ${again.json?.reason} ${again.json?.detail}`);

    // There is no route that removes or rejects a registered voter (QV-09 PATCH /voters/{kid} is not implemented).
    const kid = late.json?.voter_kid as string;
    const patch = await w.signed('PATCH', `/api/v1/elections/${w.electionId}/voters/${kid}`, { status: 'rejected' });
    const del = await w.signed('DELETE', `/api/v1/elections/${w.electionId}/voters/${kid}`);
    const state = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
    t.diagnostic(`remove the stray voter: PATCH ${patch.status}, DELETE ${del.status}; election phase stays ${state.phase}`);

    // EXPECTED (QV-04 §5.4 / REQ-009: eligibility fixed at manifest signing; QV-ADR-015: a pinned roll.root is the roll):
    // a key outside the pinned roll is refused, and the pinned roll can be committed.
    assert.notEqual(late.status, 201, 'a key outside the pinned manifest roll must not be approved after the manifest is published');
    assert.equal(ceremonyError, '', 'roll_commit over the roll pinned by the manifest must be admissible');
  } finally {
    await w.stop();
  }
});

test('S1-01 (no attacker needed): with a pinned roll, one member who never registers also blocks roll_commit', { timeout: 240_000 }, async (t) => {
  const w = new StaticRollWorld({ seed: 's1-static-roll-absent', n: 3, t: 2, voters: 4 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    w.pinned = w.voters.map((v) => H(v.publicKey)).sort();
    w.rollHex = w.pinned;
    assert.equal((await w.publishManifest()).status, 201);
    const inv = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 4 }, w.owner, w.idemKey());
    const codes: string[] = inv.json.invites.map((i: { code: string }) => i.code);
    for (let i = 0; i < 3; i++) assert.equal((await w.register(codes[i]!, w.voters[i]!)).status, 201); // member 3 never registers
    let ceremonyError = '';
    try {
      await w.ceremony();
    } catch (e) {
      ceremonyError = (e as Error).message;
    }
    t.diagnostic(`3 of 4 pinned members registered; roll_commit over the pinned roll: ${ceremonyError || 'accepted'}`);
    assert.equal(ceremonyError, '', 'the roll pinned by the signed manifest must be committable without every member redeeming an invite');
  } finally {
    await w.stop();
  }
});
