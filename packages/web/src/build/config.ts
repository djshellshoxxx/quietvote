import { boardOrigins, checkOrigin } from '../api/origins.ts';

export interface SiteConfig { apiBase: string; connectOrigins: string[] }

/** The default API is explicitly included in both the runtime allowlist and connect-src. */
export function siteConfig(o: { apiBase?: string; connectOrigins?: readonly string[] } = {}): SiteConfig {
  const apiBase = o.apiBase ? checkOrigin(o.apiBase) : '';
  const allowed = boardOrigins(o.connectOrigins ?? []);
  if (apiBase && !allowed.includes(apiBase)) allowed.push(apiBase);
  return { apiBase, connectOrigins: boardOrigins(allowed) };
}

export function buildArguments(args: readonly string[]): { out?: string; apiBase?: string; connectOrigins: string[] } {
  const o: { out?: string; apiBase?: string; connectOrigins: string[] } = { connectOrigins: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--api-base' || arg === '--connect-origin') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      if (arg === '--connect-origin') o.connectOrigins.push(value);
      else { if (o.apiBase !== undefined) throw new Error('duplicate --api-base'); o.apiBase = value; }
    } else if (arg.startsWith('-') || o.out !== undefined) throw new Error(`unknown build argument: ${arg}`);
    else o.out = arg;
  }
  return { ...o, ...siteConfig(o) };
}
