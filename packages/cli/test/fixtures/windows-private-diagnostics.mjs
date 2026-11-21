// SPDX-License-Identifier: AGPL-3.0-or-later
// Benign process-result simulation only: no native Windows execution is claimed.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';

const privateMarker = 'PRIVATE-FIXTURE-MARKER';
const cases = [
  { name: 'explicit timeout', result: { code: 'ETIMEDOUT', status: null, stdout: '' }, diagnostic: 'TIMEOUT' },
  { name: 'executable launch failure', result: { code: 'ENOENT', status: null, stdout: '' }, diagnostic: 'STARTUP' },
  { name: 'nonzero exit with an invalid frame', result: { status: 1, stdout: privateMarker }, diagnostic: 'PROCESS' },
  { name: 'completed call with an invalid frame', stdout: privateMarker, diagnostic: 'RESPONSE' },
  { name: 'nonzero exit with an ok frame still refuses', result: { status: 1, stdout: '{"ok":true}' }, diagnostic: 'PROCESS' },
  { name: 'native ACL refusal survives a process error', result: { code: 'ETIMEDOUT', stdout: '{"ok":false,"code":"ACL"}' }, code: 'ACL' },
  { name: 'native unavailability is not relabeled as timeout', result: { code: 'ETIMEDOUT', stdout: '{"ok":false,"code":"UNAVAILABLE"}' } },
  { name: 'unknown native code is sanitized', result: { status: 1, stdout: JSON.stringify({ ok: false, code: privateMarker }) } },
];

for (const [index, fixture] of cases.entries()) {
  test(fixture.name, async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const oldRoot = process.env.SystemRoot;
    let attempts = 0;
    const replacement = mock.module('node:child_process', {
      namedExports: {
        spawn: () => { throw new Error('unexpected asynchronous path'); },
        execFileSync: (_file, _args, options) => {
          attempts++;
          assert.equal(options.timeout, 15_000);
          assert.equal(options.cwd, 'C:\\Windows');
          assert.equal(JSON.parse(options.input).op, 'write');
          if (fixture.result) throw Object.assign(new Error(privateMarker), fixture.result, {
            path: privateMarker, spawnargs: [privateMarker], stderr: privateMarker,
          });
          return fixture.stdout;
        },
      },
    });
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    process.env.SystemRoot = 'C:\\Windows';
    try {
      const source = new URL('../../src/windows-private-files.ts', import.meta.url);
      source.search = `diagnostic=${index}`;
      const bridge = await import(source.href);
      assert.throws(() => bridge.writeWindowsPrivateFileSync('C:\\fixture\\private-file', Buffer.from(privateMarker)), error => {
        assert.equal(error.name, 'WindowsPrivateFileError');
        assert.equal(error.code, fixture.code ?? 'UNAVAILABLE');
        assert.equal(error.diagnostic, fixture.diagnostic);
        assert.equal(error.cause, undefined);
        assert.doesNotMatch(inspect(error), new RegExp(privateMarker));
        assert.doesNotMatch(JSON.stringify(error), new RegExp(privateMarker));
        if (fixture.diagnostic) assert.match(error.message, new RegExp(fixture.diagnostic));
        return true;
      });
      assert.equal(attempts, 1, 'a possibly issued operation must never be retried');
    } finally {
      Object.defineProperty(process, 'platform', platform);
      if (oldRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = oldRoot;
      replacement.restore();
    }
  });
}
