import { TrusteeError } from './errors.ts';

/** QV-17 §12.3, with COMMITTED added (QV-16 splits R1 into commit then dealing) and SEALED folded into CONFIRMED. */
export type TrusteeState =
  | 'KEYS_READY' | 'ACCEPTED' | 'COMMITTED' | 'R1_DONE' | 'R2_DONE' | 'COMPLAINING' | 'VERIFIED' | 'KEY_DERIVED'
  | 'CONFIRMED' | 'DRILLED' | 'STANDBY' | 'TALLYING' | 'RELEASED' | 'AUDIT_WAIT' | 'DESTROYING' | 'DESTROYED'
  | 'ABORTED' | 'DISQUALIFIED';

export const PRE_STANDBY: readonly TrusteeState[] = [
  'ACCEPTED', 'COMMITTED', 'R1_DONE', 'R2_DONE', 'COMPLAINING', 'VERIFIED', 'KEY_DERIVED', 'CONFIRMED', 'DRILLED',
];

const T: Record<TrusteeState, readonly TrusteeState[]> = {
  KEYS_READY: ['ACCEPTED', 'AUDIT_WAIT'],
  ACCEPTED: ['COMMITTED', 'ABORTED', 'DISQUALIFIED'],
  COMMITTED: ['R1_DONE', 'ABORTED', 'DISQUALIFIED'],
  R1_DONE: ['R2_DONE', 'ABORTED', 'DISQUALIFIED'],
  R2_DONE: ['VERIFIED', 'COMPLAINING', 'ABORTED', 'DISQUALIFIED'],
  COMPLAINING: ['VERIFIED', 'KEY_DERIVED', 'ABORTED', 'DISQUALIFIED'],
  VERIFIED: ['KEY_DERIVED', 'ABORTED', 'DISQUALIFIED'],
  KEY_DERIVED: ['CONFIRMED', 'ABORTED', 'DISQUALIFIED'],
  CONFIRMED: ['DRILLED', 'STANDBY', 'ABORTED', 'AUDIT_WAIT'],
  DRILLED: ['STANDBY', 'ABORTED', 'AUDIT_WAIT'],
  STANDBY: ['TALLYING', 'AUDIT_WAIT'],
  TALLYING: ['RELEASED', 'STANDBY'],
  RELEASED: ['AUDIT_WAIT'],
  AUDIT_WAIT: ['DESTROYING'],
  DESTROYING: ['DESTROYED'],
  DESTROYED: [],
  ABORTED: ['ACCEPTED', 'KEYS_READY', 'AUDIT_WAIT'],
  DISQUALIFIED: ['ABORTED', 'AUDIT_WAIT'],
};

export function canTransition(from: TrusteeState, to: TrusteeState): boolean {
  return from === to || T[from].includes(to);
}

/** Throws ILLEGAL_TRANSITION (exit 40) unless `to` is reachable from `from` in one step. Self-transitions are idempotent. */
export function assertTransition(from: TrusteeState, to: TrusteeState): void {
  if (!canTransition(from, to)) throw new TrusteeError('STATE', 'ILLEGAL_TRANSITION', `${from} -> ${to}`);
}

export const isTerminal = (s: TrusteeState): boolean => s === 'DESTROYED';
export const allStates = (): TrusteeState[] => Object.keys(T) as TrusteeState[];
export const nextStates = (s: TrusteeState): readonly TrusteeState[] => T[s];
