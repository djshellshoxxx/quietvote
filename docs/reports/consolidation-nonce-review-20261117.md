# QuietVote independent agent review of PR #57 and historical crypto findings

## Source and review scope

The canonical baseline was `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`. The exact PR #57 candidate reviewed and tested was `fd23cb3a481328a2b6315ae34cc2ee589b31aead`. The historical verification handoff on PR #58 is `9a03414e0e826db292f9dd5728e4d3d2f0682784`; its findings concern `424110d90e23dc443aa4498a4340973d3c8cb8b6`, not either current source.

This reviewer did not author or modify the candidate, publish a review approval, change a remote branch, or run a production deployment. This is an independent agent implementation review. It is not independent professional cryptographic approval or election qualification.

Reviewed production changes are confined to `packages/crypto/src/proofs.ts`, the TypeScript label registry, and the independent Python label registry. Verification equations, protocol/server production source, wire schemas, dependency manifests, lockfile, and workflow definitions are unchanged in the candidate delta. Additional candidate commits record QV-ADR-029 and change test-only HTTP connection handling; QV-ADR-029 is not a pinned-roll runtime implementation.

## Nonce review outcome

The candidate implements the approved QV-ADR-027 registry revision. Decryption nonces bind the ciphertext points, spoiled-ballot nonces preserve their existing ballot-code separation, and DKG/share-key/DH proof nonces have separate registered labels with the specified secret, context, indices, statement points, and random input. The specification and both registries agree on 30 labels. Framing and nonzero reduction are unchanged.

An independent synthetic experiment reproduced the known failed-randomness weaknesses on the canonical baseline in four proof families and demonstrated their repair at the candidate. Positive proof verification succeeds on both sources. The experiment and its inputs remain in private scratch review evidence. No novel exposure or changed severity is asserted from this experiment; CP-02/C2, B1-12 and C3 were already public historical findings.

The decryption hedge retains the approved invariant that a trustee has one index per election context; `Y_j` and `M` derive from the fixed secret and ciphertext. This review did not change that protocol assumption.

The candidate should remain reviewable behind the existing approval gate. The GitHub review query returned no review submissions for PR #57. QV-30 section 10 and QV-30-REQ-018 require two approvals, including a security reviewer, for cryptographic/protocol/vector changes. `.github/CODEOWNERS` still identifies its ownership as a placeholder. Owner approval of the design is not a substitute for the required review. The four candidate commits have author-matching sign-off trailers; this observation does not attest on their authors' behalf or settle older inherited provenance gaps.

## Executed checks

Environment: Linux, Node `v24.22.1`, npm `11.9.0`, Python `3.12`. Dependencies installed with `npm ci --ignore-scripts --offline`. All checks below ran on the exact candidate unless another source is stated.

| Command | Observed result |
|---|---|
| `npm run typecheck` | Exit 0 |
| `npm test --workspace=@quietvote/crypto` | 101 passed; 0 failed/skipped |
| `npm test --workspace=@quietvote/protocol` | 373 passed; 0 failed/skipped |
| `npm test --workspace=@quietvote/verifier` | 38 passed; 0 failed/skipped |
| `python3 -I -m unittest` from `verifier-py/` | 222 passed; 106.746 seconds |
| `npm run vectors:check` | 423/423; 0 failed; no unrun files |
| `python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet` | 285 passed; 0 failed; 0 not implemented; 79 referenced hashes match |
| `npm run verifiers:compare -- --strict` | 27/27 agree; 0 report differences |
| `node packages/verifier/scripts/build-corpus.ts --check` | Exit 0; no output |
| Independent semantic vector comparison | 282 historical expectation rows retained; 3 nonce-registry rows added; no removed IDs or changed acceptance, verdict, check, count, or result expectations |
| Independent failed-RNG comparison, baseline versus candidate | Known weakness reproduced on baseline; repaired in candidate for the four tested proof families |
| Preserved 25-input manifest corpus against current TS and Python | 13 agree on acceptance; 12 differ; see the scoped residual analysis below |

The shared comparator intentionally excludes board append-only, witness, and receipt sample checks. Those exclusions are not evidence of agreement. The separate Python vector runner exercises its declared log-evidence cases. The 285-vector run and 423 TypeScript run use different runner accounting and must not be added together or presented as matching counts.

An initial Python invocation used `discover -s verifier-py/tests` from the root and failed imports because isolated mode lacked the package directory. The documented invocation from `verifier-py/` completed successfully. No product change was required. The `--strict` argument is unnecessary: the comparator already treats report differences as failure; no check was relaxed.

## Current-state reconciliation of PR #58 crypto/verifier entries

The requested B1/CP/TSV/PY/WV/N subset contains **22 exact extract IDs**, including the single grouped `N-13, N-24, N-25, N-27` ID. CP-02/C3 is reported separately above because it is not an additional exact extract row. Original historical severity and confirmation records remain unchanged.

For every row except B1-12, the relevant production implementation is identical between the canonical baseline and candidate. Executed results below apply to the candidate; canonical status for those rows is established by unchanged source, not a second full test run.

| Historical ID | Current status | Current evidence and remaining boundary |
|---|---|---|
| B1-01 | Fixed for the reproduced scenarios; regressions executed | `packages/protocol/test/b1-regressions.test.ts` covers before-open, after-close and over-limit signed spoils; `verifier-py/tests/test_audit_regressions.py` covers the same-code exclusion. The protocol and Python suites passed. |
| B1-02 | Fixed for adopted historical cases; regressions executed | `packages/protocol/test/approved-semantic-parity.test.ts`, Python `test_approved_semantic_parity.py` and `test_approved_parity_fresh_review.py` cover malformed non-tally records, first authenticated marker selection and duplicate/conflicting tallies. Notice/control corpus cases execute. Newer governance effects are separate. |
| B1-03 | Fixed; regressions executed | Python `test_audit_regressions.py` verifies one-seat approval defaults and named rejection of yes/no without a rule. Rule errors no longer escape the tested public path. |
| B1-04 | Fixed for recorded cases; regressions executed | `verifier-py/qv_verifier/recordfields.py` validates record encodings before arithmetic. Python audit regressions reject Boolean indices, uppercase points/roll/tally fields and malformed wrappers. This is not a claim of exhaustive parser fuzzing. |
| B1-05 | Fixed under ADR-027; regressions and probes executed | U+061C acceptance and the eleven rejected bidi marks agree. `packages/protocol/src/manifest.ts` checks trustee/witness text; Python `test_manifest_compatibility.py` exercises the exact approved policy. Preserved M5/M6 probes now agree. |
| B1-06 | Disclosure repaired; caller trust requirement remains | `packages/verifier/src/verify.ts` records the manifest hash source and adds an out-of-band caveat when absent; `format.ts` prints the hash. `packages/verifier/test/b1-anchor.test.ts` tests unpinned disclosure and rejection of an incorrect caller pin. This does not make external manifest acquisition automatic. |
| B1-07 | Fixed for adopted distinguishing cases; paired regressions executed | Paired TS/Python semantic tests cover count-quorum `value`, exact threshold ties, winner order, excluded-latest casts, DKG equivocation, complaints and phase timing. They do not establish all possible manifest/report parity. |
| B1-08 | Partially fixed; residual acceptance differences reproduced | Calendar validity, created/open ordering, signing-key subgroup checks and explicit roll bounds are tested. The preserved 25-input corpus still has 12 acceptance differences: two documented scope/spec differences and ten remaining validation differences. Numeric or schema choices without normative support require the recorded ruling. |
| B1-09 | Historical documentation claim corrected; source classification fixed | `docs/plan/COMPLETION.md` explicitly annotates the old C3 claim as historical and incorrect. Subsequent ADR-027 code and paired tests repair the classification behavior. Preserve the historical table; do not rewrite the earlier audit. |
| B1-10 | Documentation corrected; rerandomization remains outside completed scope | TODO T-028 is `Partial` and explicitly records that rerandomization is absent. No rerandomization API was invented; the original scope-overstatement is no longer a current completion claim. Source/doc inspection only. |
| B1-11 | Partially addressed; complete coverage qualification remains open | Crypto tests cover strict small-order/mixed-order Ed25519 and per-field proof binding. Protocol B1 regressions cover late complaints and late key confirmations. Those tests passed. This reviewer did not repeat the historical complete mutation sweep or prove full Appendix C vector coverage. |
| B1-12 | Reproduced on canonical; fixed in candidate, pending required review | Independent synthetic comparison plus new `conformance-nonce-hedge.test.ts` in crypto/protocol. Canonical `72bccc6` retains CP-02; candidate `fd23cb3` repairs it. This finding is historical Info for the test-description defect; do not silently upgrade its historical severity. |
| B1-13 | Fixed; regressions executed | `packages/protocol/test/b1-regressions.test.ts` and Python audit regressions reject unsigned extra manifest-envelope/signature members while retaining named signature/version errors. |
| B1-14 | Fixed; regressions executed | Python audit regressions require all six DKG phase markers, reject missing and out-of-order markers, and include the preserved E20 example. |
| CP-01 (verifier-py residual) | Fixed for recorded rewrap/plant cases; regressions executed | Python audit regressions and protocol audit/B1 suites reject rewrapped spoiled ciphertexts and ignore invalid-signature alpha planting. Private trustee-mode capability remains separately bounded. |
| CP-04 (verifier-py residual) | Fixed; independent-construction regressions executed | Python audit tests independently construct mixed-order points; strict key and signature rejection agrees with the TS crypto audit/ZIP-215 tests. Honest signature controls pass. |
| TSV-04 | Repaired in the current log-evidence policy | `packages/protocol/src/verify.ts` prevents interrupted evidence from becoming content-only PASS. `packages/verifier/test/log-policy-fresh-review.test.ts` exercises board-layer exceptions and absence/malformed/caller-option boundaries. |
| TSV-06 | Fixed | `packages/verifier/src/canary.ts` compares `expect.verdict`; `packages/verifier/test/b1-anchor.test.ts` alters only the expected verdict and requires self-test failure. |
| PY-01 | Approved refusal behavior implemented; optional capability unsupported | Python accepts Boolean false, rejects Boolean true with `E_UNSUPPORTED`, and rejects other types. Tests and M12 probe confirm it. Full trustee-mode spoil decryption is not implemented; that is the explicit ADR-027/D-88 choice, not a silent successful verification. |
| PY-02 | Fixed; regressions executed | Python no-tally and missing/unverified-log paths return INCOMPLETE, fatal evidence remains FAIL, and only literal caller-controlled content-only opt-out changes scope. `test_incomplete_verdict.py`, `test_incomplete_fresh_review.py`, `test_log_required.py`, `test_log_policy_fresh_review.py` passed. |
| WV-9 | Still present; source inspection confirms | `test-vectors/MANIFEST.json` says `unsigned (release job signs)` and vector metadata remains candidate with no independent confirmations. Passing hashes are integrity checks, not a signed release attestation. |
| N-13, N-24, N-25, N-27 | Partially implemented; grouped residual remains open | Legacy control authorization is implemented, while V13 terminal/governance effects remain `not_run`. Vendoring remains absent, scalars remain plain bigint with incomplete secret-lifetime discipline, and TS still rejects `basis:roll` accepted by Python/spec. Source inspection and the M15 probe support these boundaries. |

## Additional known crypto items within the reviewed suites

CP-03 closed-schema own-property regression, CP-05 roll-commit ordering regression, C1 share-cipher identity rejection, C4 ElGamal scalar range, C5 canonical JSON domain, C6 noninteger proof-input handling, C7 trustee-index bounds, C8 identity statement guards, and C10 KDF cap/caller-bound tests are present and pass in the executed crypto/protocol suites. This is regression evidence for those cases, not independent reproduction of every historical exploit.

CP-06 selective-abort DKG bias remains a documented construction assumption. CP-07/C10 now impose the documented maximum and caller-supplied KDF bound; this review did not perform memory-exhaustion testing. CP-08/B1-11 broader mutation/vector completeness remains incomplete. C11 deterministic test RNG exports remain in the public crypto entry; this is a source-observed boundary, not a newly demonstrated production misuse. The 33-item historical KNOWN list as a whole was not re-audited by this workstream.

## Smallest source-backed manifest follow-up

The reproduced differences are listed in `manifest-recheck.json`. M12 is the accepted optional-capability refusal; M15 is the documented `basis:roll` conflict. The ten other cases are M4 (clock skew), M7 (status-quo for single-choice), M8/M9 (witness naming/key separation), M16/M17 (method-specific fields), and M19–M22 (ballot/text/coordinator/witness bounds).

The narrowest supported repair is **M7**: reject `status-quo` for methods other than yes/no in the Python validator. `docs/03-governance-and-policy.md` section 7.3 explicitly limits this rule to yes/no, and QV-20 section 12 describes it for a tied yes/no motion. ADR-027 B1-08 permits source-derived restrictions. This can be tested with one rejected non-yes/no case, a valid yes/no control, supported alternative tie rules, and the existing semantic/vector checks. The candidate review requirement still applies to a verifier behavior change.

No normative upper limit was located for the exact TS bounds of 86,400 clock-skew seconds, 1,000 ballots, 256 title code units, eight coordinator keys, or 32 witnesses. Do not copy these limits merely because TS enforces them. Witness log-key/name separation is sensible and implemented in TS NOTES X-23, but a precise approved normative contract should precede a parity repair. Further inspection may resolve those source questions; they are not automatically blocked forever.

## Limits

No new cryptographic blocker was found in the reviewed PR delta. The known canonical nonce weakness remains until the candidate is integrated through the required approvals. This review does not supply the missing human/security-reviewer approvals, production/election qualification, full 72-finding closure, complete KNOWN-list revalidation, signed vector/release provenance, Windows/macOS qualification, or a live security intake service.
