import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { extractReferences, translatorEvidence, unknownReferences, unknownResolvedReferences } from '../src/i18n/extract.ts';
import { lintCatalog, lintLiterals } from '../src/i18n/catalog-lint.ts';

test('reference extraction is deterministic and separates dynamic keys', () => {
  const refs = extractReferences({
    'b.ts': "t('qv.a.ok'); t('bad key'); t(key); env.t(`qv.b.ok`);",
    'a.ts': "t('qv.a.ok'); function verifyView(){ t('qv.hidden'); }",
  });
  assert.deepEqual(refs.static.map((x) => [x.file, x.key]), [['a.ts', 'qv.a.ok'], ['b.ts', 'bad key'], ['b.ts', 'qv.a.ok'], ['b.ts', 'qv.b.ok']]);
  assert.deepEqual(refs.dynamic.map((x) => x.expression), ['key']);
  assert.deepEqual(unknownReferences(refs.static, { 'qv.a.ok': {} }).map((x) => x.key), ['bad key', 'qv.b.ok']);
  const inherited = Object.create({ 'qv.a.ok': {} }) as Record<string, unknown>;
  assert.deepEqual(unknownReferences(refs.static, inherited).map((x) => x.key), ['qv.a.ok', 'bad key', 'qv.a.ok', 'qv.b.ok']);
});

test('catalog validation catches key, schema, ICU and maxLength errors', () => {
  const issues = lintCatalog({
    'bad key': { message: '{n, plural, one {one}}', description: '', sensitivity: 'high', maxLength: 0 },
    'qv.good': { message: 'Ready {name}', description: 'Button label', sensitivity: 'normal', maxLength: 25 },
  });
  assert.deepEqual(issues.map((x) => x.reason), [
    'invalid message key', 'invalid ICU message: missing "other" case at 21', 'description must be a non-empty string',
    'sensitivity must be normal or guarantee', 'maxLength must be a positive integer when present',
  ]);
  assert.deepEqual(lintCatalog(null), [{ key: '$catalog', reason: 'catalog must be an object of entries' }]);
  assert.deepEqual(lintCatalog([]), [{ key: '$catalog', reason: 'catalog must be an object of entries' }]);
  assert.deepEqual(lintCatalog({ broken: null }), [{ key: 'broken', reason: 'invalid message key' }, { key: 'broken', reason: 'entry must be an object' }]);
  assert.ok(lintCatalog({ broken: {} }).some((x) => x.reason === 'message must be a non-empty string'));
});

test('literal lint catches visible text, copy attributes and translated concatenation but ignores structure', () => {
  const result = lintLiterals({ 'fixture.ts': `
    h('button', { class: 'primary', id: 'save', type: 'button', 'aria-label': 'Save changes' }, 'Proceed');
    h('span', {}, '—', ', ', t('qv.ready'));
    el.textContent = 'Finished';
    h('div', { href: '/x', role: 'status', 'aria-describedby': 'hint-id', value: dynamicValue });
    const msg = t('qv.count') + ' total';
    h('p', {}, show ? 'One result' : 'Many results');
    h('p', {}, \`Count: \${t('qv.count')} items\`);
    render('Election', h('p', {}, t('qv.ready')));
    document.title = 'Voting';
    el.setAttribute('aria-describedby', 'hint-id');
    el.setAttribute('aria-label', 'Accessible name');
    h('p', {}, (('Wrapped child' as string)!));
    el.textContent += (' appended text ' as const);
    el.innerText = ((\`Inner text\`) satisfies string);
    document.createTextNode((('Created text' as string)!));
    el.textContent += dynamicText;
    el.innerText = dynamicText;
    document.createTextNode(dynamicLabel);
    function verifyView(){ h('button', {}, 'Excluded secret text'); }
  ` });
  assert.deepEqual(result.findings.map((x) => [x.reason, x.text]), [
    ['literal aria-label attribute', 'Save changes'],
    ['literal DOM text child', 'Proceed'],
    ['literal textContent assignment', 'Finished'],
    ['literal concatenated with translated message', ' total'],
    ['literal DOM text child', 'Many results'],
    ['literal DOM text child', 'One result'],
    ['literal text embedded with translated message', ' items'],
    ['literal text embedded with translated message', 'Count: '],
    ['literal render title', 'Election'],
    ['literal title assignment', 'Voting'],
    ['literal aria-label attribute', 'Accessible name'],
    ['literal DOM text child', 'Wrapped child'],
    ['literal textContent assignment', ' appended text '],
    ['literal innerText assignment', 'Inner text'],
    ['literal document.createTextNode() text', 'Created text'],
  ]);
  assert.deepEqual(result.exclusions.map((x) => x.reason), ['restricted block excluded by scan scope']);
});

const CAT = { 'qv.a.x': {}, 'qv.a.y': {}, 'qv.t.one': {}, 'qv.t.two': {}, 'qv.t.two.sub': {}, 'qv.u.a.end': {}, 'qv.u.b.end': {} };

test('object-literal map lookups resolve to the set of values, incl. casts and parentheses', () => {
  const refs = extractReferences({ 'a.ts': "t(({ p: 'qv.a.x', q: 'qv.a.y', r: 'qv.a.x' } as const)[v]);" }, CAT);
  assert.deepEqual(refs.dynamic, []);
  assert.equal(refs.resolved.length, 1);
  assert.deepEqual(refs.resolved[0]!.keys, ['qv.a.x', 'qv.a.y']);
  assert.equal(refs.resolved[0]!.form, 'object-map');
  assert.deepEqual(unknownResolvedReferences(refs.resolved, CAT), []);
});

test('object map with a non-literal value stays dynamic with a reason', () => {
  const refs = extractReferences({ 'a.ts': "t(({ p: 'qv.a.x', q: other })[v]);" }, CAT);
  assert.equal(refs.resolved.length, 0);
  assert.equal(refs.dynamic.length, 1);
  assert.match(refs.dynamic[0]!.reason, /object map value/);
});

test('ternaries of literals (nested, cast) resolve; unknown branch keys are errors', () => {
  const refs = extractReferences({ 'a.ts': "t(a ? 'qv.a.x' : b ? 'qv.a.y' : 'qv.nope'); t((c ? 'qv.a.x' : 'qv.a.y') as MessageKey);" }, CAT);
  assert.deepEqual(refs.dynamic, []);
  assert.deepEqual(refs.resolved.map((r) => r.keys), [['qv.a.x', 'qv.a.y', 'qv.nope'], ['qv.a.x', 'qv.a.y']]);
  const bad = unknownResolvedReferences(refs.resolved, CAT);
  assert.deepEqual(bad.map((x) => [x.key, x.line]), [['qv.nope', 1]]);
  assert.match(bad[0]!.reason, /not in catalog/);
});

test('template literals resolve by prefix/suffix pattern against the catalog', () => {
  const refs = extractReferences({ 'a.ts': "t(`qv.t.${v}`); t(`qv.u.${w}.end` as MessageKey); t(`qv.t.${x ? 'one' : 'two'}`);" }, CAT);
  assert.deepEqual(refs.dynamic, []);
  // A wildcard stands for one key segment, so the nested qv.t.two.sub is not swept in.
  assert.deepEqual(refs.resolved.map((r) => r.keys), [['qv.t.one', 'qv.t.two'], ['qv.u.a.end', 'qv.u.b.end'], ['qv.t.one', 'qv.t.two']]);
  assert.deepEqual(refs.resolved[0]!.patterns, ['qv.t.*']);
  assert.deepEqual(unknownResolvedReferences(refs.resolved, CAT), []);
});

test('template pattern matching zero catalog keys is an error; exact branch missing too', () => {
  const refs = extractReferences({ 'a.ts': "t(`qv.zzz.${v}`); t(`qv.t.${x ? 'one' : 'gone'}`);" }, CAT);
  const bad = unknownResolvedReferences(refs.resolved, CAT);
  assert.deepEqual(bad.map((x) => [x.line, x.key, x.reason]), [
    [1, 'qv.zzz.*', 'template pattern matches no catalog keys'],
    [1, 'qv.t.gone', 'resolved key not in catalog'],
  ]);
});

test('unresolvable expressions remain dynamic with a reason', () => {
  const refs = extractReferences({ 'a.ts': "t(k); t(fn('x')); t(); t(obj.key);" }, CAT);
  assert.equal(refs.resolved.length, 0);
  assert.deepEqual(refs.dynamic.map((x) => [x.expression, x.reason]), [
    ['(missing argument)', 'missing argument'], ["fn('x')", 'call expression'], ['k', 'bare identifier'], ['obj.key', 'unsupported expression'],
  ]);
});

test('const bindings resolve through their initializer; let, var and shadowed names stay dynamic', () => {
  const refs = extractReferences({ 'a.ts': [
    "const key = a ? 'qv.a.x' : 'qv.a.y'; t(key);",
    "function f() { let m = 'qv.a.x'; t(m); }",
    "function g() { const key = other; t(key); }",
    "const a = b; const b = a; t(a);",
  ].join('\n') }, CAT);
  assert.deepEqual(refs.resolved.map((r) => [r.line, r.form, r.keys]), [[1, 'binding', ['qv.a.x', 'qv.a.y']]]);
  assert.deepEqual(refs.dynamic.map((x) => [x.line, x.expression, x.reason]), [[2, 'm', 'bare identifier'], [3, 'key', 'bare identifier'], [4, 'a', 'resolution depth exceeded']]);
});

test('element callbacks over a read-only const array resolve; mutated or escaping arrays stay dynamic', () => {
  const refs = extractReferences({ 'a.ts': [
    "const KS: MessageKey[] = ['qv.a.x', 'qv.a.y']; KS.map((k, i) => t(k)); KS.length;",
    "(['one', 'two'] as const).map((v) => t(`qv.t.${v}`));",
    "const P = ['qv.a.x']; P.push(z); P.map((k) => t(k));",
    "const E = ['qv.a.x']; use(E); E.forEach((k) => t(k));",
    "const S = ['qv.a.x', ...more]; S.map((k) => t(k));",
    "const Q = ['qv.a.x']; Q.map((x, k) => t(k));",
  ].join('\n') }, CAT);
  assert.deepEqual(refs.resolved.map((r) => [r.line, r.form, r.keys, r.patterns]), [
    [1, 'array-element', ['qv.a.x', 'qv.a.y'], []],
    [2, 'template-pattern', ['qv.t.one', 'qv.t.two'], []],
  ]);
  assert.deepEqual(refs.dynamic.map((x) => [x.line, x.reason]), [[3, 'bare identifier'], [4, 'bare identifier'], [5, 'bare identifier'], [6, 'bare identifier']]);
});

test('calls to a local single-expression key builder resolve with arguments substituted', () => {
  const refs = extractReferences({ 'a.ts': [
    "function box(code: string) { const k = (s: string): MessageKey => `qv.u.${code}.${s}` as MessageKey; t(k('end')); }",
    "const pick = (c: boolean) => c ? 'qv.a.x' : 'qv.a.y'; t(pick(flag));",
    "const blk = (s: string) => { return `qv.t.${s}`; }; t(blk('one'));",
    "t(unknownFn('x'));",
  ].join('\n') }, CAT);
  assert.deepEqual(refs.resolved.map((r) => [r.line, r.form, r.keys, r.patterns]), [
    [1, 'call', ['qv.u.a.end', 'qv.u.b.end'], ['qv.u.*.end']],
    [2, 'call', ['qv.a.x', 'qv.a.y'], []],
  ]);
  assert.deepEqual(refs.dynamic.map((x) => [x.line, x.reason]), [[3, 'call expression'], [4, 'call expression']]);
  assert.deepEqual(unknownResolvedReferences(refs.resolved, CAT), []);
});

test('the translator wrapper parameter is a forwarder, not a dynamic reference', () => {
  const refs = extractReferences({ 'a.ts': [
    "const t = (k: MessageKey, a?: Args): string => tr.t(k, a);",
    "const say = (k: MessageKey) => tr.t(k);",
    "t('qv.a.x');",
  ].join('\n') }, CAT);
  assert.deepEqual(refs.forwarded.map((x) => [x.line, x.expression]), [[1, 'k']]);
  assert.deepEqual(refs.dynamic.map((x) => [x.line, x.expression, x.reason]), [[2, 'k', 'bare identifier']]);
  assert.deepEqual(refs.static.map((x) => x.key), ['qv.a.x']);
});

test('review regressions: hoisted var, reassigned parameters and array escapes stay dynamic', () => {
  const refs = extractReferences({ 'a.ts': [
    "const key = 'qv.a.x'; function f() { if (c) { var key = 'qv.bad'; } t(key); }",
    "const k2 = 'qv.a.x'; function g() { for (var k2 of xs) {} t(k2); }",
    "const KS = ['qv.a.x']; KS.forEach((k) => { if (c) k = 'qv.bad'; t(k); });",
    "const b = (s: string) => (s = 'qv.bad') ? s : s; t(b('qv.a.x'));",
    "const KA = ['qv.a.x']; KA.forEach((k, i, a) => { a[0] = 'qv.bad'; }); KA.map((k) => t(k));",
    "const KF = ['qv.a.x']; KF.forEach(mutate); KF.map((k) => t(k));",
    "const KG = ['qv.a.x']; KG.map(function (k) { return t(k); });",
    "export const KE = ['qv.a.x']; KE.map((k) => t(k));",
    "const KL = ['qv.a.x']; KL.length = 3; KL.find((k) => t(k));",
  ].join('\n') }, CAT);
  assert.deepEqual(refs.resolved, []);
  assert.deepEqual(refs.dynamic.map((x) => x.line), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('review regressions: alternatives are capped instead of exploding', () => {
  const lines = ["const a0 = c ? 'qv.a.x' : 'qv.a.y';"];
  for (let i = 1; i <= 12; i++) lines.push(`const a${i} = \`\${a${i - 1}}\${a${i - 1}}\`;`);
  lines.push('t(a12);', 't(`qv.t.${a12}`);');
  const refs = extractReferences({ 'a.ts': lines.join('\n') }, CAT);
  // Values hold dots, so a truncated product must not turn into one-segment wildcards further up.
  assert.deepEqual(refs.dynamic.map((x) => [x.expression, x.reason]), [['a12', 'resolution depth exceeded'], ['`qv.t.${a12}`', 'resolution depth exceeded']]);
  assert.deepEqual(refs.resolved, []);
});

test('review regressions: a shallow product over the alternatives cap stays dynamic', () => {
  const lines = ["const b0 = c ? 'qv.a.x' : 'qv.a.y';"];
  for (let i = 1; i <= 5; i++) lines.push(`const b${i} = \`\${b${i - 1}}\${b${i - 1}}\`;`);
  lines.push('t(b3);', 't(b5);', 't(`qv.t.${b5}`);');
  const refs = extractReferences({ 'a.ts': lines.join('\n') }, CAT);
  assert.deepEqual(refs.resolved.map((r) => [r.line, r.keys.length]), [[7, 256]]);
  assert.deepEqual(refs.dynamic.map((x) => [x.line, x.reason]), [[8, 'too many alternatives'], [9, 'too many alternatives']]);
});

test('review regressions: a forwarder must pass its first parameter and only be called or handed on as t', () => {
  const second = extractReferences({ 'a.ts': "const t = (a: string, k: MessageKey) => tr.t(k); t('qv.a.x', 'qv.bad');" }, CAT);
  assert.deepEqual(second.forwarded, []);
  assert.deepEqual(second.dynamic.map((x) => x.expression), ['k']);
  const asValue = extractReferences({ 'a.ts': "const t = (k: MessageKey) => tr.t(k); ['qv.bad'].map(t);" }, CAT);
  assert.deepEqual(asValue.forwarded, []);
  assert.deepEqual(asValue.dynamic.map((x) => [x.expression, x.reason]), [['k', 'translator wrapper used as a value']]);
  // Without type-checked evidence a hand-off cannot be shown to stay inside the scan.
  const handedOn = extractReferences({ 'a.ts': "const t = (k: MessageKey) => tr.t(k); chart({ t }); t('qv.a.x');" }, CAT);
  assert.deepEqual(handedOn.forwarded, []);
  assert.deepEqual(handedOn.dynamic.map((x) => x.reason), ['translator wrapper used as a value']);
});

test('second review: rest callbacks, writes through TS casts and object-map limits stay dynamic', () => {
  const refs = extractReferences({ 'a.ts': [
    "const KR = ['qv.a.x']; KR.forEach((...a) => { a[2][0] = 'qv.bad'; }); KR.map((k) => t(k));",
    "const KT = ['qv.a.x']; KT.forEach((k, ...a) => {}); KT.map((k) => t(k));",
    "const K1 = ['qv.a.x']; K1.forEach((k) => { k! = 'qv.bad'; t(k); });",
    "const K2 = ['qv.a.x']; K2.forEach((k) => { (k as any) = 'qv.bad'; t(k); });",
    "const K3 = ['qv.a.x']; K3.forEach((k) => { for ((k as any) of ['qv.bad']) {} t(k); });",
    "const bb = (s: string) => (s! = 'qv.bad') ? s : s; t(bb('qv.a.x'));",
    "const o0 = c ? 'a' : 'b'; const o1 = `${o0}${o0}`; const o2 = `${o1}${o1}`; const o3 = `${o2}${o2}${o2}`; t(`qv.${({ p: o3 })[q]}.x`);",
  ].join('\n') }, CAT);
  assert.deepEqual(refs.resolved, []);
  assert.deepEqual(refs.dynamic.map((x) => x.line), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(refs.dynamic[6]!.reason, 'too many alternatives');
});

test('second review: an exported or escaping wrapper is not a forwarder', () => {
  const member = extractReferences({ 'a.ts': "const t = (k: MessageKey) => tr.t(k); const ui = { t }; ['qv.bad'].map(ui.t);" }, CAT);
  assert.deepEqual(member.forwarded, []);
  const across = extractReferences({ 'a.ts': "const t = (k: MessageKey) => tr.t(k); chart({ t });", 'b.ts': "export function chart(env) { ['qv.bad'].map(env.t); env.t('qv.a.x'); }" }, CAT);
  assert.deepEqual(across.forwarded, []);
  assert.deepEqual(across.dynamic.map((x) => x.reason), ['translator wrapper used as a value']);
  for (const src of ['export const t = (k: MessageKey) => tr.t(k);', 'export function t(k: MessageKey) { return tr.t(k); }']) {
    const refs = extractReferences({ 'a.ts': src }, CAT);
    assert.deepEqual(refs.forwarded, [], src);
    assert.deepEqual(refs.dynamic.map((x) => x.reason), ['translator wrapper used as a value'], src);
  }
});

test('second review: wide single-alternative chains resolve quickly', () => {
  const lines = ["const w0 = 'x';"];
  for (let i = 1; i <= 7; i++) lines.push(`const w${i} = \`${('${w' + (i - 1) + '}').repeat(6)}\`;`);
  lines.push('t(`qv.${w7}`);');
  const started = performance.now();
  const refs = extractReferences({ 'a.ts': lines.join('\n') }, CAT);
  assert.ok(performance.now() - started < 1000, 'resolution must be memoized or budgeted');
  assert.equal(refs.resolved.length + refs.dynamic.length, 1);
});

function inMemoryProgram(files: Record<string, string>): ts.Program {
  return assertClean(inMemoryProgramUnchecked(files), files);
}
function inMemoryProgramUnchecked(files: Record<string, string>): ts.Program {
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], strict: true, allowImportingTsExtensions: true, noEmit: true };
  const host = ts.createCompilerHost(options);
  // Test files live at the virtual root; the standard library comes from disk.
  const program = ts.createProgram(Object.keys(files), options, {
    ...host,
    getCurrentDirectory: () => '/',
    getSourceFile: (name, version, ...rest) => (files[bare(name)] === undefined ? host.getSourceFile(name, version, ...rest) : ts.createSourceFile(name, files[bare(name)]!, version)),
    fileExists: (name) => files[bare(name)] !== undefined || host.fileExists(name),
    readFile: (name) => files[bare(name)] ?? host.readFile(name),
  });
  return program;
}
function assertClean(program: ts.Program, files: Record<string, string>): ts.Program {
  const errors = Object.keys(files).flatMap((f) => [...program.getSyntacticDiagnostics(program.getSourceFile(f)), ...program.getSemanticDiagnostics(program.getSourceFile(f))]);
  assert.deepEqual(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')), [], 'test programs must type-check');
  return program;
}
const bare = (name: string): string => name.replace(/^\//, '');
const keysOf = (files: Record<string, string>): Record<string, string> => Object.fromEntries(Object.keys(files).map((k) => [k, k]));

test('type-checked evidence admits only primitive `x.t` reads', () => {
  const files: Record<string, string> = {
    'a.ts': "declare const tr: { t(k: string): string };\nconst t = (k: string): string => tr.t(k);\ndeclare const m: { t: number } | undefined;\nexport const n = m?.t;\nconst ui = { t };\nexport const leak = ['qv.bad'].map(ui.t);",
  };
  const evidence = translatorEvidence(inMemoryProgram(files), keysOf(files));
  assert.deepEqual([...evidence.primitiveMemberReads], [`a.ts:${files['a.ts']!.indexOf('m?.t') + 3}`]);
  // The numeric read is admitted; the callable ui.t read still makes the wrapper escape.
  assert.deepEqual(extractReferences(files, CAT, { evidence }).dynamic.map((x) => x.reason), ['translator wrapper used as a value']);
  const withoutLeak = { 'a.ts': files['a.ts']!.replace(/\nconst ui[\s\S]*$/, '') };
  assert.deepEqual(extractReferences(withoutLeak, CAT).dynamic.map((x) => x.reason), ['translator wrapper used as a value'], 'untyped scans reject every x.t value read');
  assert.deepEqual(extractReferences(withoutLeak, CAT, { evidence: translatorEvidence(inMemoryProgram(withoutLeak), keysOf(withoutLeak)) }).forwarded.map((x) => x.line), [2]);
});

test('third review: generic, object and {} member types are not proof the wrapper stays put', () => {
  for (const read of ['const pick = <T,>(o: { t: T }): T => o.t;', 'const pick = (o: { t: object }) => o.t;', 'const pick = (o: { t: {} }) => o.t;']) {
    const files = { 'a.ts': `declare const tr: { t(k: string): string };\nconst t = (k: string): string => tr.t(k);\n${read}\nexport const v = pick({ t });` };
    const refs = extractReferences(files, CAT, { evidence: translatorEvidence(inMemoryProgram(files), keysOf(files)) });
    assert.deepEqual(refs.forwarded, [], read);
    assert.deepEqual(refs.dynamic.map((x) => x.reason), ['translator wrapper used as a value'], read);
  }
});

test('third review: a hand-off counts only when the callee is declared in a scanned file', () => {
  const files: Record<string, string> = {
    'a.ts': "import { draw } from './b.ts';\nimport { leak } from './c.ts';\ndeclare const tr: { t(k: string): string };\nconst t = (k: string): string => tr.t(k);\ndraw({ t });\nleak({ t });",
    'b.ts': "export function draw(env: { t(k: string): string }): string { return env.t('qv.a.x'); }",
    'c.ts': "export function leak(env: { t(k: string): string }): string[] { return ['qv.bad'].map(env.t); }",
  };
  const program = inMemoryProgram(files);
  const scanned = { 'a.ts': files['a.ts']!, 'b.ts': files['b.ts']! };
  const evidence = translatorEvidence(program, keysOf(scanned));
  assert.deepEqual([...evidence.scannedHandOffs], [`a.ts:${files['a.ts']!.indexOf('draw({ t })') + 7}`]);
  assert.deepEqual(extractReferences(scanned, CAT, { evidence }).dynamic.map((x) => x.reason), ['translator wrapper used as a value']);
  const onlyScanned = { ...files, 'a.ts': files['a.ts']!.replace('\nleak({ t });', '') };
  const ok = { 'a.ts': onlyScanned['a.ts']!, 'b.ts': files['b.ts']! };
  const okRefs = extractReferences(ok, CAT, { evidence: translatorEvidence(inMemoryProgram(onlyScanned), keysOf(ok)) });
  assert.deepEqual(okRefs.forwarded.map((x) => [x.file, x.line]), [['a.ts', 4]]);
  assert.deepEqual(okRefs.static.map((x) => x.key), ['qv.a.x']);
});

test('fourth review: hand-offs need a scanned implementation, a real namespace and a clean type-check', () => {
  const head = "declare const tr: { t(k: string): string };\nconst t = (k: string): string => tr.t(k);\ntype Fn = (k: string) => string;\n";
  const u = "export const impl = (o: { t: (k: string) => string }): void => { ['qv.bad'].map(o.t); };\nexport const make = () => ({ render: impl });\nexport const ns = { draw: impl };";
  const b = "export function draw(env: { t(k: string): string }): string { return env.t('qv.a.x'); }";
  const cases: [string, string, boolean][] = [
    ['parameter callee', "import { impl } from './u.ts';\nexport function mount(render: (o: { t: Fn }) => void): void { render({ t }); }\nmount(impl);", false],
    ['interface method', "import { make } from './u.ts';\ninterface R { render(o: { t: Fn }): void }\nconst r: R = make();\nr.render({ t });", false],
    ['const alias', "import { impl } from './u.ts';\nconst f = impl;\nf({ t });", false],
    ['declare-only', "declare function g(o: { t: Fn }): void;\ng({ t });", false],
    ['object namespace', "import { ns } from './u.ts';\nns.draw({ t });", false],
    ['scanned function', "import { draw } from './b.ts';\ndraw({ t });", true],
    ['static namespace', "import * as charts from './b.ts';\ncharts.draw({ t });", true],
    ['dynamic namespace', "export async function show(): Promise<void> { const charts = await import('./b.ts').catch(() => undefined); if (charts) charts.draw({ t }); }", true],
  ];
  for (const [name, body, forwarded] of cases) {
    const files = { 'a.ts': head + body, 'b.ts': b, 'u.ts': u };
    const scanned = { 'a.ts': files['a.ts'], 'b.ts': b };
    const refs = extractReferences(scanned, CAT, { evidence: translatorEvidence(inMemoryProgram(files), keysOf(scanned)) });
    assert.equal(refs.forwarded.length, forwarded ? 1 : 0, name);
    assert.deepEqual(refs.dynamic.map((x) => x.reason), forwarded ? [] : ['translator wrapper used as a value'], name);
  }
});

test('fourth review: type errors in a scanned file withdraw all evidence', () => {
  const files: Record<string, string> = { 'a.ts': "declare const tr: { t(k: string): string };\nconst t = (k: string): string => tr.t(k);\ndeclare const m: { t: number };\nexport const n: string = m.t;" };
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, types: [], strict: true, noEmit: true };
  const host = ts.createCompilerHost(options);
  const program = ts.createProgram(['a.ts'], options, { ...host, getCurrentDirectory: () => '/', getSourceFile: (n, v, ...r) => (bare(n) === 'a.ts' ? ts.createSourceFile(n, files['a.ts']!, v) : host.getSourceFile(n, v, ...r)), fileExists: (n) => bare(n) === 'a.ts' || host.fileExists(n) });
  const evidence = translatorEvidence(program, keysOf(files));
  assert.deepEqual([evidence.primitiveMemberReads.size, evidence.scannedHandOffs.size], [0, 0]);
});

test('fifth review: suppressed diagnostics withdraw evidence; a receiver must not pass the object on', () => {
  const head = "declare const tr: { t(k: string): string };\nconst t = (k: string): string => tr.t(k);\ntype Fn = (k: string) => string;\n";
  const u = "export const impl = (o: { t: (k: string) => string }): void => { ['qv.bad'].map(o.t); };";
  const cases: [string, string, string, boolean][] = [
    ['suppressed error', "import { draw } from './b.ts';\ndraw({ t });", "// @ts-expect-error\nexport const bad: string = 1;\nexport function draw(env: { t: Fn }): string { return env.t('qv.a.x'); }", false],
    ['passed on whole', "import { draw } from './b.ts';\ndraw({ t });", "import { impl } from './u.ts';\nexport function draw(env: { t: Fn }): void { impl(env); }", false],
    ['passed on via arguments', "import { draw } from './b.ts';\ndraw({ t });", "import { impl } from './u.ts';\nexport function draw(env: { t: Fn }): void { env.t('qv.a.x'); impl(arguments[0]); }", false],
    ['spread before the object', "import { draw } from './b.ts';\nconst xs: [] = [];\ndraw(...xs, { t });", "export function draw(env: { t: Fn }): string { return env.t('qv.a.x'); }", false],
    ['member use only', "import { draw } from './b.ts';\ndraw({ t });", "export function draw(env: { t: Fn; rtl?: boolean }): string { return env.rtl ? '' : env.t('qv.a.x'); }", true],
  ];
  for (const [name, a, b, forwarded] of cases) {
    const files = { 'a.ts': head + a, 'b.ts': b.replace(/Fn/g, '((k: string) => string)'), 'u.ts': u };
    const scanned = { 'a.ts': files['a.ts'], 'b.ts': files['b.ts'] };
    const program = inMemoryProgram(files);
    const refs = extractReferences(scanned, CAT, { evidence: translatorEvidence(program, keysOf(scanned)) });
    assert.equal(refs.forwarded.length, forwarded ? 1 : 0, name);
  }
});
