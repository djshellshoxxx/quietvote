// SPDX-License-Identifier: AGPL-3.0-or-later
// Package-local native bridge: keep byte-identical in cli and trustee (drift-tested).
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_PRIVATE_FILE_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const SCRIPT = fileURLToPath(new URL('./windows-private-files.ps1', import.meta.url));
const CODES = new Set(['ENOENT', 'EEXIST', 'PATH', 'TYPE', 'IDENTITY', 'OWNER', 'ACL', 'SIZE', 'CHANGED', 'CLEANUP', 'UNAVAILABLE']);
const STARTUP_CODES = new Set(['ENOENT', 'EACCES', 'ENOEXEC', 'ENOTDIR']);
type HelperDiagnostic = 'STARTUP' | 'TIMEOUT' | 'PROCESS' | 'RESPONSE';
const OPERATIONS = ['service', 'read', 'write', 'reserve', 'bound', 'save', 'close'] as const;
type HelperOperation = typeof OPERATIONS[number];
type Reply = { ok: true; data?: string; bound?: boolean };
type Message = { op: HelperOperation; path?: string; max?: number; data?: string; replace?: boolean };

export class WindowsPrivateFileError extends Error {
  readonly code: string;
  readonly diagnostic: HelperDiagnostic | undefined;
  /** Pending reply only; does not establish whether a native write occurred. */
  readonly operation: HelperOperation | undefined;
  constructor(code = 'UNAVAILABLE', diagnostic?: HelperDiagnostic, operation?: HelperOperation) {
    super('native Windows private-file protection refused the operation' + (diagnostic ? ` (${diagnostic})` : ''));
    this.name = 'WindowsPrivateFileError';
    this.code = CODES.has(code) ? code : 'UNAVAILABLE';
    this.diagnostic = diagnostic;
    this.operation = operation !== undefined && OPERATIONS.includes(operation) ? operation : undefined;
  }
}

function command(): { file: string; args: string[]; cwd: string } {
  const root = process.env.SystemRoot;
  if (process.platform !== 'win32' || !root || !/^[A-Za-z]:[\\\\/]/.test(root) || root.includes('\0')) throw new WindowsPrivateFileError();
  // No PATH search, profile, shell, interpolated command text, or user data in argv.
  return { file: win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), cwd: root,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', SCRIPT] };
}
function limit(max: number): void {
  if (!Number.isSafeInteger(max) || max < 0 || max > MAX_PRIVATE_FILE_BYTES) throw new WindowsPrivateFileError('SIZE');
}
function input(message: Message): string { return JSON.stringify(message) + '\n'; }
function outputLimit(max: number): number { return Math.ceil(max / 3) * 4 + 1024; }
function reply(text: string): Reply {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new WindowsPrivateFileError('UNAVAILABLE', 'RESPONSE'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WindowsPrivateFileError('UNAVAILABLE', 'RESPONSE');
  const r = value as Record<string, unknown>;
  if (r.ok === false) throw new WindowsPrivateFileError(typeof r.code === 'string' ? r.code : undefined);
  if (r.ok !== true || Object.keys(r).some(k => !['ok', 'data', 'bound'].includes(k)) ||
      (r.data !== undefined && typeof r.data !== 'string') || (r.bound !== undefined && typeof r.bound !== 'boolean')) throw new WindowsPrivateFileError('UNAVAILABLE', 'RESPONSE');
  return r as Reply;
}
function failed(error: unknown): WindowsPrivateFileError {
  const details = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  try { reply(typeof details.stdout === 'string' ? details.stdout : ''); }
  catch (refusal) {
    // An explicit native refusal takes precedence over process metadata.
    if (refusal instanceof WindowsPrivateFileError && refusal.diagnostic === undefined) return refusal;
  }
  // Keep only a finite classification. Never retain the process error, which
  // can contain executable paths, argv, stderr, or input-derived data.
  const diagnostic = details.code === 'ETIMEDOUT' ? 'TIMEOUT'
    : typeof details.code === 'string' && STARTUP_CODES.has(details.code) ? 'STARTUP' : 'PROCESS';
  return new WindowsPrivateFileError('UNAVAILABLE', diagnostic);
}
function bytesFrom(r: Reply, max: number): Uint8Array {
  if (typeof r.data !== 'string' || r.data.length > outputLimit(max) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.data)) throw new WindowsPrivateFileError();
  const bytes = Buffer.from(r.data, 'base64');
  if (bytes.length > max || bytes.toString('base64') !== r.data) { bytes.fill(0); throw new WindowsPrivateFileError(); }
  return bytes;
}
function callSync(message: Message, maxOutput = 4096): Reply {
  const { file, args, cwd } = command();
  let result: string;
  try {
    result = execFileSync(file, args, { input: input(message), encoding: 'utf8', windowsHide: true, cwd,
      timeout: TIMEOUT_MS, maxBuffer: maxOutput, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) { throw failed(error); }
  return reply(result);
}
let service: Promise<HeldStream> | undefined;
let activeRequests = 0;
let retirement: NodeJS.Timeout | undefined;
let operations: Promise<unknown> = Promise.resolve();
function call(message: Message, maxOutput = 4096): Promise<Reply> {
  // A refusal terminates the native service. Acquire it only when this operation
  // reaches the queue head, so another caller cannot inherit that failed stream.
  // No issued operation, especially a possibly published write, is retried.
  const result = operations.then(() => dispatch(message, maxOutput));
  operations = result.catch(() => undefined);
  return result;
}
async function dispatch(message: Message, maxOutput: number): Promise<Reply> {
  clearTimeout(retirement);
  const shared = service ??= (async () => {
    const stream = new HeldStream();
    try { await stream.send({ op: 'service' }); return stream; }
    catch (error) { await stream.close(); throw error; }
  })();
  activeRequests++;
  let stream: HeldStream | undefined;
  try { stream = await shared; return await stream.send(message, maxOutput); }
  catch (error) {
    if (service === shared) service = undefined;
    await stream?.close();
    throw error;
  } finally {
    activeRequests--;
    if (activeRequests === 0 && service === shared && stream) {
      const idle = stream;
      idle.reference(false); // An idle helper must not keep a completed CLI or test process alive.
      retirement = setTimeout(() => {
        if (activeRequests === 0 && service === shared) { service = undefined; void idle.close().catch(() => undefined); }
      }, 30_000);
      retirement.unref();
    }
  }
}

// Anchor each request to the caller cwd; a reused native service may have an older cwd.
export function readWindowsPrivateFileSync(path: string, max = MAX_PRIVATE_FILE_BYTES): Uint8Array {
  limit(max);
  return bytesFrom(callSync({ op: 'read', path: win32.resolve(path), max }, outputLimit(max)), max);
}
export async function readWindowsPrivateFile(path: string, max = MAX_PRIVATE_FILE_BYTES): Promise<Uint8Array> {
  limit(max);
  return bytesFrom(await call({ op: 'read', path: win32.resolve(path), max }, outputLimit(max)), max);
}
export function writeWindowsPrivateFileSync(path: string, data: Uint8Array, replace = false): void {
  limit(data.byteLength);
  const r = callSync({ op: 'write', path: win32.resolve(path), data: Buffer.from(data).toString('base64'), replace });
  if (Object.keys(r).join(',') !== 'ok') throw new WindowsPrivateFileError();
}
export async function writeWindowsPrivateFile(path: string, data: Uint8Array, replace = false): Promise<void> {
  limit(data.byteLength);
  const r = await call({ op: 'write', path: win32.resolve(path), data: Buffer.from(data).toString('base64'), replace });
  if (Object.keys(r).join(',') !== 'ok') throw new WindowsPrivateFileError();
}

/** One child owns one native FileStream until close. No path re-open supplies or receives secret bytes. */
class HeldStream {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly closed: Promise<void>;
  private waiting: { resolve(value: Reply): void; reject(error: Error): void; timer: NodeJS.Timeout; max: number } | undefined;
  private buffered: string[] = [];
  private bufferedBytes = 0;
  private failure: WindowsPrivateFileError | undefined;
  private serial: Promise<unknown> = Promise.resolve();

  constructor() {
    const { file, args, cwd } = command();
    // Every request already carries an absolute caller-anchored path. Do not
    // keep a user directory busy merely because it was cwd when a helper began.
    this.child = spawn(file, args, { windowsHide: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.closed = new Promise(resolve => this.child.once('close', () => resolve()));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      const waiting = this.waiting;
      if (!waiting) { this.abort(); return; }
      this.bufferedBytes += Buffer.byteLength(chunk);
      if (this.bufferedBytes > waiting.max) { this.abort(); return; }
      const end = chunk.indexOf('\n');
      if (end < 0) { this.buffered.push(chunk); return; }
      const line = this.buffered.join('') + chunk.slice(0, end);
      const rest = chunk.slice(end + 1);
      this.buffered = [];
      this.bufferedBytes = 0;
      clearTimeout(waiting.timer);
      this.waiting = undefined;
      try {
        if (rest.trim() !== '') throw new WindowsPrivateFileError();
        waiting.resolve(reply(line));
      } catch (error) {
        waiting.reject(error instanceof WindowsPrivateFileError ? error : new WindowsPrivateFileError());
        this.abort();
      }
    });
    this.child.stderr.on('data', () => { /* never relay native diagnostics, paths or input to terminal output */ });
    this.child.on('error', () => this.abort());
    // 'exit' can precede the last stdout frame; 'close' follows stdio drainage.
    this.child.on('close', () => this.abort());
    this.child.stdin.on('error', () => this.abort());
  }

  private abort(diagnostic?: HelperDiagnostic, operation?: HelperOperation): void {
    if (this.failure) return;
    this.failure = new WindowsPrivateFileError('UNAVAILABLE', diagnostic, operation);
    if (this.waiting) {
      clearTimeout(this.waiting.timer);
      this.waiting.reject(this.failure);
      this.waiting = undefined;
    }
    this.buffered = [];
    this.bufferedBytes = 0;
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.child.kill();
  }
  reference(enabled: boolean): void {
    if (enabled) this.child.ref(); else this.child.unref();
    for (const stream of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      const pipe = stream as typeof stream & { ref(): void; unref(): void };
      if (enabled) pipe.ref(); else pipe.unref();
    }
  }
  send(message: Message, max = 4096): Promise<Reply> {
    const result = this.serial.then(() => new Promise<Reply>((resolve, reject) => {
      if (this.failure) { reject(this.failure); return; }
      this.reference(true);
      // Capture only the fixed operation, never the request's path/private data.
      const operation = message.op;
      const timer = setTimeout(() => this.abort('TIMEOUT', operation), TIMEOUT_MS);
      this.waiting = { resolve, reject, timer, max };
      this.child.stdin.write(input(message));
    }));
    this.serial = result.catch(() => undefined);
    return result;
  }
  async close(): Promise<void> {
    try { if (!this.failure) await this.send({ op: 'close' }); }
    finally {
      this.child.stdin.end(); this.abort();
      // An acknowledgement precedes process exit. Return only once native
      // handles/cwd and stdio have closed, with bounded refusal if termination fails.
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([this.closed, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new WindowsPrivateFileError('CLEANUP')), TIMEOUT_MS);
        })]);
      } finally { clearTimeout(timer); }
    }
  }
}

export interface WindowsPrivateReservation {
  bound(): Promise<boolean>;
  save(bytes: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array>;
  close(): Promise<void>;
}
export async function reserveWindowsPrivateFile(path: string, max: number): Promise<WindowsPrivateReservation> {
  limit(max);
  const stream = new HeldStream();
  try {
    const opened = await stream.send({ op: 'reserve', path: win32.resolve(path), max });
    if (Object.keys(opened).join(',') !== 'ok') throw new WindowsPrivateFileError();
  } catch (error) { await stream.close(); throw error; }
  return {
    async bound() {
      try { const r = await stream.send({ op: 'bound' }); return r.bound === true && r.data === undefined; }
      catch { return false; }
    },
    async save(bytes) {
      if (bytes.byteLength > max) throw new WindowsPrivateFileError('SIZE');
      const r = await stream.send({ op: 'save', data: Buffer.from(bytes).toString('base64') });
      if (Object.keys(r).join(',') !== 'ok') throw new WindowsPrivateFileError();
    },
    async read() { return bytesFrom(await stream.send({ op: 'read' }, outputLimit(max)), max); },
    close: () => stream.close(),
  };
}
