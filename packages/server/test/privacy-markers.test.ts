// @verifies QV-06-REQ-003, QV-06-REQ-004, QV-06-REQ-017, QV-28-REQ-006, QV-28-REQ-008
// T7: real HTTP lifecycle and durable-store markers; this is not a memory/core-dump or traffic-analysis proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { unb64u } from '@quietvote/board';
import { bytesToHex, jcs, scalarToBytes, utf8 } from '@quietvote/crypto';
import { makeCast, makeSpoil, signRecord, type Selections } from '@quietvote/protocol';
import { readTar, signRequest } from '../src/index.ts';
import { waitJob } from './helpers/full.ts';
import { World } from './helpers/world.ts';

interface Marker { name: string; needles: Uint8Array[] }
interface Surface { name: string; bytes: Uint8Array }
interface BoardEntry { seq: number; body_b64u: string | null }
interface IssuedInvite { invite_id: string; code: string; label: string }

/** Common literal encodings only. A miss is not a proof against arbitrary transforms of a secret. */
function secretMarker(name: string, bytes: Uint8Array): Marker {
  assert.ok(bytes.length >= 16, 'markers must be long enough to avoid incidental public-data matches');
  const b = Buffer.from(bytes), hex = b.toString('hex');
  return { name, needles: [b, ...[hex, hex.toUpperCase(), b.toString('base64'), b.toString('base64url'),
    JSON.stringify([...bytes]), JSON.stringify(new Uint8Array(bytes))].map(utf8)] };
}
const textMarker = (name: string, value: string): Marker => ({ name, needles: [utf8(value)] });
const selectionMarker = (name: string, selections: Selections): Marker =>
  ({ name, needles: [jcs(selections), utf8(JSON.stringify(selections))] });

/** Failure output contains names only: never the fixture's secret bytes or response contents. */
function leaks(surfaces: Surface[], markers: Marker[]): string[] {
  return surfaces.flatMap((surface) => {
    const bytes = Buffer.from(surface.bytes);
    return markers.filter((marker) => marker.needles.some((needle) => bytes.includes(Buffer.from(needle))))
      .map((marker) => `${surface.name}: ${marker.name}`);
  });
}
function jsonSurfaces(name: string, text: string): Surface[] {
  return [{ name, bytes: utf8(text) }, { name: `${name}/canonical`, bytes: jcs(JSON.parse(text)) }];
}
function boardBodies(name: string, entries: BoardEntry[]): Surface[] {
  return entries.flatMap((entry) => {
    if (entry.body_b64u === null) return [];
    const body = unb64u(entry.body_b64u);
    assert.ok(body, 'fixture board body must decode');
    return jsonSurfaces(`${name}/body-${entry.seq}`, Buffer.from(body).toString('utf8'));
  });
}
function archiveSurfaces(name: string, bytes: Uint8Array): Surface[] {
  const surfaces: Surface[] = [{ name, bytes }];
  const files = readTar(bytes);
  assert.ok(files.has('election.json') && files.has('log/entries.jsonl'), 'scan real QVB contents');
  for (const [path, content] of files) {
    surfaces.push({ name: `${name}/${path}`, bytes: content });
    if (path.endsWith('.json')) surfaces.push(...jsonSurfaces(`${name}/${path}`, Buffer.from(content).toString('utf8')));
    if (path === 'log/entries.jsonl') {
      const entries = Buffer.from(content).toString('utf8').trim().split('\n').map((line) => JSON.parse(line) as BoardEntry);
      surfaces.push(...boardBodies(name, entries));
    }
  }
  return surfaces;
}
function filesUnder(root: string, dir = root): Surface[] {
  return readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name), stat = lstatSync(path);
    assert.ok(stat.isDirectory() || stat.isFile(), 'fixture must not hide files behind symlinks or special files');
    return stat.isDirectory() ? filesUnder(root, path) : [{ name: `file/${relative(root, path).replaceAll('\\', '/')}`, bytes: readFileSync(path) }];
  });
}
async function storedSurfaces(w: World): Promise<Surface[]> {
  const rt = (await w.server.pool.get(w.electionId))!;
  const surfaces = filesUnder(w.dir);
  const dbPaths = ['control.sqlite', w.server.env.control.election(w.electionId)!.db_path.replaceAll('\\', '/')];
  for (const path of dbPaths) for (const suffix of ['', '-wal', '-shm']) {
    assert.ok(surfaces.some((s) => s.name === `file/${path}${suffix}`), `scan includes live SQLite ${suffix || 'database'} file`);
  }
  assert.ok(surfaces.some((s) => s.name === 'file/kek/kek.bin'), 'the intentionally persisted server KEK file is scanned too');
  assert.ok(readFileSync(join(w.dir, 'kek', 'kek.bin')).equals(Buffer.from(w.server.env.kek)), 'KEK is an intentional server secret, not a forbidden client marker');
  surfaces.push({ name: 'logs', bytes: utf8(w.logs.join('\n')) });
  // Also inspect logical response fields: raw-file substring scans alone can miss values split across SQLite pages.
  for (const [name, db, table] of [['control-response', w.server.env.control.db, 'idempotency'],
    ['election-response', rt.edb.db, 'operation_receipt']] as const) {
    const rows = db.prepare(`SELECT response FROM ${table} WHERE response IS NOT NULL ORDER BY principal,idem_key`).all();
    rows.forEach((row, i) => {
      const value = row['response'];
      assert.ok(typeof value === 'string' || value instanceof Uint8Array, 'cached response must have its declared type');
      surfaces.push(...jsonSurfaces(`${name}/${i}`, typeof value === 'string' ? value : Buffer.from(value).toString('utf8')));
    });
  }
  return surfaces;
}
async function exports(w: World, prefix: string): Promise<Surface[]> {
  const path = `/api/v1/elections/${w.electionId}`, surfaces: Surface[] = [];
  for (const suffix of ['/export.json', '/export.json?board=1']) {
    const response = await w.get(path + suffix);
    assert.equal(response.status, 200, 'JSON export succeeds');
    surfaces.push(...jsonSurfaces(`${prefix}${suffix}`, response.text));
    if (suffix.endsWith('board=1')) surfaces.push(...boardBodies(`${prefix}/board`, response.json.board.entries as BoardEntry[]));
  }
  const response = await fetch(w.base + path + '/export.qvb', { headers: { connection: 'close' } });
  assert.equal(response.status, 200, 'QVB export succeeds');
  surfaces.push(...archiveSurfaces(`${prefix}/export.qvb`, new Uint8Array(await response.arrayBuffer())));
  return surfaces;
}

test('privacy sweep detects injected literal markers and names failures without printing marker values', () => {
  const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 17), marker = secretMarker('private-seed', secret);
  for (const [i, needle] of marker.needles.entries()) {
    const surface = { name: `encoding-${i}`, bytes: new Uint8Array([0, ...needle, 0]) };
    assert.deepEqual(leaks([surface], [marker]), [`encoding-${i}: private-seed`]);
  }
  assert.deepEqual(leaks([{ name: 'public', bytes: utf8('public option names and tally counts') }], [marker]), []);
  assert.deepEqual(leaks([{ name: 'text', bytes: utf8('long synthetic private contact marker') }],
    [textMarker('contact', 'long synthetic private contact marker')]), ['text: contact']);
  const selection = { chair: ['ann'], budget: [] };
  assert.deepEqual(leaks(jsonSurfaces('selection', JSON.stringify(selection, null, 2)),
    [selectionMarker('private-selection', selection)]), ['selection/canonical: private-selection']);
});

test('T7: private voter material stays out of server files, caches, logs and exports through retention', { timeout: 120_000 }, async () => {
  const w = new World({ seed: 'privacy-markers-t7', n: 3, t: 2, voters: 4, witnessQuorum: 0,
    freshConnections: true, server: { retentionSweepMs: 0 } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const path = `/api/v1/elections/${w.electionId}`, issuedAt = w.clock, day = 86_400_000;
    const items = Array.from({ length: 6 }, (_, i) => ({
      label: `private-invite-label-t7-${i}-b6d04c997aa12f68352f`,
      contact: `private-invite-contact-t7-${i}-b6d04c997aa12f68352f@example.invalid`,
    }));
    const markers: Marker[] = items.flatMap((item, i) => [textMarker(`label-${i}`, item.label), textMarker(`contact-${i}`, item.contact)]);
    for (const [role, keys] of [['owner', [w.owner]], ['coordinator', w.coord], ['trustee', w.trustees], ['voter', w.voters]] as const) {
      keys.forEach((key, i) => markers.push(secretMarker(`${role}-private-key-${i}`, key.secretKey)));
    }
    const issuedBody = { items, expires_at: new Date(issuedAt + day).toISOString() }, idem = w.idemKey();
    const issue = await w.signed('POST', `${path}/invites`, issuedBody, w.owner, idem);
    assert.equal(issue.status, 201);
    const invites = issue.json.invites as IssuedInvite[];
    assert.equal(invites.length, 6);
    invites.forEach((invite, i) => {
      assert.ok(invite.label === items[i]!.label, 'first delivery includes the requested label');
      const raw = unb64u(invite.code);
      assert.ok(raw?.length === 16, 'fixture preserves the adopted 16-byte invitation contract');
      markers.push(secretMarker(`invite-code-${i}`, raw));
    });
    const rt = (await w.server.pool.get(w.electionId))!;
    const expectedReplay = { invites: invites.map((invite) => ({ invite_id: invite.invite_id, code_withheld: true })) };
    for (const db of [w.server.env.control.db, rt.edb.db]) {
      const table = db === rt.edb.db ? 'operation_receipt' : 'idempotency';
      const row = db.prepare(`SELECT response FROM ${table} WHERE idem_key=?`).get(idem['idempotency-key']!);
      assert.ok(row, 'both durable response containers contain the issuance receipt before any cleanup');
      const value = row['response'];
      assert.deepEqual(JSON.parse(typeof value === 'string' ? value : Buffer.from(value as Uint8Array).toString('utf8')), expectedReplay);
    }
    assert.deepEqual(leaks(await storedSurfaces(w), markers), [], 'private markers absent immediately after issuance');
    const replay = await w.signed('POST', `${path}/invites`, issuedBody, w.owner, idem);
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.deepEqual(replay.json, expectedReplay, 'replay omits both codes and labels');
    for (const [i, voter] of w.voters.entries()) {
      assert.equal((await w.req('POST', `${path}/registrations`, w.registrationBody(invites[i]!.code, voter))).status, 201);
    }
    w.rollHex = w.voters.map((voter) => bytesToHex(voter.publicKey)).sort();
    assert.equal((await w.signed('DELETE', `${path}/invites/${invites[4]!.invite_id}`)).status, 204);
    for (const [i, invite] of invites.entries()) {
      const row = rt.edb.inviteById(invite.invite_id)!;
      assert.ok(row.label_enc !== null, 'encrypted labels remain during the retention grace');
      assert.equal(row.contact_enc === null, i < 4, 'registration immediately erases contact; other contacts remain encrypted');
    }
    assert.equal(await w.server.retention.runOnce(), 0, 'retention must not erase unexpired grace-period labels');
    assert.deepEqual(leaks(await storedSurfaces(w), markers), [], 'enrollment and revocation do not persist private input');
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    for (const [j, key] of w.tkeys) markers.push(secretMarker(`trustee-secret-share-${j}`, scalarToBytes(key.s)));
    assert.equal((await w.open()).status, 201);
    const selections: Selections[] = [
      { budget: ['yes'], chair: ['ann'] }, { budget: ['no'], chair: ['bob'] },
      { budget: [], chair: ['cy'] }, { budget: ['yes'], chair: [] },
    ];
    for (const [i, selection] of selections.entries()) {
      const ballot = w.build(i, selection), voter = w.voters[i]!;
      markers.push(secretMarker(`cast-randomness-${i}`, ballot.xi), selectionMarker(`cast-selections-${i}`, selection));
      assert.equal((await w.post('ballot', voter, makeCast(w.params, voter.secretKey, ballot))).status, 201);
      w.last.set(bytesToHex(voter.publicKey), bytesToHex(ballot.code));
      w.tick();
    }
    const publicSpoil = w.build(0, { budget: ['no'], chair: ['ann'] });
    assert.equal((await w.post('ballot_audit', w.voters[0]!, makeSpoil(w.params, w.voters[0]!.secretKey, publicSpoil, 'publish'))).status, 201);
    w.tick();
    const privateSpoil = w.build(1, { budget: [], chair: ['bob'] });
    markers.push(secretMarker('private-spoil-randomness', privateSpoil.xi), selectionMarker('private-spoil-selections', privateSpoil.selections));
    assert.equal((await w.post('ballot_audit', w.voters[1]!, makeSpoil(w.params, w.voters[1]!.secretKey, privateSpoil, 'private'))).status, 201);
    w.tick();
    const beforeClose = await exports(w, 'open');
    assert.deepEqual(leaks([...await storedSurfaces(w), ...beforeClose], markers), [], 'private ballots absent while encrypted invite data is retained');
    assert.equal((await w.close()).status, 201);
    for (const j of [1, 3]) { assert.equal((await w.trusteeShares(j)).status, 201); w.tick(); }
    const draft = await w.get(`${path}/tally/draft?decrypters=1,3`), coordinator = w.coord[0]!;
    assert.equal(draft.status, 200);
    assert.equal((await w.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, draft.json.body))).status, 201);
    assert.equal((await w.post('audit_close', coordinator, w.control('audit-close'))).status, 201);
    const finalExports = await exports(w, 'archived');
    const create = await w.signed('POST', `${path}/exports`, { kind: 'public' }, w.owner, w.idemKey());
    assert.equal(create.status, 202);
    const job = await waitJob(w, create.json.job_id);
    assert.equal(job.state, 'done');
    const record = await w.signed('GET', job.result_ref);
    assert.equal(record.status, 200);
    const target = record.json.download_url as string;
    const download = await fetch(w.base + target, { headers: { connection: 'close', authorization: signRequest(w.owner.secretKey, w.owner.publicKey,
      'GET', target, w.audience, new Uint8Array(0), w.nowSec, w.rng.bytes(16)) } });
    assert.equal(download.status, 200);
    finalExports.push(...archiveSurfaces('recorded', new Uint8Array(await download.arrayBuffer())));
    const storedSnapshot = rt.edb.publicExportBytes(record.json.export_id);
    assert.ok(storedSnapshot, 'the stored export snapshot is a real durable privacy surface');
    finalExports.push(...archiveSurfaces('stored-recorded', storedSnapshot));
    assert.deepEqual(leaks([...await storedSurfaces(w), ...finalExports], markers), [], 'tally, archive and recorded export contain no private markers');
    for (const invite of invites) assert.deepEqual(leaks(finalExports, [textMarker('invite-id', invite.invite_id)]), [], 'exports omit invite identifiers too');
    // Public option names, aggregate data and an explicitly published spoil opening are expected, not false-positive exemptions.
    const publicJson = finalExports.find((surface) => surface.name === 'archived/export.json')!.bytes;
    for (const marker of [textMarker('public-option', 'Adopt the budget?'), textMarker('public-tally', '"type":"tally"'),
      textMarker('public-spoil-randomness', bytesToHex(publicSpoil.xi)), selectionMarker('public-spoil-selections', publicSpoil.selections)]) {
      assert.equal(leaks([{ name: 'public-export', bytes: publicJson }], [marker]).length, 1, `${marker.name} positive control is present`);
    }
    for (const prefix of ['archived/board/body-', 'archived/export.qvb/body-', 'recorded/body-', 'stored-recorded/body-']) {
      assert.ok(leaks(finalExports.filter((surface) => surface.name.startsWith(prefix) && !surface.name.endsWith('/canonical')),
        [textMarker('public-spoil-randomness', bytesToHex(publicSpoil.xi))]).length > 0, 'decoded board bodies expose the public opening to the scanner');
    }
    w.clock = Math.max(w.clock, issuedAt + 9 * day);
    assert.equal(await w.server.retention.runOnce(), 6, 'registered, revoked and expired invite data is purged after grace');
    for (const invite of invites) {
      const row = rt.edb.inviteById(invite.invite_id)!;
      assert.ok(row.label_enc === null && row.contact_enc === null, 'retention NULLs both private columns');
    }
    assert.equal(await w.server.retention.runOnce(), 0, 'the next retention pass is a no-op');
    assert.deepEqual(leaks([...await storedSurfaces(w), ...await exports(w, 'post-retention')], markers), [], 'post-retention files, logs and exports stay clean');
  } finally { await w.stop(); }
});
