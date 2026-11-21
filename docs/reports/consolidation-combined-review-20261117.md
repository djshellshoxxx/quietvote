# Combined candidate — independent source integration review

Reviewed detached commit **`6f7d4daddc667bf0b1b4cd0dc1099c0813599968`**, tree **`9fe4efb1753f9ffbbe94aa8379663654aa722a15`**, in `session-evidence/quietvote-combined` on 2026-11-18 UTC. Canonical baseline is `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`; reviewed nonce head `fd23cb3a481328a2b6315ae34cc2ee589b31aead` is an exact ancestor. This is a detached local integration candidate, not a remote integration branch or main merge.

## Result

**No blocking integration source issue found.** The combined source retains each reviewed critical guard. No unexpected conflict-resolution edit, import/AST change, crypto/vector modification after #57, or interaction that bypasses the reviewed failure paths was found. This is a source integration review; no combined runtime, build or browser suite was rerun by this workstream.

The worktree was clean, there were no unmerged index entries, and the complete canonical-to-candidate diff check passed. The machine-readable receipt is `combined-independent-review.json` alongside this document. It records full source/applied SHAs, exact patch bindings, protected tree/blob identities, and scope limits.

## Exact component retention

| Component | Reviewed/source head | Applied combined commit | Source result |
|---|---|---|---|
| Nonce hardening, ADR-029 and existing test-only HTTP fix | `fd23cb3` | Exact ancestor | Retained unchanged |
| Final W15 preload and app-only UTF-8 build changes | `df064156` | `4a16a394` | Same complete two-commit source delta |
| M7 Python status-quo method restriction | `1ddd3f2` | `cae4e2a` | Same source/test delta |
| BC02 standalone CLI witness-policy anchor | `dcce09e` | `43ac146` | Same source/test/docs delta |
| P11 Python decrypter-list check | `19983c6` | `ff9d796` | Same source/test delta |
| P11 normative clarification | `20a1932` | `8f3671a` | Same documentation delta |
| P10 authenticated marker conflict | `a0f6c25` | `f946048` | Same source/test/docs delta |
| B3 conditional revote copy | `6763760`, based on W15 `754c586` | `6f7d4da` | Same copy/catalog/docs delta |

All seven applied deltas after #57 match their source deltas by stable patch ID. A stricter comparison also preserved every added/removed line byte-for-byte, omitting only Git index hashes and hunk positions. The B3 source was compared to its actual W15 parent, not canonical, so the comparison does not accidentally include W15 twice. Final file blobs outside the three intentionally composed files were also compared with the source heads. The composed files are QV-16, the current errata log, and Python `election.py`; their combined changes were read directly.

The complete `packages/crypto`, `test-vectors`, and canary objects remain identical to reviewed #57. The Python framed-hash registry, proof arithmetic and record-field schema also match #57, as do TypeScript schemas/signature-threshold verification, scripts, workflows and dependency manifests/lockfile. The candidate includes #57's authorized registry/vector regeneration; it introduces no additional regeneration, acceptance-expectation change or comparator exclusion.

## Critical guards and interactions

### Nonce hardening and verifier changes

The nonce prover implementation and cross-language registry are unchanged from the exact #57 source previously reviewed and executed. P10/P11/M7 do not alter proof equations, signature scopes, transcript framing or registry labels. Their tests continue to load the current corpus without changing its expectations. No canonical finding is described as fixed merely because its candidate patch appears in this detached tree.

M7's `method != "yes-no"` guard remains in Python manifest validation and retains the existing option-membership checks and other tie rules. It follows the source-backed QV-03 restriction; this does not silently adopt the other unratified numeric manifest bounds or close the wider B1-08 disagreement set.

P10 still authenticates schema-valid election-open/close markers before comparing canonical bodies. Identical authenticated bodies retain the first marker with a class-L finding; differing authenticated bodies fail the window before any ballot/tally/result processing. Invalid signatures cannot select the phase or create a conflict. The DKG-marker duplicate path is unchanged. Completed checks and fatal-verdict precedence remain intact.

P11 remains later in the Python tally path, where it compares the published list to independently reconstructed `T_valid` and adds fatal `E_DEC_PROOF` on mismatch. The failed-decryption gate still stops result rules and withholds results. Its change and P10's earlier stop occupy separate hunks in the same file: P10 does not bypass or reset P11, and a P10 conflict never reaches the tally path. Both normative clarifications are retained in QV-16 without replacing one another.

### W15 loading, changed bundles and copy

The preload helper, build graph/order logic, exact-shape extractor rule, chart import gate, stale-view checks, locale loader and tests match the final reviewed W15 source. In the combined app, chart import still follows successful `pinnedPreloads()`, and both stale-render and changed-snapshot checks still run after the await. Failed preload state remains cached as rejected and cannot open imports through later load events. Table fallback remains available.

The build computes pins from the resulting assets and visits static dependencies before dependents. The later crypto/verifier changes can alter bundle bytes, but do not replace that graph or hard-code older pins. App-only `charset: 'utf8'` remains in place; worker and standalone build configuration is unchanged. Exact combined build size and browser integrity behavior still require execution receipts on this candidate.

B3 changes only two existing guarantee/non-claim keys, their five draft catalog counterparts, the generated copy inventory and documentation. It introduces no import, AST-forwarding, eligibility or authorization change. Native-review maps remain empty, so the draft translations are still unoffered; W15's failed-load fallback and English source path are retained. The ballot-specific one-ballot/revote note remains driven by the authenticated manifest. The conditional copy does not create revoting permission or repair the separately recorded general quota-error wording.

No source change from this integration explains a new i18n extractor or module-resolution failure: the extractor and its permitted IIFE shape are the reviewed W15 version, subsequent changes do not edit that code, and dependency declarations/lockfile remain unchanged. This source observation does not establish the cause of a killed process.

### BC02 trust-anchor boundary

The standalone CLI path still downgrades only an otherwise `VERIFIED` board result to `PARTIAL` when either caller-supplied log key or witness policy is missing. It cannot turn a real `FAILED` result into `PARTIAL`. The underlying board verifier retains its specific self-attestation warnings, and supplying anchors does not bypass author/body checks.

Election bundles retain their separate manifest-bound policy path and reject the standalone external-policy option. The patch is specifically a standalone CLI trust-anchor correction. A board-integrity status remains distinct from a full election verdict; BC02 does not turn a board-only result into proof that P10, P11 or all election checks passed. Existing external-anchor trust assumptions remain explicit.

## Execution and approval limits

No new runtime tests, build, vector runner, browser scenario or benchmark was executed by this review lane. Earlier independent W15, P11 and P10 receipts remain tied to their actual executed source SHAs. M7 and B3 execution evidence belongs to the other review workstreams; this review inspected the resulting source and exact patch retention rather than claiming those executions as its own.

At the latest parent update, the combined root typecheck, TS 423-vector run and full Python 232-test run had passed. The parent also reported diagnostic-free termination of combined i18n and strict-comparison attempts and was investigating them. These are attributed status reports, not independently executed results here; an incomplete/killed attempt is not a pass. Original failed attempts must remain recorded even when a later run succeeds. A hosted check on an individual candidate is not by itself qualification of this exact combined tree.

Exact combined size, browser tampering behavior, cross-language report parity and the remaining suites are root-owned gates. This receipt does not establish complete mutation coverage, all historical/KNOWN closure, production qualification, native-language approval, deployment or release readiness. It does not change canonical or main. All required human/CODEOWNER/security-reviewer-group approvals remain outstanding; neither this AI review nor prior owner design approval supplies them.

## Publication note

Session-evidence paths and bare log names identify intermediate execution records outside this repository. Their commands, exact source identities, outcomes and available hashes are preserved in this report and the [validation receipt](consolidation-current-validation-20261117.json). Later test-only follow-ups and final combined execution are recorded in the [current reconciliation](consolidation-current-recheck-20261117.md); this review remains bound to its actual inspected tree.
