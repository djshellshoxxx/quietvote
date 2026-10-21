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
  constructor(env: Env) {
    this.env = env;
  }

  openCount(): number {
    return this.open.size;
  }

  async get(id: string): Promise<ElectionRuntime | undefined> {
    const hit = this.open.get(id);
    if (hit && !hit.poisoned) {
      this.open.delete(id);
      this.open.set(id, hit);
      return hit;
    }
    if (hit?.poisoned) await this.evict(id);
    let p = this.opening.get(id);
    if (!p) {
      p = this.load(id).finally(() => this.opening.delete(id));
      this.opening.set(id, p);
    }
    return p;
  }

  private async load(id: string): Promise<ElectionRuntime | undefined> {
    const reg = this.env.control.election(id);
    if (!reg) return undefined;
    const rt = await ElectionRuntime.open(this.env, reg);
    this.open.set(id, rt);
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
    const reg = this.env.control.election(id);
    if (!reg) return;
    const ok = ['DRAFT', 'ARCHIVED', 'CANCELLED', 'ABORTED', 'IMPORTED'].includes(reg.state);
    if (!ok) throw conflict(`election in state ${reg.state} cannot be deleted; unmet condition: state must be DRAFT, ARCHIVED, CANCELLED or ABORTED`);
    this.env.control.markDeleted(id); // wraps DEK away first
    await this.evict(id);
    const base = join(this.env.cfg.dataDir, reg.db_path);
    for (const suffix of ['', '-wal', '-shm']) rmSync(base + suffix, { force: true });
    this.env.control.audit('system', 'election.delete', id);
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.open.keys()]) await this.evict(id);
  }
}
