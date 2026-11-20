import { link, lstat, open, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { constants, type BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, basename, resolve } from 'node:path';
import { TrusteeError } from './errors.ts';
import { MAX_PRIVATE_FILE_BYTES, readWindowsPrivateFile, writeWindowsPrivateFile } from './windows-private-files.ts';
import { createPosixStage, protectedPosixPath } from './posix-staging.ts';

/** Hold an exclusive temporary file through fsync and validated publication, then best-effort fsync its directory. */
export async function atomicWrite(path: string, data: Uint8Array, mode = 0o600, opts: { exclusive?: boolean } = {}): Promise<void> {
  if (process.platform === 'win32' && (mode & 0o077) === 0) {
    await writeWindowsPrivateFile(path, data, opts.exclusive !== true);
    return;
  }
  // Public Windows output retains its existing backend; private Windows output
  // returned above. The controlled namespace policy here is POSIX-specific.
  let stage: ReturnType<typeof createPosixStage> | undefined;
  if (process.platform !== 'win32') {
    try { stage = createPosixStage(path); }
    catch (error) {
      if ((error as { code?: string }).code === 'UNSAFE_DIRECTORY') {
        throw new TrusteeError('REFUSED', 'UNSAFE_DIRECTORY', 'output directory permissions do not establish protected staging');
      }
      throw error;
    }
  }
  if (stage) path = stage.output;
  const tmp = stage?.temporary ?? join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  const refused = () => new TrusteeError('REFUSED', 'OUTPUT_CHANGED', 'output identity or permissions changed during publication');
  const same = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino;
  const safe = (st: BigIntStats, links = 1n): boolean => st.isFile() && st.nlink === links &&
    (process.geteuid === undefined || st.uid === BigInt(process.geteuid())) &&
    // Public Windows files still use this branch; Node mode bits do not model their DACLs.
    (process.platform === 'win32' || (st.mode & 0o777n) === BigInt(mode & 0o777));
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  let made: BigIntStats | undefined;
  try {
    fh = await open(tmp, 'wx', mode);
    made = await fh.stat({ bigint: true });
    // Restore the requested public mode after umask without ever chmod-ing a pathname.
    await fh.chmod(mode);
    const prepared = await fh.stat({ bigint: true });
    const named = await lstat(tmp, { bigint: true });
    if (!safe(prepared) || !safe(named) || !same(made, prepared) || !same(prepared, named)) throw refused();
    await fh.writeFile(data);
    await fh.sync();
    const written = await fh.stat({ bigint: true });
    if (!safe(written) || !same(made, written) || !same(written, await lstat(tmp, { bigint: true }))) throw refused();
    if (opts.exclusive === true) {
      await link(tmp, path);
      // Exclusive publication briefly has two names. Both must still name the
      // held file before the staging entry can be removed.
      const linked = await fh.stat({ bigint: true });
      const target = await lstat(path, { bigint: true });
      const staging = await lstat(tmp, { bigint: true });
      if (!safe(linked, 2n) || !safe(target, 2n) || !safe(staging, 2n) || !same(made, linked) ||
          !same(linked, target) || !same(linked, staging)) throw refused();
      await unlink(tmp);
    } else await rename(tmp, path);
    const published = await lstat(path, { bigint: true });
    const held = await fh.stat({ bigint: true });
    if (!safe(held) || !safe(published) || !same(made, held) || !same(held, published)) throw refused();
    made = undefined;
    stage?.removeDirectory();
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
    try {
      // POSIX cleanup stays inside the protected stage. Identity comparisons
      // are additional refusal checks, not an atomic conditional unlink.
      if (made) {
        try { if (same(made, await lstat(tmp, { bigint: true }))) await unlink(tmp); }
        catch { /* retain the original publication failure */ }
      }
    } finally { try { await fh?.close(); } finally { stage?.removeDirectory(); } }
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

/** QV-17 §6.5: inspect the permissions and identity of the same bounded stream that supplies secret bytes. */
export async function readSecretFile(path: string, max = MAX_PRIVATE_FILE_BYTES): Promise<Uint8Array> {
  const refused = () => new TrusteeError('REFUSED', 'BAD_PERMISSIONS', `${path} must be a bounded owner-private regular file without aliases`);
  if (!Number.isSafeInteger(max) || max < 0 || max > MAX_PRIVATE_FILE_BYTES) throw refused();
  if (process.platform === 'win32') {
    try { return await readWindowsPrivateFile(path, max); }
    catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') throw new TrusteeError('USAGE', 'NO_SUCH_FILE', path);
      throw refused();
    }
  }
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  let bytes: Buffer | undefined;
  try {
    const named = await lstat(path, { bigint: true });
    if (!named.isFile() || named.nlink !== 1n) throw refused();
    fh = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const before = await fh.stat({ bigint: true });
    const safe = (st: typeof before): boolean => st.isFile() && st.nlink === 1n && (st.mode & 0o077n) === 0n &&
      (process.geteuid === undefined || st.uid === BigInt(process.geteuid()));
    const same = (st: typeof before): boolean => st.dev === before.dev && st.ino === before.ino;
    if (!safe(before) || !same(named) || before.size > BigInt(max)) throw refused();
    bytes = Buffer.alloc(Number(before.size) + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await fh.read(bytes, size, bytes.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    const after = await fh.stat({ bigint: true });
    if (BigInt(size) !== before.size || !safe(after) || !same(after) || after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs || !same(await lstat(path, { bigint: true }))) throw refused();
    return bytes.subarray(0, size);
  } catch (error) {
    bytes?.fill(0);
    if (error instanceof TrusteeError) throw error;
    if (['ENOENT', 'ENOTDIR'].includes((error as { code?: string }).code ?? '')) throw new TrusteeError('USAGE', 'NO_SUCH_FILE', path);
    throw refused();
  } finally {
    await fh?.close();
  }
}

/**
 * Best-effort overwrite then unlink. Refuse aliases and nonregular/multiply-linked files. When an expected sealed-file
 * fingerprint is supplied, compare it on the same open descriptor before overwriting. False means absent or unsafe to remove.
 * On SSD/flash this is NOT erasure (QV-17 §11.2): the key must be destroyed too.
 */
export async function shred(path: string, randomBytes: (n: number) => Uint8Array, expectedSha256?: string): Promise<boolean> {
  path = resolve(path); // Later cwd changes must not redirect a cleanup already in progress.
  let before;
  try {
    before = await lstat(path);
    if (!before.isFile() || before.nlink !== 1 || await realpath(path) !== path) return false;
    // An identity check alone does not make a later pathname unlink conditional.
    // Preserve the same trusted POSIX namespace prerequisite as publication.
    if (process.platform !== 'win32' && protectedPosixPath(path) !== path) return false;
  } catch (e) {
    if (['ENOENT', 'ENOTDIR', 'UNSAFE_DIRECTORY'].includes((e as { code?: string }).code ?? '')) return false;
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
