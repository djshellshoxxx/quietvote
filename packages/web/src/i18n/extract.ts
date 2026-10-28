import ts from 'typescript';

export interface MessageReference { file: string; line: number; key: string }
export interface DynamicReference { file: string; line: number; expression: string; reason: string }
export type ResolvedForm = 'object-map' | 'conditional' | 'template-pattern' | 'literal' | 'binding' | 'array-element' | 'call';
/** A translator call whose argument was statically resolved to a bounded set of keys. */
export interface ResolvedReference { file: string; line: number; expression: string; form: ResolvedForm; keys: string[]; patterns: string[] }
export interface UnknownResolvedReference extends MessageReference { reason: string }
/** A translator call inside a translator wrapper, forwarding the wrapper's key parameter; the wrapper's call sites are scanned instead. */
export interface ForwardedReference { file: string; line: number; expression: string }

type Alt = (string | null)[]; // null = wildcard segment
type Resolution = { alts: Alt[]; form: ResolvedForm } | { reason: string };

function unwrap(node: ts.Node): ts.Expression {
  let n = node as ts.Expression;
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression;
  return n;
}

type Env = ReadonlyMap<ts.ParameterDeclaration, Resolution>; // parameter -> resolution of its call argument
const MAX_DEPTH = 16;
/** Array methods that read but never add elements; any other use of an array binding may mutate it. */
const ARRAY_READS = new Set(['at', 'every', 'filter', 'find', 'flatMap', 'forEach', 'includes', 'indexOf', 'join', 'length', 'map', 'slice', 'some']);
/** Callbacks whose first parameter is an element of the receiver array. */
const ELEMENT_CALLBACKS = new Set(['every', 'filter', 'find', 'flatMap', 'forEach', 'map', 'some']);

function declaresName(name: ts.BindingName, text: string): boolean {
  if (ts.isIdentifier(name)) return name.text === text;
  return name.elements.some((el) => !ts.isOmittedExpression(el) && declaresName(el.name, text));
}

type Binding = { kind: 'const'; decl: ts.VariableDeclaration; scope: ts.Node } | { kind: 'param'; param: ts.ParameterDeclaration; fn: ts.SignatureDeclaration } | { kind: 'other' };

function statementsBinding(stmts: readonly ts.Statement[], text: string, scope: ts.Node): Binding | undefined {
  for (const s of stmts) {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (!declaresName(d.name, text)) continue;
        const isConst = (s.declarationList.flags & ts.NodeFlags.Const) !== 0;
        return isConst && ts.isIdentifier(d.name) && d.initializer ? { kind: 'const', decl: d, scope } : { kind: 'other' };
      }
    } else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) && s.name?.text === text) return { kind: 'other' };
    else if (ts.isImportDeclaration(s) && s.importClause && s.importClause.getText().split(/[^\w$]+/).includes(text)) return { kind: 'other' };
  }
  return undefined;
}

/** Nearest lexical binding of an identifier: a const with an initializer, a plain parameter, or something unresolvable. */
function findBinding(id: ts.Identifier): Binding | undefined {
  for (let a: ts.Node | undefined = id.parent; a; a = a.parent) {
    if (ts.isBlock(a) || ts.isSourceFile(a) || ts.isModuleBlock(a)) {
      const b = statementsBinding(a.statements, id.text, a);
      if (b) return b;
    } else if (ts.isCaseBlock(a)) {
      for (const c of a.clauses) {
        const b = statementsBinding(c.statements, id.text, a);
        if (b) return b;
      }
    } else if (ts.isFunctionLike(a)) {
      for (const p of a.parameters) if (declaresName(p.name, id.text)) return ts.isIdentifier(p.name) && !p.dotDotDotToken ? { kind: 'param', param: p, fn: a } : { kind: 'other' };
      if (ts.isFunctionExpression(a) && a.name?.text === id.text) return { kind: 'other' };
    } else if ((ts.isForStatement(a) || ts.isForOfStatement(a) || ts.isForInStatement(a)) && a.initializer && ts.isVariableDeclarationList(a.initializer) && a.initializer.declarations.some((d) => declaresName(d.name, id.text))) {
      return { kind: 'other' };
    } else if (ts.isCatchClause(a) && a.variableDeclaration && declaresName(a.variableDeclaration.name, id.text)) return { kind: 'other' };
  }
  return undefined;
}

/** True when every use of the name in the binding's scope only reads the array (conservative: shadowed names count too). */
function arrayOnlyRead(b: { decl: ts.VariableDeclaration; scope: ts.Node }): boolean {
  const name = (b.decl.name as ts.Identifier).text;
  let ok = true;
  const visit = (n: ts.Node): void => {
    if (!ok) return;
    if (ts.isIdentifier(n) && n.text === name && n !== b.decl.name) {
      const p = n.parent;
      if (!(ts.isPropertyAccessExpression(p) && p.expression === n && ARRAY_READS.has(p.name.text))) ok = false;
    }
    ts.forEachChild(n, visit);
  };
  visit(b.scope);
  return ok;
}

function resolveArray(node: ts.Expression, env: Env, depth: number): Resolution {
  let e = unwrap(node);
  if (ts.isIdentifier(e)) {
    const b = findBinding(e);
    if (!b || b.kind !== 'const') return { reason: 'bare identifier' };
    if (!arrayOnlyRead(b)) return { reason: 'array binding may be mutated' };
    e = unwrap(b.decl.initializer!);
  }
  if (!ts.isArrayLiteralExpression(e)) return { reason: 'bare identifier' };
  const alts: Alt[] = [];
  for (const el of e.elements) {
    if (ts.isSpreadElement(el)) return { reason: 'array spread' };
    const v = resolveExpression(el, env, depth + 1);
    if ('reason' in v) return v;
    alts.push(...v.alts);
  }
  return alts.length ? { alts, form: 'array-element' } : { reason: 'empty array' };
}

function resolveIdentifier(e: ts.Identifier, env: Env, depth: number): Resolution {
  const b = findBinding(e);
  if (!b || b.kind === 'other') return { reason: 'bare identifier' };
  if (b.kind === 'const') {
    const v = resolveExpression(b.decl.initializer!, env, depth + 1);
    return 'reason' in v ? { reason: 'bare identifier' } : { alts: v.alts, form: 'binding' };
  }
  const bound = env.get(b.param);
  if (bound) return bound;
  // First parameter of an element callback over a bounded, read-only array literal.
  const fn = b.fn;
  const call = fn.parent;
  if (b.param === fn.parameters[0] && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isCallExpression(call) && call.arguments[0] === fn) {
    const callee = call.expression;
    if (ts.isPropertyAccessExpression(callee) && ELEMENT_CALLBACKS.has(callee.name.text)) {
      const v = resolveArray(callee.expression, env, depth);
      return 'reason' in v ? { reason: 'bare identifier' } : v;
    }
  }
  return { reason: 'bare identifier' };
}

/** A call to a local const arrow whose body is a single expression, resolved with its arguments substituted. */
function resolveCall(e: ts.CallExpression, env: Env, depth: number): Resolution {
  if (!ts.isIdentifier(e.expression)) return { reason: 'call expression' };
  const b = findBinding(e.expression);
  if (!b || b.kind !== 'const') return { reason: 'call expression' };
  const fn = unwrap(b.decl.initializer!);
  if (!ts.isArrowFunction(fn) || ts.isBlock(fn.body) || e.arguments.length > fn.parameters.length) return { reason: 'call expression' };
  const inner = new Map(env);
  for (const [i, p] of fn.parameters.entries()) {
    const arg = e.arguments[i];
    if (!ts.isIdentifier(p.name) || p.dotDotDotToken || (!arg && !p.initializer) || (arg && ts.isSpreadElement(arg))) return { reason: 'call expression' };
    inner.set(p, resolveExpression(arg ?? p.initializer!, env, depth + 1));
  }
  const v = resolveExpression(fn.body, inner, depth + 1);
  return 'reason' in v ? { reason: 'call expression' } : { alts: v.alts, form: 'call' };
}

function resolveExpression(node: ts.Expression, env: Env = new Map(), depth = 0): Resolution {
  if (depth > MAX_DEPTH) return { reason: 'resolution depth exceeded' };
  const e = unwrap(node);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { alts: [[e.text]], form: 'literal' };
  if (ts.isConditionalExpression(e)) {
    const a = resolveExpression(e.whenTrue, env, depth + 1);
    if ('reason' in a) return a;
    const b = resolveExpression(e.whenFalse, env, depth + 1);
    if ('reason' in b) return b;
    return { alts: [...a.alts, ...b.alts], form: 'conditional' };
  }
  if (ts.isElementAccessExpression(e) && ts.isObjectLiteralExpression(unwrap(e.expression))) {
    const alts: Alt[] = [];
    for (const prop of (unwrap(e.expression) as ts.ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(prop)) return { reason: 'object map entry is not a plain property' };
      const v = resolveExpression(prop.initializer, env, depth + 1);
      if ('reason' in v) return { reason: `object map value not statically resolvable: ${v.reason}` };
      alts.push(...v.alts);
    }
    return alts.length ? { alts, form: 'object-map' } : { reason: 'empty object map' };
  }
  if (ts.isTemplateExpression(e)) {
    let alts: Alt[] = [[e.head.text]];
    for (const span of e.templateSpans) {
      const inner = resolveExpression(span.expression, env, depth + 1);
      const options: Alt[] = 'reason' in inner || inner.alts.some((a) => a.includes(null)) ? [[null]] : inner.alts;
      alts = alts.flatMap((prefix) => options.map((o) => [...prefix, ...o, span.literal.text]));
    }
    return { alts, form: 'template-pattern' };
  }
  if (ts.isIdentifier(e)) return resolveIdentifier(e, env, depth);
  if (ts.isCallExpression(e)) return resolveCall(e, env, depth);
  return { reason: 'unsupported expression' };
}

/** A translator wrapper such as `const t = (k: MessageKey) => tr.t(k)`: its own call sites are the references. */
function isForwardedParameter(arg: ts.Expression): boolean {
  const e = unwrap(arg);
  if (!ts.isIdentifier(e)) return false;
  const b = findBinding(e);
  if (!b || b.kind !== 'param') return false;
  const fn = b.fn;
  if (ts.isFunctionDeclaration(fn)) return fn.name?.text === 't';
  return (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && fn.parent.initializer === fn && ts.isIdentifier(fn.parent.name) && fn.parent.name.text === 't';
}

const patternOf = (alt: Alt): string => alt.map((p) => p ?? '*').join('');
function patternRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^.]+')}$`);
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
export function extractReferences(files: Readonly<Record<string, string>>, catalog?: Readonly<Record<string, unknown>>): { static: MessageReference[]; dynamic: DynamicReference[]; resolved: ResolvedReference[]; forwarded: ForwardedReference[] } {
  const catalogKeys = catalog ? Object.keys(catalog).sort() : [];
  const resolved: ResolvedReference[] = [];
  const statics: MessageReference[] = [];
  const dynamics: DynamicReference[] = [];
  const forwarded: ForwardedReference[] = [];
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
        } else if (isForwardedParameter(first)) {
          forwarded.push({ file, line, expression: first.getText(source) });
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
  forwarded.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { static: statics, dynamic: dynamics, resolved, forwarded };
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
