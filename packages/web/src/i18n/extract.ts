import ts from 'typescript';

export interface MessageReference { file: string; line: number; key: string }
export interface DynamicReference { file: string; line: number; expression: string; reason: string }
export type ResolvedForm = 'object-map' | 'conditional' | 'template-pattern' | 'literal';
/** A translator call whose argument was statically resolved to a bounded set of keys. */
export interface ResolvedReference { file: string; line: number; expression: string; form: ResolvedForm; keys: string[]; patterns: string[] }
export interface UnknownResolvedReference extends MessageReference { reason: string }

type Alt = (string | null)[]; // null = wildcard segment
type Resolution = { alts: Alt[]; form: ResolvedForm } | { reason: string };

function unwrap(node: ts.Node): ts.Expression {
  let n = node as ts.Expression;
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression;
  return n;
}

function resolveExpression(node: ts.Expression): Resolution {
  const e = unwrap(node);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { alts: [[e.text]], form: 'literal' };
  if (ts.isConditionalExpression(e)) {
    const a = resolveExpression(e.whenTrue);
    if ('reason' in a) return a;
    const b = resolveExpression(e.whenFalse);
    if ('reason' in b) return b;
    return { alts: [...a.alts, ...b.alts], form: 'conditional' };
  }
  if (ts.isElementAccessExpression(e) && ts.isObjectLiteralExpression(unwrap(e.expression))) {
    const alts: Alt[] = [];
    for (const prop of (unwrap(e.expression) as ts.ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(prop)) return { reason: 'object map entry is not a plain property' };
      const v = resolveExpression(prop.initializer);
      if ('reason' in v) return { reason: `object map value not statically resolvable: ${v.reason}` };
      alts.push(...v.alts);
    }
    return alts.length ? { alts, form: 'object-map' } : { reason: 'empty object map' };
  }
  if (ts.isTemplateExpression(e)) {
    let alts: Alt[] = [[e.head.text]];
    for (const span of e.templateSpans) {
      const inner = resolveExpression(span.expression);
      const options: Alt[] = 'reason' in inner || inner.alts.some((a) => a.includes(null)) ? [[null]] : inner.alts;
      alts = alts.flatMap((prefix) => options.map((o) => [...prefix, ...o, span.literal.text]));
    }
    return { alts, form: 'template-pattern' };
  }
  if (ts.isIdentifier(e)) return { reason: 'bare identifier' };
  if (ts.isCallExpression(e)) return { reason: 'call expression' };
  return { reason: 'unsupported expression' };
}

const patternOf = (alt: Alt): string => alt.map((p) => p ?? '*').join('');
function patternRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`);
}

function isTranslatorCall(node: ts.CallExpression): boolean {
  const e = node.expression;
  return (ts.isIdentifier(e) && e.text === 't') || (ts.isPropertyAccessExpression(e) && e.name.text === 't');
}

function isVerifyViewDeclaration(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) return node.name?.text === 'verifyView';
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'verifyView' && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
}

/** Find static catalog keys and dynamic translator calls. Results are stable regardless of input order. */
export function extractReferences(files: Readonly<Record<string, string>>, catalog?: Readonly<Record<string, unknown>>): { static: MessageReference[]; dynamic: DynamicReference[]; resolved: ResolvedReference[] } {
  const catalogKeys = catalog ? Object.keys(catalog).sort() : [];
  const resolved: ResolvedReference[] = [];
  const statics: MessageReference[] = [];
  const dynamics: DynamicReference[] = [];
  for (const file of Object.keys(files).sort()) {
    const source = ts.createSourceFile(file, files[file]!, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (isVerifyViewDeclaration(node)) return;
      if (ts.isCallExpression(node) && isTranslatorCall(node)) {
        const first = node.arguments[0];
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          statics.push({ file, line, key: first.text });
        } else if (!first) {
          dynamics.push({ file, line, expression: '(missing argument)', reason: 'missing argument' });
        } else {
          const r = resolveExpression(first);
          if ('reason' in r) dynamics.push({ file, line, expression: first.getText(source), reason: r.reason });
          else {
            const exact = new Set<string>();
            const patterns = new Set<string>();
            for (const alt of r.alts) {
              if (alt.includes(null)) {
                const pattern = patternOf(alt);
                patterns.add(pattern);
                const re = patternRegex(pattern);
                for (const k of catalogKeys) if (re.test(k)) exact.add(k);
              } else exact.add(alt.join(''));
            }
            resolved.push({ file, line, expression: first.getText(source), form: r.form, keys: [...exact].sort(), patterns: [...patterns].sort() });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const byRef = (a: MessageReference, b: MessageReference): number => a.file.localeCompare(b.file) || a.line - b.line || a.key.localeCompare(b.key);
  statics.sort(byRef);
  dynamics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.expression.localeCompare(b.expression));
  resolved.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { static: statics, dynamic: dynamics, resolved };
}

export function unknownReferences(refs: readonly MessageReference[], catalog: Readonly<Record<string, unknown>>): MessageReference[] {
  const known = new Set(Object.keys(catalog));
  return refs.filter((r) => !known.has(r.key));
}

/** Errors among resolved references: exact keys missing from the catalog and template patterns matching no catalog key. */
export function unknownResolvedReferences(refs: readonly ResolvedReference[], catalog: Readonly<Record<string, unknown>>): UnknownResolvedReference[] {
  const known = new Set(Object.keys(catalog));
  const out: UnknownResolvedReference[] = [];
  for (const r of refs) {
    for (const pattern of r.patterns) {
      const re = patternRegex(pattern);
      if (![...known].some((k) => re.test(k))) out.push({ file: r.file, line: r.line, key: pattern, reason: 'template pattern matches no catalog keys' });
    }
    for (const key of r.keys) if (!known.has(key)) out.push({ file: r.file, line: r.line, key, reason: 'resolved key not in catalog' });
  }
  return out;
}
