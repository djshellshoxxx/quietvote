import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnQv, tmp, VEC } from './helpers.ts';

const source = JSON.parse(readFileSync(join(VEC, 'v1/protocol/dkg/dkg.json'), 'utf8'));
const clone = <T>(v: T): T => structuredClone(v);

/** Small complete corpus for executable adapter checks: original DKG cases plus
 * the mandatory original canary. Hashes are regenerated only in this temporary
 * test corpus, so altered expectations test the runner rather than file drift. */
function corpus(vectors: any[], operation = 'dkg.adjudicate'): string {
  const root = tmp();
  for (const dir of ['elections', 'mutations', 'canary', 'protocol/dkg']) mkdirSync(join(root, 'v1', dir), { recursive: true });
  const files = [];
  for (const file of ['v1/canary/canary-election.json', 'v1/canary/expected-report.json', 'v1/protocol/dkg/dkg.json']) {
    const contents = file.endsWith('/dkg.json') ? JSON.stringify({ ...source, operation, vectors }) : readFileSync(join(VEC, file), 'utf8');
    writeFileSync(join(root, file), contents);
    files.push({ path: file, sha256: createHash('sha256').update(contents).digest('hex') });
  }
  writeFileSync(join(root, 'MANIFEST.json'), JSON.stringify({ files }));
  return root;
}

test('shipped strict vector runner adjudicates every original DKG ceremony and expected abort', () => {
  const root = corpus(source.vectors);
  try {
    const r = spawnQv(['vectors', 'check', root, '--strict', '--json']);
    assert.equal(r.code, 0, r.err + r.out);
    assert.deepEqual(JSON.parse(r.out).failed, []);
    assert.deepEqual(JSON.parse(r.out).skipped, []);
    assert.equal(JSON.parse(r.out).ok, true);
    assert.ok(source.vectors.some((v: any) => v.expect.error === 'E_DKG_QUORUM'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('DKG vector runner rejects false expected qualification, key, context and every public share', () => {
  const changes: Record<string, (v: any) => void> = {
    Q: v => { v.expect.output.Q.pop(); },
    qmask: v => { v.expect.output.qmask = 1; },
    K: v => { v.expect.output.K_hex = '00'.repeat(32); },
    ctx: v => { v.expect.output.ctx_hex = '00'.repeat(32); },
    Y: v => { v.expect.output.Y_hex['1'] = '00'.repeat(32); },
    missing_share: v => { delete v.expect.output.Y_hex['3']; },
    wrong_abort: v => { v.expect = { ok: false, error: 'E_DKG_QUORUM' }; },
  };
  const vectors = Object.entries(changes).map(([id, change]) => {
    const v = clone(source.vectors[0]); v.id = id; change(v); return v;
  });
  const root = corpus(vectors);
  try {
    const r = spawnQv(['vectors', 'check', root, '--strict', '--json']);
    assert.equal(r.code, 1, r.err);
    const report = JSON.parse(r.out);
    assert.deepEqual(report.skipped, []);
    assert.deepEqual(report.failed.map((v: any) => v.id).sort(), Object.keys(changes).sort());
    assert.ok(report.failed.every((v: any) => v.file === 'protocol/dkg/dkg.json'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('DKG vector transport does not ignore malformed metadata, phase or record members', () => {
  const changes: Record<string, (v: any) => void> = {
    width: v => { v.input.manifest_hash_hex = 'ab'; },
    threshold: v => { v.input.t = 33; },
    excessive_threshold: v => { v.input.t = v.input.n + 1; },
    missing_marker: v => { delete v.input.markers['dkg-final']; },
    unknown_marker: v => { v.input.markers.untrusted = 42; },
    bad_seq: v => { v.input.records.commits[0].seq = -1; },
    unknown_body: v => { v.input.records.commits[0].body.trusted = true; },
    missing_records: v => { delete v.input.records.complaints; },
  };
  const vectors = Object.entries(changes).map(([id, change]) => {
    const v = clone(source.vectors[0]); v.id = id; change(v); return v;
  });
  const root = corpus(vectors);
  try {
    const r = spawnQv(['vectors', 'check', root, '--strict', '--json']);
    assert.equal(r.code, 1, r.err);
    const report = JSON.parse(r.out);
    assert.deepEqual(report.skipped, []);
    assert.deepEqual(report.failed.map((v: any) => v.id).sort(), Object.keys(changes).sort());
    assert.ok(report.failed.every((v: any) => v.detail === 'unexpected error E_SCHEMA'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unrecognized vector operations remain explicitly unsupported and fail strict mode', () => {
  const root = corpus([clone(source.vectors[0])], 'dkg.unrecognized');
  try {
    const r = spawnQv(['vectors', 'check', root, '--strict', '--json']);
    assert.equal(r.code, 1, r.err);
    const report = JSON.parse(r.out);
    assert.equal(report.ok, false);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.skipped, ['protocol/dkg/dkg.json (dkg.unrecognized)']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
