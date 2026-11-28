// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { EXIT, type Io } from './io.ts';

export interface InstalledProgram { command: string; prefix: string[] }
export interface InstalledCommand {
  binary: 'qv-trustee' | 'qv-migrate-archive';
  packageName: '@quietvote/trustee' | '@quietvote/server';
  unavailable: string;
}

// Recognize npm's node cmd-shim form as data; never evaluate a batch wrapper.
const NPM_SHIM = [
  '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start',
  'SETLOCAL', 'CALL :find_dp0', '', 'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\{{target}}" %*', '',
].join('\n');

function npmShimTarget(directory: string, binary: InstalledCommand['binary']): string | undefined {
  const shim = join(directory, binary + '.cmd');
  try {
    if (statSync(shim).size > 64 * 1024) return undefined;
    const source = readFileSync(shim, 'utf8').replace(/\r\n/g, '\n');
    const match = /"%dp0%\\([^"\r\n]+)" %\*\n$/.exec(source);
    if (match === null || source !== NPM_SHIM.replace('{{target}}', () => match[1]!)) return undefined;
    return regularFile(resolve(directory, match[1]!.replace(/\\/g, sep)));
  } catch { return undefined; }
}

function regularFile(path: string): string | undefined {
  try { return statSync(path).isFile() ? realpathSync(path) : undefined; }
  catch { return undefined; }
}

/** Resolve the installed package beside an npm shim, without executing cmd.exe. */
function npmInstalled(directory: string, descriptor: InstalledCommand): InstalledProgram | undefined {
  const shimTarget = npmShimTarget(directory, descriptor.binary);
  if (shimTarget === undefined) return undefined;
  const local = basename(directory).toLowerCase() === '.bin' && basename(dirname(directory)).toLowerCase() === 'node_modules';
  for (const root of [local ? join(directory, '..', ...descriptor.packageName.split('/')) : join(directory, 'node_modules', ...descriptor.packageName.split('/'))]) {
    try {
      const metadata = join(root, 'package.json');
      if (!statSync(metadata).isFile() || statSync(metadata).size > 64 * 1024) continue;
      const pkg: unknown = JSON.parse(readFileSync(metadata, 'utf8'));
      if (typeof pkg !== 'object' || pkg === null || !('name' in pkg) || pkg.name !== descriptor.packageName || !('bin' in pkg)) continue;
      const bin = pkg.bin;
      if (typeof bin !== 'object' || bin === null || !Object.hasOwn(bin, descriptor.binary)) continue;
      const entry = (bin as Record<string, unknown>)[descriptor.binary];
      if (typeof entry !== 'string' || isAbsolute(entry)) continue;
      const target = regularFile(resolve(root, entry));
      if (target === undefined || target !== shimTarget) continue;
      const inside = relative(realpathSync(root), target);
      if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) continue;
      return { command: process.execPath, prefix: [target] };
    } catch { /* An unreadable or nonstandard installation is unavailable. */ }
  }
  return undefined;
}

/** PATH entries are trusted executable locations, as with invoking the separate installed command directly. */
export function installedProgram(descriptor: InstalledCommand, directories: readonly string[], platform: NodeJS.Platform = process.platform): InstalledProgram | undefined {
  for (const directory of directories) {
    if (platform !== 'win32') {
      const command = regularFile(join(directory, descriptor.binary));
      // Resolve npm's symlink before execution: an entry may check its real script path.
      if (command !== undefined) return { command, prefix: [] };
      continue;
    }
    const command = regularFile(join(directory, descriptor.binary + '.exe'));
    if (command !== undefined) return { command, prefix: [] };
    if (regularFile(join(directory, descriptor.binary + '.cmd')) !== undefined) return npmInstalled(directory, descriptor);
  }
  return undefined;
}

/** Separate installed process with native streams and unchanged bounded signal forwarding. */
export async function runInstalledCommand(descriptor: InstalledCommand, argv: string[], io: Io): Promise<number> {
  const unavailable = (): number => {
    io.err(descriptor.unavailable);
    return EXIT.input;
  };
  const path = process.env.PATH ?? process.env.Path ?? '';
  const directories = path.split(delimiter).map((p) => process.platform === 'win32' && p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p).filter((p) => p !== '');
  const program = path === '' ? undefined : installedProgram(descriptor, directories);
  if (program === undefined) return unavailable();
  return new Promise<number>((done) => {
    try {
      const child = spawn(program.command, [...program.prefix, ...argv], { stdio: 'inherit', shell: false });
      let timer: NodeJS.Timeout | undefined;
      let cancelled: number | undefined;
      let settled = false;
      const cancel = (signal: 'SIGINT' | 'SIGTERM'): void => {
        if (cancelled !== undefined) return;
        cancelled = 128 + constants.signals[signal];
        child.kill(signal);
        timer = setTimeout(() => { child.kill('SIGKILL'); }, 1000);
        timer.unref();
      };
      const interrupt = (): void => cancel('SIGINT');
      const terminate = (): void => cancel('SIGTERM');
      const finish = (code: number): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', terminate);
        done(code);
      };
      process.on('SIGINT', interrupt);
      process.on('SIGTERM', terminate);
      child.once('error', () => finish(unavailable()));
      child.once('close', (code, signal) => finish(cancelled ?? code ?? (signal === null ? EXIT.internal : 128 + constants.signals[signal])));
    } catch { done(unavailable()); }
  });
}
