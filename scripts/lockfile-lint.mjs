#!/usr/bin/env node
// Lockfile lint for package-lock.json (supply-chain gate, DEP-02).
//
// Fails (exit 1) if the lockfile contains:
//   - a registry entry whose `resolved` URL does not start with https://registry.npmjs.org/
//   - a registry entry without an `integrity` field, or with an integrity value that is not sha256/384/512 SRI
//   - any git, file, link, http(s) or other non-registry source (in `resolved`, `version` or dependency specs)
//   - a node_modules entry with no `resolved` and no workspace `link`, whose source is therefore unknown
//
// Allowed: workspace links (`"link": true`) whose `resolved` is a plain relative path of the form packages/<name>.
// Workspace package folders (keys under packages/ with no resolved) are not sources and are not checked.
//
// Usage: node scripts/lockfile-lint.mjs [path/to/package-lock.json]
// Default lockfile: package-lock.json at the repository root.
// Exit codes: 0 = clean, 1 = findings, 2 = usage or read/parse error.
// Node built-ins only; no dependencies.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PREFIX = 'https://registry.npmjs.org/';
const INTEGRITY_ITEM = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const WORKSPACE_PATH = /^packages\/[A-Za-z0-9._-]+$/;
const NON_REGISTRY_SPEC = /^(git\+|git:|github:|gitlab:|bitbucket:|gist:|file:|link:|https?:|\.{0,2}\/|~\/|[A-Za-z]:[\\/])/i;
const DEP_MAPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies'];

function usage(message) {
  console.error(`lockfile-lint: ${message}`);
  process.exit(2);
}

const lockfilePath = process.argv[2] ?? join(ROOT, 'package-lock.json');
let lock;
try {
  lock = JSON.parse(readFileSync(lockfilePath, 'utf8'));
} catch (error) {
  usage(`cannot read or parse ${lockfilePath}: ${error.message}`);
}
if (lock === null || typeof lock !== 'object' || Array.isArray(lock)) {
  usage(`${lockfilePath} is not a JSON object`);
}

const failures = [];
let registryEntries = 0;
let workspaceLinks = 0;

function fail(where, message) {
  failures.push(`${where}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkIntegrity(where, integrity) {
  if (typeof integrity !== 'string' || integrity.trim() === '') {
    fail(where, 'registry entry has no integrity field');
    return;
  }
  const items = integrity.trim().split(/\s+/);
  if (!items.every((item) => INTEGRITY_ITEM.test(item))) {
    fail(where, `integrity is not a sha256/sha384/sha512 SRI value: ${integrity.slice(0, 40)}`);
  }
}

function checkEntry(where, entry) {
  if (entry.link === true) {
    if (typeof entry.resolved !== 'string' || !WORKSPACE_PATH.test(entry.resolved)) {
      fail(where, `workspace link must resolve to packages/<name>, got ${JSON.stringify(entry.resolved)}`);
    } else {
      workspaceLinks += 1;
    }
    return;
  }
  if (typeof entry.resolved !== 'string') {
    fail(where, 'entry has no resolved source (not a registry entry or workspace link)');
    return;
  }
  if (!entry.resolved.startsWith(REGISTRY_PREFIX) || entry.resolved.length === REGISTRY_PREFIX.length) {
    fail(where, `resolved is not ${REGISTRY_PREFIX}: ${entry.resolved.slice(0, 120)}`);
    return;
  }
  registryEntries += 1;
  checkIntegrity(where, entry.integrity);
}

// lockfile v1 nested "dependencies" tree: every node is an entry.
function checkNestedTree(map, prefix) {
  for (const [name, node] of Object.entries(map)) {
    const where = `${prefix}${name}`;
    if (!isObject(node)) {
      fail(where, 'dependency node is not an object');
      continue;
    }
    checkEntry(where, node);
    if (isObject(node.dependencies)) checkNestedTree(node.dependencies, `${where} > `);
  }
}

// Specifiers and versions outside the entries: no git, file, link, http(s) or path sources anywhere.
function checkSpecs(node, path) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => checkSpecs(item, `${path}[${index}]`));
    return;
  }
  if (!isObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key;
    if (key === 'version' && typeof value === 'string' && NON_REGISTRY_SPEC.test(value)) {
      fail(here, `non-registry version source: ${value.slice(0, 120)}`);
    }
    if (DEP_MAPS.includes(key) && isObject(value)) {
      for (const [dep, spec] of Object.entries(value)) {
        if (typeof spec === 'string' && NON_REGISTRY_SPEC.test(spec)) {
          fail(`${here}.${dep}`, `non-registry dependency spec: ${spec.slice(0, 120)}`);
        }
      }
    }
    checkSpecs(value, here);
  }
}

if (isObject(lock.packages)) {
  // lockfile v2/v3 "packages" map: keys are install paths; the root entry "" and workspace folders are not sources.
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '') continue;
    if (!isObject(entry)) {
      fail(key, 'packages entry is not an object');
      continue;
    }
    if ('resolved' in entry || entry.link === true) {
      checkEntry(key, entry);
    } else if (key.startsWith('node_modules/')) {
      fail(key, 'node_modules entry has no resolved source');
    }
  }
}

if (isObject(lock.dependencies)) {
  checkNestedTree(lock.dependencies, '');
}

if (!isObject(lock.packages) && !isObject(lock.dependencies)) {
  usage(`${lockfilePath} has neither a "packages" nor a "dependencies" map`);
}

checkSpecs(lock, '');

if (failures.length > 0) {
  console.error(`lockfile-lint: ${failures.length} problem(s) in ${lockfilePath}:`);
  console.error(failures.map((line) => `  ${line}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `lockfile-lint: OK, ${registryEntries} registry entr${registryEntries === 1 ? 'y' : 'ies'} ` +
      `(https, integrity present), ${workspaceLinks} workspace link(s), ${lockfilePath}`,
  );
}
