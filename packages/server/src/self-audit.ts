// QV-18-REQ-054: periodic full audits use the same bounded FIFO job runner as operator audits/backups/imports.
import { selfAuditWork } from './admin.ts';
import type { Env } from './env.ts';
import { JobError, type JobCtl, type JobOutcome, type JobRunner } from './jobs.ts';
import type { ElectionPool } from './pool.ts';

export const SELF_AUDIT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const GROUP = 'periodic-self-audit';

export class SelfAuditScheduler {
  private readonly env: Env;
  private readonly pool: ElectionPool;
  private readonly jobs: JobRunner;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(env: Env, pool: ElectionPool, jobs: JobRunner) {
    this.env = env;
    this.pool = pool;
    this.jobs = jobs;
  }

  /** Called only after successful server startup. Restore already performs a full audit before publication. */
  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => this.schedule(), SELF_AUDIT_INTERVAL_MS);
    this.timer.unref();
  }

  /** Stop admission first; JobRunner.stop owns cancellation/draining before storage and directory ownership close. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.stopped || this.jobs.active(GROUP) > 0) return;
    try {
      this.jobs.submit(GROUP, 1, { kind: 'self_audit', election_id: null, params: { scope: 'all', trigger: 'periodic' }, created_by: 'system' },
        (ctl) => this.sweep(ctl));
    } catch {
      this.env.logger.event('self_audit_schedule', { outcome: 'error', error_code: 'SELF_AUDIT_SCHEDULE_FAILED' });
    }
  }

  private async sweep(ctl: JobCtl): Promise<JobOutcome> {
    let after: string | undefined;
    let checked = 0, mismatched = 0, unavailable = 0;
    const total = this.env.control.countAllElections();
    for (;;) {
      const page = this.env.control.listAllElections(undefined, after, 100);
      if (page.length === 0) break;
      for (const row of page) {
        await ctl.tick();
        try {
          const rt = await this.pool.get(row.election_id);
          if (ctl.signal.aborted) throw new JobError('CANCELLED', 'the server stopped before the job finished');
          if (!rt) continue; // Deleted after listing; never recreate its runtime or file.
          const outcome = await selfAuditWork(this.env, rt, ctl);
          checked++;
          if (!(outcome.result as { ok: boolean }).ok) mismatched++;
        } catch {
          if (ctl.signal.aborted) throw new JobError('CANCELLED', 'the server stopped before the job finished');
          unavailable++;
          // An unreadable election must not prevent auditing the remaining ones. No raw storage errors leave the job.
          this.env.control.audit('system', 'election.self_audit_unavailable', row.election_id, { code: 'SELF_AUDIT_UNAVAILABLE' });
        }
        ctl.progress(((checked + unavailable) / Math.max(total, 1)) * 0.9);
      }
      after = page.at(-1)!.election_id;
      if (page.length < 100) break;
    }
    const result = { ok: mismatched === 0 && unavailable === 0, checked, mismatched, unavailable };
    this.env.control.audit('system', 'self_audit.sweep', null, result);
    this.env.logger.event('self_audit_sweep', unavailable > 0
      ? { outcome: 'error', error_code: 'SELF_AUDIT_INCOMPLETE' }
      : mismatched > 0 ? { outcome: 'rejected', error_code: 'SELF_AUDIT_MISMATCH' } : { outcome: 'ok' });
    if (unavailable > 0) throw new JobError('SELF_AUDIT_INCOMPLETE', 'one or more election logs could not be fully audited', { checked, mismatched, unavailable });
    return { result };
  }
}
