// SPDX-License-Identifier: AGPL-3.0-or-later
import { lstatSync, mkdirSync, realpathSync, rmdirSync, type BigIntStats } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, parse, sep } from 'node:path';

/**
 * This namespace boundary assumes effective POSIX owner/mode/sticky permissions.
 * Current-EUID/root tampering and ACL grants overriding those bits are outside it;
 * in particular these checks do not inspect macOS native ACLs.
 */
export function createPosixStage(path: string): { output: string; temporary: string; removeDirectory(): void } {
  const refused = () => Object.assign(new Error('output requires trusted directory ownership and protected POSIX namespace permissions'), { code: 'UNSAFE_DIRECTORY' });
  if (process.platform === 'win32' || process.geteuid === undefined) throw refused();
  const uid = BigInt(process.geteuid());
  const leaf = basename(path);
  if (leaf === '' || leaf === '.' || leaf === '..') throw refused();
  // Use only this resolved parent afterward; later alias/cwd changes cannot
  // redirect publication or cleanup to a different directory.
  const parent = realpathSync.native(dirname(path));
  const check = (directory: string): BigIntStats => {
    const st = lstatSync(directory, { bigint: true });
    if (!st.isDirectory() || (st.uid !== uid && st.uid !== 0n) ||
        ((st.mode & 0o022n) !== 0n && (st.mode & 0o1000n) === 0n)) throw refused();
    return st;
  };
  let current = parse(parent).root;
  let parentStat = check(current);
  for (const component of parent.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, component);
    // A writable sticky ancestor is safe only because its owner AND each
    // descendant entry owner are trusted; sticky alone is insufficient.
    parentStat = check(current);
  }
  const directory = join(parent, `.qv-stage-${randomBytes(16).toString('hex')}`);
  mkdirSync(directory, { mode: 0o700 });
  let made: BigIntStats | undefined;
  const removeDirectory = (): void => {
    try {
      const named = lstatSync(directory, { bigint: true });
      if (made && named.isDirectory() && named.uid === uid && named.dev === made.dev && named.ino === made.ino) {
        // Never recurse. The protected ancestry, not this identity check,
        // excludes other-UID rebinding between inspection and removal.
        rmdirSync(directory);
      }
    } catch { /* preserve an unexpected/nonempty stage for manual recovery */ }
  };
  try {
    made = lstatSync(directory, { bigint: true });
    if (!made.isDirectory() || made.uid !== uid || made.dev !== parentStat.dev || (made.mode & 0o777n) !== 0o700n) throw refused();
    return { output: join(parent, leaf), temporary: join(directory, 'payload'), removeDirectory };
  } catch (error) { removeDirectory(); throw error; }
}
