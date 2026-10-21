import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bytesToHex, ed25519Keypair, encryptShare, hexToBytes, jcs, pointToBytes, scalarRandomNonZero, sha256, streamRng, utf8,
  type Ed25519Keypair, type Point, type Rng,
} from '@quietvote/crypto';
import {
  NO_SUPERSEDES, PROTO_ID, electionOpenBody, adjudicateDkg, buildBallot, dkgDeal, dkgMakeComplaint, dkgMakeShares, expectedLogId, logOrigin, makeCast, makeSpoil, manifestHash, rollRoot,
  signRecord, signRecordRaw,
  type DealerSecret, type DkgOutcome, type LogEntry, type Manifest, type MarkerBody, type MarkerSeqs, type MultiSignedRecord, type ParsedDealing, type Selections, type SpoilMode,
} from '@quietvote/protocol';
import { computeR1, takeDkg, markerSeq } from '../../src/ceremonylog.ts';
import { Trustee, LOG_FORMAT, type Packet } from '../../src/trustee.ts';
import type { VaultDeps } from '../../src/bundle.ts';

const H = bytesToHex;
export const PASS = 'test-passphrase-for-trustee';
export const kp = (seed: string, label: string): Ed25519Keypair => ed25519Keypair(sha256(utf8(`${seed}/${label}`)));

export interface Behaviour {
  /** never takes part at all */
  absent?: boolean;
  /** publishes a second, different commit */
  equivocateCommit?: boolean;
  /** commit hash does not match the later dealing */
  commitMismatch?: boolean;
  /** encrypts a random scalar instead of the real share for these recipients */
  badShareTo?: number[];
  /** complains about these dealers although their shares are fine */
  falseComplaintAgainst?: number[];
  /** reveals nothing (commits only) */
  noReveal?: boolean;
}

export interface Options {
  n: number;
  t: number;
  seed: string;
  voters?: number;
  /** slot -> scripted malicious behaviour (slot is played by the harness, not by a Trustee) */
  malicious?: Record<number, Behaviour>;
  witnessQuorum?: number;
  minCounted?: number;
  /** manifest.spoil_trustee_decrypt (QV-ADR-020) */
  spoilDecrypt?: boolean;
}

export function mkDeps(seed: string): VaultDeps {
  return { rng: streamRng(`deps/${seed}`), now: () => new Date('2026-11-02T18:00:00Z'), logN: 10, allowWeak: true };
}

export class Ceremony {
  readonly dir: string;
  readonly o: Options;
  readonly deps: Map<number, VaultDeps> = new Map();
  readonly coord: Ed25519Keypair;
  readonly signKeys: Ed25519Keypair[] = [];
  readonly voters: Ed25519Keypair[];
  readonly rollHex: string[];
  manifest!: Manifest;
  mrec!: MultiSignedRecord<Manifest>;
  mh!: Uint8Array;
  log: LogEntry[] = [];
  seq = 0;
  ctx?: Uint8Array;
  /** slot -> path of honest bundle */
  readonly paths = new Map<number, string>();
  readonly scripted = new Map<number, Scripted>();
  readonly rng: Rng;

  constructor(o: Options) {
    this.o = o;
    this.dir = mkdtempSync(join(tmpdir(), 'qvt-'));
    this.coord = kp(o.seed, 'coord');
    this.rng = streamRng(`ceremony/${o.seed}`);
    this.voters = Array.from({ length: o.voters ?? 0 }, (_, i) => kp(o.seed, `voter${i}`)).sort((a, b) => (H(a.publicKey) < H(b.publicKey) ? -1 : 1));
    this.rollHex = this.voters.map((v) => H(v.publicKey));
  }
  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
  honest(): number[] {
    return [...this.paths.keys()].sort((a, b) => a - b);
  }
  path(i: number): string {
    return this.paths.get(i)!;
  }

  /** keygen for every honest slot, then the manifest listing all keys, then join. */
  async setup(): Promise<void> {
    const { n, seed } = this.o;
    for (let i = 1; i <= n; i++) {
      if (this.o.malicious?.[i] !== undefined) {
        this.signKeys.push(kp(seed, `mal${i}`));
        continue;
      }
      const deps = mkDeps(`${seed}/${i}`);
      this.deps.set(i, deps);
      const p = join(this.dir, `t${i}.qvtb`);
      this.paths.set(i, p);
      const t = await Trustee.keygen(p, PASS, deps);
      this.signKeys.push({ secretKey: new Uint8Array(0), publicKey: hexToBytes(t.signPk, 32) });
    }
    const rr = this.rollHex.length > 0 ? rollRoot(this.rollHex) : undefined;
    this.manifest = {
      proto: PROTO_ID, type: 'manifest', election_id: H(sha256(utf8(seed)).slice(0, 16)), title: `Election ${seed}`,
      created: '2026-10-21T12:00:00Z', voting_open: '2026-11-01T09:00:00Z', voting_close: '2026-11-08T21:00:00Z', clock_skew_s: 300,
      contests: [{
        id: 'budget', title: 'Adopt the budget?', method: 'yes-no', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
        selection_limit: 1, min_selections: 0, rule: { type: 'threshold', num: 1, den: 2, basis: 'yes+no', strict: true }, tie_break: { type: 'status-quo', option: 'no' },
      }],
      roll: { scheme: 'ed25519-roll-v1', weights: 'uniform', ...(rr !== undefined && rr.ok ? { root: H(rr.value), size: this.rollHex.length } : {}) },
      trustees: this.signKeys.map((k, i) => ({ index: i + 1, name: `T${i + 1}`, sign_pk: H(k.publicKey) })),
      n, t: this.o.t, coordinator: { keys: [H(this.coord.publicKey)], m: 1 },
      ballots: { max_per_voter: 4, max_spoils_per_voter: 4 },
      bb: { log_id: '', log_pk: H(kp(seed, 'log').publicKey), witness_quorum: this.o.witnessQuorum ?? 0 },
      privacy_ack: true, ...(this.o.spoilDecrypt === true ? { spoil_trustee_decrypt: true } : {}), ...(this.o.minCounted !== undefined ? { min_counted_ballots: this.o.minCounted } : {}),
    };
    // QV-16 bb.log_id = SHA-256(log origin) (protocol X-21); the origin depends only on election_id.
    this.manifest.bb.log_id = expectedLogId(logOrigin(this.manifest));
    this.mh = manifestHash(this.manifest);
    this.mrec = { body: this.manifest, sigs: [signRecordRaw(this.coord.secretKey, this.coord.publicKey, this.mh, 'manifest', this.manifest)] };
    for (const [i, p] of this.paths) {
      await this.act(i, (t) => t.join(this.mrec, H(this.mh), 'c1'));
      void p;
    }
    for (const [i, b] of Object.entries(this.o.malicious ?? {})) this.scripted.set(Number(i), new Scripted(this, Number(i), b));
  }

  /** Every command runs against a freshly opened bundle: a crash-and-restart between any two commands. */
  async act<T>(i: number, f: (t: Trustee) => Promise<T>): Promise<T> {
    const t = await Trustee.open(this.path(i), PASS, this.deps.get(i)!);
    return f(t);
  }

  // ------------------------------------------------------------------ the bridge / board

  push(entry: unknown): number {
    this.seq += 1;
    this.log.push({ seq: this.seq, entry });
    return this.seq;
  }
  marker(name: MarkerBody['name'], extra: { qmask?: number; K?: string } = {}): number {
    const body: MarkerBody = { proto: PROTO_ID, type: 'marker', name, ...extra };
    const scope = name === 'election-open' || name === 'election-close' ? this.ctx! : this.mh;
    return this.push({ body, sigs: [signRecordRaw(this.coord.secretKey, this.coord.publicKey, scope, 'marker', body)] });
  }
  post(p: Packet | undefined): void {
    if (p === undefined) return;
    for (const r of p.obj.records) this.push(r);
  }
  slice(): Uint8Array {
    return jcs({ format: LOG_FORMAT, manifest_hash: H(this.mh), entries: this.log });
  }
  async sync(i: number) {
    const bytes = this.slice();
    return this.act(i, (t) => t.importLog(bytes));
  }
  async syncAll(): Promise<void> {
    for (const i of this.honest()) await this.sync(i);
  }

  // ------------------------------------------------------------------ DKG driver

  async eachHonest(f: (i: number, t: Trustee) => Promise<Packet | undefined>): Promise<void> {
    for (const i of this.honest()) {
      await this.sync(i);
      const p = await this.act(i, (t) => f(i, t));
      this.post(p);
    }
  }
  async eachScripted(f: (s: Scripted) => Promise<void> | void): Promise<void> {
    for (const s of this.scripted.values()) await f(s);
  }

  /** Runs the whole DKG up to and including the fire drill and election-open. */
  async runDkg(opts: { confirm?: boolean; drill?: boolean } = {}): Promise<DkgOutcome> {
    this.marker('dkg-open');
    await this.eachHonest((_i, t) => t.commit());
    await this.eachScripted((s) => s.commit());
    this.marker('dkg-r1-open');
    await this.eachHonest((_i, t) => t.reveal());
    await this.eachScripted((s) => s.reveal());
    this.marker('dkg-r1-close');
    await this.eachHonest((_i, t) => t.shares());
    await this.eachScripted((s) => s.shares());
    this.marker('dkg-r2-close');
    await this.eachHonest(async (_i, t) => (await t.verify()).packet);
    await this.eachScripted((s) => s.verify());
    this.marker('dkg-r3-close');
    const outcome = await this.adjudicate();
    this.ctx = outcome.ctx;
    for (const i of this.honest()) {
      await this.sync(i);
      if (outcome.Q.includes(i)) {
        const f = await this.act(i, (t) => t.finalize());
        void f;
      }
    }
    if (opts.confirm === false) return outcome;
    for (const i of this.honest()) {
      if (!outcome.Q.includes(i)) continue;
      const other = outcome.Q.find((q) => q !== i)!;
      this.post(await this.act(i, (t) => t.confirm([other])));
    }
    this.marker('dkg-final', { qmask: outcome.qmask, K: H(pointToBytes(outcome.K)) });
    if (opts.drill === false) return outcome;
    for (const i of this.honest()) {
      if (!outcome.Q.includes(i)) continue;
      await this.sync(i);
      this.post(await this.act(i, (t) => t.drill()));
    }
    this.openElection();
    await this.syncAll();
    return outcome;
  }

  /** QV-ADR-015: roll-commit, then an election-open that binds (manifest_hash, joint_key_seq, roll_commit_seq). */
  openElection(): void {
    const root = this.manifest.roll.root; // DKG-only ceremonies have an empty roll and never reach a tally
    const rc = { proto: PROTO_ID, type: 'roll-commit' as const, root: root ?? '00'.repeat(32), size: this.rollHex.length };
    const rcSeq = root === undefined ? 0 : this.push({ body: rc, sigs: [signRecordRaw(this.coord.secretKey, this.coord.publicKey, this.mh, 'roll-commit', rc)] });
    const body = electionOpenBody(PROTO_ID, H(this.mh), markerSeq(this.log, 'dkg-final')!, rcSeq);
    this.push({ body, sigs: [signRecordRaw(this.coord.secretKey, this.coord.publicKey, this.ctx!, 'marker', body)] });
  }

  async adjudicate(): Promise<DkgOutcome> {
    const mk = {} as MarkerSeqs;
    for (const nm of ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close'] as const) mk[nm] = markerSeq(this.log, nm)!;
    mk['dkg-final'] = markerSeq(this.log, 'dkg-final') ?? this.seq + 1000;
    const rec = takeDkg(this.log);
    const adj = await adjudicateDkg({ mh: this.mh, n: this.o.n, t: this.o.t, markers: mk, commits: rec.commits, dealings: rec.dealings, shares: rec.shares, complaints: rec.complaints });
    if (!adj.ok) throw new Error(`adjudication: ${adj.error} ${adj.detail ?? ''}`);
    return adj.value;
  }

  // ------------------------------------------------------------------ voting

  params(o: DkgOutcome) {
    return { manifest: this.manifest, mh: this.mh, K: o.K, ctx: o.ctx };
  }
  cast(o: DkgOutcome, voterIdx: number, sel: Selections): void {
    const v = this.voters[voterIdx]!;
    const b = buildBallot(this.params(o), v.secretKey, v.publicKey, NO_SUPERSEDES, sel, this.rng, 0);
    if (!b.ok) throw new Error(`build ${b.error}`);
    this.push(makeCast(this.params(o), v.secretKey, b.value));
  }
  /** Builds a ballot without posting it. */
  build(o: DkgOutcome, voterIdx: number, sel: Selections, attempt = 0) {
    const v = this.voters[voterIdx]!;
    const b = buildBallot(this.params(o), v.secretKey, v.publicKey, NO_SUPERSEDES, sel, this.rng, attempt);
    if (!b.ok) throw new Error(`build ${b.error}`);
    return b.value;
  }
  /** Posts a spoil record for a built ballot; returns its hex ballot code. */
  spoil(o: DkgOutcome, voterIdx: number, b: ReturnType<Ceremony['build']>, mode: SpoilMode = 'trustees'): string {
    this.push(makeSpoil(this.params(o), this.voters[voterIdx]!.secretKey, b, mode));
    return H(b.code);
  }
  castBuilt(o: DkgOutcome, voterIdx: number, b: ReturnType<Ceremony['build']>): void {
    this.push(makeCast(this.params(o), this.voters[voterIdx]!.secretKey, b));
  }
  bundle(): { manifest: MultiSignedRecord<Manifest>; manifest_hash: string; roll: string[]; log: LogEntry[] } {
    return { manifest: this.mrec, manifest_hash: H(this.mh), roll: this.rollHex, log: this.log };
  }
}

/** A scripted (non-Trustee) participant that follows the protocol with a configurable deviation. */
export class Scripted {
  readonly c: Ceremony;
  readonly i: number;
  readonly b: Behaviour;
  readonly kp: Ed25519Keypair;
  secret?: DealerSecret;
  dealing?: ReturnType<typeof dkgDeal>;
  r: Rng;
  constructor(c: Ceremony, i: number, b: Behaviour) {
    this.c = c;
    this.i = i;
    this.b = b;
    this.kp = kp(c.o.seed, `mal${i}`);
    this.r = streamRng(`scripted/${c.o.seed}/${i}`);
  }
  private sign<B extends { type: string }>(body: B): unknown {
    return signRecord(this.kp.secretKey, this.kp.publicKey, this.c.mh, body);
  }
  commit(): void {
    if (this.b.absent) return;
    const d = dkgDeal(this.c.mh, this.i, this.c.o.t, this.r);
    this.dealing = d;
    this.secret = d.secret;
    if (this.b.commitMismatch) {
      const other = dkgDeal(this.c.mh, this.i, this.c.o.t, this.r);
      this.c.push(this.sign(other.commit));
    } else this.c.push(this.sign(d.commit));
    if (this.b.equivocateCommit) this.c.push(this.sign(dkgDeal(this.c.mh, this.i, this.c.o.t, this.r).commit));
  }
  reveal(): void {
    if (this.b.absent || this.b.noReveal || this.dealing === undefined) return;
    this.c.push(this.sign(this.dealing.body));
  }
  private r1() {
    const m = this.c.manifest;
    return computeR1(this.c.mh, m.t, m.n, { r1open: markerSeq(this.c.log, 'dkg-r1-open')!, r1close: markerSeq(this.c.log, 'dkg-r1-close')! }, takeDkg(this.c.log));
  }
  async shares(): Promise<void> {
    if (this.b.absent || this.secret === undefined) return;
    const r1 = this.r1();
    if (!r1.R1.includes(this.i)) return;
    const pkg = await dkgMakeShares(this.c.mh, this.secret, r1.parsed, this.r);
    for (const j of this.b.badShareTo ?? []) {
      const wrong = await encryptShare(this.c.mh, this.i, j, r1.parsed.get(j)!.E, scalarRandomNonZero(this.r), this.r);
      const k = pkg.shares.findIndex((s) => s.j === j);
      pkg.shares[k] = { j, R: H(wrong.R), ct: H(wrong.ct), tag: H(wrong.tag) };
    }
    this.c.push(this.sign(pkg));
  }
  async verify(): Promise<void> {
    if (this.b.absent || this.secret === undefined) return;
    const r1 = this.r1();
    const rec = takeDkg(this.c.log);
    for (const acc of this.b.falseComplaintAgainst ?? []) {
      const pkg = rec.shares.find((s) => s.body.i === acc)?.body;
      const ent = pkg?.shares.find((s) => s.j === this.i);
      if (ent === undefined) continue;
      const Eme: Point = (r1.parsed.get(this.i) as ParsedDealing).E;
      this.c.push(this.sign(dkgMakeComplaint(this.c.mh, this.i, this.secret.e, Eme, acc, ent, this.r)));
    }
  }
}

// ---------------------------------------------------------------------------------------------- election fixture

import {
  aggregate, analyzeBallotLog, buildTally, decryptAggregates, verifyElection,
  type Aggregate, type ShareSet, type VerificationReport,
} from '@quietvote/protocol';
import { collectTallyShares } from '../../src/trustee.ts';

export interface Fixture {
  c: Ceremony;
  outcome: DkgOutcome;
  expectedYes: number;
  expectedNo: number;
}

export async function electionFixture(o: Options & { votes?: ('yes' | 'no')[]; close?: boolean }): Promise<Fixture> {
  const votes = o.votes ?? ['yes', 'yes', 'no', 'yes', 'no', 'yes'];
  const c = new Ceremony({ ...o, voters: votes.length });
  await c.setup();
  const outcome = await c.runDkg();
  votes.forEach((v, k) => c.cast(outcome, k, { budget: [v] }));
  if (o.close !== false) c.marker('election-close');
  await c.syncAll();
  return { c, outcome, expectedYes: votes.filter((v) => v === 'yes').length, expectedNo: votes.filter((v) => v === 'no').length };
}

export function analysisOf(c: Ceremony, outcome: DkgOutcome) {
  const p = c.params(outcome);
  const open = markerSeq(c.log, 'election-open')!;
  const close = markerSeq(c.log, 'election-close')!;
  const voter = c.log.filter((e) => typeof e.entry === 'object' && e.entry !== null && 'intent' in e.entry).map((e) => ({ seq: e.seq, raw: e.entry }));
  const an = analyzeBallotLog(p, new Set(c.rollHex), voter, open, close);
  return { p, an, aggs: aggregate(p, an.counted) as Map<string, Map<string, Aggregate>> };
}

/** Coordinator: collect shares, decrypt, publish the tally record and run the full verifier. */
export function finishTally(c: Ceremony, outcome: DkgOutcome, records: unknown[]): { counts: Map<string, Map<string, number>> | undefined; error?: string; report?: VerificationReport; rejected: { j?: number; why: string }[]; valid: number[] } {
  const { p, an, aggs } = analysisOf(c, outcome);
  const { sets, rejected } = collectTallyShares(c.manifest, outcome.ctx, records);
  const shares = new Map<number, ShareSet>(sets);
  const dec = decryptAggregates(p, outcome.Y, new Set(outcome.Q), aggs, an.counted.length, shares);
  if (!dec.ok) return { counts: undefined, error: `${dec.error} ${dec.detail ?? ''}`, rejected, valid: [] };
  const good = new Map([...shares].filter(([j]) => dec.value.validSet.includes(j)));
  const t = buildTally(p, { analysis: an, shares: good, Y: outcome.Y, decrypters: new Set(outcome.Q), rollSize: c.rollHex.length, spoiled: [] });
  if (!t.ok) return { counts: undefined, error: `${t.error} ${t.detail ?? ''}`, rejected, valid: dec.value.validSet };
  c.push(signRecord(c.coord.secretKey, c.coord.publicKey, outcome.ctx, t.value.body));
  return { counts: t.value.counts, rejected, valid: dec.value.validSet };
}
export async function verifyAll(c: Ceremony): Promise<VerificationReport> {
  return verifyElection(c.bundle());
}
