// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-12-REQ-003
import test from 'node:test';
import assert from 'node:assert/strict';
import { b64u } from '@quietvote/board';
import { bytesToHex, ed25519Sign, utf8, type Ed25519Keypair } from '@quietvote/crypto';
import { exportQvb, fullElection, upload, waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const admin = kp('admin-org-boundary', 'instance-admin');
const org = (w: World): string => `/api/v1/orgs/${w.orgId}`;
const election = (w: World): string => `/api/v1/elections/${w.electionId}`;
const options = {
  adminKeys: [bytesToHex(admin.publicKey)],
  webhookResolver: async () => [{ address: '93.184.216.34', family: 4 as const }],
  webhookTransport: async () => ({ status: 200, truncated: false }),
};

async function fixture(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 1, server: options });
  await w.start();
  await w.setupOrgAndElection();
  return w;
}

function keyBody(w: World, key: Ed25519Keypair, role: 'org_owner' | 'org_organizer') {
  const pop = ed25519Sign(key.secretKey, new Uint8Array([...utf8(`QV-KEY-v1\0${w.orgId}\0`), ...key.publicKey]));
  return { pk: b64u(key.publicKey), alg: 'ed25519', role, pop: b64u(pop) };
}

async function snapshot(w: World): Promise<unknown> {
  const c = w.server.env.control, rt = (await w.server.pool.get(w.electionId))!;
  return {
    keys: c.orgKeys(w.orgId).map(k => [k.key_id, k.role]),
    elections: c.listElections(w.orgId, undefined, undefined, 100).map(e => e.election_id),
    draft: rt.edb.row().draft, pinned: rt.edb.pinnedRoll()?.root ?? null,
    invites: rt.edb.invites(undefined, undefined, 100).map(i => [i.invite_id, i.state]),
    voters: rt.edb.voterCount(), tree: rt.log.size,
    webhooks: c.webhooksOf(w.orgId).map(h => h.webhook_id),
    exports: rt.edb.publicExports().map(e => [e.export_id, e.acknowledged_at, e.notice_at]),
    jobs: c.db.prepare('SELECT COUNT(*) AS n FROM job').get()!['n'],
  };
}

interface Mutation {
  method: string;
  path: string;
  body?: unknown;
  ownerStatus: number;
}
const mutations: [string, (w: World) => Mutation | Promise<Mutation>][] = [
  ...(['org_owner', 'org_organizer'] as const).map(role => [
    `grant ${role}`, (w: World): Mutation => ({ method: 'POST', path: `${org(w)}/keys`,
      body: keyBody(w, kp(w.o.seed, 'new-key'), role), ownerStatus: 201 }),
  ] as [string, (w: World) => Mutation]),
  ['revoke an organization key', async w => {
    const added = await w.signed('POST', `${org(w)}/keys`, keyBody(w, kp(w.o.seed, 'second-owner'), 'org_owner'));
    assert.equal(added.status, 201);
    return { method: 'DELETE', path: `${org(w)}/keys/${added.json.key_id}`, ownerStatus: 204 };
  }],
  ['create an election', w => ({ method: 'POST', path: `${org(w)}/elections`, body: { title: 'Organization draft' }, ownerStatus: 201 })],
  ['edit a draft', w => ({ method: 'PUT', path: `${election(w)}/draft`, body: { title: 'Organization edit' }, ownerStatus: 200 })],
  ['attach a pinned roll', w => ({ method: 'PUT', path: `${election(w)}/pinned-roll`,
    body: { pinned_roll: w.voters.map(v => bytesToHex(v.publicKey)).sort() }, ownerStatus: 200 })],
  ['mint invites', w => ({ method: 'POST', path: `${election(w)}/invites`, body: { count: 1 }, ownerStatus: 201 })],
  ['revoke an invite', async w => {
    const made = await w.signed('POST', `${election(w)}/invites`, { count: 1 }, w.owner, w.idemKey());
    assert.equal(made.status, 201);
    return { method: 'DELETE', path: `${election(w)}/invites/${made.json.invites[0].invite_id}`, ownerStatus: 204 };
  }],
  ['create a webhook', w => ({ method: 'POST', path: `${org(w)}/webhooks`,
    body: { url: 'https://hooks.example.test/events', events: ['entry'] }, ownerStatus: 201 })],
  ['delete a webhook', async w => {
    const made = await w.signed('POST', `${org(w)}/webhooks`, { url: 'https://hooks.example.test/events', events: ['entry'] }, w.owner, w.idemKey());
    assert.equal(made.status, 201);
    return { method: 'DELETE', path: `${org(w)}/webhooks/${made.json.webhook_id}`, ownerStatus: 204 };
  }],
];

for (const [name, prepare] of mutations) test(`instance admin cannot ${name}; organization owner still can`, async () => {
  const w = await fixture(`admin-boundary-${name}`);
  try {
    const request = await prepare(w), before = await snapshot(w);
    const refused = await w.signed(request.method, request.path, request.body, admin, w.idemKey());
    assert.equal(refused.status, 404, `${request.method} ${request.path}: ${refused.text}`);
    assert.equal(refused.json.code, 'NOT_FOUND');
    assert.deepEqual(await snapshot(w), before, 'authorization refusal must precede organization work');
    const accepted = await w.signed(request.method, request.path, request.body, w.owner, w.idemKey());
    assert.equal(accepted.status, request.ownerStatus, accepted.text);
  } finally { await w.stop(); }
});

test('organization organizers keep election management without obtaining owner powers', async () => {
  const w = await fixture('admin-boundary-organizer');
  try {
    const organizer = kp(w.o.seed, 'organizer');
    assert.equal((await w.signed('POST', `${org(w)}/keys`, keyBody(w, organizer, 'org_organizer'))).status, 201);
    assert.equal((await w.signed('POST', `${org(w)}/elections`, { title: 'Organizer draft' }, organizer, w.idemKey())).status, 201);
    assert.equal((await w.signed('PUT', `${election(w)}/draft`, { title: 'Organizer edit' }, organizer)).status, 200);
    const invite = await w.signed('POST', `${election(w)}/invites`, { count: 1 }, organizer, w.idemKey());
    assert.equal(invite.status, 201);
    assert.equal((await w.signed('DELETE', `${election(w)}/invites/${invite.json.invites[0].invite_id}`, undefined, organizer)).status, 204);
    assert.equal((await w.signed('POST', `${org(w)}/keys`, keyBody(w, kp(w.o.seed, 'forbidden-owner'), 'org_owner'), organizer)).status, 403);
    assert.equal((await w.signed('POST', `${org(w)}/webhooks`, { url: 'https://hooks.example.test/events', events: ['entry'] }, organizer, w.idemKey())).status, 403);
    assert.equal((await w.signed('DELETE', election(w), { confirm: 'Annual meeting' }, organizer)).status, 403);
  } finally { await w.stop(); }
});

test('instance admin retains explicit reads, confirmed election deletion and admin jobs', async () => {
  const w = await fixture('admin-boundary-retained');
  try {
    for (const path of [org(w), `${org(w)}/keys`, `${org(w)}/elections`, `${org(w)}/webhooks`,
      `${election(w)}/invites`, `${election(w)}/registration-migration`, '/api/v1/admin/status', '/api/v1/admin/elections']) {
      const read = await w.signed('GET', path, undefined, admin);
      assert.equal(read.status, 200, `${path}: ${read.text}`);
    }
    assert.equal((await w.signed('GET', '/api/v1/admin/status', undefined, w.owner)).status, 403);
    const backup = await w.signed('POST', '/api/v1/admin/backups', { scope: 'all' }, admin, w.idemKey());
    assert.equal(backup.status, 202, backup.text);
    assert.equal((await waitJob(w, backup.json.job_id, admin)).state, 'done');
    assert.equal((await w.signed('GET', `/api/v1/jobs/${backup.json.job_id}`, undefined, w.owner)).status, 404);
    assert.equal((await w.signed('DELETE', election(w), { confirm: 'Wrong title' }, admin)).status, 422);
    assert.equal((await w.get(election(w))).status, 200);
    assert.equal((await w.signed('DELETE', election(w), { confirm: 'Annual meeting' }, admin)).status, 202);
    assert.equal((await w.get(election(w))).status, 404);
    const made = await w.signed('POST', `${org(w)}/elections`, { title: 'Admin route deletion' }, w.owner, w.idemKey());
    assert.equal(made.status, 201);
    const removed = await w.signed('DELETE', `/api/v1/admin/elections/${made.json.election_id}`, { confirm: 'Admin route deletion' }, admin, w.idemKey());
    assert.equal(removed.status, 202, removed.text);
    assert.equal((await waitJob(w, removed.json.job_id, admin)).state, 'done');
    assert.equal((await w.get(`/api/v1/elections/${made.json.election_id}`)).status, 404);
  } finally { await w.stop(); }
});

test('recorded export writes require the organization; admin export reads and imports remain available', { timeout: 180_000 }, async t => {
  const w = await fullElection('admin-boundary-exports', { server: options });
  try {
    const created = await w.signed('POST', `${election(w)}/exports`, { kind: 'public' }, w.owner, w.idemKey());
    assert.equal(created.status, 202, created.text);
    const job = await waitJob(w, created.json.job_id);
    assert.equal(job.state, 'done');
    const record = (await w.signed('GET', job.result_ref)).json;
    const binding = { tree_size: record.tree_size, root_hash: record.root_hash, sha256: record.sha256 };
    const writes: [string, string, unknown][] = [
      ['create', `${election(w)}/exports`, { kind: 'public' }],
      ['acknowledge', record.acknowledgement_url, binding],
      ['publish a deletion notice', record.deletion_notice_url, binding],
    ];
    for (const [name, path, body] of writes) await t.test(`instance admin cannot ${name}`, async () => {
      const before = await snapshot(w);
      const refused = await w.signed('POST', path, body, admin, w.idemKey());
      assert.equal(refused.status, 404, refused.text);
      assert.equal(refused.json.code, 'NOT_FOUND');
      assert.deepEqual(await snapshot(w), before);
    });
    await t.test('admin can read organization exports and other creators\' jobs', async () => {
      for (const path of [`${election(w)}/exports`, job.result_ref, record.download_url, `/api/v1/jobs/${created.json.job_id}`]) {
        assert.equal((await w.signed('GET', path, undefined, admin)).status, 200, path);
      }
      assert.equal((await w.signed('POST', record.acknowledgement_url, binding, w.owner, w.idemKey())).status, 200);
      assert.equal((await w.signed('POST', record.deletion_notice_url, binding, w.owner, w.idemKey())).status, 200);
      assert.equal((await w.get(election(w))).status, 200);
    });
    await t.test('admin imports an existing public snapshot into an explicit organization', async () => {
      const target = await fixture('admin-boundary-import');
      try {
        const archive = await exportQvb(w);
        const result = await upload(target, archive, { key: admin });
        assert.equal(result.status, 202, result.text);
        const imported = await waitJob(target, result.json.job_id, admin);
        assert.equal(imported.state, 'done', JSON.stringify(imported));
        assert.equal(imported.result.election_id, w.electionId);
        assert.equal((await target.get(`/api/v1/elections/${w.electionId}`)).json.state, 'IMPORTED');
        assert.equal(target.server.env.control.election(w.electionId)?.org_id, target.orgId);
      } finally { await target.stop(); }
    });
  } finally { await w.stop(); }
});
