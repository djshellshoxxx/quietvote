import { QvCryptoError } from './errors.ts';

const HEX = '0123456789abcdef';
const ENC = new TextEncoder();

export function utf8(s: string): Uint8Array {
  return ENC.encode(s);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += HEX[x >> 4]! + HEX[x & 15]!;
  return s;
}

const HEX_RE = /^(?:[0-9a-f]{2})*$/;

/** Strict lowercase hex decoding. Upper-case and odd lengths are rejected, never normalised. */
export function hexToBytes(h: string, expectLen?: number): Uint8Array {
  if (typeof h !== 'string' || !HEX_RE.test(h)) throw new QvCryptoError('E_PARSE', 'bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  if (expectLen !== undefined && out.length !== expectLen) throw new QvCryptoError('E_LENGTH', 'bad hex length');
  return out;
}

export function isHex(h: unknown, byteLen?: number): h is string {
  if (typeof h !== 'string' || !HEX_RE.test(h)) return false;
  return byteLen === undefined || h.length === 2 * byteLen;
}

export function u8(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xff) throw new QvCryptoError('E_ARG', 'u8 range');
  return Uint8Array.of(n);
}
export function u16(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new QvCryptoError('E_ARG', 'u16 range');
  return Uint8Array.of(n >>> 8, n & 0xff);
}
export function u32(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new QvCryptoError('E_ARG', 'u32 range');
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}
export function u64(n: number | bigint): Uint8Array {
  const v = BigInt(n);
  if (v < 0n || v >= 1n << 64n) throw new QvCryptoError('E_ARG', 'u64 range');
  const out = new Uint8Array(8);
  for (let i = 7, x = v; i >= 0; i--, x >>= 8n) out[i] = Number(x & 0xffn);
  return out;
}

/** lp(x) = u32(len(x)) || x */
export function lp(x: Uint8Array): Uint8Array {
  return concatBytes(u32(x.length), x);
}

/** Length-checked, no-early-exit comparison for secret-derived bytes (QV-30 S4). */
export function ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

export function wipe(b: Uint8Array): void {
  b.fill(0);
}

/** Little-endian bytes -> non-negative bigint. */
export function leToBigint(b: Uint8Array): bigint {
  let x = 0n;
  for (let i = b.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[i]!);
  return x;
}

export function bigintToLe(x: bigint, len: number): Uint8Array {
  if (x < 0n) throw new QvCryptoError('E_ARG', 'negative');
  const out = new Uint8Array(len);
  let v = x;
  for (let i = 0; i < len; i++, v >>= 8n) out[i] = Number(v & 0xffn);
  if (v !== 0n) throw new QvCryptoError('E_ARG', 'bigint too large');
  return out;
}
