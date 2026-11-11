// Prefer pinned repository Playwright, then supported managed tools and legacy globals.
// QV_CHROMIUM selects the binary; QV_REQUIRE_BROWSER=1 makes unavailable tooling fail.
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

function unavailable(reason: string): never {
  const message = `Browser checks unavailable: ${reason}`;
  if (process.env.QV_REQUIRE_BROWSER === '1') throw new Error(message);
  console.log(`e2e skipped: ${message}`);
  process.exit(0);
}

export function browserTools(): { pw: typeof import('playwright'); executablePath: string } {
  let pw: typeof import('playwright') | undefined;
  const installs = [
    [import.meta.url, 'playwright'],
    ['/opt/codex/cua_node/lib/node_modules/', 'playwright-core'],
    ['/opt/node22/lib/node_modules/', 'playwright'],
    ['/opt/node22/lib/node_modules/', 'playwright-core'],
  ] as const;
  for (const [base, name] of installs) {
    try {
      pw = createRequire(base)(name) as typeof import('playwright');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  if (!pw) unavailable('install the pinned Playwright dependency.');
  let executablePath = process.env.QV_CHROMIUM;
  if (executablePath === undefined) {
    executablePath = [pw.chromium.executablePath(), '/usr/bin/chromium', '/opt/pw-browsers/chromium'].find(existsSync);
  }
  if (executablePath && existsSync(executablePath) && statSync(executablePath).isDirectory()) {
    executablePath = join(executablePath, 'chrome-linux', 'chrome');
  }
  if (!executablePath || !existsSync(executablePath) || !statSync(executablePath).isFile()) {
    unavailable(`no Chromium executable at ${executablePath ?? 'the supported locations'}; set QV_CHROMIUM.`);
  }
  return { pw, executablePath };
}

export async function launchBrowser(): Promise<import('playwright').Browser> {
  const { pw, executablePath } = browserTools();
  return pw.chromium.launch({ executablePath, args: ['--no-sandbox'] });
}
