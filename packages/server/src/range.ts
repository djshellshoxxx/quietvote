// HTTP Range for export downloads (RFC 9110 §14; QV-09 §10 "supports Range"; QV-09 §13 "Mass export abuse").
// Exactly one byte range is served. Anything that could make the server do more work than one contiguous slice of an
// in-memory buffer (several ranges, overlapping ranges, absurd header sizes) is refused with 416, never expanded.
export type RangeOutcome =
  | { kind: 'ignore' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' };

const MAX_HEADER = 128;
const SPEC = /^(?:(\d{1,15})-(\d{0,15})|-(\d{1,15}))$/;

/**
 * `ignore`: no Range header, or a range unit other than `bytes` (RFC 9110: MUST be ignored) -> serve 200.
 * `unsatisfiable`: malformed bytes ranges, more than one range, start beyond the end, empty suffix, empty representation -> 416.
 * `partial`: inclusive [start, end] clamped to the representation.
 */
export function parseRange(header: string | undefined, length: number): RangeOutcome {
  if (header === undefined) return { kind: 'ignore' };
  const h = header.trim();
  const m = /^([A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*)\s*=(.*)$/.exec(h.length > MAX_HEADER ? h.slice(0, MAX_HEADER) : h);
  if (m === null) return { kind: 'unsatisfiable' };
  if (m[1]!.toLowerCase() !== 'bytes') return { kind: 'ignore' };
  if (h.length > MAX_HEADER) return { kind: 'unsatisfiable' };
  const spec = m[2]!.trim();
  if (spec.includes(',')) return { kind: 'unsatisfiable' }; // single range only: no multipart/byteranges, no amplification
  const r = SPEC.exec(spec);
  if (r === null) return { kind: 'unsatisfiable' };
  if (length === 0) return { kind: 'unsatisfiable' };
  if (r[3] !== undefined) {
    const n = Number(r[3]);
    if (n === 0) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Math.max(0, length - n), end: length - 1 };
  }
  const first = Number(r[1]);
  const last = r[2] === '' ? undefined : Number(r[2]);
  if (!Number.isSafeInteger(first) || (last !== undefined && (!Number.isSafeInteger(last) || last < first))) return { kind: 'unsatisfiable' };
  if (first >= length) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start: first, end: last === undefined ? length - 1 : Math.min(last, length - 1) };
}

/** If-Range (RFC 9110 §13.1.5): only a strong entity-tag match keeps the range; dates and weak tags make the response a full 200. */
export function ifRangeHolds(ifRange: string | undefined, etag: string | undefined): boolean {
  if (ifRange === undefined) return true;
  const v = ifRange.trim();
  return etag !== undefined && !v.startsWith('W/') && !etag.startsWith('W/') && v === etag;
}
