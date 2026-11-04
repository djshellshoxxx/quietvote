// Runtime support for build-precompiled ICU messages. This module deliberately imports
// only the evaluator; parsing stays in the source/test and build-time paths.
import { evaluate, type Args, type FormatOptions, type Node } from './icu.ts';

export type CompiledFormatter = (args: Args, options: FormatOptions) => string;

const formatters = new Map<string, CompiledFormatter>();

/** Turn a build-emitted AST into a formatter backed by the regular ICU evaluator. */
export function compiledFormatter(ast: readonly Node[]): CompiledFormatter {
  return (args, options) => evaluate(ast, args, options);
}

/** Compact build-emitted AST: text is a bare string; other nodes are tuples led by a numeric tag (see build/precompile.ts). */
export type CompactNode = string | readonly [number, ...unknown[]];

const expand = (c: readonly CompactNode[]): Node[] => c.map((n): Node => {
  if (typeof n === 'string') return { k: 'text', v: n };
  const cases = (o: unknown): Record<string, Node[]> => Object.fromEntries(Object.entries(o as Record<string, CompactNode[]>).map(([k, v]) => [k, expand(v)]));
  switch (n[0]) {
    case 0: return { k: 'arg', name: n[1] as string };
    case 1: return { k: 'num', name: n[1] as string, style: n[2] as string };
    case 2: return { k: 'date', name: n[1] as string, kind: n[2] as 'date' | 'time', style: n[3] as string };
    case 3: return { k: 'list', name: n[1] as string };
    case 4: return { k: 'hash' };
    case 5: return { k: 'plural', name: n[1] as string, ordinal: n[2] === 1, offset: n[3] as number, cases: cases(n[4]) };
    default: return { k: 'select', name: n[1] as string, cases: cases(n[2]) };
  }
});

export const compactFormatter = (c: readonly CompactNode[]): CompiledFormatter => compiledFormatter(expand(c));

/** Register message source strings and their build-emitted formatter functions. */
export function registerCompiledMessages(
  messages: Readonly<Record<string, string | { message: string }>>,
  byKey: Readonly<Record<string, CompiledFormatter>>,
  buildValidatedTextLiterals = false,
): void {
  for (const [key, value] of Object.entries(messages)) {
    const source = typeof value === 'string' ? value : value.message;
    const formatter = byKey[key];
    if (formatter !== undefined) formatters.set(source, formatter);
    else if (buildValidatedTextLiterals) formatters.set(source, () => source);
  }
}

export function formatCompiled(source: string, args: Args, options: FormatOptions): string {
  const formatter = formatters.get(source);
  if (formatter === undefined) throw new Error('message was not precompiled into this bundle');
  return formatter(args, options);
}
