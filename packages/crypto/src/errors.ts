export type CryptoErrorCode =
  | 'E_POINT_DECODE'
  | 'E_IDENTITY'
  | 'E_SCALAR_RANGE'
  | 'E_LENGTH'
  | 'E_DOMAIN_UNKNOWN'
  | 'E_PARSE'
  | 'E_ARG'
  | 'E_AEAD';

/** Error raised by crypto primitives on hostile or malformed input. `code` is stable (QV-16 §5.20). */
export class QvCryptoError extends Error {
  readonly code: CryptoErrorCode;
  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'QvCryptoError';
    this.code = code;
  }
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
