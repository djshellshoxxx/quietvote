import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LiveElection, type LiveTarget } from '../src/flow/live.ts';
import type { EntryView } from '../src/api/types.ts';

function deferredTarget() {
  let resolvePage!: (page: { entries: EntryView[]; treeSize: number }) => void;
  const page = new Promise<{ entries: EntryView[]; treeSize: number }>((resolve) => { resolvePage = resolve; });
  const target: LiveTarget = {
    apiId: 'test-election',
    api: {
      allEntries: async () => page,
      events: async () => new Response(),
    },
    records: [],
  };
  return { target, resolvePage };
}

test('live close keeps settled pending until an in-flight refresh finishes', async () => {
  const { target, resolvePage } = deferredTarget();
  const live = new LiveElection(target);
  const refresh = live.refresh();
  let settled = false;
  const idle = live.settled().then(() => { settled = true; });

  live.close();
  await Promise.resolve();
  assert.equal(settled, false, 'close must not report idle while the refresh is still running');

  resolvePage({ entries: [], treeSize: 0 });
  await Promise.all([refresh, idle]);
  assert.equal(settled, true);
});

test('live close discards a late page without mutating the closed target or notifying the view', async () => {
  const { target, resolvePage } = deferredTarget();
  let changes = 0;
  const live = new LiveElection(target, { onChange: () => { changes++; } });
  const refresh = live.refresh();

  live.close();
  resolvePage({
    entries: [{ seq: 0, type: 'manifest', leaf_hash: 'AA', header_b64u: 'AA', body_b64u: null }],
    treeSize: 1,
  });
  await refresh;

  assert.deepEqual(target.records, [], 'a completed response must not update a closed election');
  assert.equal(changes, 0, 'a closed view must not receive a late change callback');
});

test('live close during context derivation does not commit candidate records', async () => {
  const { target, resolvePage } = deferredTarget();
  let live!: LiveElection;
  let changes = 0;
  live = new LiveElection(target, { onChange: () => { changes++; } });
  const entry: EntryView = {
    seq: 0,
    type: 'manifest',
    leaf_hash: 'AA',
    header_b64u: 'AA',
    get body_b64u() {
      queueMicrotask(() => live.close());
      return null;
    },
  };
  const refresh = live.refresh();

  resolvePage({ entries: [entry], treeSize: 1 });
  await refresh;

  assert.deepEqual(target.records, [], 'a view closed during derivation must not commit the candidate page');
  assert.equal(target.ctx, undefined);
  assert.equal(changes, 0);
});
