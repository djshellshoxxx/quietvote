# Python verifier consolidation notes

Unaudited reference skeleton; not for real elections. This implementation remains independent of the TypeScript arithmetic and
does not import or call it. Audit regression tests also consume the synthetic public bundles preserved with the 2026-10-28 report.

## Definite repairs, 2026-10-30

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

## Report semantics, 2026-11-04 (strict differential)

* **Stop scope.** `_stop` no longer turns completed checks into `not_run`. `chk.manifest.sig` is complete after App. C
  steps 2-4 and `chk.keys.trustees` after steps 5-10. `chk.encoding.canonical` stays `not_run` until the voter envelopes
  are examined, unless a record already failed it. QV-35-REQ-005 ("every later check"), QV-35-REQ-003 ("no check
  reported as `pass` without its evidence"), QV-ERR-PY-015. TS got the matching `chk.encoding.canonical` change.
* **Rejected tally.** A tally record that fails the closed schema, QV-JSON or `proto` is not examined. Aggregate,
  decrypt and rules are `not_run` (QV-16 §5.5 item 7, App. C step 1, §5.20). The QV-ERR-PY-007 "rest of the tally is
  still verified" reading is withdrawn.
* Tests: `tests/test_report_semantics.py`, plus TS `packages/protocol/test/report-semantics.test.ts`. The strict
  differential went from 12 report differences to 3 (`manifest-signature-removed`, `count-altered`, `result-flipped`).
  Those 3 are owner decisions D-92/D-93/D-94 in `docs/plan/OPEN-DECISIONS.md` §I. `compare-verifiers.ts` is unchanged
  and still exits 1.

### Approved report dependencies implemented, 2026-11-16

The preceding differential status is historical. QV-ADR-027 adopted the approved
register's A/A/A recommendations for DIFF-manifest-signature-removed,
DIFF-count-altered and DIFF-result-flipped. Python now stops after insufficient
manifest signatures, does not evaluate rules after any decryption failure, and
emits results only when rule verification passes. QV-35-REQ-003/005 and the errata
addendum document this existing approval. The later OPEN-DECISIONS alternatives
were proposals, not superseding decisions. The vector corpus, expected reports
and strict comparator remain unchanged; this does not resolve other report or
control semantics. See `tests/test_approved_report_parity.py` and the milestone
handoff for execution receipts and independent-review status.

## Remaining capabilities and owner gates

* **B1-02/SG7:** malformed/unknown non-ballot records, bad earlier markers and duplicate tally finding classes still differ from TS.
  This is deliberately recorded as an unresolved verifier-parity gap; no classes or governance semantics were silently rewritten.
* **B1-05/SG8:** bidi-control lists differ (U+061C); needs one normative list. **B1-07:** yes/no ties, count-quorum field name,
  winner order, DKG duplicate/early/equivocating records/complaints and latest-excluded-ballot rules remain owner decisions.
* **B1-08:** exact numeric limits, full witness-schema closure and method-specific tie-break restrictions remain unresolved.
* **PY-01/D-88/D-95:** trustee-mode spoil decryption is unsupported; manifests carrying `spoil_trustee_decrypt` are rejected.
  QV-16 §5.12.2 says a zero-digest spoil is "valid only if the manifest enables it", but no spec gives the code, check or
  class for the invalid case, so it is not implemented here (TS does not enforce it at the ballot level either). See D-95.
  **PY-02/D-96:** verdicts remain PASS/FAIL. QV-16 App. C defines only "PASS or FAIL", so INCOMPLETE waits for D-96 (with
  P1/TSV-05). The stable QV-18 board/witness/receipt subset is now implemented below; no adapter protocol was added.
* Shipped unsupported vectors stay explicit: 13 notice/control `log.verify_election` cases. Their absence is not a pass
  or a claim of cross-verifier conformance. The corpus is unsigned; constant-time, large-scale and external-audit gates remain open.

## Private Benaloh audit — 2026-11-16

`benaloh.private_audit` now verifies the strict spoil envelope, roll membership, signature over the
reveal digest, QV-JSON reveal schema, exact signed digest, and deterministic JCS equality of the full
ballot body (ciphertexts **and proofs**). Published and out-of-band reveals must also agree. The
operation returns the authenticated ballot code; it does not claim board inclusion or tally validity.
Zero-digest trustee-mode spoils cannot authenticate a private reveal; election-level enablement,
error class and verdict decisions D-95/D-96 remain unchanged.

Validation: `python3 -I -m unittest` ran **71 tests, OK**. Thirteen private-audit tests include replay
under another context, voter or key, re-signed false reveal commitments, malformed reveals, and valid
but independently re-randomized CDS/limit proofs that pass envelope verification but fail exact
reproduction. `python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet` reports **282 total,
234 PASS, 0 FAIL, 48 NOT-IMPLEMENTED**; all five formerly unsupported private-audit cases pass and all
79 manifest-listed file hashes match. No vector, shared comparator or D-92 through D-96 behavior changed.

## Stable QV-18 log evidence — 2026-11-16

`verify_bundle(bundle, log={"board": board, ...})` and the `verify --board` CLI now authenticate the
stable non-control board path: exact entry/record binding, header signatures/authorization/nonces,
RFC9162 roots and proofs, signed checkpoints/observations, witness quorum/gates/times, receipt
promises/inclusion and nonfatal receipt claims. The standalone proof APIs include consistency;
the full-board path proves consistency by recomputing authenticated prefix roots. Sources are
QV-18, the documented board/protocol contracts, primary RFC/C2SP specifications and public fixtures,
using the existing independent Python cryptography. No TypeScript implementation was translated.

The full vector sweep reports **282 total, 269 PASS, 0 FAIL, 13 NOT-IMPLEMENTED** with all 79 file
hashes matching. The 13 held inputs depend on X31 notice/control shape and authority and the
existing unknown-record class discrepancy. Hold detection examines input content, not IDs or
expected outputs. The core's fatal `E_SCHEMA` semantics remain unchanged. The CLI explicitly exits
3 for unsupported input; no-log API behavior is unchanged. Full Python suite: **113 tests, OK**;
the final transport-tightening focused rerun is recorded in the linked handoff.

Two independent submodules and an integration review added hostile-input, signature/replay,
Merkle boundary, timestamp-permutation and malformed receipt tests. A fresh review additionally
required complete v1 transport metadata and ballot-only ownership claims. Exported witness policy
is structurally validated but cannot supply trusted keys/quorum. Every valid witness observation
is retained so duplicate notes/lines cannot hide earlier times; malformed unsigned receipt
inclusion cannot erase an authentic broken promise. See
[`python-stable-log-20261116.md`](../docs/handoffs/python-stable-log-20261116.md) for the exact
35-supported/13-held inventory, interface, limitations, validation and continuation instructions.
