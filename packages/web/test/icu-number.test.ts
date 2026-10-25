import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compiledFormatter } from '../src/i18n/compiled-runtime.ts';
import { format, parse } from '../src/i18n/icu.ts';

test('ICU number, latn overrides a locale numbering-system extension only for that argument', () => {
  for (const locale of ['ar-u-nu-arab', 'ar-u-ca-islamic-nu-arab']) {
    const value = 1234;
    const expectedLatn = new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(value);
    const expectedLocaleDefault = new Intl.NumberFormat(locale).format(value);

    assert.equal(format('{n, number, latn}', { n: value }, { locale }), expectedLatn, locale);
    assert.equal(compiledFormatter(parse('{n, number, latn}'))({ n: value }, { locale }), expectedLatn, `${locale} compiled formatter`);
    assert.equal(format('{n, number}', { n: value }, { locale }), expectedLocaleDefault, `${locale} default numbering system`);
  }
});
