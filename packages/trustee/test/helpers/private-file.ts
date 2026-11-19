// SPDX-License-Identifier: AGPL-3.0-or-later
import { chmodSync, writeFileSync } from 'node:fs';
import { writeWindowsPrivateFileSync } from '../../src/windows-private-files.ts';

/** Native ACL creation is required even for intentionally malformed secret fixtures. */
export function writePrivateFixture(path: string, value: Uint8Array | string): void {
  if (process.platform === 'win32') writeWindowsPrivateFileSync(path, typeof value === 'string' ? Buffer.from(value) : value, true);
  else { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); }
}
