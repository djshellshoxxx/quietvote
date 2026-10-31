// Runtime support for build-precompiled ICU messages. This module deliberately imports
// only the evaluator; parsing stays in the source/test and build-time paths.
import { evaluate, type Args, type FormatOptions, type Node } from './icu.ts';

export type CompiledFormatter = (args: Args, options: FormatOptions) => string;

const formatters = new Map<string, CompiledFormatter>();

/** Turn a build-emitted AST into a formatter backed by the regular ICU evaluator. */
export function compiledFormatter(ast: readonly Node[]): CompiledFormatter {
  return (args, options) => evaluate(ast, args, options);
}

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
