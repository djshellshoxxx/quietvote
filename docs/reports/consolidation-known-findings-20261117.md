# Previously known findings: current reconciliation

Canonical: `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`. Candidate #57: `fd23cb3a481328a2b6315ae34cc2ee589b31aead`. Catalog #58: `9a03414e0e826db292f9dd5728e4d3d2f0682784`.

**Scope:** 33 historical table rows, not 33 independent additional vulnerabilities. This records a read-only mechanism review; that review lane made no product edits or remote mutations. Historical results remain unchanged.

The 33-row denominator is reconstructed from the first 20 B1 §4.2 known rows through C11 plus all 13 B2 KNOWN rows. The final six B1 known rows already extracted into the 72-row matrix are excluded. PR58 does not expose a separate 33-element array. Grouped aliases remain grouped.

**Disposition:** 24 narrow mechanisms fixed; 5 partial; 2 canonical mechanisms reproduced by existing evidence; 2 retained construction/surface items without fresh impact qualification.

**Evidence boundaries:** Most crypto evidence was executed on #57 and is transferable only where the relevant canonical mechanism is unchanged. Server/custody evidence is the canonical 32-test log. Source-only CLI/API/package checks are labeled. No new P11/P10 probe output is used; P11 remains a source-confirmed Python residual. No test/AI review represents required human or security-group approval.

## Subsequent candidate repairs

The matrix below remains a canonical-baseline record. These subsequent candidates have local and independent regression evidence, remain unmerged, and do not change its statuses, counts or original execution claims. Required formal approvals and integration gates remain separate. The [current reconciliation](consolidation-current-recheck-20261117.md) records hosted-CI status.

| Recorded residual | Candidate and exact published head | Candidate review and scope |
|---|---|---|
| P10 | [PR #64](https://github.com/djshellshoxxx/quietvote/pull/64), `4b88209afb5a6c8fba1df06e0af8d1c1ac21d15f` | [Independent review](consolidation-p10-review-20261117.md): authenticated differing election markers are fatal in both verifiers; identical repeats remain nonfatal. |
| P11 | [PR #63](https://github.com/djshellshoxxx/quietvote/pull/63), `0042967a76ef871d01f3726d1ff9331293e9a255` | [Independent review](consolidation-p11-review-20261117.md): Python rejects a false published decrypter list and withholds dependent results. |
| KNOWN BC-02 / BC-04 | [PR #62](https://github.com/djshellshoxxx/quietvote/pull/62), `6875cd36c65427dbc0b877b356727a396b7f9581` | [Candidate evidence](consolidation-current-recheck-20261117.md): missing standalone policy/log anchors yield PARTIAL; actual failures and the election path retain their behavior. |

Each linked review retains the local commit/tree actually reviewed. Published candidate heads are recorded separately; the historical baseline is not relabeled as a candidate test run.

## Matrix

| Historical row | Status | Current mechanism and evidence | Overlap with 72 |
|---|---|---|---|
| CP-01 | fixed | The ballot analysis collects cast alpha values only after envelope validity, checks signed spoils against them independent of reveal mode, and excludes rewrap conflicts. Recorded TypeScript and Python residual cases have current regression evidence. **Executed evidence reused.** | CP-01 (verifier-py residual) (same mechanism component); B1-01 (related) |
| CP-02 | reproducible | Canonical decProve derives cp-dec-nonce from secret, context, contest, option and rand32 without the complete statement. Independent canonical failed-RNG evidence is retained. #57 supplies the approved statement-bound nonce revision. **Executed evidence reused.** | B1-12 (same mechanism) |
| CP-03 | fixed | Schema required/optional membership uses Object.hasOwn; inherited names no longer satisfy field membership. **Executed evidence reused.** | B1-02 (related) |
| CP-04 | fixed | The TypeScript wrapper enforces strict subgroup policy; Python also rejects mixed-order public keys. Current independent-construction and strict-signature evidence covers the recorded mechanism. **Executed evidence reused.** | CP-04 (verifier-py residual) (same mechanism component); B1-08 (related) |
| CP-05 | fixed | Each valid coordinator roll commitment is compared with the supplied roll and all roll commits must precede election-open. **Executed evidence reused.** | No exact row identified |
| CP-06 | unverified | Current trustee specification explicitly retains rushing/last-mover bias as a residual construction property. No fresh bias experiment or uniform-key proof was performed. **Source review only.** | No exact row identified |
| CP-07 / C10 | fixed | The hard maximum is now logN=20, with a caller-selected lower maximum; header bounds are checked before KDF work. **Executed evidence reused.** | No exact row identified |
| CP-08 | partial | Specific omissions now have per-field conformance, adaptive/compensated negative tests, the hs_nz counter model and strict-mode pin. No new comprehensive mutation sweep was run, and the static M18 pin is not a behavioral discrimination proof. **Executed evidence reused.** | B1-11 (same mechanism) |
| P1 / TSV-05 | fixed | Default election verification is INCOMPLETE without required log evidence. Explicit trusted-caller content-only mode is constrained; supplied failed/malformed evidence cannot be waived. **Executed evidence reused.** | TSV-04 (same mechanism component); PY-02 (related) |
| P2 | fixed | The lower-level tally decryption helper rejects a counted list with repeated voter or ballot code before floor evaluation. **Executed evidence reused.** | No exact row identified |
| P3 | fixed | Byte-identical tally reposts are class L; a different tally body is fatal. Current Python handling distinguishes identical and conflicting bodies. **Executed evidence reused.** | B1-02 (same mechanism component) |
| P4 | fixed | Signed spoil status is retained independently of attached reveal correctness. A later cast of the same code remains excluded and the bad reveal is reported. **Executed evidence reused.** | B1-01 (related) |
| P6 | fixed | Current manifest validation rejects the recorded bidi-control and non-NFC trustee/witness names. **Executed evidence reused.** | B1-05 (same mechanism component) |
| P7 / TSV-03 | fixed | Decrypt becomes pass only after actual successful combination; the floor path leaves decrypt unrun and preserves the recorded rules failure. **Executed evidence reused.** | B1-07 (related); PY-02 (related) |
| P9 | fixed | A trustee enters the seen/keyconf set only after a valid proof, so invalid-first records cannot shadow the later valid confirmation. **Executed evidence reused.** | No exact row identified |
| P10 | partial | Canonical TypeScript and Python still treat duplicates as nonfatal without comparing bodies. The approved decision register requires identical repeats L and differing signed bodies F/E_MARKERS. The newer requirement is not implemented. **Source review only.** | B1-02 (related) |
| P11 | partial | TypeScript now fails chk.tally.decrypt with E_DEC_PROOF on exact-array mismatch. Python recomputes T_valid but only appends a note when tally.decrypters differs, then continues decrypt/rules. This is a source-confirmed Python residual. **Executed evidence reused.** | B1-07 (related) |
| C1, C4, C5, C6, C7, C8 | fixed | The corresponding guard functions reject the recorded invalid inputs. The six aliases remain one historical table row; their checks are individually identified in the executed crypto log. **Executed evidence reused.** | No exact row identified |
| C3 (OQ-7, T-043) | reproducible | Canonical prover functions still use scalarRandomNonZero(rng); independent baseline evidence covers failed-RNG behavior. The adopted hedging revision exists in #57. **Executed evidence reused.** | B1-12 (related) |
| C11 | unverified | The export surface remains: index.ts exports rng.ts, including streamRng, constantRng and vecrng. Their documentation labels them testing/vector helpers. A production misuse path was not demonstrated. **Source review only.** | No exact row identified |
| KNOWN SRV-001 | fixed | The finish callback now uses req.socket?.destroy(), safely handling a vanished socket; route body limits remain enforced. **Executed evidence reused.** | No exact row identified |
| KNOWN SRV-002 | fixed | Current IPv6 parsing normalizes addresses into the adopted /56 bucket before applying request limits. **Executed evidence reused.** | No exact row identified |
| KNOWN SRV-003 | fixed | HTTP response handling overrides route public cache policy with private,no-store when access is restricted. **Executed evidence reused.** | No exact row identified |
| KNOWN SRV-004 | fixed | The entries route tracks serialized entry bytes and stops the page at cfg.maxPageBytes while retaining forward paging progress. **Executed evidence reused.** | No exact row identified |
| KNOWN SRV-005/006/007 | fixed | Server TAR parsing delegates to the shared strict board framing; static serving excludes /api before SPA fallback; idempotency deletes use bound parameters. **Executed evidence reused.** | No exact row identified |
| KNOWN TR-01 / CP-01 | fixed | Production releaseSpoil authenticates the election/log, gathers cast alpha values and refuses requested spoil ciphertext components that overlap cast material. Current server/protocol paths reject the recorded admission mechanism. **Executed evidence reused.** | CP-01 (verifier-py residual) (related) |
| KNOWN TR-03 | partial | An O_EXCL lock and compare-before-write sealed hash now guard persistence; output is released only after save, and failure invalidates cached outputs. Executed tests use separate Trustee objects, held locks and Promise concurrency, not real concurrent child processes. **Executed evidence reused.** | No exact row identified |
| KNOWN TR-04 | fixed | assertNoFork compares every previously known sequence with the presented entries and refuses changed or missing earlier entries before release. **Executed evidence reused.** | No exact row identified |
| KNOWN TR-07/TR-08 | fixed | Production debugPlaintext is absent. Current custody logic refuses symlinks, hardlinks, nonregular files and replaced backup bytes before destructive removal. **Executed evidence reused.** | KNOWN TR-07/TR-08 (exact row) |
| KNOWN BC-01 | fixed | The CLI downgrades otherwise verified standalone board output to PARTIAL when --log-key is absent. **Source review only.** | No exact row identified |
| KNOWN BC-02 / BC-04 | partial | The CLI now accepts --witness-policy and --manifest-hash and passes these to verification/encryption. However standalone board verification still only warns when witness policy is self-attested; the ADR-027 adopted PARTIAL/exit-3 default is absent. **Source review only.** | B1-06 (related) |
| KNOWN BC-10 | fixed | The outer verification body catches malformed bundle access, and verdict construction uses optional bundle/entry access so null returns FAILED. **Source review only.** | No exact row identified |
| KNOWN DEP-01 | fixed | The CLI package now explicitly declares @quietvote/verifier in dependencies. **Source review only.** | No exact row identified |

## Priority gaps

1. **P11:** Python recomputes T_valid but reports mismatched decrypters as a note; source-confirmed parity and truthfulness gap. Small isolated fatal E_DEC_PROOF/decrypt-fail repair with valid-control, wrong-list, and informational-invalid-share regressions. See the subsequent [P11 candidate review](consolidation-p11-review-20261117.md). No new reproduction claimed.
2. **P10:** Approved differing signed election marker bodies remain L in both verifiers. Compare authenticated marker bodies; identical L, differing F/E_MARKERS; preserve malformed/unauthorized noise behavior and valid historical outcomes.
3. **KNOWN BC-02 / BC-04:** Approved standalone self-attested witness-policy downgrade is absent. Require external policy for standalone VERIFIED via PARTIAL/exit 3; update valid controls with explicit policy. Election-bundle path remains as specified.
4. **CP-02, C3 (OQ-7, T-043):** Canonical failed-RNG weaknesses have candidate-only repairs. Complete required candidate review/approval gates before integration; do not re-count as newly found vulnerabilities or canonical fixes.
5. **KNOWN TR-03, CP-08:** Real cross-process custody release/crash qualification and comprehensive mutation adequacy remain open. Schedule targeted qualification for the actual remaining boundary; avoid interpreting in-process or source pins as broader evidence.
6. **CP-06, C11:** Retained DKG construction limitation and public deterministic RNG surface have no new impact/closure qualification. Resolve construction assumptions and API migration scope deliberately; no uniform-key or production-misuse claim from present evidence.

## Deduplication

- KNOWN TR-07/TR-08 is exactly the same grouped row already included in the 72.
- CP-02 and B1-12 describe the same failed-RNG cp-dec weakness; CP-08 and B1-11 share the mutation-coverage mechanism.
- CP-01/CP-04 each include a Python component already explicitly extracted among the 72. P3/P6/P1 overlap components of broader rows as recorded in the JSON.
- CP-01 and KNOWN TR-01 / CP-01 also overlap each other within this 33-row list, across protocol versus production trustee/server paths.
- P10 and P11 are not closed by the broad B1-02/B1-07 parity rows. Related policy families are not exact duplicate findings.

## Per-row source and qualification notes

### CP-01

**fixed — The ballot analysis collects cast alpha values only after envelope validity, checks signed spoils against them independent of reveal mode, and excludes rewrap conflicts. Recorded TypeScript and Python residual cases have current regression evidence.

- `session-evidence/quietvote/packages/protocol/src/ballotlog.ts` — castAlphas and signedSpoils processing; common all-mode conflict analysis.
- `session-evidence/quietvote/packages/protocol/src/verify.ts` — Spoil verification consumes the recomputed conflict analysis.
- `session-evidence/quietvote/verifier-py/qv_verifier/election.py` — Current cast/spoil conflict analysis mirrors the recorded accepted-envelope restriction.
- `session-evidence/quietvote/packages/protocol/test/audit.test.ts` — All-mode/order rewrap controls; exact executed cases are listed in protocol-tests.log.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — CP-01: six mode/order rewrap cases, honest control, above-limit and after-close cases; relevant protocol source is unchanged between canonical and #57.
- Executed evidence: `session-evidence/analysis/crypto_review/python-units.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — 222-test Python suite on #57; terse output, therefore this is supporting suite evidence rather than a named individual Python result.

**Limit / next acceptance:** Historical rewrap/plant closure is scoped to inspected production analysis. The lower-level trusteeDecryptSpoiled helper accepts a previously verified SpoilRecord and no cast set; a fresh proof of misuse of that API was not performed. KNOWN TR-01 / CP-01 below is the same risk in server/trustee paths.

### CP-02

**reproducible — Canonical decProve derives cp-dec-nonce from secret, context, contest, option and rand32 without the complete statement. Independent canonical failed-RNG evidence is retained. #57 supplies the approved statement-bound nonce revision.

- `session-evidence/quietvote/packages/crypto/src/proofs.ts` — decProve around 215–225 omits A/B/M from canonical nonce derivation.
- `session-evidence/quietvote/packages/crypto/src/transcript.ts` — Canonical cp-dec-nonce registry field list.
- `session-evidence/quietvote/docs/plan/DECISIONS-2026-11-04.md` — CP-02 and C3 approved recommendation batches nonce registry changes; ADR-027 adopts the register.
- Executed evidence: `session-evidence/analysis/crypto_review/nonce-baseline.json` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — Independent current canonical failed-RNG reproduction.
- Executed evidence: `session-evidence/analysis/crypto_review/nonce-candidate.json` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Candidate comparison blocks the repeated-nonce mechanism.
- Executed evidence: `session-evidence/analysis/crypto_review/crypto-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Candidate constant-RNG regression coverage.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Candidate end-to-end dealing, key-confirmation and decryption coverage.

**Limit / next acceptance:** Canonical remains affected. Candidate evidence is not a human or security-group approval; required review and integration gates remain separate.

**#57 boundary:** #57 implements the repair. Do not transfer candidate closure to canonical.

### CP-03

**fixed — Schema required/optional membership uses Object.hasOwn; inherited names no longer satisfy field membership.

- `session-evidence/quietvote/packages/protocol/src/schema.ts` — check() around 69–76 uses own-property membership.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — CP-03 Object.prototype schema names regression; schema.ts is unchanged from canonical.

### CP-04

**fixed — The TypeScript wrapper enforces strict subgroup policy; Python also rejects mixed-order public keys. Current independent-construction and strict-signature evidence covers the recorded mechanism.

- `session-evidence/quietvote/packages/crypto/src/ed25519.ts` — Strict point predicate includes non-small-order and torsion-free checks; explicit zip215:false.
- `session-evidence/quietvote/verifier-py/qv_verifier/ed25519.py` — Strict public-key/signature validation.
- Executed evidence: `session-evidence/analysis/crypto_review/crypto-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — CP-04 mixed-order public key/R rejection with honest controls; ed25519 source is unchanged from canonical.
- Executed evidence: `session-evidence/analysis/crypto_review/python-units.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Python suite on #57 includes independent-construction strict-point tests; individual names not printed.

### CP-05

**fixed — Each valid coordinator roll commitment is compared with the supplied roll and all roll commits must precede election-open.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — Around 389–408 validate every signed roll commit; 480–485 reject late commits.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — CP-05 signed roll commit replay after open is fatal; relevant verifier source unchanged from canonical.

**Limit / next acceptance:** The evidence covers the recorded conflicting/late-commit mechanism, not all possible log equivocation.

### CP-06

**unverified — Current trustee specification explicitly retains rushing/last-mover bias as a residual construction property. No fresh bias experiment or uniform-key proof was performed.

- `session-evidence/quietvote/docs/17-key-ceremony-trustees.md` — Around 455 names rushing/last-mover bias as residual and delegates analysis to QV-16.
- `session-evidence/quietvote/packages/protocol/src/dkg.ts` — Public deterministic qualification retains the existing construction.
- `session-evidence/quietvote/docs/audit/crypto-protocol.md` — Historical CP-06 reasoning at 127; not current execution.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** Unverified means unqualified construction security, not uncertainty that the limitation is documented. A uniform-K claim requires a separate construction/assumption decision and proof; documentation alone is not a cryptographic repair.

### CP-07 / C10

**fixed — The hard maximum is now logN=20, with a caller-selected lower maximum; header bounds are checked before KDF work.

- `session-evidence/quietvote/packages/crypto/src/bundle-cipher.ts` — BUNDLE_MAX_LOGN=20; openWithPassphrase validates maxLogN and header before kdf.
- Executed evidence: `session-evidence/analysis/crypto_review/crypto-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — C10 rejects a header above the work cap before scrypt; bundle-cipher.ts unchanged from canonical.

**Limit / next acceptance:** This closes the recorded unbounded/high default header path under the adopted cap. A permitted logN=20 can still be expensive (roughly 1 GiB for the scrypt memory formula); no deployment resource qualification claimed.

### CP-08

**partial — Specific omissions now have per-field conformance, adaptive/compensated negative tests, the hs_nz counter model and strict-mode pin. No new comprehensive mutation sweep was run, and the static M18 pin is not a behavioral discrimination proof.

- `session-evidence/quietvote/packages/crypto/test/cp08-fiat-shamir.test.ts` — Registry conformance, adversarial negatives, one-field changes and hs_nz counter model.
- `session-evidence/quietvote/packages/crypto/test/cp08-ed25519-zip215.test.ts` — ZIP-215 negatives and explicit option source pin.
- `session-evidence/quietvote/packages/protocol/NOTES.md` — 319–340 documents named coverage and the historical five-mutant receipt.
- Executed evidence: `session-evidence/analysis/crypto_review/crypto-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Executed named M3/M7/M8/M15/M18 and every-field tests; not a comprehensive fresh mutation sweep.

**Limit / next acceptance:** Complete mutation adequacy remains open. Source pin coverage should be described separately from behaviorally distinguishing vectors.

**#57 boundary:** #57 updates nonce-related expectations. Its 101-pass crypto run is candidate evidence; unaffected tests support the corresponding unchanged canonical mechanisms.

### P1 / TSV-05

**fixed — Default election verification is INCOMPLETE without required log evidence. Explicit trusted-caller content-only mode is constrained; supplied failed/malformed evidence cannot be waived.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — 126–131 and 160–167 missing-log and content-only verdict rules.
- `session-evidence/quietvote/packages/verifier/src/verify.ts` — Composed board/witness evidence cannot yield PASS after skipped or failed verification.
- `session-evidence/quietvote/verifier-py/qv_verifier/election.py` — verify_bundle default log gate and caller-only allow_no_log.
- Executed evidence: `session-evidence/analysis/crypto_review/verifier-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Seven explicit P1 cases: default board requirement, malformed/redacted evidence, unsigned policy, zero-witness opt-in, exceptions and CLI report scope; relevant sources unchanged from canonical.

**Limit / next acceptance:** A deliberate, prominently caveated content-only PASS is still available to trusted callers; it is not a log-integrity PASS.

### P2

**fixed — The lower-level tally decryption helper rejects a counted list with repeated voter or ballot code before floor evaluation.

- `session-evidence/quietvote/packages/protocol/src/tally.ts` — trusteeDecryptTally around 41–45 enforces unique voters and codes.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — P2 duplicate-voter and duplicate-code rejection with honest distinct-counted control; relevant source unchanged.

**Limit / next acceptance:** The helper still requires an authenticated, correctly analyzed counted set from its caller; this is not proof of safety for arbitrary fabricated inputs.

### P3

**fixed — Byte-identical tally reposts are class L; a different tally body is fatal. Current Python handling distinguishes identical and conflicting bodies.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — 538–541 distinguish identical tally from conflicting body.
- `session-evidence/quietvote/verifier-py/qv_verifier/election.py` — Around 639–641 distinguish identical and different tally records.
- `session-evidence/quietvote/packages/protocol/test/second-wave.test.ts` — P3 regression includes coordinator re-signing and identical control.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — P3 signed conflicting tally FAIL and identical repeat PASS; relevant source unchanged.

### P4

**fixed — Signed spoil status is retained independently of attached reveal correctness. A later cast of the same code remains excluded and the bad reveal is reported.

- `session-evidence/quietvote/packages/protocol/src/ballotlog.ts` — Signed-spoil tracking is separate from reveal validity.
- `session-evidence/quietvote/packages/protocol/test/second-wave.test.ts` — P4/REQ-015 corrupt attached reveal then cast regression.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — P4 mismatch-reveal spoil remains binding and later cast is excluded; relevant source unchanged.

### P6

**fixed — Current manifest validation rejects the recorded bidi-control and non-NFC trustee/witness names.

- `session-evidence/quietvote/packages/protocol/src/manifest.ts` — Manifest text validation for trustee and witness names.
- `session-evidence/quietvote/packages/protocol/test/second-wave.test.ts` — P6 bidi and non-NFC rejection cases.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — P6 named regression executes; manifest validation source unchanged.

### P7 / TSV-03

**fixed — Decrypt becomes pass only after actual successful combination; the floor path leaves decrypt unrun and preserves the recorded rules failure.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — Around 544 and 599–607 only actual decryption can pass; floor failure precedes combination.
- `session-evidence/quietvote/packages/protocol/test/second-wave.test.ts` — P7/TSV-03 below-floor status assertions.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — P7 below-floor verdict/check regression; relevant source unchanged.

### P9

**fixed — A trustee enters the seen/keyconf set only after a valid proof, so invalid-first records cannot shadow the later valid confirmation.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — 442–450 validates keyconf before recording it as seen.
- `session-evidence/quietvote/packages/protocol/test/second-wave.test.ts` — P9 invalid-first/later-valid regression.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — P9 valid-later keyconf recovery PASS and earlier invalid L finding; relevant source unchanged.

**Limit / next acceptance:** The exact older Python behavior was already permissive in the desired direction; this execution is the TS regression, not an independent new Python claim.

### P10

**partial — Canonical TypeScript and Python still treat duplicates as nonfatal without comparing bodies. The approved decision register requires identical repeats L and differing signed bodies F/E_MARKERS. The newer requirement is not implemented.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — 468–470 applies L to every duplicate valid election marker.
- `session-evidence/quietvote/verifier-py/qv_verifier/election.py` — Duplicate marker branches around 430/497 retain first-wins nonfatal behavior.
- `session-evidence/quietvote/docs/plan/DECISIONS-2026-11-04.md` — 85–93 P10 recommends differing=F E_MARKERS, identical=L; adopted by ADR-027.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** Source-confirmed residual only; no new reproduction used. Acceptance: authorized identical open/close repost leaves valid outcome unchanged with L; authorized differing body is F/E_MARKERS in both verifiers. Keep unauthorized/malformed record noise rules unchanged.

**Subsequent candidate resolution:** [PR #64](https://github.com/djshellshoxxx/quietvote/pull/64), head `4b88209afb5a6c8fba1df06e0af8d1c1ac21d15f`; [independent review](consolidation-p10-review-20261117.md). Candidate only; the canonical partial status above remains unchanged.

### P11

**partial — TypeScript now fails chk.tally.decrypt with E_DEC_PROOF on exact-array mismatch. Python recomputes T_valid but only appends a note when tally.decrypters differs, then continues decrypt/rules. This is a source-confirmed Python residual.

- `session-evidence/quietvote/packages/protocol/src/verify.ts` — 605–607 require tally.decrypters to equal dec.value.validSet and fail the decryption check otherwise.
- `session-evidence/quietvote/verifier-py/qv_verifier/election.py` — 696–719 recompute T_valid; 720–721 mismatch merely appends a note; canonical S and decryption follow.
- `session-evidence/quietvote/packages/protocol/test/second-wave.test.ts` — 124–135 P11 valid control and changed decrypters assert TS FAIL/decrypt fail.
- `session-evidence/quietvote/docs/16-crypto-protocol.md` — QV-16-REQ-019 (75): recompute every tally field; §5.19.1 (765): decrypters lists all T_valid members, not only canonical S.
- `session-evidence/quietvote/docs/35-second-verifier.md` — REQ-003/005 require truthful checks and no rules evaluation after decryption failure.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Existing #57 TS P11 regression passed; verify.ts unchanged from canonical. This is not an executed Python mismatch regression.

**Limit / next acceptance:** No new reproduction is claimed or relied on, per parent instruction. See known-p11-handoff.md for minimal repair and regression boundary; no P11-specific ADR was located.

**Subsequent candidate resolution:** [PR #63](https://github.com/djshellshoxxx/quietvote/pull/63), head `0042967a76ef871d01f3726d1ff9331293e9a255`; [independent review](consolidation-p11-review-20261117.md). Candidate only; the canonical Python residual above remains unchanged.

### C1, C4, C5, C6, C7, C8

**fixed — The corresponding guard functions reject the recorded invalid inputs. The six aliases remain one historical table row; their checks are individually identified in the executed crypto log.

- `session-evidence/quietvote/packages/crypto/src/share-cipher.ts` — C1 identity recipient guard before DH encryption.
- `session-evidence/quietvote/packages/crypto/src/elgamal.ts` — C4 requires 0<r<ell.
- `session-evidence/quietvote/packages/crypto/src/json.ts` — C5 canonicalization validates the QV-JSON domain.
- `session-evidence/quietvote/packages/crypto/src/proofs.ts` — C6 invalid-u32 limit returns false; C8 DH/cp-dec-spoil identity rejection.
- `session-evidence/quietvote/packages/crypto/src/feldman.ts` — C7 rejects zero trustee index.
- Executed evidence: `session-evidence/analysis/crypto_review/crypto-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Named C1/C4/C5/C6/C7/C8 checks all pass. Guard logic is unchanged from canonical even where #57 modifies other proof nonce code.

**Limit / next acceptance:** This grouped row closes the named API input cases only; it is not a general primitive audit.

### C3 (OQ-7, T-043)

**reproducible — Canonical prover functions still use scalarRandomNonZero(rng); independent baseline evidence covers failed-RNG behavior. The adopted hedging revision exists in #57.

- `session-evidence/quietvote/packages/crypto/src/proofs.ts` — pokProve 49–53, shareKeyProve 66–70 and dhProve 84–89 use unhedged RNG nonces.
- `session-evidence/quietvote/docs/plan/DECISIONS-2026-11-04.md` — 167–174 batches C3 with CP-02 under a statement-bound nonce registry revision.
- Executed evidence: `session-evidence/analysis/crypto_review/nonce-baseline.json` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — Canonical proof-family repeated-RNG probe.
- Executed evidence: `session-evidence/analysis/crypto_review/nonce-candidate.json` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Candidate changed-statement failed-RNG comparison.
- Executed evidence: `session-evidence/analysis/crypto_review/crypto-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Candidate conformance nonce hedge tests.

**Limit / next acceptance:** Historically this was an allowed design choice; the later approved requirement changes the acceptance target. Candidate tests do not replace required human/security-group approval.

**#57 boundary:** #57 implements the C3 proof-family hedges; canonical remains unchanged.

### C11

**unverified — The export surface remains: index.ts exports rng.ts, including streamRng, constantRng and vecrng. Their documentation labels them testing/vector helpers. A production misuse path was not demonstrated.

- `session-evidence/quietvote/packages/crypto/src/index.ts` — Line 5 exports all rng.ts symbols.
- `session-evidence/quietvote/packages/crypto/src/rng.ts` — systemRng uses crypto.getRandomValues; deterministic helpers remain public exports with test-only comments.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** Export presence is source-confirmed. Unverified refers to a concrete production impact/closure, not the existence of the exports. Moving them requires a deliberate API/test-consumer migration; no such migration is in #57.

### KNOWN SRV-001

**fixed — The finish callback now uses req.socket?.destroy(), safely handling a vanished socket; route body limits remain enforced.

- `session-evidence/quietvote/packages/server/src/http.ts` — 450 uses optional socket destruction; 165–171 limits streamed bytes.
- `session-evidence/quietvote/packages/server/test/audit.test.ts` — 318 oversized chunked-body and safe error response regression.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — Executed SRV-001 chunked-body cutoff case on canonical.

**Limit / next acceptance:** Source closes the specific null-socket dereference. The reused test is an HTTP body-limit regression, not a newly executed real child-process peer-disconnect crash campaign.

### KNOWN SRV-002

**fixed — Current IPv6 parsing normalizes addresses into the adopted /56 bucket before applying request limits.

- `session-evidence/quietvote/packages/server/src/ratelimit.ts` — 89–109 normalization and 134 bucket use.
- `session-evidence/quietvote/packages/server/test/audit.test.ts` — 50 canonical/compressed /56 same-bucket test under ADR-027 N-32(a).
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — SRV-002 compressed-address /56 regression executed on canonical.

**Limit / next acceptance:** The adopted /56 rule differs from the old report’s /64 terminology. This does not establish global distributed rate-limit resistance.

### KNOWN SRV-003

**fixed — HTTP response handling overrides route public cache policy with private,no-store when access is restricted.

- `session-evidence/quietvote/packages/server/src/http.ts` — Around 398 restricted response cache override.
- `session-evidence/quietvote/packages/server/test/audit.test.ts` — 71 read-key protected response regression.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — SRV-003 cache header regression executed on canonical.

**Limit / next acceptance:** Closes the recorded cache-control disclosure mechanism; no external CDN/proxy qualification is claimed.

### KNOWN SRV-004

**fixed — The entries route tracks serialized entry bytes and stops the page at cfg.maxPageBytes while retaining forward paging progress.

- `session-evidence/quietvote/packages/server/src/app.ts` — 730–738 byte accounting and page cutoff.
- `session-evidence/quietvote/packages/server/test/audit.test.ts` — 149 byte-bounded page and complete paging regression.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — SRV-004 page limit and full paging control executed on canonical.

**Limit / next acceptance:** The first bounded entry may be included to make progress. This is the recorded per-page bound, not overall load qualification.

### KNOWN SRV-005/006/007

**fixed — Server TAR parsing delegates to the shared strict board framing; static serving excludes /api before SPA fallback; idempotency deletes use bound parameters.

- `session-evidence/quietvote/packages/server/src/tar.ts` — Compatibility exports delegate to @quietvote/board.
- `session-evidence/quietvote/packages/board/src/tar.ts` — Shared archive parser validates framing.
- `session-evidence/quietvote/packages/server/src/static.ts` — 67 refuses /api and /api/* before fallback.
- `session-evidence/quietvote/packages/server/src/controldb.ts` — 512/524 prepared idempotency delete statements.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — Named SRV-005 malformed TAR, SRV-006 SPA/traversal and SRV-007 SQL/idempotency cleanup tests on canonical.

**Limit / next acceptance:** Three aliases remain one historical row. No blanket parser fuzz or SQL audit closure is inferred.

### KNOWN TR-01 / CP-01

**fixed — Production releaseSpoil authenticates the election/log, gathers cast alpha values and refuses requested spoil ciphertext components that overlap cast material. Current server/protocol paths reject the recorded admission mechanism.

- `session-evidence/quietvote/packages/trustee/src/trustee.ts` — 829–858 verifiedElection, cast-code/alpha collection, and refusal before share release.
- `session-evidence/quietvote/packages/protocol/src/ballotlog.ts` — Shared all-mode rewrap rejection.
- `session-evidence/quietvote/packages/server/src/election.ts` — Server consumes authenticated ballot-log validation.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — TR-01 cast-as-spoil release refusal executes on canonical.
- Executed evidence: `session-evidence/analysis/crypto_review/protocol-tests.log` at `fd23cb3a481328a2b6315ae34cc2ee589b31aead` — Shared CP-01 rewrap/order controls on unchanged protocol source.

**Limit / next acceptance:** This is internally overlapping with CP-01 above; do not add independent vulnerability counts for aliases/components. Invalid raw cast alpha planting in the trustee’s extra defensive set was not separately requalified here.

### KNOWN TR-03

**partial — An O_EXCL lock and compare-before-write sealed hash now guard persistence; output is released only after save, and failure invalidates cached outputs. Executed tests use separate Trustee objects, held locks and Promise concurrency, not real concurrent child processes.

- `session-evidence/quietvote/packages/trustee/src/fsutil.ts` — 123–140 withLock uses open(wx), then closes and unlinks in finally.
- `session-evidence/quietvote/packages/trustee/src/trustee.ts` — 277–294 save compares disk hash under lock, syncs ledger and invalidates on failure.
- `session-evidence/quietvote/packages/trustee/test/audit.test.ts` — 132–156 object/held-lock/Promise tests; title says second process but body does not spawn a process.
- `session-evidence/quietvote/packages/trustee/test/custody.test.ts` — Canonical path aliases share lock and release ledger.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — Executed stale-object, lock contention, failed save, relocated backup, restore ledger and canonical alias cases on canonical.

**Limit / next acceptance:** Historical missing guards are repaired; real cross-process simultaneous release and crash/recovery qualification remain unverified. The status is conservative about that exact original concurrency boundary.

### KNOWN TR-04

**fixed — assertNoFork compares every previously known sequence with the presented entries and refuses changed or missing earlier entries before release.

- `session-evidence/quietvote/packages/trustee/src/trustee.ts` — 742 onward assertNoFork compares this.d.log with presented entries and rejects duplicate/changed/missing known sequences.
- `session-evidence/quietvote/packages/trustee/test/audit.test.ts` — 159–175 altered known entry, missing known entry and good control.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — TR-04 imported-log fork refusal executed on canonical.

**Limit / next acceptance:** Closes the recorded imported-prefix check, not independent external witness/rollback qualification.

### KNOWN TR-07/TR-08

**fixed — Production debugPlaintext is absent. Current custody logic refuses symlinks, hardlinks, nonregular files and replaced backup bytes before destructive removal.

- `session-evidence/quietvote/packages/trustee/src/trustee.ts` — Production source search found no debugPlaintext API.
- `session-evidence/quietvote/packages/trustee/src/fsutil.ts` — Identity/type checked shredding.
- `session-evidence/quietvote/packages/trustee/test/custody.test.ts` — TR-08 symlink, hardlink, nonregular and replacement regressions.
- Executed evidence: `session-evidence/analysis/custody-server-audit.log` at `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` — Canonical executed custody checks; reused from the B2 current matrix.

**Limit / next acceptance:** No global secret-lifetime or physical-storage-erasure guarantee is implied.

### KNOWN BC-01

**fixed — The CLI downgrades otherwise verified standalone board output to PARTIAL when --log-key is absent.

- `session-evidence/quietvote/packages/cli/src/cmd-board.ts` — 73–82 apply explicit log-key downgrade and partial exit behavior.
- `session-evidence/quietvote/packages/cli/test/audit.test.ts` — 24–37 source regression asserts no-log-key exit 3 and pinned-log-key exit 0; not newly executed here.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** Source-confirmed narrow log-key fix. No new CLI run is claimed. The separate witness-policy default residual remains in BC-02 below.

### KNOWN BC-02 / BC-04

**partial — The CLI now accepts --witness-policy and --manifest-hash and passes these to verification/encryption. However standalone board verification still only warns when witness policy is self-attested; the ADR-027 adopted PARTIAL/exit-3 default is absent.

- `session-evidence/quietvote/packages/cli/src/cmd-board.ts` — Accepted policy flag and explicit verify options; 73–82 downgrade only unpinned log key.
- `session-evidence/quietvote/packages/board/src/bundle.ts` — 121–123 chooses bundle policy when no external policy and emits a warning without itself forcing PARTIAL.
- `session-evidence/quietvote/packages/cli/src/cmd-ballot.ts` — 39 and 52 accept/use pinned manifest hash for election context.
- `session-evidence/quietvote/packages/cli/test/audit.test.ts` — 39–58 external witness policy and 76–99 manifest pin test source; not newly executed.
- `session-evidence/quietvote/docs/plan/DECISIONS-2026-11-04.md` — BC-02 option A: self-attested policy must downgrade to PARTIAL/exit 3; adopted in ADR-027.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** Source-confirmed approved-default residual. Old BC-01 test expects exit 0 with only log key and author key, so a green old test would not close the newer decision. Add explicit policy for VERIFIED controls; keep the election-bundle path unchanged.

**Subsequent candidate resolution:** [PR #62](https://github.com/djshellshoxxx/quietvote/pull/62), head `6875cd36c65427dbc0b877b356727a396b7f9581`; [candidate evidence](consolidation-current-recheck-20261117.md). It addresses the standalone BC-02 residual, preserving the election path; the grouped canonical row stays partial.

### KNOWN BC-10

**fixed — The outer verification body catches malformed bundle access, and verdict construction uses optional bundle/entry access so null returns FAILED.

- `session-evidence/quietvote/packages/board/src/bundle.ts` — 99–115 guarded verdict constructor and outer try; 287–291 structural failure catch.
- `session-evidence/quietvote/packages/board/test/audit-bc.test.ts` — 312/334 malformed/null structural inputs; test source only in this workstream.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** Direct source review supports the exact JSON-null behavior. No new BC-10 test execution or arbitrary-hostile-JavaScript-object totality claim is made.

### KNOWN DEP-01

**fixed — The CLI package now explicitly declares @quietvote/verifier in dependencies.

- `session-evidence/quietvote/packages/cli/package.json` — dependencies includes @quietvote/verifier: *.
- `session-evidence/quietvote/packages/cli/src/cmd-verify.ts` — Runtime dependency use.

Execution: source inspection only; no newly executed result is claimed.

**Limit / next acceptance:** The specific missing declaration is corrected by inspection. A clean external package install/distribution test was not performed.

## Publication note

Session-evidence paths and bare execution-log names identify intermediate evidence outside this repository. This report preserves their exact source, commands, results and available hashes; they are not repository download links. New candidate PRs and current hosted-CI status are recorded in the [current reconciliation](consolidation-current-recheck-20261117.md). Original canonical statuses remain bound to their stated SHA.
