import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, MemoryStorage } from '../src/key/storage.ts';
import { readLanguagePreference, writeLanguagePreference } from '../src/i18n/preference.ts';
import { negotiateLocale } from '../src/i18n/locales-core.ts';

test('REQ-063: locale query wins over stored preference, which wins over browser languages', () => {
  const offered = ['en', 'es', 'fr'];
  assert.equal(negotiateLocale({ query: 'es', stored: 'fr', browser: ['en'], offered }), 'es');
  assert.equal(negotiateLocale({ stored: 'fr', browser: ['es'], offered }), 'fr');
  assert.equal(negotiateLocale({ browser: ['es'], offered }), 'es');
  assert.equal(negotiateLocale({ offered }), 'en');
});

test('REQ-063: saved language uses device settings and preserves other settings', async () => {
  const storage = new MemoryStorage();
  await storage.putSettings({ ...DEFAULT_SETTINGS, confirmed: { electionA: true }, rulesSeen: { electionB: true }, sharedDevice: true });
  await writeLanguagePreference(storage, 'fr');
  assert.equal(await readLanguagePreference(storage), 'fr');
  assert.deepEqual(await storage.getSettings(), {
    ...DEFAULT_SETTINGS,
    confirmed: { electionA: true },
    rulesSeen: { electionB: true },
    sharedDevice: true,
    language: 'fr',
  });
});

test('REQ-063: inaccessible settings fall back to browser negotiation', async () => {
  const unavailable = { getSettings: async () => { throw new Error('unavailable'); } };
  assert.equal(await readLanguagePreference(unavailable), undefined);
  assert.equal(negotiateLocale({ stored: await readLanguagePreference(unavailable), browser: ['es'], offered: ['en', 'es'] }), 'es');
});
