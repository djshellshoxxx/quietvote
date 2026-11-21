// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { b64, buildEntry, decodeHeader, encodeHeader, hashLeaf, MerkleTree, signCheckpoint } from '@quietvote/board';
import { bytesToHex, ed25519Keypair, ed25519Sign, jcs, type Ed25519Keypair } from '@quietvote/crypto';
import { ballotCode, castDigest, NO_SUPERSEDES, PROTO_ID, spoilDigest, type BallotBody } from '@quietvote/protocol';
import { ApiClient, type FetchLike } from '../src/api/client.ts';
import type { EntryView } from '../src/api/types.ts';
import { checkBallotCodeEntry, findBallotCode, lookupBallotCode, matchBallotCode, parseBallotCodeInput } from '../src/flow/receipt-code.ts';
import { BoardIntegrityError } from '../src/flow/receipt.ts';
import { ballotCodeDisplay, crockfordEncode } from '../src/util/crockford.ts';
import { b64uDecode, b64uEncode } from '../src/util/hex.ts';

const ctx = new Uint8Array(32).fill(3);
const origin = 'quietvote/v1/' + 'a'.repeat(26);
const logKey = ed25519Keypair(new Uint8Array(32).fill(9));
const voter = (i: number): Ed25519Keypair => ed25519Keypair(new Uint8Array(32).fill(i));
function record(key = voter(1), context = ctx) {
  const body: BallotBody = { proto: PROTO_ID, type: 'ballot', ctx: bytesToHex(context), voter: bytesToHex(key.publicKey), supersedes: NO_SUPERSEDES, contests: [] };
  const code = ballotCode(context, body);
  return { record: { intent: 'cast' as const, body, sig: bytesToHex(ed25519Sign(key.secretKey, castDigest(context, code))) }, code };
}

function fixture() {
  const tree = new MerkleTree();
  const rows: EntryView[] = [];
  const codes: Uint8Array[] = [];
  for (let i = 1; i <= 2; i++) {
    const key = voter(i);
    const r = record(key);
    const e = buildEntry({ origin, type: 'ballot', secretKey: key.secretKey, publicKey: key.publicKey, nonce: new Uint8Array(16).fill(i), createdAt: 123, body: jcs(r.record) });
    tree.appendLeafHash(e.leafHash);
    rows.push({ seq: i - 1, type: 'ballot', leaf_hash: b64uEncode(e.leafHash), header_b64u: b64uEncode(e.headerBytes), body_b64u: b64uEncode(e.body) });
    codes.push(r.code);
  }
  const note = (size = 2, logOrigin = origin): string => signCheckpoint(logOrigin, size, tree.root(size), logKey.secretKey, logKey.publicKey);
  const calls: string[] = [];
  const fetch: FetchLike = async (input) => {
    calls.push(input);
    const u = new URL(input, 'http://board');
    const json = (o: unknown): Response => new Response(JSON.stringify(o));
    if (u.pathname.endsWith('/log/entries')) return json({ entries: rows, from: 0, next_from: null, tree_size: tree.size });
    if (/\/log\/entries\/\d+$/.test(u.pathname)) return json(rows[Number(u.pathname.split('/').at(-1))]);
    if (u.pathname.endsWith('/log/checkpoint')) return new Response(note());
    if (u.pathname.endsWith('/log/proof/inclusion')) {
      const seq = Number(u.searchParams.get('seq'));
      return json({ seq, leaf_hash: rows[seq]!.leaf_hash, tree_size: tree.size, path: tree.inclusionProof(seq).map(b64) });
    }
    if (u.pathname.endsWith('/log/proof/consistency')) return json({ old_size: 1, new_size: 2, path: tree.consistencyProof(1, 2).map(b64) });
    throw new Error(`unexpected request ${input}`);
  };
  const args = { input: bytesToHex(codes[1]!), api: new ApiClient({ fetch }), apiElectionId: 'a'.repeat(26), ctx, logPk: logKey.publicKey, expectedOrigin: origin,
    pinned: { electionId: 'a'.repeat(26), size: 1, note: note(1) } };
  return { args, rows, codes, fetch, calls, note };
}

// @verifies QV-10-REQ-010
test('ballot code accepts full hex, full Crockford and exactly seven displayed groups', () => {
  const { code } = record();
  const hex = bytesToHex(code);
  assert.deepEqual(parseBallotCodeInput(hex.toUpperCase()), { kind: 'hex', value: hex });
  assert.deepEqual(parseBallotCodeInput(ballotCodeDisplay(code).toLowerCase()), { kind: 'hex', value: hex });
  assert.deepEqual(parseBallotCodeInput(ballotCodeDisplay(code, true)), { kind: 'prefix', value: crockfordEncode(code).slice(0, 28) });
  for (const bad of ['', 'garbage', 'A'.repeat(27), 'A'.repeat(29), 'A'.repeat(51), 'A'.repeat(53), '0'.repeat(51) + '1', 'A'.repeat(257)]) {
    assert.equal(parseBallotCodeInput(bad), undefined, bad);
  }
});

test('prefix matches refuse ambiguity; full codes distinguish the entries', () => {
  const candidates = [{ seq: 1, code: '00'.repeat(31) + '01' }, { seq: 2, code: '00'.repeat(31) + '02' }];
  assert.deepEqual(matchBallotCode('0'.repeat(28), candidates), { state: 'ambiguous' });
  assert.deepEqual(matchBallotCode(candidates[1]!.code, candidates), { state: 'matched', match: candidates[1] });
});

test('record search recomputes codes and requires cast signature and the selected context', () => {
  const r = record();
  const query = bytesToHex(r.code);
  assert.equal(findBallotCode(query, [{ seq: 2, record: r.record }], ctx).state, 'matched');
  const spoil = { ...r.record, intent: 'spoil', reveal_digest: '00'.repeat(32), sig: bytesToHex(ed25519Sign(voter(1).secretKey, spoilDigest(ctx, r.code, new Uint8Array(32)))) };
  const otherContext = record(voter(1), new Uint8Array(32).fill(4));
  for (const invalid of [null, { ...r.record, sig: '00'.repeat(64) }, spoil, otherContext.record, { ...r.record, body: {} }]) {
    assert.equal(findBallotCode(query, [{ seq: 2, record: invalid }], ctx).state, 'not-found');
  }
  assert.equal(findBallotCode(bytesToHex(otherContext.code), [{ seq: 2, record: otherContext.record }], ctx).state, 'not-found');
  assert.equal(findBallotCode('invalid', [], ctx).state, 'invalid-code');
});

test('code lookup verifies the exact signed header/body, inclusion and pinned consistency without a voting key', async () => {
  for (const format of ['hex', 'full', 'short']) {
    const f = fixture();
    const input = format === 'hex' ? f.args.input : ballotCodeDisplay(f.codes[1]!, format === 'short');
    const result = await lookupBallotCode({ ...f.args, input });
    assert.equal(result.state, 'included');
    if (result.state === 'included') {
      assert.equal(result.seq, 1);
      assert.equal(result.code, bytesToHex(f.codes[1]!));
      assert.equal(result.treeSize, 2);
    }
    assert.ok(f.calls.some((p) => p.endsWith('/log/entries/1')));
    assert.ok(f.calls.some((p) => p.includes('/log/proof/consistency')));
    assert.ok(f.calls.every((p) => !p.includes(input)), 'typed codes are matched locally, not sent as search requests');
  }
});

test('malformed and missing codes never request a candidate inclusion proof', async () => {
  const f = fixture();
  assert.equal((await lookupBallotCode({ ...f.args, input: 'bad' })).state, 'invalid-code');
  assert.deepEqual(f.calls, []);
  assert.equal((await lookupBallotCode({ ...f.args, input: '00'.repeat(32) })).state, 'not-found');
  assert.equal(f.calls.length, 1);
});

test('saved receipt metadata binds code, entry number and leaf before reporting inclusion', async () => {
  const f = fixture();
  const valid = { ...f.args, seq: 1, code: bytesToHex(f.codes[1]!), expectedLeaf: b64uDecode(f.rows[1]!.leaf_hash)! };
  assert.equal((await checkBallotCodeEntry(valid)).state, 'included');
  for (const patch of [{ code: bytesToHex(f.codes[0]!) }, { seq: 0 }, { expectedLeaf: b64uDecode(f.rows[0]!.leaf_hash)! }]) {
    await assert.rejects(checkBallotCodeEntry({ ...valid, ...patch }), BoardIntegrityError);
  }
});

test('forged fetched entries cannot borrow a matching code or a real Merkle proof', async () => {
  const changes: ((row: EntryView, rows: EntryView[]) => EntryView)[] = [
    () => null as unknown as EntryView,
    (row) => ({ ...row, header_b64u: '!' }),
    (row) => ({ ...row, seq: 0 }),
    (row, rows) => ({ ...row, header_b64u: rows[0]!.header_b64u, leaf_hash: rows[0]!.leaf_hash }),
    (row, rows) => ({ ...row, body_b64u: rows[0]!.body_b64u }),
    (row) => ({ ...row, body_b64u: null }),
    (row) => ({ ...row, leaf_hash: b64uEncode(new Uint8Array(32)) }),
    (row) => {
      const decoded = decodeHeader(b64uDecode(row.header_b64u)!);
      assert.ok(decoded.ok);
      const header = encodeHeader({ ...decoded.value, sig: new Uint8Array(64) });
      return { ...row, header_b64u: b64uEncode(header), leaf_hash: b64uEncode(hashLeaf(header)) };
    },
    (row) => {
      const key = voter(2);
      const built = buildEntry({ origin: 'quietvote/v1/' + 'b'.repeat(26), type: 'ballot', secretKey: key.secretKey, publicKey: key.publicKey,
        nonce: new Uint8Array(16), createdAt: 123, body: b64uDecode(row.body_b64u!)! });
      return { ...row, header_b64u: b64uEncode(built.headerBytes), leaf_hash: b64uEncode(built.leafHash) };
    },
  ];
  for (const change of changes) {
    const f = fixture();
    const api = new ApiClient({ fetch: async (input, init) => {
      if (input.endsWith('/log/entries/1')) return new Response(JSON.stringify(change(f.rows[1]!, f.rows)));
      return f.fetch(input, init);
    } });
    await assert.rejects(lookupBallotCode({ ...f.args, api }), BoardIntegrityError);
    assert.ok(!f.calls.some((p) => p.includes('/log/proof/inclusion')));
  }
});

test('another signed log origin, broken inclusion and broken consistency refuse inclusion', async () => {
  for (const attack of ['origin', 'inclusion', 'consistency']) {
    const f = fixture();
    const api = new ApiClient({ fetch: async (input, init) => {
      if (attack === 'origin' && input.endsWith('/log/checkpoint')) return new Response(f.note(2, 'quietvote/v1/other'));
      const response = await f.fetch(input, init);
      if (input.includes(`/log/proof/${attack}`)) return new Response(JSON.stringify({ ...await response.json(), path: [b64(new Uint8Array(32))] }));
      return response;
    } });
    await assert.rejects(lookupBallotCode({ ...f.args, api }), BoardIntegrityError, attack);
  }
});
