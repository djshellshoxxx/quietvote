// Error model (QV-09 §4.3, RFC 9457) and mapping to UX error codes (QV-10 §8.1).
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
    case 'WRONG_PHASE': return /clos/i.test(e.detail ?? '') ? 'E-VOT-CLOSED' : /not.*open|before/i.test(e.detail ?? '') ? 'E-VOT-NOTOPEN' : 'E-VOT-CLOSED';
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

/** True when repeating the *same bytes* is safe and likely to help (QV-09 §4.4). */
export function isRetryable(e: unknown): boolean {
  return e instanceof ApiError && (e.retryable || e.code === NETWORK || e.code === TIMEOUT || e.status === 429 || e.status === 503);
}
