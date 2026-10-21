// Benaloh cast-or-audit state machine (QV-19 §6.2, QV-10 §10.1). Pure reducer: no I/O, no DOM.
// Security property enforced here: CAST and AUDIT are impossible until the ballot is sealed AND its code has been rendered
// (REQ-011); a tested (spoiled) ballot can never be cast (REQ-012); every attempt after a test uses a new attempt counter
// and therefore fresh randomness.

export type Selections = Record<string, string[]>;

export interface SealedRef {
  /** Hex ballot code; the identity of the sealed ciphertexts. */
  code: string;
  attempt: number;
}

export type BallotState =
  | { kind: 'selecting'; selections: Selections; attempt: number; spoiled: readonly string[]; notice?: 'tested' }
  | { kind: 'reviewing'; selections: Selections; attempt: number; spoiled: readonly string[] }
  | { kind: 'sealing'; selections: Selections; attempt: number; spoiled: readonly string[] }
  /** Sealed; the UI must report CODE_RENDERED before either button is enabled. */
  | { kind: 'sealed'; selections: Selections; sealed: SealedRef; codeRendered: boolean; spoiled: readonly string[] }
  | { kind: 'casting'; selections: Selections; sealed: SealedRef; spoiled: readonly string[] }
  | { kind: 'auditing'; selections: Selections; sealed: SealedRef; spoiled: readonly string[] }
  | { kind: 'audited'; selections: Selections; sealed: SealedRef; spoiled: readonly string[]; posted: boolean; matches?: boolean }
  | { kind: 'cast'; sealed: SealedRef; outcome: SubmissionOutcome }
  | { kind: 'failed'; selections: Selections; sealed?: SealedRef; spoiled: readonly string[]; error: string; retryCast: boolean };

/** QV-10 §8.2: the only six outcomes. */
export type SubmissionOutcome = 'ACCEPTED_RECORDED' | 'PENDING_UNCONFIRMED' | 'REJECTED' | 'SUPERSEDED' | 'DUPLICATE_IGNORED' | 'AFTER_CLOSE';

export type BallotEvent =
  | { type: 'SELECT'; selections: Selections }
  | { type: 'REVIEW' }
  | { type: 'EDIT' }
  | { type: 'SEAL' }
  | { type: 'SEALED'; sealed: SealedRef }
  | { type: 'SEAL_FAILED'; error: string }
  | { type: 'CODE_RENDERED'; code: string }
  | { type: 'CAST' }
  | { type: 'AUDIT' }
  | { type: 'CAST_RESULT'; outcome: SubmissionOutcome }
  | { type: 'CAST_FAILED'; error: string; unknownDelivery: boolean }
  | { type: 'AUDIT_DONE'; posted: boolean }
  | { type: 'AUDIT_FAILED'; error: string }
  | { type: 'AUDIT_CONFIRM'; matches: boolean }
  | { type: 'NEW_SEAL' }
  | { type: 'RETRY_CAST' };

export const initialBallotState = (): BallotState => ({ kind: 'selecting', selections: {}, attempt: 0, spoiled: [] });

export function canCast(s: BallotState): boolean {
  return s.kind === 'sealed' && s.codeRendered && !s.spoiled.includes(s.sealed.code);
}
export function canAudit(s: BallotState): boolean {
  return s.kind === 'sealed' && s.codeRendered;
}

/** Illegal transitions return the same state (they are bugs or races, never silently accepted). */
export function reduce(s: BallotState, e: BallotEvent): BallotState {
  switch (e.type) {
    case 'SELECT':
      if (s.kind === 'selecting' || s.kind === 'reviewing') return { ...s, kind: 'selecting', selections: e.selections };
      return s;
    case 'REVIEW':
      return s.kind === 'selecting' ? { kind: 'reviewing', selections: s.selections, attempt: s.attempt, spoiled: s.spoiled } : s;
    case 'EDIT':
      return s.kind === 'reviewing' ? { kind: 'selecting', selections: s.selections, attempt: s.attempt, spoiled: s.spoiled } : s;
    case 'SEAL':
      return s.kind === 'reviewing' ? { kind: 'sealing', selections: s.selections, attempt: s.attempt, spoiled: s.spoiled } : s;
    case 'SEALED':
      if (s.kind !== 'sealing') return s;
      // A code already spoiled can never reappear; refuse (cannot happen with fresh randomness unless the RNG failed).
      if (s.spoiled.includes(e.sealed.code)) return { kind: 'failed', selections: s.selections, spoiled: s.spoiled, error: 'repeated code', retryCast: false };
      return { kind: 'sealed', selections: s.selections, sealed: e.sealed, codeRendered: false, spoiled: s.spoiled };
    case 'SEAL_FAILED':
      return s.kind === 'sealing' ? { kind: 'failed', selections: s.selections, spoiled: s.spoiled, error: e.error, retryCast: false } : s;
    case 'CODE_RENDERED':
      return s.kind === 'sealed' && s.sealed.code === e.code ? { ...s, codeRendered: true } : s;
    case 'CAST':
      return canCast(s) && s.kind === 'sealed' ? { kind: 'casting', selections: s.selections, sealed: s.sealed, spoiled: s.spoiled } : s;
    case 'AUDIT':
      return canAudit(s) && s.kind === 'sealed' ? { kind: 'auditing', selections: s.selections, sealed: s.sealed, spoiled: s.spoiled } : s;
    case 'CAST_RESULT':
      return s.kind === 'casting' ? { kind: 'cast', sealed: s.sealed, outcome: e.outcome } : s;
    case 'CAST_FAILED':
      return s.kind === 'casting'
        ? { kind: 'failed', selections: s.selections, sealed: s.sealed, spoiled: s.spoiled, error: e.error, retryCast: e.unknownDelivery }
        : s;
    case 'RETRY_CAST':
      // Retrying after an unknown delivery resends the SAME bytes (idempotent), never a new ballot.
      return s.kind === 'failed' && s.retryCast && s.sealed !== undefined ? { kind: 'casting', selections: s.selections, sealed: s.sealed, spoiled: s.spoiled } : s;
    case 'AUDIT_DONE':
      return s.kind === 'auditing' ? { kind: 'audited', selections: s.selections, sealed: s.sealed, spoiled: [...s.spoiled, s.sealed.code], posted: e.posted } : s;
    case 'AUDIT_FAILED':
      return s.kind === 'auditing' ? { kind: 'failed', selections: s.selections, sealed: s.sealed, spoiled: [...s.spoiled, s.sealed.code], error: e.error, retryCast: false } : s;
    case 'AUDIT_CONFIRM':
      return s.kind === 'audited' ? { ...s, matches: e.matches } : s;
    case 'NEW_SEAL':
      // Back to review with the same selections; the attempt counter moves so the new randomness (and code) differ.
      return s.kind === 'audited' || (s.kind === 'failed' && !s.retryCast)
        ? { kind: 'reviewing', selections: s.selections, attempt: (s.kind === 'audited' ? s.sealed.attempt : (s.sealed?.attempt ?? 0)) + 1, spoiled: s.spoiled }
        : s;
  }
}
