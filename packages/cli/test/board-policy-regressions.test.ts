import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { COORD, LOGK, makeBoardJson, qv, TINY, tmp, writeJson } from './helpers.ts';

const hexOf = (value: Uint8Array): string => Buffer.from(value).toString('hex');

test('BC-02: standalone board verification needs both trusted log key and witness policy for VERIFIED', async () => {
  const dir = tmp();
  const file = writeJson(dir, 'board.json', makeBoardJson());
  // Independently supplied policy for this synthetic fixture; never infer trust from the bundle's own copy.
  const policy = writeJson(dir, 'trusted-policy.json', { quorum: 0, none_acknowledged: true, witnesses: [] });
  const log = ['--log-key', hexOf(LOGK.publicKey)];
  const witness = ['--witness-policy', policy];
  const cases: [string, string[], number][] = [
    ['neither anchor', [], 3], ['log key only', log, 3], ['witness policy only', witness, 3],
    ['both anchors', [...log, ...witness], 0],
  ];
  for (const [label, pins, expected] of cases) {
    const result = await qv(['board', 'verify', file, '--author-key', hexOf(COORD.publicKey), ...pins, '--json']);
    assert.equal(result.code, expected, `${label}: ${result.out}${result.err}`);
    const report = JSON.parse(result.out);
    assert.equal(report.integrity, expected === 0 ? 'VERIFIED' : 'PARTIAL', label);
    if (!pins.includes('--witness-policy')) assert.ok(report.warnings.some((w: string) => /witness policy.*self-attested/.test(w)), label);
    if (!pins.includes('--log-key')) assert.ok(report.warnings.some((w: string) => /log key.*self-attested/.test(w)), label);
  }
  const text = await qv(['board', 'verify', file, '--author-key', hexOf(COORD.publicKey), ...log]);
  assert.equal(text.code, 3);
  assert.match(text.out, /BOARD INTEGRITY: PARTIAL/);
  assert.match(text.out, /trust anchors/);
  const missingAuthor = await qv(['board', 'verify', file, ...log, ...witness, '--json']);
  assert.equal(missingAuthor.code, 3, 'trusted anchors do not replace missing author evidence');
  assert.equal(JSON.parse(missingAuthor.out).integrity, 'PARTIAL');
});

test('BC-02: absent witness-policy pin never downgrades an actual board failure to PARTIAL', async () => {
  const dir = tmp();
  const board = makeBoardJson();
  board.entries[5].body_b64u = Buffer.from('changed fixture body').toString('base64url');
  const file = writeJson(dir, 'changed.json', board);
  const result = await qv(['board', 'verify', file, '--log-key', hexOf(LOGK.publicKey), '--author-key', hexOf(COORD.publicKey), '--json']);
  assert.equal(result.code, 1, result.out + result.err);
  assert.equal(JSON.parse(result.out).integrity, 'FAILED');
});

test('board verify refuses an external witness policy for an election bundle', async () => {
  const result = await qv(['board', 'verify', TINY, '--witness-policy', join(tmp(), 'absent-policy.json'), '--json']);
  assert.equal(result.code, 2, result.out + result.err);
  assert.match(result.err, /witness-policy.*standalone|witness-policy.*election bundle/);
  assert.equal(result.out, '');
});
