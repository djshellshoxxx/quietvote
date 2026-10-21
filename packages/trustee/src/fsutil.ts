import { chmod, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { TrusteeError } from './errors.ts';

/** Write temp (0600, exclusive) + fsync + rename + fsync(dir): a crash leaves the old or the new file, never a torn one. */
export async function atomicWrite(path: string, data: Uint8Array, mode = 0o600): Promise<void> {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  const fh = await open(tmp, 'wx', mode);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, path);
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
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
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

/** Best-effort overwrite then unlink. On SSD/flash this is NOT erasure (QV-17 §11.2): the key must be destroyed too. */
export async function shred(path: string, randomBytes: (n: number) => Uint8Array): Promise<boolean> {
  let st;
  try {
    st = await stat(path);
  } catch {
    return false;
  }
  const fh = await open(path, 'r+');
  try {
    await fh.write(randomBytes(st.size), 0, st.size, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await unlink(path);
  return true;
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
