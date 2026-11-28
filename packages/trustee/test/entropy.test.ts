// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-17-REQ-012
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytesToHex, jcs, utf8, type Rng } from '@quietvote/crypto';
import { main } from '../src/cli.ts';
import { parseDice } from '../src/entropy.ts';
import { TrusteeError } from '../src/errors.ts';
import { LOG_FORMAT, Trustee } from '../src/trustee.ts';
import { Ceremony, mkDeps, PASS } from './helpers/harness.ts';
import { writePrivateFixture } from './helpers/private-file.ts';

function capture() {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s), promptSecret: async () => PASS } };
}

test('dice parser accepts six-sided digits and ASCII whitespace without retaining caller bytes', () => {
  const raw = utf8(' 1 2\t3\r\n4\n5 6 '), original = raw.slice();
  const parsed = parseDice(raw);
  assert.deepEqual(parsed, utf8('123456'));
  assert.deepEqual(raw, original);
  raw.fill(0);
  assert.deepEqual(parsed, utf8('123456'));
  parsed.fill(0);
  for (const invalid of ['', ' \t\r\n', '0123', '1237', '12x3', '1\u00a02', '1\u001b[31m', '1'.repeat(8193)]) {
    assert.throws(() => parseDice(utf8(invalid)), (e: unknown) => e instanceof TrusteeError && e.code === 'BAD_DICE');
  }
  assert.equal(parseDice(utf8('1'.repeat(8192))).length, 8192);
});

test('keygen dice input supplements required randomness and never appears in public output or sealed bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-dice-keygen-'));
  const dice = '123456'.repeat(50);
  try {
    const diceFile = join(dir, 'dice.txt'); writePrivateFixture(diceFile, dice);
    const keys: string[] = [];
    for (const variant of ['none', 'first', 'second']) {
      if (variant === 'second') writePrivateFixture(diceFile, '654321'.repeat(50));
      const c = capture(), bundle = join(dir, `${variant}.qvtb`), deps = mkDeps('same-keygen-source');
      const args = ['keygen', '--bundle', bundle, '--json', ...(variant === 'none' ? [] : ['--dice-file', diceFile])];
      assert.equal(await main(args, c.io, deps), 0);
      const report = JSON.parse(c.out[0]!) as { sign_pk: string };
      keys.push(report.sign_pk);
      const opened = await Trustee.open(bundle, PASS, deps);
      assert.equal(opened.signPk, report.sign_pk);
      assert.equal(opened.state, 'KEYS_READY');
      assert.equal([...c.out, ...c.err].join('').includes(dice), false);
      assert.equal(readFileSync(bundle).includes(Buffer.from(dice)), false);
    }
    assert.equal(new Set(keys).size, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('zero or unavailable platform randomness fails before creating a bundle despite valid dice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-dice-rng-failure-'));
  try {
    const diceFile = join(dir, 'dice.txt'); writePrivateFixture(diceFile, '123456'.repeat(50));
    const rngs: Rng[] = [{ bytes: n => new Uint8Array(n) }, { bytes() { throw new Error('PRIVATE-RNG-FAILURE-CANARY'); } }];
    for (const [index, rng] of rngs.entries()) {
      const c = capture(), bundle = join(dir, `failed-${index}.qvtb`);
      assert.equal(await main(['keygen', '--bundle', bundle, '--dice-file', diceFile, '--json'], c.io, { ...mkDeps('bad-rng'), rng }), 60);
      assert.equal(JSON.parse(c.err[0]!).code, 'RNG_UNAVAILABLE');
      assert.doesNotMatch(c.err.join(''), /PRIVATE-RNG-FAILURE-CANARY/);
      assert.deepEqual(c.out, []);
      assert.equal(existsSync(bundle), false);
    }
    assert.deepEqual(readdirSync(dir), ['dice.txt']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('malformed, oversized and nonprivate dice are refused before prompting or writing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-dice-input-'));
  try {
    const file = join(dir, 'dice.txt'), bundle = join(dir, 'never.qvtb');
    for (const contents of ['PRIVATE-DICE-CANARY', ' '.repeat(65537), '1'.repeat(8193)]) {
      writePrivateFixture(file, contents);
      const c = capture(); c.io.promptSecret = async () => assert.fail('invalid dice must be refused before a prompt');
      assert.notEqual(await main(['keygen', '--bundle', bundle, '--dice-file', file, '--json'], c.io, mkDeps('bad-dice')), 0);
      assert.doesNotMatch(c.err.join(''), /PRIVATE-DICE-CANARY/);
      assert.equal(existsSync(bundle), false);
    }
    if (process.platform !== 'win32') {
      writeFileSync(file, '123456'); chmodSync(file, 0o644);
      const c = capture();
      assert.equal(await main(['keygen', '--bundle', bundle, '--dice-file', file, '--json'], c.io, mkDeps('wide-dice')), 60);
      assert.equal(JSON.parse(c.err[0]!).code, 'BAD_PERMISSIONS');
    }
    const c = capture();
    assert.equal(await main(['status', '--bundle', bundle, '--dice-file', file, '--json'], c.io, mkDeps('wrong-command')), 2);
    assert.equal(existsSync(bundle), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('dice input errors do not echo terminal controls or private filename canaries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-dice-path-'));
  try {
    const c = capture(), bundle = join(dir, 'never.qvtb');
    // A bidi control is a valid filename character on supported filesystems, including Windows.
    const hostile = join(dir, 'PRIVATE-DICE-PATH-CANARY\u202e.txt');
    assert.equal(await main(['keygen', '--bundle', bundle, '--dice-file', hostile], c.io, mkDeps('dice-path')), 2);
    assert.deepEqual(c.out, []);
    assert.doesNotMatch(c.err.join(''), /PRIVATE-DICE-PATH-CANARY|[\u001b\u202e]/);
    assert.match(c.err.join(''), /NO_SUCH_FILE/);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('commit uses supplemental dice once and resumes its exact persisted packet with different dice', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'dice-commit' });
  await c.setup();
  try {
    c.marker('dkg-open');
    const log = join(c.dir, 'log.qvl'), diceFile = join(c.dir, 'dice.txt');
    writeFileSync(log, jcs({ format: LOG_FORMAT, manifest_hash: bytesToHex(c.mh), entries: c.log }));
    writePrivateFixture(diceFile, '123456'.repeat(50));
    const io = capture(), deps = c.deps.get(1)!;
    assert.equal(await main(['import', '--bundle', c.path(1), '--log', log, '--json'], io.io, deps), 0);
    const first = join(c.dir, 'first.qvp');
    assert.equal(await main(['commit', '--bundle', c.path(1), '--dice-file', diceFile, '--out', first, '--json'], io.io, deps), 0);
    const saved = readFileSync(c.path(1));
    writePrivateFixture(diceFile, '654321'.repeat(50));
    const second = join(c.dir, 'second.qvp');
    assert.equal(await main(['commit', '--bundle', c.path(1), '--dice-file', diceFile, '--out', second, '--json'], io.io,
      { ...deps, rng: { bytes() { assert.fail('persisted commit must not redraw randomness'); } } }), 0);
    assert.deepEqual(readFileSync(first), readFileSync(second));
    assert.deepEqual(readFileSync(c.path(1)), saved);
    assert.equal((await Trustee.open(c.path(1), PASS, deps)).state, 'COMMITTED');
    assert.deepEqual(io.err, []);
  } finally { c.cleanup(); }
});
