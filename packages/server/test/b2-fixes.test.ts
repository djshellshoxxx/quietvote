// Regression tests for consolidation findings B2-02 (import verification off the event loop, early duplicate refusal, budget),
// B2-16 (QV-31 log allowlist and minute rounding) and B2-11 (QV-28 §11.1 invite data retention).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { b64u } from '@quietvote/board';
import { bytesToHex, ed25519Sign, utf8 } from '@quietvote/crypto';
import { resolveConfig } from '../src/config.ts';
import { Logger, LOG_ALLOWLIST } from '../src/logger.ts';
import { exportQvb, fullElection, importAndWait, upload, waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;
const admin = kp('b2fix', 'admin');
const worlds: World[] = [];
async function target(server: Record<string, unknown> = {}, seed = `b2fix-${worlds.length}`): Promise<World> {
  const t = new World({ seed, n: 3, t: 2, voters: 1, server: { adminKeys: [H(admin.publicKey)], ...server } as never });
  await t.start();
  await t.setupOrgAndElection();
  worlds.push(t);
  return t;
}
after(async () => {
  for (const w of worlds) await w.stop();
});

// ------------------------------------------------------------------------------------------------ B2-02
describe_import();
function describe_import(): void {
  let A: World;
  let tar: Uint8Array;
  before(async () => {
    A = await fullElection('b2fix-src');
    worlds.push(A);
    tar = await exportQvb(A);
  }, { timeout: 120_000 });

  test('B2-02: a duplicate election id is refused before any proof verification runs', { timeout: 120_000 }, async () => {
    const t = await target({}, 'b2fix-dup');
    assert.equal((await importAndWait(t, tar)).state, 'done');
    assert.equal(t.server.env.stats.importVerifications, 1);
    const j = await importAndWait(t, tar);
    assert.equal(j.state, 'failed');
    assert.equal(j.error.rule, 'ELECTION_EXISTS');
    assert.equal(j.error.status, 409);
    assert.equal(t.server.env.stats.importVerifications, 1, 'the duplicate never reached verifyElection');
  });

  test('B2-02: proof verification does not block the event loop', { timeout: 120_000 }, async () => {
    const t = await target({}, 'b2fix-loop');
    const h = monitorEventLoopDelay({ resolution: 5 });
    h.enable();
    const job = await importAndWait(t, tar);
    h.disable();
    assert.equal(job.state, 'done');
    // the PoC measured ~1 s stalls for this bundle size; the worker keeps the main loop responsive (generous bound for slow CI)
    assert.ok(h.max / 1e6 < 600, `max event-loop lag ${h.max / 1e6} ms`);
  });

  test('B2-02: verification beyond its wall-clock budget is terminated and refused, leaving nothing behind', { timeout: 120_000 }, async () => {
    const t = await target({ importVerifyTimeoutMs: 1 }, 'b2fix-timeout');
    const before = t.server.env.control.countElections(t.orgId);
    const j = await importAndWait(t, tar);
    assert.equal(j.state, 'failed');
    assert.equal(j.error.code, 'IMPORT_REJECTED');
    assert.equal(j.error.rule, 'IMPORT_TIMEOUT');
    assert.equal(j.error.status, 503);
    assert.equal(t.server.env.control.countElections(t.orgId), before);
    assert.equal((await t.get(`/api/v1/elections/${A.electionId}`)).status, 404);
  });

  test('B2-02: with one import slot, a concurrent second import is refused 503 BUSY', { timeout: 120_000 }, async () => {
    const t = await target({ importQueueMax: 1 }, 'b2fix-conc');
    const [a, b] = await Promise.all([upload(t, tar), upload(t, tar)]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [202, 503]);
    const refused = a.status === 503 ? a : b;
    const accepted = a.status === 202 ? a : b;
    assert.equal(refused.json.code, 'BUSY');
    assert.ok(refused.headers.get('retry-after'));
    assert.equal((await waitJob(t, accepted.json.job_id)).state, 'done');
  });
}

// ------------------------------------------------------------------------------------------------ B2-16
test('B2-16: the logger emits only QV-31 allowlisted fields, minute-rounded, and counts what it drops', () => {
  const lines: string[] = [];
  let now = Date.UTC(2026, 10, 3, 12, 34, 56, 789);
  const log = new Logger((l) => lines.push(l), () => now);
  log.event('request', {
    request_id: 'rid', route: '/api/v1/elections/:id/log/entries', method: 'POST', status: 201, outcome: 'ok', error_code: 'X', bytes_in: 1234,
    latency_ms: 77, election_id: 'a'.repeat(32), seq: 5, entry_type: 'ballot', note: 'Canary Free Text!',
  });
  log.event('append', { seq: 7, entry_type: 'ballot', outcome: 'ok', tree_size: 8 }, true);
  log.event('append', { seq: 7, entry_type: 'notice', outcome: 'ok', tree_size: 8 }, false);
  now += 1000;
  log.limitHit('A');
  const recs = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  for (const r of recs) {
    for (const k of Object.keys(r)) assert.ok(LOG_ALLOWLIST.has(k), `field ${k} is not on the QV-31 allowlist`);
    assert.match(String(r['ts']), /^2026-11-03T12:34:00Z$/, 'timestamps are rounded to the minute');
    assert.ok(!('n' in r) && !('v' in r), 'no per-line counter');
  }
  assert.deepEqual(recs[0], { ts: '2026-11-03T12:34:00Z', event: 'request', level: 'info', route: '/api/v1/elections/:id/log/entries', status: 201, code: 'X', dur_bucket: '<250ms' });
  assert.ok(!('tree_size' in recs[1]!), 'voter-path appends carry no tree size');
  assert.equal(recs[2]!['tree_size'], 8);
  assert.equal(recs[3]!['component'], 'rate_A');
  assert.ok(log.droppedFields >= 6, `dropped ${log.droppedFields}`);
});

test('B2-16: live request and append lines contain only allowlisted fields and minute timestamps', { timeout: 60_000 }, async () => {
  const w = await target({}, 'b2fix-log');
  w.clock += 37_000;
  const from = w.logs.length;
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}`, { 'user-agent': 'canary-ua' })).status, 200);
  const lines = w.logs.slice(from).map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.ok(lines.some((l) => l['event'] === 'request'));
  for (const r of lines) {
    for (const k of Object.keys(r)) assert.ok(LOG_ALLOWLIST.has(k), `field ${k}`);
    assert.match(String(r['ts']), /:00Z$/);
  }
  const all = w.logs.join('\n');
  assert.ok(!all.includes(w.electionId) && !all.includes('canary-ua'));
});

// ------------------------------------------------------------------------------------------------ B2-11
const DAY = 86_400_000;
async function invite(w: World, items: { label: string; contact: string }[], expires_at?: string): Promise<{ invite_id: string; code: string }[]> {
  const r = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { items, ...(expires_at ? { expires_at } : {}) }, w.owner, w.idemKey());
  assert.equal(r.status, 201, r.text);
  return r.json.invites;
}
async function register(w: World, code: string, seed: string): Promise<void> {
  const v = kp('b2fix-reg', seed);
  const pop = ed25519Sign(v.secretKey, new Uint8Array([...utf8(`QV-REG-v1\0${w.electionId}\0`), ...v.publicKey]));
  const r = await w.req('POST', `/api/v1/elections/${w.electionId}/registrations`, { invite_code: code, pk: b64u(v.publicKey), alg: 'ed25519', pop: b64u(pop) });
  assert.equal(r.status, 201, r.text);
}
async function rows(w: World): Promise<{ label: string; state: string; l: number; c: number }[]> {
  const rt = (await w.server.pool.get(w.electionId))!;
  return rt.edb.db.prepare('SELECT label_enc AS label, state, label_enc IS NOT NULL AS l, contact_enc IS NOT NULL AS c FROM voter_invite ORDER BY created_at, invite_id').all() as never;
}

test('B2-11: invite labels/contacts are purged 7 d after register/revoke/expiry by the sweep, and not earlier', { timeout: 60_000 }, async () => {
  const w = await target({ retentionSweepMs: 0 }, 'b2fix-ret1');
  const exp = new Date(w.clock + DAY).toISOString();
  const inv = await invite(w, [{ label: 'Synthetic A', contact: 'a@example.invalid' }, { label: 'Synthetic B', contact: 'b@example.invalid' }]);
  inv.push(...(await invite(w, [{ label: 'Synthetic C', contact: 'c@example.invalid' }], exp)));
  inv.push(...(await invite(w, [{ label: 'Synthetic D', contact: 'd@example.invalid' }])));
  await register(w, inv[0]!.code, 'a');
  assert.equal((await w.signed('DELETE', `/api/v1/elections/${w.electionId}/invites/${inv[1]!.invite_id}`)).status, 204);
  const flags = async (): Promise<string> => (await rows(w)).map((r) => `${r.l}${r.c}`).sort().join(',');
  // registration drops the contact at once; everything else is still held
  assert.equal(await flags(), '10,11,11,11');
  w.clock += 5 * DAY;
  assert.equal(await w.server.retention.runOnce(), 0, 'nothing is due before the 7 d grace');
  assert.equal(await flags(), '10,11,11,11');
  w.clock += 3 * DAY; // 8 d after register/revoke; 7 d after C expired (it expired after 1 d, so 7 d is reached at day 8)
  assert.equal(await w.server.retention.runOnce(), 3, 'registered label, revoked label+contact, expired label+contact');
  assert.equal(await flags(), '00,00,00,11', 'the still-valid, unexpired invite D is not purged');
  const audit = w.server.env.control.db.prepare("SELECT detail FROM operator_audit WHERE action='invite.purge'").all() as { detail: string }[];
  assert.deepEqual(audit.map((a) => JSON.parse(a.detail)), [{ rows: 3 }], 'audit record carries a count only');
});

test('B2-11: invite data past retention is purged lazily when invites are accessed, with no sweep running', { timeout: 60_000 }, async () => {
  const w = await target({ retentionSweepMs: 0 }, 'b2fix-ret2');
  const inv = await invite(w, [{ label: 'Synthetic E', contact: 'e@example.invalid' }]);
  assert.equal((await w.signed('DELETE', `/api/v1/elections/${w.electionId}/invites/${inv[0]!.invite_id}`)).status, 204);
  w.clock += 8 * DAY;
  assert.equal((await w.signed('GET', `/api/v1/elections/${w.electionId}/invites`)).status, 200);
  assert.deepEqual((await rows(w)).map((r) => [r.state, r.l, r.c]), [['revoked', 0, 0]]);
});

test('B2-11: the retention grace is configurable within hard bounds', () => {
  assert.throws(() => resolveConfig({ dataDir: 'x', inviteRetentionMs: -1 }), /inviteRetentionMs/);
  assert.throws(() => resolveConfig({ dataDir: 'x', inviteRetentionMs: 31 * DAY }), /inviteRetentionMs/);
  assert.equal(resolveConfig({ dataDir: 'x' }).inviteRetentionMs, 7 * DAY);
});
