import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoardLog, MemoryBoardStore, buildEntry, bundleToJson, exportBundle } from '@quietvote/board';
import { bytesToHex, ed25519Keypair, jcs, sha256, utf8 } from '@quietvote/crypto';
import { advanceControlSeq, checkControlRecord, expectedLogId, logOrigin, manifestHash, signRecordRaw,
  verifyElection, verifyLogStructure, type ControlBody, type ElectionBundle, type MultiSignedRecord } from '../src/index.ts';

const original = JSON.parse(readFileSync(new URL('../../../test-vectors/v1/elections/tiny-yesno-3v/bundle.json', import.meta.url), 'utf8')) as ElectionBundle;
const coord = ed25519Keypair(sha256(utf8('vec-tiny/coord'))), logKey = ed25519Keypair(sha256(utf8('control-sequence/log')));
const other = ed25519Keypair(sha256(utf8('control-sequence/other')));
function record(seq?: number, scope = manifestHash(original.manifest.body), signer = coord, reason?: string): MultiSignedRecord<ControlBody> {
  const body: ControlBody = { proto: 'qv1-r255-sha2', type: 'control', action: 'security-notice',
    ...(seq === undefined ? {} : { control_seq: seq }), ...(reason === undefined ? {} : { reason }) };
  return { body, sigs: [signRecordRaw(signer.secretKey, signer.publicKey, scope, body.type, body)] };
}
function withControls(records: MultiSignedRecord<ControlBody>[]): ElectionBundle {
  const b = structuredClone(original);
  for (const entry of records) b.log.push({ seq: b.log.at(-1)!.seq + 1, entry });
  return b;
}

test('control read schema keeps legacy reasons but bounds new counters and catalog reasons', () => {
  assert.equal(checkControlRecord(record(undefined, undefined, undefined, 'legacy text')), null);
  assert.equal(checkControlRecord(record(1, undefined, undefined, 'OTHER')), null);
  assert.notEqual(checkControlRecord(record(1, undefined, undefined, 'private free text')), null);
  for (const seq of [0, -1, 1.5, true, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    const r = record(1); (r.body as unknown as Record<string, unknown>)['control_seq'] = seq;
    assert.notEqual(checkControlRecord(r), null, String(seq));
  }
  const extended = record(1); Object.assign(extended.body, { after_seq: 1 });
  assert.notEqual(checkControlRecord(extended), null);
  assert.deepEqual(advanceControlSeq(Number.MAX_SAFE_INTEGER - 1, record(Number.MAX_SAFE_INTEGER).body), { ok: true, value: Number.MAX_SAFE_INTEGER });
  assert.equal(advanceControlSeq(Number.MAX_SAFE_INTEGER, record(Number.MAX_SAFE_INTEGER).body).ok, false);
});

test('content verifier accepts legacy prefixes and exact monotonic controls without changing legacy classification', async () => {
  for (const records of [[record(undefined, undefined, undefined, 'old reason')], [record(1), record(2)], [record(), record(), record(1), record(2)]]) {
    const r = await verifyElection(withControls(records), { allowNoLog: true });
    assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
    assert.equal(r.findings.filter((f) => f.code === 'E_VERSION').length, records.filter((e) => e.body.control_seq === undefined).length);
  }
});

test('content verifier withholds results for authenticated replay, gap, future counter or downgrade', async () => {
  for (const counters of [[2], [1, 1], [1, 3], [1, undefined], [1, 2, 1]]) {
    const r = await verifyElection(withControls(counters.map((seq) => record(seq))), { allowNoLog: true });
    assert.equal(r.verdict, 'FAIL', String(counters));
    assert.equal(r.checks['chk.time.window'], 'fail');
    assert.ok(r.findings.some((f) => f.code === 'E_LOG_ORDER' && f.cls === 'F'));
    assert.equal(r.results, undefined);
  }
});

test('bad authorization and rejected schema do not reserve a control counter', async () => {
  const changed = record(1); changed.body.control_seq = 2;
  const badSignature = record(1); badSignature.sigs[0]!.sig = '00'.repeat(64);
  for (const noise of [record(1, undefined, other), record(1, new Uint8Array(32)), badSignature, changed,
    record(1, undefined, undefined, 'non-catalog reason')]) {
    const r = await verifyElection(withControls([noise, record(1), record(2)]), { allowNoLog: true });
    assert.equal(r.verdict, 'PASS', JSON.stringify(r.findings));
    assert.ok(!r.findings.some((f) => f.code === 'E_LOG_ORDER'));
    assert.ok(r.findings.some((f) => f.cls === 'L' && (f.code === 'E_SIG' || f.code === 'E_SCHEMA')));
  }
});

function boardCheck(counters: (number | undefined)[], invalidInner = false, invalidOuter = false) {
  const m = structuredClone(original.manifest.body), origin = logOrigin(m);
  m.bb.log_id = expectedLogId(origin); m.bb.log_pk = bytesToHex(logKey.publicKey);
  const mh = manifestHash(m), manifest = { body: m, sigs: [signRecordRaw(coord.secretKey, coord.publicKey, mh, 'manifest', m)] };
  const records = counters.map((seq, i) => record(seq, mh, invalidInner && i === 0 ? other : coord));
  const entries = [{ seq: 0, entry: manifest }, ...records.map((entry, i) => ({ seq: i + 1, entry }))];
  const store = new MemoryBoardStore(), board = new BoardLog({ origin, store, secretKey: logKey.secretKey, publicKey: logKey.publicKey, clock: () => 100, allowUnverifiedSignatures: true });
  for (const row of entries) {
    const signer = invalidOuter && row.seq === 1 ? other : coord;
    const entry = buildEntry({ origin, type: row.seq === 0 ? 'manifest' : 'notice', body: jcs(row.entry),
      secretKey: signer.secretKey, publicKey: signer.publicKey, nonce: new Uint8Array(16).fill(row.seq), createdAt: 100 });
    assert.equal(board.append(entry.headerBytes, entry.body).ok, true);
  }
  assert.equal(board.checkpoint().ok, true);
  const exported = exportBundle(store, { origin, createdAt: 100, generator: 'test', policy: {
    logPublicKey: logKey.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] },
  } });
  return verifyLogStructure(m, manifest, original.roll, entries.slice(1), { board: bundleToJson(exported) });
}

test('board verification enforces the same signed sequence, including controls in fresh outer envelopes', () => {
  assert.equal(boardCheck([undefined, undefined, 1, 2]).ok, true);
  for (const seqs of [[2], [1, 1], [1, 3], [1, undefined]]) {
    const r = boardCheck(seqs);
    assert.equal(r.ok, false);
    assert.ok(r.findings.some((f) => f.code === 'E_LOG_ORDER'));
  }
  for (const [inner, outer] of [[true, false], [false, true]]) {
    const r = boardCheck([1, 1], inner, outer);
    assert.equal(r.ok, false);
    assert.ok(r.findings.some((f) => f.code === 'E_LOG_BINDING'));
    assert.ok(!r.findings.some((f) => f.code === 'E_LOG_ORDER'));
    assert.equal(r.notices.at(-1)?.control_seq, 1);
  }
});
