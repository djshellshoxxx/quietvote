import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trusteeMain } from '../src/index.ts';
import { mkDeps } from './helpers/harness.ts';

const CANARY = 'private-passphrase-canary-never-echo';
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

for (const args of [
  ['status', CANARY],
  ['status', '--json', CANARY],
  ['keygen', '--generate-passphrase', CANARY],
]) {
  test(`real CLI withholds unexpected positional material (${args[0]}, ${args.length} args)`, () => {
    const child = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input: '', timeout: 5000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 2);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, /unexpected positional argument/);
    assert.equal(child.stderr.includes(CANARY), false);
  });
}

for (const [name, args, expected] of [
  ['unused option', ['status', '--out', CANARY], /not supported/],
  ['unused flag', ['status', '--generate-passphrase'], /not supported/],
  ['duplicate value', ['status', '--bundle', 'first', '--bundle', CANARY], /duplicate option/],
  ['duplicate flag', ['keygen', '--generate-passphrase', '--generate-passphrase'], /duplicate option/],
  ['duplicate witness key', ['verify-transcript', '--witness-key', 'a=' + '11'.repeat(32), '--witness-key', CANARY], /duplicate option/],
  ['missing option value', ['status', '--bundle', '--json'], /needs a value/],
  ['ignored finalize output', ['finalize', '--out', CANARY], /not supported/],
] as const) {
  test(`CLI rejects ${name} before prompting or opening a bundle`, async () => {
    const err: string[] = [];
    const out: string[] = [];
    let prompts = 0;
    const code = await trusteeMain([...args], {
      out: (s) => out.push(s), err: (s) => err.push(s),
      promptSecret: async () => { prompts++; return CANARY; },
    }, mkDeps(name), {});
    assert.equal(code, 2);
    assert.equal(prompts, 0);
    assert.deepEqual(out, []);
    assert.equal(err.length, 1);
    assert.match(err[0]!, expected);
    assert.equal(err[0]!.includes(CANARY), false);
  });
}

test('real CLI rejects a known but unused option before consulting a passphrase file', () => {
  const child = spawnSync(process.execPath, [cli, 'status', '--bundle', 'not-opened.qvtb', '--out', CANARY, '--passphrase-file', CANARY], { encoding: 'utf8', input: '', timeout: 5000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 2);
  assert.match(child.stderr, /not supported/);
  assert.equal(child.stderr.includes(CANARY), false);
  assert.equal(child.stdout, '');
});
