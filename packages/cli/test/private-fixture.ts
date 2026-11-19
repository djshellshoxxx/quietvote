// SPDX-License-Identifier: AGPL-3.0-or-later
import { join } from 'node:path';
import { writePrivateFileSync } from '../src/private-files.ts';

/** Legitimate fixture bytes get the same native private creation as user files. */
export function writePrivateFixture(path: string, value: Uint8Array | string): void {
  writePrivateFileSync(path, value, true);
}
export function writePrivateJson(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writePrivateFixture(path, JSON.stringify(value));
  return path;
}
