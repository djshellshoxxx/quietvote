// Invitation links (QV-19 §6.1, REQ-010): https://host/e/ID#inv=TOKEN[&read=KEY][&board=URL]. The fragment never reaches the
// server; the token is hashed on the device before it is transmitted.
import { sha256 } from '@quietvote/crypto';
import { b64uDecode, b64uEncode } from '../util/hex.ts';

export interface InviteFragment {
  token?: Uint8Array;
  readKey?: string;
  board?: string;
}

export function parseFragment(hash: string): InviteFragment {
  const out: InviteFragment = {};
  const s = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of s.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === 'inv') {
      const b = b64uDecode(v);
      if (b !== undefined && b.length === 16) out.token = b;
    } else if (k === 'read') {
      if (/^[A-Za-z0-9_-]{16,64}$/.test(v)) out.readKey = v;
    } else if (k === 'board') {
      const u = safeBoardOrigin(decodeURIComponent(v));
      if (u !== undefined) out.board = u;
    }
  }
  return out;
}

/** Split-origin board URL (QV-19 §4): https only (http allowed for localhost / .onion), origin only. */
export function safeBoardOrigin(u: string): string | undefined {
  try {
    const url = new URL(u);
    const host = url.hostname;
    const httpOk = url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.onion'));
    if (url.protocol !== 'https:' && !httpOk) return undefined;
    if (url.username !== '' || url.password !== '') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** SHA-256 of the raw 128-bit token, base64url (what goes on the wire). */
export function inviteHash(token: Uint8Array): string {
  return b64uEncode(sha256(token));
}

export function makeInviteFragment(token: Uint8Array, extra: { readKey?: string; board?: string } = {}): string {
  let s = `#inv=${b64uEncode(token)}`;
  if (extra.readKey !== undefined) s += `&read=${extra.readKey}`;
  if (extra.board !== undefined) s += `&board=${encodeURIComponent(extra.board)}`;
  return s;
}
