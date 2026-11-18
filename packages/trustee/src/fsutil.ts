import { chmod, link, lstat, open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, basename, resolve } from 'node:path';
import { TrusteeError } from './errors.ts';

/** Write temp (0600, exclusive) + fsync + rename + fsync(dir): a crash leaves the old or the new file, never a torn one. */
export async function atomicWrite(path: string, data: Uint8Array, mode = 0o600, opts: { exclusive?: boolean } = {}): Promise<void> {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  let created = false;
  try {
    const fh = await open(tmp, 'wx', mode);
    created = true;
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    if (opts.exclusive === true) {
      await link(tmp, path);
      await unlink(tmp);
      created = false;
    } else await rename(tmp, path);
    await chmod(path, mode);
    try {
      const d = await open(dirname(path), 'r');
      try {
        await d.sync();
      } finally {
        await d.close();
      }
    } catch {
      /* directory fsync is best-effort (not supported everywhere) */
    }
  } finally {
    // A write, fsync or rename failure must not strand an unregistered sealed copy.
    if (created) await unlink(tmp).catch(() => {});
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** QV-17 §6.5: refuse a secret file readable by group/other. */
export async function readSecretFile(path: string): Promise<Uint8Array> {
  let st;
  try {
    st = await stat(path);
  } catch {
    throw new TrusteeError('USAGE', 'NO_SUCH_FILE', path);
  }
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) throw new TrusteeError('REFUSED', 'BAD_PERMISSIONS', `${path} is accessible by group/other; chmod 600`);
  return new Uint8Array(await readFile(path));
}

/**
 * Best-effort overwrite then unlink. Refuse aliases and nonregular/multiply-linked files. When an expected sealed-file
 * fingerprint is supplied, compare it on the same open descriptor before overwriting. False means absent or unsafe to remove.
 * On SSD/flash this is NOT erasure (QV-17 §11.2): the key must be destroyed too.
 */
export async function shred(path: string, randomBytes: (n: number) => Uint8Array, expectedSha256?: string): Promise<boolean> {
  let before;
  try {
    before = await lstat(path);
    if (!before.isFile() || before.nlink !== 1 || await realpath(path) !== resolve(path)) return false;
  } catch (e) {
    if (['ENOENT', 'ENOTDIR'].includes((e as { code?: string }).code ?? '')) return false;
    throw e;
  }
  let fh;
  try {
    fh = await open(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  } catch (e) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((e as { code?: string }).code ?? '')) return false;
    throw e;
  }
  const same = (st: { dev: number; ino: number }): boolean => st.dev === before.dev && st.ino === before.ino;
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.nlink !== 1 || !same(st)) return false;
    const chunkSize = 64 * 1024;
    if (expectedSha256 !== undefined) {
      const hash = createHash('sha256');
      const chunk = new Uint8Array(chunkSize);
      for (let pos = 0; pos < st.size;) {
        const { bytesRead } = await fh.read(chunk, 0, Math.min(chunkSize, st.size - pos), pos);
        if (bytesRead === 0) return false;
        hash.update(chunk.subarray(0, bytesRead));
        pos += bytesRead;
      }
      if (hash.digest('hex') !== expectedSha256) return false;
    }
    const current = await lstat(path);
    const held = await fh.stat();
    if (!same(current) || !current.isFile() || held.nlink !== 1 || held.size !== st.size || held.mtimeMs !== st.mtimeMs) return false;
    for (let pos = 0; pos < st.size;) {
      const chunk = randomBytes(Math.min(chunkSize, st.size - pos));
      let written = 0;
      while (written < chunk.length) {
        const { bytesWritten } = await fh.write(chunk, written, chunk.length - written, pos + written);
        if (bytesWritten === 0) throw new Error('backup overwrite made no progress');
        written += bytesWritten;
      }
      pos += chunk.length;
    }
    await fh.sync();
    if (!same(await lstat(path))) return false;
    await unlink(path);
    return true;
  } finally {
    await fh.close();
  }
}

/** Lock file guarding a bundle's read-check-write section (audit TR-03). */
export const lockPath = (bundle: string): string => `${bundle}.lock`;

/**
 * Runs `fn` while holding `<bundle>.lock`, created atomically with O_EXCL (`wx`). A second holder (another process, or another
 * Trustee object in this process) gets BUNDLE_LOCKED instead of waiting. The lock is removed in `finally`; only a hard kill inside
 * the (milliseconds-long) write section leaves it behind, and then the operator deletes it after checking no qv-trustee runs.
 */
export async function withLock<T>(bundle: string, fn: () => Promise<T>): Promise<T> {
  const lp = lockPath(bundle);
  let fh;
  try {
    fh = await open(lp, 'wx', 0o600);
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') throw new TrusteeError('STATE', 'BUNDLE_LOCKED', `${lp} exists: another qv-trustee process is writing this bundle. If none is running (crash), delete the lock file and re-run`);
    throw e;
  }
  try {
    await fh.writeFile(`${process.pid}\n`);
    await fh.close();
    return await fn();
  } finally {
    await unlink(lp).catch(() => {});
  }
}

export { readFile, writeFile };
