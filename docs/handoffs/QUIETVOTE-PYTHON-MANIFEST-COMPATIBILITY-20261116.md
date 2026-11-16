# Approved Python manifest compatibility — 2026-11-16

Base source: `12565e6b9de976b439b140cb8f34845dcb72274f`.
Scope: QV-ADR-027's already accepted B1-05 option A and PY-01 option A in
[the decision register](../plan/DECISIONS-2026-11-04.md). The older blanket holds
do not supersede that approval. Independent review and final integration
qualification remain separate from implementation authorization.

## Implemented boundaries

- U+061C (Arabic Letter Mark) is permitted in the same manifest text fields as
  the existing TypeScript verifier. The eleven other existing rejected marks
  are unchanged. The Python registry now uses visible escaped code points.
- The optional `spoil_trustee_decrypt` field accepts only JSON Boolean values.
  `false` and omission retain ordinary-mode behavior. `true` is explicitly out
  of scope in this verifier and produces named `E_UNSUPPORTED`, as permitted by
  QV-35-REQ-012 and the approved PY-01 recommendation. This implementation-level
  capability code is not a claim that a valid trustee-mode proof is malformed.
- Direct manifest/API operations expose that named code; election verification
  reports FAIL and the actual CLI exits 1. Null, numeric and string aliases are
  rejected, and unrelated unknown fields still violate the closed schema.
- Adding the now-admitted `false` field changes the manifest hash and cannot
  reuse old coordinator signatures. Tests retain that authentication boundary.

The trustee-decryption algorithm, zero-digest-spoil classification and broader
B1-07/B1-08 choices are not changed. TypeScript's supported flag path remains
unchanged; the Python rejection is an explicit capability boundary, not a claim
of parity for trustee-mode elections. No vector or expectation is edited.

## Validation and review handoff

`python3 -m unittest discover -s tests -p test_manifest_compatibility.py` passes
all seven tests, 0.249 seconds. Before the repair, the same tests reproduced
three failures and eight failing subcases. Coverage includes every free-text
field kind, the retained reject set, strict flag typing, named direct/API/actual
CLI rejection and manifest-signature refusal after a `false` mutation.

Three positive manifest/hash results were computed independently with the
unchanged TypeScript `validateManifest` and `manifestHash` at the base source:
false flag, ALM title, and both. Their fixed digests are retained in the Python
tests, which require no Node runtime. All three validate in both implementations.
`git diff --check` passes. Full corpus validation is recorded in the follow-up
receipt; do not infer a full-candidate pass from these focused tests.

The integrator owns independent review of the small manifest-only production
diff and final combined tests. The P1 lane owns concurrent README/NOTES edits;
its final status should supersede the old ALM/PY-01 hold text with these exact
boundaries. This lane does not edit its election-verdict implementation.
