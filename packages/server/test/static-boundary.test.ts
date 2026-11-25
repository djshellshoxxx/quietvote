import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { StaticAssets } from '../src/static.ts';

function fixture(t: { after: (fn: () => void) => void }): { root: string; outside: string } {
  const parent = mkdtempSync(join(tmpdir(), 'qv-static-boundary-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'public');
  const outside = join(parent, 'private');
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(join(root, 'index.html'), '<title>QuietVote</title>');
  writeFileSync(join(outside, 'secret.txt'), 'must never be served');
  return { root, outside };
}

test('BT-11: regular nested assets retain hashes, content types and SPA fallback', (t) => {
  const { root } = fixture(t);
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app.js'), 'export const answer = 42;');
  const assets = new StaticAssets(root);
  assert.deepEqual(assets.manifest().map((a) => a.path), ['assets/app.js', 'index.html']);
  const reply = assets.serve('/assets/app.js', 'GET')!;
  assert.equal(reply.contentType, 'text/javascript; charset=utf-8');
  assert.equal(new TextDecoder().decode(reply.bytes), 'export const answer = 42;');
  assert.match(reply.etag!, /^"[a-f0-9]{32}"$/);
  assert.equal(assets.serve('/elections/one', 'GET')?.status, 200);
  assert.equal(assets.serve('/api/elections', 'GET'), undefined);
});

for (const kind of ['file', 'directory', 'nested', 'internal', 'root'] as const) {
  test(`BT-11: reject ${kind} symlinks at startup`, { skip: process.platform === 'win32' }, (t) => {
    const { root, outside } = fixture(t);
    let configuredRoot = root;
    if (kind === 'root') {
      configuredRoot = join(root, '..', 'linked-root');
      symlinkSync(root, configuredRoot, 'dir');
    } else if (kind === 'directory') {
      symlinkSync(outside, join(root, 'leaked'), 'dir');
    } else if (kind === 'nested') {
      mkdirSync(join(root, 'assets'));
      symlinkSync(join(outside, 'secret.txt'), join(root, 'assets', 'leaked.txt'), 'file');
    } else {
      symlinkSync(kind === 'internal' ? join(root, 'index.html') : join(outside, 'secret.txt'), join(root, 'leaked.txt'), 'file');
    }
    assert.throws(() => new StaticAssets(configuredRoot), /static .*symlink/);
  });
}

test('BT-11: reject special files without attempting to read them', { skip: process.platform === 'win32' }, (t) => {
  const { root } = fixture(t);
  const result = spawnSync('mkfifo', [join(root, 'pipe')]);
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.throws(() => new StaticAssets(root), /static .*regular file/);
});
