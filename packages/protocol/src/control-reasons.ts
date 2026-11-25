// QV-ADR-027 B2-16 C-lite / QV-07 section 15.2. New public submissions carry a code, never private free text.
// Historical signed controls keep their existing verification contract and are not rewritten.
export const CONTROL_REASONS = [
  'KEY_COMPROMISE_TRUSTEE', 'KEY_COMPROMISE_STEWARD', 'PROOF_SYSTEM_FLAW', 'VERIFIER_FLAW', 'CLIENT_COMPROMISE', 'SUPPLY_CHAIN',
  'BOARD_EQUIVOCATION', 'BOARD_ROLLBACK', 'ROLL_INTEGRITY', 'TALLY_MISMATCH', 'AVAILABILITY', 'OPERATOR_COMPROMISE', 'COERCION_EVIDENCE', 'OTHER',
] as const;
export type ControlReason = (typeof CONTROL_REASONS)[number];
