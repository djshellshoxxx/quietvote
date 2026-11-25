import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/app.ts';

const LOCK = '.qv-server.lock';
const options = (dataDir: string) => ({ dataDir, registrationMode: 'closed' as const, retentionSweepMs: 0, logSink: () => undefined });

test('data lock excludes a second server and is released after complete stop', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-lock-'));
  const first = buildServer(options(dir));
  try {
    const key = readFileSync(join(dir, 'kek/kek.bin'));
    assert.throws(() => buildServer(options(dir)), /data directory.*locked/i);
    assert.deepEqual(readFileSync(join(dir, 'kek/kek.bin')), key);
    await first.start();
    await first.stop();
    await first.stop();
    const next = buildServer(options(dir));
    await next.start();
    await next.stop();
    await assert.rejects(first.start(), /stopped/i);
  } finally {
    await first.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock exists before any database or KEK access; stale locks fail closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-lock-stale-'));
  mkdirSync(join(dir, LOCK));
  try {
    assert.throws(() => buildServer(options(dir)), /data directory.*locked/i);
    assert.deepEqual(readdirSync(dir), [LOCK]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('construction failure releases the lock and closes the control database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-lock-build-'));
  try {
    assert.throws(() => buildServer({ ...options(dir), adminKeys: ['not-a-key'] }));
    assert.equal(existsSync(join(dir, LOCK)), false);
    assert.throws(() => buildServer({ ...options(dir), staticDir: join(dir, 'missing-assets') }));
    assert.equal(existsSync(join(dir, LOCK)), false);
    const next = buildServer(options(dir));
    await next.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('listen failure releases the lock after shutting down', async () => {
  const a = mkdtempSync(join(tmpdir(), 'qv-lock-port-a-'));
  const b = mkdtempSync(join(tmpdir(), 'qv-lock-port-b-'));
  const first = buildServer(options(a));
  let second: ReturnType<typeof buildServer> | undefined;
  try {
    const address = await first.start();
    second = buildServer({ ...options(b), port: address.port });
    await assert.rejects(second.start(), /EADDRINUSE/);
    assert.equal(existsSync(join(b, LOCK)), false);
    const retry = buildServer(options(b));
    await retry.stop();
  } finally {
    await second?.stop();
    await first.stop();
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('symlink aliases resolve to the same locked data directory', { skip: process.platform === 'win32' }, async () => {
  const parent = mkdtempSync(join(tmpdir(), 'qv-lock-alias-'));
  const dir = join(parent, 'real');
  const alias = join(parent, 'alias');
  mkdirSync(dir);
  symlinkSync(dir, alias, 'dir');
  const first = buildServer(options(dir));
  try { assert.throws(() => buildServer(options(alias)), /data directory.*locked/i); }
  finally { await first.stop(); rmSync(parent, { recursive: true, force: true }); }
});

test('another process cannot open a live server data directory', { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-lock-process-'));
  const moduleUrl = new URL('../src/app.ts', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { buildServer } from ${JSON.stringify(moduleUrl)};
    const server = buildServer({ dataDir: process.argv[1], registrationMode: 'closed', logSink: () => {} });
    await server.start();
    process.on('message', async (message) => {
      if (message === 'stop') { await server.stop(); process.exit(0); }
    });
    process.send('ready');
  `, dir], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  try {
    await Promise.race([
      once(child, 'message'),
      exited.then(() => { throw new Error(`lock child exited early: ${stderr}`); }),
    ]);
    assert.throws(() => buildServer(options(dir)), /data directory.*locked/i);
    child.send('stop');
    assert.deepEqual(await exited, [0, null]);
    const next = buildServer(options(dir));
    await next.stop();
  } finally {
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
    rmSync(dir, { recursive: true, force: true });
  }
});
