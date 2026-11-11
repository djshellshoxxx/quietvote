// Auto-lock policy (QV-19 §5.3): lock after 10 min idle and after > 2 min hidden. Pure state over an injected clock.
export interface LockPolicy {
  idleMs: number;
  hiddenMs: number;
}
export const DEFAULT_LOCK_POLICY: Readonly<LockPolicy> = Object.freeze({ idleMs: 10 * 60_000, hiddenMs: 2 * 60_000 });

export class LockTimer {
  private lastActivity: number;
  private hiddenSince: number | undefined;
  private readonly policy: LockPolicy;
  constructor(now: number, policy: LockPolicy = DEFAULT_LOCK_POLICY) {
    this.lastActivity = now;
    this.policy = policy;
  }
  touch(now: number): void {
    this.lastActivity = now;
  }
  setHidden(hidden: boolean, now: number): void {
    if (hidden) this.hiddenSince ??= now;
    else this.hiddenSince = undefined;
  }
  /** True when the session must lock at `now`. */
  shouldLock(now: number): boolean {
    if (now - this.lastActivity > this.policy.idleMs) return true;
    return this.hiddenSince !== undefined && now - this.hiddenSince > this.policy.hiddenMs;
  }
  /** REQ-007 (QV-13): inactivity warning >= 2 min before lock. Returns ms until lock, or undefined if a warning is not yet due. */
  warningMsRemaining(now: number, warnBeforeMs = 2 * 60_000): number | undefined {
    const left = this.policy.idleMs - (now - this.lastActivity);
    return left <= warnBeforeMs && left > 0 ? left : undefined;
  }
}
