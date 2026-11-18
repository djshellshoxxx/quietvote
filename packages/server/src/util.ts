// Small shared helpers: base32 ids, constant-time compare, strict body validators, async mutex.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hexToBytes } from '@quietvote/crypto';
import { ApiError } from './problem.ts';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lower case, no padding. 16 bytes -> 26 chars. */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32.charAt((acc >>> (bits - 5)) & 31);
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32.charAt((acc << (5 - bits)) & 31);
  return out;
}

/** Inverse of `base32` for canonical input only: lower case alphabet, exact length, zero pad bits. Returns undefined otherwise. */
export function unbase32(s: string, nbytes: number): Uint8Array | undefined {
  if (s.length !== Math.ceil((nbytes * 8) / 5)) return undefined;
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) return undefined;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  if (acc !== 0 || out.length !== nbytes) return undefined;
  return new Uint8Array(out);
}

export function randomId(): string {
  return base32(randomBytes(16));
}

export function randomToken(nbytes = 16): Uint8Array {
  return new Uint8Array(randomBytes(nbytes));
}

export const ELECTION_ID_RE = /^[0-9a-f]{32}$/;
export const ORG_ID_RE = /^[a-z2-7]{26}$/;

/** Board origin derived deterministically from the 128-bit election id (26 base32 chars). */
export function originOf(electionId: string): string {
  return `quietvote/v1/${base32(hexToBytes(electionId, 16))}`;
}

export function ctEq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- minimal strict body validation (QV-09 §4.1: unknown members -> 400 UNKNOWN_FIELD, `x-` ignored) ----

export type Field<T> = (v: unknown, ptr: string) => T;

function bad(ptr: string, msg: string): never {
  throw new ApiError(400, 'BAD_REQUEST', msg, { errors: [{ pointer: ptr, message: msg }] });
}
function noNul(s: string, ptr: string): void {
  if (s.includes('\u0000')) bad(ptr, 'NUL character not allowed');
}

export const fStr = (o: { min?: number; max: number; re?: RegExp }): Field<string> => (v, ptr) => {
  if (typeof v !== 'string') return bad(ptr, 'expected string');
  noNul(v, ptr);
  if (v.length < (o.min ?? 0) || v.length > o.max) return bad(ptr, `length must be ${o.min ?? 0}..${o.max}`);
  if (o.re && !o.re.test(v)) return bad(ptr, 'invalid format');
  return v;
};
export const fInt = (min: number, max: number): Field<number> => (v, ptr) => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return bad(ptr, `expected integer ${min}..${max}`);
  return v;
};
export const fBool: Field<boolean> = (v, ptr) => (typeof v === 'boolean' ? v : bad(ptr, 'expected boolean'));
export const fEnum = <T extends string>(...vs: T[]): Field<T> => (v, ptr) => {
  if (typeof v !== 'string' || !(vs as string[]).includes(v)) return bad(ptr, `expected one of ${vs.join('|')}`);
  return v as T;
};
export const fArr = <T>(item: Field<T>, max: number): Field<T[]> => (v, ptr) => {
  if (!Array.isArray(v)) return bad(ptr, 'expected array');
  if (v.length > max) return bad(ptr, `at most ${max} items`);
  return v.map((x, i) => item(x, `${ptr}/${i}`));
};
export const fObj = <T extends Record<string, unknown>>(shape: { [K in keyof T]: { f: Field<T[K]>; opt?: boolean } }): Field<T> => (v, ptr) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(ptr, 'expected object');
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    if (k.startsWith('x-')) continue;
    if (!Object.hasOwn(shape, k)) throw new ApiError(400, 'UNKNOWN_FIELD', `unknown member ${k}`, { errors: [{ pointer: `${ptr}/${k}`, message: 'unknown member' }] });
  }
  for (const [k, spec] of Object.entries(shape) as [string, { f: Field<unknown>; opt?: boolean }][]) {
    if (o[k] === undefined) {
      if (!spec.opt) bad(`${ptr}/${k}`, 'required');
      continue;
    }
    out[k] = spec.f(o[k], `${ptr}/${k}`);
  }
  return out as T;
};
export const req = <T>(f: Field<T>): { f: Field<T>; opt?: boolean } => ({ f });
export const opt = <T>(f: Field<T>): { f: Field<T>; opt: boolean } => ({ f, opt: true });

/** Serialises async work (one writer per election). */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  pending = 0;
  run<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    const p = this.tail.then(fn, fn);
    this.tail = p.then(() => undefined, () => undefined).finally(() => {
      this.pending--;
    });
    return p;
  }
}

export function toIso(sec: number): string {
  return new Date(sec * 1000).toISOString().replace('.000Z', 'Z');
}
