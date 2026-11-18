// Regression tests for the CLI audit findings F1..F12 (one test per finding, all through the existing helpers).
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { parseArgs, UsageError } from '../src/args.ts';
import { TINY, copyVectors, makeBoardJson, qv, tinyBundle, tmp, voterKeyFile, writeJson } from './helpers.ts';

const POSIX = process.platform !== 'win32';
const FAST = ['--kdf-memory-kib', '19456', '--kdf-iterations', '2'];

test('F1 board verify (election bundle): --manifest-hash is enforced; log/author keys are validated before the branch', async () => {
  const dir = tmp();
  const t = tinyBundle();
  const f = writeJson(dir, 'with-board.json', { ...t, board: makeBoardJson() });
  // matching pin: same outcome as without it (structurally verified, unwitnessed => not a pass, exit 3)
  assert.equal((await qv(['board', 'verify', f, '--manifest-hash', t.manifest_hash])).code, 3);
  // a pin that differs from the bundle's manifest is a verification failure
  const wrong = await qv(['board', 'verify', f, '--manifest-hash', '00'.repeat(32)]);
  assert.equal(wrong.code, 1);
  assert.match(wrong.err, /--manifest-hash does not match/);
  // malformed hex is a usage error, on both bundle kinds
  assert.equal((await qv(['board', 'verify', f, '--manifest-hash', 'xyz'])).code, 2);
  assert.equal((await qv(['board', 'verify', f, '--log-key', 'zz'])).code, 2);
  assert.equal((await qv(['board', 'verify', f, '--author-key', 'zz'])).code, 2);
  assert.equal((await qv(['board', 'verify', TINY, '--author-key', 'zz'])).code, 2);
  // a log key that is not the manifest's bb.log_pk is refused; the manifest's own key is accepted
  assert.equal((await qv(['board', 'verify', f, '--log-key', '11'.repeat(32)])).code, 1);
  assert.equal((await qv(['board', 'verify', f, '--log-key', t.manifest.body.bb.log_pk])).code, 3);
});

test('F2 keygen --force: the old file is replaced at mode 0600, and a symlink is never written through', async () => {
  const dir = tmp();
  const out = join(dir, 'k.json');
  writeFileSync(out, 'old');
  if (POSIX) chmodSync(out, 0o644);
  const r = await qv(['keygen', '--out', out, '--no-passphrase', '--force']);
  assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(out, 'utf8'), /qv-voter-key\/v1/);
  if (POSIX) assert.equal(statSync(out).mode & 0o777, 0o600, 'permissions of the old file are not kept');

  const target = join(dir, 'target.txt');
  writeFileSync(target, 'keep');
  const link = join(dir, 'link.json');
  symlinkSync(target, link);
  const viaLink = await qv(['keygen', '--out', link, '--no-passphrase', '--force']);
  assert.equal(viaLink.code, 4);
  assert.match(viaLink.err, /symbolic link/);
  assert.equal(readFileSync(target, 'utf8'), 'keep', 'the symlink target is untouched');
  assert.ok(lstatSync(link).isSymbolicLink(), 'the symlink is not replaced');
  assert.equal((await qv(['keygen', '--out', link, '--no-passphrase'])).code, 4, 'without --force an existing entry is refused');
});

test('F3 ballot audit: JSON that is not an object is an input error (exit 4), not an internal error (70)', async () => {
  const dir = tmp();
  for (const body of ['null', '5', '"x"', '[]']) {
    const f = join(dir, `b-${body.length}-${body.charCodeAt(0)}.json`);
    writeFileSync(f, body);
    const r = await qv(['ballot', 'audit', '--election', TINY, '--ballot', f]);
    assert.equal(r.code, 4, `${body}: ${r.err}`);
    assert.match(r.err, /not a JSON object/);
  }
});

test('F4 vectors check: malformed or missing corpus files are input errors (exit 4) naming the file', async () => {
  const tv = copyVectors();
  writeFileSync(join(tv, 'v1/primitives/hash/sha256.json'), '{"operation":');
  const notJson = await qv(['vectors', 'check', tv]);
  assert.equal(notJson.code, 4, notJson.err);
  assert.match(notJson.err, /sha256\.json is not valid JSON/);

  const tv2 = copyVectors();
  const mf = join(tv2, 'v1/mutations/count-altered.json');
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  delete m.expect;
  writeFileSync(mf, JSON.stringify(m));
  const noExpect = await qv(['vectors', 'check', tv2]);
  assert.equal(noExpect.code, 4, noExpect.err);
  assert.match(noExpect.err, /count-altered\.json: malformed mutation/);

  const tv3 = copyVectors();
  rmSync(join(tv3, 'v1/elections/tiny-yesno-3v/bundle.json'));
  const missing = await qv(['vectors', 'check', tv3]);
  assert.equal(missing.code, 4, missing.err);
  assert.match(missing.err, /cannot read .*tiny-yesno-3v[/\\]bundle\.json/);

  const tv4 = copyVectors();
  writeFileSync(join(tv4, 'MANIFEST.json'), JSON.stringify({ files: [{ path: 'x' }] }));
  const badManifest = await qv(['vectors', 'check', tv4]);
  assert.equal(badManifest.code, 4, badManifest.err);
  assert.match(badManifest.err, /MANIFEST\.json: malformed/);
});

test('F5 vectors check: a symlink cycle terminates and is reported; manifest paths outside the corpus are rejected', async () => {
  const tv = copyVectors();
  if (POSIX) symlinkSync(join(tv, 'v1'), join(tv, 'v1', 'loop'));
  const cyc = await qv(['vectors', 'check', tv]);
  assert.notEqual(cyc.code, 70, cyc.err);
  if (POSIX) {
    assert.equal(cyc.code, 1);
    assert.match(cyc.out, /v1\/loop not a symlink/);
  }

  const tv2 = copyVectors();
  writeFileSync(join(dirname(tv2), 'outside.txt'), 'x');
  const mf = join(tv2, 'MANIFEST.json');
  const man = JSON.parse(readFileSync(mf, 'utf8'));
  man.files.push({ path: '../outside.txt', sha256: '00'.repeat(32) });
  writeFileSync(mf, JSON.stringify(man));
  const r = await qv(['vectors', 'check', tv2, '--json']);
  assert.equal(r.code, 1, r.err);
  assert.ok(JSON.parse(r.out).failed.some((x: { id: string; detail: string }) => x.id === '../outside.txt' && x.detail === 'path resolves outside the corpus'));
});

test('F6 ballot encrypt: a failed audit write leaves no envelope; a failed envelope write leaves no audit file', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 0);
  const out = join(dir, 'env.json');
  const noDir = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--intent', 'spoil', '--out', out, '--audit-out', join(dir, 'missing-dir', 'audit.json')]);
  assert.equal(noDir.code, 4);
  assert.ok(!existsSync(out), 'no envelope is stranded without its audit file');

  writeFileSync(join(dir, 'taken.json'), 'x');
  const audit = join(dir, 'audit2.json');
  const taken = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--intent', 'spoil', '--out', join(dir, 'taken.json'), '--audit-out', audit]);
  assert.equal(taken.code, 4);
  assert.match(taken.err, /refusing to overwrite/);
  assert.ok(!existsSync(audit), 'the audit file written for a refused envelope is removed');
});

test('F7 ballot encrypt: --audit-out is a usage error for a cast ballot and nothing is written', async () => {
  const dir = tmp();
  const key = voterKeyFile(dir, 0);
  const audit = join(dir, 'audit.json');
  const out = join(dir, 'cast.json');
  const r = await qv(['ballot', 'encrypt', '--election', TINY, '--key', key, '--select', 'budget=yes', '--out', out, '--audit-out', audit]);
  assert.equal(r.code, 2);
  assert.match(r.err, /only applies to --intent spoil/);
  assert.ok(!existsSync(audit) && !existsSync(out));
});

test('F8 keygen: the passphrase minimum is measured on the NFKC form the key derives from', async () => {
  const dir = tmp();
  const pw = join(dir, 'pw.txt');
  // 12 code points, but NFKC composes each 'A' + U+030A pair into one character: 6 characters, below the minimum
  writeFileSync(pw, `${'Å'.repeat(6)}\n`);
  const short = await qv(['keygen', '--out', join(dir, 'k.json'), '--passphrase-file', pw, ...FAST]);
  assert.equal(short.code, 2);
  assert.match(short.err, /at least 12 characters/);
  assert.ok(!existsSync(join(dir, 'k.json')));
  // 12 precomposed characters meet the minimum
  writeFileSync(pw, `${'Å'.repeat(12)}\n`);
  assert.equal((await qv(['keygen', '--out', join(dir, 'k2.json'), '--passphrase-file', pw, ...FAST])).code, 0);
});

test('F9 option values: a value flag never consumes the next option; empty values are refused', async () => {
  assert.throws(() => parseArgs(['--x', '--y'], { x: 'value', y: 'bool' }), UsageError);
  assert.throws(() => parseArgs(['--x='], { x: 'value' }), UsageError);
  assert.throws(() => parseArgs(['--x', ''], { x: 'value' }), UsageError);
  assert.throws(() => parseArgs(['--x', '--'], { x: 'value' }), UsageError);
  assert.equal(parseArgs(['--x', '-'], { x: 'value' }).get('x'), '-', 'a single dash is still a value');
  assert.equal((await qv(['keygen', '--out', '--no-passphrase'])).code, 2);
  assert.equal((await qv(['keygen', '--out=', '--no-passphrase'])).code, 2);
  assert.equal((await qv(['verify', TINY, '--manifest-hash', '--json'])).code, 2);
});

test('F10 group commands without a subcommand print usage to stderr, not stdout', async () => {
  const r = await qv(['ballot']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.match(r.err, /usage:/);
  const b = await qv(['board']);
  assert.equal(b.out, '');
  assert.match(b.err, /usage:/);
  const h = await qv(['ballot', '--help']);
  assert.equal(h.code, 0);
  assert.match(h.out, /usage:/);
});

test('F11 board verify --json on an election bundle without a board export prints an INCOMPLETE JSON verdict', async () => {
  const r = await qv(['board', 'verify', TINY, '--json']);
  assert.equal(r.code, 3);
  const j = JSON.parse(r.out);
  assert.equal(j.integrity, 'INCOMPLETE');
  assert.match(j.reason, /no usable board export/);
  assert.match(r.err, /no usable board export/, 'the text diagnostic still goes to stderr');
});

test('F12 election inspect exits 1 on a manifest hash mismatch (JSON still printed); help lists --version', async () => {
  const dir = tmp();
  const t = tinyBundle();
  t.manifest_hash = '00'.repeat(32);
  const r = await qv(['election', 'inspect', writeJson(dir, 'mm.json', t), '--json']);
  assert.equal(r.code, 1);
  assert.equal(JSON.parse(r.out).manifest_hash_matches_bundle, false);
  assert.equal((await qv(['election', 'inspect', TINY])).code, 0);
  assert.match((await qv(['--help'])).out, /qv --version/);
});
