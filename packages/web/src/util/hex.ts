export { bytesToHex, hexToBytes, isHex, utf8, concatBytes } from '@quietvote/crypto';

/** base64url without padding (QV-09 §4.1 transport encoding). */
export function b64uEncode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(s: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return undefined;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

/** Zeroises a secret buffer (QV-19 §5.3 memory hygiene). Best effort in JS. */
export function wipe(...bufs: (Uint8Array | undefined)[]): void {
  for (const b of bufs) b?.fill(0);
}

export function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}
