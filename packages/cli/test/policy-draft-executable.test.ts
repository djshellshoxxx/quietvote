import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const bin = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));

test('actual policy-draft CLI expands, validates and preserves source conflicts without overwriting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-policy-'));
  const run = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: 'utf8', timeout: 30000 });
  try {
    const output = join(dir, 'foundation.json');
    let r = run('policy-draft', 'template', 'foundation', '--out', output, '--json');
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).scope, 'unsigned-policy-draft');
    const bytes = readFileSync(output);
    r = run('policy-draft', 'validate', output, '--json');
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).valid, true);
    r = run('policy-draft', 'template', 'association', '--out', output, '--json');
    assert.equal(r.status, 4); assert.deepEqual(readFileSync(output), bytes);
    const collective = join(dir, 'collective.json');
    r = run('policy-draft', 'template', 'collective', '--out', collective, '--json');
    assert.equal(r.status, 1, r.stderr);
    assert(JSON.parse(r.stdout).errors.some((e: { path: string }) => e.path === '/suggested_election/voting_hours'));
    assert.equal(JSON.parse(readFileSync(collective, 'utf8')).suggested_election.voting_hours, 48);
    r = run('policy-draft', 'validate', collective);
    assert.equal(r.status, 1); assert.match(r.stdout, /no signed rules or election authority verified/);
    assert.equal(run('policy-draft', 'template', 'unknown', '--out', join(dir, 'missing.json')).status, 2);
    assert.equal(run('policy-draft', 'template', 'foundation', '--out', output, '--out', output).status, 2);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{"format":"one","format":"two"}');
    r = run('policy-draft', 'validate', bad, '--json'); assert.equal(r.status, 4); assert.equal(r.stdout, '');
    writeFileSync(bad, '{"format":null}'); assert.equal(run('policy-draft', 'validate', bad).status, 4);
    writeFileSync(bad, Buffer.alloc(128 * 1024 + 1, 32)); assert.equal(run('policy-draft', 'validate', bad).status, 4);
    assert.equal(run('policy-draft', 'validate', dir).status, 4);
    if (process.platform !== 'win32') {
      const link = join(dir, 'link.json'); symlinkSync(output, link);
      assert.equal(run('policy-draft', 'validate', link).status, 4);
    }
    assert.equal(run('policy-draft', 'validate', join(dir, 'absent')).status, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
