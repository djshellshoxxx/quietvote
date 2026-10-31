# Python verifier consolidation notes

Unaudited reference skeleton; not for real elections. This implementation remains independent of the TypeScript arithmetic and
does not import or call it. Audit regression tests also consume the synthetic public bundles preserved with the 2026-10-28 report.

## Definite repairs, 2026-10-31

* **CP-04:** canonical A and R must be nonzero prime-subgroup points (`[L]P = O`), matching the imported TS strict policy. Tests
  independently construct mixed-order points from a base-point multiple plus two-torsion and retain honest-key/signature controls.
* **CP-01/B1-01:** ciphertext clashes use only envelope-valid casts in the voting window; junk signatures cannot plant an alpha.
  Signed spoils exclude their code from counting before window/limit checks. Rewrapped spoils raise `E_SPOILED_CODE_CAST`, including
  after close or over the audit limit, and cannot supply an accepted public audit. Audit limits are now enforced separately.
* **B1-03:** approval without `winners` defaults to one seat (QV-20 §5.3); yes-no requires `rule`; rule-evaluation errors produce a
  named fatal result finding rather than escaping as exceptions.
* **B1-04:** `recordfields.py` validates JSON integer types (booleans are rejected), lowercase fixed-width hex, nested DKG/proof/tally
  shapes and signatures before arithmetic. DKG operation inputs use the same field checks. Roll keys cannot use uppercase/whitespace.
* **B1-08 (partial):** timestamps must be real UTC calendar dates and `created <= voting_open`; coordinator, trustee, log and witness
  signing keys must satisfy strict subgroup-point validation. Numeric bounds and witness/schema choices still await reconciliation.
  Existing unit fixtures that used arbitrary repeated-byte public keys were replaced by honest generated public keys.
* **B1-13:** manifest envelope/signature members are closed; extra unsigned members are named schema failures.
* **B1-14:** full-election verification and direct DKG adjudication require all six signed phase markers in strict order.

Tests: `tests/test_audit_regressions.py`, the existing primitive/protocol tests and the unmodified shipped vectors. Current measured
results are recorded in the integration validation report; historical README numbers are not claims about this consolidation.

## Remaining capabilities and owner gates

* **B1-02/SG7:** malformed/unknown non-ballot records, bad earlier markers and duplicate tally finding classes still differ from TS.
  This is deliberately recorded as an unresolved verifier-parity gap; no classes or governance semantics were silently rewritten.
* **B1-05/SG8:** bidi-control lists differ (U+061C); needs one normative list. **B1-07:** yes/no ties, count-quorum field name,
  winner order, DKG duplicate/early/equivocating records/complaints and latest-excluded-ballot rules remain owner decisions.
* **B1-08:** exact numeric limits, full witness-schema closure and method-specific tie-break restrictions remain unresolved.
* **PY-01/D-88:** trustee-mode spoil decryption is unsupported; manifests carrying `spoil_trustee_decrypt` are rejected.
  **PY-02:** verdicts remain PASS/FAIL; no INCOMPLETE mode. No QV-18 board/witness/receipt verification or adapter protocol was added.
* Shipped unsupported vectors stay explicit: 48 `log.verify_election` and 5 `benaloh.private_audit` cases. Their absence is not a pass
  or a claim of cross-verifier conformance. The corpus is unsigned; constant-time, large-scale and external-audit gates remain open.
