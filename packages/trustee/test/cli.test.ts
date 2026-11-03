import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jcs, bytesToHex } from '@quietvote/crypto';
import { trusteeMain, LOG_FORMAT } from '../src/index.ts';
import { Ceremony, mkDeps, PASS } from './helpers/harness.ts';

test('CLI: keygen/join/import/commit/status through files, exit codes and --json', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'cli' });
  await c.setup(); // the harness trustees stand in for T1..T3; the CLI drives a fourth identity only for keygen
  const dir = mkdtempSync(join(tmpdir(), 'qvcli-'));
  try {
    const out: string[] = [], err: string[] = [];
    const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s), promptSecret: async () => PASS };
    const d = mkDeps('cli');
    const run = (a: string[]): Promise<number> => trusteeMain([...a, '--json'], io, d, {});
    const bundle = join(dir, 'x.qvtb');
    assert.equal(await run(['keygen', '--bundle', bundle]), 0);
    assert.match(out.pop()!, /"sign_pk":"[0-9a-f]{64}"/);
    assert.equal(await run(['status', '--bundle', bundle]), 0);
    assert.match(out.pop()!, /KEYS_READY/);
    // not in the manifest -> verification failure (20)
    writeFileSync(join(dir, 'm.json'), JSON.stringify(c.mrec));
    assert.equal(await run(['join', '--bundle', bundle, '--manifest', join(dir, 'm.json'), '--manifest-hash', bytesToHex(c.mh)]), 20);
    assert.match(err.pop()!, /NOT_A_TRUSTEE/);
    // wrong passphrase -> 50
    const bad = { ...io, promptSecret: async () => 'nope' };
    assert.equal(await trusteeMain(['status', '--bundle', bundle], bad, d, {}), 50);
    // usage errors
    assert.equal(await run(['status']), 2);
    assert.equal(await run(['frobnicate']), 2);
    // a real member of the ceremony: use file-based exchange for commit
    const t1 = c.path(1);
    c.marker('dkg-open');
    writeFileSync(join(dir, 'log.qvl'), jcs({ format: LOG_FORMAT, manifest_hash: bytesToHex(c.mh), entries: c.log }));
    assert.equal(await run(['import', '--bundle', t1, '--log', join(dir, 'log.qvl')]), 0);
    assert.equal(await run(['commit', '--bundle', t1, '--out', join(dir, 'p.qvp')]), 0);
    assert.ok(existsSync(join(dir, 'p.qvp')));
    assert.match(readFileSync(join(dir, 'p.qvp'), 'utf8'), /"round":"r1-commit"/);
    assert.equal(await run(['reveal', '--bundle', t1]), 40);
    // no CLI command exists that takes a ciphertext
    assert.equal(await run(['decrypt', '--bundle', t1]), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    c.cleanup();
  }
});
