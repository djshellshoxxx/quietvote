#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-27-REQ-007, QV-27-REQ-009
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidencePath, EXPERIMENTAL_BANNER, InputError, readRegular, REVIEW_QUALIFICATION } from './release-input.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANNELS = new Set(['nightly', 'rc', 'stable', 'lts', 'security']);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SOURCES = ['docs/11-testing-assurance.md', 'docs/27-project-governance-release.md'];

function section(text, start, end) {
  const lines = text.split(/\r?\n/), first = lines.findIndex(line => line.startsWith(start));
  const last = lines.findIndex((line, index) => index > first && line.startsWith(end));
  if (first < 0 || last < 0) throw new InputError('gate_source_changed');
  return lines.slice(first + 1, last);
}

export function loadGateDefinitions(root = ROOT) {
  const inputs = SOURCES.map(path => ({ path, ...readRegular(join(root, path), { text: true }) }));
  const gates = section(inputs[0].text, '### 11.1 ', '### 11.2 ').filter(line => /^\| G\d+ \|/.test(line)).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 4 || cells.some(cell => cell === '')) throw new InputError('gate_source_changed');
    return { id: cells[0], name: cells[1], criteria: cells[2], applies_to: cells[3], source: `${SOURCES[0]} §11.1` };
  });
  const releaseLines = section(inputs[1].text, '### 7.3 ', '### 7.4 ').filter(line => line.trim() !== '');
  if (releaseLines.some(line => !/^\d+\. .+$/.test(line))) throw new InputError('gate_source_changed');
  const items = releaseLines.map(line => {
    const match = /^(\d+)\. (.+)$/.exec(line);
    return { id: `QV27-${match[1]}`, name: `Release item ${match[1]}`, criteria: match[2], applies_to: 'rc and stable', source: `${SOURCES[1]} §7.3` };
  });
  if (gates.length !== 14 || gates.some((gate, index) => gate.id !== `G${index + 1}`) ||
      items.length !== 7 || items.some((gate, index) => gate.id !== `QV27-${index + 1}`)) throw new InputError('gate_source_changed');
  return { gates: [...gates, ...items], sources: inputs.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })) };
}

export function readEvidenceMap(path) {
  let input;
  try { input = JSON.parse(readRegular(path, { text: true, maxBytes: 64 * 1024 }).text); }
  catch (error) { if (error instanceof InputError) throw error; throw new InputError('invalid_evidence_map'); }
  if (input === null || typeof input !== 'object' || Array.isArray(input) || input.format !== 'qv-release-evidence/v1' ||
      Object.keys(input).sort().join(',') !== 'format,gates' || input.gates === null || typeof input.gates !== 'object' || Array.isArray(input.gates)) {
    throw new InputError('invalid_evidence_map');
  }
  return input.gates;
}

export function buildDossier({ version = 'Unreleased', channel = 'nightly', root = process.cwd(), evidence = {}, auditGate } = {}) {
  if (typeof version !== 'string' || version.length > 128 || (version !== 'Unreleased' && !SEMVER.test(version))) throw new InputError('invalid_version');
  if (!CHANNELS.has(channel)) throw new InputError('invalid_channel');
  const pre1 = version === 'Unreleased' || SEMVER.exec(version)[1] === '0';
  if (pre1 && channel !== 'nightly' && channel !== 'rc') throw new InputError('pre1_channel_refused');
  if (channel === 'stable' && SEMVER.exec(version)[4] !== undefined) throw new InputError('stable_prerelease_refused');
  const definition = loadGateDefinitions(), ids = new Set(definition.gates.map(gate => gate.id));
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence) || Object.keys(evidence).some(id => !ids.has(id))) throw new InputError('invalid_evidence_map');
  const mapped = { ...evidence };
  if (auditGate !== undefined) {
    if (mapped.G9 !== undefined && mapped.G9 !== auditGate) throw new InputError('conflicting_audit_path');
    mapped.G9 = auditGate;
  }
  const gates = definition.gates.map(gate => {
    const path = mapped[gate.id];
    if (path === undefined) return { ...gate, status: 'not evidenced', evaluation: 'not assessed', evidence: null, reason: 'not supplied' };
    let artifact;
    try { artifact = readRegular(evidencePath(root, path), { maxBytes: 8 * 1024 * 1024 }); }
    catch (error) {
      if (!(error instanceof InputError) || error.code === 'invalid_evidence_path') throw error;
      return { ...gate, status: 'not evidenced', evaluation: 'not assessed', evidence: { path }, reason: error.code };
    }
    return { ...gate, status: 'artifact present — not evaluated', evaluation: 'not assessed', evidence: { path, ...artifact }, reason: null };
  });
  if (channel === 'stable' && gates.find(gate => gate.id === 'G9').status === 'not evidenced') throw new InputError('audit_artifact_required');
  return {
    format: 'qv-release-dossier/v1', version, requested_channel: channel,
    banner: EXPERIMENTAL_BANNER, review_qualification: REVIEW_QUALIFICATION,
    assurance_level_attained: null, release_approval: 'not assessed',
    scope: 'Local artifact presence and SHA-256 only. Contents, relevance, review independence, findings, signatures, gate results and sign-off are not evaluated.',
    sources: definition.sources, gates,
  };
}

export function renderMarkdown(dossier) {
  const lines = ['# QuietVote release evidence checklist', '', dossier.banner, '', dossier.review_qualification, '',
    `Version: \`${dossier.version}\` · Requested channel: \`${dossier.requested_channel}\``, '',
    'No assurance level or release approval is established by this checklist.', '', dossier.scope, ''];
  for (const gate of dossier.gates) {
    lines.push(`- [ ] **${gate.id} — ${gate.name}** (${gate.applies_to}): ${gate.criteria}`,
      `  Status: **${gate.status}**. Gate evaluation: ${gate.evaluation}.`);
    if (gate.evidence?.sha256) lines.push(`  Artifact: \`${gate.evidence.path}\`; ${gate.evidence.bytes} bytes; SHA-256 \`${gate.evidence.sha256}\`.`);
    else lines.push(`  Evidence: ${gate.evidence ? `\`${gate.evidence.path}\` — ` : ''}${gate.reason}.`);
    lines.push(`  Source: ${gate.source}.`, '');
  }
  lines.push('## Definition sources', '', ...dossier.sources.map(source => `- \`${source.path}\`: SHA-256 \`${source.sha256}\`.`), '');
  return lines.join('\n');
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = {}, seen = new Set(); let evidenceMap, json = false;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--help' && argv.length === 1) {
        process.stdout.write('Usage: node scripts/release-dossier.mjs [--version Unreleased|SEMVER] [--channel nightly|rc|stable|lts|security] [--root DIR] [--evidence MAP.json] [--audit-gate RELATIVE_FILE] [--json]\nReports local artifact presence only; does not approve, sign or publish a release.\n'); return 0;
      }
      if (seen.has(arg)) throw new InputError('invalid_arguments'); seen.add(arg);
      if (arg === '--json') { json = true; continue; }
      if (!['--version', '--channel', '--root', '--evidence', '--audit-gate'].includes(arg) || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new InputError('invalid_arguments');
      const value = argv[++i];
      if (arg === '--evidence') evidenceMap = value;
      else options[{ '--version': 'version', '--channel': 'channel', '--root': 'root', '--audit-gate': 'auditGate' }[arg]] = value;
    }
    if (evidenceMap !== undefined) options.evidence = readEvidenceMap(evidencePath(options.root ?? process.cwd(), evidenceMap));
    const dossier = buildDossier(options);
    process.stdout.write(json ? `${JSON.stringify(dossier, null, 2)}\n` : renderMarkdown(dossier)); return 0;
  } catch (error) {
    const code = error instanceof InputError ? error.code : 'input_unavailable';
    process.stderr.write(`release-dossier: ${code}\n`);
    return ['pre1_channel_refused', 'stable_prerelease_refused', 'audit_artifact_required'].includes(code) ? 1 : 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
