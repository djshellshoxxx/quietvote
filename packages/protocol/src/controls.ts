// QV-ADR-027 B2-05: signed monotonic controls with an explicit legacy-prefix boundary.
import { CONTROL_REASONS } from './control-reasons.ts';
import { PROTO, S, check, int, lit, obj, oneOf, str } from './schema.ts';
import { err, ok, type Result } from './types.ts';

export const CONTROL_ACTIONS = ['pause', 'resume', 'invalidate', 'security-notice', 'audit-close', 'cancel', 'abort'] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export interface ControlBody {
  proto: string;
  type: 'control';
  action: string;
  /** Absent only in historical controls before the first sequenced control. */
  control_seq?: number;
  reason?: string;
}

/** New submissions always bind the counter and a catalog reason (when supplied). */
export const controlAdmissionSchema = obj({
  proto: lit(PROTO), type: lit('control'), action: oneOf(...CONTROL_ACTIONS), control_seq: int(1, Number.MAX_SAFE_INTEGER),
}, { reason: oneOf(...CONTROL_REASONS) });

// Legacy reason text remains readable. A counter opts into the new reason catalogue as well.
const controlRecordSchema = S.multiSigned(obj({ proto: lit(PROTO), type: lit('control'), action: str(32) }, {
  control_seq: int(1, Number.MAX_SAFE_INTEGER), reason: str(256),
}));
export function checkControlRecord(record: unknown): string | null {
  const shape = check(controlRecordSchema, record);
  if (shape !== null) return shape;
  const body = (record as { body: ControlBody }).body;
  if (body.control_seq !== undefined && body.reason !== undefined &&
      !(CONTROL_REASONS as readonly string[]).includes(body.reason)) return 'sequenced control reason is not a catalog code';
  return null;
}

/** Call only after authenticating the record. Invalid signatures never consume a counter. */
export function advanceControlSeq(current: number, body: ControlBody): Result<number> {
  const seq = body.control_seq;
  if (seq === undefined) return current === 0 ? ok(0) : err('E_LOG_ORDER', 'unsequenced control after the sequenced-control boundary');
  if (!Number.isSafeInteger(seq) || seq < 1 || current >= Number.MAX_SAFE_INTEGER || seq !== current + 1) {
    return err('E_LOG_ORDER', 'control_seq must be exactly one greater than the last authenticated sequenced control');
  }
  return ok(seq);
}
