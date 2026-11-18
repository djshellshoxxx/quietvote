// Public UI never inherits the library's trusted content-only escape hatch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { canShowResults, verifyPublicBundleText } from '../src/flow/verification.ts';

const base = new URL('../../../test-vectors/v1/elections/log-layer-4v/', import.meta.url);
const read = (name: string): any => JSON.parse(readFileSync(new URL(name, base), 'utf8'));

test('fresh P1 public UI: payload and caller-shaped options cannot opt out of log evidence', async () => {
  const bundle = read('bundle.json');
  const bare = await verifyPublicBundleText(JSON.stringify(bundle));
  assert.equal(bare.verdict, 'INCOMPLETE');
  assert.equal(canShowResults(bare), false);
  const injected = { ...bundle, allowNoLog: true, contentOnly: true, options: { allowNoLog: true } };
  const report = await verifyPublicBundleText(JSON.stringify(injected), { allowNoLog: true } as any);
  assert.notEqual(report.verdict, 'PASS');
  assert.equal(canShowResults(report), false);
  assert.ok(!report.caveats.some((c) => c.includes('CONTENT-ONLY')));
});

test('fresh P1 public UI: actual signed evidence is forwarded and malformed evidence is not dropped', async () => {
  const bundle = read('bundle.json');
  const verified = await verifyPublicBundleText(JSON.stringify({ ...bundle, board: read('board.json') }));
  assert.equal(verified.verdict, 'PASS');
  assert.equal(verified.checks['chk.board.append_only'], 'pass');
  assert.equal(verified.checks['chk.board.witness'], 'pass');
  assert.equal(canShowResults(verified), true);
  for (const board of [null, {}, false]) {
    const report = await verifyPublicBundleText(JSON.stringify({ ...bundle, board }));
    assert.equal(report.verdict, 'FAIL');
    assert.equal(canShowResults(report), false);
  }
});
