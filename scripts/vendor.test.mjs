// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-19-REQ-031 QV-30-REQ-004
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { test } from 'node:test';
import { archiveFiles, checkVendor, installVendor, verifyVendor } from './vendor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (data) => createHash('sha256').update(data).digest('hex');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'qv-vendor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['VENDOR.lock', 'package-lock.json', 'packages/crypto/package.json', 'scripts/vendor.mjs']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(ROOT, path), join(root, path));
  }
  cpSync(join(ROOT, 'vendor'), join(root, 'vendor'), { recursive: true });
  mkdirSync(join(root, 'node_modules/@noble'), { recursive: true });
  for (const name of ['curves', 'hashes']) cpSync(join(root, `vendor/noble-${name}`), join(root, `node_modules/@noble/${name}`), { recursive: true });
  return root;
}
const json = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const writeJson = (root, path, value) => writeFileSync(join(root, path), JSON.stringify(value, null, 2) + '\n');
const cli = (root, action) => spawnSync(process.execPath, [join(root, 'scripts/vendor.mjs'), action], { cwd: root, encoding: 'utf8' });

test('verbatim tarballs, SRI and all 132 file hashes agree; explicit setup installs regular production copies', (t) => {
  const root = fixture(t), lockBefore = readFileSync(join(root, 'package-lock.json'));
  const checked = verifyVendor(root);
  assert.equal(checked.packages.length, 2);
  assert.equal(checked.packages.reduce((n, p) => n + p.files.size, 0), 132);
  assert.throws(() => checkVendor(root), /ENOENT|install receipt/);
  installVendor(root);
  assert.equal(cli(root, 'check').status, 0);
  for (const pkg of checked.packages) {
    assert.ok(lstatSync(pkg.installed).isDirectory());
    assert.equal(lstatSync(pkg.installed).isSymbolicLink(), false);
    for (const [path, bytes] of pkg.files) assert.deepEqual(readFileSync(join(pkg.installed, path)), bytes);
  }
  assert.deepEqual(readFileSync(join(root, 'package-lock.json')), lockBefore, 'audit/source metadata is unchanged');
  const known = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { sha256 } from '@noble/hashes/sha2.js'; console.log(Buffer.from(sha256(new TextEncoder().encode('abc'))).toString('hex'));"], { cwd: root, encoding: 'utf8' });
  assert.equal(known.status, 0, known.stderr);
  assert.equal(known.stdout.trim(), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  installVendor(root); // repeated explicit setup is safe and keeps public package imports intact
  assert.equal(cli(root, 'check').status, 0);
});

test('tarball tampering and coordinated expanded-file/hash changes cannot evade the upstream integrity binding', (t) => {
  const root = fixture(t), lock = json(root, 'VENDOR.lock'), record = lock.packages[0];
  const archive = readFileSync(join(root, record.archive)), changed = Buffer.from(archive);
  changed[changed.length - 1] ^= 1;
  writeFileSync(join(root, record.archive), changed);
  assert.throws(() => installVendor(root), /archive integrity mismatch/);
  writeFileSync(join(root, record.archive), archive);
  const path = 'ed25519.js', bytes = Buffer.concat([readFileSync(join(root, record.directory, path)), Buffer.from('\n// tampered\n')]);
  writeFileSync(join(root, record.directory, path), bytes);
  record.files[path] = hash(bytes);
  writeJson(root, 'VENDOR.lock', lock);
  assert.throws(() => installVendor(root), /file hash differs from tarball/);
  assert.notDeepEqual(readFileSync(join(root, 'node_modules/@noble/curves', path)), bytes, 'validation failure does not overwrite the installed tree');
});

test('registry source, exact version and integrity changes require a matching reviewed vendor update', async (t) => {
  for (const [field, value] of [['resolved', 'https://example.invalid/curves.tgz'], ['version', '2.4.1'], ['integrity', 'sha512-' + 'A'.repeat(88)]]) {
    await t.test(field, (inner) => {
      const root = fixture(inner), lock = json(root, 'package-lock.json');
      lock.packages['node_modules/@noble/curves'][field] = value;
      writeJson(root, 'package-lock.json', lock);
      assert.throws(() => verifyVendor(root), /registry\/manifest binding mismatch/);
    });
  }
});

test('installed source tampering, added files and missing files fail both checking and installation', async (t) => {
  for (const change of ['modified', 'extra', 'missing']) await t.test(change, (inner) => {
    const root = fixture(inner);
    installVendor(root);
    const path = join(root, 'node_modules/@noble/hashes/sha2.js');
    if (change === 'modified') writeFileSync(path, '// tampered\n');
    else if (change === 'extra') writeFileSync(join(dirname(path), 'unexpected.js'), '// injected\n');
    else rmSync(path);
    assert.throws(() => checkVendor(root), /differ|unexpected|missing file/);
    assert.throws(() => installVendor(root), /differ|unexpected|missing file/);
  });
});

test('new npm setup and stale vendor receipts refuse production use until explicit vendor installation', (t) => {
  const root = fixture(t);
  installVendor(root);
  rmSync(join(root, 'node_modules/.quietvote-vendor.json'));
  assert.notEqual(cli(root, 'check').status, 0);
  installVendor(root);
  // Formatting alone changes the reviewed lock identity: installed copies must be tied to that exact lock.
  writeFileSync(join(root, 'VENDOR.lock'), readFileSync(join(root, 'VENDOR.lock'), 'utf8') + '\n');
  assert.throws(() => checkVendor(root), /stale install receipt/);
  installVendor(root);
  assert.equal(cli(root, 'check').status, 0);
});

test('an interrupted replacement with no receipt and one missing package recovers from verified vendor bytes', (t) => {
  const root = fixture(t);
  installVendor(root);
  rmSync(join(root, 'node_modules/.quietvote-vendor.json'));
  rmSync(join(root, 'node_modules/@noble/hashes'), { recursive: true });
  assert.notEqual(cli(root, 'check').status, 0);
  installVendor(root);
  assert.equal(cli(root, 'check').status, 0);
});

test('package-local shadow dependencies cannot replace the verified production copy', (t) => {
  const root = fixture(t);
  installVendor(root);
  const shadow = join(root, 'packages/crypto/node_modules/@noble/hashes');
  mkdirSync(dirname(shadow), { recursive: true });
  cpSync(join(root, 'vendor/noble-hashes'), shadow, { recursive: true });
  const result = cli(root, 'check'); // fresh resolver, as in the build gate
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /module resolution leaves the installed vendor copy/);
});

test('expanded vendor directories may not be replaced by links to external content', (t) => {
  const root = fixture(t), source = join(root, 'vendor/noble-hashes/src'), external = join(root, 'external');
  cpSync(source, external, { recursive: true });
  rmSync(source, { recursive: true });
  symlinkSync(external, source, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => verifyVendor(root), /unexpected or nonregular/);
});

test('invoking the CLI through a directory alias cannot skip integrity checks', (t) => {
  const root = fixture(t), parent = mkdtempSync(join(tmpdir(), 'qv-vendor-alias-')), alias = join(parent, 'checkout');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const result = cli(alias, 'check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing install receipt/);
});

test('strict archive parser refuses traversal, links, duplicate entries and malformed framing', () => {
  const lock = json(ROOT, 'VENDOR.lock'), original = gunzipSync(readFileSync(join(ROOT, lock.packages[0].archive)));
  const header = (mutate) => {
    const bytes = Buffer.from(original);
    mutate(bytes);
    bytes.fill(32, 148, 156);
    const sum = bytes.subarray(0, 512).reduce((n, b) => n + b, 0);
    bytes.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    return gzipSync(bytes);
  };
  assert.throws(() => archiveFiles(header((bytes) => { bytes.fill(0, 0, 100); bytes.write('package/../escape', 0); })), /unsafe tar path/);
  assert.throws(() => archiveFiles(header((bytes) => { bytes[156] = 50; })), /unsupported tar member/);
  assert.throws(() => archiveFiles(gzipSync(original.subarray(0, original.length - 1))), /truncated tar framing/);
  const trailing = Buffer.from(original); trailing[trailing.length - 1] = 1;
  assert.throws(() => archiveFiles(gzipSync(trailing)), /invalid tar end marker/);
  const size = Number.parseInt(original.subarray(124, 136).toString().replaceAll('\0', '').trim(), 8);
  const first = original.subarray(0, 512 + Math.ceil(size / 512) * 512);
  assert.throws(() => archiveFiles(gzipSync(Buffer.concat([first, first, Buffer.alloc(1024)]))), /duplicate or excessive/);
});
