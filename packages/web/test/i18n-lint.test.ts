import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractReferences, unknownReferences } from '../src/i18n/extract.ts';
import { lintCatalog, lintLiterals } from '../src/i18n/catalog-lint.ts';

test('reference extraction is deterministic and separates dynamic keys', () => {
  const refs = extractReferences({
    'b.ts': "t('qv.a.ok'); t('bad key'); t(key); env.t(`qv.b.ok`);",
    'a.ts': "t('qv.a.ok'); function verifyView(){ t('qv.hidden'); }",
  });
  assert.deepEqual(refs.static.map((x) => [x.file, x.key]), [['a.ts', 'qv.a.ok'], ['b.ts', 'bad key'], ['b.ts', 'qv.a.ok'], ['b.ts', 'qv.b.ok']]);
  assert.deepEqual(refs.dynamic.map((x) => x.expression), ['key']);
  assert.deepEqual(unknownReferences(refs.static, { 'qv.a.ok': {} }).map((x) => x.key), ['bad key', 'qv.b.ok']);
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
  ]);
  assert.deepEqual(result.exclusions.map((x) => x.reason), ['restricted block excluded by scan scope']);
});
