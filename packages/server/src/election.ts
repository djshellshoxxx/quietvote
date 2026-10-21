// Per-election runtime: admission validator (schema + signatures + proofs via @quietvote/protocol), board service
// (@quietvote/board BoardLog over the SQLite store), lifecycle state, trustee coordinator views, tally relay.
import { statfsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  BoardLog, MAX_BODY, authorKeyId, b64, b64u, buildEntry, checkEntry, decodeHeader, nonceKey, parseCheckpoint, toHex, witnessStatus,
  type EntryHeader, type EntryType, type Receipt,
} from '@quietvote/board';
import {
  bytesToHex, hexToBytes, jcs, parseQvJson, pointToBytes, decVerify,
  type Ed25519Keypair,
} from '@quietvote/crypto';
import {
  NO_SUPERSEDES, S, adjudicateDkg, aggregate, analyzeBallotLog, ballotCode, buildTally, castEnvelopeSchema, check, checkDealing,
  countedRoot, dealingCommitHash, effectiveMinCounted, manifestHash, manifestSchema, rollRoot, shareFromHex, shareKey,
  signRecord, spoilEnvelopeSchema, tallySchema, validateManifest, verifyEnvelope, verifyKeyconf, verifyMultiSig, verifySig, verifySpoilReveal, PROTO_ID,
  type Aggregate, type BallotAnalysis, type CastEnvelope, type CommitBody, type ComplaintBody, type DealingBody, type DkgOutcome,
  type ElectionParams, type KeyconfBody, type Manifest, type MarkerBody, type MultiSignedRecord, type RollCommitBody,
  type ShareSet, type SharesBody, type SignedRecord, type SpoilEnvelope, type TallyBody,
} from '@quietvote/protocol';
import type { RegistryRow, ElectionStateName } from './controldb.ts';
import { ElectionDb, type EventRow } from './electiondb.ts';
import type { Env } from './env.ts';
import { toIso } from './util.ts';
import { transition, typeAllowed, effectiveState, TERMINAL, type LifecycleEvent } from './lifecycle.ts';
import { ApiError, conflict, forbidden, invalid, wrongPhase } from './problem.ts';
import {
  ACTION_ENTRY, DKG_STEP_MARKERS, aggregateSchema, controlSchema, decSharesSchema,
  type AggregateBody, type ControlBody, type DecSharesBody,
} from './records.ts';
import { Mutex } from './util.ts';
import { open as unseal } from './kek.ts';
import { randomBytes } from 'node:crypto';

export const SERVER_VERSION = '0.1.0';
const ZERO32 = '00'.repeat(32);
const CTRL_TYPES: ReadonlySet<EntryType> = new Set<EntryType>([
  'ceremony_start', 'notice', 'election_open', 'election_close', 'roll_commit', 'joint_key', 'key_confirm', 'dkg_complaint', 'audit_close',
  'election_cancel', 'ceremony_abort',
]);

export interface AppendOutcome {
  status: 'included' | 'sequenced';
  receipt: Receipt;
  duplicate: boolean;
  seq: number;
}

interface Validated {
  rec: unknown;
  ballot?: { kid: string; kind: 'cast' | 'spoil'; voter: string; code: string };
  rollKeys?: string[];
}

/** In-memory projection of the log. Rebuilt by replaying stored entries (cheap parsing only, no proof checks). */
export class ElectionState {
  state: ElectionStateName = 'DRAFT';
  phaseSeq: Record<string, number> = {};
  manifest: Manifest | undefined;
  manifestRec: MultiSignedRecord<Manifest> | undefined;
  mh: Uint8Array | undefined;
  markers = new Map<string, number>();
  commits: { seq: number; body: CommitBody }[] = [];
  dealings: { seq: number; body: DealingBody }[] = [];
  shares: { seq: number; body: SharesBody }[] = [];
  complaints: { seq: number; body: ComplaintBody }[] = [];
  keyconfs: { seq: number; body: KeyconfBody }[] = [];
  dkgPre: DkgOutcome | undefined;
  dkgError: string | undefined;
  decrypters = new Set<number>();
  params: ElectionParams | undefined;
  rollSet: Set<string> | undefined;
  rollRootHex: string | undefined;
  last = new Map<string, string>();
  casts = new Map<string, number>();
  spoils = new Map<string, number>();
  codeOwner = new Map<string, string>();
  spoiledCodes = new Set<string>();
  openSeq: number | undefined;
  closeSeq: number | undefined;
  halts = 0;
  analysis: BallotAnalysis | undefined;
  aggs: Map<string, Map<string, Aggregate>> | undefined;
  aggregateSeq: number | undefined;
  tallyBlocked: string | undefined;
  decShares = new Map<number, { seq: number; set: ShareSet }>();
  tallySeq: number | undefined;
  tallyingSince: number | undefined;
  auditSince: number | undefined;
  lastTransitionAt = 0;
}

function sec(iso: string): number {
  return Date.parse(iso) / 1000;
}

/** Receives committed outbox rows; `close` is called when the runtime is evicted or deleted. */
export interface EventSubscriber {
  event(row: EventRow): void;
  close(): void;
}

export class ElectionRuntime {
  readonly id: string;
  readonly origin: string;
  readonly orgId: string;
  readonly env: Env;
  readonly edb: ElectionDb;
  readonly log: BoardLog;
  readonly st = new ElectionState();
  readonly mutex = new Mutex();
  readonly logPk: Uint8Array;
  readonly srvPk: Uint8Array;
  private readonly srvKeys: Ed25519Keypair | undefined;
  poisoned = false;
  inUse = 0;
  private readonly subscribers = new Set<EventSubscriber>();
  private alertedQuarantine = false;
  private readonly coordByKid = new Map<string, Uint8Array>();
  private readonly trusteeByKid = new Map<string, { pk: Uint8Array; index: number }>();
  private readonly reg: RegistryRow;

  private constructor(env: Env, reg: RegistryRow, edb: ElectionDb, logSk: Uint8Array | undefined, srvSk: Uint8Array | undefined) {
    const row = edb.row();
    this.env = env;
    this.reg = reg;
    this.id = row.election_id;
    this.origin = row.origin;
    this.orgId = row.org_id;
    this.edb = edb;
    this.logPk = new Uint8Array(row.log_pk);
    this.srvPk = new Uint8Array(row.srv_pk);
    this.srvKeys = srvSk ? { secretKey: srvSk, publicKey: this.srvPk } : undefined;
    this.log = new BoardLog({
      origin: row.origin, store: edb.store, secretKey: logSk ?? new Uint8Array(32), publicKey: this.logPk,
      clock: () => env.nowSec(), resolveAuthorKey: (h) => this.resolveAuthor(h), maxClockSkew: 86400,
    });
  }

  static async open(env: Env, reg: RegistryRow): Promise<ElectionRuntime> {
    const edb = new ElectionDb(join(env.cfg.dataDir, reg.db_path), SERVER_VERSION);
    try {
      const row = edb.row();
      if (row.election_id !== reg.election_id) throw new Error('election db does not match registry');
      let logSk: Uint8Array | undefined;
      let srvSk: Uint8Array | undefined;
      if (reg.dek_wrapped && row.log_sk_enc) {
        const dek = unseal(env.kek, reg.dek_wrapped, `dek:${reg.election_id}`);
        logSk = unseal(dek, row.log_sk_enc, 'log_sk');
        if (row.srv_sk_enc) srvSk = unseal(dek, row.srv_sk_enc, 'srv_sk');
      }
      const rt = new ElectionRuntime(env, reg, edb, logSk, srvSk);
      await rt.replay();
      return rt;
    } catch (e) {
      edb.close();
      throw e;
    }
  }

  close(): void {
    for (const s of [...this.subscribers]) {
      try {
        s.close();
      } catch {
        /* subscriber teardown must not block eviction */
      }
    }
    this.subscribers.clear();
    this.edb.close();
  }

  // ------------------------------------------------------------------ event outbox (QV-09 §9)

  /** Live subscription for SSE streams. Rows are delivered after their transaction committed. */
  subscribe(s: EventSubscriber): () => void {
    this.subscribers.add(s);
    return () => void this.subscribers.delete(s);
  }

  private record(out: EventRow[], type: string, seq: number | null, data: Record<string, unknown>): void {
    out.push(this.edb.insertEvent(this.env.nowMs(), type, seq, JSON.stringify(data)));
  }

  private checkpointData(): Record<string, unknown> {
    const w = this.witnessInfo();
    return { tree_size: this.log.size, root: b64(this.log.root()), witnessed: w.witnessed, cosigners: w.cosigners, issued_at: toIso(this.env.nowSec()) };
  }

  private quarantineAlert(out: EventRow[]): void {
    const q = this.quarantineReason();
    if (q === undefined || this.alertedQuarantine) return;
    this.alertedQuarantine = true;
    this.record(out, 'alert', null, { kind: 'quarantine', detail_code: 'LOG_QUARANTINED' });
  }

  /** Hands committed rows to live streams and to the webhook dispatcher. Never throws. */
  private publish(rows: EventRow[]): void {
    for (const r of rows) {
      for (const s of [...this.subscribers]) {
        try {
          s.event(r);
        } catch {
          this.subscribers.delete(s);
        }
      }
      try {
        this.env.onEvent?.({ electionId: this.id, orgId: this.orgId }, r);
      } catch {
        /* integrations are best effort */
      }
    }
  }

  /** Records and publishes events outside an append (cosignatures, alerts). */
  private emitNow(fn: (out: EventRow[]) => void): void {
    const out: EventRow[] = [];
    this.edb.tx(() => fn(out));
    this.publish(out);
  }

  /** Retention (QV-09 §9): the outbox is dropped 30 days after ARCHIVED. Returns true when it was pruned. */
  pruneEventsIfExpired(): boolean {
    const at = this.env.control.election(this.id)?.archived_at ?? null;
    if (this.st.state !== 'ARCHIVED' || at === null || this.env.nowMs() - at < 30 * 86400_000) return false;
    if (this.edb.eventBounds() === undefined) return false;
    this.edb.pruneEvents();
    return true;
  }

  // ------------------------------------------------------------------ state views

  get db(): DatabaseSync {
    return this.edb.db;
  }
  get manifest(): Manifest | undefined {
    return this.st.manifest;
  }
  get state(): ElectionStateName {
    return effectiveState(this.st.state, this.st.tallyingSince, this.env.nowSec(), this.env.cfg.stalledMaxSec);
  }
  get terminal(): boolean {
    return TERMINAL.has(this.st.state);
  }

  witnessPolicy() {
    return this.env.witnessPolicy(this.st.manifest?.bb.witness_quorum ?? 0);
  }

  /** Latest checkpoint, with cosignature status against the manifest's witness quorum. */
  witnessInfo(): { required: number; have: number; witnessed: boolean; cosigners: string[]; size: number } {
    const policy = this.witnessPolicy();
    const cp = this.edb.store.latestCheckpoint();
    if (!cp) return { required: policy.quorum, have: 0, witnessed: false, cosigners: [], size: 0 };
    const p = parseCheckpoint(cp.note);
    if (!p.ok) return { required: policy.quorum, have: 0, witnessed: false, cosigners: [], size: cp.size };
    const ws = witnessStatus(p.value, policy);
    return { required: policy.quorum, have: ws.valid.size, witnessed: policy.quorum > 0 && ws.witnessed, cosigners: [...ws.valid.keys()], size: cp.size };
  }

  /** Is there a quorum-witnessed checkpoint with size in [lo, hi]? Quorum 0 is trivially satisfied. */
  private witnessedWithin(lo: number, hi: number): boolean {
    const policy = this.witnessPolicy();
    if (policy.quorum === 0) return true;
    for (const cp of this.edb.store.listCheckpoints()) {
      if (cp.size < lo || cp.size > hi) continue;
      const p = parseCheckpoint(cp.note);
      if (p.ok && witnessStatus(p.value, policy).witnessed) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ author resolution (board AuthorKeyResolver)

  private resolveAuthor(h: EntryHeader): Uint8Array | undefined {
    const kid = b64u(h.author);
    switch (h.type) {
      case 'manifest': {
        const k = this.env.control.keyById(kid);
        return k && k.org_id === this.orgId && k.role !== 'instance_admin' ? new Uint8Array(k.pk) : undefined;
      }
      case 'ceremony_start': case 'joint_key': case 'roll_commit': case 'election_open': case 'election_close': case 'notice':
      case 'tally_result': case 'audit_close': case 'election_cancel': case 'ceremony_abort':
        return this.coordByKid.get(kid);
      case 'dkg_round1': case 'dkg_round2': case 'dkg_complaint': case 'key_confirm': case 'decryption_share':
        return this.trusteeByKid.get(kid)?.pk;
      case 'ballot': case 'ballot_audit': {
        const v = this.edb.voter(kid);
        return v && (v.status === 'approved' || v.status === 'committed') ? new Uint8Array(v.pk) : undefined;
      }
      case 'tally_aggregate':
        return kid === b64u(authorKeyId('ed25519', this.srvPk)) ? this.srvPk : undefined;
      default:
        return undefined;
    }
  }

  private indexManifestKeys(m: Manifest): void {
    for (const k of m.coordinator.keys) {
      const pk = hexToBytes(k, 32);
      this.coordByKid.set(b64u(authorKeyId('ed25519', pk)), pk);
    }
    for (const t of m.trustees) {
      const pk = hexToBytes(t.sign_pk, 32);
      this.trusteeByKid.set(b64u(authorKeyId('ed25519', pk)), { pk, index: t.index });
    }
  }

  // ------------------------------------------------------------------ replay (projection rebuild from the stored log)

  private async replay(): Promise<void> {
    let from = 0;
    for (;;) {
      const page = this.edb.entries(from, 500);
      for (const r of page.rows) {
        if (r.body === null) throw new Error(`entry ${r.seq} is redacted; election cannot be replayed`);
        let rec: unknown;
        try {
          rec = parseQvJson(r.body);
        } catch {
          throw new Error(`stored entry ${r.seq} does not parse`);
        }
        const h = decodeHeader(r.headerBytes);
        if (!h.ok) throw new Error(`stored entry ${r.seq} has a bad header`);
        await this.apply(r.seq, h.value.type, rec, r.sequencedAt);
      }
      if (!page.more) break;
      from = (page.rows.at(-1)?.seq ?? from) + 1;
    }
    if (this.log.status.state === 'quarantine') this.edb.setQuarantine(this.log.status.reason);
    this.syncState();
  }

  private syncState(): void {
    this.edb.setState(this.st.state, this.st.phaseSeq, this.log.size);
    const reg = this.env.control.election(this.id);
    if (reg && reg.state !== this.st.state) this.env.control.setState(this.id, this.st.state, this.st.manifest?.title);
  }

  private fire(e: LifecycleEvent['t'], seq: number, at: number): void {
    const next = transition(this.st.state, e);
    if (next === undefined) throw new Error(`lifecycle: ${e} not valid in ${this.st.state}`);
    this.st.state = next;
    this.st.lastTransitionAt = at;
    this.st.phaseSeq[e === 'election_open' ? 'open' : e === 'election_close' ? 'close' : e] = seq;
  }

  /** Applies an already-admitted entry to the in-memory projection. */
  private async apply(seq: number, type: EntryType, rec: unknown, at: number): Promise<void> {
    const st = this.st;
    switch (type) {
      case 'manifest': {
        const r = rec as MultiSignedRecord<Manifest>;
        st.manifestRec = r;
        st.manifest = r.body;
        st.mh = manifestHash(r.body);
        this.indexManifestKeys(r.body);
        this.fire('manifest', seq, at);
        this.edb.setTitle(r.body.title);
        break;
      }
      case 'ceremony_start':
        st.markers.set('dkg-open', seq);
        this.fire('ceremony_start', seq, at);
        break;
      case 'notice': {
        const b = (rec as { body: { type: string; name?: string; action?: string } }).body;
        if (b.type === 'marker') {
          st.markers.set(b.name!, seq);
          if (b.name === 'dkg-r3-close') await this.computeDkgPre();
        } else if (b.type === 'control') {
          const a = b.action;
          if (a === 'pause') {
            this.fire('pause', seq, at);
            st.halts++;
          } else if (a === 'resume') this.fire('resume', seq, at);
          else if (a === 'invalidate') this.fire('invalidate', seq, at);
        }
        break;
      }
      case 'dkg_round1': {
        const r = rec as SignedRecord<CommitBody | DealingBody>;
        if (r.body.type === 'dkg-commit') st.commits.push({ seq, body: r.body });
        else st.dealings.push({ seq, body: r.body as DealingBody });
        break;
      }
      case 'dkg_round2':
        st.shares.push({ seq, body: (rec as SignedRecord<SharesBody>).body });
        break;
      case 'dkg_complaint':
        st.complaints.push({ seq, body: (rec as SignedRecord<ComplaintBody>).body });
        break;
      case 'key_confirm': {
        const b = (rec as SignedRecord<KeyconfBody>).body;
        st.keyconfs.push({ seq, body: b });
        const Yj = st.dkgPre?.Y.get(b.j);
        if (Yj !== undefined && verifyKeyconf(st.dkgPre!.ctx, Yj, b)) st.decrypters.add(b.j);
        break;
      }
      case 'joint_key': {
        st.markers.set('dkg-final', seq);
        const d = st.dkgPre;
        if (d === undefined || st.manifest === undefined || st.mh === undefined) throw new Error('joint_key without DKG outcome');
        st.params = { manifest: st.manifest, mh: st.mh, K: d.K, ctx: d.ctx };
        this.fire('joint_key', seq, at);
        break;
      }
      case 'roll_commit': {
        const keys = this.edb.approvedKeysHex();
        st.rollSet = new Set(keys);
        st.rollRootHex = (rec as MultiSignedRecord<RollCommitBody>).body.root;
        this.fire('roll_commit', seq, at);
        break;
      }
      case 'election_open':
        st.openSeq = seq;
        this.fire('election_open', seq, at);
        break;
      case 'ballot': case 'ballot_audit': {
        const env = rec as CastEnvelope | SpoilEnvelope;
        const voter = env.body.voter;
        const code = bytesToHex(ballotCode(st.params!.ctx, env.body));
        if (env.intent === 'cast') {
          st.last.set(voter, code);
          st.casts.set(voter, (st.casts.get(voter) ?? 0) + 1);
          if (!st.codeOwner.has(code)) st.codeOwner.set(code, voter);
        } else {
          st.spoils.set(voter, (st.spoils.get(voter) ?? 0) + 1);
          st.spoiledCodes.add(code);
        }
        break;
      }
      case 'election_close':
        st.closeSeq = seq;
        this.fire('election_close', seq, at);
        break;
      case 'tally_aggregate':
        st.aggregateSeq = seq;
        st.tallyingSince = at;
        this.fire('tally_aggregate', seq, at);
        break;
      case 'decryption_share': {
        const b = (rec as SignedRecord<DecSharesBody>).body;
        const set: ShareSet = new Map();
        for (const s of b.shares) {
          const p = shareFromHex(s);
          if (p.ok) set.set(shareKey(s.contest, s.opt), p.value);
        }
        st.decShares.set(b.j, { seq, set });
        break;
      }
      case 'tally_result':
        st.tallySeq = seq;
        st.auditSince = at;
        this.fire('tally_result', seq, at);
        break;
      case 'audit_close':
        this.fire('audit_close', seq, at);
        break;
      case 'election_cancel':
        this.fire('election_cancel', seq, at);
        break;
      case 'ceremony_abort':
        this.fire('ceremony_abort', seq, at);
        break;
      default:
        break;
    }
  }

  private async computeDkgPre(): Promise<void> {
    const st = this.st;
    if (st.manifest === undefined || st.mh === undefined) return;
    const g = (n: string): number => st.markers.get(n) ?? -1;
    const r = await adjudicateDkg({
      mh: st.mh, n: st.manifest.n, t: st.manifest.t,
      markers: { 'dkg-open': g('dkg-open'), 'dkg-r1-open': g('dkg-r1-open'), 'dkg-r1-close': g('dkg-r1-close'), 'dkg-r2-close': g('dkg-r2-close'), 'dkg-r3-close': g('dkg-r3-close'), 'dkg-final': Number.MAX_SAFE_INTEGER },
      commits: st.commits, dealings: st.dealings, shares: st.shares, complaints: st.complaints,
    });
    if (r.ok) {
      st.dkgPre = r.value;
      st.dkgError = undefined;
    } else st.dkgError = `${r.error}${r.detail ? `: ${r.detail}` : ''}`;
  }

  /** Number of contiguous DKG markers present (0..6). */
  private dkgStep(): number {
    let n = 0;
    for (const m of DKG_STEP_MARKERS) {
      if (this.st.markers.has(m)) n++;
      else break;
    }
    return n;
  }

  // ------------------------------------------------------------------ admission pipeline (QV-29 §6.1)

  private sizeCap(type: EntryType): number {
    const cfg = this.env.cfg;
    if (type === 'ballot' || type === 'ballot_audit') return Math.min(MAX_BODY[type], cfg.maxBallotBytes);
    if (CTRL_TYPES.has(type)) return Math.min(MAX_BODY[type], cfg.maxControlEntryBytes);
    return MAX_BODY[type];
  }

  private mapBoardErr(code: string, message: string): ApiError {
    switch (code) {
      case 'QV_BOARD_TOO_LARGE': return new ApiError(413, 'ENTRY_TOO_LARGE', message);
      case 'QV_BOARD_MALFORMED': return new ApiError(400, 'MALFORMED_ENTRY', message);
      case 'QV_BOARD_AUTHOR_UNRESOLVED': return new ApiError(403, 'AUTHOR_NOT_AUTHORIZED', 'author key is not authorized for this entry type');
      case 'QV_BOARD_BAD_SIGNATURE': return new ApiError(401, 'BAD_SIGNATURE', message);
      case 'QV_BOARD_NONCE_REUSE': return conflict('author nonce reused with a different entry', 'NONCE_REUSE');
      case 'QV_BOARD_GRAMMAR': return wrongPhase(message);
      case 'QV_BOARD_QUARANTINE': return new ApiError(503, 'QUARANTINED', 'log is quarantined; reads still work');
      case 'QV_BOARD_READ_ONLY': return new ApiError(503, 'LOG_UNAVAILABLE', 'log is read-only');
      case 'QV_BOARD_CLOCK_SKEW': return invalid('CLOCK_SKEW', message);
      default: return invalid(code.replace(/^QV_BOARD_/, ''), message);
    }
  }

  /** Steps 1-6 of the pipeline: no proof verification happens here. Returns the decoded header or a duplicate outcome. */
  private precheck(headerBytes: Uint8Array, body: Uint8Array, internal: boolean): { header: EntryHeader } | { dup: AppendOutcome } {
    const d = decodeHeader(headerBytes);
    if (!d.ok) throw this.mapBoardErr(d.error.code, d.error.message);
    const h = d.value;
    if (h.origin !== this.origin) throw invalid('ORIGIN_MISMATCH', 'entry is bound to a different election');
    if (body.length > this.sizeCap(h.type) || h.bodyLen > this.sizeCap(h.type)) throw new ApiError(413, 'ENTRY_TOO_LARGE', `body exceeds the ${this.sizeCap(h.type)} byte limit for ${h.type}`);
    // idempotent replay of identical bytes returns the original receipt (QV-09 §4.4)
    const prior = this.edb.store.findByNonce(nonceKey(toHex(h.author), h.type, toHex(h.authorNonce)));
    if (prior !== undefined) {
      const e = this.edb.store.getEntry(prior);
      if (e && Buffer.compare(Buffer.from(e.headerBytes), Buffer.from(headerBytes)) === 0) return { dup: this.outcomeFor(prior, true) };
      throw conflict('author nonce reused with a different entry', 'NONCE_REUSE');
    }
    const c = checkEntry(headerBytes, body, this.origin, (x) => this.resolveAuthor(x), this.log.size);
    if (!c.ok) throw this.mapBoardErr(c.error.code, c.error.message);
    if (!internal) {
      const kid = b64u(h.author);
      const t = this.env.limiter.take(`wk:${this.id}:${kid}`, this.env.cfg.rate.writeKey);
      if (!t.ok) {
        this.env.logger.limitHit('writeKey');
        throw new ApiError(429, 'RATE_LIMITED', 'too many submissions for this key', { retryAfter: t.retryAfterSec });
      }
      if (h.type === 'ballot' || h.type === 'ballot_audit') {
        const cfg = this.env.cfg;
        const iv = this.env.limiter.take(`bi:${this.id}:${kid}`, { limit: 1, windowSec: cfg.minBallotIntervalSec, burst: 1 });
        const hr = this.env.limiter.take(`bh:${this.id}:${kid}`, { limit: cfg.maxBallotAttemptsPerHour, windowSec: 3600 });
        if (!iv.ok || !hr.ok) {
          this.env.logger.limitHit('ballotKey');
          throw new ApiError(429, 'RATE_LIMITED', 'ballot submissions from this key are too frequent', { retryAfter: Math.max(iv.retryAfterSec, hr.retryAfterSec) });
        }
      }
    }
    this.checkPhase(h.type);
    return { header: h };
  }

  private checkPhase(type: EntryType): void {
    if (this.log.status.state === 'quarantine') throw new ApiError(503, 'QUARANTINED', 'log is quarantined; reads still work');
    const s = this.state;
    if (!typeAllowed(s, type)) throw wrongPhase(`${type} is not accepted while the election is ${s}`);
  }

  outcomeFor(seq: number, duplicate: boolean): AppendOutcome {
    const r = this.log.getReceipt(seq);
    if (!r.ok) throw new ApiError(500, 'INTERNAL', 'receipt unavailable');
    return { status: r.value.inclusion ? 'included' : 'sequenced', receipt: r.value, duplicate, seq };
  }

  /** Public entry point for POST log/entries. */
  async append(headerBytes: Uint8Array, body: Uint8Array): Promise<AppendOutcome> {
    const pre = this.precheck(headerBytes, body, false);
    if ('dup' in pre) return pre.dup;
    return this.queued(() => this.processLocked(headerBytes, body));
  }

  private async queued<T>(fn: () => Promise<T>): Promise<T> {
    const env = this.env;
    if (env.inflight.n >= env.cfg.maxVerifyQueue) throw new ApiError(503, 'BUSY', 'verification queue is full', { retryAfter: 2 });
    env.inflight.n++;
    try {
      return await this.mutex.run(fn);
    } finally {
      env.inflight.n--;
    }
  }

  private async processLocked(headerBytes: Uint8Array, body: Uint8Array): Promise<AppendOutcome> {
    if (this.poisoned) throw new ApiError(503, 'LOG_UNAVAILABLE', 'election runtime is being reloaded');
    const pre = this.precheck(headerBytes, body, true); // re-check under the lock (state may have moved)
    if ('dup' in pre) return pre.dup;
    const h = pre.header;
    this.guards(body);
    const v = await this.validate(h, body);
    this.gates(h);
    const at = this.env.nowSec();
    const seq = this.log.size;
    let receipt: Receipt | undefined;
    const evs: EventRow[] = [];
    const from = this.st.state;
    try {
      this.edb.tx(() => {
        const r = this.log.append(headerBytes, body);
        if (!r.ok) throw this.mapBoardErr(r.error.code, r.error.message);
        receipt = r.value.receipt;
        this.project(h, seq, v);
        const cp = this.log.checkpoint();
        if (!cp.ok) throw this.mapBoardErr(cp.error.code, cp.error.message);
        // entry events carry no bodies (QV-09 §9); written atomically with the append
        this.record(evs, 'entry', seq, { seq, type: h.type, author: b64u(h.author), leaf_hash: b64u(r.value.receipt.leafHash) });
        this.record(evs, 'checkpoint', seq, this.checkpointData());
      });
    } catch (e) {
      if (this.log.size !== this.edb.store.size()) this.poisoned = true; // in-memory tree ran ahead of the rolled-back DB
      throw e;
    }
    void receipt;
    await this.apply(seq, h.type, v.rec, at);
    if (h.type === 'audit_close') this.finalizeArchive();
    this.syncState();
    try {
      this.edb.tx(() => {
        if (this.st.state !== from) this.record(evs, 'phase', seq, { from, to: this.st.state, seq });
        this.quarantineAlert(evs);
      });
    } catch {
      /* the append is durable; a lost phase event is recoverable from the log */
    }
    this.publish(evs);
    this.env.stats.appended++;
    this.env.logger.event('append', { election_id: this.id, seq, entry_type: h.type, outcome: 'ok', bytes_in: body.length }, h.type === 'ballot' || h.type === 'ballot_audit');
    const out = this.outcomeFor(seq, false);
    if (h.type === 'election_close') await this.maybeAggregateLocked();
    return out;
  }

  private guards(body: Uint8Array): void {
    const cfg = this.env.cfg;
    if (this.edb.totalBodyBytes() + body.length > cfg.maxLogBytes) throw new ApiError(507, 'LOG_FULL', 'per-election log size cap reached');
    if (cfg.minFreeBytes > 0) {
      try {
        const fs = statfsSync(cfg.dataDir);
        if (Number(fs.bavail) * Number(fs.bsize) < cfg.minFreeBytes) throw new ApiError(507, 'LOG_FULL', 'insufficient free disk space; reads continue');
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
  }

  private gates(h: EntryHeader): void {
    const st = this.st;
    if (h.type === 'election_open') {
      const rc = st.phaseSeq['roll_commit'];
      if (rc !== undefined && !this.witnessedWithin(rc + 1, this.log.size)) {
        throw new ApiError(409, 'WITNESS_QUORUM_REQUIRED', 'latest checkpoint covering roll_commit is not witnessed by a quorum', { retryAfter: 5 });
      }
    }
  }

  private project(h: EntryHeader, seq: number, v: Validated): void {
    if (h.type === 'roll_commit' && v.rollKeys) this.edb.commitRoll(v.rollKeys);
    if (v.ballot) {
      const e = this.edb.store.getEntry(seq)!;
      this.edb.recordBallot(seq, v.ballot.kid, v.ballot.kind, e.leafHash);
    }
  }

  // ------------------------------------------------------------------ type-specific validation (proofs LAST)

  private jsonBody(body: Uint8Array): unknown {
    let v: unknown;
    try {
      v = parseQvJson(body);
    } catch {
      throw invalid('E_PARSE', 'body is not valid QV-JSON');
    }
    const canon = jcs(v);
    if (canon.length !== body.length || Buffer.compare(Buffer.from(canon), Buffer.from(body)) !== 0) throw invalid('E_NONCANONICAL', 'body is not the canonical (JCS) serialization');
    return v;
  }

  private schema(sch: Parameters<typeof check>[0], v: unknown): void {
    const e = check(sch, v);
    if (e !== null) throw invalid('E_SCHEMA', e);
  }

  private needManifest(): { m: Manifest; mh: Uint8Array } {
    const { manifest: m, mh } = this.st;
    if (m === undefined || mh === undefined) throw wrongPhase('no manifest has been published');
    return { m, mh };
  }

  private multi(rec: MultiSignedRecord<{ type: string }>, scope: Uint8Array, header: EntryHeader): void {
    const { m } = this.needManifest();
    if (!verifyMultiSig(scope, rec, m.coordinator.keys, m.coordinator.m)) throw invalid('E_SIG', `fewer than ${m.coordinator.m} valid coordinator signatures`);
    const author = bytesToHex(this.coordByKid.get(b64u(header.author)) ?? new Uint8Array());
    if (!rec.sigs.some((s) => s.key === author)) throw invalid('E_SIG', 'entry author did not sign the record');
  }

  private trusteeIdx(h: EntryHeader): { index: number; pkHex: string } {
    const t = this.trusteeByKid.get(b64u(h.author));
    if (!t) throw forbidden('author is not a trustee', 'AUTHOR_NOT_AUTHORIZED');
    return { index: t.index, pkHex: bytesToHex(t.pk) };
  }

  private signed(rec: SignedRecord<{ type: string }>, scope: Uint8Array, expectKey: string): void {
    if (!verifySig(scope, rec.body.type, rec.body, rec.sig, expectKey)) throw invalid('E_SIG', `record signature invalid for ${rec.body.type}`);
  }

  private async validate(h: EntryHeader, body: Uint8Array): Promise<Validated> {
    const rec = this.jsonBody(body);
    const st = this.st;
    switch (h.type) {
      case 'manifest': return this.vManifest(h, rec);
      case 'ceremony_start': {
        const { mh } = this.needManifest();
        this.schema(S.multiSigned(S.marker), rec);
        const r = rec as MultiSignedRecord<MarkerBody>;
        if (r.body.name !== 'dkg-open') throw invalid('E_MARKERS', 'ceremony_start must carry the dkg-open marker');
        this.multi(r, mh, h);
        return { rec };
      }
      case 'notice': return this.vNotice(h, rec);
      case 'dkg_round1': return this.vRound1(h, rec);
      case 'dkg_round2': return this.vRound2(h, rec);
      case 'dkg_complaint': {
        const { mh } = this.needManifest();
        this.schema(S.signed(S.dkgComplaint), rec);
        const r = rec as SignedRecord<ComplaintBody>;
        const who = this.trusteeIdx(h);
        if (this.dkgStep() !== 4) throw wrongPhase('complaints are accepted between dkg-r2-close and dkg-r3-close');
        if (r.body.accuser !== who.index) throw invalid('E_DKG_COMPLAINT', 'accuser is not the author');
        this.signed(r, mh, who.pkHex);
        const hasDealing = (i: number): boolean => st.dealings.some((d) => d.body.i === i);
        if (r.body.accused === r.body.accuser || !hasDealing(r.body.accused) || !hasDealing(r.body.accuser)) throw invalid('E_DKG_COMPLAINT', 'accuser/accused did not both deal');
        const ent = st.shares.find((s) => s.body.i === r.body.accused)?.body.shares.some((x) => x.j === r.body.accuser);
        if (!ent) throw invalid('E_DKG_COMPLAINT', 'accused published no share for the accuser');
        return { rec };
      }
      case 'key_confirm': {
        this.needManifest();
        this.schema(S.signed(S.dkgKeyconf), rec);
        const r = rec as SignedRecord<KeyconfBody>;
        const who = this.trusteeIdx(h);
        if (this.dkgStep() !== 5) throw wrongPhase('key confirmations are accepted between dkg-r3-close and dkg-final');
        const d = st.dkgPre;
        if (d === undefined) throw invalid('E_DKG_FINAL', `DKG cannot complete: ${st.dkgError ?? 'no outcome'}`);
        if (r.body.j !== who.index || !d.Q.includes(r.body.j)) throw invalid('E_DKG_KEYCONF', 'trustee is not a qualified dealer or not the author');
        if (st.keyconfs.some((k) => k.body.j === r.body.j)) throw conflict('key confirmation already posted');
        this.signed(r, st.mh!, who.pkHex);
        this.env.stats.proofVerifications++;
        if (!verifyKeyconf(d.ctx, d.Y.get(r.body.j)!, r.body)) throw invalid('E_DKG_KEYCONF', 'key confirmation proof invalid');
        return { rec };
      }
      case 'joint_key': {
        const { m, mh } = this.needManifest();
        this.schema(S.multiSigned(S.marker), rec);
        const r = rec as MultiSignedRecord<MarkerBody>;
        if (r.body.name !== 'dkg-final') throw invalid('E_MARKERS', 'joint_key must carry the dkg-final marker');
        if (this.dkgStep() !== 5) throw wrongPhase('dkg-final requires dkg-r3-close');
        this.multi(r, mh, h);
        const d = st.dkgPre;
        if (d === undefined) throw invalid('E_DKG_FINAL', `DKG failed: ${st.dkgError ?? 'no outcome'}; abort the ceremony`);
        if (r.body.qmask !== undefined && (r.body.qmask !== d.qmask || r.body.K !== bytesToHex(pointToBytes(d.K)))) throw invalid('E_DKG_FINAL', 'qmask/K differ from the adjudicated outcome');
        if (st.decrypters.size < m.t) throw invalid('E_DKG_KEYCONF', `only ${st.decrypters.size} verified key confirmations, need t=${m.t}`);
        return { rec };
      }
      case 'roll_commit': return this.vRollCommit(h, rec);
      case 'election_open': {
        const { m } = this.needManifest();
        this.schema(S.multiSigned(S.marker), rec);
        const r = rec as MultiSignedRecord<MarkerBody>;
        if (r.body.name !== 'election-open') throw invalid('E_MARKERS', 'election_open must carry the election-open marker');
        this.multi(r, st.params!.ctx, h);
        if (this.env.nowSec() < sec(m.voting_open) - m.clock_skew_s) throw wrongPhase('voting_open has not been reached');
        return { rec };
      }
      case 'election_close': {
        this.needManifest();
        this.schema(S.multiSigned(S.marker), rec);
        const r = rec as MultiSignedRecord<MarkerBody>;
        if (r.body.name !== 'election-close') throw invalid('E_MARKERS', 'election_close must carry the election-close marker');
        this.multi(r, st.params!.ctx, h);
        return { rec };
      }
      case 'ballot': case 'ballot_audit': return this.vBallot(h, rec);
      case 'tally_aggregate': {
        this.schema(S.signed(aggregateSchema), rec);
        if (st.aggs === undefined || this.srvKeys === undefined) throw wrongPhase('aggregate is posted by the server only');
        return { rec };
      }
      case 'decryption_share': return this.vDecShares(h, rec);
      case 'tally_result': return this.vTally(h, rec);
      case 'audit_close': {
        const { mh } = this.needManifest();
        const c = this.control(rec, mh, h);
        if (c.action !== 'audit-close') throw invalid('E_SCHEMA', 'audit_close must carry the audit-close action');
        if (st.auditSince === undefined || this.env.nowSec() < st.auditSince + this.env.cfg.auditWindowSec) throw wrongPhase('audit window has not elapsed');
        return { rec };
      }
      case 'election_cancel': case 'ceremony_abort': {
        const { mh } = this.needManifest();
        const c = this.control(rec, mh, h);
        const want = h.type === 'election_cancel' ? 'cancel' : 'abort';
        if (c.action !== want) throw invalid('E_SCHEMA', `${h.type} must carry the ${want} action`);
        return { rec };
      }
      default:
        throw wrongPhase(`entry type ${h.type} is not accepted`);
    }
  }

  private control(rec: unknown, mh: Uint8Array, h: EntryHeader): ControlBody {
    this.schema(S.multiSigned(controlSchema), rec);
    const r = rec as MultiSignedRecord<ControlBody>;
    this.multi(r, mh, h);
    if (ACTION_ENTRY[r.body.action] !== h.type) throw invalid('E_SCHEMA', `action ${r.body.action} does not belong in a ${h.type} entry`);
    return r.body;
  }

  private vManifest(h: EntryHeader, rec: unknown): Validated {
    if (this.log.size !== 0) throw wrongPhase('manifest is only accepted at seq 0');
    this.schema(S.multiSigned(manifestSchema()), rec);
    const r = rec as MultiSignedRecord<Manifest>;
    const v = validateManifest(r.body, this.edb.voterCount());
    if (!v.ok) throw invalid(v.error, `manifest: ${v.detail ?? ''}`);
    const m = v.value.manifest;
    if (m.election_id !== this.id) throw invalid('E_MANIFEST', 'manifest election_id differs from this election');
    if (m.bb.log_pk !== bytesToHex(this.logPk)) throw invalid('E_MANIFEST', 'manifest bb.log_pk is not this election\'s log key');
    if (m.ballots.max_per_voter > 20) throw invalid('E_MANIFEST', 'ballots.max_per_voter exceeds the hard bound 20');
    if (m.bb.witness_quorum > this.env.cfg.witnesses.length) throw invalid('E_MANIFEST', 'witness_quorum exceeds the number of configured witnesses');
    const mhb = manifestHash(m);
    if (!verifyMultiSig(mhb, r, m.coordinator.keys, m.coordinator.m)) throw invalid('E_MANIFEST_SIG', 'fewer than m valid coordinator signatures');
    void h;
    return { rec };
  }

  private vNotice(h: EntryHeader, rec: unknown): Validated {
    const { mh } = this.needManifest();
    const b = (rec as { body?: { type?: unknown } } | null)?.body;
    if (b?.type === 'marker') {
      this.schema(S.multiSigned(S.marker), rec);
      const r = rec as MultiSignedRecord<MarkerBody>;
      const step = this.dkgStep();
      const allowed = ['dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close'];
      if (this.state !== 'CEREMONY' || step < 1 || step > 4 || r.body.name !== allowed[step - 1]) {
        throw wrongPhase(`expected marker ${allowed[step - 1] ?? 'none'} in the current ceremony step`);
      }
      this.multi(r, mh, h);
      return { rec };
    }
    const c = this.control(rec, mh, h);
    const s = this.state;
    switch (c.action) {
      case 'pause':
        if (s !== 'OPEN') throw wrongPhase('only an OPEN election can be paused');
        if (this.st.halts >= this.env.cfg.maxHalts) throw conflict(`max_halts (${this.env.cfg.maxHalts}) reached`);
        break;
      case 'resume':
        if (s !== 'PAUSED') throw wrongPhase('only a PAUSED election can be resumed');
        break;
      case 'invalidate':
        if (transition(this.st.state, 'invalidate') === undefined) throw wrongPhase(`cannot invalidate in state ${s}`);
        break;
      case 'security-notice':
        break;
      default:
        throw invalid('E_SCHEMA', 'action does not belong in a notice entry');
    }
    return { rec };
  }

  private vRound1(h: EntryHeader, rec: unknown): Validated {
    const { m, mh } = this.needManifest();
    const who = this.trusteeIdx(h);
    const type = (rec as { body?: { type?: unknown } } | null)?.body?.type;
    const step = this.dkgStep();
    if (type === 'dkg-commit') {
      this.schema(S.signed(S.dkgCommit), rec);
      const r = rec as SignedRecord<CommitBody>;
      if (step !== 1) throw wrongPhase('commitments are accepted between dkg-open and dkg-r1-open');
      if (r.body.i !== who.index) throw invalid('E_DKG_R1', 'commit index is not the author');
      if (this.st.commits.some((c) => c.body.i === r.body.i)) throw conflict('commitment already posted');
      this.signed(r, mh, who.pkHex);
      return { rec };
    }
    this.schema(S.signed(S.dkgDealing(m.t)), rec);
    const r = rec as SignedRecord<DealingBody>;
    if (step !== 2) throw wrongPhase('dealings are accepted between dkg-r1-open and dkg-r1-close');
    if (r.body.i !== who.index) throw invalid('E_DKG_R1', 'dealing index is not the author');
    if (this.st.dealings.some((d) => d.body.i === r.body.i)) throw conflict('dealing already posted');
    this.signed(r, mh, who.pkHex);
    const c = this.st.commits.find((x) => x.body.i === r.body.i);
    if (c === undefined || c.body.h !== bytesToHex(dealingCommitHash(mh, r.body.i, r.body))) throw invalid('E_DKG_R1', 'dealing does not match the earlier commitment');
    this.env.stats.proofVerifications++;
    const ck = checkDealing(mh, m.t, r.body);
    if (!ck.ok) throw invalid('E_DKG_R1', ck.detail ?? 'dealing invalid');
    return { rec };
  }

  private vRound2(h: EntryHeader, rec: unknown): Validated {
    const { mh } = this.needManifest();
    this.schema(S.signed(S.dkgShares), rec);
    const r = rec as SignedRecord<SharesBody>;
    const who = this.trusteeIdx(h);
    if (this.dkgStep() !== 3) throw wrongPhase('share packages are accepted between dkg-r1-close and dkg-r2-close');
    if (r.body.i !== who.index) throw invalid('E_DKG_R2', 'share package index is not the author');
    if (this.st.shares.some((s) => s.body.i === r.body.i)) throw conflict('share package already posted');
    this.signed(r, mh, who.pkHex);
    const dealers = this.st.dealings.map((d) => d.body.i);
    if (!dealers.includes(r.body.i)) throw invalid('E_DKG_R2', 'author did not post a dealing in round 1');
    const need = dealers.filter((j) => j !== r.body.i).sort((a, b) => a - b);
    if (r.body.shares.length !== need.length || r.body.shares.some((s, k) => s.j !== need[k])) throw invalid('E_DKG_R2', 'share package must hold exactly one entry per other dealer, ascending');
    return { rec };
  }

  private vRollCommit(h: EntryHeader, rec: unknown): Validated {
    const { m, mh } = this.needManifest();
    this.schema(S.multiSigned(S.rollCommit), rec);
    const r = rec as MultiSignedRecord<RollCommitBody>;
    this.multi(r, mh, h);
    const keys = this.edb.approvedKeysHex();
    const rr = rollRoot(keys);
    if (!rr.ok) throw invalid('E_ROLL', rr.detail ?? 'roll invalid');
    const rootHex = bytesToHex(rr.value);
    if (r.body.root !== rootHex || r.body.size !== keys.length) throw invalid('E_ROLL', 'roll_commit does not match the registered roll');
    if (m.roll.root !== undefined && (m.roll.root !== rootHex || m.roll.size !== keys.length)) throw invalid('E_ROLL', 'roll differs from manifest roll.root/size');
    const floor = effectiveMinCounted(m, keys.length);
    if (keys.length < floor) throw invalid('E_ROLL', `roll of ${keys.length} is smaller than min_counted_ballots ${floor}; the tally could never be decrypted`);
    return { rec, rollKeys: keys };
  }

  private inVotingWindow(): void {
    const { m } = this.needManifest();
    const now = this.env.nowSec();
    if (now < sec(m.voting_open) - m.clock_skew_s) throw wrongPhase('voting has not opened yet');
    if (now >= sec(m.voting_close)) throw wrongPhase('voting_close has passed; ballots are no longer accepted');
  }

  private vBallot(h: EntryHeader, rec: unknown): Validated {
    const st = this.st;
    const p = st.params;
    const { m } = this.needManifest();
    if (p === undefined || st.rollSet === undefined || this.state !== 'OPEN') throw wrongPhase(`ballots are not accepted while the election is ${this.state}`);
    this.inVotingWindow();
    const isCast = h.type === 'ballot';
    this.schema(isCast ? castEnvelopeSchema() : spoilEnvelopeSchema(), rec);
    const env = rec as CastEnvelope | SpoilEnvelope;
    if ((env.intent === 'cast') !== isCast) throw invalid('E_SCHEMA', `a ${env.intent} envelope does not belong in a ${h.type} entry`);
    const voter = env.body.voter;
    const authorPk = this.resolveAuthor(h);
    if (authorPk === undefined || bytesToHex(authorPk) !== voter || !st.rollSet.has(voter)) throw invalid('E_VOTER_NOT_ELIGIBLE', 'ballot voter is not the entry author or not on the roll');
    if (env.body.ctx !== bytesToHex(p.ctx)) throw invalid('E_CTX', 'ballot is bound to a different election context');
    const code = bytesToHex(ballotCode(p.ctx, env.body));
    const kid = b64u(h.author);
    if (env.intent === 'cast') {
      const expect = st.last.get(voter) ?? NO_SUPERSEDES;
      if (env.body.supersedes !== expect) throw invalid('E_SUPERSEDES', 'supersedes must reference the voter\'s previous admissible ballot');
      if ((st.casts.get(voter) ?? 0) + 1 > m.ballots.max_per_voter) throw new ApiError(429, 'REVOTE_LIMIT', 'max_per_voter reached', { reason: 'E_REVOTE_LIMIT', retryable: false });
      const owner = st.codeOwner.get(code);
      if (owner !== undefined && owner !== voter) throw invalid('E_DUP_CODE', 'ballot code already used by another voter');
      if (st.spoiledCodes.has(code)) throw invalid('E_SPOILED_CODE_CAST', 'this ballot code was spoiled');
    } else {
      if ((st.spoils.get(voter) ?? 0) + 1 > m.ballots.max_spoils_per_voter) throw new ApiError(429, 'REVOTE_LIMIT', 'max_spoils_per_voter reached', { reason: 'E_REVOTE_LIMIT', retryable: false });
      if (st.codeOwner.has(code)) throw invalid('E_SPOILED_CODE_CAST', 'this ballot code was already cast');
      if (env.reveal === undefined && env.reveal_digest === ZERO32 && m.spoil_trustee_decrypt !== true) throw invalid('E_SPOIL_MISMATCH', 'trustee-mode spoils are disabled by the manifest');
    }
    // ---- expensive part: voter signature then zero-knowledge proofs (QV-29-REQ-001)
    this.env.stats.proofVerifications++;
    const ve = verifyEnvelope(p, st.rollSet, rec);
    if (!ve.ok) throw invalid(ve.error, ve.detail ?? 'ballot invalid');
    if (env.intent === 'spoil' && env.reveal !== undefined) {
      const sr = verifySpoilReveal(p, env.body, env.reveal);
      if (!sr.ok) throw invalid('E_SPOIL_MISMATCH', sr.detail ?? 'reveal does not reproduce the ballot');
    }
    return { rec, ballot: { kid, kind: env.intent, voter, code } };
  }

  // ------------------------------------------------------------------ tally relay

  /** Counted-ballot analysis (cached; only meaningful after election_close). */
  private ensureAnalysis(): BallotAnalysis {
    const st = this.st;
    if (st.analysis) return st.analysis;
    if (st.params === undefined || st.rollSet === undefined || st.openSeq === undefined || st.closeSeq === undefined) throw conflict('election is not closed');
    const raws: { seq: number; raw: unknown }[] = [];
    for (const type of ['ballot', 'ballot_audit'] as const) {
      let from = 0;
      for (;;) {
        const page = this.edb.entries(from, 500, type);
        for (const r of page.rows) if (r.body) raws.push({ seq: r.seq, raw: parseQvJson(r.body) });
        if (!page.more) break;
        from = (page.rows.at(-1)?.seq ?? from) + 1;
      }
    }
    raws.sort((a, b) => a.seq - b.seq);
    st.analysis = analyzeBallotLog(st.params, st.rollSet, raws, st.openSeq, st.closeSeq);
    return st.analysis;
  }

  private ensureAggs(): Map<string, Map<string, Aggregate>> {
    const st = this.st;
    if (st.aggs) return st.aggs;
    const an = this.ensureAnalysis();
    st.aggs = aggregate(st.params!, an.counted);
    return st.aggs;
  }

  /** Posts the tally-aggregate entry once the close checkpoint is witnessed (QV-18 §9.4). Caller holds the mutex. */
  async maybeAggregateLocked(): Promise<void> {
    const st = this.st;
    if (this.state !== 'CLOSED' || st.closeSeq === undefined || this.srvKeys === undefined || st.params === undefined || st.manifest === undefined) return;
    if (!this.witnessedWithin(st.closeSeq, this.log.size)) return;
    const an = this.ensureAnalysis();
    const floor = effectiveMinCounted(st.manifest, st.rollSet!.size);
    if (an.counted.length < floor) {
      st.tallyBlocked = `E_BELOW_FLOOR: ${an.counted.length} counted < ${floor}`;
      return;
    }
    st.tallyBlocked = undefined;
    const aggs = this.ensureAggs();
    const body: AggregateBody = {
      proto: PROTO_ID, type: 'tally-aggregate', ctx: bytesToHex(st.params.ctx), n_counted: an.counted.length,
      counted_root: bytesToHex(countedRoot(an.counted)),
      aggregates: [...aggs].flatMap(([contest, m]) => [...m].map(([option, a]) => ({ contest, option, A: bytesToHex(pointToBytes(a.A)), B: bytesToHex(pointToBytes(a.B)) }))),
    };
    const record = signRecord(this.srvKeys.secretKey, this.srvKeys.publicKey, st.params.ctx, body);
    const bytes = jcs(record);
    const e = buildEntry({
      origin: this.origin, type: 'tally_aggregate', secretKey: this.srvKeys.secretKey, publicKey: this.srvKeys.publicKey,
      nonce: new Uint8Array(randomBytes(16)), createdAt: this.env.nowSec(), body: bytes, refs: [st.closeSeq],
    });
    await this.processLocked(e.headerBytes, bytes);
  }

  async attachCosignatures(size: number, lines: string[]): Promise<{ accepted: number; witnessed: boolean }> {
    return this.queued(async () => {
      const had = new Set(this.witnessInfo().cosigners);
      const r = this.log.attachCosignatures(size, lines, this.witnessPolicy());
      if (!r.ok) throw this.mapBoardErr(r.error.code, r.error.message);
      const before = lines.length;
      try {
        const info = this.witnessInfo();
        const fresh = info.cosigners.filter((x) => !had.has(x));
        if (fresh.length > 0) {
          const e = this.edb.store.getEntry(Math.max(0, size - 1));
          const lag = e ? Math.max(0, this.env.nowSec() - e.sequencedAt) : 0;
          this.emitNow((out) => {
            for (const wname of fresh) this.record(out, 'witness', null, { witness: wname, lag_seconds: lag, quorum_met: r.value.witnessed });
            if (info.size === size) this.record(out, 'checkpoint', null, this.checkpointData());
          });
        }
      } catch {
        /* events are best effort relative to the cosignature itself */
      }
      await this.maybeAggregateLocked();
      return { accepted: before, witnessed: r.value.witnessed };
    });
  }

  private vDecShares(h: EntryHeader, rec: unknown): Validated {
    const st = this.st;
    this.schema(S.signed(decSharesSchema), rec);
    const r = rec as SignedRecord<DecSharesBody>;
    const who = this.trusteeIdx(h);
    if (st.aggregateSeq === undefined || st.params === undefined || st.dkgPre === undefined) throw wrongPhase('no tally aggregate has been posted');
    const aggs = this.ensureAggs();
    if (r.body.j !== who.index || !st.decrypters.has(r.body.j)) throw forbidden('trustee did not complete key confirmation', 'AUTHOR_NOT_AUTHORIZED');
    if (st.decShares.has(r.body.j)) throw conflict('decryption shares already posted by this trustee');
    this.signed(r, st.params.ctx, who.pkHex);
    const Yj = st.dkgPre.Y.get(r.body.j)!;
    const expect = [...aggs].flatMap(([c, m]) => [...m.keys()].map((o) => shareKey(c, o)));
    if (r.body.shares.length !== expect.length) throw invalid('E_DEC_PROOF', 'shares must cover every aggregate exactly once');
    const seen = new Set<string>();
    this.env.stats.proofVerifications++;
    for (const s of r.body.shares) {
      const k = shareKey(s.contest, s.opt);
      const a = aggs.get(s.contest)?.get(s.opt);
      if (a === undefined || seen.has(k)) throw invalid('E_DEC_PROOF', `unexpected or duplicate share for ${k}`);
      seen.add(k);
      const p = shareFromHex(s);
      if (!p.ok) throw invalid(p.error, `share ${k} undecodable`);
      if (!decVerify({ ctx: st.params.ctx, cid: s.contest, oid: s.opt, j: r.body.j, Yj, A: a.A, B: a.B, M: p.value.M }, { c: p.value.c, s: p.value.s })) {
        throw invalid('E_DEC_PROOF', `share proof invalid for ${k}`);
      }
    }
    return { rec };
  }

  /** The tally record the coordinator should sign, from received shares (`use` selects a subset of trustees). */
  buildTallyDraft(use?: number[]): TallyBody {
    const st = this.st;
    if (st.params === undefined || st.dkgPre === undefined || st.manifest === undefined) throw conflict('election has no key');
    if (st.aggregateSeq === undefined) throw wrongPhase('no tally aggregate has been posted');
    const an = this.ensureAnalysis();
    const shares = new Map<number, ShareSet>();
    for (const [j, v] of [...st.decShares].sort((a, b) => a[0] - b[0])) if (use === undefined || use.includes(j)) shares.set(j, v.set);
    const spoiled: Parameters<typeof buildTally>[1]['spoiled'] = [];
    for (const rec of an.spoiled.values()) if (rec.env.reveal !== undefined) spoiled.push({ rec, mode: 'reveal', selections: rec.env.reveal.selections });
    const t = buildTally(st.params, { analysis: an, shares, Y: st.dkgPre.Y, decrypters: st.decrypters, rollSize: st.rollSet!.size, spoiled });
    if (!t.ok) throw conflict(`tally cannot be built yet: ${t.error}`, 'STATE_CONFLICT');
    return t.value.body;
  }

  private vTally(h: EntryHeader, rec: unknown): Validated {
    const st = this.st;
    if (st.params === undefined) throw wrongPhase('election has no key');
    this.schema(S.signed(tallySchema()), rec);
    const r = rec as SignedRecord<TallyBody>;
    const author = bytesToHex(this.coordByKid.get(b64u(h.author)) ?? new Uint8Array());
    if (r.sig.key !== author || !st.manifest!.coordinator.keys.includes(r.sig.key)) throw invalid('E_SIG', 'tally must be signed by the submitting coordinator key');
    if (!verifySig(st.params.ctx, 'tally', r.body, r.sig, author)) throw invalid('E_SIG', 'tally signature invalid');
    this.env.stats.proofVerifications++;
    let expected: TallyBody;
    try {
      expected = this.buildTallyDraft(r.body.decrypters);
    } catch (e) {
      if (e instanceof ApiError) throw invalid('E_RESULT', e.message);
      throw e;
    }
    if (bytesToHex(jcs(expected)) !== bytesToHex(jcs(r.body))) throw invalid('E_RESULT', 'tally differs from the server\'s recomputation from the received shares');
    return { rec };
  }

  // ------------------------------------------------------------------ operator actions

  /** Called after an audit_close entry: erase signing keys and make the store read-only (QV-28 §5: deleted at ARCHIVED). */
  finalizeArchive(): void {
    if (this.st.state !== 'ARCHIVED') return;
    this.edb.eraseKeys();
    this.edb.store.setReadOnly(true);
  }

  quarantineReason(): string | undefined {
    return this.log.status.state === 'quarantine' ? this.log.status.reason : undefined;
  }

  get registry(): RegistryRow {
    return this.reg;
  }

  decrypterList(): number[] {
    return [...this.st.decrypters].sort((a, b) => a - b);
  }
}

