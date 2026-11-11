// Self-tests for scripts/trace.mjs (QV-ADR-027 N-23c, report-only traceability).
// Run: node --test scripts/trace.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModel, normalizePriority, parseRequirements, parseTags, renderMarkdown } from './trace.mjs';

const SPEC = [
  '| ID | Requirement | Pri | Acceptance criteria | Ver |',
  '|---|---|---|---|---|',
  '| QV-13-REQ-001 | Reject `|roll| < 3` input. | M | Unit test. | T |',
  '| QV-13-REQ-002 | Something optional. | Should (Phase 2) | Review. | R |',
  '| QV-13-REQ-003 | Part A; **Deferred (QV-ADR-027 X-1):** part B. | Must before M4 | Test. | T |',
  '',
  '```',
  '| QV-13-REQ-099 | example row inside a fence | Must | x | T |',
  '```',
  '',
  '| ID | Requirement | Acceptance criteria |',
  '|---|---|---|',
  '| QV-13-REQ-004 | No priority column here. | Inspection. |',
  '| QV-07-REQ-001 | Wrong prefix for this file. | Test. |',
].join('\n');

test('requirement rows: pipes in code spans, header-based priority, fences skipped', () => {
  const rows = parseRequirements(SPEC, 'docs/13-example.md');
  assert.deepEqual(rows.map((r) => r.id), ['QV-13-REQ-001', 'QV-13-REQ-002', 'QV-13-REQ-003', 'QV-13-REQ-004', 'QV-07-REQ-001']);
  assert.deepEqual(rows.map((r) => r.priority), ['Must', 'Should', 'Must', 'Unknown', 'Unknown']);
  assert.equal(rows[0].verification, 'T');
  assert.deepEqual(rows.map((r) => r.deferredPart), [false, false, true, false, false]);
  assert.deepEqual(rows.map((r) => r.prefixMismatch), [false, false, false, false, true]);
});

test('priority normalisation keeps conditional Musts with the Musts and rejects unknown words', () => {
  assert.equal(normalizePriority('M'), 'Must');
  assert.equal(normalizePriority('S→M for flow-critical'), 'Must');
  assert.equal(normalizePriority('Could (F3)'), 'Could');
  assert.equal(normalizePriority('qualified'), 'Unknown(qualified)');
  assert.equal(normalizePriority(''), 'Unknown');
});

test('tags: @verifies and @covers, several IDs per line, nothing without a tag keyword', () => {
  const src = [
    "// @verifies QV-13-REQ-001, QV-13-REQ-003",
    "// @covers QV-13-REQ-002",
    "test('mentions QV-13-REQ-004 in a name only', () => {});",
    "// @verifies QV-13-REQ-777 (unknown id)",
  ].join('\n');
  const tags = parseTags(src, 'packages/x/test/a.test.ts');
  assert.deepEqual(tags.map((t) => `${t.id}@${t.line}`), ['QV-13-REQ-001@1', 'QV-13-REQ-003@1', 'QV-13-REQ-002@2', 'QV-13-REQ-777@4']);
});

test('model: unknown tag IDs and duplicate definitions are reported, coverage counted per spec', () => {
  const rows = [
    ...parseRequirements(SPEC, 'docs/13-example.md'),
    ...parseRequirements('| ID | Requirement | Priority |\n|---|---|---|\n| QV-13-REQ-001 | again | Must |', 'docs/13-other.md'),
  ];
  const tags = parseTags('// @verifies QV-13-REQ-001\n\n\n\n\n\n\n\n\n// @verifies QV-13-REQ-001\n// @verifies QV-13-REQ-777', 'packages/x/test/a.test.ts');
  const model = buildModel(rows, tags);
  assert.deepEqual(model.unknownTags.map((t) => t.id), ['QV-13-REQ-777']);
  assert.deepEqual(model.duplicates.map((r) => r.id), ['QV-13-REQ-001']);
  const req = model.requirements.find((r) => r.id === 'QV-13-REQ-001');
  assert.deepEqual(req.tests, ['packages/x/test/a.test.ts:1', 'packages/x/test/a.test.ts:10']);
  const qv13 = model.specs.find((s) => s.spec === 'QV-13');
  assert.equal(qv13.must, 2);
  assert.equal(qv13.mustTagged, 1);
});

test('rendering is deterministic, carries the report-only and unaudited wording, and omits requirement text', () => {
  const model = buildModel(parseRequirements(SPEC, 'docs/13-example.md'), parseTags('// @verifies QV-13-REQ-001', 'packages/x/test/a.test.ts'));
  const a = renderMarkdown(model);
  const b = renderMarkdown(buildModel(parseRequirements(SPEC, 'docs/13-example.md'), parseTags('// @verifies QV-13-REQ-001', 'packages/x/test/a.test.ts')));
  assert.equal(a, b);
  assert.match(a, /report-only per QV-ADR-027 N-23c/);
  assert.match(a, /unaudited and not for real elections/);
  assert.doesNotMatch(a, /Something optional|Wrong prefix/);
  assert.match(a, /QV-13-REQ-003 \(Must\)/); // deferred-part section
});
