// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-010
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { archiveMigrationProgram } from '../src/cmd-migrate-archive.ts';

const binary = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));
const repository = fileURLToPath(new URL('../../..', import.meta.url));
const migration = join(repository, 'packages/server/bin/qv-migrate-archive.ts');

function npmFixture(root: string, global: boolean, body = 'process.exitCode = 0;'): { path: string; target: string } {
  const path = global ? root : join(root, 'node_modules/.bin'), pkg = join(root, 'node_modules/@quietvote/server');
  mkdirSync(path, { recursive: true }); mkdirSync(join(pkg, 'bin'), { recursive: true });
  // Reuse the exact supported npm wrapper grammar, with this package's own declared target.
  let shim = readFileSync(new URL('./fixtures/trustee-npm-shim.cmd.txt', import.meta.url), 'utf8')
    .replace('trustee\\src\\cli.cjs', 'server\\bin\\qv-migrate-archive.cjs');
  if (global) shim = shim.replace('..\\@quietvote', 'node_modules\\@quietvote');
  writeFileSync(join(path, 'qv-migrate-archive.cmd'), shim);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@quietvote/server', bin: { 'qv-migrate-archive': './bin/qv-migrate-archive.cjs' } }));
  const target = join(pkg, 'bin/qv-migrate-archive.cjs'); writeFileSync(target, body);
  return { path, target };
}
function fixture(body: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'qv archive delegate ')), path = join(root, 'node_modules/.bin');
  mkdirSync(path, { recursive: true });
  if (process.platform === 'win32') npmFixture(root, false, body);
  else {
    const target = join(path, 'qv-migrate-archive');
    writeFileSync(target, `#!/usr/bin/env node\n${body}`, { mode: 0o755 }); chmodSync(target, 0o755);
  }
  return { root, path };
}
function run(path: string, args: string[], input = '') {
  return spawnSync(process.execPath, [binary, 'migrate-archive', ...args], { encoding: 'utf8', input, timeout: 20_000,
    env: { ...process.env, PATH: [path, dirname(process.execPath)].join(delimiter), NODE_NO_WARNINGS: '1' } });
}

test('archive migration delegation preserves literal arguments, inherited streams and maintenance exit status', (t) => {
  const f = fixture("process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\\n'); process.stdout.write(require('node:fs').readFileSync(0)); process.stderr.write('maintenance fixture\\n'); process.exitCode = 23;");
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const args = ['--data-dir', 'directory with spaces é; $() & ^ %PATH%', '--election', 'ab'.repeat(16), '--help'];
  const input = 'synthetic input\u0000bytes\n', result = run(f.path, args, input);
  assert.equal(result.error, undefined); assert.equal(result.status, 23);
  assert.equal(result.stdout, JSON.stringify(args) + '\n' + input); assert.equal(result.stderr, 'maintenance fixture\n');
});

for (const state of ['missing', 'unlaunchable'] as const) test(`archive migration ${state} binary returns a bounded error without input echo`, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv archive missing '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (state === 'unlaunchable') writeFileSync(join(root, process.platform === 'win32' ? 'qv-migrate-archive.exe' : 'qv-migrate-archive'), 'unlaunchable fixture\n', { mode: 0o600 });
  const result = run(root, ['--data-dir', 'withheld-input-directory']);
  assert.equal(result.status, 4); assert.equal(result.stdout, ''); assert.match(result.stderr, /cannot start qv-migrate-archive/);
  assert.doesNotMatch(result.stderr, /withheld-input-directory|unlaunchable fixture/);
});

test('archive migration installed help and strict usage match the standalone server binary', () => {
  for (const args of [['--help'], [], ['--json'], ['--election', 'bad'], ['--help', '--json']]) {
    const direct = spawnSync(process.execPath, [migration, ...args], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    const delegated = run(join(repository, 'node_modules/.bin'), args);
    assert.equal(direct.error, undefined); assert.equal(delegated.error, undefined);
    assert.equal(delegated.status, direct.status); assert.equal(delegated.stdout, direct.stdout); assert.equal(delegated.stderr, direct.stderr);
    assert.ok(delegated.stdout.length + delegated.stderr.length > 0);
  }
});

test('archive migration Windows npm shim binds the actual local/global server package binary', (t) => {
  for (const global of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'qv archive npm ')); t.after(() => rmSync(root, { recursive: true, force: true }));
    const f = npmFixture(root, global, 'process.stdout.write("archive fixture"); process.exitCode = 19;');
    const program = archiveMigrationProgram([f.path], 'win32');
    assert.deepEqual(program, { command: process.execPath, prefix: [realpathSync(f.target)] });
    const result = spawnSync(program.command, program.prefix, { encoding: 'utf8' });
    assert.equal(result.status, 19); assert.equal(result.stdout, 'archive fixture');
    writeFileSync(join(root, 'node_modules/@quietvote/server/package.json'), JSON.stringify({ name: '@quietvote/trustee', bin: { 'qv-migrate-archive': './bin/qv-migrate-archive.cjs' } }));
    assert.equal(archiveMigrationProgram([f.path], 'win32'), undefined);
  }
});

test('archive migration custom Windows wrapper refuses without falling through to a different installation', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv archive wrapper ')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = npmFixture(join(root, 'valid'), true);
  writeFileSync(join(root, 'qv-migrate-archive.cmd'), '@REM custom wrapper\n');
  assert.equal(archiveMigrationProgram([root, f.path], 'win32'), undefined);
});

test('archive migration shim and package metadata must agree on the exact target', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv archive target ')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = npmFixture(root, false), shim = join(f.path, 'qv-migrate-archive.cmd');
  writeFileSync(join(root, 'node_modules/@quietvote/server/bin/other.cjs'), 'process.exitCode = 0;');
  writeFileSync(shim, readFileSync(shim, 'utf8').replace('qv-migrate-archive.cjs', 'other.cjs'));
  assert.equal(archiveMigrationProgram([f.path], 'win32'), undefined);
});

test('archive delegation adds no server import or CLI package dependency and preserves shell-free execution', () => {
  const source = readFileSync(new URL('../src/cmd-migrate-archive.ts', import.meta.url), 'utf8') +
    readFileSync(new URL('../src/installed-command.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:from|import\s*\(|require\s*\()\s*['"][^'"]*server/);
  assert.match(source, /stdio: 'inherit', shell: false/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, unknown> };
  assert.equal(Object.hasOwn(pkg.dependencies, '@quietvote/server'), false);
});
