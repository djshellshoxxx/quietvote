# Consolidation security and privacy review

## Scope and evidence standard

This is an AI-assisted engineering review of the assembled QuietVote candidate,
its source branches and the changed trust boundaries. It is not an external
cryptographic audit, production-election approval or formal GitHub approval.
Historical audit severities remain in their original reports. The table below
describes demonstrated impact without inventing new CVSS scores.

Source provenance is in [CONSOLIDATION_REPORT](CONSOLIDATION_REPORT.md). Exact
combined-source checks and the fresh worker's independent review belong in
[FINAL_VERIFICATION](FINAL_VERIFICATION.md). A passing test establishes its covered
invariant, not the absence of all vulnerabilities.

## Confirmed findings and repairs

| Finding | Impact and precondition | Repair and regression evidence |
| --- | --- | --- |
| Prover nonce hedging, recovered #57 | Repeated caller randomness must not reuse a prover nonce across different signed statements. The old construction did not bind every intended transcript. | Recovered nonce-hedging revision, specifications and deterministic vectors; crypto/protocol regressions retain distinguishing cases. |
| Trustee index omitted from decryption nonce, newly repaired | The challenge includes trustee index j, but its hedged nonce omitted it. Identical secret shares, including threshold one, plus repeated RNG output could reuse a commitment across different challenges. | Bind u8(j) in aggregate and spoil decryption nonce transcripts. Three distinguishing regressions fail before repair. The slice passes 103 crypto tests, 423 TS vector checks and 27/27 shared verifier cases. [Nonce report](../reports/consolidation-nonce-index-20261118.md). |
| Published decrypter set, recovered #63 | A claimed tally decrypter set must match the independently verified set; plausible metadata is not proof. | Python validates the published set and rejects altered membership. Paired acceptance regressions accompany the source. |
| Authenticated marker conflicts, recovered #64 | A second validly signed conflicting marker cannot silently choose an alternate ceremony/election transition. | Both verifiers reject authenticated conflicts, retaining identical-repeat handling and existing classification of unauthenticated noise. |
| Status-quo ties, recovered #61 | Applying a yes/no-only rule to another contest method causes verifier disagreement. | Python enforces the documented method restriction; other unratified schema/bound choices remain separate. |
| Free-text public control reasons | Operator text could put private details in an immutable public log. | New production/admission uses the shared catalog only. Historical signed records remain readable; no existing signature is rewritten. |
| Signed-control replay | A fresh outer board envelope could replay an older quorum-signed control body. | Signed control_seq across producers, admission, import/export and both verifiers; authenticated replay/gaps/downgrades are rejected after the readable legacy prefix. [Control report](../reports/control-sequence-implementation-20261119.md). |
| Runtime database rollback | An older election database could otherwise permit fresh signatures over history older than previously released evidence. | Independent identity-bound control floor, FULL durability, startup peer evidence, duplicate/direct signing gates, quarantine and private-restore preservation. [Runtime report](../reports/runtime-rollback-anchor-20261118.md). |
| Export/deletion handoff | Download admission or an old export must not be treated as retention of the final public archive. | Immutable bounded bytes and hashes, explicit signed acknowledgement/notice, exact final-tree deletion gate, recovered job/response receipts and route/direct-pool checks. [Export report](../reports/recorded-public-exports-20261118.md). |
| Combined rollback/deletion gap | An older ARCHIVED database can have a locally matching acknowledged export while conflicting with the independent floor. | Deletion calls assertHealthy under the removal mutex before lifecycle/export authorization. Combined regression checks both HTTP routes, direct removal and retention of database/DEK. |
| Queued write after deletion | A writer already queued behind removal could issue a receipt after the registry tombstone and before file cleanup. | Retire the handle under the deletion mutex; require a live registry for signing/acquisition and retire closed handles. Three red-before regressions and 19 combined checks pass. [Lifetime report](../reports/consolidation-runtime-deletion-20261118.md). |
| Sealing-worker exceptions and late events | Construction exceptions escaped the failure path; retained callbacks could settle/terminate an operation again. | Constructor catch, single settlement and handler detachment; worker/ballot-flow regressions pass. |
| Misleading quota feedback | A general cast/spoil quota refusal implied one permitted ballot or that the first vote counted. | Dedicated non-retryable quota wording without echoing untrusted response text; eligibility rules are unchanged. |
| SPA verification cancellation gap | The application did not use the existing cooperative hook. | Progress/cancel/retry with generation/abort guards; obsolete work cannot publish a verdict. No CSP expansion or verifier verdict change. |
| Delayed verifier announcements | A queued live-region message could announce an obsolete result or status after route/run invalidation. | The callback now checks the captured route and generation at emission. Thirteen red-before cases and two positive controls pass, preserving current announcements. |
| Settings commit and lost-update handling | An IndexedDB request can succeed before transaction abort; separate stale reads can overwrite unrelated preference fields. | Settings resolve at transaction completion and read/merge/write atomically. Language, ID confirmation, receipt/device preferences and local acknowledgment preserve each other. |
| Cached failed IndexedDB opening | A transient failure permanently rejected subsequent reads, so the explicit retry action could not recover. | Discard only the failed opening promise; retain concurrent/successful caching, abort abandoned upgrades and close late abandoned connections. Independent retry regression passes. |
| Dependency provenance and consumption | Pinned registry metadata alone did not implement the accepted vendored-copy boundary. | Both Noble 2.4.0 tarballs, 132 verbatim files and SHA-256/SRI bindings; explicit verified copy installation, resolution checks and build/CI gates. No dependency version or registry-lock change. |

The separate independent engineering reviews found the queued-deletion, delayed-
announcement and failed-opening issues above. Their repairs were returned to the
authors and independently revalidated. The review reports and hosted qualification
receipt define the final covered source and remaining limits.

## Trust boundaries checked

**Election and author identity.** A self-consistent export does not establish that
it is the intended election. Caller-provided manifest hashes and independently
obtained author/witness pins remain necessary where the verification claim
requires them. Bundle metadata cannot appoint a trusted author or witness.

**Ballot integrity.** Signed envelopes, proofs, committed roll and latest-ballot
rules remain authoritative. Retry, duplicate receipt and restored runtime paths
must use the same history. The repairs do not change quota limits, counted-ballot
expectations or verification equations. Proof bytes change only where the
nonce construction changes; legacy verification remains supported.

**Confidentiality and metadata.** Recorded PUBLIC exports contain public election
evidence, not invitation/contact data or trustee secrets; regression canaries
check this boundary. Participation/timing metadata, coercion limits, same-origin
client delivery and endpoint compromise remain in the threat model. No universal
anonymity or malicious-client guarantee is supplied. Trustee secrets remain offline.

**Administrative and destructive authority.** Export operations use QV-Sig,
organization scope and idempotency. Acknowledgement is the caller's signed
assertion, not proof of an off-site backup. Deletion uses replayed state and a
mutex-protected final check before tombstone/DEK removal. Tests use synthetic data.

**Recovery and concurrency.** Election/control commits are distinct. Durable
append intents and operation receipts bridge crashes without publishing unanchored
signatures or repeating side effects. Old migration text/checksums are preserved;
election migration 11 and control migration 8 are additive. Event forwarding stops
while unhealthy, conservatively delaying quarantine alerts too. Any alert exception
must preserve the cursor boundary around unanchored checkpoints.

**Input/output handling.** Existing closed schemas, bounded JSON/archive input,
strict encodings, text-only DOM rendering, authenticated records, rate limits and
SSRF-safe peer transport remain the relevant boundaries. No exhaustive parser
fuzzer campaign or review of every injection path is claimed.

**Browser state and delivery.** Wrapped keys and durable pending-cast state keep
their existing contract. No plaintext secret persistence or silent memory fallback
was introduced. Lifecycle cleanup is covered; worker URL integrity remains a
separate gap. Draft translation review flags are unchanged.

**Supply chain.** Exact versions, registry integrity metadata, SHA-pinned Actions
and high/critical advisory gating must remain effective through vendoring. Final
CI records actual outcomes. Vendoring is not an upstream security audit; a zero
advisory count would not establish freedom from defects.

## Residual blockers

[UNFINISHED_WORK](UNFINISHED_WORK.md) records unresolved governance/time contracts,
manifest parity, whole-disk rollback without independent evidence, witness retrieval
and link privacy, JavaScript secret lifetime, Windows ACL qualification, release
signing, native-language/manual-accessibility review and reviewer appointments.

Main promotion requires the repository's formal approvals, including a designated
security reviewer. This report and an agent review cannot provide that appointment
or approval.
