// SPDX-License-Identifier: AGPL-3.0-or-later
// Benign simulated transport deadlines only; no native Windows execution.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';

const marker = 'PRIVATE-OPERATION-FIXTURE';
const path = `C:\\fixture\\${marker}`;
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

class Pipe extends EventEmitter {
  destroyed = false;
  setEncoding() { return this; }
  ref() {}
  unref() {}
  end() {}
  destroy() { this.destroyed = true; }
}

function childFor(pendingOperation) {
  const child = new EventEmitter();
  const operations = [];
  child.stdout = new Pipe(); child.stderr = new Pipe(); child.stdin = new Pipe();
  child.ref = () => {}; child.unref = () => {};
  let kills = 0;
  child.kill = () => {
    kills++;
    queueMicrotask(() => child.emit('close', 0, null));
    return true;
  };
  child.stdin.write = text => {
    const request = JSON.parse(text);
    operations.push(request.op);
    assert.ok(['service', 'write'].includes(request.op));
    if (request.op === 'write') {
      assert.equal(request.path, path);
      assert.equal(request.data, Buffer.from(marker).toString('base64'));
    }
    if (request.op !== pendingOperation) {
      queueMicrotask(() => child.stdout.emit('data', '{"ok":true}\n'));
    }
    return true;
  };
  return { child, operations, kills: () => kills };
}

async function withBridge(name, child, run) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const oldRoot = process.env.SystemRoot;
  let spawns = 0;
  const replacement = mock.module('node:child_process', { namedExports: {
    spawn: (_file, _args, options) => {
      spawns++;
      assert.equal(options.cwd, 'C:\\Windows');
      return child;
    },
    execFileSync: () => { throw new Error('unexpected synchronous path'); },
  } });
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  process.env.SystemRoot = 'C:\\Windows';
  try {
    const source = new URL('../../src/windows-private-files.ts', import.meta.url);
    source.search = `operation-diagnostic=${name}`;
    await run(await import(source.href), () => spawns);
  } finally {
    Object.defineProperty(process, 'platform', platform);
    if (oldRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = oldRoot;
    replacement.restore();
  }
}

for (const operation of ['service', 'write']) {
  test(`the unchanged deadline identifies a pending ${operation} acknowledgement`, async t => {
    const fixture = childFor(operation);
    await withBridge(operation, fixture.child, async (bridge, spawns) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      let settled = false;
      const pending = bridge.writeWindowsPrivateFile(path, Buffer.from(marker));
      const checked = assert.rejects(pending, error => {
        settled = true;
        assert.equal(error.name, 'WindowsPrivateFileError');
        assert.equal(error.code, 'UNAVAILABLE');
        assert.equal(error.diagnostic, 'TIMEOUT');
        assert.equal(error.operation, operation);
        assert.equal(error.cause, undefined);
        assert.doesNotMatch(inspect(error), new RegExp(marker));
        assert.doesNotMatch(JSON.stringify(error), new RegExp(marker));
        return true;
      });
      await nextTurn();
      assert.deepEqual(fixture.operations, operation === 'service' ? ['service'] : ['service', 'write']);
      t.mock.timers.tick(14_999);
      await nextTurn();
      assert.equal(settled, false, 'the operation keeps its existing 15-second deadline');
      t.mock.timers.tick(1);
      await checked;
      await nextTurn();
      assert.equal(spawns(), 1, 'an issued operation must not acquire a retry helper');
      assert.deepEqual(fixture.operations, operation === 'service' ? ['service'] : ['service', 'write']);
      assert.equal(fixture.kills(), 1, 'cleanup preserves the first timeout and terminates once');
      assert.ok([fixture.child.stdin, fixture.child.stdout, fixture.child.stderr].every(pipe => pipe.destroyed));
      t.mock.timers.reset();
    });
  });
}

test('ordinary service and write acknowledgements still complete once', async () => {
  const fixture = childFor(undefined);
  await withBridge('success', fixture.child, async (bridge, spawns) => {
    assert.equal(await bridge.writeWindowsPrivateFile(path, Buffer.from(marker)), undefined);
    assert.deepEqual(fixture.operations, ['service', 'write']);
    assert.equal(spawns(), 1);
    assert.equal(fixture.kills(), 0);
    // End the simulated idle process after observing the successful result.
    fixture.child.emit('close', 0, null);
    await nextTurn();
  });
});
