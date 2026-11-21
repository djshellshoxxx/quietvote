// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent namespace-substitution probe for the new POSIX CLI writer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { type PathLike } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writePrivateFileSync } from '../src/private-files.ts';

for (const replace of [false, true]) {
  test(`POSIX private publication detects substituted temporary source, replace=${replace}`, { skip: process.platform === 'win32' }, t => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'qv-review-publish-')));
    const output = join(dir, 'requested');
    const originalPrivate = join(dir, 'original-private');
    const operation = replace ? 'renameSync' : 'linkSync';
    const originalRename = fs.renameSync;
    const originalOperation = fs[operation];
    let substituted = false;
    if (replace) fs.writeFileSync(output, 'prior output', { mode: 0o600 });
    const patch = t.mock.method(fs, operation, (source: PathLike, target: PathLike) => {
      if (!substituted && target === output) {
        substituted = true;
        originalRename(source, originalPrivate);
        fs.writeFileSync(source, 'unvalidated replacement', { mode: 0o644 });
      }
      return originalOperation(source, target);
    });
    syncBuiltinESMExports();
    try {
      let failure: unknown;
      try { writePrivateFileSync(output, 'PRIVATE_REVIEW_CANARY', replace); }
      catch (error) { failure = error; }
      assert.equal(substituted, true);
      const observation = {
        returnedSuccess: failure === undefined,
        outputIsReplacement: fs.readFileSync(output, 'utf8') === 'unvalidated replacement',
        outputOwnerOnly: (fs.statSync(output).mode & 0o077) === 0,
        originalPrivateRetained: fs.readFileSync(originalPrivate, 'utf8') === 'PRIVATE_REVIEW_CANARY',
      };
      assert.ok(failure, `publication must refuse a replaced source: ${JSON.stringify(observation)}`);
      assert.equal(observation.outputIsReplacement, true, 'the independent replacement is neither rewritten nor removed');
      assert.equal(observation.originalPrivateRetained, true, 'the held private bytes remain recoverable');
    } finally {
      patch.mock.restore();
      syncBuiltinESMExports();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
