import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatReport, hashReport, loadCorpus, runSelfTest, verifyBundle } from '../src/index.ts';

const tiny = (): any => JSON.parse(readFileSync(new URL('../../../test-vectors/v1/elections/tiny-yesno-3v/bundle.json', import.meta.url), 'utf8'));

test('B1-06: unpinned verification discloses the bundle anchor and chosen manifest hash', async () => {
  const b = tiny();
  const r = await verifyBundle(b);
  assert.equal(r.verdict, 'PASS');
  assert.ok(r.caveats.some((c) => /manifest hash.*not.*out.of.band/i.test(c)), r.caveats.join('\n'));
  assert.ok(formatReport(r).includes(b.manifest_hash));
  assert.equal(r.reportHash, hashReport(r));
  const pinned = await verifyBundle(b, { pinnedManifestHash: b.manifest_hash });
  assert.equal(pinned.verdict, 'PASS');
  assert.ok(!pinned.caveats.some((c) => /manifest hash.*not.*out.of.band/i.test(c)));
  assert.ok(formatReport(pinned).includes(b.manifest_hash));
  const mismatch = await verifyBundle(b, { pinnedManifestHash: '00'.repeat(32) });
  assert.equal(mismatch.verdict, 'FAIL');
  assert.ok(formatReport(mismatch).includes('00'.repeat(32)));
});

test('TSV-06: canary expectations include the verdict even when checks and codes match', async () => {
  const corpus = loadCorpus();
  const canary = corpus.canaries.find((c) => c.expect.verdict === 'PASS');
  assert.ok(canary, 'corpus has an L-class or alarm mutant retaining PASS');
  const result = await runSelfTest({ ...corpus, canaries: [{ ...canary, expect: { ...canary.expect, verdict: 'FAIL' } }] });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => /verdict/i.test(f)), result.failures.join('\n'));
});
