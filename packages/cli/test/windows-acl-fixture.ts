// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process';
import { win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface NativeAcl {
  owner: string;
  user: string;
  protected: boolean;
  nullDacl: boolean;
  rules: { sid: string; allow: boolean; inherited: boolean; callback: boolean }[];
}
/** Test-only ACL mutation/observation through the actual Windows security APIs. */
export function windowsFixture<T = NativeAcl>(op: string, path = ''): T {
  if (process.platform !== 'win32' || !process.env.SystemRoot) throw new Error('Windows fixture requires Windows');
  const file = win32.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = fileURLToPath(new URL('./windows-acl-fixture.ps1', import.meta.url));
  const output = execFileSync(file, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], {
    input: JSON.stringify({ op, path }) + '\n', encoding: 'utf8', windowsHide: true, timeout: 15_000,
    stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024,
  });
  return JSON.parse(output) as T;
}
