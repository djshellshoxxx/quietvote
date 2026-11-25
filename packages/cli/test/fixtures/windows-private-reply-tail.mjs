// SPDX-License-Identifier: AGPL-3.0-or-later
// These transport unit tests exercise both actual package-local bridges.
// They do not execute PowerShell or qualify native Windows behavior.
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

const cases = [
  { name: 'empty tail', chunks: ['{"ok":true}\n'], accepted: true },
  { name: 'ordinary CRLF', chunks: ['{"ok":true}\r\n'], accepted: true },
  { name: 'JSON whitespace tail', chunks: ['{"ok":true}\n \t\r\n'], accepted: true },
  { name: 'fragmented CRLF frame', chunks: ['{"ok"', ':true}\r', '\n \t\r\n'], accepted: true },
  { name: 'non-JSON no-break space', chunks: ['{"ok":true}\n\u00a0'] },
  { name: 'non-JSON line separator', chunks: ['{"ok":true}\n\u2028'] },
  { name: 'non-JSON byte-order mark', chunks: ['{"ok":true}\n\ufeff'] },
  { name: 'extra frame in the same chunk', chunks: ['{"ok":true}\n{"ok":true}\n'] },
  { name: 'unsolicited separate chunk', chunks: ['{"ok":true}\n', '\u00a0'] },
  { name: 'explicit native refusal', chunks: ['{"ok":false,"code":"ACL"}\n'], code: 'ACL' },
];

for (const packageName of ['cli', 'trustee']) {
  for (const [index, scenario] of cases.entries()) {
    test(`${packageName}: ${scenario.name}`, async () => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform');
      const oldRoot = process.env.SystemRoot;
      const requests = [];
      let spawns = 0;
      let kills = 0;
      const child = new EventEmitter();
      child.stdout = new Pipe();
      child.stderr = new Pipe();
      child.stdin = new Pipe();
      child.ref = () => {};
      child.unref = () => {};
      child.kill = () => {
        kills++;
        queueMicrotask(() => child.emit('close', 0, null));
        return true;
      };
      child.stdin.write = text => {
        const request = JSON.parse(text);
        requests.push(request.op);
        if (request.op === 'service') {
          queueMicrotask(() => {
            for (const chunk of scenario.chunks) child.stdout.emit('data', chunk);
          });
        } else {
          assert.equal(request.op, 'read');
          queueMicrotask(() => child.stdout.emit('data', '{"ok":true,"data":"AQI="}\r\n'));
        }
        return true;
      };
      const replacement = mock.module('node:child_process', {
        namedExports: {
          spawn: () => { spawns++; return child; },
          execFileSync: () => { throw new Error('unexpected synchronous path'); },
        },
      });
      Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
      process.env.SystemRoot = 'C:\\Windows';
      try {
        const source = new URL(`../../../${packageName}/src/windows-private-files.ts`, import.meta.url);
        source.search = `reply-tail=${index}`;
        const bridge = await import(source.href);
        const reading = bridge.readWindowsPrivateFile('C:\\fixture\\private-file', 1024);
        if (scenario.accepted) {
          const bytes = await reading;
          assert.ok(bytes instanceof Uint8Array);
          assert.deepEqual([...bytes], [1, 2]);
          assert.deepEqual(requests, ['service', 'read']);
        } else {
          await assert.rejects(reading, error => {
            assert.ok(error instanceof bridge.WindowsPrivateFileError);
            assert.equal(error.code, scenario.code ?? 'UNAVAILABLE');
            assert.equal(error.message, 'native Windows private-file protection refused the operation');
            assert.equal(error.cause, undefined);
            assert.equal(error.diagnostic, undefined);
            assert.equal(error.operation, undefined);
            return true;
          });
          assert.deepEqual(requests, ['service'], 'a refused handshake must not dispatch the pending request');
        }
        assert.equal(spawns, 1, 'one attempt only');
      } finally {
        child.emit('close', 0, null);
        await new Promise(resolve => setImmediate(resolve));
        Object.defineProperty(process, 'platform', platform);
        if (oldRoot === undefined) delete process.env.SystemRoot;
        else process.env.SystemRoot = oldRoot;
        replacement.restore();
      }
      assert.equal(kills, 1, 'terminal failure/close stops the helper exactly once');
      assert.ok([child.stdin, child.stdout, child.stderr].every(pipe => pipe.destroyed), 'terminal cleanup disposes every pipe');
    });
  }
}
