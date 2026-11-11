/** Work completed at a safe scheduling boundary; this is never evidence of a passed check. */
export interface VerificationProgress {
  stage: 'parse' | 'manifest' | 'log' | 'records' | 'dkg' | 'keyconfs' | 'markers' | 'ballots' | 'spoil-conflicts' | 'latest-ballots' | 'aggregate' | 'tally' | 'spoiled' | 'complete';
  completed: number;
  total: number;
}

/** Opt-in scheduling only. Callers must keep input/evidence immutable until verification settles. No resume state is exposed. */
export interface CooperativeVerification {
  signal?: AbortSignal;
  /** Awaited in verification order. A browser caller should yield a task (e.g. setTimeout), not just a microtask. */
  checkpoint(progress: Readonly<VerificationProgress>): void | Promise<void>;
}

/** Control failures are not verification reports and must not be displayed as completed checks. */
export class VerificationSchedulingError extends Error {
  constructor(cancelled: boolean, cause?: unknown) {
    super(cancelled ? 'verification cancelled' : 'verification scheduling failed', { cause });
    this.name = cancelled ? 'AbortError' : 'VerificationSchedulingError';
  }
}

export async function checkpoint(control: CooperativeVerification, progress: VerificationProgress): Promise<void> {
  if (control.signal?.aborted) throw new VerificationSchedulingError(true);
  try {
    await control.checkpoint(progress);
  } catch (cause) {
    throw new VerificationSchedulingError(control.signal?.aborted === true, cause);
  }
  if (control.signal?.aborted) throw new VerificationSchedulingError(true);
}

/** Drain the same operation in synchronous callers without scheduling or changing its return type. */
export function completeSteps<T>(steps: Generator<VerificationProgress, T>): T {
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

export async function cooperativeSteps<T>(steps: Generator<VerificationProgress, T>, control: CooperativeVerification): Promise<T> {
  try {
    let result = steps.next();
    while (!result.done) {
      await checkpoint(control, result.value);
      result = steps.next();
    }
    return result.value;
  } finally {
    steps.return(undefined as never);
  }
}
