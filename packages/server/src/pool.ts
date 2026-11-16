// LRU pool of open election runtimes (QV-28 §7: bounded pool, one DB file per election, never a cross-election query).
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ed25519Keypair } from '@quietvote/crypto';
import { ElectionDb } from './electiondb.ts';
import { ElectionRuntime, SERVER_VERSION } from './election.ts';
import type { Env } from './env.ts';
import { seal } from './kek.ts';
import { originOf } from './util.ts';
import { sha256 } from '@quietvote/crypto';
import { ApiError, conflict } from './problem.ts';

export class ElectionPool {
  private readonly env: Env;
  private readonly open = new Map<string, ElectionRuntime>();
  private readonly opening = new Map<string, Promise<ElectionRuntime | undefined>>();
  private closing: Promise<void> | undefined;
  private stopping = false;
  constructor(env: Env) {
    this.env = env;
    // No election handles exist yet; finish crypto-erased files before accepting any work.
    this.resumeDeletions();
  }

  private cleanupDeleted(id: string, path: string): void {
    if (!/^[0-9a-f]{32}$/.test(id) || path !== join('elections', id.slice(0, 2), `${id}.sqlite`)) {
      throw new Error('invalid election cleanup path; refusing file removal');
    }
    const base = join(this.env.cfg.dataDir, path);
    for (const suffix of ['', '-wal', '-shm']) rmSync(base + suffix, { force: true });
    this.env.control.finishElectionCleanup(id);
  }

  private resumeDeletions(): void {
    for (const row of this.env.control.pendingElectionCleanup()) this.cleanupDeleted(row.election_id, row.db_path);
  }

  openCount(): number {
    return this.open.size;
  }

  private ensureRunning(): void {
    if (this.stopping || this.closing) throw new ApiError(503, 'MAINTENANCE', 'server is shutting down');
  }

  async get(id: string): Promise<ElectionRuntime | undefined> {
    this.ensureRunning();
    const hit = this.open.get(id);
    if (hit && !hit.poisoned) {
      this.open.delete(id);
      this.open.set(id, hit);
      hit.recoverEvents();
      return hit;
    }
    if (hit?.poisoned) await this.evict(id);
    this.ensureRunning();
    let p = this.opening.get(id);
    if (!p) {
      p = this.load(id).finally(() => this.opening.delete(id));
      this.opening.set(id, p);
    }
    const rt = await p;
    this.ensureRunning();
    return rt;
  }

  private async load(id: string): Promise<ElectionRuntime | undefined> {
    const reg = this.env.control.election(id);
    if (!reg) return undefined;
    const rt = await ElectionRuntime.open(this.env, reg);
    this.open.set(id, rt);
    // finish a tally aggregate interrupted by a crash (idempotent; a failure is retried on the next cosignature)
    await rt.recoverTally().catch(() => this.env.logger.event('tally_recover', { outcome: 'error' }));
    rt.recoverEvents();
    await this.trim();
    return rt;
  }

  private async trim(): Promise<void> {
    while (this.open.size > this.env.cfg.maxOpenElections) {
      const victim = [...this.open].find(([, r]) => r.inUse === 0 && r.mutex.pending === 0);
      if (!victim) return;
      await this.evict(victim[0]);
    }
  }

  async evict(id: string): Promise<void> {
    const rt = this.open.get(id);
    this.open.delete(id);
    // let in-flight writers drain before closing the handle
    if (rt) {
      await rt.mutex.run(async () => undefined).catch(() => undefined);
      rt.close();
    }
  }

  async create(orgId: string, title: string, access: 'public' | 'link'): Promise<{ id: string; origin: string; logPk: Uint8Array; readKey?: string }> {
    this.ensureRunning();
    const { control, kek, cfg } = this.env;
    if (control.countElections(orgId) >= cfg.maxElectionsPerOrg) throw new ApiError(429, 'RATE_LIMITED', 'election quota reached for this organization', { retryable: false });
    const id = randomBytes(16).toString('hex');
    const origin = originOf(id);
    const rel = join('elections', id.slice(0, 2), `${id}.sqlite`);
    mkdirSync(dirname(join(cfg.dataDir, rel)), { recursive: true, mode: 0o700 });
    const dek = new Uint8Array(randomBytes(32));
    const logKp = ed25519Keypair();
    const srvKp = ed25519Keypair();
    let readKey: string | undefined;
    let readKeyHash: Uint8Array | null = null;
    if (access === 'link') {
      readKey = randomBytes(16).toString('base64url');
      readKeyHash = sha256(new TextEncoder().encode(`QV-READKEY-v1\0${readKey}`));
    }
    control.insertElection({ election_id: id, org_id: orgId, db_path: rel, access, title, dek_wrapped: seal(kek, dek, `dek:${id}`) });
    try {
      const edb = new ElectionDb(join(cfg.dataDir, rel), SERVER_VERSION);
      try {
        edb.init({
          election_id: id, origin, state: 'DRAFT', log_pk: logKp.publicKey, log_sk_enc: seal(dek, logKp.secretKey, 'log_sk'),
          srv_pk: srvKp.publicKey, srv_sk_enc: seal(dek, srvKp.secretKey, 'srv_sk'), access, read_key_hash: readKeyHash, title, org_id: orgId,
          created_at: this.env.nowMs(),
        });
      } finally {
        edb.close();
      }
    } catch (e) {
      control.markDeleted(id);
      throw e;
    }
    return readKey === undefined ? { id, origin, logPk: logKp.publicKey } : { id, origin, logPk: logKp.publicKey, readKey };
  }

  /** QV-28 §11.2: crypto-erase first, then close and unlink. */
  async remove(id: string): Promise<void> {
    this.ensureRunning();
    const reg = this.env.control.election(id);
    if (!reg) {
      const pending = this.env.control.pendingElectionCleanup().find((row) => row.election_id === id);
      if (pending) {
        await this.evict(id);
        this.cleanupDeleted(id, pending.db_path);
      }
      return;
    }
    const deletable = (s: string): boolean => ['DRAFT', 'ARCHIVED', 'CANCELLED', 'ABORTED', 'IMPORTED'].includes(s);
    if (!deletable(reg.state)) throw conflict(`election in state ${reg.state} cannot be deleted; unmet condition: state must be DRAFT, ARCHIVED, CANCELLED, ABORTED or IMPORTED`);
    // The registry may lag the log after a crash: the election's own replayed state is authoritative (opening it also heals the registry).
    const rt = await this.get(id);
    if (rt && !deletable(rt.logState)) throw conflict(`election in state ${rt.logState} cannot be deleted; unmet condition: state must be DRAFT, ARCHIVED, CANCELLED, ABORTED or IMPORTED`);
    this.env.control.markDeleted(id); // wraps DEK away first
    await this.evict(id);
    this.cleanupDeleted(id, reg.db_path);
  }

  /** Drain and evict cached runtimes, permitting later replay. Acquisition is refused during the drain. */
  closeAll(): Promise<void> {
    this.closing ??= (async () => {
      await Promise.allSettled([...this.opening.values()]);
      for (const id of [...this.open.keys()]) await this.evict(id);
    })().finally(() => { this.closing = undefined; });
    return this.closing;
  }

  /** Permanently refuse acquisition and drain before process ownership can transfer. */
  shutdown(): Promise<void> {
    this.stopping = true;
    return this.closeAll();
  }
}
