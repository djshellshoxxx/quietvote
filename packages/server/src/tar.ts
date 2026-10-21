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

/**
 * Reads the subset of ustar that writeTar emits. Hostile input is rejected rather than interpreted: sizes must be plain octal
 * digits and fit inside the archive, names may not be absolute, contain `.`/`..`/empty segments or backslashes, and a name may
 * appear once (a duplicate would let a later member silently replace an earlier, already-checksummed one).
 */
export function readTar(buf: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  let o = 0;
  while (o + 512 <= buf.length) {
    const h = buf.subarray(o, o + 512);
    if (h.every((b) => b === 0)) break;
    const name = dec.decode(h.subarray(0, 100)).replace(/\0.*$/, '');
    const sizeField = dec.decode(h.subarray(124, 136)).replace(/\0.*$/, '').trim();
    if (!/^[0-7]{1,11}$/.test(sizeField)) throw new Error('bad tar size field');
    const size = parseInt(sizeField, 8);
    if (name === '' || name.startsWith('/') || name.includes('\\') || name.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) throw new Error('unsafe tar path');
    if (out.has(name)) throw new Error('duplicate tar member');
    if (o + 512 + size > buf.length) throw new Error('truncated tar member');
    out.set(name, buf.slice(o + 512, o + 512 + size));
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
