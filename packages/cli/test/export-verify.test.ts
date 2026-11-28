// SPDX-License-Identifier: AGPL-3.0-or-later
// Optional export verification uses real signed protocol records, log heads and witnesses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { b64u, bundleToJson, cosignLine, writeTar } from '@quietvote/board';
import { bytesToHex, sha256, utf8 } from '@quietvote/crypto';
import { CONTROL_ENTRY, expectedLogId, PROTO_ID, signRecord, type CastEnvelope, type ElectionBundle } from '@quietvote/protocol';
import { buildBoard, isoSec, typeAndAuthor, witnessKeys, type Head } from '../../protocol/test/helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, multiSign, publishTally, setup, type Sim } from '../../protocol/test/helpers/sim.ts';
import { World } from '../../server/test/helpers/world.ts';
import type { ExportVerification } from '../src/export-verification.ts';
import { qv, tmp, type Res } from './helpers.ts';

const SEED = 'cli-verified-export';
const WITNESS = witnessKeys(SEED)[0]!;
const OTHER_ID = 'ab'.repeat(16);
interface Fixture { sim: Sim; election: ElectionBundle }
let ordinary: Promise<Fixture> | undefined;
function fixture(): Promise<Fixture> {
  ordinary ??= makeFixture();
  return ordinary;
}
async function makeFixture(quorum = 1, invalidCast = false): Promise<Fixture> {
  const sim = await setup({ seed: SEED, n: 2, t: 2, voters: 3, maxPerVoter: 8,
    contests: defaultContests().filter((c) => c.id === 'budget'), boundLog: true, witnessQuorum: quorum,
    witnesses: [{ name: 'w1', pk: bytesToHex(WITNESS.publicKey) }] });
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
  if (invalidCast) {
    castBallot(sim, 0, { budget: ['no'] });
    (sim.log.at(-1)!.entry as CastEnvelope).sig = '00'.repeat(64);
  }
  closeElection(sim); publishTally(sim, [1, 2]);
  return { sim, election: structuredClone(bundleOf(sim)) };
}
function heads(f: Fixture): Head[] {
  const vo = isoSec(f.sim.manifest.voting_open), vc = isoSec(f.sim.manifest.voting_close);
  const cosigs = (ts: number) => [{ name: 'w1', key: WITNESS, ts }];
  const size = f.election.log.at(-1)!.seq + 1;
  const out: Head[] = [
    { size: f.sim.openSeq!, cosigs: cosigs(vo - 3600) },
    { size: f.sim.closeSeq!, cosigs: cosigs(vo + 3600) },
    { size: f.sim.closeSeq! + 1, cosigs: cosigs(vc + 60) },
  ];
  if (size > f.sim.closeSeq! + 1) out.push({ size, cosigs: cosigs(vc + 120) });
  return out;
}
function downloads(f: Fixture, checkpoints = heads(f), policyWitnesses = [{ name: 'w1', key: WITNESS }]) {
  const view = buildBoard(f.sim, f.election, checkpoints, { logKey: kp(SEED, 'log'),
    author: (record, manifest) => {
      const body = record['body'] as { type?: string; action?: string };
      return body.type === 'control' ? [CONTROL_ENTRY[body.action!]!, f.sim.coord[0]!] : typeAndAuthor(f.sim, record, manifest);
    } });
  view.bundle.policy.witnessPolicy = { quorum: f.sim.manifest.bb.witness_quorum, noneAcknowledged: f.sim.manifest.bb.witness_quorum === 0,
    witnesses: policyWitnesses.map(({ name, key }) => ({ name, alg: 'ed25519', publicKey: key.publicKey })) };
  const board = bundleToJson(view.bundle) as Record<string, unknown> & { entries: unknown[]; policy: unknown };
  const lines = utf8(board.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const files = new Map<string, Uint8Array>([
    ['election.json', utf8(JSON.stringify(f.election))], ['log/entries.jsonl', lines],
    ['witness/policy.json', utf8(JSON.stringify(board.policy))], ['redactions.json', utf8('[]')],
    ['bundle.json', utf8(JSON.stringify({ ...board, entries: undefined, checkpoints: undefined, policy: undefined,
      receipts: undefined, redactions: undefined, entries_sha256: bytesToHex(sha256(lines)), server_pk_b64u: b64u(f.sim.coord[0]!.publicKey) }))],
  ]);
  for (const [size, note] of view.notes) files.set(`log/checkpoints/${size}.txt`, utf8(note));
  files.set('SHA256SUMS', utf8([...files].map(([name, data]) => `${bytesToHex(sha256(data))}  ${name}`).sort().join('\n') + '\n'));
  return { qvb: writeTar([...files].map(([name, data]) => ({ name, data }))),
    json: utf8(JSON.stringify({ ...f.election, board }, null, 2) + '\n'), content: utf8(JSON.stringify(f.election)) };
}

async function serve(bytes: Uint8Array) {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!); res.setHeader('connection', 'close'); res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { requests, base: `http://127.0.0.1:${address.port}`,
    stop: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}
function args(base: string, out: string, id: string, format: 'qvb' | 'json'): string[] {
  return ['online', 'election-export', '--server', base, '--id', id, '--format', format, '--out', out, '--json'];
}
function checked(result: Res, exit: number, path: string, bytes: Uint8Array): ExportVerification {
  assert.equal(result.code, exit, result.err + result.out);
  const output = JSON.parse(result.out) as { verified: boolean; bytes: number; verification: ExportVerification };
  assert.equal(output.verified, exit === 0);
  assert.equal(output.bytes, bytes.byteLength);
  assert.deepEqual(readFileSync(path), Buffer.from(bytes), 'retain the exact received bytes for every verification outcome');
  if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
  const r = output.verification;
  assert.equal(r.format, 'qv-export-verification/v1'); assert.equal(r.scope, 'downloaded-snapshot');
  assert.equal(r.freshnessVerified, false); assert.equal(r.finalityVerified, false);
  assert.equal(r.download_sha256, bytesToHex(sha256(bytes)));
  return r;
}
async function invoke(bytes: Uint8Array, f: Fixture, format: 'qvb' | 'json', exit: number, options: { pin?: string; id?: string } = {}) {
  const dir = tmp(), out = join(dir, `saved.${format}`), host = await serve(bytes);
  try {
    const id = options.id ?? f.election.manifest.body.election_id;
    const r = checked(await qv([...args(host.base, out, id, format), '--verify', '--manifest-hash', options.pin ?? f.election.manifest_hash]), exit, out, bytes);
    assert.deepEqual(host.requests, [`/api/v1/elections/${id}/export.${format}${format === 'json' ? '?board=1' : ''}`]);
    return r;
  } finally { await host.stop(); rmSync(dir, { recursive: true, force: true }); }
}

test('election-export keeps its default bytes, URI, output and exclusive-create behavior', async () => {
  const bytes = utf8('{"download":"not a verification claim"}\n'), host = await serve(bytes), dir = tmp(), out = join(dir, 'saved.json');
  try {
    const command = args(host.base, out, OTHER_ID, 'json');
    const result = await qv(command); assert.equal(result.code, 0, result.err);
    assert.deepEqual(JSON.parse(result.out), { file: out, bytes: bytes.length, format: 'json', verified: false });
    assert.deepEqual(readFileSync(out), Buffer.from(bytes));
    assert.equal((await qv(command)).code, 4);
    assert.deepEqual(host.requests, [`/api/v1/elections/${OTHER_ID}/export.json`]);
  } finally { await host.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('election-export validates independent pins and bounded supplemental keys before GET', async () => {
  const host = await serve(utf8('{}')), dir = tmp(), out = join(dir, 'unused.json');
  try {
    const command = args(host.base, out, OTHER_ID, 'json'), pin = '00'.repeat(32);
    for (const extra of [
      ['--verify'], ['--manifest-hash', pin], ['--extra-author-key', pin],
      ['--verify', '--manifest-hash', 'AB'.repeat(32)],
      ['--verify', '--manifest-hash', pin, '--extra-author-key', 'x'],
      ['--verify', '--manifest-hash', pin, ...Array.from({ length: 33 }, () => ['--extra-author-key', pin]).flat()],
      ['--verify', '--manifest-hash', pin, '--content-only'], ['--verify', '--manifest-hash', pin, '--skip-selftest'],
    ]) assert.equal((await qv([...command, ...extra])).code, 2, extra.join(' '));
    assert.equal((await qv([...args(host.base, out, OTHER_ID, 'qvb'), '--verify', '--manifest-hash', pin, '--extra-author-key', pin])).code, 2);
    assert.deepEqual(host.requests, []); assert.equal(existsSync(out), false);
  } finally { await host.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('election-export verifies complete QVB and board JSON snapshots with self-tests', async (t) => {
  const f = await fixture(), bytes = downloads(f);
  for (const format of ['qvb', 'json'] as const) await t.test(format, async () => {
    const r = await invoke(bytes[format], f, format, 0);
    assert.equal(r.verdict, 'PASS'); assert.equal(r.verifier_verdict, 'PASS');
    assert.equal(r.election_id_binding, 'pass'); assert.equal(r.snapshot_witness, 'pass'); assert.equal(r.controls, 'pass');
    assert.equal(r.self_test, 'pass'); assert.equal(r.report!.selfTest!.ok, true); assert.ok(r.report!.selfTest!.total > 0);
    assert.equal(r.report!.manifestHashSource, 'caller'); assert.equal(r.report!.manifestHash, f.election.manifest_hash);
    assert.equal(r.snapshot!.tree_size, f.election.log.length + 1); assert.deepEqual(r.adapter_failures, []);
  });
});

test('election-export rejects wrong independent pins and separately binds the requested election ID', async (t) => {
  const f = await fixture(), bytes = downloads(f);
  for (const format of ['qvb', 'json'] as const) await t.test(format, async () => {
    assert.equal((await invoke(bytes[format], f, format, 1, { pin: '00'.repeat(32) })).verdict, 'FAIL');
    const other = await invoke(bytes[format], f, format, 1, { id: OTHER_ID });
    assert.equal(other.verdict, 'FAIL'); assert.equal(other.verifier_verdict, 'PASS');
    assert.equal(other.election_id_binding, 'fail'); assert.ok(other.adapter_failures.includes('E_EXPORT_ELECTION_ID'));
  });
});

test('election-export preserves malformed and checksum-refused downloads and never overwrites them', async (t) => {
  const f = await fixture(), corrupted = downloads(f).qvb;
  corrupted[512] = corrupted[512]! ^ 1;
  for (const [format, bytes] of [['json', utf8('{"manifest":1,"manifest":2}')], ['qvb', corrupted]] as const) await t.test(format, async () => {
    const host = await serve(bytes), dir = tmp(), out = join(dir, `failed.${format}`);
    try {
      const command = [...args(host.base, out, f.election.manifest.body.election_id, format), '--verify', '--manifest-hash', f.election.manifest_hash];
      const r = checked(await qv(command), 1, out, bytes); assert.equal(r.verdict, 'FAIL');
      if (format === 'qvb') {
        assert.deepEqual(r.adapter_failures, ['E_EXPORT_ARCHIVE']); assert.equal(r.report, null);
        assert.equal(r.self_test, 'not_run'); assert.equal(r.verifier_verdict, 'not_run');
      }
      assert.equal((await qv(command)).code, 4); assert.equal(host.requests.length, 1);
      assert.deepEqual(readFileSync(out), Buffer.from(bytes));
    } finally { await host.stop(); rmSync(dir, { recursive: true, force: true }); }
  });
});

test('election-export retains incomplete snapshots without a tally or full board evidence', async () => {
  const f = await fixture(), pending = { ...f, election: structuredClone(f.election) };
  pending.election.log.pop();
  assert.equal((await invoke(downloads(pending).qvb, pending, 'qvb', 3)).verdict, 'INCOMPLETE');
  const withoutBoard = await invoke(downloads(f).content, f, 'json', 3);
  assert.equal(withoutBoard.verdict, 'INCOMPLETE'); assert.equal(withoutBoard.snapshot, null);
});

test('election-export requires final-snapshot witnesses from the signed manifest', async () => {
  const f = await fixture(), checkpoints = heads(f);
  checkpoints[checkpoints.length - 1] = { size: f.election.log.length + 1 };
  const missing = await invoke(downloads(f, checkpoints).qvb, f, 'qvb', 3);
  assert.equal(missing.snapshot_witness, 'not_run');
  // The full verifier's board layer trusts this policy copy, while the protocol checks phase heads.
  // A self-attested witness for only the final head must not promote that snapshot to verified.
  const substitute = witnessKeys(SEED)[1]!;
  checkpoints[checkpoints.length - 1] = { size: f.election.log.length + 1,
    cosigs: [{ name: 'w2', key: substitute, ts: isoSec(f.sim.manifest.voting_close) + 120 }] };
  const swapped = await invoke(downloads(f, checkpoints, [{ name: 'w1', key: WITNESS }, { name: 'w2', key: substitute }]).json, f, 'json', 3);
  assert.equal(swapped.verifier_verdict, 'PASS'); assert.equal(swapped.snapshot_witness, 'not_run');
});

test('election-export refuses subordinate ballot failures even when the verifier verdict is PASS', async () => {
  const f = await makeFixture(1, true), r = await invoke(downloads(f).json, f, 'json', 1);
  assert.equal(r.verdict, 'FAIL'); assert.equal(r.verifier_verdict, 'PASS');
  assert.equal(r.report!.chk['chk.ballots.valid'], 'fail');
});

test('election-export retains zero-witness policy as incomplete', async () => {
  const f = await makeFixture(0), r = await invoke(downloads(f).qvb, f, 'qvb', 3);
  assert.equal(r.verdict, 'INCOMPLETE'); assert.equal(r.snapshot_witness, 'not_run');
});

test('election-export retains authenticated notices and gates uninterpreted outcome controls', async (t) => {
  const f = await fixture();
  for (const action of ['pause', 'cancel', 'security-notice'] as const) await t.test(action, async () => {
    const changed = { ...f, election: structuredClone(f.election) };
    changed.election.log.push({ seq: changed.election.log.length + 1,
      entry: multiSign(f.sim, f.sim.mh, { proto: PROTO_ID, type: 'control', action, control_seq: 1 }) });
    // Board grammar already refuses a cancel after close; pause is the otherwise-PASS control gap.
    const r = await invoke(downloads(changed).json, changed, 'json', action === 'security-notice' ? 0 : action === 'cancel' ? 1 : 3);
    assert.equal(r.verifier_verdict, action === 'cancel' ? 'FAIL' : 'PASS');
    assert.ok(r.notices.some((notice) => notice.kind === action));
    assert.equal(r.controls, action === 'security-notice' ? 'pass' : 'not_run');
    assert.ok(r.report!.caveats.some((caveat) => caveat.toLowerCase().replaceAll('-', ' ').includes(action.replaceAll('-', ' '))));
  });
});

async function witness(w: World): Promise<void> {
  const cp = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`); assert.equal(cp.status, 200, cp.text);
  const text = cp.text.slice(0, cp.text.indexOf('\n\n') + 1), key = w.witnesses[0]!;
  const response = await w.req('POST', `/api/v1/elections/${w.electionId}/log/cosignatures`, {
    checkpoint_size: Number(cp.text.split('\n')[1]), lines: [cosignLine('w1', key.secretKey, key.publicKey, text, w.nowSec)],
  });
  assert.equal(response.status, 200, response.text);
}

test('election-export retains actual server downloads and reports the derived-record compatibility gap', { timeout: 120_000 }, async () => {
  const w = new World({ seed: 'cli-export-server', n: 3, t: 2, voters: 3, witnessQuorum: 1, freshConnections: true });
  w.owner = w.coord[0]!; // Preserve the archive preparer's current manifest-author boundary.
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    const build = w.buildManifest.bind(w);
    w.buildManifest = () => {
      const m = build(); m.bb.log_id = expectedLogId(w.origin);
      m.bb.witnesses = [{ name: 'w1', pk: bytesToHex(w.witnesses[0]!.publicKey) }]; return m;
    };
    assert.equal((await w.publishManifest()).status, 201); await w.ceremony(); await witness(w);
    assert.equal((await w.open()).status, 201); await witness(w);
    for (let i = 0; i < 3; i++) assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    await witness(w); assert.equal((await w.close()).status, 201);
    for (const j of [1, 2]) { assert.equal((await w.trusteeShares(j)).status, 201); w.tick(); }
    await witness(w);
    const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,2`); assert.equal(draft.status, 200, draft.text);
    const coordinator = w.coord[0]!;
    assert.equal((await w.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, draft.json.body))).status, 201);
    await witness(w);
    const pin = ['--verify', '--manifest-hash', bytesToHex(w.mh)];
    const serverKey = bytesToHex((await w.server.pool.get(w.electionId))!.srvPk);
    const withoutKey = await qv([...args(w.base, join(w.dir, 'missing-pin.json'), w.electionId, 'json'), ...pin]);
    assert.equal(withoutKey.code, 1, withoutKey.err + withoutKey.out); assert.equal(JSON.parse(withoutKey.out).verified, false);
    for (const format of ['qvb', 'json'] as const) {
      const out = join(w.dir, `retained.${format}`);
      const command = [...args(w.base, out, w.electionId, format), ...pin,
        ...(format === 'json' ? ['--extra-author-key', serverKey] : [])];
      const result = await qv(command);
      assert.equal(result.code, 1, result.err + result.out);
      assert.ok(existsSync(out), `download was not retained: ${result.err}${result.out}`);
      const r = checked(result, 1, out, readFileSync(out));
      // The current protocol deliberately treats these board-only derived records as unknown.
      // Independent author pinning fixes the header binding, not that reader-contract gap.
      assert.equal(r.verdict, 'FAIL'); assert.equal(r.verifier_verdict, 'PASS');
      assert.equal(r.report!.chk['chk.encoding.canonical'], 'fail');
      assert.deepEqual(r.report!.findings.filter((f) => f.code === 'E_VERSION').map((f) => f.detail),
        ['unknown record type tally-aggregate', 'unknown record type dec-shares', 'unknown record type dec-shares']);
      assert.equal(r.snapshot!.origin, w.origin);
      assert.equal(r.self_test, 'pass'); assert.equal(r.snapshot_witness, 'pass');
      assert.equal(r.report!.counts.counted, 3);
      const before = readFileSync(out);
      assert.equal((await qv(command)).code, 4); assert.deepEqual(readFileSync(out), before);
      if (format === 'qvb') {
        const status = await qv(['ballot', 'status', '--election', out, '--manifest-hash', bytesToHex(w.mh),
          '--code', w.last.get(bytesToHex(w.voters[0]!.publicKey))!, '--json']);
        assert.equal(status.code, 1, status.err + status.out);
        const ballot = JSON.parse(status.out);
        assert.equal(ballot.status, 'UNVERIFIED'); assert.equal(ballot.verification.protocol_verdict, 'PASS');
        assert.equal(ballot.verification.checks['chk.encoding.canonical'], 'fail');
        assert.deepEqual(readFileSync(out), before);
      }
    }
  } finally { await w.stop(); }
});
