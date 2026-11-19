// SPDX-License-Identifier: AGPL-3.0-or-later
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, ftruncateSync, linkSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeSync, type BigIntStats } from 'node:fs';
import { dirname } from 'node:path';
import { MAX_PRIVATE_FILE_BYTES, readWindowsPrivateFile, readWindowsPrivateFileSync, reserveWindowsPrivateFile, writeWindowsPrivateFileSync } from './windows-private-files.ts';
import { createPosixStage } from './posix-staging.ts';

function safe(stat: BigIntStats, links = 1n): boolean {
  return stat.isFile() && stat.nlink === links && (stat.mode & 0o077n) === 0n &&
    (process.geteuid === undefined || stat.uid === BigInt(process.geteuid()));
}
function same(a: BigIntStats, b: BigIntStats): boolean { return a.dev === b.dev && a.ino === b.ino; }
function maximum(max: number): void {
  if (!Number.isSafeInteger(max) || max < 0 || max > MAX_PRIVATE_FILE_BYTES) throw new Error('private file exceeds its size limit');
}

export async function readPrivateFile(path: string, max = MAX_PRIVATE_FILE_BYTES): Promise<Uint8Array> {
  maximum(max);
  return process.platform === 'win32' ? readWindowsPrivateFile(path, max) : readPrivateFileSync(path, max);
}

/** Validate ownership, permissions, identity and size on the descriptor that supplies all bytes. */
export function readPrivateFileSync(path: string, max = MAX_PRIVATE_FILE_BYTES): Uint8Array {
  maximum(max);
  if (process.platform === 'win32') return readWindowsPrivateFileSync(path, max);
  let fd: number | undefined;
  let bytes: Buffer | undefined;
  try {
    const named = lstatSync(path, { bigint: true });
    if (!named.isFile() || named.nlink !== 1n) throw new Error('private input must be a regular file without aliases');
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!safe(before) || !same(named, before) || before.size > BigInt(max)) throw new Error('private input must be bounded and owner-only');
    bytes = Buffer.alloc(Number(before.size) + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (n === 0) break;
      size += n;
    }
    const after = fstatSync(fd, { bigint: true });
    if (BigInt(size) !== before.size || !safe(after) || !same(before, after) || after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs || !same(after, lstatSync(path, { bigint: true }))) throw new Error('private input changed while reading');
    return bytes.subarray(0, size);
  } catch (error) { bytes?.fill(0); throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Publish a fully flushed private file; exclusive by default, with no secret writes through an old path. */
export function writePrivateFileSync(path: string, data: Uint8Array | string, replace = false): void {
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  maximum(bytes.byteLength);
  if (process.platform === 'win32') { writeWindowsPrivateFileSync(path, bytes, replace); return; }
  const stage = createPosixStage(path);
  path = stage.output;
  const temp = stage.temporary;
  let fd: number | undefined;
  let made: BigIntStats | undefined;
  try {
    if (replace) {
      try { if (!lstatSync(path).isFile()) throw Object.assign(new Error('private output must not replace a link or nonregular file'), { code: 'TYPE' }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    fchmodSync(fd, 0o600);
    made = fstatSync(fd, { bigint: true });
    if (!safe(made)) throw new Error('private output creation failed');
    let offset = 0;
    while (offset < bytes.byteLength) {
      const wrote = writeSync(fd, bytes, offset, bytes.byteLength - offset, offset);
      if (wrote === 0) throw new Error('private output write made no progress');
      offset += wrote;
    }
    fsyncSync(fd);
    if (!safe(fstatSync(fd, { bigint: true })) || !same(made, lstatSync(temp, { bigint: true }))) throw new Error('private output changed');
    if (replace) renameSync(temp, path);
    else {
      linkSync(temp, path);
      // Our exclusive publication temporarily owns exactly two names. Verify both
      // against the still-open descriptor before removing the staging name.
      const linked = fstatSync(fd, { bigint: true });
      const target = lstatSync(path, { bigint: true });
      if (!safe(linked, 2n) || !safe(target, 2n) || !same(made, linked) || !same(linked, target) ||
          !same(linked, lstatSync(temp, { bigint: true }))) throw new Error('private output publication changed');
      unlinkSync(temp);
    }
    const published = lstatSync(path, { bigint: true });
    const held = fstatSync(fd, { bigint: true });
    if (!safe(held) || !safe(published) || !same(made, held) || !same(held, published)) throw new Error('private output publication changed');
    made = undefined;
    stage.removeDirectory();
    try { const directory = openSync(dirname(path), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); } }
    catch { /* directory fsync is best-effort on platforms that do not support it */ }
  } finally {
    try {
      // Cleanup names are inside the protected stage. These identity checks are
      // additional refusal checks; they do not make a pathname unlink atomic.
      if (made) { try { if (same(made, lstatSync(temp, { bigint: true }))) unlinkSync(temp); } catch { /* retain original failure */ } }
    } finally { try { if (fd !== undefined) closeSync(fd); } finally { stage.removeDirectory(); } }
  }
}

export interface PrivateOutput {
  bound(): Promise<boolean>;
  save(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
/** Retain this exact private handle through network issuance, including a possible pathname replacement. */
export async function reservePrivateOutput(path: string, max: number): Promise<PrivateOutput> {
  maximum(max);
  if (process.platform === 'win32') return reserveWindowsPrivateFile(path, max);
  const fd = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  let closed = false;
  const privateNow = (): boolean => { try { return !closed && safe(fstatSync(fd, { bigint: true })); } catch { return false; } };
  return {
    async bound() {
      try { const named = lstatSync(path, { bigint: true }); return privateNow() && named.isFile() && same(named, fstatSync(fd, { bigint: true })); }
      catch { return false; }
    },
    async save(bytes) {
      if (bytes.byteLength > max || !privateNow()) throw new Error('private output lost');
      let offset = 0;
      while (offset < bytes.byteLength) {
        const wrote = writeSync(fd, bytes, offset, bytes.byteLength - offset, offset);
        if (wrote === 0) throw new Error('private output write made no progress');
        offset += wrote;
      }
      ftruncateSync(fd, bytes.byteLength);
      fsyncSync(fd);
      if (!privateNow()) throw new Error('private output lost');
    },
    async close() { if (!closed) { closed = true; closeSync(fd); } },
  };
}
