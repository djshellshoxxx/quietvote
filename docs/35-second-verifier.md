# QV-35 — Independent second verifier

**Module ID:** `second-verifier`  
**Status:** Draft  
**Owner:** Proto (specification and errata); PO (recruiting the reviewer, D-50, T-147). Named individual: TBD  
**Last reviewed:** 2026-10-21  
**Related specs:** [QV-11](11-testing-assurance.md) (gate G4), [QV-16](16-crypto-protocol.md) (bytes, Appendix C), [QV-34](34-test-vectors-conformance.md) (vectors, conformance), [QV-05](05-ballot-protocol.md) (checks V1–V14), [QV-18](18-bulletin-board-transparency.md) (log layer), [QV-24](24-traceability-matrix.md)  
**Decision basis:** QV-ADR-P11-2, QV-ADR-P34-2, QV-ADR-P34-3, D-50 ([OPEN-DECISIONS](plan/OPEN-DECISIONS.md)), R10 ([RISK-REGISTER](plan/RISK-REGISTER.md))

> **Unaudited. Not for real elections.** A passing run of the second verifier means only that it agrees with the v1 test vectors on the cases they cover. It is not a security claim (QV-34-REQ-015). No review of the second verifier has been recorded.

## 1. Objective

A verifier that is written independently of the reference verifier (`packages/verifier`, which composes `packages/protocol` and `packages/board`) lets a third party check an election without trusting the reference code. Agreement between two implementations written from the same specification is the main defence against self-confirming vectors (R11) and against a shared bug in the reference code (R02).

This spec defines what the second verifier must be, what it must do, and what counts as evidence that it is independent.

## 2. Scope

### In scope
- A second implementation of the QV-16 verification pipeline (Appendix C) and the QV-34 check set for complete election bundles.
- Running the QV-34 per-operation vectors under `test-vectors/v1/`.
- Recording every point where the specification is silent or contradicts a vector, in `docs/errata/spec-errata-log.md`.

### Out of scope
- Replacing the reference verifier, or making it a dependency of this one.
- Trustee tooling, ballot casting and any UI.
- Phase 2 and Phase 3 identity (QV-04 §10).
- A constant-time or side-channel claim for any operation (the second verifier handles public data only; see §11).

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Independent reviewer | Check an election bundle without the reference code | Bundle, manifest hash pinned out of band | Verdict and per-check report from the second verifier |
| Spec owner (Proto) | Find spec gaps through disagreement | Vectors and second verifier run | Errata entries, spec or vector fix decided by owner |
| Release gate (QA) | Block a `stable` vector set with one implementation only | Vector set marked `candidate` or `stable` | Gate result recorded in the evidence dossier (QV-11 §10) |

## 4. Requirements

Status column reflects the repository as observed on 2026-10-21 (see §10 and `verifier-py/README.md`). "Not met" means the requirement is not yet satisfied, not that the code is wrong.

| ID | Requirement | Priority | Acceptance criteria | Verification | Status (2026-10-21) |
|---|---|---|---|---|---|
| QV-35-REQ-001 | The second verifier shall be written from the specifications, the RFCs it cites and the vector files, and shall not import, call or translate code from `packages/`. | Must | Source tree contains no import of `packages/` or of the TypeScript build; the README states the sources used. | Manual review; automated import scan in CI (TBD, not yet built) | Partly met: `verifier-py/` states this; no automated scan |
| QV-35-REQ-002 | The second verifier shall run the per-operation vectors for every operation listed in QV-34 for which the vectors exist, and report each vector as PASS, FAIL or NOT-IMPLEMENTED. | Must | Runner exits 1 only on FAIL; NOT-IMPLEMENTED does not fail the run. | `python3 -I verifier-py/qv_verifier vectors test-vectors/v1` | Met for the runner. Observed run: 277 vectors, 228 PASS, 1 FAIL, 48 NOT-IMPLEMENTED (recorded in `verifier-py/README.md`; not re-run for this spec) |
| QV-35-REQ-003 | For each complete election bundle, the second verifier shall return the verdict, the 14 QV-34 §9.1 checks, counts, ctx prefix and results, and compare them exactly with `expected-report.json`. | Must | Exact comparison of the verdict and check map; no check reported as `pass` without its evidence. | Election vectors in `test-vectors/v1/elections/` | Partly met: 3 election sets. The canary differs (QV-ERR-PY-005) |
| QV-35-REQ-004 | Checks that depend on the QV-18 log layer shall be reported `not_run`, never `pass`, until the log layer is implemented. | Must | `chk.board.*` and `chk.receipts.sample` are `not_run` on every bundle without log evidence. | Election and log-layer vectors | Met for the current scope; the log layer is not implemented |
| QV-35-REQ-005 | An unconfirmed aggregate shall make `chk.tally.decrypt` and `chk.result.rules` `not_run`; an anchor mismatch shall make every later check `not_run`. | Must | Matches `mutations/manifest-field-flip.json` and the canary. | Mutation vectors | Choice recorded as QV-ERR-PY-006 and -007; the canary expectation is disputed (QV-ERR-PY-005) |
| QV-35-REQ-006 | Every point where the specification is silent, ambiguous or contradicted by a vector shall be recorded as an errata entry with its ID, location, evidence and the choice made. The second verifier shall not change a vector to make itself pass. | Must | Each choice has a `QV-ERR-PY-nnn` entry (or successor). | Errata log review at each release gate | Met for 15 entries (QV-ERR-PY-001 to -015). Entry IDs are not contiguous (QV-ERR-PY-013 is listed after -014) |
| QV-35-REQ-007 | Strict Ed25519 verification and ristretto255 decoding shall accept and reject the same inputs as QV-ADR-018 and RFC 9496 require. | Must | Vectors `primitives/ed25519/verify.json` and `primitives/ristretto/decode.json` pass. Non-canonical `R` and small-order `R` are rejected (QV-ERR-PY-011). | Primitive vectors | Partly met: `R` policy is not pinned by any vector |
| QV-35-REQ-008 | Errors shall use the codes the vectors expect. Any mismatch between a vector and QV-16 §5.20 shall be recorded, not silently renamed. | Must | `expect.error` values match the vectors; QV-ERR-PY-001 and -002 remain open until the owner decides. | Vector runner | Partly met: QV-ERR-PY-001 and -002 open |
| QV-35-REQ-009 | The second verifier shall have no third-party runtime dependency. | Must | `requirements.txt` lists no package; the code uses the standard library only. | Dependency review | Met (`verifier-py/requirements.txt` is empty by design) |
| QV-35-REQ-010 | The second verifier shall provide the QV-34 §10.2 stdin/stdout adapter, so the shared conformance runner can drive it. | Should | `qv vectors check`-style runner executes the same vectors against this implementation. | Conformance runner (T-216) | Not met (listed under "Next steps" in `verifier-py/README.md`) |
| QV-35-REQ-011 | The QV-18 log layer shall be implemented: checkpoints, consistency and inclusion proofs, witness cosignatures, receipts and notices. | Must before M4 | The 48 `log.verify_election` vectors in `elections/log-layer-4v/` pass. | Log-layer vectors | Not met |
| QV-35-REQ-012 | Trustee-decryption spoil mode (QV-16 §5.13.4, QV-ADR-020) shall be implemented or explicitly marked out of scope for suite v1. | Must before M4 | Spoil vectors in trustee mode pass, or the manifest flag path is rejected with a named error. | Benaloh vectors | Not met (`verifier-py/README.md` lists it as not implemented) |
| QV-35-REQ-013 | Continuous integration shall run the second verifier against `test-vectors/` on every change to `test-vectors/`, `docs/16`, `docs/34` or `verifier-py/`. | Must before the M1 freeze | A CI job fails when a vector changes and the second verifier FAILs it. | CI log | Not met: no such job in `.github/workflows/ci.yml` (observed 2026-10-21) |
| QV-35-REQ-014 | No claim of independence shall be made until a reviewer other than the author has reviewed the implementation and the review is recorded in the decision log. | Must | Decision-log entry with reviewer, date and scope. | Decision log | Not met (no review recorded) |
| QV-35-REQ-015 | Every output and every document about the second verifier shall state that it is unaudited and not for real elections, and shall not state that it is a security control. | Must | Banner present in the README and in report output. | Manual review; claims lint (`scripts/lint-claims.mjs`, non-blocking) | Met in `verifier-py/README.md`. Report-output banner TBD |

## 5. Data and privacy

- Data inputs: an election bundle (manifest, roll, log, optional board export), the vector files, and optionally an out-of-band pinned manifest hash.
- Data outputs: a verdict and a per-check report. The report contains public election data only.
- Data controller/operator: the person running the verifier. The verifier itself stores nothing.
- Retention and deletion: none by the verifier.
- Linkability risks: none beyond those already public on the log.
- Visibility: any party holding the bundle can run the verifier.
- Privacy properties claimed: none. This verifier handles public data only.
- Privacy properties explicitly not claimed: any property of the election itself (QV-07 non-claims apply).

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Self-confirming vectors | Reference generates vectors and passes them | A shared bug passes both | Second implementation from spec (QV-35-REQ-001, -002) | Both implementations may still read the spec the same way |
| Vector edited to fit one implementation | Author changes a vector to pass | Disagreement hidden | QV-35-REQ-006: errata, not vector edits | Owner may still accept an edit; must be recorded |
| Bundle crafted to pass a weaker verifier | Operator | False PASS in the weaker implementation | Mutation and canary vectors; REQ-003 exact comparison | Coverage limited to the vector set |
| Secret material in the verifier | Misuse | Key exposure | The verifier takes no secrets; the second verifier is for public data only (§11) | None known |
| Reviewer lacks independence | Same author reviews own code | Overstated assurance | QV-35-REQ-014 | Until a reviewer is found, assurance stays at "candidate" |

## 7. Interfaces and dependencies

- Upstream dependencies: QV-16 and QV-34 text; RFC 8032, RFC 9496, RFC 8785, RFC 9162, RFC 5869, FIPS 197 and NIST SP 800-38D (as listed in `verifier-py/README.md`).
- Downstream consumers: `test-vectors/` (the runner), the release gate G4, the evidence dossier (QV-11 §10).
- API/event/schema contracts: the QV-34 §10.3 comparison rules; exit codes 0 (no FAIL), 1 (a vector FAILs), 2 (usage).
- Versioning and compatibility: the second verifier follows the vector set version. A protocol change requires the same change here before a `stable` vector set is released (QV-ADR-P34-2).
- Failure and retry behaviour: a malformed input yields a named error and a FAIL for that vector, never a crash.

## 8. UX, accessibility, and localization

Not applicable to the Python skeleton. The reference verifier page (`packages/web`) is a separate artefact and is not covered here.

## 9. Operations

- Configuration: none. The CLI takes a vector path and optional report output.
- Monitoring and audit: the report file (`--report`) is the audit artefact. CI integration is TBD (QV-35-REQ-013).
- Backup, recovery and deletion: not applicable.
- Incident response: an unexplained disagreement is logged as an errata entry first (QV-34 §8.2 step 4).
- Support and escalation: Proto.

## 10. Testing and verification

- Unit tests: `cd verifier-py && python3 -I -m unittest` (37 tests reported OK, Python 3.13.16, 2026-10-21; `verifier-py/README.md`).
- Integration tests: `tests/test_vectors_cli.py` runs the repository vectors.
- End-to-end tests: none for the second verifier.
- Security/privacy tests: none; this is a correctness check only.
- Independent review or audit: none recorded (QV-35-REQ-014).
- Release-blocking criteria: REQ-002, -003, -004, -006, -009, -013 and -014 must be met before any vector set moves from `candidate` to `stable`.

Observed state on 2026-10-21 is recorded only in `verifier-py/README.md`. This spec does not restate it as a current result. Re-run before relying on it.

## 11. Constraints and assumptions

- Python 3.11 or later, standard library only. Python 3.11 and 3.12 were not tested (`verifier-py/README.md`).
- Arithmetic is not constant-time. The implementation must not be used on secret material.
- The vector tree was still changing when the observed run was made; numbers go stale.
- Vector set status is `candidate` (`test-vectors/README.md`). The MANIFEST is unsigned.

## 12. Open questions

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| Confirm Python as the second-verifier language (D-50 recommended default) | PO | M1 | Pending |
| Identify and contract a reviewer who is not the author (T-147, QV-35-REQ-014) | PO | M0 start, M1 select | Pending |
| Stipend or budget for the reviewer (R10 cites $15k–$40k; amount not confirmed) | Steward | M1 | Pending |
| Resolve QV-ERR-PY-001 to -015 with the QV-16 owner; then regenerate vectors if the spec changes | Proto | M1 freeze | Pending |
| Canary `chk.tally.decrypt` expectation (QV-ERR-PY-005) | Proto | M1 freeze | Pending |
| `R` policy for Ed25519 (QV-ERR-PY-011) | Proto | M1 | Pending (D-13 recommends strict) |
| Adapter protocol for the shared runner (QV-35-REQ-010) | QA | M2 | Pending |
| Log-layer scope and order (QV-35-REQ-011) | Proto | M2 | Pending |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Spec drafted 2026-10-21 from `verifier-py/`, `docs/errata/spec-errata-log.md` and the ADRs listed above |

## Proposed ADRs

- QV-ADR-P35-1: The second verifier is written in Python (standard library only) and is the independent implementation for gate G4. Source: D-50 (recommended default). Conflicts-with: none. Pending owner review.
- QV-ADR-P35-2: A vector set may move to `stable` only when the second verifier passes it (QV-ADR-P34-2 applied to this verifier). Conflicts-with: none. Pending owner review.

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.
