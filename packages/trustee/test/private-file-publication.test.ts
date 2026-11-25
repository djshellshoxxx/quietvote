// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent async publication probe; public modes remain supported.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { PathLike } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite } from '../src/fsutil.ts';

test('trustee public publication keeps exclusive creation and replacement on every platform', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'qvt-public-publication-'));
  const output = join(dir, 'requested');
  try {
    await atomicWrite(output, Buffer.from('first public bytes'), 0o644, { exclusive: true });
    await assert.rejects(atomicWrite(output, Buffer.from('collision'), 0o644, { exclusive: true }), { code: 'EEXIST' });
    assert.equal(await fs.readFile(output, 'utf8'), 'first public bytes');
    await atomicWrite(output, Buffer.from('replacement public bytes'), 0o644);
    assert.equal(await fs.readFile(output, 'utf8'), 'replacement public bytes');
    assert.equal((await fs.stat(output)).nlink, 1);
    assert.deepEqual(await fs.readdir(dir), ['requested']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

for (const mode of [0o600, 0o644]) {
  test(`trustee ordinary publication preserves requested mode ${mode.toString(8)}`, { skip: process.platform === 'win32' }, async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'qvt-review-positive-'));
    const output = join(dir, 'requested');
    const oldUmask = process.umask(0o077);
    try {
      await atomicWrite(output, Buffer.from('first'), mode, { exclusive: true });
      assert.equal((await fs.stat(output)).mode & 0o777, mode);
      await atomicWrite(output, Buffer.from('second'), mode);
      assert.equal((await fs.stat(output)).mode & 0o777, mode);
      assert.equal(await fs.readFile(output, 'utf8'), 'second');
      assert.deepEqual(await fs.readdir(dir), ['requested']);
    } finally {
      process.umask(oldUmask);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
  for (const exclusive of [true, false]) {
    test(`trustee publication refuses substituted source without chmod of replacement, mode=${mode.toString(8)}, exclusive=${exclusive}`, { skip: process.platform === 'win32' }, async t => {
      const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'qvt-review-publish-')));
      const output = join(dir, 'requested');
      const retained = join(dir, 'retained-original');
      const operation = exclusive ? 'link' : 'rename';
      const originalRename = fs.rename;
      const originalOperation = fs[operation];
      let substituted = false;
      if (!exclusive) await fs.writeFile(output, 'prior output', { mode });
      const patch = t.mock.method(fs, operation, async (source: PathLike, target: PathLike) => {
        if (!substituted && target === output) {
          substituted = true;
          await originalRename(source, retained);
          await fs.writeFile(source, 'independent replacement', { mode: 0o640 });
          await fs.chmod(source, 0o640);
        }
        return originalOperation(source, target);
      });
      syncBuiltinESMExports();
      try {
        let failure: unknown;
        try { await atomicWrite(output, Buffer.from('ORIGINAL_REVIEW_BYTES'), mode, { exclusive }); }
        catch (error) { failure = error; }
        assert.equal(substituted, true);
        const observation = {
          returnedSuccess: failure === undefined,
          outputIsReplacement: await fs.readFile(output, 'utf8') === 'independent replacement',
          replacementMode: ((await fs.stat(output)).mode & 0o777).toString(8),
          originalRetained: await fs.readFile(retained, 'utf8') === 'ORIGINAL_REVIEW_BYTES',
        };
        assert.ok(failure, `trustee publication must refuse a substituted source: ${JSON.stringify(observation)}`);
        assert.equal(observation.outputIsReplacement, true);
        assert.equal(observation.replacementMode, '640', 'never chmod an unvalidated replacement through its pathname');
        assert.equal(observation.originalRetained, true);
      } finally {
        patch.mock.restore();
        syncBuiltinESMExports();
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  }
}
