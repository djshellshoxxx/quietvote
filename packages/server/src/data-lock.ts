// Process exclusivity for replay-derived election state. SQLite write locks alone do not protect the in-memory admission projection.
import { mkdirSync, realpathSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_LOCK_NAME = '.qv-server.lock';

/**
 * Acquire before opening any database/key. A leftover lock is deliberately not stolen: PID reuse, containers and shared
 * volumes make process liveness tests unsafe. Recovery requires stopping all users of the volume before removing the empty
 * lock directory. The data directory must be privately writable by the operator; this is not a hostile-filesystem boundary.
 */
export function lockDataDirectory(dataDir: string): { dataDir: string; release(): void } {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(dataDir);
  const path = join(canonical, DATA_LOCK_NAME);
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('data directory is locked; stop all QuietVote processes using this volume before removing the .qv-server.lock directory left by an interrupted process');
    }
    throw error;
  }
  const held = statSync(path);
  let released = false;
  return {
    dataDir: canonical,
    release() {
      if (released) return;
      // Never remove a replacement lock. Under supported ownership, nobody mutates a live server's lock directory.
      const current = statSync(path);
      if (current.dev !== held.dev || current.ino !== held.ino) throw new Error('data directory lock changed while held; refusing to remove it');
      rmdirSync(path); // empty directory only, never recursive deletion
      released = true;
    },
  };
}
