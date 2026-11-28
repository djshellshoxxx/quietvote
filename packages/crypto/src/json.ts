import { QvCryptoError } from './errors.ts';
import { utf8 } from './bytes.ts';

/** QV-JSON value domain (QV-16 §5.5): no null, no floats, safe integers only. */
export type QvJson = boolean | number | string | QvJson[] | { [k: string]: QvJson };

/** Unsigned container values. This is deliberately separate from the signed QV-JSON domain. */
export type JsonContainerValue = boolean | number | string | null | JsonContainerValue[] | { [k: string]: JsonContainerValue };
export type JsonContainerPath = readonly (string | number)[];

export const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_DEPTH = 32;

function fail(msg: string): never {
  throw new QvCryptoError('E_PARSE', msg);
}

/** Decode UTF-8 strictly (fatal on invalid sequences), reject a BOM. */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return fail('invalid UTF-8');
  }
  if (s.charCodeAt(0) === 0xfeff) fail('BOM not allowed');
  return s;
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/**
 * Strict QV-JSON parser. Rejects: invalid UTF-8/BOM, duplicate keys at any depth, null, floats, exponents,
 * "-0", integers outside the safe range, lone surrogates (raw or \u-escaped), non-NFC strings, trailing data,
 * nesting deeper than 32. (QV-16 §5.5 items 1, 2, 4.)
 */
export function parseQvJson(input: string | Uint8Array): QvJson {
  return parseJsonProfile(input) as QvJson;
}

/**
 * Container-only exception: a trusted schema predicate must explicitly return true for each allowed null path.
 * Array indexes are numbers; object keys are strings. All other QV-JSON parsing rules still apply.
 * Never use this entry point for signed artifacts; parseQvJson and canonicalize keep their no-null domain.
 */
export function parseJsonContainer(input: string | Uint8Array, allowNullAt: (path: JsonContainerPath) => boolean): JsonContainerValue {
  if (typeof allowNullAt !== 'function') return fail('container null predicate required');
  return parseJsonProfile(input, allowNullAt);
}

function parseJsonProfile(input: string | Uint8Array, allowNullAt?: (path: JsonContainerPath) => boolean): JsonContainerValue {
  const text = typeof input === 'string' ? input : decodeUtf8Strict(input);
  if (text.charCodeAt(0) === 0xfeff) fail('BOM not allowed');
  let pos = 0;
  const path: (string | number)[] = [];

  const ws = (): void => {
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++;
      else break;
    }
  };

  const parseString = (): string => {
    if (text[pos] !== '"') fail('expected string');
    pos++;
    let out = '';
    for (;;) {
      if (pos >= text.length) fail('unterminated string');
      const ch = text[pos]!;
      const code = ch.charCodeAt(0);
      if (ch === '"') {
        pos++;
        break;
      }
      if (code < 0x20) fail('control character in string');
      if (ch === '\\') {
        pos++;
        const e = text[pos++];
        switch (e) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = text.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          }
          default:
            fail('bad escape');
        }
      } else {
        out += ch;
        pos++;
      }
    }
    if (hasLoneSurrogate(out)) fail('lone surrogate');
    if (out !== out.normalize('NFC')) fail('string is not NFC');
    return out;
  };

  const parseNumber = (): number => {
    const m = /^-?(0|[1-9][0-9]*)/.exec(text.slice(pos, pos + 32));
    if (m === null) fail('bad number');
    const tok = m[0];
    const next = text[pos + tok.length];
    if (next === '.' || next === 'e' || next === 'E') fail('floats/exponents not allowed');
    if (tok === '-0') fail('negative zero not allowed');
    const n = Number(tok);
    if (!Number.isSafeInteger(n)) fail('integer outside safe range');
    pos += tok.length;
    return n;
  };

  const parseValue = (depth: number): JsonContainerValue => {
    if (depth > MAX_DEPTH) fail('nesting too deep');
    ws();
    const c = text[pos];
    if (c === '{') {
      pos++;
      const obj: { [k: string]: JsonContainerValue } = Object.create(null) as { [k: string]: JsonContainerValue };
      ws();
      if (text[pos] === '}') {
        pos++;
        return obj;
      }
      for (;;) {
        ws();
        const k = parseString();
        if (Object.prototype.hasOwnProperty.call(obj, k)) fail('duplicate key');
        ws();
        if (text[pos++] !== ':') fail('expected :');
        path.push(k);
        obj[k] = parseValue(depth + 1);
        path.pop();
        ws();
        const d = text[pos++];
        if (d === ',') continue;
        if (d === '}') break;
        fail('expected , or }');
      }
      return obj;
    }
    if (c === '[') {
      pos++;
      const arr: JsonContainerValue[] = [];
      ws();
      if (text[pos] === ']') {
        pos++;
        return arr;
      }
      for (;;) {
        path.push(arr.length);
        arr.push(parseValue(depth + 1));
        path.pop();
        ws();
        const d = text[pos++];
        if (d === ',') continue;
        if (d === ']') break;
        fail('expected , or ]');
      }
      return arr;
    }
    if (c === '"') return parseString();
    if (text.startsWith('true', pos)) {
      pos += 4;
      return true;
    }
    if (text.startsWith('false', pos)) {
      pos += 5;
      return false;
    }
    if (text.startsWith('null', pos)) {
      // Give the trusted predicate a snapshot, never the parser's mutable traversal stack.
      if (allowNullAt?.([...path]) !== true) return fail('null not allowed');
      pos += 4;
      return null;
    }
    return parseNumber();
  };

  const v = parseValue(0);
  ws();
  if (pos !== text.length) fail('trailing data');
  return v;
}

/** RFC 8785 serialisation of a QV-JSON value (strict profile: integers only). Throws on out-of-profile input. */
export function canonicalize(v: unknown): string {
  return ser(v, 0);
}

function ser(v: unknown, depth: number): string {
  if (depth > MAX_DEPTH) fail('nesting too deep');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || Object.is(v, -0)) return fail('number outside QV-JSON profile');
    return String(v);
  }
  if (typeof v === 'string') return serString(v);
  if (Array.isArray(v)) return '[' + v.map((x) => ser(x, depth + 1)).join(',') + ']';
  if (typeof v === 'object' && v !== null) {
    // C5: only plain (or null-prototype) objects; Map, typed arrays, Date etc. would otherwise serialise silently.
    const proto = Object.getPrototypeOf(v) as unknown;
    if (proto !== Object.prototype && proto !== null) fail('value outside QV-JSON profile');
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort(); // default sort = UTF-16 code unit order, as RFC 8785 requires
    const parts: string[] = [];
    for (const k of keys) {
      serString(k);
      if (o[k] === undefined) fail('undefined value');
      parts.push(JSON.stringify(k) + ':' + ser(o[k], depth + 1));
    }
    return '{' + parts.join(',') + '}';
  }
  return fail('value outside QV-JSON profile');
}

/** C5: the same string rules parseQvJson enforces (no lone surrogate, NFC), so canonicalize never emits what the parser rejects. */
function serString(s: string): string {
  if (hasLoneSurrogate(s)) fail('lone surrogate');
  if (s !== s.normalize('NFC')) fail('string is not NFC');
  return JSON.stringify(s);
}

/** JCS(v) as UTF-8 bytes. */
export function jcs(v: unknown): Uint8Array {
  return utf8(canonicalize(v));
}
