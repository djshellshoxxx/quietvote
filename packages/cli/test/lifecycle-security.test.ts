// SPDX-License-Identifier: AGPL-3.0-or-later
// Fresh-review cases: each hostile fixture has authentic outer envelopes and a log-signed head.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, jcs, sha256, utf8 } from '@quietvote/crypto';
import { MerkleTree, b64u, buildEntry, bundleToJson, signCheckpoint, type EntryType, type LogBundle } from '@quietvote/board';
import { CONTROL_ENTRY, PROTO_ID, logOrigin, type ElectionBundle, type LogEntry } from '@quietvote/protocol';
import { bundleOf, kp, multiSign, setup, type Sim } from '../../protocol/test/helpers/sim.ts';
import { CREATED_AT, typeAndAuthor } from '../../protocol/test/helpers/board.ts';
import { writeTar } from '../../server/src/tar.ts';
import { prepareElectionArchive } from '../src/cmd-prepare.ts';
import { qv, tmp } from './helpers.ts';

// Fixture mutation deliberately reaches records with different body schemas.
const record = (e: LogEntry): any => e.entry;
const find = (b: ElectionBundle, name: string): LogEntry => b.log.find((e) => record(e).body.name === name)!;
const byType = (b: ElectionBundle, type: string): LogEntry => b.log.find((e) => record(e).body.type === type)!;
const renumber = (b: ElectionBundle): ElectionBundle => { b.log.forEach((e, i) => { e.seq = i + 1; }); return b; };

function authenticatedArchive(sim: Sim, seed: string, election: ElectionBundle): Uint8Array {
  const origin = logOrigin(election.manifest.body), logKey = kp(seed, 'log');
  const tree = new MerkleTree(), entries: LogBundle['entries'] = [];
  const records: [number, any][] = [[0, election.manifest], ...election.log.map((e): [number, unknown] => [e.seq, e.entry])];
  for (const [seq, rec] of records) {
    const [type, who] = rec.body.type === 'control'
      ? [CONTROL_ENTRY[rec.body.action] as EntryType, sim.coord[0]!]
      : typeAndAuthor(sim, rec, seq === 0);
    const body = jcs(rec);
    const entry = buildEntry({ origin, type, secretKey: who.secretKey, publicKey: who.publicKey,
      nonce: sha256(utf8(`fresh-${seq}`)).slice(0, 16), createdAt: CREATED_AT, body });
    tree.appendLeaf(entry.headerBytes);
    entries.push({ seq, headerBytes: entry.headerBytes, body });
  }
  const note = signCheckpoint(origin, tree.size, tree.root(), logKey.secretKey, logKey.publicKey);
  const board = bundleToJson({ format: 'qv-bundle/v1', origin, createdAt: CREATED_AT, treeSize: tree.size, root: tree.root(),
    generator: 'fresh-review', spec: 'QV-18', entries, checkpoints: [note], receipts: [],
    policy: { logPublicKey: logKey.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } }, redactions: [] }) as { entries: unknown[]; policy: unknown };
  const lines = utf8(board.entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const files = new Map<string, Uint8Array>([
    ['election.json', utf8(JSON.stringify(election))], ['log/entries.jsonl', lines],
    ['witness/policy.json', utf8(JSON.stringify(board.policy))], ['redactions.json', utf8('[]')],
    ['bundle.json', utf8(JSON.stringify({ ...board, entries: undefined, checkpoints: undefined, policy: undefined,
      receipts: undefined, redactions: undefined, entries_sha256: bytesToHex(sha256(lines)), server_pk_b64u: b64u(sim.coord[0]!.publicKey) }))],
    [`log/checkpoints/${tree.size}.txt`, utf8(note)],
  ]);
  files.set('SHA256SUMS', utf8([...files].map(([name, data]) => `${bytesToHex(sha256(data))}  ${name}`).sort().join('\n') + '\n'));
  return writeTar([...files].map(([name, data]) => ({ name, data })));
}

test('draft-record rejects authenticated histories with invalid signatures, phases, bindings or terminal controls', { timeout: 60_000 }, async (t) => {
  const seed = 'fresh-cli-archive-probes';
  const sim = await setup({ seed, n: 3, t: 2, voters: 3, boundLog: true });
  const complete = bundleOf(sim), dir = tmp();
  const before = (name: string): ElectionBundle => {
    const b = structuredClone(complete), seq = find(b, name).seq;
    b.log = b.log.filter((e) => e.seq < seq);
    return b;
  };
  const sign = (body: { type: string }, scope = sim.mh) => multiSign(sim, scope, body);
  const cases: [string, ElectionBundle, string, number, RegExp?][] = [['valid final', before('dkg-final'), 'dkg-final', 0]];
  {
    const b = before('dkg-final'); record(find(b, 'dkg-r3-close')).sigs[0].sig = '00'.repeat(64);
    cases.push(['forged coordinator marker', b, 'dkg-final', 1, /coordinator marker lacks valid quorum/]);
  }
  {
    const b = before('election-open'); record(byType(b, 'roll-commit')).sigs[0].sig = '00'.repeat(64);
    cases.push(['forged roll signature', b, 'election-open', 1, /invalid roll commitment/]);
  }
  {
    const b = structuredClone(complete), open = find(b, 'election-open'); open.entry = sign(record(open).body);
    cases.push(['manifest scoped open', b, 'election-close', 1, /context-bound quorum signatures/]);
  }
  {
    const b = structuredClone(complete), open = find(b, 'election-open'), body = record(open).body;
    body.roll_commit_seq = 1; open.entry = sign(body, sim.params!.ctx);
    cases.push(['wrong open history binding', b, 'election-close', 1, /binding does not match/]);
  }
  {
    const b = before('dkg-final'); b.log.splice(b.log.findIndex((e) => record(e).body.name === 'dkg-r1-close'), 1);
    cases.push(['missing phase marker', renumber(b), 'dkg-final', 1, /sequence has a gap/]);
  }
  {
    const b = before('dkg-final'), x = find(b, 'dkg-r1-open'), y = find(b, 'dkg-r1-close');
    [x.entry, y.entry] = [y.entry, x.entry];
    cases.push(['reversed phase markers', b, 'dkg-final', 1, /markers are out of order/]);
  }
  {
    const b = before('dkg-final'); b.log.push(structuredClone(find(b, 'dkg-r3-close')));
    cases.push(['duplicate phase marker', renumber(b), 'dkg-final', 1, /duplicate coordinator marker/]);
  }
  {
    const b = before('election-open'), final = find(b, 'dkg-final'), body = record(final).body;
    body.K = '00'.repeat(32); final.entry = sign(body);
    cases.push(['wrong final key', b, 'election-open', 1, /dkg-final differs/]);
  }
  {
    const b = before('dkg-final'), kc = byType(b, 'dkg-keyconf');
    b.log = b.log.filter((e) => record(e).body.type !== 'dkg-keyconf');
    b.log.push(...[1, 2, 3].map(() => structuredClone(kc)));
    cases.push(['duplicate trustee cannot inflate quorum', renumber(b), 'dkg-final', 1, /fewer than t timely verified/]);
  }
  for (const action of ['abort', 'cancel', 'invalidate', 'audit-close']) {
    const b = structuredClone(complete), body = { proto: PROTO_ID, type: 'control', action };
    b.log.push({ seq: b.log.length + 1, entry: sign(body) });
    cases.push([`terminal ${action}`, b, 'election-close', 1, /terminal control is present/]);
  }
  try {
    for (const [name, b, kind, expected, message] of cases) {
      await t.test(name, async () => {
        const path = join(dir, name.replaceAll(' ', '-') + '.qvb'), out = path + '.json';
        writeFileSync(path, authenticatedArchive(sim, seed, b));
        assert.doesNotThrow(() => prepareElectionArchive(path, complete.manifest_hash!), 'outer authentication must succeed');
        const result = await qv(['election', 'draft-record', path, '--manifest-hash', complete.manifest_hash!, '--kind', kind, '--out', out]);
        assert.equal(result.code, expected, result.err);
        assert.equal(existsSync(out), expected === 0, 'rejected history must leave no output');
        if (message) assert.match(result.err, message);
      });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
