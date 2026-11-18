import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trusteeMain } from '../src/index.ts';
import { mkDeps } from './helpers/harness.ts';

const CANARY = 'private-transcript-option-canary';

test('CLI: malformed witness-key values fail before reading a transcript without echoing values', async () => {
  for (const value of [CANARY, `=${'11'.repeat(32)}`, ` =${'11'.repeat(32)}`, `w=${'11'.repeat(31)}`, `w=${'AA'.repeat(32)}`, `w=${'11'.repeat(32)}=extra`, `w\nname=${'11'.repeat(32)}`, `w=${'11'.repeat(32)}\n`]) {
    const errors: string[] = [];
    const code = await trusteeMain(['verify-transcript', '--in', 'not-read.json', '--witness-key', value], {
      out: () => assert.fail('invalid arguments cannot produce success output'),
      err: (s) => errors.push(s), promptSecret: async () => assert.fail('must not prompt'),
    }, mkDeps('witness-key-invalid'), {});
    assert.equal(code, 2);
    assert.match(errors.join('\n'), /--witness-key must be NAME=HEX/);
    assert.equal(errors.join('\n').includes(value), false);
    assert.equal(errors.join('\n').includes('not-read.json'), false);
  }
});

test('CLI: valid witness names and canonical public-key hex reach transcript verification', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-cli-witness-'));
  try {
    const input = join(dir, 'invalid-transcript.json');
    writeFileSync(input, '{}');
    for (const name of ['witness-1', 'Alice Smith', '__proto__']) {
      const out: string[] = [], err: string[] = [];
      assert.equal(await trusteeMain(['verify-transcript', '--in', input, '--witness-key', `${name}=${'11'.repeat(32)}`, '--json'], {
        out: (s) => out.push(s), err: (s) => err.push(s), promptSecret: async () => assert.fail('must not prompt'),
      }, mkDeps('witness-key-valid'), {}), 20);
      assert.deepEqual(err, []);
      assert.match(out[0]!, /not a ceremony transcript/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: unsupported transcript mode is rejected before opening secrets, without echoing its value', async () => {
  const err: string[] = [];
  let prompts = 0;
  assert.equal(await trusteeMain(['export-transcript', '--bundle', 'not-opened.qvtb', '--out', 'not-written.json', '--mode', CANARY], {
    out: () => assert.fail('invalid arguments cannot produce success output'),
    err: (s) => err.push(s), promptSecret: async () => { prompts++; return CANARY; },
  }, mkDeps('mode-invalid'), {}), 2);
  assert.equal(prompts, 0);
  assert.match(err.join('\n'), /--mode must be/);
  assert.equal(err.join('\n').includes(CANARY), false);
});

test('CLI: all implemented transcript modes remain accepted', async () => {
  for (const mode of ['online-dkg', 'airgap-dkg', 'airgap-dealer']) {
    const err: string[] = [];
    assert.equal(await trusteeMain(['export-transcript', '--out', 'not-written.json', '--mode', mode], {
      out: () => assert.fail('missing bundle cannot produce output'), err: (s) => err.push(s),
      promptSecret: async () => assert.fail('must not prompt without --bundle'),
    }, mkDeps('mode-valid'), {}), 2);
    assert.match(err.join('\n'), /--bundle is required/);
  }
});
