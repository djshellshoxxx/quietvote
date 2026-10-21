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

export { readFile, writeFile };
