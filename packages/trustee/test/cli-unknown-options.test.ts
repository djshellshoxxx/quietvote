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

test('CLI: documented options are accepted on the commands that consume them', async () => {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'qvcli-known-')));
  try {
    const workflows: [string, string[]][] = [
      ['keygen', ['--generate-passphrase']],
      ['join', ['--manifest', 'm.json', '--manifest-hash', '00'.repeat(32), '--ceremony-id', 'c1']],
      ['import', ['--log', 'log.qvl']],
      ...['commit', 'reveal', 'shares', 'verify', 'drill'].map((cmd): [string, string[]] => [cmd, ['--out', 'packet.qvp']]),
      ['finalize', []],
      ['confirm', ['--compared-with', '2,3', '--words', 'one two three four five six', '--out', 'packet.qvp']],
      ['tally-release', ['--election', 'e.json', '--claimed', 'claims.json', '--override-unwitnessed', 'phrase', '--out', 'packet.qvp']],
      ['spoil-release', ['--election', 'e.json', '--codes', '00'.repeat(32), '--override-unwitnessed', 'phrase', '--out', 'packet.qvp']],
      ['status', ['--bundle', join(dir, 'missing.qvtb'), '--passphrase-file', join(dir, 'missing.pass')]],
      ['abort', ['--reason', 'operator_abort']],
      ['restart', []],
      ['backup', ['--to', 'backup.qvtb', '--backup-passphrase-file', 'backup.pass']],
      ['restore', ['--from', 'backup.qvtb', '--backup-passphrase-file', 'backup.pass', '--ledger', 'ledger', '--override-no-ledger', 'phrase']],
      ['destroy', ['--audit-close', 'close.json', '--confirm', 'Election title']],
      ['report-compromise', ['--severity', 'suspected', '--out', 'packet.qvp']],
      ['export-transcript', ['--out', 'transcript.json', '--mode', 'airgap-dkg']],
      ['cosign-transcript', ['--in', 'transcript.json', '--out', 'signed.json']],
      ['verify-transcript', ['--in', join(dir, 'missing.json'), '--witness-key', `w=${'11'.repeat(32)}`]],
    ];
    for (const [cmd, args] of workflows) {
      const { err, io } = newIo();
      // Missing inputs may fail; supported options must reach the command's own validation.
      await trusteeMain([cmd, ...args, '--json'], io, mkDeps(`known-${cmd}`), {});
      assert.equal(err.some((line) => /unknown option|not supported|duplicate option/.test(line)), false, `${cmd} options must be accepted`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
