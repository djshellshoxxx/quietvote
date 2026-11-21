import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DATA_LOCK_NAME, lockDataDirectory } from '../src/data-lock.ts';

function checkCanonicalLock(input: string, actual: string): void {
  const expected = realpathSync.native(actual);
  const lock = lockDataDirectory(input);
  try {
    assert.equal(lock.dataDir, expected, 'the owned root must use the native filesystem spelling');
    const stored = join(lock.dataDir, 'elections', 'ab', `${'ab'.repeat(16)}.sqlite`);
    mkdirSync(dirname(stored), { recursive: true });
    writeFileSync(stored, 'synthetic path fixture');
    assert.equal(realpathSync.native(stored), stored, 'canonical roots must remain canonical when storage paths are appended');
    for (const alias of [input, actual, expected]) {
      assert.throws(() => lockDataDirectory(alias), /data directory is locked/, 'aliases cannot acquire independent ownership');
    }
  } finally {
    lock.release();
  }
  assert.equal(existsSync(join(actual, DATA_LOCK_NAME)), false, 'release removes the actual owned lock');
  const next = lockDataDirectory(actual);
  try { assert.equal(next.dataDir, expected); }
  finally { next.release(); }
}

test('locked roots and nested storage use one native canonical spelling', () => {
  const parent = mkdtempSync(join(tmpdir(), 'qv-native-root-'));
  const actual = join(parent, 'MiXeD Data');
  mkdirSync(actual);
  try { checkCanonicalLock(actual, actual); }
  finally { rmSync(parent, { recursive: true, force: true }); }
});

test('directory links share native root spelling and exclusive ownership', () => {
  const parent = mkdtempSync(join(tmpdir(), 'qv-native-alias-'));
  const actual = join(parent, 'MiXeD Data');
  const alias = join(parent, 'alias');
  mkdirSync(actual);
  // Windows junctions do not require the symlink privilege; POSIX uses an ordinary directory symlink.
  symlinkSync(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  try { checkCanonicalLock(alias, actual); }
  finally { rmSync(parent, { recursive: true, force: true }); }
});

test('Windows case aliases use native spelling without weakening lock exclusivity', { skip: process.platform !== 'win32' }, (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'qv-native-case-'));
  const actual = join(parent, 'MiXeD Data');
  const alias = join(parent, 'mixed data');
  mkdirSync(actual);
  try {
    if (!existsSync(alias)) {
      t.skip('the fixture filesystem is case-sensitive');
      return;
    }
    assert.equal(realpathSync.native(alias), realpathSync.native(actual), 'both spellings identify the same directory');
    t.diagnostic(JSON.stringify({ input: alias, javascript: realpathSync(alias), native: realpathSync.native(alias) }));
    checkCanonicalLock(alias, actual);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
