// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateSbom } from './sbom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), SCRIPT = join(ROOT, 'scripts/sbom.mjs');
const WORKSPACES = ['board', 'cli', 'crypto', 'protocol', 'server', 'trustee', 'verifier', 'web'];
const sri = (algorithm, contents) => `${algorithm}-${createHash(algorithm).update(contents).digest('base64')}`;
const external = (name, version = '1.2.3', algorithm = 'sha512') => ({
  version, resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`,
  integrity: sri(algorithm, `${name}/${version}`), license: 'MIT',
});
function fixture() {
  const packages = { '': { name: 'quietvote', workspaces: ['packages/*'], devDependencies: { 'dev-tool': '9.0.0' } } };
  for (const name of WORKSPACES) {
    packages[`packages/${name}`] = { name: `@quietvote/${name}`, version: '0.0.0', license: 'AGPL-3.0-or-later',
      dependencies: name === 'crypto' ? { 'hash-lib': '1.2.3' } : { '@quietvote/crypto': '*' },
    };
    packages[`node_modules/@quietvote/${name}`] = { resolved: `packages/${name}`, link: true };
  }
  packages['node_modules/hash-lib'] = external('hash-lib', '1.2.3', 'sha256');
  packages['node_modules/dev-tool'] = { ...external('dev-tool', '9.0.0'), dev: true };
  return { name: 'quietvote', lockfileVersion: 3, packages };
}
const byPath = (bom, path) => bom.components.find(component => component['bom-ref'] === `lockfile:${path}`);
const edges = (bom, path) => bom.dependencies.find(dependency => dependency.ref === `lockfile:${path}`).dependsOn;
function reverseObjects(value) {
  if (Array.isArray(value)) return value.map(reverseObjects);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjects(item)]));
  return value;
}
function run(args = [], options = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...options });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

test('production closure includes all eight workspaces once with exact versions, references and artifact hashes', () => {
  const lock = fixture(), bom = generateSbom(lock);
  assert.equal(bom.bomFormat, 'CycloneDX'); assert.equal(bom.specVersion, '1.6');
  assert.equal(bom.components.length, 9);
  assert.deepEqual(bom.components.filter(component => component.group === '@quietvote').map(component => component.name), WORKSPACES);
  for (const name of WORKSPACES) {
    const component = byPath(bom, `packages/${name}`);
    assert.equal(component.version, '0.0.0'); assert.equal(component.purl, `pkg:npm/%40quietvote/${name}@0.0.0`);
    assert.equal(component.hashes, undefined, 'workspace links have no invented registry integrity');
    assert.deepEqual(component.licenses, [{ license: { name: 'AGPL-3.0-or-later' } }]);
  }
  const library = byPath(bom, 'node_modules/hash-lib');
  assert.equal(library.version, '1.2.3'); assert.equal(library.scope, 'required');
  assert.deepEqual(library.hashes, [{ alg: 'SHA-256', content: createHash('sha256').update('hash-lib/1.2.3').digest('hex') }]);
  assert.equal(library.externalReferences[0].url, lock.packages['node_modules/hash-lib'].resolved);
  assert.deepEqual(edges(bom, 'packages/crypto'), ['lockfile:node_modules/hash-lib']);
  assert.deepEqual(edges(bom, 'packages/server'), ['lockfile:packages/crypto']);
  assert.deepEqual(edges(bom, 'node_modules/hash-lib'), []);
  const refs = new Set([bom.metadata.component['bom-ref'], ...bom.components.map(component => component['bom-ref'])]);
  assert.equal(refs.size, bom.components.length + 1);
  assert.equal(bom.dependencies.length, refs.size);
  for (const dependency of bom.dependencies) for (const target of dependency.dependsOn) assert.ok(refs.has(target));
});

test('development inventory remains explicit and does not alter the production graph', () => {
  const lock = fixture(), production = generateSbom(lock), all = generateSbom(lock, { includeDev: true });
  assert.equal(all.components.length, 10);
  assert.equal(byPath(production, 'node_modules/dev-tool'), undefined);
  assert.equal(byPath(all, 'node_modules/dev-tool').scope, 'excluded');
  assert.deepEqual(byPath(all, 'node_modules/hash-lib'), byPath(production, 'node_modules/hash-lib'));
  assert.ok(edges(all, 'root').includes('lockfile:node_modules/dev-tool'));
});

test('generation is byte-stable across object order, integrity order and repeated actual CLI runs', () => {
  const lock = fixture(), entry = lock.packages['node_modules/hash-lib'];
  entry.integrity += ' ' + sri('sha512', 'hash-lib/1.2.3');
  const original = JSON.stringify(generateSbom(lock));
  const reordered = reverseObjects(lock);
  reordered.packages['node_modules/hash-lib'].integrity = entry.integrity.split(' ').reverse().join('\t');
  assert.equal(JSON.stringify(generateSbom(reordered)), original);
  const first = run(['--stdout'], { cwd: tmpdir(), env: { ...process.env, TZ: 'UTC', SOURCE_DATE_EPOCH: '1' } });
  const second = run(['--stdout'], { cwd: ROOT, env: { ...process.env, TZ: 'Pacific/Honolulu', SOURCE_DATE_EPOCH: '999999999' } });
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stderr, ''); assert.equal(first.stdout, second.stdout);
  const bom = JSON.parse(first.stdout);
  assert.equal(bom.serialNumber, undefined); assert.equal(bom.metadata.timestamp, undefined);
});

test('the actual lockfile lists eight workspaces, both production crypto packages and every external entry in development mode', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const production = generateSbom(lock), all = generateSbom(lock, { includeDev: true });
  assert.equal(production.components.length, 10);
  assert.deepEqual(production.components.filter(component => component.group === '@quietvote').map(component => component.name), WORKSPACES);
  assert.deepEqual(production.components.filter(component => component.hashes).map(component => [component.group, component.name]), [['@noble', 'curves'], ['@noble', 'hashes']]);
  const externalPaths = Object.keys(lock.packages).filter(path => path.includes('node_modules/') && !lock.packages[path].link);
  assert.equal(all.components.length, externalPaths.length + 8);
  for (const path of externalPaths) {
    const source = lock.packages[path], component = byPath(all, path);
    assert.equal(component.version, source.version);
    assert.deepEqual(component.hashes, [{ alg: 'SHA-512', content: Buffer.from(source.integrity.slice(7), 'base64').toString('hex') }]);
  }
});

test('nearest locked installation wins, preserving separate instances, scoped names and exact versions', () => {
  const lock = fixture();
  lock.packages['packages/server'].dependencies['hash-lib'] = '2.0.0-beta.1+build';
  lock.packages['packages/server/node_modules/hash-lib'] = external('@scope/actual', '2.0.0-beta.1+build', 'sha384');
  lock.packages['packages/server/node_modules/hash-lib'].name = '@scope/actual';
  const bom = generateSbom(lock), nested = byPath(bom, 'packages/server/node_modules/hash-lib');
  assert.equal(nested.purl, 'pkg:npm/%40scope/actual@2.0.0-beta.1%2Bbuild');
  assert.deepEqual(nested.hashes, [{ alg: 'SHA-384', content: createHash('sha384').update('@scope/actual/2.0.0-beta.1+build').digest('hex') }]);
  assert.deepEqual(edges(bom, 'packages/server'), ['lockfile:packages/crypto', 'lockfile:packages/server/node_modules/hash-lib']);
  assert.ok(byPath(bom, 'node_modules/hash-lib'));
});

test('cycles terminate; absent optional peers are allowed but missing required dependencies refuse', () => {
  const lock = fixture();
  lock.packages['packages/crypto'].dependencies['@quietvote/server'] = '*';
  lock.packages['node_modules/hash-lib'].peerDependencies = { optional: '*', required: '*' };
  lock.packages['node_modules/hash-lib'].peerDependenciesMeta = { optional: { optional: true } };
  assert.throws(() => generateSbom(lock), /missing locked dependency "required"/);
  delete lock.packages['node_modules/hash-lib'].peerDependencies.required;
  assert.equal(generateSbom(lock).components.length, 9);
  lock.packages['node_modules/hash-lib'].dependencies = { optional: '*' };
  assert.throws(() => generateSbom(lock), /missing locked dependency "optional"/);
});

test('missing, unsupported, truncated, noncanonical and conflicting external integrity refuses before production filtering', () => {
  const canonical = Buffer.alloc(32).toString('base64');
  const bad = [undefined, null, 9, '', ' ', 'sha1-' + Buffer.alloc(20).toString('base64'),
    'sha512-' + Buffer.alloc(63).toString('base64'), 'sha256-' + canonical.slice(0, -1),
    'sha256-' + canonical.slice(0, -2) + 'B=', 'sha256-not/base64!',
    sri('sha256', 'one') + ' ' + sri('sha256', 'two')];
  for (const value of bad) {
    const lock = fixture(); lock.packages['node_modules/dev-tool'].integrity = value;
    assert.throws(() => generateSbom(lock), /integrity/, `development-only malformed integrity ${JSON.stringify(value)}`);
  }
  const lock = fixture(), item = lock.packages['node_modules/hash-lib'];
  item.integrity += ' ' + item.integrity;
  assert.equal(byPath(generateSbom(lock), 'node_modules/hash-lib').hashes.length, 1);
});

test('workspace links cannot hide missing metadata, wrong targets, foreign sources or extra registry claims', () => {
  for (const change of [
    lock => { delete lock.packages['packages/crypto']; },
    lock => { delete lock.packages['node_modules/@quietvote/crypto']; },
    lock => { lock.packages['node_modules/@quietvote/crypto'].resolved = 'packages/server'; },
    lock => { lock.packages['node_modules/@quietvote/crypto'].resolved = '../packages/crypto'; },
    lock => { lock.packages['node_modules/@quietvote/crypto'].integrity = sri('sha256', 'fake'); },
    lock => { lock.packages['node_modules/dev-tool'] = { link: true, resolved: 'https://registry.npmjs.org/dev-tool' }; },
    lock => { lock.packages['packages/crypto'].resolved = 'https://registry.npmjs.org/fake'; },
  ]) { const lock = fixture(); change(lock); assert.throws(() => generateSbom(lock), /workspace/); }
});

test('unsupported lockfiles, malformed entries, unsafe locations and nonliteral versions refuse', () => {
  for (const change of [
    lock => { lock.lockfileVersion = 1; },
    lock => { lock.packages['node_modules/hash-lib'] = null; },
    lock => { lock.packages['node_modules/hash-lib'].version = '^1.2.3'; },
    lock => { delete lock.packages['node_modules/hash-lib'].resolved; },
    lock => { lock.packages['node_modules/hash-lib'].resolved = 'https://other.invalid/archive.tgz'; },
    lock => { lock.packages['packages/../node_modules/escape'] = external('escape'); },
    lock => { lock.packages['node_modules/hash-lib'].link = 'true'; },
    lock => { lock.packages[''].workspaces = ['**']; },
  ]) { const lock = fixture(); change(lock); assert.throws(() => generateSbom(lock)); }
  const version2 = fixture(); version2.lockfileVersion = 2;
  assert.deepEqual(generateSbom(version2), generateSbom(fixture()));
});

test('the CLI emits only a complete BOM or a nonzero refusal with empty stdout', () => {
  const directory = mkdtempSync(join(tmpdir(), 'qv-sbom-')), path = join(directory, 'lock.json');
  try {
    const lock = fixture(); writeFileSync(path, JSON.stringify(lock));
    const success = run(['--stdout', '--include-dev', '--lockfile', path]);
    assert.equal(success.status, 0, success.stderr); assert.equal(JSON.parse(success.stdout).components.length, 10);
    delete lock.packages['node_modules/dev-tool'].integrity; writeFileSync(path, JSON.stringify(lock));
    const missing = run(['--stdout', '--lockfile', path]);
    assert.equal(missing.status, 1); assert.equal(missing.stdout, ''); assert.match(missing.stderr, /missing external integrity/);
    writeFileSync(path, '{');
    const malformed = run(['--stdout', '--lockfile', path]);
    assert.equal(malformed.status, 1); assert.equal(malformed.stdout, '');
    assert.equal(run(['--lockfile']).status, 2); assert.equal(run(['--arbitrary']).status, 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
