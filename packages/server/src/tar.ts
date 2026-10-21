// Deterministic POSIX ustar writer/reader (mtime 0, uid/gid 0, sorted names) for .qvb bundles (QV-18 §12).
import { utf8 } from '@quietvote/crypto';

function octal(n: number, len: number): Uint8Array {
  return utf8(n.toString(8).padStart(len - 1, '0') + '\0');
}

export function writeTar(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : 1));
  const parts: Uint8Array[] = [];
  for (const f of sorted) {
    const nameB = utf8(f.name);
    if (nameB.length > 100) throw new Error('tar name too long');
    const h = new Uint8Array(512);
    h.set(nameB, 0);
    h.set(octal(0o644, 8), 100);
    h.set(octal(0, 8), 108);
    h.set(octal(0, 8), 116);
    h.set(octal(f.data.length, 12), 124);
    h.set(octal(0, 12), 136);
    h.fill(0x20, 148, 156);
    h[156] = 0x30;
    h.set(utf8('ustar\0'), 257);
    h.set(utf8('00'), 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.set(utf8(sum.toString(8).padStart(6, '0') + '\0 '), 148);
    parts.push(h, f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function readTar(buf: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  let o = 0;
  while (o + 512 <= buf.length) {
    const h = buf.subarray(o, o + 512);
    if (h.every((b) => b === 0)) break;
    const name = dec.decode(h.subarray(0, 100)).replace(/\0.*$/, '');
    const size = parseInt(dec.decode(h.subarray(124, 136)).replace(/\0.*$/, '').trim() || '0', 8);
    if (name.includes('..') || name.startsWith('/')) throw new Error('unsafe tar path');
    out.set(name, buf.slice(o + 512, o + 512 + size));
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

export class TarError extends Error {}

/**
 * Strict reader for untrusted bundles (POST /imports). Accepts only what `writeTar` produces and what POSIX tools emit for plain
 * files: regular entries (typeflag 0), header checksum verified, safe relative names, no ustar prefix, no duplicates, sizes inside
 * the buffer, nothing after the two zero blocks. Entries are views into `buf` (no copies).
 */
export function readTarStrict(buf: Uint8Array, limits: { maxFiles: number }): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder('utf-8', { fatal: true });
  const NAME = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
  let o = 0;
  for (;;) {
    if (o + 1024 <= buf.length && buf.subarray(o, o + 1024).every((b) => b === 0)) {
      if (buf.subarray(o + 1024).some((b) => b !== 0)) throw new TarError('data after the end-of-archive marker');
      return out;
    }
    if (o + 512 > buf.length) throw new TarError('truncated archive (no end-of-archive marker)');
    const h = buf.subarray(o, o + 512);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]!;
    const cs = dec.decode(h.subarray(148, 156)).replace(/[\0 ]+$/, '').replace(/^ +/, '');
    if (!/^[0-7]{1,7}$/.test(cs) || parseInt(cs, 8) !== sum) throw new TarError('bad header checksum');
    const nul = h.subarray(0, 100).indexOf(0);
    let name: string;
    try {
      name = dec.decode(h.subarray(0, nul < 0 ? 100 : nul));
    } catch {
      throw new TarError('file name is not valid UTF-8');
    }
    if (name.length === 0 || name.length > 100 || !NAME.test(name) || name.split('/').some((p) => p === '.' || p === '..')) throw new TarError('unsafe file name');
    if (h[156] !== 0x30 && h[156] !== 0) throw new TarError(`only regular files are accepted (${name})`);
    if (dec.decode(h.subarray(257, 262)) !== 'ustar') throw new TarError('not a ustar archive');
    if (h.subarray(345, 500).some((b) => b !== 0)) throw new TarError('ustar prefix names are not accepted');
    const ss = dec.decode(h.subarray(124, 136)).replace(/[\0 ]+$/, '').replace(/^ +/, '');
    if (!/^[0-7]{1,11}$/.test(ss)) throw new TarError('bad size field');
    const size = parseInt(ss, 8);
    if (o + 512 + size > buf.length) throw new TarError('file data runs past the end of the archive');
    if (out.has(name)) throw new TarError(`duplicate file ${name}`);
    if (out.size >= limits.maxFiles) throw new TarError('too many files');
    out.set(name, buf.subarray(o + 512, o + 512 + size));
    o += 512 + Math.ceil(size / 512) * 512;
    if (o > buf.length) throw new TarError('truncated archive padding');
  }
}
