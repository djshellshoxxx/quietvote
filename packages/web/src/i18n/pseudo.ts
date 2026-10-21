// Pseudo-locales en-XA (accented, +40% longer) and ar-XB (RTL pseudo) for CI layout checks (QV-13-REQ-065). Test only.
import { parse, type Node } from './icu.ts';

const ACCENT: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ',
  q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
};
const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

function mapText(s: string, f: (c: string, i: number) => string): string {
  return [...s].map(f).join('');
}

function pad(s: string): string {
  const extra = Math.ceil(s.length * 0.4);
  return s + '·'.repeat(extra);
}

function transform(nodes: readonly Node[], text: (v: string) => string): string {
  let out = '';
  for (const n of nodes) {
    if (n.k === 'text') out += text(n.v).replace(/[{}']/g, (c) => (c === "'" ? "''" : `'${c}'`));
    else if (n.k === 'arg') out += `{${n.name}}`;
    else if (n.k === 'num') out += `{${n.name}, number${n.style ? `, ${n.style}` : ''}}`;
    else if (n.k === 'date') out += `{${n.name}, ${n.kind}${n.style ? `, ${n.style}` : ''}}`;
    else if (n.k === 'list') out += `{${n.name}, list}`;
    else if (n.k === 'hash') out += '#';
    else {
      const kind = n.k === 'select' ? 'select' : n.ordinal ? 'selectordinal' : 'plural';
      const cs = Object.entries(n.cases).map(([k, v]) => `${k} {${transform(v, text)}}`).join(' ');
      out += `{${n.name}, ${kind},${n.k === 'plural' && n.offset ? ` offset:${n.offset}` : ''} ${cs}}`;
    }
  }
  return out;
}

export function pseudoEnXA(message: string): string {
  return `[${transform(parse(message), (t) => pad(mapText(t, (c) => ACCENT[c] ?? ACCENT[c.toLowerCase()]?.toUpperCase() ?? c)))}]`;
}

export function pseudoArXB(message: string): string {
  return `‏${transform(parse(message), (t) => pad(mapText(t, (c, i) => (/[a-z]/i.test(c) ? ARABIC[(c.toLowerCase().charCodeAt(0) + i) % ARABIC.length]! : c))))}‏`;
}
