// Copied from packages/protocol/test/helpers/sim.ts (test-only). Imports the protocol package instead of its src.
import {
  baseMul, bytesToHex, ed25519Keypair, encryptShare, h256, hexToBytes, pointToBytes, polyEval, scalarRandomNonZero,
  sha256, streamRng, utf8, type Ed25519Keypair, type Rng, type Scalar,
} from '@quietvote/crypto';
import {
  PROTO_ID, electionOpenBody, adjudicateDkg, analyzeBallotLog, buildBallot, buildTally, checkDealing, dkgDeal, dkgFinalShare, dkgKeyconf,
  dkgMakeComplaint, dkgMakeShares, dkgReceiveShare, makeCast, makeSpoil, manifestHash, mth, rollLeaf, rollRoot,
  signRecord, signRecordRaw, trusteeDecryptSpoiled, expectedLogId, logOrigin, trusteeDecryptTally, NO_SUPERSEDES,
  type BuiltBallot, type CastEnvelope, type DealerSecret, type DkgOutcome, type ElectionBundle, type ElectionParams,
  type LogEntry, type Manifest, type ManifestContest, type MarkerBody, type ParsedDealing, type Selections, type ShareSet,
  type SpoilEnvelope, type SpoilMode, type TrusteeKey,
} from '@quietvote/protocol';

const H = bytesToHex;
void mth; void rollLeaf; void h256;

export interface Faults {
  /** dealer -> recipient: encrypt a wrong share */
  badShare?: [number, number][];
  /** [accuser, accused]: complain although the share is fine */
  falseComplaint?: [number, number][];
  /** dealers that publish no shares package */
  noShares?: number[];
  /** dealers that never reveal */
  noDealing?: number[];
  /** dealers that publish a dealing late (after r1-close) */
  lateDealing?: number[];
}

export interface SimOpts {
  seed: string;
  n: number;
  t: number;
  voters: number;
  contests?: ManifestContest[];
  faults?: Faults | undefined;
  maxPerVoter?: number;
  maxSpoils?: number;
  minCounted?: number;
  spoilTrustees?: boolean;
  quorum?: Manifest['quorum'];
  /** Board-bound manifest (log-layer tests): log_id = H(origin), witness quorum and keys. Defaults keep existing vectors unchanged. */
  boundLog?: boolean;
  witnessQuorum?: number;
  witnesses?: { name: string; pk: string }[];
}

export function defaultContests(): ManifestContest[] {
  const opts = (...ids: string[]): { id: string; label: string }[] => ids.map((id) => ({ id, label: id.toUpperCase() }));
  return [
    {
      id: 'budget', title: 'Adopt the budget?', method: 'yes-no', options: opts('yes', 'no'), selection_limit: 1, min_selections: 0,
      rule: { type: 'threshold', num: 1, den: 2, basis: 'yes+no', strict: true }, tie_break: { type: 'status-quo', option: 'no' },
    },
    { id: 'chair', title: 'Chair', method: 'single-choice', options: opts('ann', 'bob', 'cy'), selection_limit: 1, min_selections: 0, tie_break: { type: 'lexicographic' } },
    { id: 'topics', title: 'Topics', method: 'approval', options: opts('a', 'b', 'c', 'd'), min_selections: 0, winners: 2, tie_break: { type: 'declare-tie' } },
    { id: 'board', title: 'Board', method: 'k-of-n', options: opts('p', 'q', 'r', 's', 't'), selection_limit: 2, min_selections: 0, tie_break: { type: 'lexicographic' } },
  ];
}

export const kp = (seed: string, label: string): Ed25519Keypair => ed25519Keypair(sha256(utf8(`${seed}/${label}`)));

export interface Sim {
  rng: Rng;
  manifest: Manifest;
  mh: Uint8Array;
  coord: Ed25519Keypair[];
  trusteeKeys: Ed25519Keypair[];
  voters: Ed25519Keypair[];
  rollHex: string[];
  log: LogEntry[];
  seq: number;
  outcome?: DkgOutcome;
  shares: Map<number, Scalar>;
  params?: ElectionParams;
  openSeq?: number;
  closeSeq?: number;
  lastCode: Map<string, string>;
  built: BuiltBallot[];
}

export function buildManifest(o: SimOpts, coord: Ed25519Keypair[], tk: Ed25519Keypair[], rollSize: number, rollRootHex: string): Manifest {
  const m: Manifest = {
    proto: PROTO_ID, type: 'manifest', election_id: H(sha256(utf8(o.seed)).slice(0, 16)), title: `Test election ${o.seed}`,
    created: '2026-10-21T12:00:00Z', voting_open: '2026-11-01T09:00:00Z', voting_close: '2026-11-08T21:00:00Z', clock_skew_s: 300,
    contests: o.contests ?? defaultContests(),
    roll: { scheme: 'ed25519-roll-v1', weights: 'uniform', root: rollRootHex, size: rollSize },
    trustees: tk.map((k, i) => ({ index: i + 1, name: `T${i + 1}`, sign_pk: H(k.publicKey) })),
    n: o.n, t: o.t, coordinator: { keys: coord.map((k) => H(k.publicKey)), m: 1 },
    ballots: { max_per_voter: o.maxPerVoter ?? 8, max_spoils_per_voter: o.maxSpoils ?? 16 },
    bb: { log_id: H(sha256(utf8('log'))), log_pk: H(kp(o.seed, 'log').publicKey), witness_quorum: 0 },
    privacy_ack: true,
  };
  if (o.quorum !== undefined) m.quorum = o.quorum;
  if (o.minCounted !== undefined) m.min_counted_ballots = o.minCounted;
  if (o.spoilTrustees === true) m.spoil_trustee_decrypt = true;
  if (o.witnessQuorum !== undefined) m.bb.witness_quorum = o.witnessQuorum;
  if (o.witnesses !== undefined) m.bb.witnesses = o.witnesses;
  if (o.boundLog === true) m.bb.log_id = expectedLogId(logOrigin(m));
  return m;
}

export function multiSign<B extends { type: string }>(sim: Sim, scope: Uint8Array, body: B): { body: B; sigs: { key: string; sig: string }[] } {
  const c = sim.coord[0]!;
  return { body, sigs: [signRecordRaw(c.secretKey, c.publicKey, scope, body.type, body)] };
}

export function push(sim: Sim, entry: unknown): number {
  sim.seq += 1;
  sim.log.push({ seq: sim.seq, entry });
  return sim.seq;
}

export function marker(sim: Sim, name: MarkerBody['name'], scope: Uint8Array, extra: { qmask?: number; K?: string } = {}): number {
  const body: MarkerBody = { proto: PROTO_ID, type: 'marker', name, ...extra };
  return push(sim, multiSign(sim, scope, body));
}

export async function setup(o: SimOpts): Promise<Sim> {
  const rng = streamRng(o.seed);
  const coord = [kp(o.seed, 'coord')];
  const tk = Array.from({ length: o.n }, (_, i) => kp(o.seed, `trustee${i + 1}`));
  const voters = Array.from({ length: o.voters }, (_, i) => kp(o.seed, `voter${i}`)).sort((a, b) => (H(a.publicKey) < H(b.publicKey) ? -1 : 1));
  const rollHex = voters.map((v) => H(v.publicKey));
  const rr = rollRoot(rollHex);
  if (!rr.ok) throw new Error('roll');
  const manifest = buildManifest(o, coord, tk, rollHex.length, H(rr.value));
  const sim: Sim = {
    rng, manifest, mh: manifestHash(manifest), coord, trusteeKeys: tk, voters, rollHex, log: [], seq: 0, shares: new Map(),
    lastCode: new Map(), built: [],
  };
  await runDkg(sim, o.faults ?? {});
  return sim;
}

async function runDkg(sim: Sim, f: Faults): Promise<void> {
  const { manifest: m, mh, rng } = sim;
  const sign = <B extends { type: string }>(i: number, body: B): unknown => signRecord(sim.trusteeKeys[i - 1]!.secretKey, sim.trusteeKeys[i - 1]!.publicKey, mh, body);
  marker(sim, 'dkg-open', mh);
  const secrets = new Map<number, DealerSecret>();
  const dealings = new Map<number, ReturnType<typeof dkgDeal>>();
  for (let i = 1; i <= m.n; i++) {
    const d = dkgDeal(mh, i, m.t, rng);
    secrets.set(i, d.secret);
    dealings.set(i, d);
    push(sim, sign(i, d.commit));
  }
  marker(sim, 'dkg-r1-open', mh);
  for (let i = 1; i <= m.n; i++) if (!(f.noDealing ?? []).includes(i) && !(f.lateDealing ?? []).includes(i)) push(sim, sign(i, dealings.get(i)!.body));
  marker(sim, 'dkg-r1-close', mh);
  for (const i of f.lateDealing ?? []) push(sim, sign(i, dealings.get(i)!.body));
  // R1 as every trustee computes it from the log
  const parsed = new Map<number, ParsedDealing>();
  for (const e of sim.log) {
    const b = (e.entry as { body?: { type?: string; i?: number } }).body;
    if (b?.type === 'dkg-dealing' && e.seq < sim.seq - (f.lateDealing ?? []).length) {
      const r = checkDealing(mh, m.t, b as never);
      if (r.ok) parsed.set(r.value.i, r.value);
    }
  }
  const sharePkgs = new Map<number, Awaited<ReturnType<typeof dkgMakeShares>>>();
  for (const i of [...parsed.keys()]) {
    if ((f.noShares ?? []).includes(i)) continue;
    const pkg = await dkgMakeShares(mh, secrets.get(i)!, parsed, rng);
    for (const [di, dj] of f.badShare ?? []) {
      if (di !== i) continue;
      const wrong = await encryptShare(mh, i, dj, parsed.get(dj)!.E, scalarRandomNonZero(rng), rng);
      const idx = pkg.shares.findIndex((s) => s.j === dj);
      pkg.shares[idx] = { j: dj, R: H(wrong.R), ct: H(wrong.ct), tag: H(wrong.tag) };
    }
    sharePkgs.set(i, pkg);
    push(sim, sign(i, pkg));
  }
  marker(sim, 'dkg-r2-close', mh);
  const received = new Map<number, Map<number, Scalar>>();
  for (const j of parsed.keys()) {
    const mine = new Map<number, Scalar>();
    mine.set(j, polyEval(secrets.get(j)!.coeffs, j));
    received.set(j, mine);
    for (const [i, pkg] of sharePkgs) {
      if (i === j) continue;
      const ent = pkg.shares.find((s) => s.j === j);
      if (ent === undefined) continue;
      const r = await dkgReceiveShare(mh, j, secrets.get(j)!.e, parsed.get(i)!, ent);
      const falseC = (f.falseComplaint ?? []).some(([a, b]) => a === j && b === i);
      if (r.ok) mine.set(i, r.y);
      if (!r.ok || falseC) {
        push(sim, sign(j, dkgMakeComplaint(mh, j, secrets.get(j)!.e, parsed.get(j)!.E, i, ent, rng)));
      }
    }
  }
  marker(sim, 'dkg-r3-close', mh);
  // adjudicate exactly as a verifier does
  const take = <T extends { type?: string }>(type: string): { seq: number; body: T }[] =>
    sim.log.filter((e) => (e.entry as { body?: T }).body?.type === type).map((e) => ({ seq: e.seq, body: (e.entry as { body: T }).body }));
  const mk: Record<string, number> = {};
  for (const e of sim.log) {
    const b = (e.entry as { body?: MarkerBody }).body;
    if (b?.type === 'marker') mk[b.name] = e.seq;
  }
  mk['dkg-final'] = sim.seq + 10; // provisional: keyconfs are published before dkg-final
  const adj = await adjudicateDkg({
    mh, n: m.n, t: m.t, markers: mk as never, commits: take('dkg-commit') as never, dealings: take('dkg-dealing') as never,
    shares: take('dkg-shares') as never, complaints: take('dkg-complaint') as never,
  });
  if (!adj.ok) throw new Error(`sim dkg failed: ${adj.error} ${adj.detail ?? ''}`);
  sim.outcome = adj.value;
  const { Q, ctx, Y } = adj.value;
  for (const j of Q) {
    const r = dkgFinalShare(Q, received.get(j)!, Y.get(j)!);
    if (!r.ok) throw new Error(`share of ${j}: ${r.error}`);
    sim.shares.set(j, r.value);
    push(sim, sign(j, dkgKeyconf(ctx, j, Y.get(j)!, r.value, rng)));
  }
  marker(sim, 'dkg-final', mh, { qmask: adj.value.qmask, K: H(pointToBytes(adj.value.K)) });
  sim.params = { manifest: m, mh, K: adj.value.K, ctx };
  // QV-ADR-015: roll_commit precedes election_open; election-open binds (manifest_hash, joint_key_seq, roll_commit_seq)
  const rootR = rollRoot(sim.rollHex);
  if (!rootR.ok) throw new Error('roll');
  const jointKeySeq = sim.seq; // dkg-final marker just pushed
  const rollCommitSeq = push(sim, multiSign(sim, mh, { proto: PROTO_ID, type: 'roll-commit', root: H(rootR.value), size: sim.rollHex.length }));
  sim.openSeq = push(sim, multiSign(sim, ctx, electionOpenBody(PROTO_ID, H(mh), jointKeySeq, rollCommitSeq)));
}

export function voterEnvelopes(sim: Sim): { seq: number; raw: unknown }[] {
  return sim.log.filter((e) => 'intent' in (e.entry as object)).map((e) => ({ seq: e.seq, raw: e.entry }));
}

export function castBallot(sim: Sim, voterIdx: number, sel: Selections, opts: { supersedes?: string; attempt?: number } = {}): { env: CastEnvelope; built: BuiltBallot } {
  const v = sim.voters[voterIdx]!;
  const vh = H(v.publicKey);
  const sup = opts.supersedes ?? sim.lastCode.get(vh) ?? NO_SUPERSEDES;
  const r = buildBallot(sim.params!, v.secretKey, v.publicKey, sup, sel, sim.rng, opts.attempt ?? 0);
  if (!r.ok) throw new Error(`build: ${r.error} ${r.detail ?? ''}`);
  const env = makeCast(sim.params!, v.secretKey, r.value);
  push(sim, env);
  sim.built.push(r.value);
  sim.lastCode.set(vh, H(r.value.code));
  return { env, built: r.value };
}

export function spoilBallot(sim: Sim, voterIdx: number, sel: Selections, mode: SpoilMode): { env: SpoilEnvelope; built: BuiltBallot } {
  const v = sim.voters[voterIdx]!;
  const vh = H(v.publicKey);
  const r = buildBallot(sim.params!, v.secretKey, v.publicKey, sim.lastCode.get(vh) ?? NO_SUPERSEDES, sel, sim.rng, 0);
  if (!r.ok) throw new Error('build');
  const env = makeSpoil(sim.params!, v.secretKey, r.value, mode);
  push(sim, env);
  sim.built.push(r.value);
  return { env, built: r.value };
}

export function closeElection(sim: Sim): number {
  sim.closeSeq = marker(sim, 'election-close', sim.params!.ctx);
  return sim.closeSeq;
}

export function trusteeKeyFor(sim: Sim, j: number): TrusteeKey {
  return { j, sj: sim.shares.get(j)!, Yj: sim.outcome!.Y.get(j)! };
}

/** Coordinator + trustees: produce and publish the tally record using only trustees in `subset`. */
export function publishTally(sim: Sim, subset: number[], opts: { spoilTrustees?: boolean } = {}): { counts: Map<string, Map<string, number>> } {
  const p = sim.params!;
  const roll = new Set(sim.rollHex);
  const an = analyzeBallotLog(p, roll, voterEnvelopes(sim), sim.openSeq!, sim.closeSeq!);
  const shares = new Map<number, ShareSet>();
  for (const j of subset) {
    const r = trusteeDecryptTally(p, trusteeKeyFor(sim, j), an.counted, undefined, sim.rollHex.length, sim.rng);
    if (!r.ok) throw new Error(`trustee ${j}: ${r.error}`);
    shares.set(j, r.value);
  }
  const spoiled: Parameters<typeof buildTally>[1]['spoiled'] = [];
  for (const rec of an.spoiled.values()) {
    if (rec.env.reveal !== undefined) spoiled.push({ rec, mode: 'reveal', selections: rec.env.reveal.selections });
    else if (opts.spoilTrustees === true && rec.env.reveal_digest === '00'.repeat(32)) {
      const sets = new Map<number, ShareSet>();
      for (const j of subset) {
        const r = trusteeDecryptSpoiled(p, trusteeKeyFor(sim, j), rec, sim.rng);
        if (!r.ok) throw new Error(r.error);
        sets.set(j, r.value);
      }
      // the coordinator decodes selections itself via the verifier-side routine
      spoiled.push({ rec, mode: 'trustees', selections: spoilSelectionsOf(sim, rec), shares: sets });
    }
  }
  const t = buildTally(p, { analysis: an, shares, Y: sim.outcome!.Y, decrypters: new Set(sim.outcome!.Q), rollSize: sim.rollHex.length, spoiled });
  if (!t.ok) throw new Error(`tally: ${t.error} ${t.detail ?? ''}`);
  const c = sim.coord[0]!;
  push(sim, signRecord(c.secretKey, c.publicKey, p.ctx, t.value.body));
  return { counts: t.value.counts };
}

function spoilSelectionsOf(sim: Sim, rec: { env: SpoilEnvelope }): Record<string, string[]> {
  // test helper: the plaintext is known to the sim from the builder list
  const b = sim.built.find((x) => H(x.xi) !== '' && JSON.stringify(x.body) === JSON.stringify(rec.env.body));
  return b === undefined ? {} : b.selections;
}

export function bundleOf(sim: Sim): ElectionBundle {
  return {
    manifest: { body: sim.manifest, sigs: [signRecordRaw(sim.coord[0]!.secretKey, sim.coord[0]!.publicKey, sim.mh, 'manifest', sim.manifest)] },
    manifest_hash: H(sim.mh),
    roll: sim.rollHex,
    log: sim.log,
  };
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
void baseMul; void hexToBytes;
