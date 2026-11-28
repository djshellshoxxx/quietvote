#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Deterministic CycloneDX 1.6 inventory of the npm lockfile, using Node built-ins only.
// Usage: node scripts/sbom.mjs --stdout [--include-dev] [--lockfile path]
// Default: all declared workspaces and their production dependency closure.
// Hashes identify the recorded registry tarballs; no package download, installed-file
// verification, vulnerability check, signature or release attestation is performed.
import { readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = /^packages\/(?!\.{1,2}$)[A-Za-z0-9._-]+$/;
const NAME_SOURCE = '(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*';
const NAME = new RegExp(`^${NAME_SOURCE}$`);
const INSTALL = new RegExp(`^(?:packages/[A-Za-z0-9._-]+/)?node_modules/${NAME_SOURCE}(?:/node_modules/${NAME_SOURCE})*$`);
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const HASHES = { sha256: [32, 'SHA-256'], sha384: [48, 'SHA-384'], sha512: [64, 'SHA-512'] };
const ref = path => path ? `lockfile:${path}` : 'lockfile:root';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(where, reason) { throw new Error(`${JSON.stringify(where)}: ${reason}`); }
function requireObject(value, where) { if (!object(value)) fail(where, 'expected an object'); return value; }
function requireName(value, where) { if (typeof value !== 'string' || !NAME.test(value)) fail(where, 'invalid npm package name'); return value; }
function requireVersion(value, where) {
  if (typeof value !== 'string' || value.length > 1024 || !VERSION.test(value)) fail(where, 'expected an exact package version');
  return value;
}

function integrity(value, where) {
  if (typeof value !== 'string' || value.trim() === '') fail(where, 'missing external integrity');
  const hashes = new Map();
  for (const token of value.trim().split(/\s+/)) {
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token);
    if (!match) fail(where, 'unsupported or malformed external integrity');
    const [length, alg] = HASHES[match[1]], bytes = Buffer.from(match[2], 'base64');
    if (bytes.length !== length || bytes.toString('base64') !== match[2]) fail(where, 'noncanonical or wrong-length external integrity');
    const content = bytes.toString('hex');
    if (hashes.has(alg) && hashes.get(alg) !== content) fail(where, 'conflicting external integrity hashes');
    hashes.set(alg, content);
  }
  return [...hashes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([alg, content]) => ({ alg, content }));
}

/** Pure lockfile transformation. Does not read manifests, node_modules, the clock or the network. */
export function generateSbom(lock, { includeDev = false } = {}) {
  if (typeof includeDev !== 'boolean') fail('includeDev', 'expected a boolean');
  requireObject(lock, 'lockfile');
  if (![2, 3].includes(lock.lockfileVersion)) fail('lockfileVersion', 'only npm lockfile versions 2 and 3 are supported');
  const packages = requireObject(lock.packages, 'packages'), root = requireObject(packages[''], 'packages[""]');
  const rootName = requireName(root.name ?? lock.name, 'root name');
  if (!Array.isArray(root.workspaces) || root.workspaces.length === 0 ||
      root.workspaces.some(pattern => typeof pattern !== 'string' || (pattern !== 'packages/*' && !WORKSPACE.test(pattern)))) {
    fail('workspaces', 'expected packages/* or explicit packages/<name> paths');
  }
  const workspacePaths = Object.keys(packages).filter(path => WORKSPACE.test(path)).sort();
  for (const pattern of root.workspaces) {
    if (!workspacePaths.some(path => pattern === 'packages/*' || path === pattern)) fail(pattern, 'workspace metadata is missing');
  }
  const records = new Map([['', { entry: root, name: rootName }]]), links = new Map(), names = new Set();
  for (const path of Object.keys(packages).filter(path => path !== '').sort()) {
    const entry = requireObject(packages[path], path), local = WORKSPACE.test(path);
    if (posix.normalize(path) !== path || (!local && !INSTALL.test(path))) fail(path, 'unsupported package location');
    for (const flag of ['link', 'dev', 'optional', 'devOptional']) {
      if (entry[flag] !== undefined && typeof entry[flag] !== 'boolean') fail(path, `invalid ${flag} flag`);
    }
    if (entry.link === true) {
      if (local || typeof entry.resolved !== 'string' || !workspacePaths.includes(entry.resolved) ||
          entry.version !== undefined || entry.integrity !== undefined) fail(path, 'invalid workspace link');
      const target = requireObject(packages[entry.resolved], entry.resolved);
      if (path !== `node_modules/${requireName(target.name, entry.resolved)}`) fail(path, 'workspace link name does not match target');
      links.set(path, entry.resolved); continue;
    }
    const name = requireName(entry.name ?? (local ? undefined : path.slice(path.lastIndexOf('node_modules/') + 13)), path);
    requireVersion(entry.version, path);
    if (entry.license !== undefined && (typeof entry.license !== 'string' || entry.license.trim() === '')) fail(path, 'invalid declared license');
    let hashes;
    if (local) {
      if (!root.workspaces.some(pattern => pattern === 'packages/*' || path === pattern) || names.has(name) ||
          entry.resolved !== undefined || entry.integrity !== undefined) fail(path, 'ambiguous workspace metadata');
      names.add(name);
    } else {
      if (typeof entry.resolved !== 'string' || !/^https:\/\/registry\.npmjs\.org\/[^\s?#]+$/.test(entry.resolved)) fail(path, 'external source must be an npm registry tarball');
      hashes = integrity(entry.integrity, path); // Validate even development-only entries before filtering.
    }
    records.set(path, { entry, name, hashes, local });
  }
  for (const path of workspacePaths) {
    if (links.get(`node_modules/${records.get(path)?.name}`) !== path) fail(path, 'workspace link is missing');
  }

  function resolveDependency(from, name) {
    let directory = from;
    for (;;) {
      if (posix.basename(directory) !== 'node_modules') {
        const candidate = (directory ? `${directory}/` : '') + `node_modules/${name}`;
        if (links.has(candidate)) return links.get(candidate);
        if (records.has(candidate)) return candidate;
      }
      if (!directory) return undefined;
      directory = posix.dirname(directory); if (directory === '.') directory = '';
    }
  }
  function dependencies(path, development) {
    const { entry, local } = records.get(path), deps = new Set(), optional = new Set(), direct = new Set();
    const maps = ['dependencies', 'optionalDependencies', 'peerDependencies'];
    if (development && (path === '' || local)) maps.push('devDependencies');
    for (const key of maps) {
      if (entry[key] === undefined) continue;
      for (const [name, spec] of Object.entries(requireObject(entry[key], `${path}/${key}`))) {
        requireName(name, `${path}/${key}`);
        if (typeof spec !== 'string' || spec.trim() === '') fail(path, 'invalid dependency specifier');
        deps.add(name); if (key === 'optionalDependencies') optional.add(name);
        if (key === 'dependencies' || key === 'devDependencies') direct.add(name);
      }
    }
    if (entry.peerDependenciesMeta !== undefined) {
      for (const [name, meta] of Object.entries(requireObject(entry.peerDependenciesMeta, path))) {
        requireObject(meta, path);
        if (meta.optional !== undefined && typeof meta.optional !== 'boolean') fail(path, 'invalid optional peer flag');
        if (meta.optional === true && !direct.has(name)) optional.add(name);
      }
    }
    const targets = new Set();
    for (const name of [...deps].sort()) {
      const target = resolveDependency(path, name);
      if (target !== undefined) targets.add(target);
      else if (!optional.has(name)) fail(path, `missing locked dependency ${JSON.stringify(name)}`);
    }
    return [...targets].sort();
  }
  const production = new Set(), pending = [...workspacePaths, ...dependencies('', false)];
  while (pending.length) {
    const path = pending.pop();
    if (production.has(path)) continue;
    production.add(path); pending.push(...dependencies(path, false));
  }
  const selected = (includeDev ? [...records.keys()].filter(Boolean) : [...production]).sort();
  const components = selected.map(path => {
    const { entry, name, hashes, local } = records.get(path), parts = name.split('/');
    return {
      type: 'library', 'bom-ref': ref(path),
      ...(parts.length === 2 ? { group: parts[0] } : {}), name: parts.at(-1), version: entry.version,
      purl: `pkg:npm/${parts.map(encodeURIComponent).join('/')}@${encodeURIComponent(entry.version)}`,
      scope: !production.has(path) ? 'excluded' : !local && (entry.optional || entry.devOptional) ? 'optional' : 'required',
      ...(hashes ? { hashes, externalReferences: [{ type: 'distribution', url: entry.resolved }] } : {}),
      ...(entry.license !== undefined ? { licenses: [{ license: { name: entry.license } }] } : {}),
      properties: [{ name: 'quietvote:lockfile:path', value: path },
        { name: 'quietvote:lockfile:source', value: local ? 'workspace' : 'npm-registry' }],
    };
  });
  const graph = ['', ...selected].map(path => ({ ref: ref(path), dependsOn: [...new Set([
    ...(path === '' ? workspacePaths : []), ...dependencies(path, includeDev),
  ])].sort().map(ref) }));
  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json', bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
    metadata: {
      component: { type: 'application', 'bom-ref': ref(''), name: rootName,
        ...(root.version === undefined ? {} : { version: requireVersion(root.version, 'root version') }),
      },
      properties: [{ name: 'quietvote:sbom:source', value: 'package-lock.json' },
        { name: 'quietvote:sbom:mode', value: includeDev ? 'including-development' : 'production' },
        { name: 'quietvote:sbom:hash-basis', value: 'Recorded npm tarball integrity; not verification of downloaded or installed files.' }],
    },
    components, dependencies: graph,
  };
}

function main(args) {
  let lockfile = join(ROOT, 'package-lock.json'), includeDev = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--stdout') continue;
    if (args[index] === '--include-dev') { includeDev = true; continue; }
    if (args[index] === '--lockfile' && args[index + 1] && !args[index + 1].startsWith('--')) { lockfile = args[++index]; continue; }
    if (args[index] === '--help') { process.stdout.write('Usage: node scripts/sbom.mjs --stdout [--include-dev] [--lockfile path]\n'); return; }
    process.stderr.write('sbom: usage: --stdout [--include-dev] [--lockfile path]\n'); process.exitCode = 2; return;
  }
  let lock;
  try { lock = JSON.parse(readFileSync(lockfile, 'utf8')); }
  catch { process.stderr.write('sbom: cannot read or parse lockfile\n'); process.exitCode = 1; return; }
  try { process.stdout.write(JSON.stringify(generateSbom(lock, { includeDev }), null, 2) + '\n'); }
  catch (error) { process.stderr.write(`sbom: ${error.message}\n`); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
