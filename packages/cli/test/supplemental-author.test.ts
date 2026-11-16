import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { supplementalAuthorFixture } from '../../web/test/helpers/supplemental-author.ts';
import { verifyWithSelfTest } from '../../verifier/src/main.ts';

const bins = [[fileURLToPath(new URL('../bin/qv.ts', import.meta.url)), 'verify'], [fileURLToPath(new URL('../../verifier/src/bin.ts', import.meta.url))]];
const run = (bin: string[], args: string[]) => spawnSync(process.execPath, [...bin, ...args], { encoding: 'utf8', timeout: 90000 });
test('both executable verifier CLIs accept only explicit independently obtained supplemental public keys', async () => {
  const f = await supplementalAuthorFixture();
  assert.equal((await verifyWithSelfTest(f.text, { extraAuthorKeys: [f.key] })).verdict, 'PASS', 'wrapper forwards pins while running canary self-test');
  const dir = mkdtempSync(join(tmpdir(), 'qv-author-'));
  try {
    const path = join(dir, 'bundle.json'); writeFileSync(path, f.text);
    for (const bin of bins) {
      for (const [args, code] of [
        [[], 1], [['--extra-author-key', 'ab'.repeat(32)], 1], [['--extra-author-key', f.key], 0],
        [['--extra-author-key', f.key, '--extra-author-key', f.key], 0],
      ] as [string[], number][]) {
        const r = run(bin, [path, '--json', '--skip-selftest', ...args]);
        assert.equal(r.status, code, r.stderr + r.stdout);
      }
      for (const args of [[], ['--json'], [''], ['abc'], ['AB'.repeat(32)], ['a'.repeat(63)], ['a'.repeat(65)], ['g'.repeat(64)], [f.key + '\n']]) {
        const r = run(bin, ['/missing', '--extra-author-key', ...args]);
        assert.equal(r.status, 2, r.stderr + r.stdout);
      }
      const tooMany = Array.from({ length: 33 }, () => ['--extra-author-key', f.key]).flat();
      assert.equal(run(bin, ['/missing', ...tooMany]).status, 2);
      assert.equal(run(bin, ['--extra-author-key=' + f.key, path, '--skip-selftest']).status, 0);
    }
    const zero = await supplementalAuthorFixture(0); writeFileSync(path, zero.text);
    for (const bin of bins) {
      assert.equal(run(bin, [path, '--skip-selftest', '--extra-author-key', zero.key]).status, 3);
      assert.equal(run(bin, [path, '--skip-selftest', '--extra-author-key', zero.key, '--content-only']).status, 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
