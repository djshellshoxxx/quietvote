/** Failure classes map to the QV-17 §12.2 exit codes. */
export type FailKind = 'DECLINED' | 'VERIFY' | 'NETWORK' | 'STATE' | 'LOCKED' | 'REFUSED' | 'USAGE';

export const EXIT: Record<FailKind, number> = { DECLINED: 10, VERIFY: 20, NETWORK: 30, STATE: 40, LOCKED: 50, REFUSED: 60, USAGE: 2 };

/** Stable machine-readable codes, e.g. AGGREGATE_MISMATCH, NOT_WITNESSED, PRIVACY_MIN, BAD_PASSPHRASE, ILLEGAL_TRANSITION. */
export class TrusteeError extends Error {
  readonly kind: FailKind;
  readonly code: string;
  constructor(kind: FailKind, code: string, message?: string) {
    super(message === undefined ? code : `${code}: ${message}`);
    this.name = 'TrusteeError';
    this.kind = kind;
    this.code = code;
  }
  get exitCode(): number {
    return EXIT[this.kind];
  }
}
