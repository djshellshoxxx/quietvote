// QV-35-REQ-003 ("no check reported as pass without its evidence") applied to chk.encoding.canonical ("all objects canonically
// encoded", QV-34 §9.1 #13): a stop before the voter envelopes are examined (C4) must not report it as `pass`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyElection } from '../src/index.ts';

const vec = (p: string): any => JSON.parse(readFileSync(new URL(`../../../test-vectors/v1/${p}`, import.meta.url), 'utf8'));
const openMutants = [
  'open-binding-fields-absent', 'open-joint-key-ref-forward', 'open-joint-key-ref-mismatch', 'open-manifest-hash-mismatch',
  'open-roll-ref-absent', 'open-roll-ref-forward', 'open-roll-ref-nonexistent', 'open-roll-ref-wrong-record',
];

for (const id of openMutants) {
  test(`report semantics: ${id} stops before C4, so chk.encoding.canonical is not_run`, async () => {
    const { bundle, expect } = vec(`mutations/${id}.json`);
    const r = await verifyElection(bundle);
    assert.equal(r.verdict, expect.verdict);
    assert.equal(r.checks['chk.time.window'], 'fail');
    assert.equal(r.checks['chk.manifest.sig'], 'pass');
    assert.equal(r.checks['chk.keys.trustees'], 'pass');
    assert.equal(r.checks['chk.encoding.canonical'], 'not_run');
    assert.equal(r.checks['chk.ballots.valid'], 'not_run');
  });
}

test('report semantics: a record encoding failure found before the stop is still reported', async () => {
  const { bundle } = vec('mutations/open-roll-ref-absent.json');
  bundle.log.push({ seq: bundle.log.at(-1).seq + 1, entry: { body: { proto: 'qv1-r255-sha2', type: 'mystery' } } });
  const r = await verifyElection(bundle);
  assert.equal(r.checks['chk.encoding.canonical'], 'fail');
});

test('report semantics: chk.encoding.canonical is pass once every object was examined (honest bundle control)', async () => {
  const r = await verifyElection(vec('elections/tiny-yesno-3v/bundle.json'));
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.checks['chk.encoding.canonical'], 'pass');
});
