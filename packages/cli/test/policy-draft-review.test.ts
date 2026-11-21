import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupPolicyTemplate } from '@quietvote/protocol';

const bin = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));

test('review: real draft diagnostics neutralize terminal controls but preserve exact JSON pointers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-policy-review-'));
  try {
    const path = join(dir, 'draft.json');
    const field = 'unsafe\x1b[2J\nFAKE-PASS\u202e';
    const draft = { ...groupPolicyTemplate('foundation'), [field]: true };
    writeFileSync(path, JSON.stringify(draft));
    const plain = spawnSync(process.execPath, [bin, 'policy-draft', 'validate', path], { encoding: 'utf8', timeout: 30000 });
    assert.equal(plain.status, 1, plain.stderr);
    assert.equal(plain.stdout.includes('\x1b'), false);
    assert.equal(plain.stdout.includes('\u202e'), false);
    assert.equal(plain.stdout.includes('\nFAKE-PASS'), false);
    assert.match(plain.stdout, /unsafe\\u\{1b\}\[2J\\u\{a\}FAKE-PASS\\u\{202e\}/);
    const json = spawnSync(process.execPath, [bin, 'policy-draft', 'validate', path, '--json'], { encoding: 'utf8', timeout: 30000 });
    assert.equal(json.status, 1, json.stderr);
    assert.equal(JSON.parse(json.stdout).errors[0].path, `/${field}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('review: failed output creation preserves existing targets and strict decoding rejects malformed bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-policy-io-review-'));
  const run = (...args: string[]) => spawnSync(process.execPath, [bin, 'policy-draft', ...args], { encoding: 'utf8', timeout: 30000 });
  try {
    const directory = join(dir, 'existing-directory'); mkdirSync(directory);
    const marker = join(directory, 'marker'); writeFileSync(marker, 'original');
    assert.equal(run('template', 'foundation', '--out', directory).status, 4);
    assert.equal(readFileSync(marker, 'utf8'), 'original');
    if (process.platform !== 'win32') {
      const link = join(dir, 'target-link'); symlinkSync(marker, link);
      assert.equal(run('template', 'foundation', '--out', link).status, 4);
      assert.equal(readFileSync(marker, 'utf8'), 'original');
    }
    const malformed = join(dir, 'malformed.json');
    writeFileSync(malformed, Buffer.from([0x7b, 0x22, 0xc0, 0xaf, 0x22, 0x3a, 0x31, 0x7d]));
    const result = run('validate', malformed, '--json');
    assert.equal(result.status, 4);
    assert.equal(result.stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
