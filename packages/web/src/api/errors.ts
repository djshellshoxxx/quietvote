// Error model (QV-09 §4.3, RFC 9457) and mapping to UX error codes (QV-10 §8.1).
import type { Args } from '../i18n/icu.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | undefined;
  readonly reason: string | undefined;
  readonly retryAfter: number | undefined;
  readonly detail: string | undefined;
  constructor(o: { status: number; code: string; message?: string; retryable?: boolean; requestId?: string | undefined; reason?: string | undefined; retryAfter?: number | undefined; detail?: string | undefined }) {
    super(o.message ?? o.code);
    this.name = 'ApiError';
    this.status = o.status;
    this.code = o.code;
    this.retryable = o.retryable ?? false;
    this.requestId = o.requestId;
    this.reason = o.reason;
    this.retryAfter = o.retryAfter;
    this.detail = o.detail;
  }
}

/** Synthetic codes for failures that never produced an HTTP response. */
export const NETWORK = 'NETWORK';
export const TIMEOUT = 'TIMEOUT';
export const BAD_RESPONSE = 'BAD_RESPONSE';

export type UxCode =
  | 'E-NET-OFFLINE' | 'E-NET-TIMEOUT' | 'E-VOT-NOTONROLL' | 'E-VOT-CLOSED' | 'E-VOT-NOTOPEN' | 'E-VOT-ONEBALLOT'
  | 'E-VOT-REJECTED-PROOF' | 'E-VOT-DUP' | 'E-VOT-SUPERSEDED-LOST' | 'E-BOARD-STALE' | 'E-API-RATE' | 'E-API-UNAVAILABLE'
  | 'E-READ-KEY' | 'E-ORG-MANIFEST' | 'E-GEN-UNKNOWN';

/** Maps an API failure to the UX error catalog. `submitting` marks the ballot-append request (timeout there is "unknown"). */
export function uxCodeFor(e: unknown, submitting = false): UxCode {
  if (!(e instanceof ApiError)) return 'E-GEN-UNKNOWN';
  switch (e.code) {
    case NETWORK: return submitting ? 'E-NET-TIMEOUT' : 'E-NET-OFFLINE';
    case TIMEOUT: return 'E-NET-TIMEOUT';
    case 'AUTHOR_NOT_AUTHORIZED': return 'E-VOT-NOTONROLL';
    case 'WRONG_PHASE': return /clos/i.test(e.detail ?? '') ? 'E-VOT-CLOSED' : /not.*open|before/i.test(e.detail ?? '') ? 'E-VOT-NOTOPEN' : 'E-API-UNAVAILABLE';
    case 'REVOTE_LIMIT': return 'E-VOT-ONEBALLOT';
    case 'ENTRY_INVALID': return e.reason === 'E_SUPERSEDES' || e.reason === 'SUPERSEDED' ? 'E-VOT-SUPERSEDED-LOST' : 'E-VOT-REJECTED-PROOF';
    case 'MALFORMED_ENTRY':
    case 'VALIDATION_FAILED': return 'E-VOT-REJECTED-PROOF';
    case 'RATE_LIMITED': return 'E-API-RATE';
    case 'LOG_UNAVAILABLE':
    case 'QUARANTINED':
    case 'MAINTENANCE': return 'E-API-UNAVAILABLE';
    case 'READ_KEY_REQUIRED': return 'E-READ-KEY';
    default: return 'E-GEN-UNKNOWN';
  }
}

export interface PhaseTimes {
  opens?: string | undefined;
  closes?: string | undefined;
}

/**
 * B3-06: the UX code to show for a failure together with the arguments its catalog text needs. `ux` is an already-chosen code
 * (ballot state) or undefined to derive it from `e`. A `{time}` or `{seconds}` placeholder left empty makes the translator throw
 * and the screen falls back to the generic error, so every code that takes arguments gets them here. A closed/not-open phase whose
 * time is unknown (no manifest loaded yet) shows the "unavailable" copy instead of inventing a time.
 */
export function uxPresentation(ux: string | undefined, e: unknown, times: PhaseTimes = {}): { ux: string; args: Args } {
  const code = ux ?? uxCodeFor(e);
  switch (code) {
    case 'E-API-RATE': return { ux: code, args: { seconds: e instanceof ApiError && e.retryAfter !== undefined ? Math.ceil(e.retryAfter) : 60 } };
    case 'E-VOT-CLOSED': return times.closes !== undefined ? { ux: code, args: { time: times.closes } } : { ux: 'E-API-UNAVAILABLE', args: {} };
    case 'E-VOT-NOTOPEN': return times.opens !== undefined ? { ux: code, args: { time: times.opens } } : { ux: 'E-API-UNAVAILABLE', args: {} };
    default: return { ux: code, args: {} };
  }
}

/** True when repeating the *same bytes* is safe and likely to help (QV-09 §4.4). */
export function isRetryable(e: unknown): boolean {
  if (e instanceof ApiError && e.code === 'REVOTE_LIMIT') return false;
  return e instanceof ApiError && (e.retryable || e.code === NETWORK || e.code === TIMEOUT || e.status === 429 || e.status === 503);
}
