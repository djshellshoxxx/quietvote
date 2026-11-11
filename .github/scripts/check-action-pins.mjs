// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const workflowRoot = '.github/workflows';
const files = [];

function collectYamlFiles(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      collectYamlFiles(path);
    } else if (/\.ya?ml$/i.test(name)) {
      files.push(path);
    }
  }
}

collectYamlFiles(workflowRoot);

const failures = [];
if (files.length === 0) {
  failures.push(`${workflowRoot}: no workflow files found`);
}

// This is a deliberately narrow pin check, not a YAML parser. Action references
// must be single-line block mapping values (plain or simply quoted). Require
// block collections and ordinary keys so flow syntax, tags and aliases cannot
// conceal a uses key. Empty collections cannot contain actions and are allowed.
function actionReference(value) {
  const quoted = value.match(/^(['"])([^'"\\]*)\1(?:\s+#.*)?\s*$/);
  if (quoted) return quoted[2];
  if (/^['"]/.test(value)) return undefined;
  return value.match(/^(\S+?)(?:\s+#.*)?\s*$/)?.[1];
}

function unsupportedStructure(value) {
  return /^[&*!?]/.test(value)
    || (/^[\[\]{},]/.test(value) && !/^(?:\{\s*\}|\[\s*\])\s*(?:#.*)?$/.test(value));
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let blockIndent;
  let hasContent = false;
  lines.forEach((line, index) => {
    if (/^\s*(?:#.*)?$/.test(line)) return;
    hasContent ||= !/^\s*(?:---|\.\.\.)\s*(?:#.*)?$/.test(line);
    const indent = line.match(/^\s*/)[0].length;
    if (blockIndent !== undefined && indent > blockIndent) return;
    blockIndent = undefined;

    const match = line.match(/^\s*(?:-\s*)?(?:uses|'uses'|"uses")\s*:\s*(.*)$/);
    if (!match) {
      const structural = line.replace(/^\s*(?:-\s+)?/, '');
      const property = line.match(/^\s*(?:-\s*)?(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:'"][^:]*):\s*(.*)$/);
      if (unsupportedStructure(structural)
        || (property && unsupportedStructure(property[1]))
        || /^(?:---|\.\.\.)(?:\s+(?!#)\S)/.test(structural)
        || /^\s*(?:-\s*)?"[^"\n]*\\[^"\n]*"\s*:/.test(line)) {
        failures.push(`${file}:${index + 1}: use block collections and ordinary keys for action pin checks`);
      }
      const block = line.match(/^(\s*(?:-\s*)?)[^:]+:\s*[|>](?:[1-9][+-]?|[+-][1-9]?)?\s*(?:#.*)?$/);
      if (block) blockIndent = block[1].length;
      return;
    }

    const reference = actionReference(match[1]);
    if (reference && /^\.\/[^\s'"\\#@{}\[\],]+$/.test(reference)) return;
    if (!reference || !/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*@[a-f0-9]{40}$/.test(reference)) {
      failures.push(`${file}:${index + 1}: action must be pinned to a full 40-character commit SHA`);
    }
  });
  if (!hasContent) failures.push(`${file}: workflow file is empty`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified SHA pins for ${files.length} workflow file(s).`);
}
