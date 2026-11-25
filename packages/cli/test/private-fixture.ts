// SPDX-License-Identifier: AGPL-3.0-or-later
import { join } from 'node:path';
import { writePrivateFileSync } from '../src/private-files.ts';
import { writeWindowsPrivateFile } from '../src/windows-private-files.ts';

/** Legitimate fixture bytes get the same native private creation as user files. */
export function writePrivateFixture(path: string, value: Uint8Array | string): void {
  writePrivateFileSync(path, value, true);
}
/** Async fixtures share the existing validated native service on Windows.
 * This avoids re-compiling the native helper for each ordinary test input;
 * production synchronous writes and their deadline remain unchanged. */
export async function writePrivateFixtureAsync(path: string, value: Uint8Array | string): Promise<void> {
  if (process.platform !== 'win32') { writePrivateFixture(path, value); return; }
  await writeWindowsPrivateFile(path, typeof value === 'string' ? Buffer.from(value) : value, true);
}
export function writePrivateJson(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writePrivateFixture(path, JSON.stringify(value));
  return path;
}
