// RFC 9457 problem details and the stable error-code table of QV-09 §4.3.

export interface ProblemExtra {
  reason?: string;
  retryAfter?: number;
  errors?: { pointer: string; message: string }[];
  retryable?: boolean;
  /** Extra response headers (e.g. Content-Range on 416). */
  headers?: Record<string, string>;
  /** Extra top-level problem members (additive, e.g. `evidence`). */
  body?: Record<string, unknown>;
}

const TITLES: Record<string, string> = {
  BAD_REQUEST: 'Bad request', MALFORMED_ENTRY: 'Malformed entry', UNKNOWN_FIELD: 'Unknown field', INVALID_CURSOR: 'Invalid cursor',
  UNAUTHENTICATED: 'Authentication required', SESSION_EXPIRED: 'Session expired', CHALLENGE_EXPIRED: 'Challenge expired', BAD_SIGNATURE: 'Bad signature',
  FORBIDDEN: 'Forbidden', AUTHOR_NOT_AUTHORIZED: 'Author not authorized', READ_KEY_REQUIRED: 'Read key required', REGISTRATION_CLOSED: 'Registration closed',
  NOT_FOUND: 'Not found', METHOD_NOT_ALLOWED: 'Method not allowed',
  WRONG_PHASE: 'Wrong phase', NONCE_REUSE: 'Nonce reuse', INVITE_USED: 'Invite already used', STATE_CONFLICT: 'State conflict',
  WITNESS_QUORUM_REQUIRED: 'Witness quorum required', IDEMPOTENCY_IN_PROGRESS: 'Idempotent request in progress',
  EVENT_GONE: 'Event gone', ELECTION_DELETED: 'Election deleted', ENTRY_TOO_LARGE: 'Entry too large', PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type', ENTRY_INVALID: 'Entry failed validation', VALIDATION_FAILED: 'Validation failed',
  IDEMPOTENCY_MISMATCH: 'Idempotency key reused with a different request', INVITE_EXPIRED: 'Invite expired',
  RATE_LIMITED: 'Rate limited', REVOTE_LIMIT: 'Revote limit reached', INTERNAL: 'Internal error',
  LOG_UNAVAILABLE: 'Log unavailable', QUARANTINED: 'Log quarantined', MAINTENANCE: 'Maintenance', BUSY: 'Server busy', LOG_FULL: 'Log full',
  URI_TOO_LONG: 'URI too long', HEADERS_TOO_LARGE: 'Request headers too large',
  EQUIVOCATION: 'Equivocation evidence', RANGE_NOT_SATISFIABLE: 'Range not satisfiable', LENGTH_REQUIRED: 'Content-Length required',
  IMPORT_REJECTED: 'Import rejected', COMPROMISED: 'Log key compromised', INTERNAL_JOB: 'Job failed',
};

const RETRYABLE = new Set(['RATE_LIMITED', 'BUSY', 'LOG_UNAVAILABLE', 'MAINTENANCE', 'IDEMPOTENCY_IN_PROGRESS', 'WITNESS_QUORUM_REQUIRED', 'INTERNAL']);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: ProblemExtra;
  constructor(status: number, code: string, detail: string, extra: ProblemExtra = {}) {
    super(detail);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
  get retryable(): boolean {
    return this.extra.retryable ?? RETRYABLE.has(this.code);
  }
}

export function problemBody(e: ApiError, requestId: string): Record<string, unknown> {
  const b: Record<string, unknown> = {
    type: `urn:quietvote:problem:${e.code}`,
    title: TITLES[e.code] ?? 'Error',
    status: e.status,
    code: e.code,
    detail: e.message,
    retryable: e.retryable,
    request_id: requestId,
  };
  if (e.extra.reason !== undefined) b['reason'] = e.extra.reason;
  if (e.extra.errors !== undefined) b['errors'] = e.extra.errors;
  if (e.extra.body !== undefined) for (const [k, v] of Object.entries(e.extra.body)) if (!(k in b)) b[k] = v;
  return b;
}

export const notFound = (what = 'resource'): ApiError => new ApiError(404, 'NOT_FOUND', `no such ${what}`);
export const forbidden = (detail: string, code = 'FORBIDDEN'): ApiError => new ApiError(403, code, detail);
export const wrongPhase = (detail: string): ApiError => new ApiError(409, 'WRONG_PHASE', detail);
export const conflict = (detail: string, code = 'STATE_CONFLICT'): ApiError => new ApiError(409, code, detail);
export const invalid = (reason: string, detail: string): ApiError => new ApiError(422, 'ENTRY_INVALID', detail, { reason });
