// ICU MessageFormat subset (QV-13 §9.2): {arg}, {n, number[, percent|latn|integer]}, {d, date|time[, short|medium|long]},
// {l, list}, {n, plural|selectordinal, =N{..} one{..} other{..}} with `#`, {s, select, a{..} other{..}}. Apostrophe quoting follows
// ICU "DOUBLE_OPTIONAL": '' is an apostrophe, ' only quotes when directly followed by { } or #.
// parse() is build/test-time tooling; the runtime evaluates the resulting AST (no parsing of attacker-influenced text happens
// at runtime: catalogs are part of the signed bundle).

export type Node =
  | { k: 'text'; v: string }
  | { k: 'arg'; name: string }
  | { k: 'num'; name: string; style: string }
  | { k: 'date'; name: string; kind: 'date' | 'time'; style: string }
  | { k: 'list'; name: string }
  | { k: 'hash' }
  | { k: 'plural'; name: string; ordinal: boolean; offset: number; cases: Record<string, Node[]> }
  | { k: 'select'; name: string; cases: Record<string, Node[]> };

export class IcuSyntaxError extends Error {
  readonly pos: number;
  constructor(message: string, pos: number) {
    super(`${message} at ${pos}`);
    this.name = 'IcuSyntaxError';
    this.pos = pos;
  }
}

export function parse(src: string): Node[] {
  let i = 0;
  const err = (m: string): never => {
    throw new IcuSyntaxError(m, i);
  };
  const ws = (): void => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const ident = (): string => {
    ws();
    const s = i;
    while (i < src.length && /[A-Za-z0-9_.\-]/.test(src[i]!)) i++;
    if (i === s) err('identifier expected');
    return src.slice(s, i);
  };

  function seq(inPlural: boolean, until: '}' | undefined): Node[] {
    const out: Node[] = [];
    let text = '';
    const flush = (): void => {
      if (text !== '') out.push({ k: 'text', v: text });
      text = '';
    };
    while (i < src.length) {
      const c = src[i]!;
      if (c === "'") {
        if (src[i + 1] === "'") {
          text += "'";
          i += 2;
        } else if (src[i + 1] === '{' || src[i + 1] === '}' || (inPlural && src[i + 1] === '#')) {
          i++;
          while (i < src.length && src[i] !== "'") text += src[i++];
          if (src[i] !== "'") err('unterminated quote');
          i++;
        } else {
          text += c;
          i++;
        }
      } else if (c === '{') {
        flush();
        out.push(argument(inPlural));
      } else if (c === '}') {
        if (until === '}') break;
        err('unexpected }');
      } else if (c === '#' && inPlural) {
        flush();
        out.push({ k: 'hash' });
        i++;
      } else {
        text += c;
        i++;
      }
    }
    flush();
    return out;
  }

  function cases(inPlural: boolean, allowEq: boolean): { cases: Record<string, Node[]>; offset: number } {
    const res: Record<string, Node[]> = {};
    let offset = 0;
    ws();
    if (src.startsWith('offset:', i)) {
      i += 7;
      ws();
      const s = i;
      while (/[0-9]/.test(src[i] ?? '')) i++;
      offset = Number(src.slice(s, i));
    }
    for (;;) {
      ws();
      if (src[i] === '}') break;
      let key: string;
      if (allowEq && src[i] === '=') {
        i++;
        const s = i;
        while (/[0-9]/.test(src[i] ?? '')) i++;
        key = `=${src.slice(s, i)}`;
      } else key = ident();
      ws();
      if (src[i] !== '{') err('{ expected');
      i++;
      res[key] = seq(inPlural, '}');
      if (src[i] !== '}') err('} expected');
      i++;
    }
    if (res.other === undefined) err('missing "other" case');
    return { cases: res, offset };
  }

  function argument(inPlural: boolean): Node {
    i++; // {
    const name = ident();
    ws();
    if (src[i] === '}') {
      i++;
      return { k: 'arg', name };
    }
    if (src[i] !== ',') err(', or } expected');
    i++;
    const type = ident();
    ws();
    let node: Node;
    if (type === 'plural' || type === 'selectordinal' || type === 'select') {
      if (src[i] !== ',') err(', expected');
      i++;
      const c = cases(type === 'select' ? inPlural : true, type !== 'select');
      node = type === 'select' ? { k: 'select', name, cases: c.cases } : { k: 'plural', name, ordinal: type === 'selectordinal', offset: c.offset, cases: c.cases };
      if (src[i] !== '}') err('} expected');
      i++;
      return node;
    }
    let style = '';
    if (src[i] === ',') {
      i++;
      style = ident();
    }
    ws();
    if (src[i] !== '}') err('} expected');
    i++;
    if (type === 'number') return { k: 'num', name, style };
    if (type === 'date' || type === 'time') return { k: 'date', name, kind: type, style };
    if (type === 'list') return { k: 'list', name };
    return err(`unknown argument type ${type}`);
  }

  const out = seq(false, undefined);
  if (i < src.length) err('trailing input');
  return out;
}

/** Argument names used by a parsed message (for catalog linting). */
export function argNames(nodes: readonly Node[], acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.k === 'arg' || n.k === 'num' || n.k === 'date' || n.k === 'list') acc.add(n.name);
    else if (n.k === 'plural' || n.k === 'select') {
      acc.add(n.name);
      for (const c of Object.values(n.cases)) argNames(c, acc);
    }
  }
  return acc;
}

export type ArgValue = string | number | Date | readonly string[] | boolean;
export type Args = Readonly<Record<string, ArgValue>>;

const FSI = '⁨';
const PDI = '⁩';

export interface FormatOptions {
  locale: string;
  /** Wrap string arguments in FSI..PDI (QV-13-REQ-083). Default true. */
  isolate?: boolean;
  timeZone?: string;
}

export function evaluate(nodes: readonly Node[], args: Args, o: FormatOptions, hashValue?: string): string {
  const isolate = o.isolate !== false;
  let out = '';
  const need = (name: string): ArgValue => {
    const v = args[name];
    if (v === undefined) throw new Error(`missing message argument "${name}"`);
    return v;
  };
  for (const n of nodes) {
    switch (n.k) {
      case 'text':
        out += n.v;
        break;
      case 'hash':
        out += hashValue ?? '#';
        break;
      case 'arg': {
        const v = need(n.name);
        const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(', ') : String(v);
        out += typeof v === 'string' && isolate ? `${FSI}${s}${PDI}` : s;
        break;
      }
      case 'num': {
        const v = Number(need(n.name));
        const opts: Intl.NumberFormatOptions = n.style === 'percent' ? { style: 'percent', maximumFractionDigits: 1 } : n.style === 'integer' ? { maximumFractionDigits: 0 } : {};
        const loc = n.style === 'latn' ? withLatn(o.locale) : o.locale;
        out += new Intl.NumberFormat(loc, opts).format(v);
        break;
      }
      case 'date': {
        const raw = need(n.name);
        const d = raw instanceof Date ? raw : new Date(raw as string | number);
        const style = (n.style === 'short' || n.style === 'medium' || n.style === 'long' ? n.style : 'medium') as 'short' | 'medium' | 'long';
        const f: Intl.DateTimeFormatOptions = n.kind === 'date' ? { dateStyle: style } : { timeStyle: style };
        if (o.timeZone !== undefined) f.timeZone = o.timeZone;
        out += new Intl.DateTimeFormat(o.locale, f).format(d);
        break;
      }
      case 'list': {
        const v = need(n.name);
        const items = (Array.isArray(v) ? v : [String(v)]) as string[];
        out += new Intl.ListFormat(o.locale, { type: 'conjunction' }).format(items.map((x) => (isolate ? `${FSI}${x}${PDI}` : x)));
        break;
      }
      case 'select': {
        const key = String(need(n.name));
        out += evaluate(n.cases[key] ?? n.cases.other!, args, o, hashValue);
        break;
      }
      case 'plural': {
        const v = Number(need(n.name)) - n.offset;
        const exact = n.cases[`=${v + n.offset}`];
        const cat = new Intl.PluralRules(o.locale, { type: n.ordinal ? 'ordinal' : 'cardinal' }).select(v);
        const body = exact ?? n.cases[cat] ?? n.cases.other!;
        out += evaluate(body, args, o, new Intl.NumberFormat(o.locale).format(v));
        break;
      }
    }
  }
  return out;
}

function withLatn(locale: string): string {
  return locale.includes('-u-') ? locale : `${locale}-u-nu-latn`;
}

export function format(src: string, args: Args, o: FormatOptions): string {
  return evaluate(parse(src), args, o);
}
