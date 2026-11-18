import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderCopyDoc, violations, isVoterFacing } from '../src/i18n/copy-rules.ts';
import { MESSAGE_KEYS } from '../src/i18n/en.ts';

test('voter-facing copy: short sentences, no jargon', () => {
  assert.deepEqual(violations(), []);
  assert.ok(MESSAGE_KEYS.filter(isVoterFacing).length > 100);
});

test('COPY.md lists every screen and is in sync with the catalog', () => {
  const path = fileURLToPath(new URL('../COPY.md', import.meta.url));
  const doc = renderCopyDoc();
  if (process.env.UPDATE_COPY === '1') writeFileSync(path, doc);
  assert.equal(readFileSync(path, 'utf8'), doc);
});
