// SPDX-License-Identifier: AGPL-3.0-or-later
// Bounded local inputs for the report-only release tools; no network or signing.
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const EXPERIMENTAL_BANNER = 'Experimental — not for binding elections';
export const REVIEW_QUALIFICATION = 'QuietVote has not yet been independently reviewed.';

export class InputError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Check the final file both before and after opening, then hash at most maxBytes. */
export function readRegular(path, { maxBytes = 1024 * 1024, text = false } = {}) {
  let fd;
  try {
    const before = lstatSync(path, { bigint: true });
    if (before.isSymbolicLink()) throw new InputError('symlink');
    if (!before.isFile()) throw new InputError('not_regular');
    if (before.size === 0n) throw new InputError('empty');
    if (before.size > BigInt(maxBytes)) throw new InputError('too_large');
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new InputError('changed');
    const hash = createHash('sha256'), chunks = [], buffer = Buffer.alloc(64 * 1024);
    let bytes = 0;
    for (;;) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, maxBytes + 1 - bytes), null);
      if (count === 0) break;
      bytes += count;
      if (bytes > maxBytes) throw new InputError('too_large');
      hash.update(buffer.subarray(0, count));
      if (text) chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const after = fstatSync(fd, { bigint: true }), named = lstatSync(path, { bigint: true });
    if (bytes !== Number(before.size) || after.size !== before.size || after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs || named.isSymbolicLink() || named.dev !== opened.dev || named.ino !== opened.ino) {
      throw new InputError('changed');
    }
    const result = { bytes, sha256: hash.digest('hex') };
    if (text) {
      try { result.text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
      catch { throw new InputError('invalid_utf8'); }
    }
    return result;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(error?.code === 'ENOENT' ? 'missing' : 'unreadable');
  } finally { if (fd !== undefined) closeSync(fd); }
}

/** Evidence names are portable, root-relative paths, with no parent or symlink traversal. */
export function evidencePath(root, name) {
  if (typeof name !== 'string' || name.length > 240 || isAbsolute(name) ||
      !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(name) || name.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new InputError('invalid_evidence_path');
  }
  const base = realpathSync(resolve(root));
  let path = base;
  for (const part of name.split('/')) {
    path = join(path, part);
    try {
      if (lstatSync(path).isSymbolicLink()) throw new InputError('symlink');
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (error?.code !== 'ENOENT') throw new InputError('unreadable');
    }
  }
  return path;
}
