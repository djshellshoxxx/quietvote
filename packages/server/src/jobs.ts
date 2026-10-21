// In-process job runner for imports, backups, self-audits and deletions (QV-09 `Job`, QV-28 `job`). One job runs at a time, in
// submission order; the input of a job lives in memory only, so jobs that were queued or running when the process died are marked
// failed ("INTERRUPTED") at the next start. Errors are reduced to {code, detail, ...} - no stack traces, no secrets.
import type { Env } from './env.ts';
import type { JobKind, JobRow } from './controldb.ts';
import { ApiError } from './problem.ts';
import { randomId } from './util.ts';

export class JobError extends Error {
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(code: string, detail: string, extra: Record<string, unknown> = {}) {
    super(detail);
    this.code = code;
    this.extra = extra;
  }
}

export interface JobCtl {
  readonly jobId: string;
  progress(p: number): void;
  /** Lets the event loop run; throws JobError(CANCELLED) once the server is stopping. */
  tick(): Promise<void>;
}
export interface JobOutcome {
  result?: unknown;
  result_ref?: string;
}
type Work = (ctl: JobCtl) => Promise<JobOutcome>;

export function jobView(j: JobRow): Record<string, unknown> {
  return {
    job_id: j.job_id, kind: j.kind, state: j.state, progress: j.progress, ...(j.election_id ? { election_id: j.election_id } : {}),
    created_at: new Date(j.created_at).toISOString().replace('.000Z', 'Z'),
    ...(j.finished_at ? { finished_at: new Date(j.finished_at).toISOString().replace('.000Z', 'Z') } : {}),
    ...(j.error ? { error: JSON.parse(j.error) } : {}), ...(j.result_ref ? { result_ref: j.result_ref } : {}), ...(j.result ? { result: JSON.parse(j.result) } : {}),
  };
}

function reduceError(e: unknown): Record<string, unknown> {
  if (e instanceof JobError) return { code: e.code, detail: e.message, ...e.extra };
  if (e instanceof ApiError) return { code: e.code, status: e.status, detail: e.message };
  const j = (e as { toJSON?: () => unknown } | null)?.toJSON;
  if (typeof j === 'function') return j.call(e) as Record<string, unknown>;
  return { code: 'INTERNAL', detail: 'the job failed unexpectedly' };
}

export class JobRunner {
  private readonly env: Env;
  private readonly queue: { id: string; group: string; work: Work }[] = [];
  private current: { id: string; group: string; done: Promise<void> } | undefined;
  private stopped = false;

  constructor(env: Env) {
    this.env = env;
    env.control.failInterruptedJobs(env.cfg.jobRetentionMs);
  }

  /** Jobs of one group that are queued or running. */
  active(group: string): number {
    return this.queue.filter((q) => q.group === group).length + (this.current?.group === group ? 1 : 0);
  }

  submit(group: string, cap: number, spec: { kind: JobKind; election_id: string | null; params: unknown; created_by: string }, work: Work): JobRow {
    if (this.stopped) throw new ApiError(503, 'MAINTENANCE', 'server is shutting down');
    if (this.active(group) >= cap) throw new ApiError(503, 'BUSY', 'too many jobs of this kind are queued; retry later', { retryAfter: 30 });
    const row = this.env.control.createJob({ job_id: randomId(), kind: spec.kind, election_id: spec.election_id, params: JSON.stringify(spec.params ?? {}), created_by: spec.created_by });
    this.queue.push({ id: row.job_id, group, work });
    void this.pump();
    return row;
  }

  private async pump(): Promise<void> {
    if (this.current !== undefined || this.stopped) return;
    const next = this.queue.shift();
    if (next === undefined) return;
    const done = this.run(next).finally(() => {
      this.current = undefined;
      void this.pump();
    });
    this.current = { id: next.id, group: next.group, done };
  }

  private async run(j: { id: string; work: Work }): Promise<void> {
    const c = this.env.control;
    c.startJob(j.id);
    const ctl: JobCtl = {
      jobId: j.id,
      progress: (p) => {
        try {
          c.setJobProgress(j.id, p);
        } catch {
          /* progress is advisory */
        }
      },
      tick: async () => {
        await new Promise<void>((r) => setImmediate(r));
        if (this.stopped) throw new JobError('CANCELLED', 'the server stopped before the job finished');
      },
    };
    try {
      const out = await j.work(ctl);
      c.finishJob(j.id, { state: 'done', ...(out.result !== undefined ? { result: out.result } : {}), result_ref: out.result_ref ?? null }, this.env.cfg.jobRetentionMs);
    } catch (e) {
      if (!(e instanceof JobError) && !(e instanceof ApiError) && typeof (e as { toJSON?: unknown })?.toJSON !== 'function') this.env.logger.event('internal_error', { route: 'job', error_code: (e as Error)?.name ?? 'Error', outcome: 'error' });
      try {
        c.finishJob(j.id, { state: 'failed', error: reduceError(e) }, this.env.cfg.jobRetentionMs);
      } catch {
        /* control db closed during shutdown */
      }
    }
  }

  /** Stops accepting work, fails queued jobs and waits (bounded) for the running one to notice. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const q of this.queue.splice(0)) {
      try {
        this.env.control.finishJob(q.id, { state: 'failed', error: { code: 'CANCELLED', detail: 'the server stopped before the job started' } }, this.env.cfg.jobRetentionMs);
      } catch {
        /* closing */
      }
    }
    const cur = this.current;
    if (cur) await Promise.race([cur.done, new Promise<void>((r) => setTimeout(r, 5000).unref())]);
  }
}
