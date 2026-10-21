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
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*uses:\s*([^\s#]+)/);
    if (!match || match[1].startsWith('./')) return;

    const reference = match[1].split('@')[1];
    if (!reference || !/^[a-f0-9]{40}$/.test(reference)) {
      failures.push(`${file}:${index + 1}: action must be pinned to a full 40-character commit SHA`);
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified SHA pins for ${files.length} workflow file(s).`);
}
