// SPDX-License-Identifier: AGPL-3.0-or-later
// Transport lifecycle only; actual Windows ACL/handle qualification is separate.
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
function childFor(onMessage, automaticClose = true) {
  const child = new EventEmitter();
  child.stdout = new Pipe(); child.stderr = new Pipe(); child.stdin = new Pipe();
  child.ref = () => {}; child.unref = () => {};
  child.kill = () => { if (automaticClose) setImmediate(() => child.emit('close', 0, null)); return true; };
  child.stdin.write = text => {
    queueMicrotask(() => onMessage(JSON.parse(text), value => {
      if (!child.stdout.destroyed) child.stdout.emit('data', JSON.stringify(value) + '\n');
    }));
    return true;
  };
  return child;
}
async function withBridge(name, replacements, run) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const oldRoot = process.env.SystemRoot;
  const replacement = mock.module('node:child_process', { namedExports: {
    spawn: () => { throw new Error('unexpected asynchronous path'); },
    execFileSync: () => { throw new Error('unexpected synchronous path'); },
    ...replacements,
  } });
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  process.env.SystemRoot = 'C:\\Windows';
  try {
    const source = new URL('../../src/windows-private-files.ts', import.meta.url);
    source.search = `lifecycle=${name}`;
    await run(await import(source.href));
  } finally {
    Object.defineProperty(process, 'platform', platform);
    if (oldRoot === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = oldRoot;
    replacement.restore();
  }
}

test('an exclusive-write refusal cannot poison a different queued operation or replay a write', async () => {
  const written = new Map(), attempts = [];
  let children = 0;
  await withBridge('isolated-refusal', {
    spawn() {
      children++;
      return childFor((request, send) => {
        if (request.op === 'service' || request.op === 'close') { send({ ok: true }); return; }
        if (request.op === 'write') {
          attempts.push(request.data);
          if (written.has(request.path)) send({ ok: false, code: 'EEXIST' });
          else { written.set(request.path, request.data); send({ ok: true }); }
          return;
        }
        assert.equal(request.op, 'read');
        if (written.has(request.path)) send({ ok: true, data: written.get(request.path) });
        else send({ ok: false, code: 'ENOENT' });
      });
    },
  }, async bridge => {
    const path = 'C:\\fixture\\backup';
    const original = Buffer.from('first sealed backup'), later = Buffer.from('different sealed backup');
    const results = await Promise.allSettled([
      bridge.writeWindowsPrivateFile(path, original),
      bridge.writeWindowsPrivateFile(path, later),
      bridge.readWindowsPrivateFile(path),
    ]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[1].reason.code, 'EEXIST');
    assert.equal(results[2].status, 'fulfilled', 'a refusal retires only the failed operation and its helper');
    assert.deepEqual(results[2].value, original);
    assert.deepEqual(attempts, [original.toString('base64'), later.toString('base64')], 'a terminal helper never causes automatic write replay');
    assert.equal(children, 2, 'the unissued read acquires a fresh helper after refusal');
    await assert.rejects(bridge.readWindowsPrivateFile('C:\\fixture\\missing'), { code: 'ENOENT' });
  });
});

test('reservation close waits for the helper process and its pipes to close', async () => {
  const child = childFor((request, send) => {
    assert.ok(['reserve', 'close'].includes(request.op));
    send({ ok: true });
  }, false);
  await withBridge('wait-close', { spawn: () => child }, async bridge => {
    const held = await bridge.reserveWindowsPrivateFile('C:\\fixture\\held', 1024);
    let settled = false;
    const closing = held.close().then(() => { settled = true; });
    try {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(settled, false, 'an acknowledgement is not process completion');
    } finally { child.emit('close', 0, null); await closing; }
    assert.equal(settled, true);
    assert.ok([child.stdin, child.stdout, child.stderr].every(pipe => pipe.destroyed));
  });
});

test('native helpers use a stable system cwd while request paths remain absolute', async () => {
  const child = childFor((request, send) => {
    if (request.op === 'reserve') assert.equal(request.path, 'C:\\fixture\\held');
    send({ ok: true });
  });
  await withBridge('neutral-cwd', {
    spawn(_file, _args, options) { assert.equal(options.cwd, 'C:\\Windows'); return child; },
    execFileSync(_file, _args, options) {
      assert.equal(options.cwd, 'C:\\Windows');
      assert.equal(JSON.parse(options.input).path, 'C:\\fixture\\written');
      return '{"ok":true}\n';
    },
  }, async bridge => {
    bridge.writeWindowsPrivateFileSync('C:\\fixture\\written', Buffer.from('sealed'));
    const held = await bridge.reserveWindowsPrivateFile('C:\\fixture\\held', 1);
    await held.close();
  });
});
