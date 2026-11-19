// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent reviewer regression for documented child-process event ordering.
// This simulates Node transport events only; it is not native Windows qualification.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

class Pipe extends EventEmitter {
  destroyed = false;
  setEncoding() { return this; }
  ref() {}
  unref() {}
  end() {}
  destroy() { this.destroyed = true; }
}

for (const code of ['ENOENT', 'EEXIST', 'CLEANUP']) {
  test(`native refusal ${code} survives exit before the final stdout frame`, async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const oldRoot = process.env.SystemRoot;
    const child = new EventEmitter();
    child.stdout = new Pipe();
    child.stderr = new Pipe();
    child.stdin = new Pipe();
    child.ref = () => {};
    child.unref = () => {};
    child.kill = () => true;
    child.stdin.write = text => {
      const request = JSON.parse(text);
      if (request.op === 'service') {
        queueMicrotask(() => child.stdout.emit('data', '{"ok":true}\n'));
      } else {
        assert.equal(request.op, 'read');
        // Node explicitly permits exit while stdio is still open. The trailing
        // native error frame then arrives before close, which follows drainage.
        queueMicrotask(() => {
          child.emit('exit', 1, null);
          queueMicrotask(() => {
            if (!child.stdout.destroyed) child.stdout.emit('data', JSON.stringify({ ok: false, code }) + '\n');
            child.emit('close', 1, null);
          });
        });
      }
      return true;
    };
    const replacement = mock.module('node:child_process', {
      namedExports: {
        spawn: () => child,
        execFileSync: () => { throw new Error('unexpected synchronous path'); },
      },
    });
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    process.env.SystemRoot = 'C:\\Windows';
    try {
      const source = new URL('../../src/windows-private-files.ts', import.meta.url);
      source.search = `review=${code}`;
      const bridge = await import(source.href);
      await assert.rejects(bridge.readWindowsPrivateFile('C:\\fixture\\private-file', 1024), { code });
      await new Promise(resolve => setImmediate(resolve));
      assert.ok([child.stdin, child.stdout, child.stderr].every(pipe => pipe.destroyed), 'terminal helper cleanup disposes every pipe');
    } finally {
      Object.defineProperty(process, 'platform', platform);
      if (oldRoot === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = oldRoot;
      replacement.restore();
    }
  });
}
