// Server-level record shapes carried in log entries that the protocol package does not define (see NOTES.md):
//  - `control`          steward actions: pause / resume / invalidate / security-notice / audit-close / cancel / abort
//  - `tally-aggregate`  the counted-ballot aggregate, authored by the server key (derived data, recomputable by anyone)
//  - `dec-shares`       one trustee's partial-decryption shares for the aggregate
import {
  PROTO_ID, arr, hex, int, lit, obj, oneOf, str, ID_RE, type Schema,
} from '@quietvote/protocol';

export const CONTROL_ACTIONS = ['pause', 'resume', 'invalidate', 'security-notice', 'audit-close', 'cancel', 'abort'] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

export interface ControlBody {
  proto: string;
  type: 'control';
  action: ControlAction;
  reason?: string;
}
export interface AggregateBody {
  proto: string;
  type: 'tally-aggregate';
  ctx: string;
  n_counted: number;
  counted_root: string;
  aggregates: { contest: string; option: string; A: string; B: string }[];
}
export interface DecSharesBody {
  proto: string;
  type: 'dec-shares';
  j: number;
  shares: { contest: string; opt: string; M: string; c: string; s: string }[];
}

export const controlSchema: Schema = obj({ proto: lit(PROTO_ID), type: lit('control'), action: oneOf(...CONTROL_ACTIONS) }, { reason: str(256) });
export const aggregateSchema: Schema = obj({
  proto: lit(PROTO_ID), type: lit('tally-aggregate'), ctx: hex(32), n_counted: int(0, 1 << 20), counted_root: hex(32),
  aggregates: arr(obj({ contest: str(64, ID_RE), option: str(64, ID_RE), A: hex(32), B: hex(32) }), 1, 16384),
});
export const decSharesSchema: Schema = obj({
  proto: lit(PROTO_ID), type: lit('dec-shares'), j: int(1, 32),
  shares: arr(obj({ contest: str(64, ID_RE), opt: str(64, ID_RE), M: hex(32), c: hex(32), s: hex(32) }), 1, 16384),
});

export const ACTION_ENTRY: Record<ControlAction, 'notice' | 'audit_close' | 'election_cancel' | 'ceremony_abort'> = {
  pause: 'notice', resume: 'notice', invalidate: 'notice', 'security-notice': 'notice',
  'audit-close': 'audit_close', cancel: 'election_cancel', abort: 'ceremony_abort',
};

export const DKG_STEP_MARKERS = ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final'] as const;
