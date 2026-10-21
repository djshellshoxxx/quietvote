// Small byte helpers (portable: no Buffer, so the board library runs in browsers).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_REV[B64.charAt(i)] = i;

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

export function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

/** Strict UTF-8 decode; returns undefined on malformed input. */
export function utf8Decode(b: Uint8Array): string | undefined {
  try {
    return dec.decode(b);
  } catch {
    return undefined;
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
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

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function toHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(h: string): Uint8Array {
  if (h.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(h)) throw new Error('bad hex');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Standard base64 with padding. */
export function b64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const x = ((b[i] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64.charAt((x >> 18) & 63) + B64.charAt((x >> 12) & 63);
    s += i + 1 < b.length ? B64.charAt((x >> 6) & 63) : '=';
    s += i + 2 < b.length ? B64.charAt(x & 63) : '=';
  }
  return s;
}

/** Strict canonical base64 decode (padded, alphabet-checked, canonical trailing bits). */
export function unb64(s: string): Uint8Array | undefined {
  if (s.length % 4 !== 0) return undefined;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return undefined;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((j) => s.charAt(i + j));
    const v = c.map((ch) => (ch === '=' ? 0 : (B64_REV[ch] ?? 0)));
    const x = ((v[0] ?? 0) << 18) | ((v[1] ?? 0) << 12) | ((v[2] ?? 0) << 6) | (v[3] ?? 0);
    out.push((x >> 16) & 255);
    if (c[2] !== '=') out.push((x >> 8) & 255);
    if (c[3] !== '=') out.push(x & 255);
  }
  const r = Uint8Array.from(out);
  return b64(r) === s ? r : undefined;
}

/** Unpadded base64url (JSON transport). */
export function b64u(b: Uint8Array): string {
  return b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return undefined;
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  return unb64(p + '='.repeat((4 - (p.length % 4)) % 4));
}

export function u64be(n: number): Uint8Array {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('u64 out of range');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n));
  return out;
}

export class Writer {
  private parts: Uint8Array[] = [];
  u16(n: number): this {
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error('u16 out of range');
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n);
    this.parts.push(b);
    return this;
  }
  u64(n: number): this {
    this.parts.push(u64be(n));
    return this;
  }
  raw(b: Uint8Array): this {
    this.parts.push(b);
    return this;
  }
  str(s: string): this {
    const b = utf8(s);
    this.u16(b.length);
    this.parts.push(b);
    return this;
  }
  lp(b: Uint8Array): this {
    this.u16(b.length);
    this.parts.push(b);
    return this;
  }
  done(): Uint8Array {
    return concat(...this.parts);
  }
}

/** Bounds-checked reader; every method throws RangeError on underrun (callers wrap). */
export class Reader {
  private o = 0;
  private readonly b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  private need(n: number): void {
    if (this.o + n > this.b.length) throw new RangeError('underrun');
  }
  u16(): number {
    this.need(2);
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.o, 2).getUint16(0);
    this.o += 2;
    return v;
  }
  u64(): number {
    this.need(8);
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.o, 8).getBigUint64(0);
    this.o += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('u64 too large');
    return Number(v);
  }
  raw(n: number): Uint8Array {
    this.need(n);
    const v = this.b.slice(this.o, this.o + n);
    this.o += n;
    return v;
  }
  str(): string {
    const s = utf8Decode(this.raw(this.u16()));
    if (s === undefined) throw new RangeError('bad utf8');
    return s;
  }
  lp(): Uint8Array {
    return this.raw(this.u16());
  }
  get atEnd(): boolean {
    return this.o === this.b.length;
  }
}
