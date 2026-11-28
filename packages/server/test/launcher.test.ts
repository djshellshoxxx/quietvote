import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/qv-server.ts', import.meta.url));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'qv-launcher-'));
  const path = join(dir, 'server.json');
  const dataDir = join(dir, 'data');
  const config = { dataDir, publicUrl: 'http://127.0.0.1:8080', registrationMode: 'closed', port: 0 };
  return { dir, path, dataDir, config, write(value: unknown = config) { writeFileSync(path, JSON.stringify(value)); } };
}
function run(args: string[]) { return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', timeout: 15_000 }); }

test('launcher validates configuration without creating data or exposing tokens', () => {
  const f = fixture();
  try {
    f.write({ ...f.config, registrationMode: 'token', registrationTokens: ['secret-token-do-not-log'] });
    const result = run(['--config', f.path, '--check-config']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /configuration valid/);
    assert.equal(existsSync(f.dataDir), false);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-token-do-not-log/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('launcher rejects missing, duplicate and unknown arguments', () => {
  for (const args of [[], ['--config'], ['--config', 'a', '--config', 'b'], ['--wat'], ['--help', 'stray'], ['--check-config']]) {
    const result = run(args);
    assert.equal(result.status, 2, JSON.stringify(args) + result.stderr);
  }
  assert.equal(run(['--help']).status, 0);
});

test('launcher rejects malformed and unsafe configuration before data creation', () => {
  const f = fixture();
  try {
    const cases: unknown[] = [null, [], {}, { ...f.config, dataDir: '' }, { ...f.config, dataDir: './relative' },
      { ...f.config, publicUrl: 'https://example.com/path' }, { ...f.config, publicUrl: 'https://user:pass@example.com' },
      { ...f.config, publicUrl: 'ftp://example.com' }, { ...f.config, publicUrl: 'https://example.com/' },
      { ...f.config, registrationMode: 'automatic' }, { ...f.config, port: 3.5 }, { ...f.config, port: 65536 },
      { ...f.config, mystery: true }, { ...f.config, now: 0 }, { ...f.config, registrationMode: 'token' },
      { ...f.config, allowedOrigins: ['https://example.com/path'] }, { ...f.config, adminKeys: ['bad'] },
      { ...f.config, maxBallotBytes: 999999999 }, { ...f.config, registrationTokens: [42] },
      { ...f.config, rate: { proof: { limit: 0, windowSec: 1 } } },
      { ...f.config, rate: { madeUp: { limit: 1, windowSec: 1 } } },
      { ...f.config, witnesses: [{ name: 'bad', publicKey: 'bad' }] }];
    for (const config of cases) {
      f.write(config);
      const result = run(['--config', f.path, '--check-config']);
      assert.equal(result.status, 2, JSON.stringify(config) + result.stderr);
      assert.equal(existsSync(f.dataDir), false);
    }
    writeFileSync(f.path, '{"dataDir":"first","dataDir":"second"}');
    assert.equal(run(['--config', f.path, '--check-config']).status, 2);
    writeFileSync(f.path, ' '.repeat(65537));
    assert.equal(run(['--config', f.path, '--check-config']).status, 2);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

// Windows child.kill() terminates the process without delivering its JS signal handlers.
// Exercise the parent IPC contract everywhere and retain real SIGTERM coverage on POSIX.
for (const control of process.platform === 'win32' ? ['IPC'] : ['SIGTERM', 'IPC']) {
  test(`launcher starts actual server, answers readiness and stops on ${control}`, { timeout: 20_000 }, async (t) => {
    const f = fixture();
    f.write();
    const child = spawn(process.execPath, [bin, '--config', f.path], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const stdout = child.stdout;
    assert.ok(stdout && child.stderr);
    t.after(() => { child.kill('SIGKILL'); });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const exited = once(child, 'exit');
    const closed = once(child, 'close');
    try {
      const address = await new Promise<{ host: string; port: number }>((resolve, reject) => {
        let output = '';
        stdout.setEncoding('utf8').on('data', (chunk: string) => {
          output += chunk;
          const line = output.split('\n').find((s) => s.startsWith('{'));
          if (line) { try { resolve(JSON.parse(line)); } catch (e) { reject(e); } }
        });
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`server exited ${code}: ${stderr}`)));
      });
      if (control === 'IPC') {
        child.send('unrecognized message');
        child.send({ type: 'qv-server:shutdown' }); // Only the exact string is a control request.
      }
      assert.equal((await fetch(`http://${address.host}:${address.port}/readyz`)).status, 200);
      assert.equal(existsSync(join(f.dataDir, 'control.sqlite')), true);
      if (control === 'IPC') child.send('qv-server:shutdown');
      else child.kill('SIGTERM');
      const [code, signal] = await exited;
      await closed;
      assert.equal(code, 0, stderr);
      assert.equal(signal, null);
      // Verifies QV-27-REQ-006 without adding non-JSON text to the listening stream.
      assert.equal(stderr.split('\n').filter((line) => line === 'Experimental — not for binding elections').length, 1);
      assert.equal(existsSync(join(f.dataDir, '.qv-server.lock')), false, 'cleanup releases ownership before exit');
    } finally { child.kill('SIGKILL'); await exited; rmSync(f.dir, { recursive: true, force: true }); }
  });
}

test('launcher with parent IPC exits after listen failure and releases ownership', { timeout: 20_000 }, async (t) => {
  const f = fixture();
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const address = occupied.address();
  assert.ok(address && typeof address !== 'string');
  f.write({ ...f.config, host: '127.0.0.1', port: address.port });
  const child = spawn(process.execPath, [bin, '--config', f.path], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  t.after(() => { child.kill('SIGKILL'); });
  const exited = once(child, 'exit');
  let stderr = '';
  assert.ok(child.stderr);
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
  try {
    assert.deepEqual(await exited, [1, null], stderr);
    assert.match(stderr, /startup failed/);
    assert.equal(existsSync(join(f.dataDir, '.qv-server.lock')), false);
  } finally {
    child.kill('SIGKILL');
    await exited;
    await new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
    rmSync(f.dir, { recursive: true, force: true });
  }
});


test('launcher reports construction failures as startup failures', () => {
  const f = fixture();
  try {
    f.write({ ...f.config, staticDir: join(f.dir, 'missing-assets') });
    assert.equal(run(['--config', f.path, '--check-config']).status, 0);
    const result = run(['--config', f.path]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /startup failed/);
    assert.doesNotMatch(result.stderr, /missing-assets/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
