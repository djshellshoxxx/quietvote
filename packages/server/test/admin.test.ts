// /admin/* (QV-09 §10): authorization (single decision point, QV-08 signed requests as recommended in D-84), status, listing,
// online backups, self-audit with quarantine, deletion jobs, job bounds.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { b64u, cosignLine } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;
const admin = kp('admin', 'admin1');
const admin2 = kp('admin', 'admin2');
let w: World;

before(async () => {
  w = new World({ seed: 'admin', n: 3, t: 2, voters: 2, witnessQuorum: 0, server: { adminKeys: [H(admin.publicKey), H(admin2.publicKey)] } as never });
  await w.start();
  await w.setupOrgAndElection();
  await w.publishManifest();
  await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  await w.ok('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
}, { timeout: 60_000 });
after(async () => {
  await w.stop();
});

const A = (method: string, path: string, body?: unknown, key = admin, idem = true) => w.signed(method, path, body, key, idem ? w.idemKey() : {});
const id = (): string => w.electionId;

test('authorization: only registered instance_admin keys; everyone else is refused before any work happens', async () => {
  const stranger = kp('admin', 'stranger');
  const routes: [string, string, unknown][] = [
    ['GET', '/api/v1/admin/status', undefined],
    ['GET', '/api/v1/admin/elections', undefined],
    ['POST', '/api/v1/admin/backups', { scope: 'all' }],
    ['POST', `/api/v1/admin/elections/${id()}/self-audit`, undefined],
    ['POST', `/api/v1/admin/elections/${id()}/quarantine/clear`, { ack: 'inc_aaaaaaaa', verified_against: ['witness:w1'] }],
    ['DELETE', `/api/v1/admin/elections/${id()}`, { confirm: 'Annual meeting' }],
  ];
  for (const [m, p, b] of routes) {
    assert.equal((await w.req(m, p, b, { headers: w.idemKey() })).status, 401, `${m} ${p} anonymous`);
    assert.equal((await w.signed(m, p, b, stranger, w.idemKey())).status, 401, `${m} ${p} unknown key`);
    assert.equal((await w.signed(m, p, b, w.owner, w.idemKey())).status, 403, `${m} ${p} org owner`);
    const t = await w.req(m, p, b, { headers: { ...w.idemKey(), authorization: 'Bearer qvs_notasessiontoken' } });
    assert.equal(t.status, 401, `${m} ${p} bearer tokens are not accepted`);
  }
  assert.equal((await w.signed('GET', '/api/v1/admin/status', undefined, admin)).status, 200);
  assert.equal((await w.signed('GET', '/api/v1/admin/status', undefined, admin2)).status, 200);
  // an organizer key (registered through the API) is not an admin either
  const org2 = kp('admin', 'org2');
  const pop = (await import('@quietvote/crypto')).ed25519Sign(org2.secretKey, new Uint8Array([...new TextEncoder().encode(`QV-KEY-v1\0${w.orgId}\0`), ...org2.publicKey]));
  const add = await w.signed('POST', `/api/v1/orgs/${w.orgId}/keys`, { pk: b64u(org2.publicKey), alg: 'ed25519', role: 'org_organizer', pop: b64u(pop) });
  assert.equal(add.status, 201, add.text);
  assert.equal((await w.signed('GET', '/api/v1/admin/status', undefined, org2)).status, 403);
  // admin responses are never cacheable / cross-origin readable
  const r = await w.signed('GET', '/api/v1/admin/status', undefined, admin);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('status: shape, counts, backup time, disk, migrations; no secrets', async () => {
  const r = await A('GET', '/api/v1/admin/status', undefined, admin, false);
  assert.equal(r.status, 200);
  const s = r.json;
  assert.equal(typeof s.instance_id, 'string');
  assert.ok(s.db.elections >= 1);
  assert.equal(s.db.by_state.CEREMONY, 1);
  assert.deepEqual(s.quarantined, []);
  assert.equal(s.backups.last_at, null);
  assert.ok(s.disk.free_bytes === null || s.disk.free_bytes > 0);
  assert.equal(s.migrations.control, 4);
  const txt = JSON.stringify(s);
  assert.ok(!/dek|secret|kek|read_key|log_sk/i.test(txt));
});

test('election listing: pagination, state filter, strict parameters, registry columns only', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: `Extra ${i}` }, w.owner, w.idemKey())).status, 201);
  const all: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const r: any = await A('GET', `/api/v1/admin/elections?limit=2${cursor ? `&cursor=${cursor}` : ''}`, undefined, admin, false);
    assert.equal(r.status, 200);
    assert.ok(r.json.items.length <= 2);
    all.push(...r.json.items);
    cursor = r.json.next_cursor;
    pages++;
  } while (cursor);
  assert.ok(pages >= 2);
  assert.equal(new Set(all.map((x) => x.election_id)).size, all.length);
  assert.ok(all.length >= 4);
  assert.deepEqual(Object.keys(all[0]).sort(), ['access', 'bytes_used', 'created_at', 'election_id', 'imported', 'org_id', 'quarantined', 'state', 'title']);
  const drafts = (await A('GET', '/api/v1/admin/elections?state=DRAFT', undefined, admin, false)).json.items;
  assert.ok(drafts.length >= 3 && drafts.every((x: any) => x.state === 'DRAFT'));
  assert.equal((await A('GET', '/api/v1/admin/elections?state=draft', undefined, admin, false)).status, 400);
  assert.equal((await A('GET', "/api/v1/admin/elections?state=X%27%20OR%201=1", undefined, admin, false)).status, 400);
  assert.equal((await A('GET', '/api/v1/admin/elections?cursor=nope', undefined, admin, false)).json.code, 'INVALID_CURSOR');
  assert.equal((await A('GET', '/api/v1/admin/elections?limit=0', undefined, admin, false)).status, 200);
  assert.equal((await A('GET', '/api/v1/admin/elections?limit=501', undefined, admin, false)).status, 400);
  assert.equal((await A('GET', '/api/v1/admin/elections?x=1', undefined, admin, false)).status, 400);
});

test('backups: consistent online snapshots, private files, checksummed manifest, no KEK; strict requests; idempotent', { timeout: 60_000 }, async () => {
  const body = { scope: 'all' };
  assert.equal((await A('POST', '/api/v1/admin/backups', body, admin, false)).status, 400, 'Idempotency-Key required');
  const key = w.idemKey();
  const r1 = await w.signed('POST', '/api/v1/admin/backups', body, admin, key);
  assert.equal(r1.status, 202, r1.text);
  const r2 = await w.signed('POST', '/api/v1/admin/backups', body, admin, key);
  assert.equal(r2.headers.get('idempotent-replay'), 'true');
  assert.equal(r2.json.job_id, r1.json.job_id);
  const mismatch = await w.signed('POST', '/api/v1/admin/backups', { scope: 'election', election_id: id() }, admin, key);
  assert.equal(mismatch.status, 422);
  const job = await waitJob(w, r1.json.job_id, admin);
  assert.equal(job.state, 'done', JSON.stringify(job));
  assert.equal(job.result_ref, `backups/${r1.json.job_id}`);
  const dir = join(w.dir, job.result_ref);
  if (process.platform !== 'win32') assert.equal(statSync(dir).mode & 0o777, 0o700); // POSIX modes do not exist on Windows
  const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  assert.equal(man.format, 'qv-backup/v1');
  assert.ok(man.files.some((f: any) => f.name === 'control.sqlite'));
  assert.ok(man.files.length >= 5, 'control + every election');
  for (const f of man.files) {
    assert.equal(createHash('sha256').update(readFileSync(join(dir, f.name))).digest('hex'), f.sha256);
    if (process.platform !== 'win32') assert.equal(statSync(join(dir, f.name)).mode & 0o777, 0o600);
    const d = new DatabaseSync(join(dir, f.name), { readOnly: true });
    assert.equal((d.prepare('PRAGMA quick_check').get() as any).quick_check, 'ok');
    d.close();
  }
  assert.ok(!readdirSync(dir, { recursive: true }).some((n) => String(n).includes('kek')));
  assert.ok(!existsSync(join(dir, 'kek')));
  const elFile = man.files.find((f: any) => f.name.endsWith(`${id()}.sqlite`));
  const d = new DatabaseSync(join(dir, elFile.name), { readOnly: true });
  assert.equal((d.prepare('SELECT COUNT(*) AS n FROM log_entry').get() as any).n, (await w.get(`/api/v1/elections/${id()}`)).json.tree_size);
  d.close();
  // status now knows the backup time
  assert.match((await A('GET', '/api/v1/admin/status', undefined, admin, false)).json.backups.last_at, /^20\d\d-/);
  // election scope
  const r3 = await A('POST', '/api/v1/admin/backups', { scope: 'election', election_id: id() });
  const j3 = await waitJob(w, r3.json.job_id, admin2);
  assert.equal(j3.state, 'done');
  assert.equal(readdirSync(join(w.dir, j3.result_ref)).filter((n) => n.endsWith('.sqlite')).length, 1);
  // strictness
  for (const [b, st] of [
    [{ scope: 'election' }, 400], [{ scope: 'all', election_id: id() }, 400], [{ scope: 'nope' }, 400], [{}, 400], [{ scope: 'all', path: '/etc' }, 400],
    [{ scope: 'election', election_id: '../../etc/passwd' }, 400], [{ scope: 'election', election_id: 'a'.repeat(32) }, 404], [[], 400],
  ] as [unknown, number][]) assert.equal((await A('POST', '/api/v1/admin/backups', b)).status, st, JSON.stringify(b));
  assert.equal((await w.signed('GET', `/api/v1/jobs/${r1.json.job_id}`, undefined, w.owner)).status, 404, 'the org owner cannot see admin jobs');
});

test('admin jobs are bounded: excess submissions get 503 BUSY with Retry-After; accepted ones all finish', { timeout: 60_000 }, async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => A('POST', '/api/v1/admin/backups', { scope: 'election', election_id: id() })));
  const ok = results.filter((r) => r.status === 202);
  const busy = results.filter((r) => r.status === 503);
  assert.ok(ok.length >= 1 && busy.length >= 1, `${ok.length} accepted, ${busy.length} refused`);
  assert.equal(ok.length + busy.length, 10);
  for (const r of busy) {
    assert.equal(r.json.code, 'BUSY');
    assert.ok(r.headers.get('retry-after'));
  }
  for (const r of ok) assert.equal((await waitJob(w, r.json.job_id, admin)).state, 'done');
});

test('self-audit: clean log passes; a tampered body is found at its seq, the log is quarantined, and clearing needs a clean re-audit', { timeout: 60_000 }, async () => {
  const r = await A('POST', `/api/v1/admin/elections/${id()}/self-audit`);
  assert.equal(r.status, 202);
  const clean = await waitJob(w, r.json.job_id, admin);
  assert.equal(clean.state, 'done');
  assert.equal(clean.result.ok, true);
  assert.equal(clean.result.tree_size, 3);
  assert.deepEqual(clean.result.failures, []);
  assert.equal((await A('POST', `/api/v1/admin/elections/${'b'.repeat(32)}/self-audit`)).status, 404);
  assert.equal((await A('POST', '/api/v1/admin/elections/not-an-id/self-audit')).status, 404);

  // flip a byte of a stored body behind the server's back (bit rot / tampering with the file)
  const rt = (await w.server.pool.get(id()))!;
  const reg = w.server.env.control.election(id())!;
  const dbPath = join(w.dir, reg.db_path);
  const raw = new DatabaseSync(dbPath);
  const orig = (raw.prepare('SELECT body FROM log_entry WHERE seq=1').get() as { body: Uint8Array }).body;
  const bad = new Uint8Array(orig);
  bad[bad.length - 5] = bad[bad.length - 5]! ^ 0x20;
  raw.exec('DROP TRIGGER log_entry_noupdate');
  raw.prepare('UPDATE log_entry SET body=? WHERE seq=1').run(bad);
  raw.close();
  const a2 = await A('POST', `/api/v1/admin/elections/${id()}/self-audit`);
  const found = await waitJob(w, a2.json.job_id, admin);
  assert.equal(found.state, 'done');
  assert.equal(found.result.ok, false);
  assert.equal(found.result.failures[0].seq, 1);
  assert.equal(found.result.failures[0].rule, 'BODY_DIGEST');
  assert.equal(found.result.quarantined, true);
  assert.match(found.result.incident, /^inc_/);
  // fail closed
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-close', w.mh))).status, 503);
  assert.equal((await w.get(`/api/v1/elections/${id()}/state`)).json.integrity, 'quarantined');
  const st = (await A('GET', '/api/v1/admin/status', undefined, admin, false)).json;
  assert.deepEqual(st.quarantined, [id()]);
  assert.equal(st.quarantine_incidents[0].code, 'SELF_AUDIT_MISMATCH');
  assert.equal((await A('GET', '/api/v1/admin/elections?state=CEREMONY', undefined, admin, false)).json.items[0].quarantined, true);
  // witness cosigns, ack is right - but the audit still fails, so the clear is refused
  const note = (await w.get(`/api/v1/elections/${id()}/log/checkpoint`)).text;
  const wk = w.witnesses[0]!;
  assert.equal((await w.req('POST', `/api/v1/elections/${id()}/log/cosignatures`, { checkpoint_size: 3, lines: [cosignLine('w1', wk.secretKey, wk.publicKey, note.slice(0, note.indexOf('\n\n') + 1), w.nowSec)] })).status, 200);
  const clearPath = `/api/v1/admin/elections/${id()}/quarantine/clear`;
  const refused = await A('POST', clearPath, { ack: found.result.incident, verified_against: ['witness:w1'] });
  assert.equal(refused.status, 409);
  // The flipped byte lands in a different field per run (keys are random), so a fresh replay refuses in one of three
  // ways: audit failure, no re-open, or replay-time quarantine. All three refuse the clear (409); the follow-up below proves it is only lifted once the body is restored.
  assert.match(refused.json.detail, /self-audit still fails \(BODY_DIGEST at seq 1\)|cannot be re-opened|still inconsistent after a fresh replay/);
  // restore the body: the clear now succeeds and appends resume
  const fix = new DatabaseSync(dbPath);
  fix.prepare('UPDATE log_entry SET body=? WHERE seq=1').run(orig);
  fix.close();
  const cleared = await A('POST', clearPath, { ack: found.result.incident, verified_against: ['witness:w1'] });
  assert.equal(cleared.status, 200, cleared.text);
  assert.equal((await w.get(`/api/v1/elections/${id()}/state`)).json.integrity, 'ok');
  assert.equal((await w.post('notice', w.coord[0]!, w.marker('dkg-r1-close', w.mh))).status, 201);
  void rt;
});

test('deletion: confirm, state preconditions, async job, tombstone', { timeout: 60_000 }, async () => {
  const items = (await A('GET', '/api/v1/admin/elections?state=DRAFT', undefined, admin, false)).json.items as { election_id: string; title: string }[];
  const d = items[0]!;
  const path = `/api/v1/admin/elections/${d.election_id}`;
  assert.equal((await A('DELETE', path, { confirm: 'wrong title' })).status, 422);
  assert.equal((await A('DELETE', path, {})).status, 400);
  assert.equal((await A('DELETE', path, { confirm: d.title, x: 1 })).status, 400);
  assert.equal((await w.signed('DELETE', path, { confirm: d.title }, w.owner, w.idemKey())).status, 403);
  assert.equal((await A('DELETE', path, { confirm: d.title }, admin, false)).status, 400);
  assert.equal((await A('DELETE', `/api/v1/admin/elections/${'c'.repeat(32)}`, { confirm: 'x' })).status, 404);
  // an election in CEREMONY (the one with entries) is not deletable
  const busy = await A('DELETE', `/api/v1/admin/elections/${id()}`, { confirm: 'Annual meeting' });
  assert.equal(busy.status, 409);
  assert.match(busy.json.detail, /state must be/);
  const key = w.idemKey();
  const r = await w.signed('DELETE', path, { confirm: d.title }, admin, key);
  assert.equal(r.status, 202, r.text);
  const again = await w.signed('DELETE', path, { confirm: d.title }, admin, key);
  assert.equal(again.json.job_id, r.json.job_id);
  const job = await waitJob(w, r.json.job_id, admin);
  assert.equal(job.state, 'done', JSON.stringify(job));
  assert.equal(job.result.state, 'DELETED');
  assert.equal((await w.get(`/api/v1/elections/${d.election_id}`)).status, 404);
  assert.equal(w.server.env.control.electionAny(d.election_id)!.state, 'DELETED');
  assert.ok(w.server.env.control.auditRows().some((a) => a.action === 'election.delete' && a.target === d.election_id));
  assert.ok(!(await A('GET', '/api/v1/admin/elections', undefined, admin, false)).json.items.some((x: any) => x.election_id === d.election_id));
  assert.equal((await A('DELETE', path, { confirm: d.title })).status, 404);
});
