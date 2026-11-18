// Adversarial tests from the web-verifier audit (docs/audit/web-verifier.md): report integrity and fail-closed canary behaviour.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hashReport, loadCorpus, verifyWithSelfTest, type Corpus } from '../src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-vectors', 'v1');
const tinyText = (): string => readFileSync(join(ROOT, 'elections', 'tiny-yesno-3v', 'bundle.json'), 'utf8');

test('WV-1: reportHash matches the report content after a failing self-test flips the verdict', async () => {
  const corpus = loadCorpus();
  const rigged: Corpus = { ...corpus, canaries: [{ id: 'actually-valid', expect: {}, bundle: corpus.control.bundle }] };
  const r = await verifyWithSelfTest(tinyText(), { corpus: rigged });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.reportHash, hashReport(r), 'a FAIL report must not carry the hash of the PASS report');
});

test('WV-1: reportHash matches the report content when the self-test is skipped (caveat added)', async () => {
  const r = await verifyWithSelfTest(tinyText(), { skipSelfTest: true });
  assert.ok(r.caveats.some((c) => c.includes('self-test skipped')));
  assert.equal(r.reportHash, hashReport(r));
});

test('WV-2: a corpus that cannot be loaded fails closed (FAIL, never PASS, never a throw)', async () => {
  const r = await verifyWithSelfTest(tinyText(), { corpusText: '{not json' });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.selfTest?.ok, false);
  assert.equal(r.reportHash, hashReport(r));
  const r2 = await verifyWithSelfTest(tinyText(), { corpusText: JSON.stringify({ format: 'qv-canary-corpus/v1', canaries: [] }) });
  assert.equal(r2.verdict, 'FAIL');
});
