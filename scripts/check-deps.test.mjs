// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests for scripts/check-deps.mjs against temporary repository fixtures. No repository files are changed.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { classifyViolations, findSpecifiers, loadKnownDeviations } from './check-deps.mjs';

const checker = resolve(import.meta.dirname, 'check-deps.mjs');

// A minimal clean repository: every package declares exactly what it may import.
const BASE_DEPS = {
  crypto: { '@noble/curves': '2.4.0', '@noble/hashes': '2.4.0' },
  protocol: { '@quietvote/crypto': '*' },
  board: { '@quietvote/crypto': '*', '@quietvote/protocol': '*' },
  server: { '@quietvote/board': '*', '@quietvote/crypto': '*', '@quietvote/protocol': '*' },
  web: { '@quietvote/board': '*', '@quietvote/crypto': '*', '@quietvote/protocol': '*' },
  cli: { '@quietvote/board': '*', '@quietvote/crypto': '*', '@quietvote/protocol': '*', '@quietvote/verifier': '*' },
  trustee: { '@quietvote/board': '*', '@quietvote/crypto': '*', '@quietvote/protocol': '*' },
  verifier: { '@quietvote/board': '*', '@quietvote/crypto': '*', '@quietvote/protocol': '*' },
};

function makeRepo({ deps = {}, dev = {}, files = {}, rootDev = {}, exportsMaps = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qv-check-deps-'));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write('package.json', JSON.stringify({ name: 'fixture', private: true, devDependencies: rootDev }, null, 2));
  for (const name of Object.keys(BASE_DEPS)) {
    write(`packages/${name}/package.json`, JSON.stringify({
      name: `@quietvote/${name}`,
      exports: exportsMaps[name] ?? { '.': './src/index.ts' },
      dependencies: deps[name] ?? BASE_DEPS[name],
      devDependencies: dev[name] ?? {},
    }, null, 2));
    write(`packages/${name}/src/index.ts`, 'export const x = 1;\n');
  }
  for (const [path, content] of Object.entries(files)) write(path, content);
  return root;
}

function run(repo, ...args) {
  try {
    const result = spawnSync(process.execPath, [checker, '--root', repo, ...args], { encoding: 'utf8' });
    assert.equal(result.error, undefined, result.error?.message);
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function violations(result) {
  return JSON.parse(result.stdout).violations;
}

test('clean fixture passes with exit 0', () => {
  const result = run(makeRepo({ files: { 'packages/board/src/a.ts': "import { x } from '@quietvote/protocol';\nimport { y } from '@quietvote/crypto';\n" } }));
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /no violations/);
});

test('allowed downward edge and the approved cli -> verifier exception pass', () => {
  const result = run(makeRepo({
    files: {
      'packages/server/src/a.ts': "import { x } from '@quietvote/board';\n",
      'packages/cli/src/a.ts': "import { verify } from '@quietvote/verifier';\n",
    },
  }));
  assert.equal(result.code, 0, result.stderr);
});

test('forbidden upward edge is reported with file:line and rule id', () => {
  const result = run(makeRepo({
    deps: { protocol: { '@quietvote/crypto': '*', '@quietvote/board': '*' } },
    files: { 'packages/protocol/src/a.ts': "\nimport { x } from '@quietvote/board';\n" },
  }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /packages\/protocol\/src\/a\.ts:2: \[D1-EDGE\] protocol -> board/);
  assert.match(result.stderr, /packages\/protocol\/package\.json:\d+: \[D1-DECLARED\]/);
});

test('L3 packages must not import each other (server -> cli, cli -> trustee), and the exception is one-way', () => {
  const result = run(makeRepo({
    deps: { server: { '@quietvote/crypto': '*', '@quietvote/cli': '*' }, verifier: { '@quietvote/crypto': '*', '@quietvote/cli': '*' } },
    files: {
      'packages/server/src/a.ts': "import '@quietvote/cli';\n",
      'packages/cli/src/a.ts': "import { t } from '@quietvote/trustee';\n",
      'packages/verifier/src/a.ts': "import { c } from '@quietvote/cli';\n",
    },
  }), '--json');
  assert.equal(result.code, 1);
  const found = violations(result);
  assert.ok(found.some((v) => v.rule === 'D1-EDGE' && v.file.endsWith('server/src/a.ts')));
  assert.ok(found.some((v) => v.rule === 'D1-EDGE' && v.file.endsWith('cli/src/a.ts') && /cli -> trustee/.test(v.message)));
  assert.ok(found.some((v) => v.rule === 'D5-VERIFIER' && v.file.endsWith('verifier/src/a.ts')));
  assert.ok(found.some((v) => v.rule === 'D5-VERIFIER' && v.file.endsWith('verifier/package.json')));
});

test('relative import escaping the package directory is a violation', () => {
  const result = run(makeRepo({ files: { 'packages/server/src/deep/a.ts': "import { x } from '../../../crypto/src/index.ts';\nimport { ok } from '../index.ts';\n" } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /server\/src\/deep\/a\.ts:1: \[D1-ESCAPE\]/);
  assert.doesNotMatch(result.stderr, /a\.ts:2/);
});

test('workspace import not declared in package.json is a violation', () => {
  const result = run(makeRepo({
    deps: { server: { '@quietvote/crypto': '*' } },
    files: { 'packages/server/src/a.ts': "import { x } from '@quietvote/board';\n" },
  }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /server\/src\/a\.ts:1: \[D7-UNDECLARED\] @quietvote\/board/);
});

test('undeclared third-party import is a violation; declared allowlisted import in crypto passes', () => {
  const bad = run(makeRepo({ files: { 'packages/server/src/a.ts': "import express from 'express';\n" } }));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /server\/src\/a\.ts:1: \[D7-UNDECLARED\] express/);
  const good = run(makeRepo({ files: { 'packages/crypto/src/a.ts': "import { sha256 } from '@noble/hashes/sha2.js';\n" } }));
  assert.equal(good.code, 0, good.stderr);
});

test('production dependency outside the allowlist, and more than three packages, are violations', () => {
  const result = run(makeRepo({ deps: { server: { ...BASE_DEPS.server, lodash: '4.17.21' } } }), '--json');
  assert.equal(result.code, 1);
  assert.ok(violations(result).some((v) => v.rule === 'D7-ALLOWLIST' && v.specifier === 'lodash'));
  const many = run(makeRepo({ deps: { crypto: { '@noble/curves': '1', '@noble/hashes': '1', a: '1', b: '1' } } }), '--json');
  assert.ok(violations(many).some((v) => /ceiling/.test(v.message)));
});

test('@noble/* is crypto-only (QV-ADR-024)', () => {
  const result = run(makeRepo({
    deps: { protocol: { '@quietvote/crypto': '*', '@noble/hashes': '2.4.0' } },
    files: { 'packages/protocol/src/a.ts': "import { sha256 } from '@noble/hashes/sha2.js';\n" },
  }), '--json');
  assert.equal(result.code, 1);
  assert.ok(violations(result).filter((v) => v.rule === 'D7-ALLOWLIST').length >= 2);
});

test('verifier production closure outside @noble/* fails D5', () => {
  const result = run(makeRepo({ deps: { verifier: { ...BASE_DEPS.verifier, zod: '3.0.0' } } }), '--json');
  assert.equal(result.code, 1);
  assert.ok(violations(result).some((v) => v.rule === 'D5-VERIFIER' && v.specifier === 'zod'));
});

test('dev tool: allowed in declared web tooling, rejected in shipping code or when undeclared', () => {
  const ok = run(makeRepo({
    dev: { web: { esbuild: '0.28.2' } },
    files: { 'packages/web/src/build/site.ts': "import { build } from 'esbuild';\n" },
  }));
  assert.equal(ok.code, 0, ok.stderr);
  const shipping = run(makeRepo({
    dev: { web: { esbuild: '0.28.2' } },
    files: { 'packages/web/src/ui/a.ts': "import { build } from 'esbuild';\n" },
  }));
  assert.equal(shipping.code, 1);
  assert.match(shipping.stderr, /\[D7-DEVPROD\]/);
  const undeclared = run(makeRepo({
    rootDev: { typescript: '5.9.3' },
    files: { 'packages/web/src/i18n/extract.ts': "import ts from 'typescript';\n" },
  }));
  assert.equal(undeclared.code, 1);
  assert.match(undeclared.stderr, /extract\.ts:1: \[D7-UNDECLARED\] typescript.*root package\.json/);
});

test('dev dependency outside the dev set is a violation', () => {
  const result = run(makeRepo({ dev: { web: { webpack: '5.0.0' } } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /\[D7-ALLOWLIST\] dev dependency webpack/);
});

test('Node built-ins: pure packages and web browser code reject them; server and web tooling allow them', () => {
  const result = run(makeRepo({
    files: {
      'packages/crypto/src/a.ts': "import { randomBytes } from 'node:crypto';\n",
      'packages/protocol/src/a.ts': "import fs from 'fs';\n",
      'packages/web/src/ui/a.ts': "import { join } from 'node:path';\n",
      'packages/web/src/build/a.ts': "import { join } from 'node:path';\n",
      'packages/server/src/a.ts': "import { DatabaseSync } from 'node:sqlite';\nimport http from 'node:http';\n",
    },
  }), '--json');
  const found = violations(result);
  assert.equal(result.code, 1);
  const files = found.filter((v) => v.rule === 'D2-BUILTIN').map((v) => v.file).sort();
  assert.deepEqual(files, ['packages/crypto/src/a.ts', 'packages/protocol/src/a.ts', 'packages/web/src/ui/a.ts']);
  assert.equal(found.filter((v) => v.rule === 'D4-BUILTIN').length, 0);
});

test('node:sqlite/http/https outside server violates D4', () => {
  const result = run(makeRepo({ files: { 'packages/cli/src/a.ts': "import { request } from 'node:https';\n" } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /cli\/src\/a\.ts:1: \[D4-BUILTIN\]/);
});

test('deep import is blocked unless the exports map exposes the subpath', () => {
  const blocked = run(makeRepo({ files: { 'packages/server/src/a.ts': "import { v } from '@quietvote/protocol/verify';\n" } }));
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /\[D6-DEEP\]/);
  const exposed = run(makeRepo({
    exportsMaps: { protocol: { '.': './src/index.ts', './verify': './src/verify.ts' } },
    files: { 'packages/server/src/a.ts': "import { v } from '@quietvote/protocol/verify';\n" },
  }));
  assert.equal(exposed.code, 0, exposed.stderr);
});

test('dynamic import(), require() and export-from are detected', () => {
  const result = run(makeRepo({
    files: {
      'packages/protocol/src/a.ts': "const m = await import('@quietvote/board');\n",
      'packages/board/src/b.ts': "const { s } = require('@quietvote/server');\n",
      'packages/crypto/src/c.ts': "export * from '@quietvote/protocol';\nexport { x } from '@quietvote/board';\n",
    },
  }), '--json');
  const found = violations(result).filter((v) => v.rule === 'D1-EDGE');
  assert.deepEqual(found.map((v) => `${v.file}:${v.line}`).sort(), [
    'packages/board/src/b.ts:1', 'packages/crypto/src/c.ts:1', 'packages/crypto/src/c.ts:2', 'packages/protocol/src/a.ts:1',
  ]);
});

test('imports inside comments, strings, template text and regex literals do not count', () => {
  const source = [
    "// import { x } from '@quietvote/server';",
    "/* import y from '@quietvote/cli'; */",
    "const a = \"import z from '@quietvote/web'\";",
    'const b = `import q from "@quietvote/trustee"`;',
    "const c = /import 'foo'/g;",
    "const d = x / 2; const e = \"it's\"; // don't confuse the scanner",
    "const f = `${1} import '@quietvote/server'`;",
    "import { real } from '@quietvote/crypto';",
    '',
  ].join('\n');
  const result = run(makeRepo({ files: { 'packages/protocol/src/a.ts': source } }));
  assert.equal(result.code, 0, result.stderr);
});

test('type-only imports count as edges (documented decision) and are marked kind=type by the scanner', () => {
  const found = findSpecifiers("import type { T } from '@quietvote/server';\nexport type { U } from '@quietvote/web';\nimport { type V } from '@quietvote/cli';\nlet x: import('@quietvote/trustee').T;\n");
  assert.deepEqual(found.map((f) => f.kind), ['type', 'type', 'static', 'dynamic']);
  const result = run(makeRepo({ files: { 'packages/board/src/a.ts': "import type { T } from '@quietvote/server';\n" } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /a\.ts:1: \[D1-EDGE\] board -> server is not allowed by the layer table \(type import/);
});

test('multi-line imports report the line of the specifier; tests and non-src files are ignored', () => {
  const result = run(makeRepo({
    files: {
      'packages/board/src/a.ts': "import {\n  a,\n  b,\n} from '@quietvote/server';\n",
      'packages/board/test/a.test.ts': "import '@quietvote/server';\n",
    },
  }), '--json');
  const found = violations(result).filter((v) => v.rule === 'D1-EDGE');
  assert.deepEqual(found.map((v) => `${v.file}:${v.line}`), ['packages/board/src/a.ts:4']);
  assert.ok(violations(result).every((v) => !v.file.includes('/test/')));
});

test('bin files are scanned', () => {
  const result = run(makeRepo({ files: { 'packages/protocol/bin/tool.ts': "import '@quietvote/server';\n" } }));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /protocol\/bin\/tool\.ts:1: \[D1-EDGE\]/);
});

test('non-literal dynamic import is a warning, not a pass-through error', () => {
  const result = run(makeRepo({ files: { 'packages/server/src/a.ts': 'const m = await import(`./x/${name}.ts`);\n' } }), '--json');
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).warnings.length, 1);
});

test('usage and internal errors exit 2', () => {
  assert.equal(spawnSync(process.execPath, [checker, '--bogus'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [checker, '--root'], { encoding: 'utf8' }).status, 2);
  const empty = mkdtempSync(join(tmpdir(), 'qv-check-deps-empty-'));
  try {
    assert.equal(spawnSync(process.execPath, [checker, '--root', empty], { encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('known deviations are a ratchet: listed ones are reported, new ones fail, stale entries fail', () => {
  const known = [{ rule: 'D1-EDGE', file: 'packages/protocol/src/logcheck.ts', specifier: '@quietvote/board', ref: 'D-97' }];
  const listed = { rule: 'D1-EDGE', file: 'packages/protocol/src/logcheck.ts', line: 11, message: 'm', specifier: '@quietvote/board' };
  const sameFileOtherTarget = { ...listed, specifier: '@quietvote/server' };
  const sameRuleOtherFile = { ...listed, file: 'packages/protocol/src/verify.ts' };
  const otherRule = { ...listed, rule: 'D7-UNDECLARED' };

  const all = classifyViolations([listed, sameFileOtherTarget, sameRuleOtherFile, otherRule], known);
  assert.deepEqual(all.known.map((v) => v.ref), ['D-97']);
  assert.deepEqual(all.unexpected, [sameFileOtherTarget, sameRuleOtherFile, otherRule], 'a known entry must not cover a different edge, file or rule');
  assert.deepEqual(all.stale, []);

  const fixed = classifyViolations([], known);
  assert.deepEqual(fixed.stale, known, 'an entry that matches nothing must be removed, not kept as a blanket waiver');
});

test('the shipped known-deviation list is small, specific and references a decision', () => {
  const shipped = loadKnownDeviations(resolve(import.meta.dirname, '..'));
  assert.ok(shipped.length <= 2, 'do not grow the list to silence findings');
  for (const k of shipped) {
    assert.match(k.rule, /^D\d-[A-Z]+$/);
    assert.match(k.file, /^packages\/[a-z]+\//);
    assert.match(k.ref, /^D-\d+$/);
    assert.ok(k.reason.length > 20);
  }
});

test('a malformed known-deviation file is an internal error (exit 2), never a pass', () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/deps-known-deviations.json'), JSON.stringify({ deviations: [{ rule: 'D1-EDGE' }] }));
    assert.equal(spawnSync(process.execPath, [checker, '--root', root], { encoding: 'utf8' }).status, 2);
    writeFileSync(join(root, 'scripts/deps-known-deviations.json'), '{not json');
    assert.equal(spawnSync(process.execPath, [checker, '--root', root], { encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real tree: no new violations and no stale known deviation', () => {
  const result = spawnSync(process.execPath, [checker, '--json'], { encoding: 'utf8' });
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.unexpected, []);
  assert.deepEqual(report.stale_known_deviations, []);
  assert.equal(result.status, 0);
});

