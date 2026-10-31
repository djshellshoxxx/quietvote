import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, type Node } from '../src/i18n/icu.ts';
import { EN, MESSAGE_KEYS } from '../src/i18n/en.ts';
import { LOCALES, GUARANTEE_KEYS, gate, offeredLocales, negotiateLocale, sourceHash, unknownKeys, type LocaleDef } from '../src/i18n/locales.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { ES } from '../src/i18n/catalogs/es.ts';
import { FR } from '../src/i18n/catalogs/fr.ts';
import { DE } from '../src/i18n/catalogs/de.ts';
import { PT_BR } from '../src/i18n/catalogs/pt-BR.ts';
import { AR } from '../src/i18n/catalogs/ar.ts';

const TRANSLATED_TAGS = ['es', 'fr', 'de', 'pt-BR', 'ar'];
const TABLES: Record<string, Readonly<Record<string, string>>> = { es: ES, fr: FR, de: DE, 'pt-BR': PT_BR, ar: AR };
const translated = (): LocaleDef[] => LOCALES.filter((l) => l.tier !== 'source');

/** Same locale list, but every guarantee key carries the review hash of the current English string (test-only fixture). */
const withMatchingReviews = (): LocaleDef[] =>
  LOCALES.map((l) => (l.tier === 'source' ? l : { ...l, review: Object.fromEntries(GUARANTEE_KEYS.map((k) => [k, sourceHash(k)])) }));

/** Structural tokens of a parsed message: argument names, plural/select names, and select case keys. Order-insensitive. */
function shape(nodes: readonly Node[], out: string[] = []): string[] {
  for (const n of nodes) {
    switch (n.k) {
      case 'arg':
      case 'num':
      case 'date':
      case 'list':
        out.push(`${n.k}:${n.name}`);
        break;
      case 'plural':
        out.push(`plural:${n.name}:${n.ordinal}:${n.offset}`);
        for (const c of Object.values(n.cases)) shape(c, out);
        break;
      case 'select':
        out.push(`select:${n.name}:${Object.keys(n.cases).sort().join('|')}`);
        for (const c of Object.values(n.cases)) shape(c, out);
        break;
      default:
        break;
    }
  }
  return out.sort();
}

/** Text with placeholders and product/format names removed, used to decide whether a string still has English words. */
const wordsOutside = (s: string): string => s.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' ').replace(/QuietVote|DEMO|AGPL/g, ' ');

test('catalogs: every locale table has exactly the English key set and no unknown keys', () => {
  for (const tag of TRANSLATED_TAGS) {
    const def = LOCALES.find((l) => l.tag === tag)!;
    assert.ok(def, tag);
    assert.deepEqual(Object.keys(def.messages).sort(), [...MESSAGE_KEYS].sort(), `${tag} key set`);
    assert.deepEqual(unknownKeys(def), [], tag);
    assert.equal(Object.keys(TABLES[tag]!).length, MESSAGE_KEYS.length, `${tag} exported table`);
  }
});

test('catalogs: every translated message parses as ICU and keeps the English placeholders and plural/select structure', () => {
  for (const def of translated()) {
    for (const k of MESSAGE_KEYS) {
      const src = def.messages[k];
      assert.ok(src !== undefined && src.trim() !== '', `${def.tag} ${k} is empty or missing`);
      let ast: Node[] = [];
      assert.doesNotThrow(() => (ast = parse(src)), `${def.tag} ${k} is not valid ICU`);
      assert.deepEqual(shape(ast), shape(parse(EN[k].message)), `${def.tag} ${k} changed placeholders or plural/select structure`);
    }
  }
});

/** Real cognates that are correct in the target language and therefore identical to the English source. */
const COGNATES: Readonly<Record<string, readonly string[]>> = {
  es: ['qv.shell.errorTitle'], // "Error" is the ordinary noun in both Spanish and English.
  fr: ['qv.results.option', 'qv.org.question'],
  de: ['qv.key.passphrase', 'qv.verify.findings', 'qv.results.option'],
};

test('catalogs: a translation identical to English only when it has no English words left, or is a listed cognate', () => {
  for (const def of translated()) {
    for (const k of MESSAGE_KEYS) {
      if (def.messages[k] !== EN[k].message) continue;
      if (COGNATES[def.tag]?.includes(k)) continue;
      assert.equal(/[A-Za-z]{2,}/.test(wordsOutside(EN[k].message)), false, `${def.tag} ${k} is still English`);
    }
  }
});

test('catalogs: guarantee strings are translated, never left to fall back to English', () => {
  for (const def of translated()) {
    for (const k of GUARANTEE_KEYS) {
      assert.ok(def.messages[k], `${def.tag} ${k}`);
    }
  }
  assert.equal(EN['qv.privacy.g2'].sensitivity, 'guarantee');
  assert.match(ES['qv.privacy.g2'], /\{t\}.*\{n\}.*\{trustee_names, list\}/);
  assert.match(AR['qv.org.trustee.warning'], /\{t\}.*\{n_minus_t\}/);
});

test('REQ-064 as shipped: no translated locale is offered, because no native review records exist yet', () => {
  assert.deepEqual(offeredLocales().map((l) => l.tag), ['en']);
  for (const def of translated()) {
    const g = gate(def);
    assert.equal(g.offered, false, def.tag);
    assert.deepEqual(g.missing, GUARANTEE_KEYS, def.tag);
  }
});

test('REQ-064: with a matching review record for every guarantee key, es/fr/de/pt-BR/ar are offered', () => {
  const reviewed = withMatchingReviews();
  assert.deepEqual(offeredLocales(reviewed).map((l) => l.tag), ['en', 'es', 'fr', 'de', 'pt-BR', 'ar']);
  assert.equal(negotiateLocale({ query: 'es', offered: offeredLocales(reviewed).map((l) => l.tag) }), 'es');
  assert.equal(negotiateLocale({ stored: 'pt', offered: offeredLocales(reviewed).map((l) => l.tag) }), 'pt-BR');
  assert.equal(negotiateLocale({ browser: ['ar-EG'], offered: offeredLocales(reviewed).map((l) => l.tag) }), 'ar');
});

test('REQ-064: one stale review hash withdraws that locale again', () => {
  const reviewed = withMatchingReviews();
  const de = reviewed.find((l) => l.tag === 'de')!;
  const stale: LocaleDef = { ...de, review: { ...de.review, 'qv.privacy.g1': 'stale' } };
  const defs = reviewed.map((l) => (l.tag === 'de' ? stale : l));
  assert.equal(gate(stale).offered, false);
  assert.deepEqual(gate(stale).missing, ['qv.privacy.g1']);
  assert.equal(offeredLocales(defs).some((l) => l.tag === 'de'), false);
});

test('translator: es and fr render with arguments and plural rules; ar is RTL and uses its own plural forms', () => {
  const defs = withMatchingReviews();
  const es = createTranslator('es', { defs, timeZone: 'UTC' });
  assert.equal(es.dir, 'ltr');
  assert.equal(es.t('qv.shell.stepOf', { current: 2, total: 5 }), 'Paso 2 de 5');
  assert.equal(es.t('qv.election.contests', { count: 1 }), '1 pregunta');
  assert.equal(es.t('qv.election.contests', { count: 3 }), '3 preguntas');

  const fr = createTranslator('fr', { defs, timeZone: 'UTC' });
  assert.equal(fr.t('qv.results.quorum', { met: true }), 'Quorum : atteint.');

  const ar = createTranslator('ar', { defs, timeZone: 'UTC' });
  assert.equal(ar.dir, 'rtl');
  assert.equal(ar.t('qv.election.contests', { count: 1 }), 'سؤال واحد');
  assert.equal(ar.t('qv.election.contests', { count: 2 }), 'سؤالان');
  assert.ok(ar.t('qv.election.contests', { count: 5 }).includes('أسئلة'));
});

test('translator: a translated table still throws for a guarantee key missing from that table', () => {
  const partial: LocaleDef = { tag: 'xx', dir: 'ltr', autonym: 'Xx', tier: 1, messages: { 'qv.shell.back': 'Atrás' }, review: {} };
  const tr = createTranslator('xx', { defs: [...LOCALES, partial] });
  assert.equal(tr.t('qv.shell.back'), 'Atrás');
  assert.equal(tr.t('qv.shell.continue'), 'Continue');
  assert.throws(() => tr.t('qv.privacy.g1'));
});
