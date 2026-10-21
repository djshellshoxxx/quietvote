// Hand-rolled argument parser (zero dependencies). Per-command flag specs; unknown flags are usage errors.
export class UsageError extends Error {}
export class InputError extends Error {}
export class FailError extends Error {}

export type FlagKind = 'bool' | 'value' | 'multi';
export type FlagSpec = Readonly<Record<string, FlagKind>>;

export interface Parsed {
  positional: string[];
  has(name: string): boolean;
  /** Last value of a `value` flag. */
  get(name: string): string | undefined;
  /** All values of a `multi` flag, in order. */
  all(name: string): string[];
}

export function parseArgs(argv: readonly string[], spec: FlagSpec): Parsed {
  const positional: string[] = [];
  const values = new Map<string, string[]>();
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!a.startsWith('--') || a.length === 2) {
      if (a.startsWith('-') && a.length > 1) throw new UsageError(`unknown option ${a} (long options only)`);
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
    const kind = Object.hasOwn(spec, name) ? spec[name] : undefined;
    if (kind === undefined) throw new UsageError(`unknown option --${name}`);
    seen.add(name);
    if (kind === 'bool') {
      if (eq !== -1) throw new UsageError(`option --${name} takes no value`);
      continue;
    }
    let v: string | undefined;
    if (eq !== -1) v = a.slice(eq + 1);
    else {
      v = argv[++i];
      if (v === undefined) throw new UsageError(`option --${name} needs a value`);
    }
    const list = values.get(name) ?? [];
    if (kind === 'value' && list.length > 0) throw new UsageError(`option --${name} given twice`);
    list.push(v);
    values.set(name, list);
  }
  return {
    positional,
    has: (n) => seen.has(n),
    get: (n) => values.get(n)?.at(-1),
    all: (n) => values.get(n) ?? [],
  };
}

export function needPositional(p: Parsed, n: number, what: string): string[] {
  if (p.positional.length !== n) throw new UsageError(`expected ${what}`);
  return p.positional;
}

export function needFlag(p: Parsed, name: string): string {
  const v = p.get(name);
  if (v === undefined) throw new UsageError(`--${name} is required`);
  return v;
}
