// QV-ADR-027 server items: B2-10 (default invite expiry, invite-creation side only), N-20 (QV-Sig only; QV-09 /auth/* retired),
// N-32(b) (ARCHIVED deletion needs an acknowledged public export or a 30-day grace, QV-28 §11.2). N-32(a) is in audit.test.ts (SRV-002).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { b64u } from '@quietvote/board';
import { bytesToHex, sha256 } from '@quietvote/crypto';
import { readTar, signRequest } from '../src/index.ts';
import { INVITE_DEFAULT_TTL_MS } from '../src/app.ts';
import { archiveExportUnmet, EXPORT_ACK_GRACE_MS } from '../src/pool.ts';
import { fullElection, waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;
const DAY = 86_400_000;
const admin = kp('adr027-c2', 'admin');
const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.stop();
});

// ------------------------------------------------------------------------------------------------ B2-10 (invite creation)

test('B2-10: an invite without expires_at gets the 14-day default (QV-02-REQ-010); an explicit expires_at is kept', { timeout: 60_000 }, async () => {
  const w = new World({ seed: 'adr027-b210', n: 3, t: 2, voters: 1, server: { retentionSweepMs: 0 } as never });
  await w.start();
  worlds.push(w);
  await w.setupOrgAndElection();
  assert.equal(INVITE_DEFAULT_TTL_MS, 14 * DAY);
  const t0 = w.clock;
  const a = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { items: [{ label: 'Synthetic default', contact: 'd@example.invalid' }] }, w.owner, w.idemKey());
  assert.equal(a.status, 201, a.text);
  const explicit = new Date(t0 + 2 * DAY).toISOString().replace('.000Z', 'Z');
  const b = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1, expires_at: explicit }, w.owner, w.idemKey());
  assert.equal(b.status, 201, b.text);
  const list = (await w.signed('GET', `/api/v1/elections/${w.electionId}/invites`)).json.items as { invite_id: string; expires_at: string | null }[];
  const byId = new Map(list.map((i) => [i.invite_id, i.expires_at]));
  assert.equal(byId.get(a.json.invites[0].invite_id), new Date(t0 + 14 * DAY).toISOString().replace('.000Z', 'Z'), 'default TTL is 14 days');
  assert.equal(byId.get(b.json.invites[0].invite_id), explicit, 'explicit expiry is not replaced by the default');
  assert.ok(list.every((i) => i.expires_at !== null), 'no invite is created without an expiry (no permanent bearer tokens)');
  // the default expiry also starts the QV-28 §11.1 retention clock: label/contact are kept until expiry + 7 d, then purged
  const flags = async (): Promise<number> => {
    const rt = (await w.server.pool.get(w.electionId))!;
    return (rt.edb.db.prepare('SELECT COUNT(*) AS n FROM voter_invite WHERE invite_id=? AND label_enc IS NOT NULL').get(a.json.invites[0].invite_id) as { n: number }).n;
  };
  w.clock = t0 + 20 * DAY;
  await w.server.retention.runOnce();
  assert.equal(await flags(), 1, 'not purged before expiry + 7 d');
  w.clock = t0 + 21 * DAY + 1;
  await w.server.retention.runOnce();
  assert.equal(await flags(), 0, 'purged 7 d after the default expiry');
  // a bad explicit expiry is still refused
  assert.equal((await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1, expires_at: 'not-a-date' }, w.owner, w.idemKey())).status, 400);
});

// ------------------------------------------------------------------------------------------------ N-20

test('N-20: the retired QV-09 /auth/* challenge and session routes do not exist', async () => {
  const w = new World({ seed: 'adr027-n20', n: 3, t: 2, voters: 0 });
  await w.start();
  worlds.push(w);
  await w.setupOrgAndElection();
  for (const [m, p] of [['POST', '/api/v1/auth/challenge'], ['POST', '/api/v1/auth/session'], ['DELETE', '/api/v1/auth/session']] as const) {
    const r = await w.req(m, p, m === 'POST' ? { key_id: 'x'.repeat(22) } : undefined);
    assert.equal(r.status, 404, `${m} ${p}`);
    const s = await w.signed(m, p, m === 'POST' ? { key_id: 'x'.repeat(22) } : undefined);
    assert.equal(s.status, 404, `${m} ${p} (signed)`);
  }
  // a management call with a bearer token instead of QV-Sig is unauthenticated
  const bearer = await w.req('GET', `/api/v1/elections/${w.electionId}/invites`, undefined, { headers: { authorization: 'Bearer qvs_' + 'a'.repeat(43) } });
  assert.equal(bearer.status, 401);
  assert.equal(bearer.json.code, 'UNAUTHENTICATED');
});

// ------------------------------------------------------------------------------------------------ N-16 / N-21 (decisions pinned)

test('N-16: rate-limit headers keep the early-draft RateLimit-Limit/-Remaining/-Reset names (E-002, D-90 option A)', async () => {
  const w = worlds[0]!;
  const r = await w.get('/api/v1/instance');
  assert.equal(r.status, 200);
  for (const h of ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset']) assert.match(r.headers.get(h) ?? '', /^\d+$/, h);
  assert.equal(r.headers.get('ratelimit-policy'), null, 'current-draft names are not emitted yet');
  assert.equal(r.headers.get('ratelimit'), null);
  assert.match(r.headers.get('access-control-expose-headers') ?? '', /RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset/);
});

test('N-21: no automatic close scheduler in the MVP; the window ends only when the coordinator posts election_close', { timeout: 120_000 }, async () => {
  const w = await fullElection('adr027-n21', { stopAt: 'OPEN' });
  worlds.push(w);
  w.clock = Date.UTC(2026, 10, 10, 12, 0, 0); // two days after the manifest's voting_close
  await w.server.retention.runOnce();
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'OPEN', 'the server does not close on its own');
  assert.notEqual((await w.cast(0, { budget: ['no'], chair: ['bob'] })).status, 201, 'but ballots outside the window are refused');
  assert.equal((await w.close()).status, 201);
  assert.notEqual((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'OPEN');
});

// ------------------------------------------------------------------------------------------------ N-32(b)

let A: World;
before(async () => {
  A = await fullElection('adr027-n32b', { server: { adminKeys: [H(admin.publicKey)] } });
  worlds.push(A);
}, { timeout: 240_000 });

async function signedBytes(w: World, path: string, key = w.owner): Promise<{ status: number; bytes: Uint8Array; text: string }> {
  const headers = { authorization: signRequest(key.secretKey, key.publicKey, 'GET', path, w.audience, new Uint8Array(0), w.nowSec, w.rng.bytes(16)) };
  const r = await fetch(w.base + path, { headers });
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, bytes, text: new TextDecoder().decode(bytes) };
}

test('N-32(b): an ARCHIVED election is deleted only after its public export is acknowledged (or 30 days), QV-28 §11.2', { timeout: 120_000 }, async () => {
  const w = A;
  const id = w.electionId;
  assert.equal((await w.get(`/api/v1/elections/${id}/state`)).json.phase, 'ARCHIVED');
  const del = (key = w.owner, extra: Record<string, string> = {}) => w.signed('DELETE', `/api/v1/elections/${id}`, { confirm: 'Annual meeting' }, key, extra);
  const adminDel = () => w.signed('DELETE', `/api/v1/admin/elections/${id}`, { confirm: 'Annual meeting' }, admin, w.idemKey());

  // no export at all: both delete paths refuse with the unmet condition
  for (const r of [await del(), await adminDel()]) {
    assert.equal(r.status, 409, r.text);
    assert.equal(r.json.code, 'STATE_CONFLICT');
    assert.match(r.json.detail, /unmet condition: a public export of the final log must exist/);
  }

  // POST /exports: signed, org-scoped, Idempotency-Key required, public only
  const exportsPath = `/api/v1/elections/${id}/exports`;
  assert.equal((await w.req('POST', exportsPath, { kind: 'public' }, { headers: w.idemKey() })).status, 401);
  assert.equal((await w.signed('POST', exportsPath, { kind: 'public' })).status, 400, 'Idempotency-Key is required');
  const op = await w.signed('POST', exportsPath, { kind: 'operator' }, w.owner, w.idemKey());
  assert.equal(op.status, 422);
  assert.equal((await w.signed('POST', exportsPath, { kind: 'public', include_contacts: true }, w.owner, w.idemKey())).status, 422);
  assert.equal((await w.signed('POST', exportsPath, { kind: 'nope' }, w.owner, w.idemKey())).status, 400);
  const other = kp('adr027-n32b', 'other-org');
  const org2 = await w.req('POST', '/api/v1/orgs', { name: 'Other', owner_key: { pk: b64u(other.publicKey), alg: 'ed25519' } }, { key: other, headers: w.idemKey() });
  assert.equal(org2.status, 201, org2.text);
  assert.equal((await w.signed('POST', exportsPath, { kind: 'public' }, other, w.idemKey())).status, 404, 'cross-org export looks like 404');

  const created = await w.signed('POST', exportsPath, { kind: 'public' }, w.owner, w.idemKey());
  assert.equal(created.status, 202, created.text);
  const job = await waitJob(w, created.json.job_id);
  assert.equal(job.state, 'done', JSON.stringify(job));
  const exportId: string = job.result.export_id;
  assert.equal(job.result_ref, `${exportsPath}/${exportId}`);
  const recPath = `${exportsPath}/${exportId}`;
  const recR = await w.signed('GET', recPath);
  assert.equal(recR.status, 200, recR.text);
  const rec = recR.json;
  const rt = (await w.server.pool.get(id))!;
  assert.equal(rec.kind, 'public');
  assert.equal(rec.tree_size, rt.log.size);
  assert.equal(rec.root_hash, H(rt.log.root()));
  assert.equal(rec.acknowledged_at, null);
  assert.equal(rec.download_url, `${recPath}/download`);
  assert.equal((await w.signed('GET', recPath, undefined, other)).status, 404);
  assert.equal((await w.get(recPath)).status, 401);
  assert.equal((await w.signed('GET', `${exportsPath}/${'a'.repeat(26)}`)).status, 404);

  // generated but not acknowledged: still refused, and the grace is exactly 30 days after generation
  const r1 = await del();
  assert.equal(r1.status, 409);
  assert.match(r1.json.detail, /must be downloaded by the organizer/);
  const createdMs = Date.parse(rec.created_at);
  assert.equal(EXPORT_ACK_GRACE_MS, 30 * DAY);
  assert.notEqual(archiveExportUnmet(rt, createdMs + 30 * DAY - 1), undefined, 'not before 30 days');
  assert.equal(archiveExportUnmet(rt, createdMs + 30 * DAY), undefined, 'the 30-day grace after generation suffices');

  // an acknowledged export of an older tree (before audit_close) does not cover the final log
  rt.edb.addExport({ export_id: 'f'.repeat(26), kind: 'public', tree_size: rt.log.size - 1, root_hash: rt.log.root(rt.log.size - 1), sha256: new Uint8Array(32), created_at: w.clock });
  rt.edb.acknowledgeExport('f'.repeat(26), w.clock);
  assert.notEqual(archiveExportUnmet(rt, w.clock), undefined, 'an export of an older tree does not count');
  // a record whose bundle no longer reproduces is not downloadable and is not acknowledged
  rt.edb.addExport({ export_id: 'e'.repeat(26), kind: 'public', tree_size: rt.log.size, root_hash: rt.log.root(), sha256: new Uint8Array(32), created_at: w.clock });
  const stale = await signedBytes(w, `${exportsPath}/${'e'.repeat(26)}/download`);
  assert.equal(stale.status, 409, stale.text);
  assert.equal(rt.edb.exportById('e'.repeat(26))!.acknowledged_at, null);
  assert.equal((await del()).status, 409, 'a failed download acknowledges nothing');

  // download: unsigned / other org refused (and acknowledge nothing); the organizer download returns the recorded bytes and acks
  assert.equal((await fetch(w.base + rec.download_url)).status, 401);
  assert.equal((await signedBytes(w, rec.download_url, other)).status, 404);
  assert.equal(rt.edb.exportById(exportId)!.acknowledged_at, null);
  const dl = await signedBytes(w, rec.download_url);
  assert.equal(dl.status, 200, dl.text);
  assert.equal(H(sha256(dl.bytes)), rec.sha256, 'downloaded bytes hash to the recorded sha256');
  const files = readTar(dl.bytes);
  assert.ok(files.has('bundle.json') && files.has('log/entries.jsonl'));
  assert.equal(JSON.parse(new TextDecoder().decode(files.get('bundle.json')!)).tree_size, rec.tree_size);
  const acked = (await w.signed('GET', recPath)).json;
  assert.equal(typeof acked.acknowledged_at, 'string');
  assert.ok(w.server.env.control.auditRows().some((a) => a.action === 'export.acknowledge' && a.target === id));

  // the download link expires after 7 days (the acknowledgement stays)
  w.clock += 8 * DAY;
  const late = await signedBytes(w, rec.download_url);
  assert.equal(late.status, 409);
  assert.match(late.text, /expired/);
  assert.equal((await w.signed('GET', recPath)).json.acknowledged_at, acked.acknowledged_at);

  // acknowledged: the organizer delete now proceeds
  const ok = await del();
  assert.equal(ok.status, 202, ok.text);
  assert.equal((await w.get(`/api/v1/elections/${id}`)).status, 404);
  assert.equal(w.server.env.control.electionAny(id)!.state, 'DELETED');
});
