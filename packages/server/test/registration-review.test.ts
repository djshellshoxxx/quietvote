// Independent enrollment trust-boundary probes. No shared registration encoder is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { b64u } from '@quietvote/board';
import { bytesToHex, ed25519Sign } from '@quietvote/crypto';
import { ApiClient } from '../../web/src/api/client.ts';
import { BIN, qv } from '../../cli/test/helpers.ts';
import { writePrivateFixture, writePrivateFixtureAsync } from '../../cli/test/private-fixture.ts';
import { WindowsPrivateFileError } from '../../cli/src/windows-private-files.ts';
import { World, kp } from './helpers/world.ts';

const digest = (bytes: Uint8Array): Buffer => createHash('sha256').update(bytes).digest();
const prefix = (id: string): Buffer => Buffer.from(`QV-REG-v1\0${id}\0`);
const framed = (id: string, bearer: Uint8Array, pk: Uint8Array): Buffer => Buffer.concat([prefix(id), bearer, pk]);
const bodyFor = (id: string, bearer: Uint8Array, key: ReturnType<typeof kp>, message = framed(id, bearer, key.publicKey)) => ({
  invite_code: b64u(bearer), pk: b64u(key.publicKey), alg: 'ed25519' as const, pop: b64u(ed25519Sign(key.secretKey, message)),
});
async function fixture(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 0 });
  await w.start(); await w.setupOrgAndElection(); return w;
}
async function invite(w: World) {
  const r = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
  assert.equal(r.status, 201, r.text);
  return r.json.invites[0] as { invite_id: string; code: string };
}
const path = (w: World) => `/api/v1/elections/${w.electionId}/registrations`;

test('review: theft of a stored invite verifier does not redeem it, and modern scheme survives restart', async () => {
  const w = await fixture('registration-review-stored');
  try {
    const issued = await invite(w), key = kp('review', 'stored');
    const rt = (await w.server.pool.get(w.electionId))!;
    const row = rt.edb.inviteById(issued.invite_id)!;
    const token = Buffer.from(issued.code, 'base64url'), hash = digest(token);
    assert.deepEqual(Buffer.from(row.code_hash), digest(Buffer.concat([Buffer.from('QV-INVITE-HASH-v1\0'), hash])));
    assert.equal(row.expires_at, w.clock + 14 * 86_400_000);
    const stolen = bodyFor(w.electionId, row.code_hash, key);
    assert.equal((await w.req('POST', path(w), stolen)).status, 409);
    assert.equal(rt.edb.voterCount(), 0); assert.equal(rt.edb.inviteById(issued.invite_id)!.state, 'issued');
    const real = bodyFor(w.electionId, hash, key);
    const accepted = await w.req('POST', path(w), real);
    assert.equal(accepted.status, 201);
    await w.server.stop(); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.edb.row().registration_scheme, 'hashed-pop-v1');
    assert.equal(reopened.edb.voterCount(), 1);
    const retry = await w.req('POST', path(w), real);
    assert.equal(retry.status, 201); assert.deepEqual(retry.json, accepted.json);
  } finally { await w.stop(); }
});

test('review: noncanonical public-key/signature aliases cannot consume an invite', async () => {
  const w = await fixture('registration-review-padding');
  try {
    const issued = await invite(w), key = kp('review', 'padding');
    const body = bodyFor(w.electionId, digest(Buffer.from(issued.code, 'base64url')), key);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (const field of ['pk', 'pop'] as const) {
      const value = body[field], alias = value.slice(0, -1) + alphabet[alphabet.indexOf(value.at(-1)!) | 1];
      assert.notEqual(alias, value); assert.deepEqual(Buffer.from(alias, 'base64url'), Buffer.from(value, 'base64url'));
      assert.equal((await w.req('POST', path(w), { ...body, [field]: alias })).status, 400);
    }
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.voterCount(), 0); assert.equal(rt.edb.inviteById(issued.invite_id)!.state, 'issued');
    assert.equal((await w.req('POST', path(w), body)).status, 201);
  } finally { await w.stop(); }
});

test('review: valid signatures over alternate domain and field framing are rejected', async () => {
  const w = await fixture('registration-review-framing');
  try {
    const issued = await invite(w), key = kp('review', 'framing'), hash = digest(Buffer.from(issued.code, 'base64url'));
    assert.equal(framed(w.electionId, hash, key.publicKey).length, 107);
    const alternatives = [
      Buffer.concat([Buffer.from(`QV-REG-v1${w.electionId}\0`), hash, key.publicKey]),
      Buffer.concat([prefix(w.electionId), Buffer.from(b64u(hash)), key.publicKey]),
      Buffer.concat([prefix(w.electionId), key.publicKey, hash]),
    ];
    for (const message of alternatives) assert.equal((await w.req('POST', path(w), bodyFor(w.electionId, hash, key, message))).status, 401);
    assert.equal((await w.server.pool.get(w.electionId))!.edb.voterCount(), 0);
    assert.equal((await w.req('POST', path(w), bodyFor(w.electionId, hash, key))).status, 201);
  } finally { await w.stop(); }
});

test('review: schema8 null-expiry legacy invitations retain their original redemption contract', async () => {
  const w = await fixture('registration-review-legacy-null');
  try {
    const issued = await invite(w), key = kp('review', 'legacy-null');
    const dbPath = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    const legacyHash = digest(Buffer.from(`QV-INVITE-v1\0${issued.code}`));
    await w.server.stop();
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare('UPDATE voter_invite SET code_hash=?,expires_at=NULL WHERE invite_id=?').run(legacyHash, issued.invite_id);
      db.exec('DROP TABLE export_record; DROP TABLE pinned_roll; ALTER TABLE election DROP COLUMN registration_scheme; DELETE FROM schema_migration WHERE version>=9; PRAGMA user_version=8');
    } finally { db.close(); }
    w.clock += 20 * 86_400_000;
    await w.start();
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.row().registration_scheme, 'legacy-raw-v1');
    assert.equal(rt.edb.inviteById(issued.invite_id)!.expires_at, null);
    assert.deepEqual(Buffer.from(rt.edb.inviteById(issued.invite_id)!.code_hash), legacyHash);
    const oldMessage = Buffer.concat([prefix(w.electionId), key.publicKey]);
    const accepted = await w.req('POST', path(w), { invite_code: issued.code, pk: b64u(key.publicKey), alg: 'ed25519', pop: b64u(ed25519Sign(key.secretKey, oldMessage)) });
    assert.equal(accepted.status, 201); assert.equal(rt.edb.voterCount(), 1);
  } finally { await w.stop(); }
});

test('review: browser adapter refuses contradictory identity metadata before transmitting enrollment', async () => {
  const w = await fixture('registration-review-metadata');
  try {
    const issued = await invite(w), key = kp('review', 'metadata');
    const body = bodyFor(w.electionId, digest(Buffer.from(issued.code, 'base64url')), key);
    const metadata = (await w.get(`/api/v1/elections/${w.electionId}`)).json;
    for (const altered of [
      { ...metadata, registration_scheme: 'legacy-raw-v1' }, { ...metadata, registration_scheme: 'unknown' },
      { ...metadata, election_id: '00'.repeat(16) }, { ...metadata, origin: 'quietvote/v1/another-election' },
    ]) {
      let posts = 0;
      const client = new ApiClient({ fetch: async (_url, init) => {
        if (init?.method === 'POST') posts++;
        return new Response(JSON.stringify(altered), { status: 200, headers: { 'content-type': 'application/json' } });
      } });
      await assert.rejects(client.register(w.electionId, body)); assert.equal(posts, 0);
    }
  } finally { await w.stop(); }
});

test('review: browser adapter binds success to this voter and exposes only the public result', async () => {
  const w = await fixture('registration-review-success');
  try {
    const issued = await invite(w), key = kp('review', 'success');
    const body = bodyFor(w.electionId, digest(Buffer.from(issued.code, 'base64url')), key);
    const metadata = (await w.get(`/api/v1/elections/${w.electionId}`)).json;
    const accepted = await w.req('POST', path(w), body); assert.equal(accepted.status, 201);
    for (const response of [{ ...accepted.json, voter_kid: 'wrong-voter' }, { ...accepted.json, status: 'committed' }, {}, null, []]) {
      const client = new ApiClient({ fetch: async (_url, init) => new Response(JSON.stringify(init?.method === 'POST' ? response : metadata), { status: 200 }) });
      await assert.rejects(client.register(w.electionId, body));
    }
    const client = new ApiClient({ fetch: async (_url, init) => new Response(JSON.stringify(init?.method === 'POST' ? { ...accepted.json, extra_secret: 'server-private-canary' } : metadata), { status: 200 }) });
    assert.deepEqual(await client.register(w.electionId, body), accepted.json);
  } finally { await w.stop(); }
});

/** Attribute benign Windows fixture failures without printing keys, paths or native diagnostics. */
async function writeEnrollmentFixture(phase: 'voter-key' | 'invite', file: string, contents: string): Promise<void> {
  try { await writePrivateFixtureAsync(file, contents); }
  catch (error) {
    if (error instanceof WindowsPrivateFileError) {
      throw new Error(`native fixture ${phase} refused (${error.code}/${error.diagnostic ?? 'UNCLASSIFIED'})`, { cause: error });
    }
    throw error;
  }
}

test('review: shipped CLI enrollment rejects forged success and sanitizes extra response data', async () => {
  const w = await fixture('registration-review-cli');
  const dir = mkdtempSync(join(tmpdir(), 'qv-registration-review-cli-'));
  try {
    const issued = await invite(w), key = kp('review', 'cli');
    const body = bodyFor(w.electionId, digest(Buffer.from(issued.code, 'base64url')), key);
    const metadata = (await w.get(`/api/v1/elections/${w.electionId}`)).json;
    const accepted = await w.req('POST', path(w), body); assert.equal(accepted.status, 201);
    const keyFile = join(dir, 'voter.json'), inviteFile = join(dir, 'invite.txt');
    await writeEnrollmentFixture('voter-key', keyFile, JSON.stringify({ format: 'qv-voter-key/v1', seed: bytesToHex(key.secretKey), public_key: bytesToHex(key.publicKey) }));
    await writeEnrollmentFixture('invite', inviteFile, issued.code);
    let reply: unknown = { ...accepted.json, voter_kid: 'wrong-voter' };
    const server = createServer((req, res) => { req.resume(); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.method === 'POST' ? reply : metadata)); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const args = ['online', 'enroll', '--server', `http://127.0.0.1:${address.port}`, '--id', w.electionId, '--key', keyFile, '--invite-file', inviteFile, '--json'];
      const refused = await qv(args); assert.equal(refused.code, 1); assert.equal(refused.out, '');
      reply = { ...accepted.json, extra_secret: 'server-private-canary' };
      const success = await qv(args); assert.equal(success.code, 0, success.err); assert.deepEqual(JSON.parse(success.out), accepted.json);
      assert.ok(!success.out.includes('server-private-canary') && !success.out.includes(issued.code));
    } finally { await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); }
  } finally { await w.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('review: actual CLI refuses malformed and nonregular invite files without blocking', async () => {
  const w = await fixture('registration-review-files');
  const dir = mkdtempSync(join(tmpdir(), 'qv-registration-review-files-'));
  try {
    const issued = await invite(w), text = join(dir, 'invite.txt'), large = join(dir, 'large.txt'), invalid = join(dir, 'invalid.txt');
    writePrivateFixture(text, issued.code); writePrivateFixture(large, Buffer.alloc(129, 65)); writePrivateFixture(invalid, Buffer.from([0xff]));
    const files = [dir, large, invalid];
    if (process.platform !== 'win32') {
      const link = join(dir, 'invite-link'), fifo = join(dir, 'invite-fifo');
      symlinkSync(text, link); execFileSync('mkfifo', [fifo]); files.push(link, fifo);
    }
    for (const input of files) {
      const result = await new Promise<{ code: number | null; out: string; err: string; timedOut: boolean }>((resolve, reject) => {
        const child = spawn(process.execPath, [BIN, 'online', 'enroll', '--server', w.base, '--id', w.electionId, '--key', join(dir, 'must-not-read.key'), '--invite-file', input], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '', timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, 5000);
        child.stdout.on('data', (b) => out += b); child.stderr.on('data', (b) => err += b);
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err, timedOut }); });
      });
      assert.equal(result.timedOut, false, 'input validation must not wait for FIFO writers');
      assert.equal(result.code, 4, result.err); assert.equal(result.out, '');
      assert.doesNotMatch(result.err, /must-not-read/);
    }
    assert.equal((await w.server.pool.get(w.electionId))!.edb.voterCount(), 0);
  } finally { await w.stop(); rmSync(dir, { recursive: true, force: true }); }
});
