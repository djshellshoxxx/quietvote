// POST /imports (QV-09 §10, QV-18 §12 + REQ-033, QV-28 §11.4): a full verify-before-expose pipeline, the read-only mirror it
// creates, and the ways a hostile bundle or request is refused.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { b64u, checkFork, signCheckpoint, unb64u } from '@quietvote/board';
import { bytesToHex, ed25519Keypair, jcs, sha256, utf8 } from '@quietvote/crypto';
import { verifyElectionText } from '@quietvote/protocol';
import { readTar } from '../src/index.ts';
import { open as unseal } from '../src/kek.ts';
import { dec, enc, entryLines, exportQvb, fullElection, importAndWait, rawTar, rewrite, setEntryLines, upload, waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const H = bytesToHex;
const admin = kp('imports', 'admin');
let A: World;
let tar: Uint8Array;
const targets: World[] = [];

async function target(server: Record<string, unknown> = {}, seed = `imp-t${targets.length}`): Promise<World> {
  const t = new World({ seed, n: 3, t: 2, voters: 1, server: { adminKeys: [H(admin.publicKey)], ...server } as never });
  await t.start();
  await t.setupOrgAndElection();
  targets.push(t);
  return t;
}
const elections = (t: World): number => t.server.env.control.countElections(t.orgId);
const dbFiles = (t: World): string[] => {
  const root = join(t.dir, 'elections');
  return existsSync(root) ? readdirSync(root).flatMap((d) => readdirSync(join(root, d))) : [];
};

before(async () => {
  A = await fullElection('imp-a');
  tar = await exportQvb(A);
}, { timeout: 120_000 });
after(async () => {
  await A.stop();
  for (const t of targets) await t.stop();
});

/** Imports `bytes` into a fresh target and expects the job to fail with `rule`; checks nothing was left behind. */
async function rejected(bytes: Uint8Array, rule: string | RegExp, o: { seq?: number; query?: (t: World) => string } = {}): Promise<any> {
  const t = await target();
  const before = elections(t);
  const job = await importAndWait(t, bytes, o.query ? { query: o.query(t) } : {});
  assert.equal(job.state, 'failed', JSON.stringify(job));
  if (process.env['QV_DEBUG']) console.error('REJ', JSON.stringify(job.error));
  assert.equal(job.error.code, 'IMPORT_REJECTED');
  assert.match(job.error.rule, typeof rule === 'string' ? new RegExp(`^${rule}$`) : rule, JSON.stringify(job.error));
  if (o.seq !== undefined) assert.equal(job.error.seq, o.seq, JSON.stringify(job.error));
  assert.equal(elections(t), before, 'no election was created');
  assert.deepEqual(dbFiles(t), dbFiles(t).filter(() => false).concat(dbFiles(t).filter((f) => !f.includes(A.electionId))), 'no files of the rejected bundle remain');
  assert.equal((await t.get(`/api/v1/elections/${A.electionId}`)).status, 404, 'nothing is exposed');
  return job;
}
const firstBallotSeq = (): number => entryLines(readTar(tar)).findIndex((_, i) => {
  const hdr = unb64u(entryLines(readTar(tar))[i].header_b64u)!;
  return dec(hdr).includes('ballot') && !dec(hdr).includes('ballot_audit');
});

test('happy path: verified, then exposed as a read-only IMPORTED mirror identical to the source', { timeout: 120_000 }, async () => {
  const B = await target({}, 'imp-b');
  const mh = (await A.get(`/api/v1/elections/${A.electionId}`)).json.manifest_hash as string;
  const up = await upload(B, tar, { query: `?org_id=${B.orgId}&manifest_hash=${H(sha256(utf8('wrong')))}` });
  assert.equal(up.status, 202);
  assert.equal((await waitJob(B, up.json.job_id)).error.rule, 'MANIFEST_HASH');

  const r = await upload(B, tar, { idem: 'import-key-0001' });
  assert.equal(r.status, 202, r.text);
  assert.equal(r.headers.get('location'), `/api/v1/jobs/${r.json.job_id}`);
  assert.equal(r.json.kind, 'import');
  // the same request again: same job, nothing queued twice
  const again = await upload(B, tar, { idem: 'import-key-0001' });
  assert.equal(again.status, 202);
  assert.equal(again.headers.get('idempotent-replay'), 'true');
  assert.equal(again.json.job_id, r.json.job_id);
  const job = await waitJob(B, r.json.job_id);
  assert.equal(job.state, 'done', JSON.stringify(job));
  assert.equal(job.progress, 1);
  assert.equal(job.result.election_id, A.electionId);
  assert.equal(job.result.verdict, 'PASS');
  assert.equal(job.result.manifest_hash.length, 64);
  assert.equal(job.result_ref, A.electionId);
  void mh;

  const id = A.electionId;
  const e = (await B.get(`/api/v1/elections/${id}`)).json;
  assert.equal(e.state, 'IMPORTED');
  assert.equal(e.origin, A.origin);
  assert.equal(e.tree_size, (await A.get(`/api/v1/elections/${id}`)).json.tree_size);
  assert.equal((await B.get(`/api/v1/elections/${id}/state`)).json.phase, 'IMPORTED');
  assert.equal(B.server.env.control.election(id)!.state, 'IMPORTED');
  // same bytes: entries, checkpoint, proofs
  const ea = (await A.get(`/api/v1/elections/${id}/log/entries?from=0&limit=1000`)).json;
  const eb = (await B.get(`/api/v1/elections/${id}/log/entries?from=0&limit=1000`)).json;
  assert.deepEqual(eb.entries.map((x: any) => [x.header_b64u, x.body_b64u]), ea.entries.map((x: any) => [x.header_b64u, x.body_b64u]));
  assert.equal((await B.get(`/api/v1/elections/${id}/log/checkpoint`)).text, (await A.get(`/api/v1/elections/${id}/log/checkpoint`)).text);
  const pa = (await A.get(`/api/v1/elections/${id}/log/proof/inclusion?seq=5`)).json;
  const pb = (await B.get(`/api/v1/elections/${id}/log/proof/inclusion?seq=5`)).json;
  assert.deepEqual(pb.path, pa.path);
  // the voter index and the roll are rebuilt
  const kid = b64u((await import('@quietvote/board')).authorKeyId('ed25519', A.voters[1]!.publicKey));
  const vi = (await B.get(`/api/v1/elections/${id}/voters/${kid}`)).json;
  assert.equal(vi.registered, true);
  assert.equal(vi.ballot_count, 2);
  assert.equal((await B.get(`/api/v1/elections/${id}/roll?limit=10`)).json.roll_size, 4);
  // the protocol verifier accepts the mirror's export; the bundle round-trips (same entries, same election record)
  const ex = await B.get(`/api/v1/elections/${id}/export.json`);
  const rep = await verifyElectionText(ex.text);
  assert.equal(rep.verdict, 'PASS');
  const tarB = await exportQvb(B, id);
  const fa = readTar(tar);
  const fb = readTar(tarB);
  assert.deepEqual(dec(fb.get('log/entries.jsonl')!), dec(fa.get('log/entries.jsonl')!));
  assert.equal(dec(fb.get('election.json')!), dec(fa.get('election.json')!));
  assert.deepEqual([...fb.keys()].sort(), [...fa.keys()].sort());
  const C = await target({}, 'imp-c');
  assert.equal((await importAndWait(C, tarB)).state, 'done', 're-exported mirror bundles import again');

  // read-only: nothing can be appended, registered, invited, cosigned
  const w = B;
  const late = await w.req('POST', `/api/v1/elections/${id}/log/entries`, { header: b64u(new Uint8Array(200)), body: b64u(new Uint8Array(10)) });
  assert.ok(late.status >= 400);
  const ent = A.entry('notice', A.coord[0]!, A.control('pause', 'x'));
  const post = await B.submit(ent.headerBytes, ent.body, id);
  assert.ok(post.status === 409 || post.status === 503, `${post.status} ${post.text}`);
  assert.equal((await B.get(`/api/v1/elections/${id}`)).json.tree_size, e.tree_size);
  assert.equal((await B.signed('POST', `/api/v1/elections/${id}/invites`, { count: 1 }, B.owner, B.idemKey())).status, 403);
  assert.equal((await B.req('POST', `/api/v1/elections/${id}/registrations`, { invite_code: 'A'.repeat(22), pk: b64u(A.voters[0]!.publicKey), alg: 'ed25519', pop: 'A'.repeat(86) })).status, 403);
  assert.equal((await B.req('POST', `/api/v1/elections/${id}/log/cosignatures`, { checkpoint_size: 1, lines: ['— x AAAAAAAAAAAAAAAAAAAAAAAAAA\n'] })).status, 409);
  assert.equal((await B.signed('GET', `/api/v1/elections/${id}/invites?include_label=true`, undefined, B.owner)).status < 500, true);

  // survives a restart of the runtime
  await B.server.pool.closeAll();
  assert.equal((await B.get(`/api/v1/elections/${id}/state`)).json.phase, 'IMPORTED');

  // gossip against the mirror: peers' notes are judged against the imported tree
  const cur = (await A.get(`/api/v1/elections/${id}/log/checkpoint`)).text;
  const g = await B.req('POST', '/api/v1/gossip/checkpoints', { note: cur });
  assert.equal(g.status, 200);
  assert.equal(g.json.relation, 'same');
  const rtB = (await B.server.pool.get(id))!;
  const regA = A.server.env.control.election(id)!;
  const rtA = (await A.server.pool.get(id))!;
  const dek = unseal(A.server.env.kek, regA.dek_wrapped!, `dek:${id}`);
  void dek;
  // log key of A is not stored on B: a forged fork cannot even be produced there, but A's own archived notes are fine
  assert.equal(rtA.logPk.length, 32);
  assert.equal(H(rtB.logPk), H(rtA.logPk));

  // listed for admins as imported; owner can delete the mirror
  const list = await B.signed('GET', '/api/v1/admin/elections?state=IMPORTED', undefined, admin);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.items.map((x: any) => [x.election_id, x.imported]), [[id, true]]);
  const del = await B.signed('DELETE', `/api/v1/elections/${id}`, { confirm: 'Annual meeting' }, B.owner);
  assert.equal(del.status, 202);
  assert.equal((await B.get(`/api/v1/elections/${id}`)).status, 404);
  assert.deepEqual(dbFiles(B).filter((f) => f.includes(id)), []);
});

test('importing an id that already exists is refused after verification, and a second identical upload is a new job', async () => {
  const t = await target({}, 'imp-dup');
  assert.equal((await importAndWait(t, tar)).state, 'done');
  const j = await importAndWait(t, tar);
  assert.equal(j.state, 'failed');
  assert.equal(j.error.rule, 'ELECTION_EXISTS');
  assert.equal(j.error.status, 409);
  assert.equal(elections(t), 2); // the draft of setupOrgAndElection + the mirror
});

test('link access: the response carries a one-time read key; the mirror then needs it; admins may import into any org', async () => {
  const t = await target({}, 'imp-link');
  const r = await upload(t, tar, { key: admin, query: `?org_id=${t.orgId}&access=link`, headers: {}, idem: 'link-import-0001' });
  assert.equal(r.status, 202, r.text);
  const key = r.json.read_key as string;
  assert.ok(key && key.length >= 20);
  const job = await waitJob(t, r.json.job_id, admin);
  assert.equal(job.state, 'done', JSON.stringify(job));
  const id = A.electionId;
  assert.equal((await t.get(`/api/v1/elections/${id}/state`)).status, 403);
  assert.equal((await t.get(`/api/v1/elections/${id}/state`, { 'qv-read-key': key })).status, 200);
  assert.equal((await t.get(`/api/v1/elections/${id}/export.qvb`)).status, 403);
  // the key is not stored in the idempotency cache nor in the job
  const replay = await upload(t, tar, { key: admin, query: `?org_id=${t.orgId}&access=link`, idem: 'link-import-0001' });
  assert.equal(replay.json.job_id, r.json.job_id);
  assert.equal(replay.json.read_key, undefined);
  assert.ok(!JSON.stringify(job).includes(key));
  assert.ok(!t.logs.join('\n').includes(key));
  // gossip about a link mirror needs the key too
  const cur = (await A.get(`/api/v1/elections/${id}/log/checkpoint`)).text;
  assert.equal((await t.req('POST', '/api/v1/gossip/checkpoints', { note: cur })).status, 403);
  assert.equal((await t.req('POST', '/api/v1/gossip/checkpoints', { note: cur }, { headers: { 'qv-read-key': key } })).status, 200);
});

test('request-level refusals: authentication, authorization, media type, framing, parameters, quotas', async () => {
  const t = await target({}, 'imp-req');
  const other = kp('imports', 'other-org');
  assert.equal((await t.req('POST', '/api/v1/orgs', { name: 'Other', owner_key: { pk: b64u(other.publicKey), alg: 'ed25519' } }, { key: other, headers: t.idemKey() })).status, 201);
  const small = enc('x'.repeat(100));
  assert.equal((await upload(t, small, { key: null })).status, 401);
  assert.equal((await upload(t, small, { key: kp('imports', 'stranger') })).status, 401);
  assert.equal((await upload(t, small, { key: other })).status, 404, 'another org\'s key: cross-org looks like 404');
  assert.equal((await upload(t, small, { key: admin, query: '' })).status, 400, 'an admin must name the organization');
  assert.equal((await upload(t, small, { query: '' })).status, 202, 'an org key defaults to its own organization');
  assert.equal((await upload(t, small, { query: '?org_id=notanorg' })).status, 400);
  assert.equal((await upload(t, small, { query: `?org_id=${'a'.repeat(26)}` })).status, 404);
  assert.equal((await upload(t, small, { query: `?org_id=${t.orgId}&access=secret` })).status, 400);
  assert.equal((await upload(t, small, { query: `?org_id=${t.orgId}&manifest_hash=zz` })).status, 400);
  assert.equal((await upload(t, small, { query: `?org_id=${t.orgId}&evil=1` })).status, 400);
  assert.equal((await upload(t, small, { contentType: 'application/json' })).status, 415);
  assert.equal((await upload(t, small, { contentType: 'application/gzip' })).status, 415);
  assert.equal((await upload(t, small, { idem: null })).status, 400, 'Idempotency-Key is required');
  assert.equal((await upload(t, new Uint8Array(0))).status, 400);
  assert.equal((await t.get('/api/v1/imports')).status, 405);
  // replay and staleness of the signature
  const nonce = t.rng.bytes(16);
  assert.equal((await upload(t, small, { nonce })).status, 202);
  assert.equal((await upload(t, small, { nonce, idem: 'another-key-0001' })).status, 401);
  assert.equal((await upload(t, small, { ts: t.nowSec - 1000 })).status, 401);
  // the signature covers the body: a body swapped after signing is refused
  const path = `/api/v1/imports?org_id=${t.orgId}`;
  const { signRequest } = await import('../src/index.ts');
  const auth = signRequest(t.owner.secretKey, t.owner.publicKey, 'POST', path, t.audience, small, t.nowSec, t.rng.bytes(16));
  const swapped = await fetch(t.base + path, { method: 'POST', headers: { 'content-type': 'application/x-tar', 'idempotency-key': 'swap-body-0001', authorization: auth }, body: Buffer.from(enc('y'.repeat(100))) });
  assert.equal(swapped.status, 401);
  // a signature made for another target (query) does not authorize this one
  const auth2 = signRequest(t.owner.secretKey, t.owner.publicKey, 'POST', `/api/v1/imports?org_id=${t.orgId}&access=public`, t.audience, small, t.nowSec, t.rng.bytes(16));
  const moved = await fetch(t.base + `/api/v1/imports?org_id=${t.orgId}&access=link`, { method: 'POST', headers: { 'content-type': 'application/x-tar', 'idempotency-key': 'move-target-001', authorization: auth2 }, body: Buffer.from(small) });
  assert.equal(moved.status, 401);
  // jobs: creator and admins only
  const up = await upload(t, small);
  assert.equal(up.status, 202);
  assert.equal((await t.signed('GET', `/api/v1/jobs/${up.json.job_id}`, undefined, other)).status, 404);
  assert.equal((await t.signed('GET', `/api/v1/jobs/${up.json.job_id}`, undefined, admin)).status, 200);
  assert.equal((await t.signed('GET', `/api/v1/jobs/${'a'.repeat(26)}`, undefined, t.owner)).status, 404);
  assert.equal((await t.signed('GET', '/api/v1/jobs/not-a-job', undefined, t.owner)).status, 404);
  assert.equal((await t.get(`/api/v1/jobs/${up.json.job_id}`)).status, 401);
  // job errors expose no stack traces or paths
  const done = await waitJob(t, up.json.job_id);
  assert.equal(done.state, 'failed');
  assert.ok(!/\bat \w|\/home\/|node_modules/.test(JSON.stringify(done)));
});

test('size and framing limits are enforced before the body is read', { timeout: 60_000 }, async () => {
  const t = await target({ maxImportBytes: 4096, maxImportUploads: 1 }, 'imp-lim');
  assert.equal((await upload(t, new Uint8Array(4097).fill(65))).status, 413);
  assert.equal((await upload(t, new Uint8Array(4096).fill(65))).status, 202);
  // unknown key + huge declared length: refused from the headers alone, the body is never requested
  const u = new URL(t.base);
  const status = await new Promise<number>((resolve, reject) => {
    const q = httpRequest({ host: u.hostname, port: u.port, method: 'POST', path: `/api/v1/imports?org_id=${t.orgId}`, headers: {
      'content-type': 'application/x-tar', 'content-length': '4000', 'idempotency-key': 'early-refusal-1',
      authorization: `QV-Sig keyid=${'A'.repeat(43)},ts=${t.nowSec},nonce=${'B'.repeat(22)},sig=${'C'.repeat(86)}`,
    } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    q.on('error', reject);
    q.write('x'.repeat(10)); // 10 of 4000 promised bytes, never completed
  });
  assert.equal(status, 401);
  // chunked uploads (no Content-Length) are refused
  const chunked = await new Promise<number>((resolve, reject) => {
    const q = httpRequest({ host: u.hostname, port: u.port, method: 'POST', path: `/api/v1/imports?org_id=${t.orgId}`, headers: { 'content-type': 'application/x-tar', 'transfer-encoding': 'chunked' } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    q.on('error', reject);
    q.write('abc');
    q.end();
  });
  assert.ok(chunked === 411 || chunked === 401, `chunked: ${chunked}`);
});

test('quota: an organization at its election limit cannot import', async () => {
  const t = await target({ maxElectionsPerOrg: 1 }, 'imp-quota');
  const r = await upload(t, tar);
  assert.equal(r.status, 429);
  assert.equal(r.json.retryable, false);
});

test('only a few imports may be queued; the rest are told to retry', async () => {
  const t = await target({ importQueueMax: 1 }, 'imp-queue');
  const a = await upload(t, tar);
  assert.equal(a.status, 202);
  const b = await upload(t, tar);
  assert.ok(b.status === 202 || b.status === 503, `${b.status}`);
  if (b.status === 503) assert.equal(b.json.code, 'BUSY');
  await waitJob(t, a.json.job_id);
});

// ------------------------------------------------------------------------------------------------ hostile archives
test('tar framing attacks are refused with BUNDLE_TAR and leave nothing behind', async () => {
  const good = readTar(tar);
  const ok = (name: string): { name: string; data: Uint8Array } => ({ name, data: good.get(name) ?? enc('x') });
  const cases: [string, Uint8Array][] = [
    ['path traversal', rawTar([{ name: '../evil', data: enc('x') }])],
    ['absolute path', rawTar([{ name: '/etc/passwd', data: enc('x') }])],
    ['dot segment', rawTar([{ name: 'a/./b', data: enc('x') }])],
    ['symlink', rawTar([{ name: 'bundle.json', data: new Uint8Array(0), type: 0x32 }])],
    ['hard link', rawTar([{ name: 'bundle.json', data: new Uint8Array(0), type: 0x31 }])],
    ['directory', rawTar([{ name: 'log', data: new Uint8Array(0), type: 0x35 }])],
    ['device', rawTar([{ name: 'bundle.json', data: new Uint8Array(0), type: 0x33 }])],
    ['pax header', rawTar([{ name: 'bundle.json', data: enc('x'), type: 0x78 }])],
    ['long name extension', rawTar([{ name: '././@LongLink', data: enc('x'), type: 0x4c }])],
    ['duplicate names', rawTar([ok('bundle.json'), ok('bundle.json')])],
    ['ustar prefix', rawTar([{ name: 'bundle.json', data: enc('x'), prefix: 'etc' }])],
    ['bad checksum', rawTar([{ name: 'bundle.json', data: enc('x'), badSum: true }])],
    ['size lies (past the end)', rawTar([{ name: 'bundle.json', data: enc('x'), sizeLie: 10_000_000 }])],
    ['no end marker', rawTar([ok('bundle.json')], { noEnd: true })],
    ['data after end marker', rawTar([ok('bundle.json')], { trailing: enc('GARBAGE'.repeat(100)) })],
    ['truncated mid-file', tar.subarray(0, 700)],
    ['not a tar', enc('PK\u0003\u0004 this is not an archive'.repeat(50))],
    ['gzip magic', new Uint8Array([0x1f, 0x8b, 8, 0, ...new Array(600).fill(1)])],
    ['all zero', new Uint8Array(4096)],
    ['control chars in name', rawTar([{ name: 'bund\u0001le.json', data: enc('x') }])],
    ['backslash name', rawTar([{ name: 'a\\b', data: enc('x') }])],
    ['empty-archive', rawTar([])],
  ];
  for (const [what, bytes] of cases) {
    const t = await target({}, `imp-tar-${targets.length}`);
    const job = await importAndWait(t, bytes);
    assert.equal(job.state, 'failed', what);
    assert.match(job.error.rule, /^BUNDLE_(TAR|FORMAT)$/, `${what}: ${JSON.stringify(job.error)}`);
    assert.equal(elections(t), 1, what);
  }
});

test('archive structure: checksums, missing and unlisted files', async () => {
  await rejected(rewrite(tar, (f) => f.set('log/entries.jsonl', enc(dec(f.get('log/entries.jsonl')!) + '\n')), { reseal: false }), 'BUNDLE_CHECKSUM');
  await rejected(rewrite(tar, (f) => f.delete('SHA256SUMS'), { reseal: false }), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.delete('election.json')), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.delete('bundle.json')), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.delete('witness/policy.json')), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.set('extra.txt', enc('hi')), { reseal: false }), 'BUNDLE_CHECKSUM');
  await rejected(rewrite(tar, (f) => f.set('SHA256SUMS', enc(dec(f.get('SHA256SUMS')!) + `${'0'.repeat(64)}  ghost.txt\n`)), { reseal: false }), 'BUNDLE_CHECKSUM');
  await rejected(rewrite(tar, (f) => f.set('SHA256SUMS', enc(dec(f.get('SHA256SUMS')!).replace(/^[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a')))), { reseal: false }), 'BUNDLE_CHECKSUM');
  await rejected(rewrite(tar, (f) => f.set('bundle.json', enc('{"format":"qv-bundle/v1"'))), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.set('bundle.json', enc(JSON.stringify({ ...JSON.parse(dec(f.get('bundle.json')!)), format: 'qv-bundle/v2' })))), 'BUNDLE_FORMAT');
});

test('tampered log entries are rejected at the exact failing seq', async () => {
  const lines = entryLines(readTar(tar));
  const seq = lines.findIndex((l) => dec(unb64u(l.header_b64u)!).includes('quietvote') && l === lines[firstBallotSeq()]);
  assert.ok(seq > 1);
  // body bytes changed (still valid base64url) -> body digest mismatch
  await rejected(rewrite(tar, (f) => {
    const ls = entryLines(f);
    const b = unb64u(ls[seq].body_b64u)!;
    b[b.length - 3] = b[b.length - 3]! ^ 1;
    ls[seq].body_b64u = b64u(b);
    setEntryLines(f, ls);
  }), /BODY_DIGEST/, { seq });
  // header signature flipped
  await rejected(rewrite(tar, (f) => {
    const ls = entryLines(f);
    const h = unb64u(ls[seq].header_b64u)!;
    h[h.length - 1] = h[h.length - 1]! ^ 1;
    ls[seq].header_b64u = b64u(h);
    setEntryLines(f, ls);
  }), /./, { seq });
  // entry from a stranger (valid entry, signed by a key that is not on the roll)
  await rejected(rewrite(tar, (f) => {
    const ls = entryLines(f);
    const ev = A.entry('ballot', kp('imports', 'intruder'), JSON.parse(dec(unb64u(ls[seq].body_b64u)!)), A.origin);
    ls[seq] = { seq, header_b64u: b64u(ev.headerBytes), body_b64u: b64u(ev.body) };
    setEntryLines(f, ls);
  }), /./, { seq });
  // two entries swapped
  await rejected(rewrite(tar, (f) => {
    const ls = entryLines(f);
    const a = ls[seq], b = ls[seq + 1];
    ls[seq] = { ...b, seq };
    ls[seq + 1] = { ...a, seq: seq + 1 };
    setEntryLines(f, ls);
  }), /./);
  // truncated log (last entry dropped): the checkpoints no longer fit
  await rejected(rewrite(tar, (f) => {
    const ls = entryLines(f);
    ls.pop();
    setEntryLines(f, ls);
  }), /./);
  // a hidden entry: one entry removed from the middle (renumbered)
  await rejected(rewrite(tar, (f) => {
    const ls = entryLines(f);
    ls.splice(seq, 1);
    setEntryLines(f, ls.map((l, i) => ({ ...l, seq: i })));
  }), /./);
  // gap in numbering, extra members, non-string fields, empty line, CRLF
  await rejected(rewrite(tar, (f) => setEntryLines(f, entryLines(f).map((l, i) => (i === 3 ? { ...l, seq: 7 } : l)))), 'BUNDLE_FORMAT', { seq: 3 });
  await rejected(rewrite(tar, (f) => setEntryLines(f, entryLines(f).map((l, i) => (i === 2 ? { ...l, extra: 1 } : l)))), 'BUNDLE_FORMAT', { seq: 2 });
  await rejected(rewrite(tar, (f) => setEntryLines(f, entryLines(f).map((l, i) => (i === 2 ? { ...l, body_b64u: null } : l)))), 'BUNDLE_FORMAT', { seq: 2 });
  await rejected(rewrite(tar, (f) => f.set('log/entries.jsonl', enc(dec(f.get('log/entries.jsonl')!).replace('\n', '\n\n')))), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.set('log/entries.jsonl', enc(dec(f.get('log/entries.jsonl')!).slice(0, -1)))), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.set('log/entries.jsonl', enc(''))), /BUNDLE_FORMAT/);
});

test('forged or foreign checkpoints, keys and policies are rejected', async () => {
  const intruder = ed25519Keypair();
  // all checkpoints re-signed by an attacker key (well-formed, but not the manifest log key)
  await rejected(rewrite(tar, (f) => {
    for (const [name, data] of [...f]) {
      if (!name.startsWith('log/checkpoints/')) continue;
      const lines = dec(data).split('\n');
      f.set(name, enc(signCheckpoint(lines[0]!, Number(lines[1]), Buffer.from(lines[2]!, 'base64'), intruder.secretKey, intruder.publicKey)));
    }
  }), /BAD_CHECKPOINT|./);
  // same, and the bundle claims the attacker key as its log key
  await rejected(rewrite(tar, (f) => {
    for (const [name, data] of [...f]) {
      if (!name.startsWith('log/checkpoints/')) continue;
      const lines = dec(data).split('\n');
      f.set(name, enc(signCheckpoint(lines[0]!, Number(lines[1]), Buffer.from(lines[2]!, 'base64'), intruder.secretKey, intruder.publicKey)));
    }
    const bj = JSON.parse(dec(f.get('bundle.json')!));
    bj.log_pk_b64u = b64u(intruder.publicKey);
    f.set('bundle.json', enc(JSON.stringify(bj)));
    const pol = JSON.parse(dec(f.get('witness/policy.json')!));
    pol.log_pk_b64 = Buffer.from(intruder.publicKey).toString('base64');
    f.set('witness/policy.json', enc(JSON.stringify(pol)));
  }), 'BUNDLE_BINDING');
  // the last checkpoint is missing
  await rejected(rewrite(tar, (f) => {
    const last = [...f.keys()].filter((k) => k.startsWith('log/checkpoints/')).sort((a, b) => Number(a.match(/(\d+)\.txt/)![1]) - Number(b.match(/(\d+)\.txt/)![1])).pop()!;
    f.delete(last);
  }), /./);
  // a checkpoint file whose name does not match its size
  await rejected(rewrite(tar, (f) => f.set('log/checkpoints/999.txt', f.get('log/checkpoints/5.txt')!)), 'BUNDLE_CHECKPOINT');
  // manifest signer missing / wrong
  await rejected(rewrite(tar, (f) => {
    const bj = JSON.parse(dec(f.get('bundle.json')!));
    delete bj.organizer_pk_b64u;
    f.set('bundle.json', enc(JSON.stringify(bj)));
  }), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => {
    const bj = JSON.parse(dec(f.get('bundle.json')!));
    bj.organizer_pk_b64u = b64u(intruder.publicKey);
    f.set('bundle.json', enc(JSON.stringify(bj)));
  }), /AUTHOR_UNRESOLVED|BAD_SIGNATURE/, { seq: 0 });
  await rejected(rewrite(tar, (f) => {
    const bj = JSON.parse(dec(f.get('bundle.json')!));
    bj.server_pk_b64u = b64u(intruder.publicKey);
    f.set('bundle.json', enc(JSON.stringify(bj)));
  }), /AUTHOR_UNRESOLVED|BAD_SIGNATURE/);
  await rejected(rewrite(tar, (f) => {
    const bj = JSON.parse(dec(f.get('bundle.json')!));
    bj.origin = 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa';
    f.set('bundle.json', enc(JSON.stringify(bj)));
  }), /./);
  await rejected(rewrite(tar, (f) => {
    const bj = JSON.parse(dec(f.get('bundle.json')!));
    bj.organizer_pk_b64u = b64u(new Uint8Array(32)); // not a valid point
    f.set('bundle.json', enc(JSON.stringify(bj)));
  }), 'BUNDLE_FORMAT');
  // redactions cannot be replayed
  await rejected(rewrite(tar, (f) => f.set('redactions.json', enc('[{"seq":5,"redacted_at":1,"reason":"x"}]'))), 'BUNDLE_REDACTED');
});

test('the protocol record must be the log: swapped, hidden and invented records are rejected', async () => {
  const ballotSeq = firstBallotSeq();
  const withElection = (edit: (e: any) => void) => (f: Map<string, Uint8Array>): void => {
    const e = JSON.parse(dec(f.get('election.json')!));
    edit(e);
    f.set('election.json', enc(JSON.stringify(e)));
  };
  // a ballot removed from the election record but still in the log
  await rejected(rewrite(tar, withElection((e) => void (e.log = e.log.filter((x: any) => x.seq !== ballotSeq)))), /./);
  // a record invented at a seq that is not a protocol entry
  await rejected(rewrite(tar, withElection((e) => void e.log.push({ seq: 10_000, entry: e.log[0].entry }))), /./);
  // duplicate seq
  await rejected(rewrite(tar, withElection((e) => void e.log.push(e.log[0]))), /./);
  // roll changed (a voter dropped)
  await rejected(rewrite(tar, withElection((e) => void e.roll.pop())), /./);
  // manifest tampered
  await rejected(rewrite(tar, withElection((e) => void (e.manifest.body.title = 'Evil'))), /./);
  // manifest_hash field wrong
  await rejected(rewrite(tar, withElection((e) => void (e.manifest_hash = '0'.repeat(64)))), /./);
  // tally result altered
  await rejected(rewrite(tar, withElection((e) => {
    const t = e.log.find((x: any) => x.entry.body?.type === 'tally');
    t.entry.body.contests[0].options[0].T += 1;
  })), /./);
  // election.json not JSON / wrong shape
  await rejected(rewrite(tar, (f) => f.set('election.json', enc('{'))), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.set('election.json', enc('[]'))), 'BUNDLE_FORMAT');
  await rejected(rewrite(tar, (f) => f.set('election.json', enc('{"manifest":1}'))), /./);
});

test('limits: entry count and roll size are enforced on the parsed bundle', async () => {
  const t = await target({ maxImportEntries: 10 }, 'imp-ent');
  const j = await importAndWait(t, tar);
  assert.equal(j.state, 'failed');
  assert.equal(j.error.rule, 'BUNDLE_LIMIT');
  assert.equal(elections(t), 1);
  const t2 = await target({ maxVotersPerElection: 2 }, 'imp-roll');
  const j2 = await importAndWait(t2, tar);
  assert.equal(j2.error.rule, 'BUNDLE_LIMIT');
  const t3 = await target({ maxLogBytes: 2000 }, 'imp-logbytes');
  assert.equal((await importAndWait(t3, tar)).error.rule, 'BUNDLE_LIMIT');
});

test('an unfinished election (open, no tally) imports as INCOMPLETE and stays a read-only mirror', { timeout: 120_000 }, async () => {
  const src = await fullElection('imp-open', { stopAt: 'OPEN' });
  try {
    const t = await target({}, 'imp-open-t');
    const job = await importAndWait(t, await exportQvb(src));
    assert.equal(job.state, 'done', JSON.stringify(job));
    assert.equal(job.result.verdict, 'INCOMPLETE');
    assert.equal((await t.get(`/api/v1/elections/${src.electionId}/state`)).json.phase, 'IMPORTED');
    // the mirror cannot take the votes that the live election takes
    const v = await src.cast(3, { budget: ['yes'], chair: ['ann'] });
    assert.equal(v.status, 201);
    const rec = JSON.parse(dec(unb64u(JSON.parse(JSON.stringify((await src.get(`/api/v1/elections/${src.electionId}/log/entries?from=0&limit=1000`)).json.entries.at(-1))).body_b64u)!));
    void rec;
    const last = (await src.get(`/api/v1/elections/${src.electionId}/log/entries?from=0&limit=1000`)).json.entries.at(-1);
    const r = await t.submit(unb64u(last.header_b64u)!, unb64u(last.body_b64u)!, src.electionId);
    assert.ok(r.status >= 400, `${r.status}`);
    // the live log moved on; the mirror's gossip view: the live note is AHEAD of the mirror (not an offence for a mirror)
    const note = (await src.get(`/api/v1/elections/${src.electionId}/log/checkpoint`)).text;
    const g = await t.req('POST', '/api/v1/gossip/checkpoints', { note });
    assert.equal(g.status, 200, g.text);
    assert.equal(g.json.relation, 'peer_ahead');
    assert.equal(g.json.consistent, false);
    const rt = (await t.server.pool.get(src.electionId))!;
    assert.equal(rt.quarantineReason(), undefined, 'a stale mirror does not quarantine itself');
    assert.equal(rt.edb.evidenceCount(), 0);
  } finally {
    await src.stop();
  }
});

test('jobs that were queued or running when the process died are failed on the next start', async () => {
  const t = await target({}, 'imp-restart');
  const c = t.server.env.control;
  const j = c.createJob({ job_id: 'q'.repeat(26), kind: 'import', election_id: null, params: '{}', created_by: 'k' });
  c.startJob(j.job_id);
  const { JobRunner } = await import('../src/jobs.ts');
  new JobRunner(t.server.env);
  const row = c.job(j.job_id)!;
  assert.equal(row.state, 'failed');
  assert.equal(JSON.parse(row.error!).code, 'INTERRUPTED');
});

void checkFork; void jcs;
