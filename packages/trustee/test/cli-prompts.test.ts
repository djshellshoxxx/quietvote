// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-033
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { main, promptSecret, type CliIo } from '../src/cli.ts';
import { TrusteeError } from '../src/errors.ts';
import { mkDeps, PASS } from './helpers/harness.ts';
import { writePrivateFixture } from './helpers/private-file.ts';

function terminal() {
  const rawModes: boolean[] = [], printed: string[] = [];
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(value: boolean) { rawModes.push(value); return input; },
  });
  const output = new Writable({ write(chunk: Buffer, _encoding, done) { printed.push(chunk.toString()); done(); } });
  return { input, output, rawModes, printed };
}

function typedError(code: string, exitCode: number) {
  return (error: unknown): boolean => error instanceof TrusteeError && error.code === code && error.exitCode === exitCode && !error.message.includes(PASS);
}

function capture(answer: CliIo['promptSecret']) {
  const out: string[] = [], err: string[] = [], questions: string[] = [];
  const io: CliIo = {
    out: (s) => out.push(s), err: (s) => err.push(s),
    promptSecret: async (q) => { questions.push(q); return answer(q); },
  };
  return { io, out, err, questions };
}

test('interactive keygen refuses a mismatch before randomness or any file write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-prompt-mismatch-'));
  try {
    let asked = 0;
    const c = capture(async () => ++asked === 1 ? PASS : `${PASS}-different`);
    const deps = { ...mkDeps('prompt-mismatch'), rng: { bytes(): Uint8Array { assert.fail('must not generate a key before confirmation'); } } };
    assert.equal(await main(['keygen', '--bundle', join(dir, 'new.qvtb'), '--json'], c.io, deps), 2);
    assert.deepEqual(c.questions, ['Bundle passphrase: ', 'Confirm bundle passphrase: ']);
    assert.deepEqual(c.out, []);
    assert.deepEqual(readdirSync(dir), []);
    const error = JSON.parse(c.err[0]!) as { code: string; kind: string };
    assert.equal(error.code, 'PASSPHRASE_MISMATCH');
    assert.equal(error.kind, 'USAGE');
    assert.equal(c.err.join('').includes(PASS), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('matching interactive keygen confirms twice; opening the bundle asks once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-prompt-match-'));
  try {
    const c = capture(async () => PASS), bundle = join(dir, 'new.qvtb'), deps = mkDeps('prompt-match');
    assert.equal(await main(['keygen', '--bundle', bundle, '--json'], c.io, deps), 0);
    assert.equal(c.questions.length, 2);
    assert.equal(existsSync(bundle), true);
    c.questions.length = 0;
    assert.equal(await main(['status', '--bundle', bundle, '--json'], c.io, deps), 0);
    assert.deepEqual(c.questions, ['Bundle passphrase: ']);
    assert.equal(JSON.parse(c.out[1]!).state, 'KEYS_READY');
    assert.deepEqual(c.err, []);
    assert.equal(c.out.join('').includes(PASS), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('file and environment passphrase sources remain noninteractive, with explicit-file precedence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-prompt-file-'));
  try {
    const file = join(dir, 'passphrase.txt');
    writePrivateFixture(file, `${PASS}\n`);
    for (const source of ['file', 'environment'] as const) {
      const c = capture(async () => assert.fail('file input must not prompt for confirmation'));
      const bundle = join(dir, `${source}.qvtb`), args = ['keygen', '--bundle', bundle];
      if (source === 'file') args.push('--passphrase-file', file);
      const env = { QV_TRUSTEE_PASSPHRASE_FILE: source === 'file' ? join(dir, 'missing') : file };
      assert.equal(await main(args, c.io, mkDeps(`prompt-${source}`), env), 0);
      assert.equal(existsSync(bundle), true);
      assert.deepEqual(c.questions, []);
      assert.deepEqual(c.err, []);
      assert.equal(c.out.join('').includes(PASS), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generated keygen remains noninteractive and missing bundle is refused before a prompt', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-prompt-generated-'));
  try {
    const c = capture(async () => assert.fail('this path must not prompt')), deps = mkDeps('prompt-generated');
    assert.equal(await main(['keygen', '--generate-passphrase'], c.io, deps), 2);
    assert.deepEqual(readdirSync(dir), []);
    c.err.length = 0;
    assert.equal(await main(['keygen', '--bundle', join(dir, 'new.qvtb'), '--generate-passphrase'], c.io, deps), 0);
    assert.deepEqual(c.questions, []);
    assert.equal(c.err.length, 1);
    assert.match(c.err[0]!, /^GENERATED PASSPHRASE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('EOF at keygen confirmation refuses without creating the bundle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-prompt-confirm-eof-'));
  const tty = terminal();
  try {
    let asked = 0;
    const c = capture(async (q) => {
      if (++asked === 1) return PASS;
      const answer = promptSecret(q, tty.input, tty.output);
      tty.input.end();
      return answer;
    });
    assert.equal(await main(['keygen', '--bundle', join(dir, 'new.qvtb'), '--json'], c.io, mkDeps('confirm-eof')), 2);
    assert.equal(JSON.parse(c.err[0]!).code, 'INPUT_CLOSED');
    assert.deepEqual(c.out, []);
    assert.deepEqual(readdirSync(dir), []);
    assert.equal([...c.err, ...tty.printed].join('').includes(PASS), false);
  } finally { tty.input.destroy(); tty.output.destroy(); rmSync(dir, { recursive: true, force: true }); }
});

test('hidden prompt never echoes answers, restores raw mode and supports a second prompt', async () => {
  const tty = terminal();
  try {
    for (const question of ['Bundle passphrase: ', 'Confirm bundle passphrase: ']) {
      const answer = promptSecret(question, tty.input, tty.output);
      tty.input.write(`${PASS}\r`);
      assert.equal(await answer, PASS);
      assert.equal(tty.input.listenerCount('end'), 0);
      assert.equal(tty.input.listenerCount('close'), 0);
      assert.equal(tty.input.listenerCount('error'), 0);
    }
    assert.deepEqual(tty.printed, ['Bundle passphrase: ', '\n', 'Confirm bundle passphrase: ', '\n']);
    assert.deepEqual(tty.rawModes, [true, false, true, false]);
  } finally { tty.input.destroy(); tty.output.destroy(); }
});

test('terminal EOF, destruction, Ctrl-D and read errors settle with sanitized refusals', async () => {
  for (const cause of ['eof', 'partial-eof', 'destroyed', 'ctrl-d', 'error'] as const) {
    const tty = terminal();
    try {
      const answer = promptSecret('Bundle passphrase: ', tty.input, tty.output);
      const refused = assert.rejects(answer, typedError(cause === 'error' ? 'INPUT_FAILED' : 'INPUT_CLOSED', 2));
      if (cause === 'eof') tty.input.end();
      if (cause === 'partial-eof') tty.input.end(PASS);
      if (cause === 'destroyed') tty.input.destroy();
      if (cause === 'ctrl-d') tty.input.write('\u0004');
      if (cause === 'error') tty.input.emit('error', new Error(`input error with ${PASS}`));
      await refused;
      assert.equal(tty.printed.join('').includes(PASS), false);
      assert.deepEqual(tty.rawModes, [true, false]);
    } finally { tty.input.destroy(); tty.output.destroy(); }
  }
});

test('already closed and non-TTY streams are refused before prompting', async () => {
  const tty = terminal(), pipe = new PassThrough();
  try {
    tty.input.destroy();
    await assert.rejects(promptSecret('secret: ', tty.input, tty.output), typedError('INPUT_CLOSED', 2));
    await assert.rejects(promptSecret('secret: ', pipe, tty.output), typedError('NO_TTY', 2));
    assert.deepEqual(tty.printed, []);
    assert.deepEqual(tty.rawModes, []);
  } finally { pipe.destroy(); tty.output.destroy(); }
});

test('Ctrl-C declines the prompt and restores the terminal', async () => {
  const tty = terminal();
  try {
    const answer = promptSecret('Bundle passphrase: ', tty.input, tty.output);
    const refused = assert.rejects(answer, typedError('INPUT_CANCELLED', 10));
    tty.input.write(`${PASS}\u0003`);
    await refused;
    assert.equal(tty.printed.join('').includes(PASS), false);
    assert.deepEqual(tty.rawModes, [true, false]);
  } finally { tty.input.destroy(); tty.output.destroy(); }
});

test('actual executable refuses closed or piped stdin normally without exposing input', { timeout: 20_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-prompt-executable-'));
  try {
    const env = { ...process.env };
    delete env['QV_TRUSTEE_PASSPHRASE_FILE'];
    delete env['QV_TRUSTEE_BACKUP_PASSPHRASE_FILE'];
    for (const input of ['', `${PASS}\n`]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'status', '--bundle', join(dir, 'missing.qvtb'), '--json'], { env, input, encoding: 'utf8', timeout: 8_000 });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, '');
      const error = JSON.parse(result.stderr) as { code: string; kind: string; message: string };
      assert.equal(error.code, 'NO_TTY');
      assert.equal(error.kind, 'USAGE');
      assert.match(error.message, /--passphrase-file/);
      assert.equal(result.stderr.includes(PASS), false);
      assert.doesNotMatch(result.stderr, /unsettled|top-level await|Warning:/);
      assert.deepEqual(readdirSync(dir), []);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
