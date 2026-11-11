// W7 (docs/audit/web-second-wave.md): after a failed refresh the status line says "reload the page"; a later successful refresh
// must clear that, otherwise it stays wrong while the page is in fact up to date again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LiveElection, type LiveTarget } from '../src/flow/live.ts';

function target(fail: { on: boolean }): LiveTarget {
  return {
    apiId: 'x', records: [],
    api: {
      allEntries: async () => { if (fail.on) throw new Error('boom'); return { entries: [], treeSize: 0 }; },
      events: async () => new Response(null),
    },
  } as unknown as LiveTarget;
}

test('W7: onRecovered fires once, on the first good refresh after a failure, and never without a prior failure', async () => {
  const fail = { on: false };
  const log: string[] = [];
  const live = new LiveElection(target(fail), { onError: () => log.push('error'), onRecovered: () => log.push('recovered') });
  await live.refresh();
  assert.deepEqual(log, [], 'a good refresh with no earlier failure says nothing');
  fail.on = true;
  await live.refresh();
  await live.refresh();
  assert.deepEqual(log, ['error', 'error']);
  fail.on = false;
  await live.refresh();
  assert.deepEqual(log, ['error', 'error', 'recovered']);
  await live.refresh();
  assert.deepEqual(log, ['error', 'error', 'recovered'], 'only once');
});

test('W7 wiring: the UI resets the status line from the connection state on recovery', () => {
  const app = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.match(app, /onRecovered:[^\n]*liveText\(/);
});
