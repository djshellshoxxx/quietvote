// Stable error codes (QV-30 §7). Verification functions are total: they return Result, never throw on hostile input.

export type BoardErrorCode =
  | 'QV_BOARD_MALFORMED'
  | 'QV_BOARD_TOO_LARGE'
  | 'QV_BOARD_ORIGIN_MISMATCH'
  | 'QV_BOARD_BODY_DIGEST'
  | 'QV_BOARD_BAD_SIGNATURE'
  | 'QV_BOARD_AUTHOR_UNRESOLVED'
  | 'QV_BOARD_UNSUPPORTED_ALG'
  | 'QV_BOARD_GRAMMAR'
  | 'QV_BOARD_NONCE_REUSE'
  | 'QV_BOARD_CLOCK_SKEW'
  | 'QV_BOARD_BAD_PROOF'
  | 'QV_BOARD_BAD_CHECKPOINT'
  | 'QV_BOARD_FORK'
  | 'QV_BOARD_ROLLBACK'
  | 'QV_BOARD_QUARANTINE'
  | 'QV_BOARD_READ_ONLY'
  | 'QV_BOARD_NOT_FOUND'
  | 'QV_BOARD_BAD_RECEIPT'
  | 'QV_BOARD_BAD_BUNDLE'
  | 'QV_BOARD_INTERNAL';

export interface BoardError {
  code: BoardErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: BoardError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: BoardErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}
