// Checkpoint gossip (QV-18 §9.5-9.6, QV-09 `POST /gossip/checkpoints`, QV-28 `gossip_seen`).
//
// Inbound: a peer (voter client, mirror, witness, another board) posts a signed note it holds; we answer with our latest note and,
// when the posted note is older than ours, a consistency proof. Outbound: `GossipService` pushes our latest note of every public
// election to the configured peers (SSRF policy of ssrf.ts: https only, public addresses only, pinned connection, no redirects)
// and checks what comes back with the very same code path.
//
// Trust rule: nothing a peer claims is believed. A note only counts if it is signed by THIS log's key (a peer cannot forge one),
// and every judgement (same / behind / ahead / diverged) is recomputed against our own tree. Evidence is built from our data, so
// a peer cannot make us quarantine ourselves by sending a bogus "proof".
import { createHash } from 'node:crypto';
import {
  b64, checkFork, checkInconsistent, parseCheckpoint, verifyConsistency, verifyLogSignature,
  type Checkpoint,
} from '@quietvote/board';
import { parseQvJson, sha256, utf8 } from '@quietvote/crypto';
import type { Env } from './env.ts';
import type { ElectionRuntime } from './election.ts';
import type { ElectionPool } from './pool.ts';
import { ApiError } from './problem.ts';
import { parseTargetUrl, systemResolver, validateTarget, httpsTransport, TargetRejected, type WebhookResolver, type WebhookTransport } from './ssrf.ts';

export const MAX_NOTE_CHARS = 8192;
export const MAX_NOTE_LINES = 24; // 3 text lines + blank + <= 20 signature lines
const MAX_EVIDENCE_ROWS = 64;
const SEEN_RETENTION_MS = 30 * 86_400_000;
const NOTE_CHARS = /^[ -~—\n]*$/; // printable ASCII, the em dash of signature lines, LF

export type Relation = 'same' | 'peer_behind' | 'peer_ahead' | 'diverged';

export interface Evidence {
  format: 'qv-equivocation/v1';
  kind: 'fork' | 'inconsistent' | 'rollback';
  notes: string[];
  proof?: { old_size: number; new_size: number; path: string[] };
}

export interface Assessment {
  relation: Relation;
  /** True only when the posted note is proven to be a prefix-consistent view of our log. */
  consistent: boolean;
  /** Standard base64 consistency proof from the posted size to our latest size (peer_behind only). */
  proof?: string[];
  evidence?: Evidence;
  latestNote: string | undefined;
}

/** Strict syntactic gate for a posted note (before any parsing cost): size, line count, character set. */
export function checkNoteText(note: string): void {
  if (note.length < 20 || note.length > MAX_NOTE_CHARS) throw new ApiError(400, 'BAD_REQUEST', `note must be 20..${MAX_NOTE_CHARS} characters`, { errors: [{ pointer: '/note', message: 'bad length' }] });
  if (!NOTE_CHARS.test(note)) throw new ApiError(400, 'BAD_REQUEST', 'note contains characters a signed note never has', { errors: [{ pointer: '/note', message: 'bad characters' }] });
  let lines = 0;
  for (let i = 0; i < note.length; i++) if (note.charCodeAt(i) === 10 && ++lines > MAX_NOTE_LINES) throw new ApiError(400, 'BAD_REQUEST', 'note has too many lines', { errors: [{ pointer: '/note', message: 'too many lines' }] });
}

/** Parses a note and requires the origin and the log signature of `rt`. Returns undefined when it is not ours. */
export function ownSignedNote(rt: ElectionRuntime, note: string): Checkpoint | undefined {
  if (note.length > MAX_NOTE_CHARS || !NOTE_CHARS.test(note)) return undefined;
  const p = parseCheckpoint(note);
  if (!p.ok || p.value.origin !== rt.origin || p.value.lines.length > 20) return undefined;
  return verifyLogSignature(p.value, rt.logPk) ? p.value : undefined;
}

const textFingerprint = (cp: Checkpoint): Uint8Array => sha256(utf8(cp.text));

/** Judges a note that is signed by our key against our own log. Synchronous: nothing can append in between. */
export function assess(rt: ElectionRuntime, theirs: Checkpoint, theirNote: string): Assessment {
  const store = rt.edb.store;
  const size = rt.log.size;
  const latest = store.latestCheckpoint();
  const latestNote = latest?.note;
  const evidenceBase = { format: 'qv-equivocation/v1' as const };
  const eq = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

  if (theirs.size > size) {
    // We hold fewer entries than our own key has signed for: rollback (QV-18 REQ-053). Not an offence for a read-only mirror.
    const notes = latestNote === undefined ? [theirNote] : [theirNote, latestNote];
    return { relation: 'peer_ahead', consistent: false, latestNote, ...(rt.imported ? {} : { evidence: { ...evidenceBase, kind: 'rollback' as const, notes } }) };
  }
  const mine = rt.log.root(theirs.size);
  if (eq(mine, theirs.root)) {
    if (theirs.size === size) return { relation: 'same', consistent: true, latestNote };
    const p = rt.log.consistencyProof(theirs.size, size);
    const path = p.ok ? p.value : [];
    if (p.ok && latest !== undefined && !verifyConsistency(theirs.size, size, theirs.root, rt.log.root(size), path)) {
      // our own tree produced a proof that does not verify: internal fault, never claim consistency
      return { relation: 'diverged', consistent: false, latestNote };
    }
    return { relation: 'peer_behind', consistent: true, proof: path.map(b64), latestNote };
  }
  // Roots differ at a size we hold: our key signed a history our own tree does not contain.
  const ours = store.getCheckpoint(theirs.size);
  if (ours !== undefined) {
    const parsedOurs = parseCheckpoint(ours.note);
    const kind = parsedOurs.ok && verifyLogSignature(parsedOurs.value, rt.logPk) && checkFork(ours.note, theirNote, rt.logPk).ok;
    if (kind) return { relation: 'diverged', consistent: false, latestNote, evidence: { ...evidenceBase, kind: 'fork', notes: [ours.note, theirNote] } };
  }
  if (latest !== undefined && theirs.size < size) {
    const p = rt.log.consistencyProof(theirs.size, size);
    if (p.ok) {
      const path = p.value;
      if (checkInconsistent(theirNote, latest.note, path, rt.logPk).ok) {
        return {
          relation: 'diverged', consistent: false, latestNote,
          evidence: { ...evidenceBase, kind: 'inconsistent', notes: [theirNote, latest.note], proof: { old_size: theirs.size, new_size: size, path: path.map(b64) } },
        };
      }
    }
  }
  return { relation: 'diverged', consistent: false, latestNote, evidence: { ...evidenceBase, kind: 'rollback', notes: latestNote === undefined ? [theirNote] : [theirNote, latestNote] } };
}

export interface Judged {
  assessment: Assessment;
  /** Set when this call recorded new evidence. */
  recorded: boolean;
  incident?: string;
}

/**
 * Records the outcome: gossip_seen row (bounded) and, for evidence, an append-only evidence row plus - for a live log - the
 * fail-closed quarantine and an `alert` event. Returns what was decided.
 */
export function judge(env: Env, rt: ElectionRuntime, theirs: Checkpoint, theirNote: string, source: 'inbound' | 'outbound'): Judged {
  const a = assess(rt, theirs, theirNote);
  const now = env.nowMs();
  rt.edb.recordGossip(textFingerprint(theirs), theirs.size, theirs.root, now, a.consistent, env.cfg.gossipSeenMax, SEEN_RETENTION_MS);
  if (a.evidence === undefined) return { assessment: a, recorded: false };
  const fp = new Uint8Array(createHash('sha256').update(a.evidence.kind).update('\0').update(a.evidence.notes.map((n) => parseCheckpoint(n)).map((p) => (p.ok ? p.value.text : '')).join('\0')).digest());
  const size = Math.max(theirs.size, rt.log.size);
  const recorded = rt.edb.addEvidence(fp, a.evidence.kind, size, source, now, JSON.stringify(a.evidence), MAX_EVIDENCE_ROWS);
  let incident: string | undefined;
  if (!rt.imported) {
    incident = rt.markQuarantine(a.evidence.kind === 'rollback' ? 'ROLLBACK_SUSPECTED' : 'EQUIVOCATION', a.evidence.kind === 'rollback' ? theirs.size : 0, a.evidence.kind === 'rollback' ? 'rollback' : 'equivocation');
  } else if (recorded) {
    rt.raiseAlert(a.evidence.kind === 'rollback' ? 'rollback' : 'equivocation', 'GOSSIP_EVIDENCE');
  }
  env.logger.event('gossip_evidence', { election_id: rt.id, note: `${a.evidence.kind}/${source}`, outcome: 'rejected' });
  return incident === undefined ? { assessment: a, recorded } : { assessment: a, recorded, incident };
}

/** Body of the 200 answer (QV-09: `{latest_note, consistent, proof?}` plus additive `relation`, `tree_size`). */
export function gossipAnswer(rt: ElectionRuntime, a: Assessment, theirSize: number): Record<string, unknown> {
  return {
    latest_note: a.latestNote ?? null, consistent: a.consistent, relation: a.relation, tree_size: rt.log.size,
    ...(a.proof !== undefined ? { proof: { old_size: theirSize, new_size: rt.log.size, path: a.proof } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------- outbound

export interface GossipStats {
  runs: number;
  sent: number;
  ok: number;
  failed: number;
  blocked: number;
  badResponses: number;
  evidence: number;
}

/** Pushes our latest note of every public election to the configured peers. Bounded, SSRF-checked, never follows redirects. */
export class GossipService {
  readonly stats: GossipStats = { runs: 0, sent: 0, ok: 0, failed: 0, blocked: 0, badResponses: 0, evidence: 0 };
  private readonly env: Env;
  private readonly pool: ElectionPool;
  private readonly peers: string[];
  private readonly resolver: WebhookResolver;
  private readonly transport: WebhookTransport;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(env: Env, pool: ElectionPool) {
    this.env = env;
    this.pool = pool;
    const peers = env.cfg.gossipPeers;
    if (peers.length > 16) throw new Error('config gossipPeers: at most 16 peers');
    for (const p of peers) {
      try {
        parseTargetUrl(p); // static SSRF policy at start: a bad peer refuses start (fail closed)
      } catch (e) {
        throw new Error(`config gossipPeers: ${e instanceof TargetRejected ? `${e.code}: ${e.message}` : 'invalid url'}`);
      }
    }
    this.peers = peers.map((p) => p.replace(/\/+$/, ''));
    this.resolver = env.cfg.gossipResolver ?? systemResolver;
    this.transport = env.cfg.gossipTransport ?? httpsTransport();
    if (this.peers.length > 0 && env.cfg.gossipIntervalMs > 0) {
      this.timer = setInterval(() => void this.runOnce().catch(() => undefined), env.cfg.gossipIntervalMs);
      this.timer.unref();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One round over all public, non-draft elections. Re-entrant calls return immediately. */
  async runOnce(): Promise<GossipStats> {
    if (this.running || this.stopped || this.peers.length === 0) return this.stats;
    this.running = true;
    this.stats.runs++;
    try {
      let after: string | undefined;
      let budget = 256; // elections per round
      for (;;) {
        const rows = this.env.control.listAllElections(undefined, after, 50);
        if (rows.length === 0) break;
        for (const r of rows) {
          after = r.election_id;
          if (this.stopped || budget-- <= 0) return this.stats;
          if (r.access !== 'public' || r.state === 'DRAFT') continue;
          const rt = await this.pool.get(r.election_id);
          if (!rt) continue;
          const note = rt.edb.store.latestCheckpoint()?.note;
          if (note === undefined) continue;
          for (const peer of this.peers) {
            if (this.stopped) return this.stats;
            await this.exchangeOne(rt, peer, note);
          }
        }
      }
    } finally {
      this.running = false;
    }
    return this.stats;
  }

  private async exchangeOne(rt: ElectionRuntime, peer: string, note: string): Promise<void> {
    const url = `${peer}/api/v1/gossip/checkpoints`;
    this.stats.sent++;
    let status = 0;
    let body: Buffer | undefined;
    try {
      const t = await validateTarget(url, this.resolver); // re-validated every time: DNS may have changed
      const r = await this.transport({
        url: t.url, ip: t.ip, family: t.family, timeoutMs: this.env.cfg.gossipTimeoutMs, maxResponseBytes: 32 * 1024, captureBody: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'quietvote-gossip/1' },
        body: Buffer.from(JSON.stringify({ note })),
      });
      if (r.truncated) {
        this.stats.badResponses++;
        return;
      }
      status = r.status;
      body = r.body;
    } catch (e) {
      if (e instanceof TargetRejected) this.stats.blocked++;
      else this.stats.failed++;
      return;
    }
    if (status !== 200 && status !== 409) {
      this.stats.failed++;
      return;
    }
    let notes: string[] = [];
    try {
      const j = parseQvJson(body ?? new Uint8Array()) as Record<string, unknown>;
      if (status === 200) {
        if (typeof j['latest_note'] === 'string') notes = [j['latest_note']];
      } else {
        const ev = j['evidence'] as { notes?: unknown } | undefined;
        if (Array.isArray(ev?.notes)) notes = ev.notes.filter((n): n is string => typeof n === 'string').slice(0, 2);
      }
    } catch {
      this.stats.badResponses++;
      return;
    }
    this.stats.ok++;
    if (status === 200 && notes.length === 0) this.stats.badResponses++;
    for (const n of notes) {
      const cp = ownSignedNote(rt, n); // a peer's claims are checked, never trusted
      if (cp === undefined) {
        if (status === 200) this.stats.badResponses++;
        continue;
      }
      const j = judge(this.env, rt, cp, n, 'outbound');
      if (j.recorded) this.stats.evidence++;
    }
  }
}

