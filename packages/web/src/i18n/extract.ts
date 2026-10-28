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
/** Bound on alternatives per expression; beyond it the expression and any expression built from it are unresolvable. */
const MAX_ALTS = 1000;
const TOO_MANY = 'too many alternatives';
const TOO_DEEP = 'resolution depth exceeded';
const TOO_LONG = 'resolution step budget exceeded';
/** Bound on resolution steps per translator call, so pathological sources fail fast instead of stalling the check. */
const MAX_STEPS = 20_000;
let steps = 0;
/** Analysis limits: the value is unbounded, not one unknown key segment, so these never become a template wildcard. */
const isLimit = (v: Resolution): v is { reason: string } => 'reason' in v && (v.reason === TOO_MANY || v.reason === TOO_DEEP || v.reason === TOO_LONG);
/** Failure reason for a wrapping form: a limit propagates as is; other failures take the form's reason. */
const failure = (v: { reason: string }, reason: string): { reason: string } => (isLimit(v) ? v : { reason });
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

/** True when the file declares the name with `var` anywhere; hoisting makes lexical lookup unsound, so give up on it. */
const varNamesCache = new WeakMap<ts.SourceFile, Set<string>>();
function hasVarDeclaration(file: ts.SourceFile, text: string): boolean {
  let names = varNamesCache.get(file);
  if (!names) {
    const found = new Set<string>();
    const collect = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) found.add(name.text);
      else for (const el of name.elements) if (!ts.isOmittedExpression(el)) collect(el.name);
    };
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclarationList(n) && (n.flags & ts.NodeFlags.BlockScoped) === 0) for (const d of n.declarations) collect(d.name);
      ts.forEachChild(n, visit);
    };
    visit(file);
    varNamesCache.set(file, (names = found));
  }
  return names.has(text);
}

/** True when the expression is written: assignment, compound assignment, ++/--, destructuring or for-in/of target. */
function isWriteTarget(n: ts.Node): boolean {
  let c = n;
  for (let p = n.parent; p; c = p, p = p.parent) {
    if (ts.isBinaryExpression(p)) return p.left === c && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) return p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken;
    if ((ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === c) return true;
    // Only climb through destructuring shapes and type-only wrappers; anything else means the value is read.
    if (!(ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p) || ts.isShorthandPropertyAssignment(p) || ts.isPropertyAssignment(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p)
      || ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p) || ts.isTypeAssertionExpression(p) || ts.isSatisfiesExpression(p))) return false;
    if (ts.isPropertyAssignment(p) && p.name === c) return false;
  }
  return false;
}

/** True when the name is written anywhere under the node. Shadowed names count too. */
function isAssignedIn(root: ts.Node, text: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === text && isWriteTarget(n)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(root);
  return found;
}

/** Nearest lexical binding of an identifier: a const with an initializer, a never-reassigned parameter, or something unresolvable. */
function findBinding(id: ts.Identifier): Binding | undefined {
  if (hasVarDeclaration(id.getSourceFile(), id.text)) return { kind: 'other' };
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
      for (const p of a.parameters) if (declaresName(p.name, id.text)) return ts.isIdentifier(p.name) && !p.dotDotDotToken && !isAssignedIn(a, id.text) ? { kind: 'param', param: p, fn: a } : { kind: 'other' };
      if (ts.isFunctionExpression(a) && a.name?.text === id.text) return { kind: 'other' };
    } else if ((ts.isForStatement(a) || ts.isForOfStatement(a) || ts.isForInStatement(a)) && a.initializer && ts.isVariableDeclarationList(a.initializer) && a.initializer.declarations.some((d) => declaresName(d.name, id.text))) {
      return { kind: 'other' };
    } else if (ts.isCatchClause(a) && a.variableDeclaration && declaresName(a.variableDeclaration.name, id.text)) return { kind: 'other' };
  }
  return undefined;
}

/** An arrow callback that cannot reach the array: at most (element, index), so no third `array` parameter. */
const isClosedElementCallback = (fn: ts.Node | undefined): boolean =>
  fn !== undefined && ts.isArrowFunction(fn) && fn.parameters.length <= 2 && fn.parameters.every((p) => ts.isIdentifier(p.name) && !p.dotDotDotToken);

/** True when every use of the name in the binding's scope only reads the array (conservative: shadowed names count too). */
function arrayOnlyRead(b: { decl: ts.VariableDeclaration; scope: ts.Node }): boolean {
  const statement = b.decl.parent.parent;
  // Another module could mutate an exported array.
  if (ts.isVariableStatement(statement) && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return false;
  const name = (b.decl.name as ts.Identifier).text;
  let ok = true;
  const visit = (n: ts.Node): void => {
    if (!ok) return;
    if (ts.isIdentifier(n) && n.text === name && n !== b.decl.name) {
      const p = n.parent;
      if (!(ts.isPropertyAccessExpression(p) && p.expression === n && ARRAY_READS.has(p.name.text)) || isWriteTarget(p)) ok = false;
      else if (ELEMENT_CALLBACKS.has(p.name.text)) {
        // The callback receives the array itself as its third argument.
        const call = p.parent;
        if (!(ts.isCallExpression(call) && call.expression === p && call.arguments.length === 1 && isClosedElementCallback(call.arguments[0]))) ok = false;
      }
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
    if (alts.length > MAX_ALTS) return { reason: TOO_MANY };
  }
  return alts.length ? { alts, form: 'array-element' } : { reason: 'empty array' };
}

const constCache = new WeakMap<ts.VariableDeclaration, Resolution>();

function resolveIdentifier(e: ts.Identifier, env: Env, depth: number): Resolution {
  const b = findBinding(e);
  if (!b || b.kind === 'other') return { reason: 'bare identifier' };
  if (b.kind === 'const') {
    // A const initializer lies outside every key-builder body, so it never depends on env; limits are not cached.
    const cached = constCache.get(b.decl);
    if (cached) return cached;
    const v = resolveExpression(b.decl.initializer!, env, depth + 1);
    const out: Resolution = 'reason' in v ? failure(v, 'bare identifier') : { alts: v.alts, form: 'binding' };
    if (!isLimit(out)) constCache.set(b.decl, out);
    return out;
  }
  const bound = env.get(b.param);
  if (bound) return bound;
  // First parameter of an element callback over a bounded, read-only array literal.
  const fn = b.fn;
  const call = fn.parent;
  if (b.param === fn.parameters[0] && isClosedElementCallback(fn) && ts.isCallExpression(call) && call.arguments.length === 1 && call.arguments[0] === fn) {
    const callee = call.expression;
    if (ts.isPropertyAccessExpression(callee) && ELEMENT_CALLBACKS.has(callee.name.text)) {
      const v = resolveArray(callee.expression, env, depth);
      return 'reason' in v ? failure(v, 'bare identifier') : v;
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
  return 'reason' in v ? failure(v, 'call expression') : { alts: v.alts, form: 'call' };
}

function resolveExpression(node: ts.Expression, env: Env = new Map(), depth = 0): Resolution {
  if (depth > MAX_DEPTH) return { reason: TOO_DEEP };
  if (++steps > MAX_STEPS) return { reason: TOO_LONG };
  const e = unwrap(node);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { alts: [[e.text]], form: 'literal' };
  if (ts.isConditionalExpression(e)) {
    const a = resolveExpression(e.whenTrue, env, depth + 1);
    if ('reason' in a) return a;
    const b = resolveExpression(e.whenFalse, env, depth + 1);
    if ('reason' in b) return b;
    if (a.alts.length + b.alts.length > MAX_ALTS) return { reason: TOO_MANY };
    return { alts: [...a.alts, ...b.alts], form: 'conditional' };
  }
  if (ts.isElementAccessExpression(e) && ts.isObjectLiteralExpression(unwrap(e.expression))) {
    const alts: Alt[] = [];
    for (const prop of (unwrap(e.expression) as ts.ObjectLiteralExpression).properties) {
      if (!ts.isPropertyAssignment(prop)) return { reason: 'object map entry is not a plain property' };
      const v = resolveExpression(prop.initializer, env, depth + 1);
      if ('reason' in v) return failure(v, `object map value not statically resolvable: ${v.reason}`);
      alts.push(...v.alts);
      if (alts.length > MAX_ALTS) return { reason: TOO_MANY };
    }
    return alts.length ? { alts, form: 'object-map' } : { reason: 'empty object map' };
  }
  if (ts.isTemplateExpression(e)) {
    let alts: Alt[] = [[e.head.text]];
    for (const span of e.templateSpans) {
      const inner = resolveExpression(span.expression, env, depth + 1);
      if (isLimit(inner)) return inner;
      const options: Alt[] = 'reason' in inner || inner.alts.some((a) => a.includes(null)) ? [[null]] : inner.alts;
      // Values may hold dots, so a truncated product cannot be stood in for by a one-segment wildcard.
      if (alts.length * options.length > MAX_ALTS) return { reason: TOO_MANY };
      alts = alts.flatMap((prefix) => options.map((o) => [...prefix, ...o, span.literal.text]));
    }
    return { alts, form: 'template-pattern' };
  }
  if (ts.isIdentifier(e)) return resolveIdentifier(e, env, depth);
  if (ts.isCallExpression(e)) return resolveCall(e, env, depth);
  return { reason: 'unsupported expression' };
}

/**
 * True when every use of the name `t` under the node is a direct call (scanned here), `x.t(...)`, or an object property `t`
 * handed to another module, which is safe only if that module is scanned too (all scanned files are checked).
 * Any other use could pass keys the scan never sees.
 */
function translatorOnlyCalled(root: ts.SourceFile, evidence: TranslatorEvidence): boolean {
  let ok = true;
  const visit = (n: ts.Node): void => {
    if (!ok) return;
    if (ts.isIdentifier(n) && n.text === 't') {
      const p = n.parent;
      const declaration = (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p)) && p.name === n;
      // `x.t` is fine only as a callee; read as a value it may be a handed-on wrapper escaping the scan.
      const memberRead = ts.isPropertyAccessExpression(p) && p.name === n
        && ((ts.isCallExpression(p.parent) && p.parent.expression === p) || evidence.primitiveMemberReads.has(`${root.fileName}:${n.getStart(root)}`));
      const memberName = memberRead || ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p)) && p.name === n);
      const called = ts.isCallExpression(p) && p.expression === n;
      const handedOn = (ts.isShorthandPropertyAssignment(p) || (ts.isPropertyAssignment(p) && p.initializer === n && ts.isIdentifier(p.name) && p.name.text === 't'))
        && evidence.scannedHandOffs.has(`${root.fileName}:${n.getStart(root)}`);
      if (!(declaration || memberName || called || handedOn)) ok = false;
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
  return ok;
}

/** A translator wrapper such as `const t = (k: MessageKey) => tr.t(k)`: its own call sites are the references. */
function forwarding(arg: ts.Expression, translatorContained: boolean): 'forwarded' | 'escapes' | undefined {
  const e = unwrap(arg);
  if (!ts.isIdentifier(e)) return undefined;
  const b = findBinding(e);
  if (!b || b.kind !== 'param' || b.param !== b.fn.parameters[0]) return undefined;
  const fn = b.fn;
  const named = ts.isFunctionDeclaration(fn) ? fn.name?.text === 't'
    : (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && fn.parent.initializer === fn && ts.isIdentifier(fn.parent.name) && fn.parent.name.text === 't';
  if (!named) return undefined;
  const holder = ts.isFunctionDeclaration(fn) ? fn : fn.parent.parent.parent; // declaration list -> variable statement
  const exported = ts.canHaveModifiers(holder) && ts.getModifiers(holder)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  return translatorContained && !exported ? 'forwarded' : 'escapes';
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
/**
 * Type-checked evidence that the translator wrapper cannot escape the scan, keyed by `file:offset` of a `t` identifier.
 * Without it every `x.t` value read and every `{ t }` hand-off counts as an escape.
 */
export interface TranslatorEvidence {
  /** `x.t` read as a value whose type is primitive, so it cannot hold the wrapper. */
  primitiveMemberReads: ReadonlySet<string>;
  /** `{ t }` / `{ t: t }` in an object literal passed directly to a function declared in a scanned file. */
  scannedHandOffs: ReadonlySet<string>;
}
export interface ExtractOptions { evidence?: TranslatorEvidence }

const PRIMITIVE = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.ESSymbolLike
  | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void | ts.TypeFlags.Never;

/**
 * Build `TranslatorEvidence` with a type checker. `files` maps each scanned file key to its path in `program`, which must
 * have read the same text. Residual assumption: a scanned function receiving `{ t }` does not pass that object on to
 * unscanned code (its own `x.t` reads are checked like any other).
 */
export function translatorEvidence(program: ts.Program, files: Readonly<Record<string, string>>): TranslatorEvidence {
  const checker = program.getTypeChecker();
  const scannedPaths = new Set(Object.values(files).map((p) => program.getSourceFile(p)?.fileName));
  const primitiveMemberReads = new Set<string>();
  const scannedHandOffs = new Set<string>();
  const declaredInScan = (callee: ts.Expression): boolean => {
    const node = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const decls = symbol?.declarations ?? [];
    return decls.length > 0 && decls.every((d) => scannedPaths.has(d.getSourceFile().fileName));
  };
  for (const [key, path] of Object.entries(files)) {
    const source = program.getSourceFile(path);
    if (!source) throw new Error(`program does not contain ${path}`);
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && n.text === 't') {
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.name === n) {
          const type = checker.getTypeAtLocation(p);
          if ((type.isUnion() ? type.types : [type]).every((x) => (x.flags & PRIMITIVE) !== 0)) primitiveMemberReads.add(`${key}:${n.getStart(source)}`);
        } else if (ts.isShorthandPropertyAssignment(p) || (ts.isPropertyAssignment(p) && p.initializer === n)) {
          const literal = p.parent;
          const call = literal.parent;
          if (ts.isObjectLiteralExpression(literal) && ts.isCallExpression(call) && call.arguments.includes(literal) && declaredInScan(call.expression)) scannedHandOffs.add(`${key}:${n.getStart(source)}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(source);
  }
  return { primitiveMemberReads, scannedHandOffs };
}

export function extractReferences(files: Readonly<Record<string, string>>, catalog?: Readonly<Record<string, unknown>>, options: ExtractOptions = {}): { static: MessageReference[]; dynamic: DynamicReference[]; resolved: ResolvedReference[]; forwarded: ForwardedReference[] } {
  const catalogKeys = catalog ? Object.keys(catalog).sort() : [];
  const resolved: ResolvedReference[] = [];
  const statics: MessageReference[] = [];
  const dynamics: DynamicReference[] = [];
  const forwarded: ForwardedReference[] = [];
  const sources = Object.keys(files).sort().map((file) => ts.createSourceFile(file, files[file]!, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  const evidence = options.evidence ?? { primitiveMemberReads: new Set<string>(), scannedHandOffs: new Set<string>() };
  const translatorContained = sources.every((source) => translatorOnlyCalled(source, evidence));
  for (const source of sources) {
    const file = source.fileName;
    const visit = (node: ts.Node): void => {
      if (isVerifyViewDeclaration(node)) return;
      if (ts.isCallExpression(node) && isTranslatorCall(node)) {
        const first = node.arguments[0];
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          statics.push({ file, line, key: first.text });
        } else if (!first) {
          dynamics.push({ file, line, expression: '(missing argument)', reason: 'missing argument' });
        } else if (forwarding(first, translatorContained) === 'forwarded') {
          forwarded.push({ file, line, expression: first.getText(source) });
        } else if (forwarding(first, translatorContained) === 'escapes') {
          dynamics.push({ file, line, expression: first.getText(source), reason: 'translator wrapper used as a value' });
        } else {
          steps = 0;
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
