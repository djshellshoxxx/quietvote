import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verifyElection } from '../src/index.ts';

const read = (name: string): any => JSON.parse(readFileSync(new URL(`../../../test-vectors/v1/${name}`, import.meta.url), 'utf8'));
const bare = (): any => read('elections/tiny-yesno-3v/bundle.json');
const logged = (): any => read('elections/log-layer-4v/bundle.json');
const board = (): any => read('elections/log-layer-4v/board.json');

test('default verification cannot call an unlogged election PASS; only a trusted explicit Boolean opt-out can', async () => {
  const b = bare();
  const strict = await verifyElection(b);
  assert.equal(strict.verdict, 'INCOMPLETE');
  assert.equal(strict.checks['chk.tally.decrypt'], 'pass');
  assert.equal(strict.checks['chk.board.append_only'], 'not_run');
  for (const field of ['allowNoLog', 'allow_no_log', 'contentOnly']) {
    assert.equal((await verifyElection({ ...b, [field]: true })).verdict, 'INCOMPLETE');
  }
  assert.equal((await verifyElection(b, { allowNoLog: 'true' as never })).verdict, 'INCOMPLETE');
  const scoped = await verifyElection(b, { allowNoLog: true });
  assert.equal(scoped.verdict, 'PASS');
  assert.ok(scoped.caveats.some((s) => s.startsWith('CONTENT-ONLY')));
  assert.equal(scoped.checks['chk.board.witness'], 'not_run');
});

test('authenticated witnessed board can PASS by default; supplied malformed evidence cannot use content-only opt-out', async () => {
  const good = await verifyElection(logged(), { log: { board: board() } });
  assert.equal(good.verdict, 'PASS');
  assert.equal(good.checks['chk.board.append_only'], 'pass');
  assert.equal(good.checks['chk.board.witness'], 'pass');
  for (const malformed of [null, {}, { format: 'qv-bundle/v1' }]) {
    const bad = await verifyElection(logged(), { log: { board: malformed }, allowNoLog: true });
    assert.equal(bad.verdict, 'FAIL');
    assert.equal(bad.checks['chk.board.append_only'], 'fail');
  }
});

test('operational log-layer failure stays INCOMPLETE, and an independent fatal error still wins', async () => {
  const evidence = { get board(): unknown { throw new Error('operational failure'); } };
  const incomplete = await verifyElection(logged(), { log: evidence, allowNoLog: true });
  assert.equal(incomplete.verdict, 'INCOMPLETE');
  assert.equal(incomplete.checks['chk.board.append_only'], 'not_run');
  assert.equal(incomplete.checks['chk.board.witness'], 'not_run');
  assert.ok(incomplete.caveats.some((s) => /could not be fully checked/.test(s)));
  const invalid = logged(); invalid.manifest.sigs = [];
  assert.equal((await verifyElection(invalid, { log: evidence, allowNoLog: true })).verdict, 'FAIL');
});
