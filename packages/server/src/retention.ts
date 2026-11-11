// Retention sweep (QV-28 §11.1, QV-28-REQ-013; B2-11): voter_invite.label_enc / contact_enc are NULLed once the retention grace has passed since
// the invite was registered/revoked/expired or the election opened. The same purge also runs lazily whenever invites are touched (app.ts);
// this timer covers elections nobody touches. It opens each election database briefly (WAL, busy_timeout) and never loads a runtime.
import { join } from 'node:path';
import { SERVER_VERSION } from './election.ts';
import { ElectionDb } from './electiondb.ts';
import type { Env } from './env.ts';

export class RetentionSweeper {
  private readonly env: Env;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(env: Env) {
    this.env = env;
  }

  start(): void {
    const ms = this.env.cfg.retentionSweepMs;
    if (ms <= 0 || this.timer) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), ms);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One sweep over all live, non-imported elections. Returns the number of invite rows purged. Never throws for one bad election. */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let total = 0;
    try {
      const { control, cfg } = this.env;
      let after: string | undefined;
      for (;;) {
        const page = control.listAllElections(undefined, after, 100);
        if (page.length === 0) break;
        for (const row of page) {
          if (row.imported === 1 || row.state === 'IMPORTED') continue; // mirrors hold no operator data
          let edb: ElectionDb | undefined;
          try {
            edb = new ElectionDb(join(cfg.dataDir, row.db_path), SERVER_VERSION);
            const n = edb.purgeInviteData(this.env.nowMs(), cfg.inviteRetentionMs);
            if (n > 0) {
              total += n;
              control.audit('system', 'invite.purge', row.election_id, { rows: n });
            }
          } catch {
            /* missing/locked/closing: retried at the next sweep */
          } finally {
            edb?.close();
          }
          await new Promise<void>((r) => setImmediate(r));
        }
        after = page.at(-1)!.election_id;
        if (page.length < 100) break;
      }
    } finally {
      this.running = false;
    }
    return total;
  }
}
