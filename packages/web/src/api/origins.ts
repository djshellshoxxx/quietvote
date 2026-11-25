// Deployment policy is public configuration. Invitation fragments may select only one of these exact origins.
export const MAX_BOARD_ORIGINS = 16;

/** Canonical, bare origin only. HTTP is limited to loopback and onion services (QV-19 §4). */
export function safeBoardOrigin(value: string): string | undefined {
  if (value.length > 300) return undefined;
  try {
    const u = new URL(value);
    // URL parsing validates IPv6; exact serialization rejects expanded spellings, credentials, paths and bad ports.
    if (u.origin !== value || u.hostname.length > 253 || (!u.hostname.startsWith('[') && !u.hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) return undefined;
    if (u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.hostname.endsWith('.onion')))) return value;
  } catch { /* Invalid URL, including an invalid port. */ }
  return undefined;
}

export function checkOrigin(value: string): string {
  if (safeBoardOrigin(value) === undefined) throw new Error('invalid board origin: expected a canonical bare HTTPS origin (HTTP only for loopback or .onion)');
  return value;
}

export function boardOrigins(values: readonly string[]): string[] {
  if (values.length > MAX_BOARD_ORIGINS) throw new Error('too many board origins');
  return [...new Set(values.map((value) => {
    const origin = checkOrigin(value);
    // CSP 'self' covers an IPv6 page origin; external IPv6 literal host-sources are not supported.
    if (origin.includes('[')) throw new Error('external IPv6 board origins are not supported by the CSP allowlist');
    return origin;
  }))].sort();
}

/** An empty API base means the page's origin; paths and URL credentials are never accepted. */
export function apiOrigin(apiBase: string, pageOrigin: string): string {
  return checkOrigin(apiBase === '' ? pageOrigin : apiBase);
}

export function boardPolicy(pageOrigin: string, apiBase = '', allowed: readonly string[] = []): { defaultBoard: string; select: (board?: string) => string } {
  const origins = new Set([checkOrigin(pageOrigin), ...boardOrigins(allowed)]);
  const select = (board = apiOrigin(apiBase, pageOrigin)): string => {
    if (!origins.has(checkOrigin(board))) throw new Error('board origin is not allowed by this client deployment');
    return board;
  };
  return { defaultBoard: select(), select };
}

/** Read credentials distinguish in-memory connections, but never enter persistent keys or URLs. */
export const electionCacheKey = (board: string, id: string, readKey?: string): string => JSON.stringify([board, id, readKey ?? null]);
