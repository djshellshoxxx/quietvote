// @verifies QV-04-REQ-007/008, QV-02-REQ-041 — seeded HTTP admission against an independent voter-head model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorKeyId, b64u, hashLeaf, parseCheckpoint, toHex, unb64, unb64u, verifyLog, verifyReceipt, type Receipt } from '@quietvote/board';
import { bytesToHex, hexToBytes, sha256, streamRng, utf8, type Ed25519Keypair, type Rng } from '@quietvote/crypto';
import { buildBallot, makeCast, NO_SUPERSEDES, signRecord, verifyElection, type BuiltBallot, type CastEnvelope, type ElectionParams, type Selections, type TallyBody } from '@quietvote/protocol';
import { logBundle } from '../src/export.ts';
import { World, kp } from './helpers/world.ts';

interface ModelVoter { head: string; casts: number; first: number | null; latest: number | null; selections: Selections }
interface PublicVoter { ballot_count: number; first_seq: number | null; latest_seq: number | null }
interface WireReceipt {
  origin: string; seq: number; leaf_hash: string; promise_sig: string;
  promise: { sequenced_at: number; checkpoint_deadline: number };
  inclusion: { seq: number; leaf_hash: string; tree_size: number; path: string[]; checkpoint_note: string };
}
type Expected =
  | { status: 201; accept: { voter: number; ballot: BuiltBallot; selections: Selections } }
  | { status: 403 | 409 | 422 | 429; code: string; reason?: string };
type Kind = 'cast' | 'non-roll' | 'wrong-ctx' | 'bad-supersedes' | 'duplicate-same' | 'duplicate-other' | 'over-limit';

const choose = (rng: Rng, n: number): number => rng.bytes(1)[0]! % n;
function selections(rng: Rng): Selections {
  return { budget: [choose(rng, 2) ? 'yes' : 'no'], chair: [['ann', 'bob', 'cy'][choose(rng, 3)]!] };
}
function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = choose(rng, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
function built(w: World, params: ElectionParams, key: Ed25519Keypair, head: string, choices: Selections): BuiltBallot {
  const result = buildBallot(params, key.secretKey, key.publicKey, head, choices, w.rng);
  assert.ok(result.ok); return result.value;
}
function checkReceipt(w: World, wire: WireReceipt, header: Uint8Array): void {
  const leaf = unb64u(wire.leaf_hash), sig = unb64u(wire.promise_sig);
  assert.ok(leaf && sig); assert.deepEqual(leaf, hashLeaf(header));
  assert.equal(wire.origin, w.origin); assert.equal(wire.inclusion.seq, wire.seq);
  assert.equal(wire.inclusion.leaf_hash, wire.leaf_hash);
  const path = wire.inclusion.path.map((p) => { const bytes = unb64(p); assert.ok(bytes); return bytes; });
  const receipt: Receipt = {
    origin: wire.origin, seq: wire.seq, leafHash: leaf, promiseSig: sig,
    sequencedAt: wire.promise.sequenced_at, checkpointDeadline: wire.promise.checkpoint_deadline,
    inclusion: { treeSize: wire.inclusion.tree_size, path, checkpointNote: wire.inclusion.checkpoint_note },
  };
  assert.deepEqual(verifyReceipt(receipt, hexToBytes(w.logPkHex, 32)), { ok: true, value: { treeSize: wire.inclusion.tree_size } });
}
async function snapshot(w: World) {
  const cp = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`);
  assert.equal(cp.status, 200); const parsed = parseCheckpoint(cp.text); assert.ok(parsed.ok);
  const voters: PublicVoter[] = [];
  for (const key of w.voters) {
    const kid = b64u(authorKeyId('ed25519', key.publicKey));
    const response = await w.get(`/api/v1/elections/${w.electionId}/voters/${kid}`);
    assert.equal(response.status, 200); voters.push(response.json);
  }
  const rt = (await w.server.pool.get(w.electionId))!;
  return { note: cp.text, size: parsed.value.size, root: parsed.value.root, voters, bodyBytes: rt.edb.totalBodyBytes() };
}
function checkModel(voters: PublicVoter[], model: ModelVoter[], label: string): void {
  for (let i = 0; i < model.length; i++) {
    assert.equal(voters[i]!.ballot_count, model[i]!.casts, `${label}: voter ${i} count`);
    assert.equal(voters[i]!.first_seq, model[i]!.first, `${label}: voter ${i} first`);
    assert.equal(voters[i]!.latest_seq, model[i]!.latest, `${label}: voter ${i} latest`);
  }
}
async function checkFinal(w: World, model: ModelVoter[]): Promise<void> {
  const expected = model.filter((m) => m.casts > 0).map((m) => m.head).sort();
  const analysis = await w.analysis();
  assert.deepEqual(analysis.counted.map((b) => b.code).sort(), expected);
  assert.deepEqual(analysis.findings, [], 'only admitted valid casts enter the board');
  for (const j of [1, 3]) {
    const response = await w.trusteeShares(j); assert.equal(response.status, 201, response.text); w.tick();
  }
  const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
  assert.equal(draft.status, 200, draft.text);
  const body = draft.json.body as TallyBody;
  assert.equal(body.n_counted, expected.length);
  for (const contest of body.contests) for (const option of contest.options) {
    const total = model.filter((m) => m.casts > 0 && m.selections[contest.id]?.includes(option.id)).length;
    assert.equal(option.T, total, `independent final selections for ${contest.id}/${option.id}`);
  }
  const c0 = w.coord[0]!;
  const published = await w.post('tally_result', c0, signRecord(c0.secretKey, c0.publicKey, w.params.ctx, body));
  assert.equal(published.status, 201, published.text);

  const rt = (await w.server.pool.get(w.electionId))!;
  const publicKeys = [w.owner, ...w.coord, ...w.trustees, ...w.voters].map((k) => k.publicKey).concat([rt.srvPk]);
  const keys = new Map(publicKeys.map((key) => [toHex(authorKeyId('ed25519', key)), key]));
  const board = verifyLog(logBundle(rt), {
    logPublicKey: hexToBytes(w.logPkHex, 32), resolveAuthorKey: (h) => keys.get(toHex(h.author)),
    witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] },
  });
  assert.deepEqual(board.failures, []); assert.equal(board.integrity, 'VERIFIED');
  const exported = await w.get(`/api/v1/elections/${w.electionId}/export.json?board=1`);
  assert.equal(exported.status, 200, exported.text);
  const { board: evidence, ...content } = exported.json;
  // The log/server keys come from the fixture, not untrusted export metadata. This fixture's
  // zero witness quorum deliberately leaves standard verification INCOMPLETE; no bypass/PASS.
  const report = await verifyElection(content, { log: { board: evidence, extraAuthorKeys: [bytesToHex(rt.srvPk)] } });
  assert.equal(report.verdict, 'INCOMPLETE', JSON.stringify(report.findings));
  assert.equal(report.checks['chk.board.witness'], 'not_run');
  for (const check of ['chk.manifest.hash', 'chk.manifest.sig', 'chk.keys.trustees', 'chk.board.append_only',
    'chk.ballots.valid', 'chk.ballots.latest', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules'] as const) {
    assert.equal(report.checks[check], 'pass', `${check}: ${JSON.stringify(report.findings)}`);
  }
  assert.deepEqual(report.countedBallots?.map((b) => b.code).sort(), expected);
  assert.equal(report.counts.cast, model.reduce((n, m) => n + m.casts, 0));
  assert.equal(report.counts.counted, expected.length);
}

for (const seed of ['eligibility-property-a', 'eligibility-property-b', 'eligibility-property-c']) {
  test(`seeded HTTP eligibility preserves the independent latest-vote model (${seed})`, { timeout: 180_000 }, async () => {
    const w = new World({ seed, n: 3, t: 2, voters: 4, witnessQuorum: 0, freshConnections: true });
    // As in e2e.test.ts, bind the actual log origin and use the existing coordinator
    // authority for the manifest header; the generic World default does neither.
    w.owner = w.coord[0]!;
    const manifest = w.buildManifest.bind(w);
    w.buildManifest = () => { const m = manifest(); m.bb.log_id = bytesToHex(sha256(utf8(w.origin))); return m; };
    try {
      await w.start(); await w.setupOrgAndElection(); await w.registerVoters();
      assert.equal((await w.publishManifest()).status, 201); await w.ceremony(); assert.equal((await w.open()).status, 201);
      const rng = streamRng(`${seed}/actions`), limit = w.manifest.ballots.max_per_voter;
      const model: ModelVoter[] = w.voters.map(() => ({ head: NO_SUPERSEDES, casts: 0, first: null, latest: null, selections: {} }));

      async function attempt(author: Ed25519Keypair, envelope: CastEnvelope, expected: Expected, label: string): Promise<void> {
        w.tick(); // keep rate limiting separate from the admission rule under test
        const before = await snapshot(w), packet = w.entry('ballot', author, envelope);
        checkModel(before.voters, model, label);
        const response = await w.submit(packet.headerBytes, packet.body);
        assert.equal(response.status, expected.status, `${seed}/${label}: ${response.text}`);
        if (expected.status === 201) {
          checkReceipt(w, response.json.receipt, packet.headerBytes);
          const { voter, ballot, selections: choices } = expected.accept, m = model[voter]!;
          // The expected admission decision and predecessor are chosen before the HTTP response.
          // Neither World.last, runtime casts/last nor analyzeBallotLog supplies the model's state.
          m.head = bytesToHex(ballot.code); m.casts++; m.first ??= response.json.receipt.seq;
          m.latest = response.json.receipt.seq; m.selections = choices;
        } else {
          assert.equal(response.json.code, expected.code, label);
          if (expected.reason !== undefined) assert.equal(response.json.reason, expected.reason, label);
        }
        const after = await snapshot(w); checkModel(after.voters, model, label);
        if (expected.status === 201) assert.equal(after.size, before.size + 1, label);
        else assert.deepEqual(after, before, `${label}: refusal cannot append or change any voter's index`);
      }
      async function cast(voter: number, label: string): Promise<BuiltBallot> {
        const key = w.voters[voter]!, m = model[voter]!, choices = selections(rng);
        const ballot = built(w, w.params, key, m.head, choices);
        const expected: Expected = m.casts < limit
          ? { status: 201, accept: { voter, ballot, selections: choices } }
          : { status: 429, code: 'REVOTE_LIMIT', reason: 'E_REVOTE_LIMIT' };
        await attempt(key, makeCast(w.params, key.secretKey, ballot), expected, label); return ballot;
      }
      const original = await cast(0, 'initial source for duplicate submissions');
      for (let n = 0; n < limit; n++) await cast(1, `known capped voter ${n + 1}`);
      await cast(2, 'initial voter 2'); await cast(3, 'initial voter 3');
      const stranger = kp(seed, 'not-on-roll');
      const otherParams = { ...w.params, ctx: sha256(utf8(`${seed}/other-election`)) };
      const kinds: Kind[] = ['cast', 'cast', 'non-roll', 'wrong-ctx', 'bad-supersedes', 'duplicate-same', 'duplicate-other', 'over-limit'];
      const actions = shuffle(rng, Array.from({ length: 4 }, () => kinds).flat());
      const seen = new Set<Kind>();
      for (const [step, kind] of actions.entries()) {
        seen.add(kind); const label = `${step}/${kind}`, voter = [0, 2, 3][choose(rng, 3)]!, key = w.voters[voter]!;
        if (kind === 'cast') { await cast(voter, label); continue; }
        if (kind === 'non-roll') {
          const ballot = built(w, w.params, stranger, NO_SUPERSEDES, selections(rng));
          await attempt(stranger, makeCast(w.params, stranger.secretKey, ballot), { status: 403, code: 'AUTHOR_NOT_AUTHORIZED' }, label);
        } else if (kind === 'wrong-ctx') {
          const ballot = built(w, otherParams, key, model[voter]!.head, selections(rng));
          await attempt(key, makeCast(otherParams, key.secretKey, ballot), { status: 422, code: 'ENTRY_INVALID', reason: 'E_CTX' }, label);
        } else if (kind === 'bad-supersedes') {
          const ballot = built(w, w.params, key, NO_SUPERSEDES, selections(rng));
          assert.notEqual(model[voter]!.head, NO_SUPERSEDES);
          await attempt(key, makeCast(w.params, key.secretKey, ballot), { status: 422, code: 'ENTRY_INVALID', reason: 'E_SUPERSEDES' }, label);
        } else if (kind === 'duplicate-same' || kind === 'duplicate-other') {
          // ballotCode includes voter and supersedes. A real copied code cannot reach the
          // cross-voter hash-collision guard: author eligibility or the stale edge refuses first.
          const author = kind === 'duplicate-same' ? w.voters[0]! : w.voters[1 + choose(rng, 3)]!;
          const reason = kind === 'duplicate-same' ? 'E_SUPERSEDES' : 'E_VOTER_NOT_ELIGIBLE';
          await attempt(author, makeCast(w.params, w.voters[0]!.secretKey, original), { status: 422, code: 'ENTRY_INVALID', reason }, label);
        } else {
          assert.equal(model[1]!.casts, limit); await cast(1, label);
        }
      }
      assert.equal(seen.size, 7, 'each seed reaches every configured operation kind');

      // Voting-close wall time refuses while the explicit lifecycle is still OPEN.
      w.clock = Date.parse(w.manifest.voting_close);
      const key = w.voters[2]!, late = built(w, w.params, key, model[2]!.head, selections(rng));
      await attempt(key, makeCast(w.params, key.secretKey, late), { status: 409, code: 'WRONG_PHASE' }, 'voting_close elapsed');
      assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'OPEN');
      assert.equal((await w.close()).status, 201);
      for (let i = 0; i < 3; i++) {
        const voter = choose(rng, 4), author = w.voters[voter]!, ballot = built(w, w.params, author, model[voter]!.head, selections(rng));
        await attempt(author, makeCast(w.params, author.secretKey, ballot), { status: 409, code: 'WRONG_PHASE' }, `after close ${i}`);
      }
      await checkFinal(w, model);
    } finally { await w.stop(); }
  });
}
