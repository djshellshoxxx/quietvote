import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parseCheckpoint, verifyLogSignature } from '@quietvote/board';
import { boardCanaries, boardCanaryControl, type BoardCanaryBundle } from '../scripts/board-canaries.ts';
import { buildCorpus } from '../scripts/build-corpus.ts';
import { CORPUS_URL, loadCorpus, runSelfTest, type Corpus, type CorpusCase } from '../src/canary.ts';
import { verifyBundle } from '../src/verify.ts';

const BOARD_IDS = ['board-ballot-entry-dropped', 'board-ballot-entries-reordered', 'board-checkpoint-fork'];
const vectors = new URL('../../../test-vectors/v1/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, vectors), 'utf8')) as T;
const boardCases = (): CorpusCase[] => loadCorpus().canaries.filter((c) => BOARD_IDS.includes(c.id));

test('the shipped self-test contains all three board tamper canaries', () => {
  const corpus = loadCorpus();
  assert.deepEqual(corpus.canaries.filter((c) => c.id.startsWith('board-')).map((c) => c.id), BOARD_IDS);
  assert.deepEqual(boardCases(), boardCanaries());
  assert.equal(corpus.canaries.length, 32);
});

test('every legacy canary and the tiny positive control retain their frozen inputs and expectations', () => {
  const corpus = loadCorpus();
  assert.deepEqual(corpus.control, {
    id: 'tiny-yesno-3v', expect: { verdict: 'PASS' }, bundle: read('elections/tiny-yesno-3v/bundle.json'),
  });
  const expected = read<{ verdict: string; checks: Record<string, string> }>('canary/expected-report.json');
  const legacy: CorpusCase[] = [{
    id: 'canary-election', source: 'canary/canary-election.json',
    expect: { verdict: expected.verdict, failed_checks: Object.entries(expected.checks).filter(([, status]) => status === 'fail').map(([id]) => id).sort(), codes: [] },
    bundle: read('canary/canary-election.json'),
  }];
  for (const name of readdirSync(new URL('mutations/', vectors)).sort()) {
    const mutation = read<CorpusCase>(`mutations/${name}`);
    legacy.push({ id: mutation.id, source: `mutations/${name}`, expect: mutation.expect, bundle: mutation.bundle });
  }
  assert.equal(legacy.length, 29);
  assert.deepEqual(corpus.canaries.slice(0, legacy.length), legacy);
});

test('board positive control preserves signed fixture bytes and supplies the same manifest witness anchors', async () => {
  const control = boardCanaryControl();
  const { board, ...election } = control;
  assert.deepEqual(election, read('elections/log-layer-4v/bundle.json'));
  const original = read<BoardCanaryBundle['board']>('elections/log-layer-4v/board.json');
  assert.deepEqual({ ...board, policy: original.policy }, original, 'only the export witness policy is filled in');
  assert.equal(board.policy.log_pk_b64, original.policy.log_pk_b64);
  assert.equal(board.policy.witness_policy.quorum, control.manifest.body.bb.witness_quorum);
  assert.equal(board.policy.witness_policy.none_acknowledged, false);
  assert.deepEqual(board.policy.witness_policy.witnesses.map((w) => ({ name: w.name, pk: Buffer.from(w.pk_b64, 'base64').toString('hex') })), control.manifest.body.bb.witnesses);

  const report = await verifyBundle(control, { pinnedManifestHash: control.manifest_hash });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.board?.integrity, 'VERIFIED');
  assert.equal(report.checks.V4.status, 'pass');
  assert.deepEqual(report.findings, []);
  for (const [id, status] of Object.entries(report.chk)) assert.equal(status, id === 'chk.receipts.sample' ? 'not_run' : 'pass', id);
});

test('the three mutations leave records and signatures intact and the fork is genuinely log-signed', () => {
  const control = boardCanaryControl();
  const [dropped, reordered, forked] = boardCases().map((c) => c.bundle as BoardCanaryBundle);
  assert.ok(dropped && reordered && forked);
  const expectedDrop = structuredClone(control);
  expectedDrop.board.entries.splice(17, 1);
  assert.deepEqual(dropped, expectedDrop);
  const expectedReorder = structuredClone(control);
  [expectedReorder.board.entries[17], expectedReorder.board.entries[18]] = [expectedReorder.board.entries[18]!, expectedReorder.board.entries[17]!];
  assert.deepEqual(reordered, expectedReorder);
  assert.deepEqual({ ...forked, board: { ...forked.board, checkpoints: control.board.checkpoints } }, control);
  assert.deepEqual(forked.board.checkpoints.slice(0, -1), control.board.checkpoints);
  const fork = parseCheckpoint(forked.board.checkpoints.at(-1)!);
  assert.ok(fork.ok);
  assert.ok(verifyLogSignature(fork.value, Buffer.from(control.manifest.body.bb.log_pk, 'hex')));
  const honest = control.board.checkpoints.map(parseCheckpoint).find((cp) => cp.ok && cp.value.size === fork.value.size);
  assert.ok(honest?.ok);
  assert.equal(fork.value.origin, honest.value.origin);
  assert.notDeepEqual(fork.value.root, honest.value.root);
});

test('board canaries fail exactly their explicit named checks and retain unrelated content checks', async () => {
  for (const c of boardCases()) {
    const report = await verifyBundle(c.bundle as BoardCanaryBundle);
    assert.equal(report.verdict, c.expect.verdict, c.id);
    assert.equal(report.checks.V4.status, 'fail', c.id);
    assert.deepEqual(Object.entries(report.chk).filter(([, status]) => status === 'fail').map(([id]) => id).sort(), [...c.expect.failed_checks!].sort(), c.id);
    for (const code of c.expect.codes!) assert.ok(report.findings.some((f) => f.code === code), `${c.id}: ${code}`);
    for (const id of ['V1', 'V2', 'V3', 'V5', 'V6', 'V8', 'V9', 'V10', 'V11', 'V12'] as const) assert.equal(report.checks[id].status, 'pass', `${c.id}: ${id}`);
  }
});

test('self-test accepts the real positive board control and rejects all three board canaries', async () => {
  const corpus: Corpus = { ...loadCorpus(), control: { id: 'board-positive-control', expect: { verdict: 'PASS' }, bundle: boardCanaryControl() }, canaries: boardCases() };
  const result = await runSelfTest(corpus);
  assert.equal(result.control, true);
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.deepEqual(result.cases.filter((c) => c.kind === 'canary').map((c) => c.id), BOARD_IDS);
  assert.equal(result.rejected, result.total);
});

test('self-test rejects a healthy board disguised as a canary and wrong board expectations', async () => {
  const fork = boardCases()[2]!;
  const corpus: Corpus = { ...loadCorpus(), canaries: [
    { id: 'healthy-board', expect: {}, bundle: boardCanaryControl() },
    { ...fork, id: 'missing-board-check', expect: { ...fork.expect, failed_checks: ['chk.board.append_only'] } },
    { ...fork, id: 'wrong-check', expect: { ...fork.expect, failed_checks: ['chk.result.rules'] } },
    { ...fork, id: 'wrong-code', expect: { ...fork.expect, codes: ['E_LOG_ORDER'] } },
    { ...fork, id: 'wrong-verdict', expect: { ...fork.expect, verdict: 'PASS' } },
  ] };
  const result = await runSelfTest(corpus);
  assert.equal(result.ok, false);
  assert.equal(result.control, true);
  for (const c of corpus.canaries) assert.ok(result.failures.some((f) => f.startsWith(`${c.id}:`)), c.id);
  assert.ok(result.failures.some((f) => f.startsWith('healthy-board: ACCEPTED')));
  assert.ok(result.failures.some((f) => f.startsWith('missing-board-check: failed checks')));
  assert.ok(result.failures.some((f) => f.startsWith('wrong-check: failed checks')));
  assert.ok(result.failures.some((f) => f.startsWith('wrong-code: missing expected finding codes')));
  assert.ok(result.failures.some((f) => f.startsWith('wrong-verdict: verdict')));
});

test('corpus generation is deterministic, drift-checked and stays below one decimal megabyte', () => {
  const generated = buildCorpus();
  assert.equal(generated, buildCorpus());
  assert.equal(generated, readFileSync(CORPUS_URL, 'utf8'));
  assert.ok(Buffer.byteLength(generated) <= 1_000_000);
});
