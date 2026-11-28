import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cmdTrustee, trusteeProgram } from '../src/cmd-trustee.ts';
import { nodeIo } from '../src/io.ts';

const bin = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));
const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const trustee = join(packageRoot, 'packages/trustee/src/cli.ts');

function fixture(body: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), 'qv trustee '));
  const path = join(root, 'node_modules/.bin');
  mkdirSync(path, { recursive: true });
  if (process.platform === 'win32') npmFixture(root, false, body);
  else {
    const program = join(path, 'qv-trustee');
    writeFileSync(program, `#!/usr/bin/env node\n${body}`, { mode: 0o755 });
    chmodSync(program, 0o755);
  }
  return { root, path };
}

function npmFixture(root: string, global: boolean, body = 'process.exitCode = 0;'): { path: string; target: string } {
  const path = global ? root : join(root, 'node_modules/.bin');
  const pkg = join(root, 'node_modules/@quietvote/trustee');
  mkdirSync(path, { recursive: true });
  mkdirSync(join(pkg, 'src'), { recursive: true });
  // Generated with npm 11.19.1's cmd-shim; ordinary local/global node launcher bytes.
  const shim = readFileSync(new URL('./fixtures/trustee-npm-shim.cmd.txt', import.meta.url), 'utf8');
  writeFileSync(join(path, 'qv-trustee.cmd'), global ? shim.replace('..\\@quietvote', 'node_modules\\@quietvote') : shim);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@quietvote/trustee', bin: { 'qv-trustee': './src/cli.cjs' } }));
  const target = join(pkg, 'src/cli.cjs');
  writeFileSync(target, body);
  return { path, target };
}

function run(path: string, args: string[], input = '') {
  return spawnSync(process.execPath, [bin, 'trustee', ...args], {
    encoding: 'utf8', input, timeout: 20_000,
    env: { ...process.env, PATH: [path, dirname(process.execPath)].join(delimiter), NODE_NO_WARNINGS: '1' },
  });
}

test('trustee passthrough preserves literal arguments, inherited streams and child exit code', (t) => {
  const f = fixture(`const fs = require('node:fs');
process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\\n');
process.stdout.write(fs.readFileSync(0));
process.stderr.write('trustee fixture diagnostic\\n');
process.exitCode = 40;
`);
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const args = ['status', '--bundle', 'bundle with spaces é.qvtb', '--passphrase-file', 'private file.txt', '--help'];
  const input = 'synthetic input\u0000bytes\n';
  const r = run(f.path, args, input);
  assert.equal(r.error, undefined);
  assert.equal(r.status, 40);
  assert.equal(r.stdout, JSON.stringify(args) + '\n' + input);
  assert.equal(r.stderr, 'trustee fixture diagnostic\n');
});

test('trustee missing program returns bounded input error without echoing arguments', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv trustee missing '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const r = run(root, ['status', '--bundle', 'private-path-not-for-errors']);
  assert.equal(r.status, 4);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot start qv-trustee/);
  assert.doesNotMatch(r.stderr, /private-path-not-for-errors/);
});

test('trustee launch failure returns bounded input error without echoing arguments', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv trustee launch '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, process.platform === 'win32' ? 'qv-trustee.exe' : 'qv-trustee'), 'ordinary unlaunchable fixture\n', { mode: 0o600 });
  const r = run(root, ['status', '--bundle', 'withheld-input-path']);
  assert.equal(r.status, 4);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot start qv-trustee/);
  assert.doesNotMatch(r.stderr, /withheld-input-path|ordinary unlaunchable/);
});

test('trustee real installed help and usage delegate to the existing offline entrypoint', () => {
  const path = join(packageRoot, 'node_modules/.bin');
  for (const args of [['help'], ['status'], ['--help'], []]) {
    const direct = spawnSync(process.execPath, [trustee, ...args], { encoding: 'utf8', timeout: 20_000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
    const delegated = run(path, args);
    assert.equal(direct.error, undefined);
    assert.equal(delegated.error, undefined);
    assert.equal(delegated.status, direct.status);
    assert.equal(delegated.stdout, direct.stdout);
    assert.equal(delegated.stderr, direct.stderr);
    assert.ok(delegated.stdout.length + delegated.stderr.length > 0, 'the symlinked entry must actually run');
  }
});

test('trustee npm shim resolves only its associated local or global package', (t) => {
  for (const global of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'qv trustee npm '));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const f = npmFixture(root, global, 'process.stdout.write("fixture trustee"); process.exitCode = 20;');
    const p = trusteeProgram([f.path], 'win32');
    assert.deepEqual(p, { command: process.execPath, prefix: [realpathSync(f.target)] });
    const child = spawnSync(p.command, p.prefix, { encoding: 'utf8' });
    assert.equal(child.status, 20);
    assert.equal(child.stdout, 'fixture trustee');
    writeFileSync(join(root, 'node_modules/@quietvote/trustee/package.json'), JSON.stringify({ name: 'another-package', bin: { 'qv-trustee': './src/cli.cjs' } }));
    assert.equal(trusteeProgram([f.path], 'win32'), undefined);
  }
});

test('trustee unrecognized Windows shim refuses instead of falling through to another installation', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv trustee shim '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = npmFixture(join(root, 'valid'), true);
  writeFileSync(join(root, 'qv-trustee.cmd'), '@REM custom command\n');
  assert.equal(trusteeProgram([root, f.path], 'win32'), undefined);
});

test('trustee npm resolution binds the actual shim target and refuses an unrelated sibling installation', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'qv trustee layouts '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const local = npmFixture(root, false);
  assert.ok(trusteeProgram([local.path], 'win32'));
  const unrelated = join(root, 'node_modules/another-prefix');
  mkdirSync(unrelated);
  const shim = readFileSync(join(local.path, 'qv-trustee.cmd'), 'utf8');
  writeFileSync(join(unrelated, 'qv-trustee.cmd'), shim);
  assert.equal(trusteeProgram([unrelated], 'win32'), undefined);
  writeFileSync(join(root, 'node_modules/@quietvote/trustee/src/other.cjs'), 'process.exitCode = 0;');
  writeFileSync(join(local.path, 'qv-trustee.cmd'), shim.replace('cli.cjs', 'other.cjs'));
  assert.equal(trusteeProgram([local.path], 'win32'), undefined);
  writeFileSync(join(local.path, 'qv-trustee.cmd'), '@REM custom wrapper\n' + shim);
  assert.equal(trusteeProgram([local.path], 'win32'), undefined);
});

test('trustee parent cancellation forwards to child and bounds an unresponsive child', { skip: process.platform === 'win32', timeout: 15_000 }, async (t) => {
  for (const graceful of [true, false]) {
    const f = fixture(`process.on('SIGTERM', () => { ${graceful ? 'process.stdout.write("stopped\\n"); process.exit(0);' : ''} });
setInterval(() => {}, 10_000); process.stdout.write('ready\\n');\n`);
    t.after(() => rmSync(f.root, { recursive: true, force: true }));
    const child = spawn(process.execPath, [bin, 'trustee'], {
      env: { ...process.env, PATH: [f.path, dirname(process.execPath)].join(delimiter), NODE_NO_WARNINGS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { output += chunk; });
    await once(child.stdout, 'data');
    assert.match(output, /ready/);
    const completion = once(child, 'close');
    child.kill('SIGTERM');
    const [code] = await completion;
    assert.equal(code, 128 + constants.signals.SIGTERM);
    assert.equal(output, graceful ? 'ready\nstopped\n' : 'ready\n');
  }
});

test('trustee completion restores caller signal listeners', async (t) => {
  const f = fixture('process.exitCode = 0;');
  const old = process.env.PATH;
  t.after(() => { process.env.PATH = old; rmSync(f.root, { recursive: true, force: true }); });
  process.env.PATH = [f.path, dirname(process.execPath)].join(delimiter);
  const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal));
  assert.equal(await cmdTrustee([], nodeIo()), 0);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)), before);
});

test('trustee process terminated by signal never reports success', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture('process.kill(process.pid, "SIGTERM");\n');
  t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const r = run(f.path, []);
  assert.equal(r.status, 128 + constants.signals.SIGTERM);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});

test('trustee delegation adds no in-process trustee import', () => {
  const source = readFileSync(new URL('../src/cmd-trustee.ts', import.meta.url), 'utf8') +
    readFileSync(new URL('../src/installed-command.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:from|import\s*\(|require\s*\()\s*['"][^'"]*trustee/);
  assert.match(source, /stdio: 'inherit', shell: false/);
});
