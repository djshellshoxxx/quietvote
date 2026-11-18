// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { electionPath, parseRoute } from '../src/ui/route.ts';

test('current hex API election IDs reach each browser election view', () => {
  const id = '0123456789abcdef'.repeat(2);
  for (const view of ['overview', 'rules', 'key', 'vote', 'receipt', 'results', 'spoils', 'admin'] as const) {
    assert.deepEqual(parseRoute(electionPath(id, view)), { name: 'election', id, view });
  }
  assert.deepEqual(parseRoute(electionPath(id)), { name: 'election', id, view: 'overview' });
  for (const bad of ['../etc', id + '0', id.slice(1), 'g'.repeat(32), id.toUpperCase()]) {
    assert.equal(parseRoute(electionPath(bad)).name, 'notfound');
  }
  assert.equal(parseRoute(electionPath('a'.repeat(26))).name, 'election');
});
