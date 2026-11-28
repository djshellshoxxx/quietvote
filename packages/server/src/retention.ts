// Retention sweep (QV-28 §11.1, QV-28-REQ-013; B2-11): voter_invite.label_enc / contact_enc are NULLed once the retention grace has passed since
// the invite was registered/revoked/expired or the election opened. The same purge also runs lazily whenever invites are touched (app.ts);
// this timer covers elections nobody touches. It opens each election database briefly (WAL, busy_timeout) and never loads a runtime.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SERVER_VERSION } from './election.ts';
import { ElectionDb } from './electiondb.ts';
import { DELETED_BACKUP_RETENTION_MS, pruneMigrationBackups } from './migration-backup-retention.ts';
import type { Env } from './env.ts';

export interface RetentionStatus {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  checkedDatabases: number;
  failedDatabases: number;
  prunedMigrationBackups: number;
}

export class RetentionSweeper {
  private readonly env: Env;
  private timer: NodeJS.Timeout | undefined;
  private pending: Promise<number> | undefined;
  private health: RetentionStatus = { lastSuccessAt: null, lastFailureAt: null, consecutiveFailures: 0, checkedDatabases: 0, failedDatabases: 0, prunedMigrationBackups: 0 };

  get status(): Readonly<RetentionStatus> { return { ...this.health }; }

  constructor(env: Env) {
    this.env = env;
  }

  start(): void {
    const ms = this.env.cfg.retentionSweepMs;
    if (ms <= 0 || this.timer) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), ms);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.pending?.catch(() => undefined);
  }

  /** One sweep over all live, non-imported elections. Returns the number of invite rows purged. Never throws for one bad election. */
  runOnce(): Promise<number> {
    if (this.pending) return this.pending;
    const job = this.sweep();
    this.pending = job;
    void job.finally(() => { if (this.pending === job) this.pending = undefined; }).catch(() => undefined);
    return job;
  }

  private async sweep(): Promise<number> {
    let total = 0;
    let checked = 0;
    let failed = 0;
    let backups = 0;
    let complete = false;
    try {
      const { control, cfg } = this.env;
      backups += pruneMigrationBackups(join(cfg.dataDir, 'control.sqlite'), this.env.nowMs());
      let after: string | undefined;
      for (;;) {
        const page = control.listAllElections(undefined, after, 100);
        if (page.length === 0) break;
        for (const row of page) {
          checked++;
          let edb: ElectionDb | undefined;
          let bad = false;
          try {
            if (!/^[0-9a-f]{32}$/.test(row.election_id) || row.db_path !== join('elections', row.election_id.slice(0, 2), `${row.election_id}.sqlite`)) {
              throw new Error('invalid election retention path');
            }
            const path = join(cfg.dataDir, row.db_path);
            backups += pruneMigrationBackups(path, this.env.nowMs());
            if (row.imported === 1 || row.state === 'IMPORTED') continue; // mirrors have no private invite/receipt maintenance
            if (!existsSync(path)) throw new Error('missing election database');
            edb = new ElectionDb(path, SERVER_VERSION, { allowMigrations: false });
            edb.purgeOperationReceipts(this.env.nowMs());
            const n = edb.purgeInviteData(this.env.nowMs(), cfg.inviteRetentionMs);
            if (n > 0) {
              total += n;
              control.audit('system', 'invite.purge', row.election_id, { rows: n });
            }
          } catch {
            bad = true; // Retry next sweep; persist only aggregate counts, never error text or personal fields.
          } finally {
            try { edb?.close(); } catch { bad = true; }
            if (bad) failed++;
          }
          await new Promise<void>((r) => setImmediate(r));
        }
        after = page.at(-1)!.election_id;
        if (page.length < 100) break;
      }
      // Deleted DB files are absent, but their tombstones still locate dedicated migration snapshots.
      // This does not purge ordinary instance backups, exported artifacts or independent restore floors.
      after = undefined;
      for (;;) {
        const page = control.db.prepare("SELECT election_id,db_path,deleted_at FROM election_registry WHERE state='DELETED' AND deleted_at<=? AND (? IS NULL OR election_id>?) ORDER BY election_id LIMIT 100")
          .all(this.env.nowMs() - DELETED_BACKUP_RETENTION_MS, after ?? null, after ?? null) as { election_id: string; db_path: string; deleted_at: number }[];
        if (page.length === 0) break;
        for (const row of page) {
          checked++;
          try {
            if (!/^[0-9a-f]{32}$/.test(row.election_id) || row.db_path !== join('elections', row.election_id.slice(0, 2), `${row.election_id}.sqlite`)) {
              throw new Error('invalid deleted election retention path');
            }
            backups += pruneMigrationBackups(join(cfg.dataDir, row.db_path), this.env.nowMs(), row.deleted_at);
          } catch { failed++; }
          await new Promise<void>((r) => setImmediate(r));
        }
        after = page.at(-1)!.election_id;
        if (page.length < 100) break;
      }
      complete = failed === 0;
    } finally {
      let auditFailed = false;
      let auditError: unknown;
      try {
        this.env.control.audit('system', 'retention.sweep', null, { checked, failed, purged: total, migration_backups_pruned: backups, complete });
      } catch (error) {
        auditFailed = true;
        auditError = error;
        complete = false;
      }
      this.health.checkedDatabases = checked;
      this.health.failedDatabases = failed;
      this.health.prunedMigrationBackups = backups;
      if (complete) {
        this.health.lastSuccessAt = this.env.nowMs();
        this.health.consecutiveFailures = 0;
      } else {
        this.health.lastFailureAt = this.env.nowMs();
        this.health.consecutiveFailures++;
      }
      this.env.logger.event('retention_sweep', complete
        ? { outcome: 'ok' }
        : { outcome: 'error', error_code: auditFailed ? 'RETENTION_AUDIT_FAILED' : 'RETENTION_SWEEP_FAILED' });
      if (auditFailed) throw auditError;
    }
    return total;
  }
}
