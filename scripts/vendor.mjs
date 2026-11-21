#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// QV-ADR-024: verify published bytes before installing the two production dependencies from vendor/.
// Registry metadata stays in package-lock.json for npm ci, source lint and advisory auditing.
import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['@noble/curves', '@noble/hashes'];
const RECEIPT = 'node_modules/.quietvote-vendor.json';
const HEX = /^[0-9a-f]{64}$/;
const digest = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding);
const fail = (message) => { throw new Error(`vendor: ${message}`); };
const sameKeys = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function regular(root, path) {
  const parts = path.split('/');
  let current = root;
  for (const [index, part] of parts.entries()) {
    if (!part || part === '.' || part === '..' || part.includes('\\')) fail(`invalid path ${path}`);
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) fail(`not a regular path: ${path}`);
  }
  return readFileSync(current);
}

/** Deliberately narrow npm tar reader: these pinned archives contain regular USTAR files only. */
export function archiveFiles(compressed) {
  const bytes = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  const files = new Map();
  const field = (b, start, length) => b.subarray(start, start + length).toString('utf8').split('\0')[0];
  const octal = (s) => {
    const text = s.trim();
    if (!/^[0-7]+$/.test(text)) fail('unsupported tar numeric field');
    return Number.parseInt(text, 8);
  };
  if (bytes.length % 512 !== 0) fail('truncated tar framing');
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (bytes.length - offset < 1024 || !bytes.subarray(offset).every((b) => b === 0)) fail('invalid tar end marker');
      return files;
    }
    const checksum = header.reduce((sum, b, index) => sum + (index >= 148 && index < 156 ? 32 : b), 0);
    if (octal(field(header, 148, 8)) !== checksum) fail('tar checksum mismatch');
    if (field(header, 257, 6) !== 'ustar' || header[156] !== 48 || field(header, 157, 100) !== '') fail('unsupported tar member');
    const prefix = field(header, 345, 155), name = `${prefix ? prefix + '/' : ''}${field(header, 0, 100)}`;
    if (!/^package\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name)) fail(`unsafe tar path ${name}`);
    const path = name.slice('package/'.length), size = octal(field(header, 124, 12));
    if (files.has(path) || files.size >= 4096) fail(`duplicate or excessive tar member: ${path}`);
    offset += 512;
    if (!Number.isSafeInteger(size) || offset + size > bytes.length) fail('truncated tar member');
    files.set(path, bytes.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }
  fail('missing tar end marker');
}

function checkTree(directory, files) {
  const seen = [], directories = new Set(['']);
  for (const file of files.keys()) {
    let path = file;
    while (path.includes('/')) { path = path.slice(0, path.lastIndexOf('/')); directories.add(path); }
  }
  const walk = (path = '') => {
    const current = join(directory, path), stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`not a regular directory: ${current}`);
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relative = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isDirectory() && directories.has(relative)) walk(relative);
      else if (entry.isFile() && files.has(relative)) {
        if (!readFileSync(join(directory, relative)).equals(files.get(relative))) fail(`file bytes differ: ${current}/${entry.name}`);
        seen.push(relative);
      } else fail(`unexpected or nonregular entry: ${current}/${entry.name}`);
    }
  };
  walk();
  if (!sameKeys(seen, files.keys())) fail(`missing file in ${directory}`);
}

/** No installed modules are needed to verify the archive, upstream SRI, lock binding and every expanded byte. */
export function verifyVendor(root = ROOT) {
  root = realpathSync(root);
  const vendor = JSON.parse(regular(root, 'VENDOR.lock'));
  const lock = JSON.parse(regular(root, 'package-lock.json'));
  const crypto = JSON.parse(regular(root, 'packages/crypto/package.json'));
  if (vendor.format !== 'quietvote-vendor/v1' || !Array.isArray(vendor.packages) ||
      !sameKeys(vendor.packages.map((p) => p.name), NAMES)) fail('VENDOR.lock must contain exactly the two allowed packages');
  const verified = [];
  for (const record of vendor.packages) {
    const upstream = lock.packages?.[`node_modules/${record.name}`], stem = record.name.replace('@', '').replace('/', '-');
    if (!upstream || !/^\d+\.\d+\.\d+$/.test(record.version) || record.version !== upstream.version ||
        crypto.dependencies?.[record.name] !== record.version || lock.packages?.['packages/crypto']?.dependencies?.[record.name] !== record.version ||
        record.integrity !== upstream.integrity || record.resolved !== upstream.resolved ||
        record.resolved !== `https://registry.npmjs.org/${record.name}/-/${record.name.split('/')[1]}-${record.version}.tgz` ||
        record.archive !== `vendor/archives/${stem}-${record.version}.tgz` || record.directory !== `vendor/${stem}` ||
        record.license !== 'MIT' || !HEX.test(record.sha256)) fail(`registry/manifest binding mismatch for ${record.name}`);
    const archive = regular(root, record.archive);
    if (digest(archive) !== record.sha256 || `sha512-${digest(archive, 'sha512', 'base64')}` !== record.integrity) fail(`archive integrity mismatch for ${record.name}`);
    const files = archiveFiles(archive);
    if (!record.files || !sameKeys(Object.keys(record.files), files.keys())) fail(`file manifest differs from tarball for ${record.name}`);
    for (const [path, bytes] of files) {
      if (!HEX.test(record.files[path]) || digest(bytes) !== record.files[path]) fail(`file hash differs from tarball: ${record.name}/${path}`);
    }
    const metadata = JSON.parse(files.get('package.json'));
    const dependencies = metadata.dependencies ?? {};
    if (metadata.name !== record.name || metadata.version !== record.version || metadata.license !== record.license || !files.has('LICENSE') ||
        !sameKeys(Object.keys(dependencies), record.name === '@noble/curves' ? ['@noble/hashes'] : []) ||
        (record.name === '@noble/curves' && dependencies['@noble/hashes'] !== crypto.dependencies['@noble/hashes'])) fail(`upstream package identity/dependencies mismatch for ${record.name}`);
    // Validate all parents as well, so a link to an external tree cannot stand in for the checked-in bytes.
    regular(root, `${record.directory}/package.json`);
    const directory = join(root, record.directory);
    checkTree(directory, files);
    verified.push({ ...record, files, metadata, directory, installed: join(root, 'node_modules', record.name) });
  }
  return { root, lockSha256: digest(regular(root, 'VENDOR.lock')), packages: verified };
}

function scopeDirectory(root) {
  for (const path of ['node_modules', 'node_modules/@noble']) {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`not a regular installed scope: ${path}`);
  }
}

/** Check actual package resolution, including curves' transitive hash dependency and workspace shadowing. */
function checkResolution(state) {
  scopeDirectory(state.root);
  if (!lstatSync(join(state.root, RECEIPT), { throwIfNoEntry: false })) fail('missing install receipt; run npm run vendor:install after npm ci');
  const receipt = JSON.parse(regular(state.root, RECEIPT));
  if (receipt.format !== 'quietvote-vendor-installed/v1' || receipt.lock_sha256 !== state.lockSha256) fail('missing or stale install receipt; run npm run vendor:install after npm ci');
  for (const pkg of state.packages) {
    checkTree(pkg.installed, pkg.files);
  }
  const importers = [join(state.root, 'packages/crypto/package.json'), ...state.packages.map((p) => join(p.installed, 'package.json'))];
  for (const importer of importers) {
    const require = createRequire(importer);
    for (const pkg of state.packages) for (const [key, target] of Object.entries(pkg.metadata.exports)) {
      if (typeof target !== 'string' || !target.startsWith('./') || !pkg.files.has(target.slice(2))) fail(`unsupported upstream export for ${pkg.name}`);
      const specifier = pkg.name + (key === '.' ? '' : key.slice(1));
      if (realpathSync(require.resolve(specifier)) !== join(pkg.installed, target.slice(2))) fail(`module resolution leaves the installed vendor copy: ${specifier} from ${importer}`);
    }
  }
}

export function checkVendor(root = ROOT) {
  const state = verifyVendor(root);
  checkResolution(state);
  return state;
}

/** Explicit setup step, never an npm lifecycle hook. All input validation precedes replacement. */
export function installVendor(root = ROOT) {
  const state = verifyVendor(root);
  scopeDirectory(state.root);
  for (const pkg of state.packages) {
    const stat = lstatSync(pkg.installed, { throwIfNoEntry: false });
    if (!stat) continue; // recover an interrupted installation from the independently verified archive
    checkTree(pkg.installed, pkg.files); // never silently repair tampered registry-installed bytes or links
  }
  rmSync(join(state.root, RECEIPT), { force: true });
  for (const pkg of state.packages) {
    const temporary = mkdtempSync(join(dirname(pkg.installed), '.qv-vendor-'));
    try {
      cpSync(pkg.directory, temporary, { recursive: true });
      checkTree(temporary, pkg.files);
      rmSync(pkg.installed, { recursive: true, force: true });
      renameSync(temporary, pkg.installed);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  writeFileSync(join(state.root, RECEIPT), JSON.stringify({ format: 'quietvote-vendor-installed/v1', lock_sha256: state.lockSha256 }) + '\n');
  checkResolution(state);
  return state;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] ?? 'verify';
  try {
    if (process.argv.length > 3 || !['verify', 'install', 'check'].includes(action)) fail('usage: node scripts/vendor.mjs [verify|install|check]');
    const state = ({ verify: verifyVendor, install: installVendor, check: checkVendor })[action]();
    console.log(`vendor: ${action} OK; ${state.packages.length} pinned packages, ${state.packages.reduce((n, p) => n + p.files.size, 0)} verbatim files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
