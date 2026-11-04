// Main-thread controller for the standalone verifier's Worker (audit B3-26). DOM-free and given a Worker-like factory so the
// state machine is unit-tested (test/verifier-controller.test.ts). Invariants:
// * Only a structurally valid report from the verifier is ever a `result`. A worker error, crash, malformed message,
//   message-deserialization error or timeout is a `failed` outcome, which the page renders as FAIL.
// * Cancel terminates the worker and yields `cancelled`, never a result; a late message after settling is ignored.
// * If no worker can be started (no Worker API, creation throws, or the script never loads), the same job runs on the main
//   thread (the pre-B3-26 path). That fallback is the hash-pinned page code itself, so a blocked worker cannot weaken the check.
import { isBundleResult, type BundleResult, type Phase, type VerifyJob } from './bundle.ts';

/** The subset of `Worker` the controller uses. */
export interface WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessageerror: ((e: unknown) => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
}

export type Engine = 'worker' | 'main-thread';

export type Outcome =
  | { kind: 'result'; result: BundleResult; engine: Engine }
  | { kind: 'failed'; detail: string; engine: Engine }
  | { kind: 'cancelled'; engine: Engine };

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface ControllerDeps {
  /** Returns a started worker, or undefined/throws when none can be created (old browser, file://, blocked policy). */
  createWorker: (() => WorkerLike | undefined) | undefined;
  /** The in-thread path: `verifyBundle`. */
  inThread: (job: VerifyJob, onPhase: (p: Exclude<Phase, 'done'>) => void) => Promise<BundleResult>;
  /** No `ready` from the worker within this time: treated as "could not start" and the job falls back to the main thread. */
  readyTimeoutMs?: number;
  /** Whole-job limit once the worker is running: exceeded means FAIL. */
  timeoutMs?: number;
  timers?: Timers;
}

export interface Running {
  readonly outcome: Promise<Outcome>;
  /** Which engine is currently running the job (may change from worker to main-thread before the worker reports ready). */
  readonly engine: Engine;
  cancel(): void;
}

export const DEFAULT_READY_TIMEOUT_MS = 15_000;
export const DEFAULT_TIMEOUT_MS = 30 * 60_000;

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export function startVerification(deps: ControllerDeps, job: VerifyJob, onPhase: (p: Phase, engine: Engine) => void): Running {
  const timers = deps.timers ?? realTimers;
  let settled = false;
  let engine: Engine = 'worker';
  let worker: WorkerLike | undefined;
  let readyTimer: unknown;
  let jobTimer: unknown;
  let resolveOutcome!: (o: Outcome) => void;
  const outcome = new Promise<Outcome>((r) => { resolveOutcome = r; });

  const stopWorker = (): void => {
    if (readyTimer !== undefined) timers.clear(readyTimer);
    if (jobTimer !== undefined) timers.clear(jobTimer);
    readyTimer = jobTimer = undefined;
    const w = worker;
    worker = undefined;
    if (w) {
      w.onmessage = w.onerror = w.onmessageerror = null;
      try { w.terminate(); } catch { /* already gone */ }
    }
  };
  const finish = (o: Outcome): void => {
    if (settled) return;
    settled = true;
    stopWorker();
    if (o.kind === 'result') onPhase('done', o.engine);
    resolveOutcome(o);
  };
  const fail = (detail: string): void => finish({ kind: 'failed', detail, engine });

  const fallback = (): void => {
    if (settled) return;
    stopWorker();
    engine = 'main-thread';
    let p: Promise<BundleResult>;
    try {
      p = deps.inThread(job, (ph) => { if (!settled) onPhase(ph, 'main-thread'); });
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      (result) => (isBundleResult(result) ? finish({ kind: 'result', result, engine: 'main-thread' }) : fail('verification produced no report')),
      (e: unknown) => fail(e instanceof Error && e.message ? e.message : 'verification failed'),
    );
  };

  let w: WorkerLike | undefined;
  try {
    w = deps.createWorker?.();
  } catch {
    w = undefined;
  }
  if (!w) {
    fallback();
  } else {
    worker = w;
    let ready = false;
    w.onmessage = (e): void => {
      if (settled || worker !== w) return;
      const m = e.data as { type?: unknown; phase?: unknown; result?: unknown; detail?: unknown } | null;
      const type = typeof m === 'object' && m !== null ? m.type : undefined;
      if (type === 'ready') {
        if (ready) return;
        ready = true;
        if (readyTimer !== undefined) timers.clear(readyTimer);
        readyTimer = undefined;
        jobTimer = timers.set(() => fail('verification timed out'), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      } else if (type === 'progress' && (m!.phase === 'parsing' || m!.phase === 'verifying')) {
        onPhase(m!.phase, 'worker');
      } else if (type === 'result') {
        if (isBundleResult(m!.result)) finish({ kind: 'result', result: m!.result, engine: 'worker' });
        else fail('verification worker sent a malformed report');
      } else if (type === 'error') {
        fail(typeof m!.detail === 'string' && m!.detail !== '' ? m!.detail : 'verification failed');
      } else {
        fail('verification worker sent an unexpected message');
      }
    };
    // Before `ready`, an error means the script never ran (blocked, missing, unsupported): use the in-thread path instead.
    // After `ready`, it is a crash during verification and is a failure.
    w.onerror = (): void => { if (settled || worker !== w) return; if (ready) fail('verification worker crashed'); else fallback(); };
    w.onmessageerror = (): void => { if (settled || worker !== w) return; fail('verification worker message could not be read'); };
    readyTimer = timers.set(() => { if (!ready) fallback(); }, deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
    try {
      w.postMessage({ text: job.text, anchor: job.anchor } satisfies VerifyJob);
    } catch {
      fallback();
    }
  }

  return {
    outcome,
    get engine() { return engine; },
    cancel: () => finish({ kind: 'cancelled', engine }),
  };
}
