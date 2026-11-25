// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-10-REQ-011, QV-13-REQ-063
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultContests } from '../../protocol/test/helpers/sim.ts';
import { maximumSelections } from '../src/flow/ballot-review.ts';
import { MemoryStorage } from '../src/key/storage.ts';
import { writeLanguagePreference } from '../src/i18n/preference.ts';

test('settings updates preserve other preferences and election notices', async () => {
  const storage = new MemoryStorage();
  await Promise.all([
    storage.updateSettings((s) => ({ ...s, sharedDevice: true })),
    storage.updateSettings((s) => ({ ...s, rememberReceipts: false })),
    storage.updateSettings((s) => ({ ...s, confirmed: { ...s.confirmed, election: true } })),
    storage.updateSettings((s) => ({ ...s, rulesSeen: { ...s.rulesSeen, election: true } })),
    writeLanguagePreference(storage, 'fr'),
  ]);
  assert.deepEqual(await storage.getSettings(), { sharedDevice: true, rememberReceipts: false,
    confirmed: { election: true }, rulesSeen: { election: true }, language: 'fr' });
  const detached = await storage.getSettings();
  detached.rulesSeen['election'] = false;
  assert.equal((await storage.getSettings()).rulesSeen['election'], true, 'reading settings cannot mutate the saved maps');
});

test('an abandoned settings view cannot apply a later update', async () => {
  const storage = new MemoryStorage();
  const before = await storage.getSettings();
  assert.equal(await storage.updateSettings((s) => ({ ...s, sharedDevice: true }), () => false), undefined);
  assert.deepEqual(await storage.getSettings(), before);
});

test('review bounds follow each voting method, independently of winner count', () => {
  const contests = defaultContests();
  assert.deepEqual(contests.map((c) => [c.method, maximumSelections(c)]), [
    ['yes-no', 1], ['single-choice', 1], ['approval', 4], ['k-of-n', 2],
  ]);
  assert.equal(contests[2]!.winners, 2);
  assert.equal(maximumSelections(contests[2]!), 4, 'approval does not use its two winners as the selection maximum');
});
