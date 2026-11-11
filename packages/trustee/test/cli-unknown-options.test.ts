import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trusteeMain } from '../src/index.ts';
import { mkDeps, PASS } from './helpers/harness.ts';

const newIo = (): { out: string[]; err: string[]; io: Parameters<typeof trusteeMain>[1] } => {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s), promptSecret: async () => PASS } };
};

test('CLI: an unknown option is a usage error (exit 2), is not silently ignored, and does not run the command', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qvcli-unknown-')));
  try {
    const { out, err, io } = newIo();
    const bundle = join(dir, 'x.qvtb');
    // keygen with a typo'd option used to succeed and create the bundle
    assert.equal(await trusteeMain(['keygen', '--bundle', bundle, '--bogus-option', 'on'], io, mkDeps('unknown-opt'), {}), 2);
    assert.equal(err.length, 1);
    assert.match(err[0]!, /unknown option --bogus-option/);
    assert.deepEqual(out, []);
    assert.equal(existsSync(bundle), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: an unknown option never echoes its value (passphrase, key or share material)', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qvcli-unknown-secret-')));
  try {
    const { err, io } = newIo();
    const bundle = join(dir, 'y.qvtb');
    // a passphrase given as the value of a misspelled option; the value must not reach the error text
    assert.equal(await trusteeMain(['keygen', '--bundle', bundle, '--passphrase-fil', PASS], io, mkDeps('unknown-secret'), {}), 2);
    assert.equal(err.length, 1);
    assert.match(err[0]!, /unknown option --passphrase-fil/);
    assert.equal(err[0]!.includes(PASS), false);
    assert.equal(existsSync(bundle), false);
    // a flag name that is not a plain option name is withheld rather than echoed
    const { err: err2, io: io2 } = newIo();
    assert.equal(await trusteeMain(['status', '--Secret/Value=1'], io2, mkDeps('unknown-secret-2'), {}), 2);
    assert.match(err2[0]!, /unknown option \(name withheld\)/);
    assert.equal(err2[0]!.includes('Secret/Value'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: every option a command reads is still accepted by the parser', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qvcli-known-')));
  try {
    const known = [
      'bundle', 'manifest', 'manifest-hash', 'ceremony-id', 'log', 'out', 'compared-with', 'words', 'claimed', 'election',
      'override-unwitnessed', 'codes', 'reason', 'to', 'backup-passphrase-file', 'passphrase-file', 'ledger',
      'override-no-ledger', 'from', 'confirm', 'audit-close', 'severity', 'mode', 'in', 'witness-key', 'json', 'generate-passphrase',
    ];
    for (const name of known) {
      const { err, io } = newIo();
      // the command itself may fail for other reasons (missing bundle); only the parser's verdict is checked
      await trusteeMain(['status', '--bundle', join(dir, 'missing.qvtb'), `--${name}`, 'v'], io, mkDeps(`known-${name}`), {});
      assert.equal(err.some((line) => /unknown option/.test(line)), false, `--${name} must be a known option`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
