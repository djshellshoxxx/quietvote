import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ed25519Keypair, streamRng } from '@quietvote/crypto';
import { parseArgs, UsageError } from '../src/args.ts';
import { COORD, CANARY, LOGK, TINY, VEC, copyVectors, makeBoardJson, qv, spawnQv, strangerKeyFile, tinyBundle, tmp, voterKeyFile, writeJson } from './helpers.ts';

const hexOf = (b: Uint8Array): string => Buffer.from(b).toString('hex');

// ---------------------------------------------------------------- argument parsing

test('args: flags, = form, repeated multi, terminator, errors', () => {
  const p = parseArgs(['a', '--x', '1', '--m=2', '--m', '3', '--b', '--', '--notflag'], { x: 'value', m: 'multi', b: 'bool' });
  assert.deepEqual(p.positional, ['a', '--notflag']);
  assert.equal(p.get('x'), '1');
  assert.deepEqual(p.all('m'), ['2', '3']);
  assert.ok(p.has('b') && !p.has('x2'));
  assert.throws(() => parseArgs(['--nope'], {}), UsageError);
  assert.throws(() => parseArgs(['--x'], { x: 'value' }), UsageError);
  assert.throws(() => parseArgs(['--x=1', '--x=2'], { x: 'value' }), UsageError);
  assert.throws(() => parseArgs(['--b=1'], { b: 'bool' }), UsageError);
  assert.throws(() => parseArgs(['-v'], {}), UsageError);
  assert.throws(() => parseArgs(['--__proto__'], {}), UsageError);
});

// ---------------------------------------------------------------- top level

test('help, version, unknown commands and exit codes (in-process and real process)', async () => {
  assert.equal((await qv(['--help'])).code, 0);
  assert.match((await qv(['--help'])).out, /exit codes:/);
  assert.equal((await qv([])).code, 2);
  assert.match((await qv(['--version'])).out, /^qv 0\./);
  assert.equal((await qv(['frobnicate'])).code, 2);
  assert.equal((await qv(['ballot'])).code, 2);
  assert.equal((await qv(['ballot', 'nope'])).code, 2);
  assert.equal((await qv(['constructor'])).code, 2, 'prototype names are not commands');
  assert.equal(spawnQv(['--version']).code, 0);
  assert.equal(spawnQv(['frobnicate']).code, 2);
  const r = spawnQv(['verify', TINY, '--skip-selftest']);
  assert.equal(r.code, 0);
  assert.match(r.out, /VERDICT: PASS/);
  assert.equal(spawnQv(['verify', CANARY, '--skip-selftest']).code, 1);
  assert.equal(spawnQv(['verify', '/no/such/file']).code, 4);
});

// ---------------------------------------------------------------- verify

test('verify: PASS=0, FAIL=1, INCOMPLETE=3, bad input=4, usage=2', async () => {
  const pass = await qv(['verify', TINY, '--skip-selftest']);
  assert.equal(pass.code, 0);
  assert.match(pass.out, /V1 +PASS/);
  assert.match(pass.out, /V4 +NOT RUN/);
  assert.match(pass.out, /report hash: [0-9a-f]{64}/);
  const fail = await qv(['verify', CANARY, '--skip-selftest']);
  assert.equal(fail.code, 1);
  assert.match(fail.out, /VERDICT: FAIL/);
  assert.match(fail.out, /V5 +FAIL/);
  const dir = tmp();
  const t = tinyBundle();
  t.log = t.log.slice(0, -1); // drop the tally record
  const inc = await qv(['verify', writeJson(dir, 'incomplete.json', t), '--skip-selftest']);
  assert.equal(inc.code, 3);
  assert.match(inc.out, /VERDICT: INCOMPLETE/);
  const garbage = join(dir, 'garbage.json');
  writeFileSync(garbage, '{"manifest":');
  assert.equal((await qv(['verify', garbage, '--skip-selftest'])).code, 1, 'unparseable bundle is a FAIL report, not a crash');
  assert.equal((await qv(['verify', join(dir, 'missing.json')])).code, 4);
  assert.equal((await qv(['verify'])).code, 2);
  assert.equal((await qv(['verify', TINY, '--bogus'])).code, 2);
  assert.equal((await qv(['verify', TINY, '--manifest-hash', 'xyz'])).code, 2);
});

test('verify: --json is structured; pinned manifest hash; self-test runs by default', async () => {
  const j = await qv(['verify', TINY, '--json']);
  assert.equal(j.code, 0);
  const rep = JSON.parse(j.out);
  assert.equal(rep.verdict, 'PASS');
  assert.equal(rep.checks.V4.status, 'not_run');
  assert.equal(rep.checks.V13.status, 'not_run');
  assert.equal(rep.selfTest.ok, true);
  assert.equal(rep.selfTest.control, true);
  assert.equal(rep.selfTest.rejected, rep.selfTest.total);
  assert.match(rep.reportHash, /^[0-9a-f]{64}$/);
  const pinned = await qv(['verify', TINY, '--skip-selftest', '--manifest-hash', '00'.repeat(32)]);
  assert.equal(pinned.code, 1);
  assert.match(pinned.out, /V1 +FAIL/);
});

test('selftest command', async () => {
  const r = await qv(['selftest']);
  assert.equal(r.code, 0);
  assert.match(r.out, /self-test: ok/);
  assert.match(r.out, /canary +canary-election/);
  assert.equal((await qv(['selftest', 'extra'])).code, 2);
});

// ---------------------------------------------------------------- keygen

const FAST = ['--kdf-memory-kib', '19456', '--kdf-iterations', '2'];
const PASS = 'correct horse battery staple';

test('keygen: protected QVKEY1 by default (argon2id), unlock round trip, wrong passphrase, 0600, no overwrite', async () => {
  const dir = tmp();
  const seed = '07'.repeat(32);
  const seedFile = join(dir, 'seed.hex');
  writeFileSync(seedFile, `${seed}\n`);
  const pwFile = join(dir, 'pw.txt');
  writeFileSync(pwFile, `${PASS}\n`);
  const want = hexOf(ed25519Keypair(Uint8Array.from(Buffer.from(seed, 'hex'))).publicKey);
  const k1 = join(dir, 'k1.json');
  const a = await qv(['keygen', '--out', k1, '--seed-file', seedFile, '--passphrase-file', pwFile, ...FAST]);
  assert.equal(a.code, 0, a.err);
  assert.match(a.out, new RegExp(`voter public key: ${want}`));
  assert.match(a.out, /QVKEY1, argon2id/);
  assert.equal(statSync(k1).mode & 0o777, 0o600);
  const c = JSON.parse(readFileSync(k1, 'utf8'));
  assert.equal(c.kdf, 'argon2id');
  assert.equal(c.aead, 'A256GCM');
  assert.equal(c.m, 19456);
  assert.ok(!readFileSync(k1, 'utf8').includes(seed), 'seed is not stored in the clear');
  assert.ok(!a.out.includes(seed) && !a.err.includes(seed) && !a.out.includes(PASS), 'secrets never echoed');

  // usable: encrypt a ballot with the protected key (passphrase from file), wrong passphrase refused, none refused
  const wrong = join(dir, 'wrong.txt');
  writeFileSync(wrong, 'not the passphrase at all\n');
  const base = ['ballot', 'encrypt', '--election', TINY, '--key', k1, '--select', 'budget=yes'];
  assert.equal((await qv([...base, '--out', join(dir, 'e0.json'), '--passphrase-file', wrong])).code, 4);
  assert.equal((await qv([...base, '--out', join(dir, 'e1.json')])).code, 2, 'protected key needs a passphrase source');
  assert.equal((await qv([...base, '--out', join(dir, 'e2.json'), '--passphrase-stdin'], { stdin: `${PASS}\n` })).code, 1, 'unlocked, but this seed is not a voter on the roll');
  assert.equal((await qv([...base, '--out', join(dir, 'e3.json'), '--passphrase-stdin'], { stdin: `${PASS}\n` })).err.includes('not on the election roll'), true);

  const again = await qv(['keygen', '--out', k1, '--seed-file', seedFile, '--passphrase-file', pwFile, ...FAST]);
  assert.equal(again.code, 4);
  assert.match(again.err, /--force/);
  assert.equal((await qv(['keygen', '--out', k1, '--seed-file', seedFile, '--passphrase-file', pwFile, '--force', ...FAST])).code, 0);

  // same seed, fresh salt/iv each time
  const k2 = join(dir, 'k2.json');
  await qv(['keygen', '--out', k2, '--seed-file', seedFile, '--passphrase-file', pwFile, ...FAST], { rng: streamRng('other-salt') });
  assert.notEqual(JSON.parse(readFileSync(k2, 'utf8')).salt, JSON.parse(readFileSync(k1, 'utf8')).salt);
});

test('keygen: interactive prompt (confirmed), stdin seed, random seed, unprotected only on request', async () => {
  const dir = tmp();
  const seed = '09'.repeat(32);
  const want = hexOf(ed25519Keypair(Uint8Array.from(Buffer.from(seed, 'hex'))).publicKey);
  const p1 = await qv(['keygen', '--out', join(dir, 'p1.json'), '--seed-stdin', '--json', ...FAST], { stdin: seed, prompts: [PASS, PASS] });
  assert.equal(p1.code, 0, p1.err);
  assert.equal(JSON.parse(p1.out).public_key, want);
  assert.equal(JSON.parse(p1.out).protected, true);
  assert.equal((await qv(['keygen', '--out', join(dir, 'p2.json'), ...FAST], { prompts: [PASS, 'something else entirely'] })).code, 2, 'confirmation mismatch');
  assert.equal((await qv(['keygen', '--out', join(dir, 'p3.json'), ...FAST], { prompts: ['short'] })).code, 2, 'too short');
  const none = await qv(['keygen', '--out', join(dir, 'p4.json'), ...FAST]);
  assert.equal(none.code, 2, 'no passphrase source and not a terminal');
  assert.match(none.err, /--no-passphrase/);
  assert.ok(!existsSync(join(dir, 'p4.json')));
  // seed from stdin and passphrase from stdin cannot share one stream
  assert.equal((await qv(['keygen', '--out', join(dir, 'p5.json'), '--seed-stdin', '--passphrase-stdin', ...FAST], { stdin: seed })).code, 2);

  const plain = await qv(['keygen', '--out', join(dir, 'plain.json'), '--no-passphrase', '--json'], { rng: streamRng('one') });
  assert.equal(plain.code, 0);
  assert.equal(JSON.parse(plain.out).protected, false);
  assert.match(plain.err, /NOT passphrase-protected/);
  assert.equal(statSync(join(dir, 'plain.json')).mode & 0o777, 0o600);
  const plain2 = await qv(['keygen', '--out', join(dir, 'plain2.json'), '--no-passphrase', '--json'], { rng: streamRng('two') });
  assert.notEqual(JSON.parse(plain.out).public_key, JSON.parse(plain2.out).public_key);
  assert.equal((await qv(['keygen', '--out', join(dir, 'x.json'), '--no-passphrase', '--passphrase-stdin'])).code, 2);

  // raw 32-byte seed file
  const raw = join(dir, 'raw.bin');
  writeFileSync(raw, Buffer.from(seed, 'hex'));
  assert.equal(JSON.parse((await qv(['keygen', '--out', join(dir, 'k3.json'), '--seed-file', raw, '--no-passphrase', '--json'])).out).public_key, want);
});

test('keygen: nothing secret on argv; bad arguments', async () => {
  const dir = tmp();
  const seed = '07'.repeat(32);
  const seedFile = join(dir, 'seed.hex');
  writeFileSync(seedFile, seed);
  assert.equal((await qv(['keygen', '--out', join(dir, 'a.json'), '--seed', seed, '--no-passphrase'])).code, 2, 'no --seed');
  assert.equal((await qv(['keygen', '--out', join(dir, 'a.json'), '--passphrase', PASS])).code, 2, 'no --passphrase');
  assert.equal((await qv(['keygen', '--seed-file', seedFile, '--no-passphrase'])).code, 2, '--out required');
  writeFileSync(join(dir, 'short'), 'abcd');
  assert.equal((await qv(['keygen', '--out', join(dir, 'b.json'), '--seed-file', join(dir, 'short'), '--no-passphrase'])).code, 2);
  assert.equal((await qv(['keygen', '--out', join(dir, 'c.json'), '--seed-file', seedFile, '--seed-stdin', '--no-passphrase'])).code, 2);
  assert.equal((await qv(['keygen', '--out', join(dir, 'd.json'), '--seed-file', join(dir, 'nope'), '--no-passphrase'])).code, 4);
  assert.equal((await qv(['keygen', '--out', join(dir, 'e.json'), '--no-passphrase', '--kdf-memory-kib', '10'])).code, 0, 'KDF flags are ignored without a passphrase');
  assert.equal((await qv(['keygen', '--out', join(dir, 'f.json'), '--passphrase-file', seedFile, '--kdf-memory-kib', '1024'])).code, 2, 'below the KDF floor');
  assert.equal((await qv(['keygen', '--out', join(dir, 'g.json'), '--passphrase-file', seedFile, '--kdf-memory-kib', '99999999'])).code, 2, 'above the ceiling');
  assert.equal((await qv(['keygen', '--out', join(dir, 'h.json'), '--passphrase-file', seedFile, '--kdf-memory-kib', 'lots'])).code, 2);
  assert.ok(!existsSync(join(dir, 'f.json')) && !existsSync(join(dir, 'g.json')));
});

// ---------------------------------------------------------------- ballot encrypt / audit

test('ballot: spoil with private reveal audits OK on a second invocation; tampering and wrong election are caught', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 0);
  const env = join(dir, 'spoil.json');
  const audit = join(dir, 'audit.json');
  const e = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--intent', 'spoil', '--out', env, '--audit-out', audit, '--json']);
  assert.equal(e.code, 0, e.err);
  const info = JSON.parse(e.out);
  assert.match(info.ballot_code, /^[0-9a-f]{64}$/);
  assert.equal(statSync(audit).mode & 0o777, 0o600);
  assert.match(e.err, /test selections only/);
  const envJson = JSON.parse(readFileSync(env, 'utf8'));
  assert.equal(envJson.intent, 'spoil');
  assert.equal(envJson.reveal, undefined, 'private mode: reveal is not in the envelope (QV-ADR-020)');
  assert.ok(!readFileSync(env, 'utf8').includes('"selections"'));

  const ok = await qv(['ballot', 'audit', '--election', TINY, '--ballot', audit]);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /AUDIT PASSED/);
  assert.match(ok.out, /selection budget: yes/);
  assert.match(ok.out, new RegExp(info.ballot_code));
  const okJson = JSON.parse((await qv(['ballot', 'audit', '--election', TINY, '--ballot', audit, '--json'])).out);
  assert.equal(okJson.ok, true);
  assert.deepEqual(okJson.selections, { budget: ['yes'] });

  // lying client: claims the ballot encrypts "no"
  const a = JSON.parse(readFileSync(audit, 'utf8'));
  a.reveal.selections = { budget: ['no'] };
  const bad = await qv(['ballot', 'audit', '--election', TINY, '--ballot', writeJson(dir, 'bad-selection.json', a)]);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /AUDIT FAILED/);
  // wrong randomness
  const a2 = JSON.parse(readFileSync(audit, 'utf8'));
  a2.reveal.xi = '11'.repeat(64);
  assert.equal((await qv(['ballot', 'audit', '--election', TINY, '--ballot', writeJson(dir, 'bad-xi.json', a2)])).code, 1);
  // tampered ciphertext in the posted envelope
  const a3 = JSON.parse(readFileSync(audit, 'utf8'));
  a3.envelope.body.contests[0].sel[0].c0 = '00'.repeat(32);
  assert.equal((await qv(['ballot', 'audit', '--election', TINY, '--ballot', writeJson(dir, 'bad-ct.json', a3)])).code, 1);
  // not an audit: a cast envelope has no reveal
  const cast = join(dir, 'cast.json');
  assert.equal((await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=no', '--out', cast])).code, 0);
  assert.equal((await qv(['ballot', 'audit', '--election', TINY, '--ballot', cast])).code, 4);
});

test('ballot: --publish-reveal embeds the reveal so the envelope alone audits', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 1);
  const env = join(dir, 'pub.json');
  const e = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--intent', 'spoil', '--publish-reveal', '--out', env, '--audit-out', join(dir, 'a.json')]);
  assert.equal(e.code, 0);
  assert.match(e.err, /selections .* public/);
  const r = await qv(['ballot', 'audit', '--election', TINY, '--ballot', env]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /AUDIT PASSED/);
});

test('ballot encrypt: deterministic under an injected rng, hedged otherwise; blank contests noted; no overwrite; no key material in the envelope', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 2);
  const o1 = join(dir, 'a.json');
  const o2 = join(dir, 'b.json');
  const r1 = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--out', o1], { rng: streamRng('fixed') });
  const r2 = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--out', o2], { rng: streamRng('fixed') });
  assert.equal(r1.code, 0);
  assert.equal(r2.code, 0);
  assert.equal(readFileSync(o1, 'utf8'), readFileSync(o2, 'utf8'));
  assert.match(r1.err, /cast blank/);
  assert.equal((await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--out', o1])).code, 4, 'refuses to overwrite');
  const hedge = join(dir, 'c.json');
  await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--out', hedge], { rng: streamRng('other') });
  assert.notEqual(readFileSync(hedge, 'utf8'), readFileSync(o1, 'utf8'), 'fresh randomness changes the ballot');
  assert.ok(!readFileSync(o1, 'utf8').includes(hexOf(Buffer.from(JSON.parse(readFileSync(key, 'utf8')).seed, 'hex'))), 'envelope carries no key material');
});

test('ballot encrypt: usage and failure exit codes', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 0);
  const base = ['ballot', 'encrypt', '--election', TINY, '--key', key];
  assert.equal((await qv([...base, '--select', 'budget=maybe', '--out', join(dir, '1')])).code, 2, 'unknown option id');
  assert.equal((await qv([...base, '--select', 'nope=yes', '--out', join(dir, '2')])).code, 2, 'unknown contest');
  assert.equal((await qv([...base, '--select', 'budget=yes,no', '--out', join(dir, '3')])).code, 2, 'overvote');
  assert.equal((await qv([...base, '--select', 'budget', '--out', join(dir, '4')])).code, 2, 'malformed select');
  assert.equal((await qv([...base, '--select', 'budget=yes', '--select', 'budget=no', '--out', join(dir, '5')])).code, 2, 'contest twice');
  assert.equal((await qv([...base, '--intent', 'spoil', '--out', join(dir, '6')])).code, 2, 'spoil needs --audit-out');
  assert.equal((await qv([...base, '--intent', 'burn', '--out', join(dir, '7')])).code, 2);
  assert.equal((await qv([...base, '--publish-reveal', '--out', join(dir, '8')])).code, 2, 'publish-reveal only for spoil');
  assert.equal((await qv([...base, '--supersedes', 'zz', '--out', join(dir, '9')])).code, 2);
  assert.equal((await qv(base)).code, 2, '--out required');
  const stranger = await qv(['ballot', 'encrypt', '--election', TINY, '--key', strangerKeyFile(dir), '--select', 'budget=yes', '--out', join(dir, '10')]);
  assert.equal(stranger.code, 1);
  assert.match(stranger.err, /not on the election roll/);
  assert.ok(!existsSync(join(dir, '10')));
  assert.equal((await qv(['ballot', 'encrypt', '--election', join(dir, 'none'), '--key', key, '--out', join(dir, '11')])).code, 4);
  assert.equal((await qv(['ballot', 'encrypt', '--election', TINY, '--key', join(dir, 'nokey'), '--out', join(dir, '12')])).code, 4);
  const notKey = writeJson(dir, 'notkey.json', { hello: 1 });
  assert.equal((await qv(['ballot', 'encrypt', '--election', TINY, '--key', notKey, '--out', join(dir, '13')])).code, 2);
  // an election whose key material does not verify must not be used
  const t = tinyBundle();
  t.log = t.log.filter((l: any) => l.entry?.body?.name !== 'dkg-final');
  const broken = await qv(['ballot', 'encrypt', '--election', writeJson(dir, 'nodkg.json', t), '--key', key, '--select', 'budget=yes', '--out', join(dir, '14')]);
  assert.equal(broken.code, 1);
  assert.match(broken.err, /refusing to use it/);
});

// ---------------------------------------------------------------- board verify

test('board verify: standalone bundle is PARTIAL (3) without author keys, VERIFIED (0) with them, FAILED (1) when tampered', async () => {
  const dir = tmp();
  const bj = makeBoardJson();
  const file = writeJson(dir, 'board.json', bj);
  const partial = await qv(['board', 'verify', file]);
  assert.equal(partial.code, 3);
  assert.match(partial.out, /BOARD INTEGRITY: PARTIAL/);
  assert.match(partial.out, /not a pass/);
  const args = ['--log-key', hexOf(LOGK.publicKey), '--author-key', hexOf(COORD.publicKey)];
  const ok = await qv(['board', 'verify', file, ...args, '--json']);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(JSON.parse(ok.out).integrity, 'VERIFIED');
  const wrongKey = await qv(['board', 'verify', file, '--log-key', hexOf(ed25519Keypair(Uint8Array.from({ length: 32 }, () => 5)).publicKey), '--author-key', hexOf(COORD.publicKey)]);
  assert.equal(wrongKey.code, 1);
  const tampered = makeBoardJson();
  tampered.entries[5].body_b64u = Buffer.from('forged').toString('base64url');
  const bad = await qv(['board', 'verify', writeJson(dir, 'tampered.json', tampered), ...args]);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /failure QV_BOARD_BODY_DIGEST @5/);
  const dropped = makeBoardJson();
  dropped.entries.pop();
  assert.equal((await qv(['board', 'verify', writeJson(dir, 'dropped.json', dropped), ...args])).code, 1);
  assert.equal((await qv(['board', 'verify', file, '--log-key', 'xx'])).code, 2);
  assert.equal((await qv(['board', 'verify', writeJson(dir, 'nonsense.json', { a: 1 })])).code, 4);
  assert.equal((await qv(['board', 'verify'])).code, 2);
  // a pinned checkpoint from the future is rollback evidence
  const pin = join(dir, 'pin.txt');
  writeFileSync(pin, bj.checkpoints[0]);
  assert.equal((await qv(['board', 'verify', file, ...args, '--pin-file', pin])).code, 0);
});

test('board verify: election bundle with board export uses manifest anchors; without export it is incomplete', async () => {
  const dir = tmp();
  const withBoard = { ...tinyBundle(), board: makeBoardJson() };
  const f = writeJson(dir, 'with-board.json', withBoard);
  const r = await qv(['board', 'verify', f]);
  assert.equal(r.code, 3, r.out + r.err); // structurally VERIFIED but unwitnessed (quorum 0) => V4 not a pass
  assert.match(r.out, /BOARD INTEGRITY: VERIFIED/);
  withBoard.board.entries[2].body_b64u = Buffer.from('x').toString('base64url');
  assert.equal((await qv(['board', 'verify', writeJson(dir, 'with-bad-board.json', withBoard)])).code, 1);
  const none = await qv(['board', 'verify', TINY]);
  assert.equal(none.code, 3);
  assert.match(none.err, /no usable board export/);
  // and the whole-bundle verdict agrees
  assert.equal((await qv(['verify', f, '--skip-selftest'])).code, 0);
  assert.equal((await qv(['verify', writeJson(dir, 'with-bad-board.json', withBoard), '--skip-selftest'])).code, 1);
});

// ---------------------------------------------------------------- election inspect

test('election inspect: summary, JSON, mismatching hash, invalid manifest, bad input', async () => {
  const text = await qv(['election', 'inspect', TINY]);
  assert.equal(text.code, 0);
  assert.match(text.out, /Test election vec-tiny/);
  assert.match(text.out, /trustees: 2-of-3/);
  assert.match(text.out, /contest budget:/);
  assert.match(text.out, /not a verification/);
  const j = JSON.parse((await qv(['election', 'inspect', TINY, '--json'])).out);
  assert.equal(j.roll_size, 5);
  assert.equal(j.manifest_hash_matches_bundle, true);
  assert.equal(j.verified, false);
  assert.equal(j.log_record_types['ballot:cast'], 4);
  assert.equal(j.log_record_types['ballot:spoil'], 1);

  const dir = tmp();
  const t = tinyBundle();
  t.manifest_hash = '00'.repeat(32);
  const mm = await qv(['election', 'inspect', writeJson(dir, 'mm.json', t)]);
  assert.equal(mm.code, 0);
  assert.match(mm.out, /DIFFERS from/);
  const bad = tinyBundle();
  bad.manifest.body.n = 'many';
  assert.equal((await qv(['election', 'inspect', writeJson(dir, 'badm.json', bad)])).code, 1);
  assert.equal((await qv(['election', 'inspect', writeJson(dir, 'notb.json', [])])).code, 4);
  assert.equal((await qv(['election', 'inspect', join(dir, 'missing')])).code, 4);
  assert.equal((await qv(['election', 'inspect'])).code, 2);
});

// ---------------------------------------------------------------- vectors check

test('vectors check: repository corpus conforms; summary line; JSON', async () => {
  const r = await qv(['vectors', 'check']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /vectors: (\d+)\/\1 passed, 0 failed, 1 file\(s\) not run/);
  assert.match(r.out, /SKIP protocol\/dkg\/dkg.json/);
  const strict = await qv(['vectors', 'check', VEC, '--strict', '--json']);
  assert.equal(strict.code, 1, 'not-run files fail under --strict');
  const sj = JSON.parse(strict.out);
  assert.equal(sj.ok, false);
  assert.deepEqual(sj.failed, []);
  assert.equal(sj.skipped.length, 1);
});

test('vectors check: corrupted vectors, mutant expectations and manifest drift are detected; bad dir is an input error', async () => {
  const tv = copyVectors();
  const f = join(tv, 'v1/primitives/hash/sha256.json');
  const j = JSON.parse(readFileSync(f, 'utf8'));
  j.vectors[0].expect.output.digest_hex = '00'.repeat(32);
  writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
  const r = await qv(['vectors', 'check', tv]);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL primitives\/hash\/sha256.json/);
  assert.match(r.out, /FAIL MANIFEST.json :: v1\/primitives\/hash\/sha256.json/);

  const tv2 = copyVectors();
  const mf = join(tv2, 'v1/mutations/count-altered.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.expect.failed_checks = ['chk.result.rules'];
  writeFileSync(mf, JSON.stringify(m));
  const r2 = await qv(['vectors', 'check', tv2, '--json']);
  assert.equal(r2.code, 1);
  assert.ok(JSON.parse(r2.out).failed.some((x: any) => x.file === 'mutations' && x.id === 'count-altered'));

  assert.equal((await qv(['vectors', 'check', tmp()])).code, 4);
  assert.equal((await qv(['vectors', 'check', 'a', 'b'])).code, 2);
});
