#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Package layering and dependency check (QV-30 CI job `deps-boundaries`; backlog N-23 / T-235).
//
// Encodes docs/08-architecture-deployment.md section 5.1 (rules D1..D8, "Enforcement" paragraph names D1, D2, D5, D7 for this
// script) plus the single approved exception cli -> verifier (D-85 in docs/plan/DECISIONS-2026-11-04.md, approved wholesale by
// QV-ADR-027 in docs/decision-log.md). Scans packages/*/src/**/*.ts and packages/*/bin/* (never tests) for static import/export-from,
// dynamic import() and require() specifiers, and every packages/*/package.json (plus the root package.json dev dependencies).
//
// Violation classes (rule ids in output):
//   D1-EDGE         workspace import not allowed by the layer table (docs/08 s5.1 D1 and the s5 layer list)
//   D1-DECLARED     package.json declares a workspace dependency the layer table does not allow
//   D1-ESCAPE       relative import resolves outside the importing package directory
//   D1-UNKNOWN      @quietvote/<name> that is not a workspace package, or a package directory missing from the layer table
//   D2-BUILTIN      Node built-in in a package that must stay portable/pure (D2 crypto; D3 protocol and board; web browser code)
//   D4-BUILTIN      node:sqlite / node:http / node:https outside server (D4)
//   D5-VERIFIER     verifier imports or declares cli/server/trustee/web, or its production closure leaves @noble/* (D5)
//   D6-DEEP         deep import (@quietvote/<pkg>/<subpath>) not exposed by that package's `exports` map (D6)
//   D7-UNDECLARED   import of a workspace package or third-party package that the package.json does not declare
//   D7-ALLOWLIST    production dependency outside the allowlist (QV-ADR-024, QV-19 P1 / REQ-002), more than 3 production
//                   packages (QV-ADR-P19-4), @noble/* imported by a package other than crypto (QV-ADR-024 point 1),
//                   or a dev dependency outside the dev set (QV-19 P2, QV-ADR-026)
//   D7-DEVPROD      dev-only tool imported from shipping code, or imported from tooling but declared only as a production dep
//
// Interpretation notes (also in the task report):
//   * Type-only imports (`import type`, `export type ... from`, inline `import('x').T`) COUNT. D1 constrains the package graph,
//     tsc resolves them, and erasing them would hide a real coupling. They are marked kind=type in --json.
//   * Imports inside comments, string literals, template text and regex literals are not imports (tokenizer, not regex grep).
//   * Dynamic import() with a non-literal specifier cannot be classified; it is reported as a warning, never silently dropped.
//   * D4 as written ("only server may import node:sqlite, node:http(s), node:fs") conflicts with Node entry points that need file
//     access (cli, trustee, verifier) and with web build tooling. This script enforces sqlite/http/https literally and allows
//     node:fs and other built-ins in those Node-only places (see NODE_BUILTIN_RULES). Tighten the table to change that.
//   * D6 is checked against each package's real `exports` map; D5 prose names `@quietvote/protocol/verify` entry points that no
//     exports map currently exposes, so those would fail D6 until the maps and the spec agree.
//
// Usage: node scripts/check-deps.mjs [--root <repo-root>] [--json]
// Exit codes: 0 = no new violations (known deviations are listed), 1 = new violations or a stale known deviation,
// 2 = usage or internal error. Node built-ins only; no dependencies.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------------------
// Rule data (edit here; everything below is mechanism).
// ---------------------------------------------------------------------------------------------------------------------------

const WORKSPACE_SCOPE = '@quietvote/';

// docs/08-architecture-deployment.md s5 layer list: crypto L0, protocol L1, board L2, {server, web, cli, trustee, verifier} L3.
// s5.1 D1: "Imports flow strictly downward: crypto < protocol < board < {server,web,cli,trustee,verifier}. No cycles; L3 packages
// never import each other." So each package may import exactly the packages below it, and no L3 package imports another L3 package.
const LAYERS = {
  crypto: 0,
  protocol: 1,
  board: 2,
  server: 3,
  web: 3,
  cli: 3,
  trustee: 3,
  verifier: 3,
};

// Allowed workspace edges, derived from D1: importer -> imported (strictly lower layer only).
const ALLOWED_EDGES = Object.fromEntries(
  Object.entries(LAYERS).map(([pkg, layer]) => [
    pkg,
    new Set(Object.entries(LAYERS).filter(([, other]) => other < layer).map(([name]) => name)),
  ]),
);

// The single approved exception: D-85 option A ("amend D1: allow single edge cli->verifier"), approved by QV-ADR-027
// (docs/decision-log.md, owner approval of the 2026-11-04 register). The verifier's independence stays protected by D5.
const APPROVED_EXCEPTIONS = [{ from: 'cli', to: 'verifier', ref: 'D-85 / QV-ADR-027' }];
for (const { from, to } of APPROVED_EXCEPTIONS) ALLOWED_EDGES[from].add(to);

// s5.1 D5: the verifier never imports server, web, cli or trustee (explicit, independent of the layer table).
const VERIFIER_FORBIDDEN = ['cli', 'server', 'trustee', 'web'];

// s5.1 D5: the verifier's production dependency closure is limited to @noble/*.
const VERIFIER_CLOSURE_ALLOWED_PREFIX = '@noble/';

// s5.1 D2: crypto has no Node built-ins. s5.1 D3: protocol and board (core) are pure (no I/O, no clock, no randomness), which rules
// out every Node built-in. s5.1 D4: only web may touch DOM/browser storage, so web browser code is Node-free; web build tooling
// (WEB_TOOLING) runs in Node at build time and may use built-ins. Nothing else restricts built-ins except sqlite/http/https below.
const NODE_FREE_PACKAGES = new Set(['crypto', 'protocol', 'board']);
// s5.1 D4: only server may import node:sqlite and node:http(s). (node:fs is discussed in the header note.)
const SERVER_ONLY_BUILTINS = new Set(['sqlite', 'http', 'https']);

// QV-19 P1 / REQ-002 and QV-ADR-024 (docs/decision-log.md): the production dependency allowlist is exactly these two packages,
// with a ceiling of 3 production packages (QV-ADR-P19-4). QV-ADR-024 point 1: packages/crypto is the only importer.
const PROD_ALLOWLIST = new Set(['@noble/curves', '@noble/hashes']);
const PROD_CEILING = 3;
const PROD_ONLY_IMPORTERS = { '@noble/curves': ['crypto'], '@noble/hashes': ['crypto'] };

// QV-19 P2 target dev set (typescript, esbuild, eslint + typescript-eslint, dependency-cruiser, cyclonedx, c8) plus the tools the
// repository already pins: playwright (QV-ADR-026, test tooling) and @types/node. Dev tools never ship, so they may only be imported
// from tooling paths (DEV_TOOLING_PATHS) and must be declared in devDependencies.
const DEV_ALLOWLIST = new Set([
  'typescript', 'esbuild', 'eslint', 'typescript-eslint', 'dependency-cruiser', '@cyclonedx/cyclonedx-npm', 'c8',
  'playwright', '@types/node',
]);

// Files (relative to the package directory, posix) that are build/test tooling rather than shipped code. Only web has any: the
// build pipeline (esbuild bundling, catalogue precompiler) and the i18n source scanners that import the TypeScript compiler API.
const WEB_TOOLING = ['src/build/', 'src/i18n/extract.ts', 'src/i18n/catalog-lint.ts'];
const TOOLING_PATHS = { web: WEB_TOOLING };

// Known deviations (ratchet) live in a reviewed data file inside the checked tree: scripts/deps-known-deviations.json.
// They are violations that existed when this check was introduced and that need an owner decision rather than a silent code
// move. They are printed on every run and do not fail it. Any OTHER violation fails, and so does an entry that no longer
// matches anything (delete it when the deviation is fixed). Never add an entry to quieten a new finding.
const KNOWN_DEVIATIONS_FILE = 'scripts/deps-known-deviations.json';

/** Load and validate the known-deviation list of the checked tree; a tree without the file has none. */
export function loadKnownDeviations(root) {
  const path = join(root, KNOWN_DEVIATIONS_FILE);
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data === null || typeof data !== 'object' || !Array.isArray(data.deviations)) {
    throw new Error(`${KNOWN_DEVIATIONS_FILE}: expected {"deviations": [...]}`);
  }
  for (const k of data.deviations) {
    const strings = k !== null && typeof k === 'object'
      && ['rule', 'file', 'specifier', 'ref', 'reason'].every((key) => typeof k[key] === 'string' && k[key].length > 0);
    if (!strings) throw new Error(`${KNOWN_DEVIATIONS_FILE}: every deviation needs non-empty rule, file, specifier, ref and reason`);
  }
  return data.deviations;
}

/** Split violations into unexpected ones, known deviations, and known entries that no longer match (stale). */
export function classifyViolations(violations, known) {
  const matches = (v, k) => v.rule === k.rule && v.file === k.file && v.specifier === k.specifier;
  const unexpected = [];
  const accepted = [];
  for (const v of violations) {
    const k = known.find((entry) => matches(v, entry));
    if (k === undefined) unexpected.push(v);
    else accepted.push({ ...v, ref: k.ref });
  }
  const stale = known.filter((k) => !violations.some((v) => matches(v, k)));
  return { unexpected, known: accepted, stale };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tokenizer: finds module specifiers while ignoring comments, strings, template text and regex literals.
// ---------------------------------------------------------------------------------------------------------------------------

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const braceStack = []; // 'brace' | 'tmpl' to resume template text after `${ ... }`
  const isIdChar = (c) => /[A-Za-z0-9_$\u0080-￿]/.test(c);

  function readTemplate() {
    // Positioned just after a backtick or after the closing brace of `${ }`. Returns when the template ends or `${` begins.
    let text = '';
    let hasExpr = false;
    const startLine = line;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { text += src[i + 1] ?? ''; if (src[i + 1] === '\n') line += 1; i += 2; continue; }
      if (c === '`') { i += 1; return { text, hasExpr, startLine, ended: true }; }
      if (c === '$' && src[i + 1] === '{') { i += 2; braceStack.push('tmpl'); return { text, hasExpr: true, startLine, ended: false }; }
      if (c === '\n') line += 1;
      text += c;
      i += 1;
    }
    return { text, hasExpr, startLine, ended: true };
  }

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line += 1; i += 1; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i += 1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line += 1; i += 1; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const startLine = line;
      let text = '';
      i += 1;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { text += src[i + 1] ?? ''; i += 2; continue; }
        text += src[i];
        i += 1;
      }
      i += 1;
      tokens.push({ t: 'str', v: text, line: startLine });
      continue;
    }
    if (c === '`') {
      i += 1;
      const r = readTemplate();
      tokens.push({ t: r.hasExpr ? 'tmpl' : 'str', v: r.text, line: r.startLine });
      continue;
    }
    if (c === '/') {
      const prev = tokens[tokens.length - 1];
      const divides = prev !== undefined && (
        prev.t === 'str' || prev.t === 'tmpl' ||
        (prev.t === 'id' && !REGEX_PRECEDING_KEYWORDS.has(prev.v)) ||
        (prev.t === 'punct' && (prev.v === ')' || prev.v === ']' || prev.v === '}'))
      );
      if (!divides) {
        // Regex literal: skip to the closing slash, honouring escapes and character classes.
        i += 1;
        let inClass = false;
        while (i < n && src[i] !== '\n') {
          const d = src[i];
          if (d === '\\') { i += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          i += 1;
        }
        i += 1;
        while (i < n && isIdChar(src[i])) i += 1; // flags
        tokens.push({ t: 'regex', v: '', line });
        continue;
      }
      tokens.push({ t: 'punct', v: '/', line });
      i += 1;
      continue;
    }
    if (isIdChar(c)) {
      let j = i;
      while (j < n && isIdChar(src[j])) j += 1;
      tokens.push({ t: 'id', v: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (c === '{') braceStack.push('brace');
    if (c === '}') {
      const top = braceStack.pop();
      if (top === 'tmpl') {
        i += 1;
        const r = readTemplate();
        tokens.push({ t: 'tmpl', v: r.text, line: r.startLine });
        continue;
      }
    }
    tokens.push({ t: 'punct', v: c, line });
    i += 1;
  }
  return tokens;
}

// Returns [{ specifier, line, kind: 'static'|'type'|'dynamic'|'require', dynamicUnresolved?: true }].
function findSpecifiers(src) {
  const tokens = tokenize(src);
  const found = [];
  const isP = (tok, v) => tok !== undefined && tok.t === 'punct' && tok.v === v;
  const isId = (tok, v) => tok !== undefined && tok.t === 'id' && tok.v === v;

  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    if (tok.t !== 'id') continue;
    const prev = tokens[k - 1];
    if (isP(prev, '.')) continue; // property access such as import.meta or obj.require

    if (tok.v === 'import') {
      const next = tokens[k + 1];
      if (isP(next, '.')) continue; // import.meta
      if (isP(next, '(')) {
        const arg = tokens[k + 2];
        if (arg !== undefined && arg.t === 'str' && (isP(tokens[k + 3], ')') || isP(tokens[k + 3], ','))) {
          found.push({ specifier: arg.v, line: arg.line, kind: 'dynamic' });
        } else {
          found.push({ specifier: null, line: tok.line, kind: 'dynamic', dynamicUnresolved: true });
        }
        continue;
      }
      if (next !== undefined && next.t === 'str') {
        found.push({ specifier: next.v, line: next.line, kind: 'static' });
        continue;
      }
      // import [type] <bindings> from '<spec>' (bindings may span lines)
      const isType = isId(next, 'type') && !isId(tokens[k + 2], 'from');
      for (let m = k + 1; m < tokens.length; m += 1) {
        const x = tokens[m];
        if (isP(x, ';') || isP(x, '=') || isP(x, '(')) break;
        if (isId(x, 'from') && tokens[m + 1] !== undefined && tokens[m + 1].t === 'str') {
          found.push({ specifier: tokens[m + 1].v, line: tokens[m + 1].line, kind: isType ? 'type' : 'static' });
          break;
        }
      }
      continue;
    }

    if (tok.v === 'export') {
      let m = k + 1;
      const isType = isId(tokens[m], 'type');
      if (isType) m += 1;
      if (!isP(tokens[m], '{') && !isP(tokens[m], '*')) continue;
      for (; m < tokens.length; m += 1) {
        const x = tokens[m];
        if (isP(x, ';')) break;
        if (isId(x, 'from') && tokens[m + 1] !== undefined && tokens[m + 1].t === 'str') {
          found.push({ specifier: tokens[m + 1].v, line: tokens[m + 1].line, kind: isType ? 'type' : 'static' });
          break;
        }
        // `export { a }` with no from: stop at the closing brace followed by something other than `from`.
        if (isP(x, '}') && !isId(tokens[m + 1], 'from')) break;
      }
      continue;
    }

    if (tok.v === 'require' && isP(tokens[k + 1], '(')) {
      const arg = tokens[k + 2];
      if (arg !== undefined && arg.t === 'str' && isP(tokens[k + 3], ')')) {
        found.push({ specifier: arg.v, line: arg.line, kind: 'require' });
      } else {
        found.push({ specifier: null, line: tok.line, kind: 'require', dynamicUnresolved: true });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Repository scan.
// ---------------------------------------------------------------------------------------------------------------------------

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

function thirdPartyName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function builtinName(specifier) {
  if (specifier.startsWith('node:')) return specifier.slice(5);
  const base = specifier.split('/')[0];
  return BUILTINS.has(specifier) || BUILTINS.has(base) ? specifier : null;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function lineOfKey(text, key) {
  const idx = text.indexOf(JSON.stringify(key));
  return idx < 0 ? 1 : text.slice(0, idx).split('\n').length;
}

function exportedSubpaths(pkgJson) {
  // Specifier subpaths (relative to the package name) that the `exports` map exposes. "." is the bare package.
  const exp = pkgJson.exports;
  if (exp === undefined || exp === null) return null; // no map: nothing is blocked, but D6 expects one
  if (typeof exp === 'string' || Array.isArray(exp)) return new Set(['.']);
  const keys = Object.keys(exp);
  if (keys.length > 0 && !keys.some((key) => key.startsWith('.'))) return new Set(['.']); // conditions-only form
  return new Set(keys);
}

export function checkRepo(root) {
  const violations = [];
  const warnings = [];
  const stats = { packages: 0, files: 0, imports: 0 };
  const add = (rule, file, line, message, extra = {}) => violations.push({ rule, file, line, message, ...extra });
  const rel = (path) => relative(root, path).split(sep).join('/');

  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir) || !statSync(packagesDir).isDirectory()) {
    throw new Error(`no packages/ directory under ${root}`);
  }
  const pkgNames = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
  if (pkgNames.length === 0) throw new Error(`no packages/*/package.json under ${root}`);

  const pkgs = {};
  for (const name of pkgNames) {
    const dir = join(packagesDir, name);
    const jsonPath = join(dir, 'package.json');
    const text = readFileSync(jsonPath, 'utf8');
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`cannot parse ${rel(jsonPath)}: ${error.message}`);
    }
    pkgs[name] = { name, dir, jsonPath, jsonRel: rel(jsonPath), text, json, exportsMap: exportedSubpaths(json) };
    stats.packages += 1;
    if (!(name in LAYERS)) {
      add('D1-UNKNOWN', rel(jsonPath), 1, `package "${name}" is not in the layer table (docs/08 s5); add it to LAYERS with a layer before using it`);
    }
  }

  // ---- package.json checks -------------------------------------------------------------------------------------------------
  const prodThirdParty = new Set();
  for (const pkg of Object.values(pkgs)) {
    const { json, jsonRel, text, name } = pkg;
    const prod = { ...(json.dependencies ?? {}), ...(json.optionalDependencies ?? {}), ...(json.peerDependencies ?? {}) };
    for (const dep of Object.keys(prod)) {
      const line = lineOfKey(text, dep);
      if (dep.startsWith(WORKSPACE_SCOPE)) {
        const target = dep.slice(WORKSPACE_SCOPE.length);
        if (!(target in pkgs)) {
          add('D1-UNKNOWN', jsonRel, line, `declares ${dep}, which is not a workspace package`, { specifier: dep });
        } else if (target !== name && name in ALLOWED_EDGES && !ALLOWED_EDGES[name].has(target)) {
          add('D1-DECLARED', jsonRel, line, `declares workspace dependency ${dep}; the layer table does not allow ${name} -> ${target}`, { specifier: dep });
        }
        if (name === 'verifier' && VERIFIER_FORBIDDEN.includes(target)) {
          add('D5-VERIFIER', jsonRel, line, `verifier declares ${dep}; D5 forbids server, web, cli and trustee`, { specifier: dep });
        }
      } else {
        prodThirdParty.add(dep);
        if (!PROD_ALLOWLIST.has(dep)) {
          add('D7-ALLOWLIST', jsonRel, line, `production dependency ${dep} is not on the allowlist (${[...PROD_ALLOWLIST].join(', ')}; QV-ADR-024, QV-19 P1/REQ-002)`, { specifier: dep });
        } else if (PROD_ONLY_IMPORTERS[dep] !== undefined && !PROD_ONLY_IMPORTERS[dep].includes(name)) {
          add('D7-ALLOWLIST', jsonRel, line, `${dep} may only be a dependency of ${PROD_ONLY_IMPORTERS[dep].join(', ')} (QV-ADR-024 point 1)`, { specifier: dep });
        }
      }
    }
    for (const dep of Object.keys(json.devDependencies ?? {})) {
      if (!DEV_ALLOWLIST.has(dep)) {
        add('D7-ALLOWLIST', jsonRel, lineOfKey(text, dep), `dev dependency ${dep} is not in the dev set (${[...DEV_ALLOWLIST].join(', ')}; QV-19 P2)`, { specifier: dep });
      }
    }
  }
  const rootJsonPath = join(root, 'package.json');
  let rootDev = {};
  if (existsSync(rootJsonPath)) {
    const rootText = readFileSync(rootJsonPath, 'utf8');
    const rootJson = JSON.parse(rootText);
    rootDev = rootJson.devDependencies ?? {};
    for (const dep of Object.keys({ ...(rootJson.dependencies ?? {}) })) {
      add('D7-ALLOWLIST', 'package.json', lineOfKey(rootText, dep), `root package.json has production dependency ${dep}; the root is tooling only`, { specifier: dep });
    }
    for (const dep of Object.keys(rootDev)) {
      if (!DEV_ALLOWLIST.has(dep)) {
        add('D7-ALLOWLIST', 'package.json', lineOfKey(rootText, dep), `root dev dependency ${dep} is not in the dev set (QV-19 P2)`, { specifier: dep });
      }
    }
  }
  if (prodThirdParty.size > PROD_CEILING) {
    add('D7-ALLOWLIST', 'package.json', 1, `${prodThirdParty.size} distinct production packages exceed the ceiling of ${PROD_CEILING} (QV-ADR-P19-4)`);
  }

  // D5 closure: third-party production dependencies reachable from verifier through declared workspace dependencies.
  if (pkgs.verifier !== undefined) {
    const seen = new Set();
    const stack = ['verifier'];
    while (stack.length > 0) {
      const current = stack.pop();
      if (seen.has(current) || pkgs[current] === undefined) continue;
      seen.add(current);
      for (const dep of Object.keys(pkgs[current].json.dependencies ?? {})) {
        if (dep.startsWith(WORKSPACE_SCOPE)) stack.push(dep.slice(WORKSPACE_SCOPE.length));
        else if (!dep.startsWith(VERIFIER_CLOSURE_ALLOWED_PREFIX)) {
          add('D5-VERIFIER', pkgs[current].jsonRel, lineOfKey(pkgs[current].text, dep), `verifier production closure includes ${dep} (via ${current}); D5 limits it to @noble/*`, { specifier: dep });
        }
      }
    }
  }

  // ---- source scan ---------------------------------------------------------------------------------------------------------
  for (const pkg of Object.values(pkgs)) {
    const { name, dir, json } = pkg;
    const files = [];
    walk(join(dir, 'src'), files);
    const binDir = join(dir, 'bin');
    if (existsSync(binDir)) {
      for (const entry of readdirSync(binDir, { withFileTypes: true })) {
        if (entry.isFile()) files.push(join(binDir, entry.name));
      }
    }
    files.sort();
    const prodDeps = { ...(json.dependencies ?? {}), ...(json.optionalDependencies ?? {}), ...(json.peerDependencies ?? {}) };
    const devDeps = json.devDependencies ?? {};
    const toolingRules = TOOLING_PATHS[name] ?? [];

    for (const file of files) {
      if (!/\.(ts|mts|cts|js|mjs|cjs)$/.test(file) && !file.startsWith(binDir + sep)) continue;
      stats.files += 1;
      const fileRel = rel(file);
      const inPkg = relative(dir, file).split(sep).join('/');
      const isTooling = toolingRules.some((rule) => (rule.endsWith('/') ? inPkg.startsWith(rule) : inPkg === rule));
      let specs;
      try {
        specs = findSpecifiers(readFileSync(file, 'utf8'));
      } catch (error) {
        throw new Error(`cannot scan ${fileRel}: ${error.message}`);
      }

      for (const spec of specs) {
        stats.imports += 1;
        const where = [fileRel, spec.line];
        if (spec.specifier === null) {
          warnings.push({ file: fileRel, line: spec.line, message: `${spec.kind === 'require' ? 'require' : 'dynamic import'} with a non-literal specifier cannot be classified` });
          continue;
        }
        const s = spec.specifier;

        // relative or absolute path
        if (s.startsWith('.') || s.startsWith('/')) {
          const target = resolve(dirname(file), s);
          const fromPkg = relative(dir, target);
          if (fromPkg === '..' || fromPkg.startsWith('..' + sep) || resolve(fromPkg) === fromPkg) {
            add('D1-ESCAPE', ...where, `${spec.kind} import "${s}" resolves outside packages/${name}; use the package's public entry`, { specifier: s });
          }
          continue;
        }

        // Node built-in
        const builtin = builtinName(s);
        if (builtin !== null) {
          const base = builtin.split('/')[0];
          if (SERVER_ONLY_BUILTINS.has(base) && name !== 'server') {
            add('D4-BUILTIN', ...where, `node:${builtin} may only be imported by server (D4)`, { specifier: s });
          } else if (NODE_FREE_PACKAGES.has(name)) {
            const why = name === 'crypto' ? 'D2: crypto uses no Node built-ins' : `D3: ${name} is pure (no I/O, clock or randomness)`;
            add('D2-BUILTIN', ...where, `node:${builtin} is not allowed in ${name} (${why})`, { specifier: s });
          } else if (name === 'web' && !isTooling) {
            add('D2-BUILTIN', ...where, `node:${builtin} in web browser code (only ${WEB_TOOLING.join(', ')} are Node tooling)`, { specifier: s });
          }
          continue;
        }

        // workspace package
        if (s.startsWith(WORKSPACE_SCOPE)) {
          const rest = s.slice(WORKSPACE_SCOPE.length);
          const [target, ...sub] = rest.split('/');
          if (!(target in pkgs)) {
            add('D1-UNKNOWN', ...where, `${s} is not a workspace package`, { specifier: s });
            continue;
          }
          if (target === name) continue; // self-import: no edge
          const subpath = sub.length === 0 ? '.' : './' + sub.join('/');
          const exposed = pkgs[target].exportsMap;
          if (subpath !== '.' && (exposed === null || !exposed.has(subpath))) {
            add('D6-DEEP', ...where, `${s} is not exposed by ${WORKSPACE_SCOPE}${target} exports map (D6 forbids deep imports)`, { specifier: s });
          }
          if (name === 'verifier' && VERIFIER_FORBIDDEN.includes(target)) {
            add('D5-VERIFIER', ...where, `verifier imports ${WORKSPACE_SCOPE}${target}; D5 forbids server, web, cli and trustee`, { specifier: s });
          } else if (name in ALLOWED_EDGES && !ALLOWED_EDGES[name].has(target)) {
            add('D1-EDGE', ...where, `${name} -> ${target} is not allowed by the layer table (${spec.kind} import of ${s})`, { specifier: s });
          }
          if (!(WORKSPACE_SCOPE + target in prodDeps)) {
            add('D7-UNDECLARED', ...where, `${s} is imported but not declared in packages/${name}/package.json dependencies`, { specifier: s });
          }
          continue;
        }

        // package-internal subpath imports (#x) carry no edge
        if (s.startsWith('#')) continue;

        // third-party
        const dep = thirdPartyName(s);
        const declaredProd = dep in prodDeps;
        const declaredDev = dep in devDeps;
        if (isTooling) {
          if (!declaredProd && !declaredDev) {
            const hint = dep in rootDev ? ` (declared only in the root package.json devDependencies, not in packages/${name}/package.json)` : '';
            add('D7-UNDECLARED', ...where, `${dep} is imported by build tooling but not declared in packages/${name}/package.json${hint}`, { specifier: s });
          } else if (!declaredDev && declaredProd) {
            add('D7-DEVPROD', ...where, `${dep} is imported by build tooling but declared as a production dependency`, { specifier: s });
          }
          if (!DEV_ALLOWLIST.has(dep) && !PROD_ALLOWLIST.has(dep)) {
            add('D7-ALLOWLIST', ...where, `${dep} is not on the dev tool set or the production allowlist`, { specifier: s });
          }
        } else {
          if (DEV_ALLOWLIST.has(dep)) {
            add('D7-DEVPROD', ...where, `dev-only tool ${dep} imported from shipping code (dev tools never ship; QV-19 P2)`, { specifier: s });
          } else if (!declaredProd) {
            add('D7-UNDECLARED', ...where, `${dep} is imported but not declared in packages/${name}/package.json dependencies`, { specifier: s });
          } else if (!PROD_ALLOWLIST.has(dep)) {
            add('D7-ALLOWLIST', ...where, `${dep} is not on the production allowlist (QV-ADR-024)`, { specifier: s });
          } else if (PROD_ONLY_IMPORTERS[dep] !== undefined && !PROD_ONLY_IMPORTERS[dep].includes(name)) {
            add('D7-ALLOWLIST', ...where, `${dep} may only be imported by ${PROD_ONLY_IMPORTERS[dep].join(', ')} (QV-ADR-024 point 1)`, { specifier: s });
          }
        }
      }
    }
  }

  violations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line) || (a.rule < b.rule ? -1 : 1));
  return { ok: violations.length === 0, violations, warnings, stats };
}

export { findSpecifiers, ALLOWED_EDGES, KNOWN_DEVIATIONS_FILE };

// ---------------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------------

function main(argv) {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let json = false;
  for (let k = 0; k < argv.length; k += 1) {
    const arg = argv[k];
    if (arg === '--json') json = true;
    else if (arg === '--root') {
      const value = argv[k + 1];
      if (value === undefined) { console.error('check-deps: --root needs a directory'); return 2; }
      root = resolve(value);
      k += 1;
    } else {
      console.error(`check-deps: unknown argument ${arg}\nusage: node scripts/check-deps.mjs [--root <repo-root>] [--json]`);
      return 2;
    }
  }
  let result;
  let knownList;
  try {
    result = checkRepo(root);
    knownList = loadKnownDeviations(root);
  } catch (error) {
    console.error(`check-deps: ${error.message}`);
    return 2;
  }
  const { unexpected, known, stale } = classifyViolations(result.violations, knownList);
  const ok = unexpected.length === 0 && stale.length === 0;
  if (json) {
    console.log(JSON.stringify({ ...result, ok, unexpected, known_deviations: known, stale_known_deviations: stale }, null, 2));
  } else {
    for (const v of unexpected) console.error(`${v.file}:${v.line}: [${v.rule}] ${v.message}`);
    for (const v of known) console.error(`${v.file}:${v.line}: known deviation (${v.ref}) [${v.rule}] ${v.message}`);
    for (const k of stale) console.error(`check-deps: stale known deviation, remove it from ${KNOWN_DEVIATIONS_FILE}: [${k.rule}] ${k.file} ${k.specifier} (${k.ref})`);
    for (const w of result.warnings) console.error(`${w.file}:${w.line}: warning: ${w.message}`);
    const scope = `${result.stats.packages} packages, ${result.stats.files} files, ${result.stats.imports} imports`;
    if (ok) {
      console.log(known.length === 0
        ? `check-deps: ${scope}: no violations.`
        : `check-deps: ${scope}: no new violations; ${known.length} known deviation(s) awaiting an owner decision.`);
    } else {
      console.error(`check-deps: ${unexpected.length} violation(s), ${stale.length} stale known deviation(s); ${scope}.`);
    }
  }
  return ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
