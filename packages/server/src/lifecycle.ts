// Election lifecycle state machine (QV-18 §5.4 extended by QV-ADR-022). The state is a pure function of the log;
// there are no state-setting endpoints (QV-09 §6.4).
import type { EntryType } from '@quietvote/board';
import type { ElectionStateName } from './controldb.ts';

/** Log-level events the machine consumes. `notice` entries are split into the control actions below. */
export type LifecycleEvent =
  | { t: 'manifest' } | { t: 'ceremony_start' } | { t: 'joint_key' } | { t: 'roll_commit' } | { t: 'election_open' }
  | { t: 'pause' } | { t: 'resume' } | { t: 'invalidate' } | { t: 'election_close' } | { t: 'tally_aggregate' }
  | { t: 'tally_result' } | { t: 'audit_close' } | { t: 'election_cancel' } | { t: 'ceremony_abort' };

const STEPS: Record<string, Partial<Record<LifecycleEvent['t'], ElectionStateName>>> = {
  DRAFT: { manifest: 'SETUP' },
  SETUP: { ceremony_start: 'CEREMONY', election_cancel: 'CANCELLED' },
  CEREMONY: { joint_key: 'SETUP_KEYED', ceremony_abort: 'ABORTED' },
  SETUP_KEYED: { roll_commit: 'READY', election_cancel: 'CANCELLED' },
  READY: { election_open: 'OPEN', election_cancel: 'CANCELLED' },
  OPEN: { pause: 'PAUSED', election_close: 'CLOSED', election_cancel: 'CANCELLED', invalidate: 'INVALIDATED' },
  PAUSED: { resume: 'OPEN', election_close: 'CLOSED', invalidate: 'INVALIDATED' },
  CLOSED: { tally_aggregate: 'TALLYING', invalidate: 'INVALIDATED' },
  TALLYING: { tally_result: 'AUDIT', invalidate: 'INVALIDATED' },
  // STALLED is a derived view of TALLYING (see effectiveState); it accepts the same events.
  STALLED: { tally_result: 'AUDIT', invalidate: 'INVALIDATED' },
  TALLIED: { invalidate: 'INVALIDATED' },
  AUDIT: { audit_close: 'ARCHIVED', invalidate: 'INVALIDATED' },
};

export function transition(s: ElectionStateName, e: LifecycleEvent['t']): ElectionStateName | undefined {
  return STEPS[s]?.[e];
}

/** Terminal states: the log is read-only apart from nothing. */
export const TERMINAL: ReadonlySet<ElectionStateName> = new Set(['ARCHIVED', 'INVALIDATED', 'CANCELLED', 'ABORTED', 'DELETED', 'IMPORTED']);

/**
 * Entry types a state may accept (cheap hygiene gate before any expensive work). Type-specific validators narrow
 * further (e.g. which `notice` actions, which DKG round).
 */
const ALLOWED: Record<string, readonly EntryType[]> = {
  DRAFT: ['manifest'],
  SETUP: ['ceremony_start', 'election_cancel'],
  CEREMONY: ['dkg_round1', 'dkg_round2', 'dkg_complaint', 'key_confirm', 'notice', 'joint_key', 'ceremony_abort'],
  SETUP_KEYED: ['roll_commit', 'election_cancel'],
  READY: ['election_open', 'election_cancel'],
  OPEN: ['ballot', 'ballot_audit', 'notice', 'election_close', 'election_cancel'],
  PAUSED: ['notice', 'election_close'],
  CLOSED: ['tally_aggregate', 'notice'],
  TALLYING: ['decryption_share', 'tally_result', 'notice'],
  STALLED: ['decryption_share', 'tally_result', 'notice'],
  AUDIT: ['audit_close', 'notice'],
};

export function typeAllowed(s: ElectionStateName, t: EntryType): boolean {
  return ALLOWED[s]?.includes(t) ?? false;
}

/** TALLYING older than `stalledMaxSec` is reported (and treated) as STALLED (QV-ADR-022). */
export function effectiveState(s: ElectionStateName, tallyingSince: number | undefined, nowSec: number, stalledMaxSec: number): ElectionStateName {
  if (s === 'TALLYING' && tallyingSince !== undefined && nowSec - tallyingSince > stalledMaxSec) return 'STALLED';
  return s;
}
