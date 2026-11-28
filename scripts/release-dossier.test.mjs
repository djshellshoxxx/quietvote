// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-27-REQ-007, QV-27-REQ-009
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildDossier, loadGateDefinitions, readEvidenceMap, renderMarkdown } from './release-dossier.mjs';
import { InputError, readRegular } from './release-input.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(ROOT, 'scripts/release-dossier.mjs');
const ABC_HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'qv-dossier-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'evidence'));
  writeFileSync(join(root, 'evidence/audit.txt'), 'abc');
  return root;
}
function run(args, cwd = ROOT) { return spawnSync(process.execPath, [TOOL, ...args], { cwd, encoding: 'utf8', timeout: 10_000 }); }
function code(expected) { return error => error instanceof InputError && error.code === expected; }
function gate(result, id) { return result.gates.find(item => item.id === id); }

test('definitions reproduce the actual fourteen assurance gates and seven release items', () => {
  const defined = loadGateDefinitions();
  const assurance = readFileSync(join(ROOT, 'docs/11-testing-assurance.md'), 'utf8');
  const governance = readFileSync(join(ROOT, 'docs/27-project-governance-release.md'), 'utf8');
  const rows = [...assurance.matchAll(/^\| (G\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
  assert.equal(rows.length, 14);
  assert.deepEqual(defined.gates.slice(0, 14).map(({ id, name, criteria, applies_to }) => ({ id, name, criteria, applies_to })),
    rows.map(row => ({ id: row[1], name: row[2].trim(), criteria: row[3].trim(), applies_to: row[4].trim() })));
  const releaseSection = governance.slice(governance.indexOf('### 7.3 '), governance.indexOf('### 7.4 '));
  const items = [...releaseSection.matchAll(/^(\d+)\. (.+)$/gm)];
  assert.equal(items.length, 7);
  assert.deepEqual(defined.gates.slice(14).map(({ id, criteria }) => ({ id, criteria })), items.map(item => ({ id: `QV27-${item[1]}`, criteria: item[2] })));
  for (const source of defined.sources) {
    const bytes = readFileSync(join(ROOT, source.path));
    assert.equal(source.bytes, bytes.length);
    assert.equal(source.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});

test('empty checklist never infers evidence, an attained level, approval, or checked boxes', () => {
  const result = buildDossier();
  assert.equal(result.version, 'Unreleased'); assert.equal(result.requested_channel, 'nightly');
  assert.equal(result.gates.length, 21);
  assert.equal(result.assurance_level_attained, null); assert.equal(result.release_approval, 'not assessed');
  assert.ok(result.gates.every(item => item.status === 'not evidenced' && item.evaluation === 'not assessed' && item.evidence === null));
  const markdown = renderMarkdown(result);
  assert.equal((markdown.match(/^- \[ \]/gm) ?? []).length, 21);
  assert.doesNotMatch(markdown, /\[x\]/i);
});

test('nonempty evidence records exact byte hashes without interpreting a failing report as a pass', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'evidence/failure.json'), '{"passed":false,"approved":false}\n');
  const result = buildDossier({ root, evidence: { G1: 'evidence/failure.json', G9: 'evidence/audit.txt' } });
  assert.deepEqual(gate(result, 'G9').evidence, { path: 'evidence/audit.txt', bytes: 3, sha256: ABC_HASH });
  for (const id of ['G1', 'G9']) {
    assert.equal(gate(result, id).status, 'artifact present — not evaluated');
    assert.equal(gate(result, id).evaluation, 'not assessed');
    assert.equal(gate(result, id).reason, null);
  }
  assert.equal(result.assurance_level_attained, null);
  assert.equal(result.release_approval, 'not assessed');
});

test('missing, empty, directory and oversized inputs remain not evidenced', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'evidence/empty.txt'), '');
  writeFileSync(join(root, 'evidence/large.bin'), 'x'); truncateSync(join(root, 'evidence/large.bin'), 8 * 1024 * 1024 + 1);
  const evidence = { G1: 'evidence/missing.txt', G2: 'evidence/empty.txt', G3: 'evidence', G4: 'evidence/large.bin' };
  const result = buildDossier({ root, evidence });
  assert.deepEqual(result.gates.slice(0, 4).map(item => [item.status, item.reason]),
    [['not evidenced', 'missing'], ['not evidenced', 'empty'], ['not evidenced', 'not_regular'], ['not evidenced', 'too_large']]);
  assert.ok(result.gates.slice(0, 4).every(item => item.evidence.sha256 === undefined));
});

test('symlinks and symlink parents cannot supply evidence, including a stable audit artifact', t => {
  const root = fixture(t);
  symlinkSync(join(root, 'evidence'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const path of ['linked', 'linked/audit.txt']) {
    const result = buildDossier({ root, evidence: { G9: path } });
    assert.equal(gate(result, 'G9').status, 'not evidenced'); assert.equal(gate(result, 'G9').reason, 'symlink');
    assert.throws(() => buildDossier({ root, version: '1.0.0', channel: 'stable', auditGate: path }), code('audit_artifact_required'));
  }
  if (process.platform !== 'win32') {
    symlinkSync(join(root, 'evidence/audit.txt'), join(root, 'file-link.txt'));
    assert.equal(gate(buildDossier({ root, evidence: { G9: 'file-link.txt' } }), 'G9').reason, 'symlink');
  }
});

test('evidence paths are bounded portable names without traversal or terminal controls', t => {
  const root = fixture(t);
  for (const path of ['../audit.txt', '/audit.txt', 'C:/audit.txt', './evidence/audit.txt', 'evidence//audit.txt',
    'evidence/../audit.txt', 'evidence\\audit.txt', 'evidence/audit.txt\n', 'evidence/audit\0.txt', 'a'.repeat(241)]) {
    assert.throws(() => buildDossier({ root, evidence: { G9: path } }), code('invalid_evidence_path'), JSON.stringify(path));
  }
});

test('artifact order and timestamps cannot change deterministic output', t => {
  const root = fixture(t);
  const first = buildDossier({ root, evidence: { G2: 'evidence/audit.txt', G1: 'evidence/audit.txt' } });
  const second = buildDossier({ root, evidence: { G1: 'evidence/audit.txt', G2: 'evidence/audit.txt' } });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(renderMarkdown(first), renderMarkdown(second));
  assert.equal(JSON.stringify(first).includes(root), false, 'absolute machine paths are not report fields');
  assert.equal('generated_at' in first, false);
});

test('Unreleased and pre-1.0 cannot use stable, LTS or security even with a real audit file', t => {
  const root = fixture(t);
  for (const version of ['Unreleased', '0.0.0', '0.9.0-rc.1', '0.9.9+build']) {
    for (const channel of ['stable', 'lts', 'security']) assert.throws(
      () => buildDossier({ root, version, channel, auditGate: 'evidence/audit.txt' }), code('pre1_channel_refused'));
    for (const channel of ['nightly', 'rc']) assert.equal(buildDossier({ root, version, channel }).requested_channel, channel);
  }
});

test('stable requires an actual G9 artifact but its presence grants no gate result or assurance', t => {
  const root = fixture(t);
  for (const auditGate of [undefined, 'evidence/missing.txt', 'evidence']) {
    assert.throws(() => buildDossier({ root, version: '1.0.0', channel: 'stable', auditGate }), code('audit_artifact_required'));
  }
  const result = buildDossier({ root, version: '1.0.0', channel: 'stable', auditGate: 'evidence/audit.txt' });
  assert.equal(result.requested_channel, 'stable'); assert.equal(result.assurance_level_attained, null);
  assert.equal(result.banner, 'Experimental — not for binding elections');
  assert.equal(gate(result, 'G9').evaluation, 'not assessed');
  assert.ok(result.gates.every(item => item.evaluation === 'not assessed'));
  assert.throws(() => buildDossier({ root, version: '1.0.0-rc.1', channel: 'stable', auditGate: 'evidence/audit.txt' }), code('stable_prerelease_refused'));
});

test('malformed versions, unknown gates, non-path evidence and conflicting audit mappings refuse', t => {
  const root = fixture(t);
  for (const version of ['', 'v1.0.0', '01.0.0', '1.0', '1.0.0-01', '1.0.0-', '1.0.0+']) assert.throws(() => buildDossier({ version }), code('invalid_version'));
  assert.throws(() => buildDossier({ channel: 'production' }), code('invalid_channel'));
  assert.throws(() => buildDossier({ evidence: { G15: 'evidence/audit.txt' } }), code('invalid_evidence_map'));
  assert.throws(() => buildDossier({ root, evidence: { G1: true } }), code('invalid_evidence_path'));
  assert.throws(() => buildDossier({ root, evidence: { G9: 'evidence/audit.txt' }, auditGate: 'evidence/other.txt' }), code('conflicting_audit_path'));
});

test('evidence map syntax and size are bounded; it cannot supply approval fields', t => {
  const root = fixture(t), path = join(root, 'map.json');
  for (const input of ['{', 'null', '[]', '{"format":"wrong","gates":{}}', '{"format":"qv-release-evidence/v1","gates":[],"approved":true}']) {
    writeFileSync(path, input); assert.throws(() => readEvidenceMap(path), code('invalid_evidence_map'));
  }
  writeFileSync(path, JSON.stringify({ format: 'qv-release-evidence/v1', gates: { G9: 'evidence/audit.txt' } }));
  assert.deepEqual(readEvidenceMap(path), { G9: 'evidence/audit.txt' });
  truncateSync(path, 64 * 1024 + 1); assert.throws(() => readEvidenceMap(path), code('too_large'));
  writeFileSync(path, Buffer.from([0xff, 0xfe])); assert.throws(() => readEvidenceMap(path), code('invalid_utf8'));
});

test('definition drift fails explicitly rather than silently dropping a required gate', t => {
  const root = fixture(t); mkdirSync(join(root, 'docs'));
  for (const source of loadGateDefinitions().sources) writeFileSync(join(root, source.path), readFileSync(join(ROOT, source.path)));
  const path = join(root, 'docs/11-testing-assurance.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace(/^\| G9 \|.*\n/m, ''));
  assert.throws(() => loadGateDefinitions(root), code('gate_source_changed'));
  writeFileSync(path, readFileSync(join(ROOT, 'docs/11-testing-assurance.md')));
  const governance = join(root, 'docs/27-project-governance-release.md');
  writeFileSync(governance, readFileSync(governance, 'utf8').replace('2. Required CI checks', '   An additional item continuation must not disappear.\n2. Required CI checks'));
  assert.throws(() => loadGateDefinitions(root), code('gate_source_changed'));
});

test('actual CLI is deterministic and refuses stable without producing a partial dossier', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'map.json'), JSON.stringify({ format: 'qv-release-evidence/v1', gates: { G1: 'evidence/audit.txt' } }));
  const args = ['--root', root, '--evidence', 'map.json', '--version', '0.9.0-rc.1', '--channel', 'rc', '--json'];
  const first = run(args), second = run(args);
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr); assert.equal(first.stdout, second.stdout);
  assert.equal(gate(JSON.parse(first.stdout), 'G1').evidence.sha256, ABC_HASH);
  for (const args of [['--version', '1.0.0', '--channel', 'stable'], ['--channel', 'stable', '--audit-gate', 'evidence/audit.txt']]) {
    const refused = run(['--root', root, ...args]);
    assert.equal(refused.status, 1); assert.equal(refused.stdout, '');
  }
  for (const args of [['--unknown'], ['--channel'], ['--json', '--json']]) assert.equal(run(args).status, 2);
  assert.equal(run(['--help']).status, 0);
});

test('bounded file reader reports only a fixed input code for invalid regular-file input', t => {
  const root = fixture(t);
  assert.throws(() => readRegular(join(root, 'evidence')), code('not_regular'));
  assert.throws(() => readRegular(join(root, 'missing')), code('missing'));
  assert.deepEqual(readRegular(join(root, 'evidence/audit.txt')), { bytes: 3, sha256: ABC_HASH });
});
