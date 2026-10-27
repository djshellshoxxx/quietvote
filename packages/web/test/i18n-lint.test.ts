import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractReferences, unknownReferences, unknownResolvedReferences } from '../src/i18n/extract.ts';
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
