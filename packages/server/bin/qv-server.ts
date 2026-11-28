#!/usr/bin/env node
import type { QuietVoteServer } from '../src/app.ts';
import { readLauncherConfig } from '../src/launcher-config.ts';

const USAGE = 'Usage: qv-server --config FILE [--check-config] [--force-migrate-open]\n       qv-server --help\n';
const args = process.argv.slice(2);
function parse(): { path: string; check: boolean; forceMigrateOpen: boolean } | undefined {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(USAGE); return undefined; }
  let path: string | undefined;
  let check = false;
  let forceMigrateOpen = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && path === undefined && args[i + 1] && !args[i + 1]!.startsWith('-')) path = args[++i];
    else if (args[i] === '--check-config' && !check) check = true;
    else if (args[i] === '--force-migrate-open' && !forceMigrateOpen) forceMigrateOpen = true;
    else throw new Error('invalid arguments');
  }
  if (!path) throw new Error('--config is required');
  return { path, check, forceMigrateOpen };
}
let server: QuietVoteServer | undefined;
let launching = false;
let stopping: Promise<void> | undefined;
async function stop(): Promise<void> {
  stopping ??= (async () => {
    try { await server?.stop(); }
    finally { if (process.connected) process.disconnect(); }
  })();
  await stopping;
}
try {
  const parsed = parse();
  if (parsed) {
    const options = readLauncherConfig(parsed.path);
    options.forceMigrateOpen = parsed.forceMigrateOpen;
    if (parsed.check) process.stdout.write('configuration valid\n');
    else {
      launching = true;
      const { buildServer } = await import('../src/app.ts');
      server = buildServer(options);
      const starting = server.start();
      const shutdown = (): void => {
        void starting.catch(() => undefined).then(stop).catch(() => {
          process.stderr.write('qv-server: shutdown failed\n'); process.exitCode = 1;
        });
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      // Only a parent that explicitly created this IPC channel can send control messages.
      // Unlike child.kill('SIGTERM'), IPC permits the same cleanup to run on Windows.
      if (typeof process.send === 'function') {
        process.on('message', (message: unknown) => { if (message === 'qv-server:shutdown') shutdown(); });
      }
      const address = await starting;
      process.stdout.write(JSON.stringify({ event: 'listening', host: address.host, port: address.port }) + '\n');
    }
  }
} catch (error) {
  if (launching) {
    try { await stop(); } catch { /* preserve the startup failure */ }
    process.stderr.write('qv-server: startup failed\n');
    process.exitCode = 1;
  } else {
    // Parser/configuration errors contain field names only, never configuration contents or secrets.
    const message = error instanceof Error && (error.message.startsWith('invalid configuration field:') ||
      error.message.startsWith('configuration ') || error.message === 'unknown configuration field') ? error.message : 'invalid arguments or unreadable configuration';
    process.stderr.write(`qv-server: ${message}\n${USAGE}`);
    process.exitCode = 2;
  }
}
