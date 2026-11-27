// SPDX-License-Identifier: AGPL-3.0-or-later
// T-167 / offline ballot-status acceptance: real signed records, board heads and witnesses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, sha256, utf8 } from '@quietvote/crypto';
import { b64u, writeTar } from '@quietvote/board';
import { CONTROL_ENTRY, PROTO_ID, signRecord, verifyElection, type CastEnvelope, type CheckId, type ElectionBundle, type SignedRecord, type TallyBody } from '@quietvote/protocol';
import { buildBoard, isoSec, typeAndAuthor, witnessKeys, type Head } from '../../protocol/test/helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, multiSign, publishTally, setup, spoilBallot, type Sim } from '../../protocol/test/helpers/sim.ts';
import { prepareElectionArchive } from '../src/cmd-prepare.ts';
import { qv, spawnQv, tmp, type Res } from './helpers.ts';

const SEED = 'cli-independent-ballot-status';
const WITNESS = witnessKeys(SEED)[0]!;
const ABSENT = 'ab'.repeat(32);
type Status = 'COUNTED' | 'SUPERSEDED' | 'SPOILED' | 'ABSENT' | 'UNVERIFIED' | 'EXCLUDED';
interface StatusResult {
  format: string; ballot_code: string; manifest_hash: string; status: Status; counted: boolean | null;
  snapshot: { origin: string; tree_size: number; root_hash: string };
  verification: { verdict: string; protocol_verdict: string; checks: Record<CheckId, string>; findings: { code: string }[] };
  freshnessVerified: boolean; finalityVerified: boolean; caveats: string[];
}

interface Fixture { sim: Sim; election: ElectionBundle; codes: { old: string; latest: string; other: string; spoiled: string } }
let ordinary: Promise<Fixture> | undefined;
function fixture(): Promise<Fixture> {
  ordinary ??= (async () => {
    const sim = await newSim();
    const old = bytesToHex(castBallot(sim, 0, { budget: ['yes'] }).built.code);
    const other = bytesToHex(castBallot(sim, 1, { budget: ['yes'] }).built.code);
    castBallot(sim, 2, { budget: ['no'] });
    castBallot(sim, 0, { budget: ['no'] });
    const latest = bytesToHex(castBallot(sim, 0, { budget: ['yes'] }).built.code);
    const spoiled = bytesToHex(spoilBallot(sim, 1, { budget: ['no'] }, 'publish').built.code);
    closeElection(sim); publishTally(sim, [1, 2]);
    return { sim, election: structuredClone(bundleOf(sim)), codes: { old, latest, other, spoiled } };
  })();
  return ordinary;
}
function newSim(maxPerVoter = 8, witnessQuorum = 1, maxSpoils = 16): Promise<Sim> {
  return setup({ seed: SEED, n: 2, t: 2, voters: 3, maxPerVoter, maxSpoils,
    contests: defaultContests().filter((c) => c.id === 'budget'), boundLog: true, witnessQuorum,
    witnesses: [{ name: 'w1', pk: bytesToHex(WITNESS.publicKey) }] });
}
function heads(sim: Sim, election: ElectionBundle): Head[] {
  const vo = isoSec(sim.manifest.voting_open), vc = isoSec(sim.manifest.voting_close);
  const cosigs = (ts: number) => [{ name: 'w1', key: WITNESS, ts }];
  const size = election.log.at(-1)!.seq + 1;
  const out: Head[] = [
    { size: sim.openSeq!, cosigs: cosigs(vo - 3600) },
    { size: sim.closeSeq!, cosigs: cosigs(vo + 3600) },
    { size: sim.closeSeq! + 1, cosigs: cosigs(vc + 60) },
  ];
  if (size > sim.closeSeq! + 1) out.push({ size, cosigs: cosigs(vc + 120) });
  return out;
}
function archive(sim: Sim, election: ElectionBundle, checkpoints = heads(sim, election)): Uint8Array {
  const view = buildBoard(sim, election, checkpoints, { logKey: kp(SEED, 'log'),
    author: (record, manifest) => {
      const body = record['body'] as { type?: string; action?: string };
      return body.type === 'control' ? [CONTROL_ENTRY[body.action!]!, sim.coord[0]!] : typeAndAuthor(sim, record, manifest);
    } });
  const board = view.json as Record<string, unknown> & { entries: unknown[]; policy: unknown };
  const lines = utf8(board.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const files = new Map<string, Uint8Array>([
    ['election.json', utf8(JSON.stringify(election))], ['log/entries.jsonl', lines],
    ['witness/policy.json', utf8(JSON.stringify(board.policy))], ['redactions.json', utf8('[]')],
    ['bundle.json', utf8(JSON.stringify({ ...board, entries: undefined, checkpoints: undefined, policy: undefined,
      receipts: undefined, redactions: undefined, entries_sha256: bytesToHex(sha256(lines)), server_pk_b64u: b64u(sim.coord[0]!.publicKey) }))],
  ]);
  for (const [size, note] of view.notes) files.set(`log/checkpoints/${size}.txt`, utf8(note));
  files.set('SHA256SUMS', utf8([...files].map(([name, data]) => `${bytesToHex(sha256(data))}  ${name}`).sort().join('\n') + '\n'));
  return writeTar([...files].map(([name, data]) => ({ name, data })));
}
function args(path: string, pin: string, code: string): string[] {
  return ['ballot', 'status', '--election', path, '--manifest-hash', pin, '--code', code];
}
function report(result: Res, exit: number): StatusResult {
  assert.equal(result.code, exit, result.err + result.out);
  const r = JSON.parse(result.out) as StatusResult;
  assert.equal(r.format, 'qv-ballot-status/v1');
  assert.equal(r.freshnessVerified, false);
  assert.equal(r.finalityVerified, false);
  return r;
}

test('ballot status distinguishes counted, valid revotes, spoils and snapshot-local absence', async () => {
  const f = await fixture(), dir = tmp(), path = join(dir, 'snapshot.qvb');
  try {
    const bytes = archive(f.sim, f.election); writeFileSync(path, bytes);
    const contents = readdirSync(dir);
    for (const [code, status, exit] of [
      [f.codes.latest, 'COUNTED', 0], [f.codes.other, 'COUNTED', 0], [f.codes.old, 'SUPERSEDED', 0],
      [f.codes.spoiled, 'SPOILED', 0], [ABSENT, 'ABSENT', 1],
    ] as const) {
      const output = await qv([...args(path, f.election.manifest_hash, code), '--json']);
      const r = report(output, exit);
      assert.equal(r.status, status);
      assert.equal(r.counted, status === 'COUNTED');
      assert.equal(r.ballot_code, code); assert.equal(r.manifest_hash, f.election.manifest_hash);
      assert.equal(r.verification.verdict, 'PASS'); assert.equal(r.verification.protocol_verdict, 'PASS');
      for (const [check, value] of Object.entries(r.verification.checks)) if (check !== 'chk.receipts.sample') assert.equal(value, 'pass', check);
      assert.equal(r.snapshot.tree_size, f.election.log.length + 1);
      assert.match(r.snapshot.root_hash, /^[0-9a-f]{64}$/);
      for (const voter of f.sim.rollHex) assert.ok(!output.out.includes(voter), 'status must not dump the voter roster');
      assert.deepEqual(readFileSync(path), Buffer.from(bytes)); assert.deepEqual(readdirSync(dir), contents);
    }
    const actual = spawnQv([...args(path, f.election.manifest_hash, f.codes.latest), '--json']);
    assert.equal(report(actual, 0).status, 'COUNTED');
    const text = await qv(args(path, f.election.manifest_hash, f.codes.old));
    assert.equal(text.code, 0, text.err); assert.match(text.out, /SUPERSEDED/);
    assert.ok(text.out.includes(f.codes.old)); assert.ok(text.out.includes(f.election.manifest_hash));
    assert.match(text.out, /snapshot/i); assert.match(text.out, /freshness.*unchecked|freshness.*not (verified|established)/i);
    const absentText = await qv(args(path, f.election.manifest_hash, ABSENT));
    assert.equal(absentText.code, 1); assert.match(absentText.out, /ABSENT/); assert.match(absentText.out, /snapshot/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status never promotes the preliminary counted set without a tally', async () => {
  const f = await fixture(), election = structuredClone(f.election), dir = tmp(), path = join(dir, 'no-tally.qvb');
  try {
    election.log.pop(); writeFileSync(path, archive(f.sim, election));
    const prepared = prepareElectionArchive(path, election.manifest_hash);
    const preliminary = await verifyElection(prepared.content, { log: { board: prepared.board, extraAuthorKeys: [prepared.serverKey] } });
    assert.ok(preliminary.countedBallots?.some((ballot) => ballot.code === f.codes.latest), 'fixture must expose the preliminary counted array');
    assert.equal(preliminary.checks['chk.tally.decrypt'], 'not_run');
    for (const code of [f.codes.latest, f.codes.old, f.codes.spoiled, ABSENT]) {
      const r = report(await qv([...args(path, election.manifest_hash, code), '--json']), 3);
      assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null);
      assert.equal(r.verification.verdict, 'INCOMPLETE');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status rejects a newly signed wrong tally despite a preliminary counted match', async () => {
  const f = await fixture(), election = structuredClone(f.election), dir = tmp(), path = join(dir, 'bad-tally.qvb');
  try {
    const last = election.log.at(-1)!, tally = last.entry as SignedRecord<TallyBody>;
    tally.body.contests[0]!.options[0]!.T += 1;
    last.entry = signRecord(f.sim.coord[0]!.secretKey, f.sim.coord[0]!.publicKey, f.sim.params!.ctx, tally.body);
    writeFileSync(path, archive(f.sim, election));
    const prepared = prepareElectionArchive(path, election.manifest_hash);
    const underlying = await verifyElection(prepared.content, { log: { board: prepared.board, extraAuthorKeys: [prepared.serverKey] } });
    assert.ok(underlying.countedBallots?.some((ballot) => ballot.code === f.codes.latest));
    assert.equal(underlying.checks['chk.tally.decrypt'], 'fail');
    const r = report(await qv([...args(path, election.manifest_hash, f.codes.latest), '--json']), 1);
    assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null); assert.equal(r.verification.verdict, 'FAIL');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status requires witness evidence even when all content checks pass', async () => {
  const f = await fixture(), dir = tmp(), path = join(dir, 'no-cosignatures.qvb');
  try {
    writeFileSync(path, archive(f.sim, f.election, heads(f.sim, f.election).map(({ size }) => ({ size }))));
    const r = report(await qv([...args(path, f.election.manifest_hash, f.codes.latest), '--json']), 1);
    assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null);
    assert.equal(r.verification.checks['chk.board.witness'], 'fail');
    assert.equal((await qv([...args(path, f.election.manifest_hash, f.codes.latest), '--content-only'])).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status requires witness coverage of the exact final snapshot', async () => {
  const f = await fixture(), dir = tmp(), path = join(dir, 'unwitnessed-final.qvb');
  try {
    const checkpoints = heads(f.sim, f.election);
    checkpoints[checkpoints.length - 1] = { size: f.election.log.length + 1 };
    writeFileSync(path, archive(f.sim, f.election, checkpoints));
    const r = report(await qv([...args(path, f.election.manifest_hash, f.codes.latest), '--json']), 3);
    assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null);
    assert.equal(r.verification.verdict, 'INCOMPLETE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status refuses uninterpreted outcome controls and retains their qualification', async (t) => {
  const f = await fixture();
  for (const action of ['invalidate', 'cancel', 'abort', 'pause', 'resume', 'extension', 'witness-waiver'] as const) await t.test(action, async () => {
    const election = structuredClone(f.election), dir = tmp(), path = join(dir, `${action}.qvb`);
    try {
      const body = { proto: PROTO_ID, type: 'control', action, control_seq: 1 };
      election.log.push({ seq: election.log.length + 1, entry: multiSign(f.sim, f.sim.mh, body) });
      writeFileSync(path, archive(f.sim, election));
      // A retroactive extension is already a protocol failure; other controls lack adopted terminal interpretation.
      const r = report(await qv([...args(path, election.manifest_hash, f.codes.latest), '--json']), action === 'extension' ? 1 : 3);
      assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null);
      assert.equal(r.verification.verdict, action === 'extension' ? 'FAIL' : 'INCOMPLETE');
      assert.ok(r.caveats.some((caveat) => caveat.toLowerCase().replaceAll('-', ' ').includes(action.replaceAll('-', ' '))),
        'retain the authenticated control qualification');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test('ballot status preserves a security notice while reporting the checked tally', async () => {
  const f = await fixture(), election = structuredClone(f.election), dir = tmp(), path = join(dir, 'notice.qvb');
  try {
    const body = { proto: PROTO_ID, type: 'control', action: 'security-notice', control_seq: 1 };
    election.log.push({ seq: election.log.length + 1, entry: multiSign(f.sim, f.sim.mh, body) });
    writeFileSync(path, archive(f.sim, election));
    const r = report(await qv([...args(path, election.manifest_hash, f.codes.latest), '--json']), 0);
    assert.equal(r.status, 'COUNTED'); assert.equal(r.counted, true);
    assert.ok(r.caveats.some((caveat) => /security.notice/i.test(caveat)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status retains zero-witness policy as incomplete', async () => {
  const sim = await newSim(8, 0), dir = tmp(), path = join(dir, 'zero-witness.qvb');
  try {
    const code = bytesToHex(castBallot(sim, 0, { budget: ['yes'] }).built.code);
    castBallot(sim, 1, { budget: ['yes'] }); castBallot(sim, 2, { budget: ['no'] });
    closeElection(sim); publishTally(sim, [1, 2]);
    const election = bundleOf(sim); writeFileSync(path, archive(sim, election, [{ size: election.log.length + 1 }]));
    const r = report(await qv([...args(path, election.manifest_hash, code), '--json']), 3);
    assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null); assert.equal(r.verification.verdict, 'INCOMPLETE');
    assert.equal(r.verification.checks['chk.board.witness'], 'not_run');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status never labels excluded bad chains, quota overflow or late casts as superseded', async (t) => {
  for (const cause of ['wrong-predecessor', 'quota', 'late', 'invalid-signature'] as const) await t.test(cause, async () => {
    const sim = await newSim(1), dir = tmp(), path = join(dir, 'excluded.qvb');
    try {
      castBallot(sim, 0, { budget: ['yes'] }); castBallot(sim, 1, { budget: ['yes'] }); castBallot(sim, 2, { budget: ['no'] });
      if (cause === 'late') closeElection(sim);
      const bad = castBallot(sim, 0, { budget: ['no'] }, cause === 'wrong-predecessor' ? { supersedes: 'ff'.repeat(32) } : {});
      if (cause === 'invalid-signature') (sim.log.at(-1)!.entry as CastEnvelope).sig = '00'.repeat(64);
      if (cause !== 'late') closeElection(sim);
      publishTally(sim, [1, 2]);
      const election = bundleOf(sim); writeFileSync(path, archive(sim, election));
      const result = await qv([...args(path, election.manifest_hash, bytesToHex(bad.built.code)), '--json']);
      assert.equal(result.code, 1, result.err + result.out);
      assert.ok(!result.out.includes('SUPERSEDED')); assert.ok(!result.out.includes('"counted": true'));
      if (result.out) {
        const r = report(result, 1); assert.equal(r.status, 'UNVERIFIED'); assert.equal(r.counted, null);
        assert.equal(r.verification.verdict, 'FAIL');
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test('ballot status distinguishes an authenticated but quota-excluded spoil', async () => {
  const sim = await newSim(8, 1, 1), dir = tmp(), path = join(dir, 'excluded-spoil.qvb');
  try {
    for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'] });
    spoilBallot(sim, 0, { budget: ['yes'] }, 'publish');
    const code = bytesToHex(spoilBallot(sim, 0, { budget: ['no'] }, 'publish').built.code);
    closeElection(sim); publishTally(sim, [1, 2]);
    const election = bundleOf(sim); writeFileSync(path, archive(sim, election));
    const r = report(await qv([...args(path, election.manifest_hash, code), '--json']), 1);
    assert.equal(r.status, 'EXCLUDED'); assert.equal(r.counted, false);
    assert.equal(r.verification.verdict, 'PASS');
    assert.ok(r.verification.findings.some((finding) => finding.code === 'E_REVOTE_LIMIT'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status validates public inputs, independent pins and bounded regular archives', async () => {
  const f = await fixture(), dir = tmp(), path = join(dir, 'snapshot.qvb'), pin = f.election.manifest_hash;
  try {
    writeFileSync(path, archive(f.sim, f.election));
    const prefix = ['ballot', 'status', '--election', path];
    assert.equal((await qv([...prefix, '--code', f.codes.latest])).code, 2);
    assert.equal((await qv([...prefix, '--manifest-hash', pin])).code, 2);
    for (const code of ['', '00', 'AB'.repeat(32), 'g'.repeat(64), '00'.repeat(32) + '\n']) {
      assert.equal((await qv([...prefix, '--manifest-hash', pin, '--code=' + code])).code, 2);
    }
    assert.equal((await qv(args(path, '00'.repeat(32), f.codes.latest))).code, 1);
    assert.equal((await qv(args(path, 'Z'.repeat(64), f.codes.latest))).code, 2);
    assert.equal((await qv([...args(path, pin, f.codes.latest), '--code', f.codes.latest])).code, 2);
    assert.equal((await qv(args(dir, pin, f.codes.latest))).code, 4);
    assert.equal((await qv(args(join(dir, 'missing.qvb'), pin, f.codes.latest))).code, 4);
    const corrupt = readFileSync(path); corrupt[512] = corrupt[512]! ^ 1; writeFileSync(path, corrupt);
    assert.equal((await qv(args(path, pin, f.codes.latest))).code, 4);
    writeFileSync(path, '{not an archive}'); assert.equal((await qv(args(path, pin, f.codes.latest))).code, 4);
    truncateSync(path, 64 * 1024 * 1024 + 1); assert.equal((await qv(args(path, pin, f.codes.latest))).code, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ballot status rejects a deterministic sweep of archive payload corruptions', async () => {
  const f = await fixture(), dir = tmp(), path = join(dir, 'mutated.qvb');
  try {
    const original = archive(f.sim, f.election), payload = utf8(JSON.stringify(f.election));
    const payloadOffset = Buffer.from(original).indexOf(payload);
    assert.ok(payloadOffset >= 512, 'locate the exact election.json payload, not archive padding');
    for (let i = 0; i < 16; i++) {
      const seed = sha256(utf8(`ballot-status-corruption-${i}`));
      const position = payloadOffset + new DataView(seed.buffer, seed.byteOffset, seed.byteLength).getUint32(0) % payload.length;
      const bytes = original.slice(); bytes[position] = bytes[position]! ^ (1 << (i % 8));
      writeFileSync(path, bytes);
      const result = await qv([...args(path, f.election.manifest_hash, f.codes.latest), '--json']);
      assert.equal(result.code, 4, `seed ${i}: ${result.err}${result.out}`);
      assert.equal(result.out, '', 'checksum-refused input must not emit a status claim');
      assert.deepEqual(readFileSync(path), Buffer.from(bytes));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
