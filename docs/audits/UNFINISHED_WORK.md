# Unfinished work and explicit blockers

This is the current consolidation ledger for the November 18, 2026 engineering
session. Older audits remain historical evidence. An implemented library, passing
fixture or proposed contract is not counted as a complete user workflow.

## Recovered and repaired in this candidate

| Area | Current implementation | Evidence and limit |
| --- | --- | --- |
| Historical platform and pinned membership work | PRs #69 and #70 are preserved, including their source branches, authenticated pinned roll, legacy attachment, backup floors and Windows fixture corrections. | [Branch inventory](BRANCH_INVENTORY.md); their earlier hosted passes qualify their own heads, not this composition. |
| Prover nonce hedging | PR #57 plus the trustee-index correction are composed. | [Nonce report](../reports/consolidation-nonce-index-20261118.md); independent security approval remains required. |
| Verifier acceptance | PR #61 restricts status-quo ties to yes/no; #63 checks published decrypter sets; #64 rejects authenticated conflicting markers. | Preserved source commits and focused paired tests; not a claim of complete verifier parity. |
| Public control reasons | New server admissions and CLI production use the catalog. | [Reason-code report](../reports/control-reason-admission-20261118.md); historical signed free text remains readable. |
| Signed monotonic controls | New producers/admission, replay, import/export and both verifiers enforce the authenticated counter with a readable legacy prefix. | [Control sequence report](../reports/control-sequence-implementation-20261119.md); an authenticated archive can still be stale. |
| Runtime rollback protection | Independent control floor, authenticated configured public-peer acquisition, signing/event gates and private restore-floor preservation are implemented. | [Runtime report](../reports/runtime-rollback-anchor-20261118.md); witness retrieval and private-link independent recovery remain limited by their contracts. |
| Recorded exports and deletion | Exact public archives, explicit signed acknowledgement/notice, durable recovery and the ARCHIVED deletion condition are implemented. | [Export report](../reports/recorded-public-exports-20261118.md); operator exports and a dedicated client management flow remain outside this accepted slice. |
| Ballot quota feedback | The general quota refusal no longer says that one ballot is allowed or that the first ballot necessarily counts. | `packages/web/test/error-args.test.ts`; draft translations remain unreviewed. |
| Sealing worker lifecycle | Constructor failures produce the normal failure result; settlement detaches callbacks and terminates once. | `packages/web/test/seal-worker-lifecycle.test.ts`; no worker integrity guarantee is added. |
| Application verification | `/verify` uses cooperative progress, cancel/retry and stale-run invalidation. | [SPA report](../reports/consolidation-spa-verifier-20261118.md); individual operations and parsing remain synchronous. |
| Verified dependency copies | Both existing Noble 2.4.0 releases are preserved verbatim and installed from the verified copies; build/CI checks actual resolution and bytes. | [Vendor report](../reports/vendored-crypto-20261119.md); lockfile and versions are unchanged. |
| Device preferences, rules and review | Shared/public-device and receipt preferences persist; rules acknowledgment is optional/local; each method gets the correct undervote notice. | [UI report](../reports/ui-device-preferences-20261119.md); final source is within the existing bundle budgets and the eighth browser journey is mandatory. |
| Reviewed lifetime/persistence defects | Deletion retires queued writers, stale verifier announcements are suppressed, settings commits merge atomically, and failed IndexedDB opening can be retried. | Independent regressions and [runtime report](../reports/consolidation-runtime-deletion-20261118.md); no automatic device clearing or memory-storage fallback. |
| ElGamal rerandomization | Already present in source commit `5ab2400`, inherited by the candidate. | `elgamalRerandomize` and existing crypto tests. The older B1-10 absence note is stale; this session does not count the operation as newly implemented. |

These implementations are assembled in the candidate. Exact-source hosted CI and
the final review/publication receipt remain qualification gates, independently of
the contract and release blockers below.

## Core functionality still blocked by concrete contracts

These are core product gaps, not optional future features. Existing preparatory
work remains useful and is preserved. The [governance contract](../rfcs/governance-v1-contract.md)
and [remaining-contracts review](../handoffs/QUIETVOTE-REMAINING-CONTRACTS-20261116.md)
identify the conflicts below; this ledger does not adopt new protocol decisions.

| Work | Existing foundation | Exact unresolved dependency | Evidence needed to close |
| --- | --- | --- | --- |
| Governed manifest and ratification | Isolated signed GroupRules history, strict parsers, offline signing and policy drafting exist. | Current suite-v1 manifests are closed and have no immutable group/rule/proposal bindings. New suite/envelope domains and finalized ratification authority must be adopted; unsigned sidecars cannot authorize rules. | Versioned dispatch, mandatory bindings, cross-profile stripping/replay negatives, old-export readability and both verifiers. |
| Proposal review and immutable attachment | Proposed version/permission model is documented. | Author/sponsor authority, substantive-change restart, pre-open withdrawal, snapshot ordering and an authenticated review clock need one consistent contract. | CLI/API/browser lifecycle plus independently checked exported version hashes. |
| Group membership lifecycle | Election registration and authenticated pinned snapshots exist. | Group identity/enrollment, rotation aliases, delayed lost-key recovery/veto, caps and revocation activation differ from election registration. Manifest-time snapshot prose conflicts with the accepted post-DKG roll-commit ordering. | Stable-member revoting, both-key rotation, cross-group replay rejection, unchanged denominator and independently verified activation. |
| Challenges, remedies and FINAL | Ordinary election tally/audit states exist. | Sources disagree on remedy enums, timeout versus signed resolution, late additions/denominator, confidential evidence, arbiter randomness/fallback and authoritative elapsed time. | Adopted record bytes and authority, evidence integrity, filing windows, threshold outcomes, irreversible finality and full client journeys. |
| Full V13 terminal effects | Legacy control authorization is implemented; monotonic-control work addresses replay separately. | Terminal verdict class and steward-versus-coordinator authority remain unresolved. | Both verifiers implement the adopted terminal effects and corresponding negative cases; no `not_run` masquerading as a completed check. |
| Authenticated live phase/freshness, B3-06 | Signed log parsing, receipt verification and reconnect handling exist. | A checkpoint signs origin/size/root, not a renewable timestamp. Existing witness notes do not define a 60-second renewable clock, same-head renewal or zero-witness behavior. Unsigned SSE time cannot prove freshness. | Precise signed renewal/age/skew/expiry rules, then pause/resume action gating and stale-feed browser regressions. |

## Remaining engineering and qualification boundaries

| Item | Current limit and next action |
| --- | --- |
| Manifest acceptance parity, B1-08 | #61 closes M7 only. Remaining numeric bounds, witness policy and eligible-basis schema differences need the conditional ADR-027 ruling applied per field. Do not copy an unsupported bound merely to make implementations agree. Preserve the distinguishing corpus and add paired tests for each adopted rule. |
| Python trustee-spoil mode, PY-01 | ADR-027/D-88 explicitly selects named refusal for `spoil_trustee_decrypt=true`; false is accepted. This is a declared capability boundary, not a silent pass or an unfinished accepted feature. |
| Independent board/receipt verification | The content-only cross-verifier harness excludes append-only board, witness and sampled-receipt checks. Python implements log verification separately; agreement in this content subset does not qualify the excluded checks. |
| Worker script integrity, W15 | Lazy modules use the accepted integrity path. Worker URL loading retains the documented gap; adopting a blob worker would change CSP and needs its own approved design. Lifecycle repair does not close integrity. |
| Storage-unavailable voting, B3-12 | Reading rules/results works without IndexedDB. Key custody, pending-cast recovery and stored receipts still depend on it. A session-only mode needs explicit key-export and unresolved-submission recovery behavior; silent memory fallback would discard persisted safety state. |
| Remaining UI wiring, B3-27 | The device/rules/undervote slice is implemented. Timezone entry and ambiguous-local-time policy, split-origin deployment/selection policy, and authenticated countdown/freshness behavior remain unresolved. Existing formatting helpers and catalog text do not supply these complete workflows. |
| Secret lifetime and timing | JavaScript `bigint` values are not reliably erasable or constant-time. Branded types alone would not establish either property. Complete S2/lifetime work requires a reviewed secret representation and supported-runtime evidence. |
| Trustee packaging/hardware | Age-compatible interoperability, hardware-token recipients, SLIP-0039 and an air-gapped image are not supplied by the existing custom bundle/CLI. ADR-027 retains the documented age-style boundary; external formats/hardware need their specified compatibility evidence. |
| Windows key-file ACLs | Hosted Windows functional tests do not establish NTFS ACL qualification. POSIX permission checks cannot substitute for a native Windows ACL check and fixture set. |
| Human review | No appointed security-reviewer group is recorded. Sensitive main promotion requires two formal approvals, including the designated security reviewer; an agent audit is not that approval. Historical missing DCO trailers remain an owner provenance decision and are not retrospectively attested here. |
| Release evidence | Release keys/ceremony, independent cryptographic review, signed vector/canary attestations and two-builder provenance are absent. Hash-checked unsigned candidate vectors are not signed releases. No deployment or release is part of this operation. |
| Accessibility and languages | Automated browser checks do not replace real assistive-technology, native Arabic or native translation review. Five translated catalogs remain machine drafts and unoffered. |

## Scope intentionally held by existing decisions

Ranked ballots, weighted/delegated voting, federation, post-quantum cosignatures,
and browser-held trustee secrets are not activated by consolidation. Follow the
existing phase/review gates and offline-trustee boundary. They are not used to
inflate the completed-feature count.

Final test outcomes, independent review and merge status belong in
[FINAL_VERIFICATION](FINAL_VERIFICATION.md) and
[CONSOLIDATION_REPORT](CONSOLIDATION_REPORT.md).
