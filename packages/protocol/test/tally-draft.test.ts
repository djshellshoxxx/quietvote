// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  verifyElection, verifyTallyDraft, type ElectionBundle, type TallyBody, type TallyDraftReport,
} from '../src/index.ts';

function fixture(name = 'tiny-yesno-3v') {
  const published = JSON.parse(readFileSync(new URL(`../../../test-vectors/v1/elections/${name}/bundle.json`, import.meta.url), 'utf8')) as ElectionBundle;
  const row = published.log.find(({ entry }) => (entry as { body?: { type?: string } }).body?.type === 'tally');
  assert.ok(row, 'the committed fixture supplies a genuine published tally');
  const body = structuredClone((row.entry as { body: TallyBody }).body);
  // Public JSON fixtures have no board evidence. Use only their pre-tally content
  // prefix; never add a candidate, fabricated signature or synthetic board entry.
  const snapshot = { ...published, log: published.log.filter(({ seq }) => seq < row.seq) };
  return { published, snapshot, body };
}

function failed(report: TallyDraftReport, code: string): void {
  assert.equal(report.verdict, 'FAIL', JSON.stringify(report.findings));
  assert.equal(report.bodyMatchesSnapshot, false);
  assert.ok(report.findings.some((finding) => finding.code === code), JSON.stringify(report.findings));
  assert.equal(report.published, false);
  assert.equal(report.freshnessVerified, false);
}

for (const [name, counted, casts] of [
  ['tiny-yesno-3v', 4, 4], ['small-approval-20v', 18, 21], ['log-layer-4v', 4, 5],
] as const) {
  test(`unsigned ${name} matches its content snapshot without publishing or changing inputs`, async () => {
    const { snapshot, body } = fixture(name);
    const before = structuredClone({ snapshot, body });
    const report = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
    assert.equal(report.verdict, 'MATCH', JSON.stringify(report.findings));
    assert.equal(report.scope, 'tally-draft');
    assert.equal(report.bodyMatchesSnapshot, true);
    assert.equal(report.published, false);
    assert.equal(report.freshnessVerified, false);
    assert.equal(report.counts.counted, counted);
    assert.equal(report.counts.cast, casts);
    assert.deepEqual(report.results, body.results);
    assert.equal(report.checks['chk.board.append_only'], 'not_run');
    assert.equal(report.checks['chk.board.witness'], 'not_run');
    assert.deepEqual({ snapshot, body }, before);
  });
}

test('a matching body without supplied board evidence remains INCOMPLETE by default', async () => {
  const { snapshot, body } = fixture();
  const report = await verifyTallyDraft(snapshot, body);
  assert.equal(report.verdict, 'INCOMPLETE');
  assert.equal(report.bodyMatchesSnapshot, true);
  assert.equal(report.checks['chk.tally.decrypt'], 'pass');
  assert.equal(report.checks['chk.board.append_only'], 'not_run');
  assert.equal(report.checks['chk.board.witness'], 'not_run');
});

test('the draft entry point refuses prior publication and leaves ordinary election verdicts unchanged', async () => {
  const { published, snapshot, body } = fixture();
  failed(await verifyTallyDraft(published, body, { allowNoLog: true }), 'E_STRUCTURE');
  const pending = await verifyElection(snapshot, { allowNoLog: true });
  assert.equal(pending.verdict, 'INCOMPLETE');
  assert.equal(pending.checks['chk.tally.decrypt'], 'not_run');
  assert.equal((await verifyElection(published, { allowNoLog: true })).verdict, 'PASS');
});

test('the manifest pin is checked before an unsigned body can match', async () => {
  const { snapshot, body } = fixture();
  snapshot.manifest_hash = '00'.repeat(32);
  const report = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
  failed(report, 'E_MANIFEST_HASH');
  assert.equal(report.checks['chk.manifest.hash'], 'fail');
  assert.equal(report.checks['chk.tally.aggregate'], 'not_run');
});

test('a missing election-close marker leaves the draft unchecked and incomplete', async () => {
  const { snapshot, body } = fixture();
  snapshot.log = snapshot.log.filter(({ entry }) => (entry as { body?: { name?: string } }).body?.name !== 'election-close');
  const report = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
  assert.equal(report.verdict, 'INCOMPLETE');
  assert.equal(report.bodyMatchesSnapshot, false);
  assert.equal(report.checks['chk.time.window'], 'not_run');
  assert.equal(report.checks['chk.tally.aggregate'], 'not_run');
  assert.ok(report.findings.some((finding) => finding.code === 'E_MARKERS' && finding.cls === 'I'));
});

test('an absent or non-tally candidate never falls back to the published verifier path', async () => {
  const { snapshot } = fixture();
  for (const body of [undefined, null, {}, { type: 'marker' }]) {
    const report = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
    failed(report, 'E_SCHEMA');
    assert.equal(report.checks['chk.encoding.canonical'], 'fail');
  }
});

const disagreements: [string, (body: TallyBody) => void, string][] = [
  ['counted count', (body) => { body.n_counted++; }, 'E_COUNTED_ROOT'],
  ['counted root', (body) => { body.counted_root = '00'.repeat(32); }, 'E_COUNTED_ROOT'],
  ['election context', (body) => { body.ctx = '00'.repeat(32); }, 'E_CTX'],
  ['option total', (body) => { body.contests[0]!.options[0]!.T++; }, 'E_DLOG_RANGE'],
  ['rule outcome', (body) => { body.results[0]!.outcome = { kind: body.results[0]!.outcome.kind === 'passed' ? 'rejected' : 'passed' }; }, 'E_RESULT'],
];
for (const [name, change, code] of disagreements) {
  test(`a draft with a different ${name} fails the existing recomputation`, async () => {
    const { snapshot, body } = fixture();
    change(body);
    failed(await verifyTallyDraft(snapshot, body, { allowNoLog: true }), code);
  });
}

test('a different disclosed spoil result fails the draft while preserving the existing ALARM finding class', async () => {
  const { snapshot, body } = fixture();
  const selections = body.spoiled[0]!.selections;
  selections['budget'] = selections['budget']!.includes('yes') ? ['no'] : ['yes'];
  const report = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
  failed(report, 'E_SPOIL_MISMATCH');
  assert.equal(report.checks['chk.benaloh.spoiled'], 'fail');
  assert.ok(report.findings.some((finding) => finding.code === 'E_SPOIL_MISMATCH' && finding.cls === 'ALARM'));
});

test('decrypters names all valid available sets, rather than only the canonical threshold subset', async () => {
  const { snapshot, body } = fixture('small-approval-20v');
  assert.deepEqual(body.decrypters, [1, 2, 4, 5]);
  body.decrypters = [1, 2, 4];
  failed(await verifyTallyDraft(snapshot, body, { allowNoLog: true }), 'E_DEC_PROOF');
});

test('another complete threshold subset yields the same totals and results', async () => {
  const { snapshot, body } = fixture('small-approval-20v');
  const expectedResults = structuredClone(body.results);
  body.decrypters = [2, 4, 5];
  for (const contest of body.contests) for (const option of contest.options) option.shares = option.shares.filter(({ j }) => j !== 1);
  const report = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
  assert.equal(report.verdict, 'MATCH', JSON.stringify(report.findings));
  assert.equal(report.bodyMatchesSnapshot, true);
  assert.deepEqual(report.results, expectedResults);
});

test('fewer than the required complete share sets leaves no checked draft', async () => {
  const { snapshot, body } = fixture();
  body.decrypters = [1];
  for (const contest of body.contests) for (const option of contest.options) option.shares = option.shares.filter(({ j }) => j === 1);
  failed(await verifyTallyDraft(snapshot, body, { allowNoLog: true }), 'E_TALLY_INSUFFICIENT');
});

test('cooperative draft checking preserves the complete report and cancellation never returns a verdict', async () => {
  const { snapshot, body } = fixture();
  const expected = await verifyTallyDraft(snapshot, body, { allowNoLog: true });
  const stages: string[] = [];
  const actual = await verifyTallyDraft(snapshot, body, { allowNoLog: true, cooperative: { checkpoint: (progress) => { stages.push(progress.stage); } } });
  assert.deepEqual(actual, expected);
  assert.ok(stages.includes('tally'));
  assert.equal(stages.at(-1), 'complete');
  const controller = new AbortController();
  await assert.rejects(verifyTallyDraft(snapshot, body, { allowNoLog: true, cooperative: {
    signal: controller.signal, checkpoint: ({ stage }) => { if (stage === 'tally') controller.abort(); },
  } }), { name: 'AbortError' });
});
