// SPDX-License-Identifier: AGPL-3.0-or-later
// Genuine protocol records and canonical board headers share one exact tree for status and inclusion fixtures.
import { b64, b64u, decodeHeader, signPromise } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { CONTROL_ENTRY, type ElectionBundle } from '@quietvote/protocol';
import { buildBoard, isoSec, typeAndAuthor, witnessKeys, type Head } from '../../../protocol/test/helpers/board.ts';
import { bundleOf, castBallot, closeElection, defaultContests, kp, publishTally, setup, type Sim } from '../../../protocol/test/helpers/sim.ts';
import type { FetchLike } from '../../src/api/client.ts';
import type { ReceiptFile } from '../../src/flow/receipt.ts';
import { FakeBoard } from './fake-board.ts';

export async function standingFixture(seed = 'web-checked-receipt-standing', maxPerVoter = 8) {
  const witness = witnessKeys(seed)[0]!;
  const sim = await setup({ seed, n: 2, t: 2, voters: 3, maxPerVoter, minCounted: 3, contests: defaultContests().filter((c) => c.id === 'budget'),
    boundLog: true, witnessQuorum: 1, witnesses: [{ name: 'w1', pk: bytesToHex(witness.publicKey) }] });
  const cast = (voter: number, yes = true) => {
    const ballot = castBallot(sim, voter, { budget: [yes ? 'yes' : 'no'] });
    return { seq: sim.log.at(-1)!.seq, code: bytesToHex(ballot.built.code) };
  };
  const old = cast(0), other = cast(1); cast(2, false);
  const middle = cast(0, false), latest = cast(0);
  closeElection(sim); publishTally(sim, [1, 2]);
  return { sim, election: bundleOf(sim), old, middle, latest, other };
}

export function standingHeads(sim: Sim, election: ElectionBundle): Head[] {
  const seed = sim.manifest.title.replace('Test election ', ''), witness = witnessKeys(seed)[0]!;
  const cosigs = (ts: number) => [{ name: 'w1', key: witness, ts }];
  const size = election.log.at(-1)!.seq + 1;
  const out: Head[] = [{ size: sim.openSeq!, cosigs: cosigs(isoSec(sim.manifest.voting_open) - 3600) }];
  if (sim.closeSeq !== undefined && size > sim.closeSeq) {
    out.push({ size: sim.closeSeq, cosigs: cosigs(isoSec(sim.manifest.voting_open) + 3600) });
    if (size > sim.closeSeq + 1) out.push({ size: sim.closeSeq + 1, cosigs: cosigs(isoSec(sim.manifest.voting_close) + 60) });
    out.push({ size, cosigs: cosigs(isoSec(sim.manifest.voting_close) + 120) });
  } else out.push({ size, cosigs: cosigs(isoSec(sim.manifest.voting_open) + 3600) });
  return out;
}

export function standingBoard(sim: Sim, election: ElectionBundle, heads = standingHeads(sim, election)) {
  const seed = sim.manifest.title.replace('Test election ', '');
  const view = buildBoard(sim, election, heads, { logKey: kp(seed, 'log'), author: (record, manifest) => {
    const body = record['body'] as { type?: string; action?: string };
    return body.type === 'control' ? [CONTROL_ENTRY[body.action!]!, sim.coord[0]!] : typeAndAuthor(sim, record, manifest);
  } });
  const head = { size: view.tree.size, note: view.notes.get(view.tree.size)! };
  return { view, head, text: JSON.stringify({ ...election, board: view.json }) };
}

export function standingApi(sim: Sim, election: ElectionBundle, evidence = standingBoard(sim, election)) {
  const { view, head } = evidence;
  const apiId = view.origin.slice('quietvote/v1/'.length), base = `/api/v1/elections/${apiId}`;
  const fallback = new FakeBoard(sim, apiId); fallback.closed = election.log.some((r) => (r.entry as { body?: { name?: string } }).body?.name === 'election-close');
  const entries = view.bundle.entries.map((entry) => {
    const header = decodeHeader(entry.headerBytes); if (!header.ok || entry.body === null) throw new Error('invalid fixture');
    return { seq: entry.seq, type: header.value.type, header_b64u: b64u(entry.headerBytes), body_b64u: b64u(entry.body), leaf_hash: b64u(view.tree.leafHash(entry.seq)!) };
  });
  const requests: { path: string; method: string }[] = [];
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input, 'http://board.test'), path = url.pathname;
    requests.push({ path: path + url.search, method: init?.method ?? 'GET' });
    if (path === `${base}/export.json`) return new Response(evidence.text, { headers: { 'Content-Type': 'application/json' } });
    if (path === `${base}/log/entries`) {
      const from = Number(url.searchParams.get('from') ?? 0), limit = Number(url.searchParams.get('limit') ?? 1000), end = Math.min(entries.length, from + limit);
      return json({ entries: entries.slice(from, end), from, next_from: end < entries.length ? end : null, tree_size: entries.length });
    }
    if (path.startsWith(`${base}/log/entries/`)) return json(entries[Number(path.split('/').at(-1))]);
    if (path === `${base}/log/checkpoint`) return new Response(head.note);
    if (path === `${base}/log/proof/inclusion`) {
      const seq = Number(url.searchParams.get('seq')), size = Number(url.searchParams.get('tree_size') ?? head.size);
      return json({ seq, leaf_hash: entries[seq]!.leaf_hash, tree_size: size, path: view.tree.inclusionProof(seq, size).map(b64) });
    }
    if (path === `${base}/log/proof/consistency`) {
      const old = Number(url.searchParams.get('old')), size = Number(url.searchParams.get('new') ?? head.size);
      return json({ old_size: old, new_size: size, path: view.tree.consistencyProof(old, size).map(b64) });
    }
    return fallback.fetch(input, init);
  };
  const receiptFile = (ballot: { seq: number; code: string }): ReceiptFile => {
    const leaf = view.tree.leafHash(ballot.seq)!;
    const promise = signPromise(view.logKey.secretKey, view.origin, ballot.seq, leaf, 1_790_000_000);
    return { format: 'qv-receipt/1', election: apiId, manifest_hash: election.manifest_hash, ballot_code: ballot.code, seq: ballot.seq,
      leaf_hash: b64u(leaf), client_build: 'standing-fixture', receipt: { origin: view.origin, seq: ballot.seq, leaf_hash: b64u(leaf),
        promise: { sequenced_at: promise.sequencedAt, checkpoint_deadline: promise.checkpointDeadline }, promise_sig: b64u(promise.promiseSig),
        inclusion: { seq: ballot.seq, leaf_hash: b64u(leaf), tree_size: head.size, path: view.tree.inclusionProof(ballot.seq).map(b64), checkpoint_note: head.note } } };
  };
  return { ...evidence, fetch, requests, apiId, entries, receiptFile };
}
