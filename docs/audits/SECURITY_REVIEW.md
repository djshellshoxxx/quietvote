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
| Adopted Python manifest/rules constraints | Python accepted the reserved contest threshold basis `roll` and invalid adopted single-choice shapes, including a shortcut before unmet quorum. This differed from the already adopted policy. | Refuse reserved contest basis before shortcuts and enforce single-choice minimum options/one winner. Preserve roll-based participation quorum and other-method behavior. [Independent receipt](INDEPENDENT_MANIFEST_FOLLOWUP.md): 22 focused checks plus five independent boundary scenarios pass, with distinguishing pre-repair failures. |
| Windows private-file permission bypass | POSIX mode bits did not establish a private Windows DACL, and previous Windows branches skipped that inspection for client secrets. | Native creation applies the private DACL before bytes; inspection and reads use the held file handle, owner SID, protected non-null DACL, recognized grants and stable single-link identity. Fixed script/data-only IPC has no permissive fallback. [Implementation](../reports/windows-private-files-20261119.md); actual Windows execution remains a separate gate. |
| Atomic file publication and cleanup | The inherited trustee writer closed custody before publication and could change the permissions of a substituted output. Follow-up source review also found that a checked staging pathname remained mutable before unlink. | Keep the descriptor, apply mode before data, validate publication and protect the POSIX staging namespace through trusted ancestry. Author 35 focused and 19 adjacent checks pass on 239dfaf9. [Independent source receipt](INDEPENDENT_TRUSTEE_PUBLICATION_SOURCE.md) is explicitly conditional on effective mode permissions; native ACL overrides remain unresolved. No secret exposure beyond the demonstrated custody/false-success behavior is asserted. |
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
| Late returned receipt lost after navigation | A response arriving after the voter left Vote could lose its download when receipt remembering was off, in session and ordinary durable-mode paths. Receipt-bearing inclusion alarms had the same symptom. | Document-local public-result handoff with context/key/manifest binding, pending-code precedence and clear-generation guards. Four unchanged independent pre-repair failures pass after repair; no receipt-store write is added. [Repair and limits](../reports/late-cast-receipt-handoff-20261119.md). |
| Session navigation disclosure | Navigation/reload wording overstated loss as if leaving erased retained memory; browser history caching can retain a document. | All six catalogs and operator guidance distinguish potential loss of access from erasure and name explicit session clearing. Actual-app copy assertions pass. This correction belongs to the session feature; it is not an independently demonstrated memory-erasure guarantee. [Independent review](INDEPENDENT_SESSION_BUILD_FOLLOWUP.md). |
| Live enrollment log binding and load lifetime | A context derived after initial enrollment could bypass the initial manifest/server log binding and retain a placeholder receipt key. A missing metadata field could throw after installing that context, and an older draft load could replace an active cache entry and orphan its live stream. | Bind before use, clear the context before validation, explicitly reject non-string log metadata, and publish a load to the cache only within its current route epoch. Independent distinguishing actual-app regressions accompany the repair. [Implementation](../reports/hosted-browser-repair-20261119.md) and [independent receipt](INDEPENDENT_LIVE_TRANSITION_FOLLOWUP.md). These are one lifecycle defect family; no forged-receipt exploit is claimed. |
| Organizer date-resolution errors | Fixed one-hour gap alternatives can remain inside a skipped day; Date.UTC reinterprets years below 100, and rounding historical offsets loses seconds. These produced incorrect accepted-input previews. The existing creation/open ordering already prevents publishing those historical elections with today's creation time. | Resolve real alternatives, preserve exact calendar years/era and offset seconds, require explicit fold choices, and invalidate prepared publication after date edits. Author tests and the reviewer's unchanged distinguishing probes pass. [Timezone report](../reports/organizer-timezone-20261119.md). |
| Separate-origin resume metadata | Cross-origin SSE resumption requires the existing Last-Event-ID request header to pass preflight; authenticated clients also need existing retry/rate/request metadata exposed. | Add the named header and bounded exposed response headers without changing the origin allowlist. Two CORS regressions fail before repair and pass after it. [Origin report](../reports/split-origin-implementation-20261119.md). |
| Eager empty-draft startup | Treating every missing anchor as unfinished recovery opened untouched empty drafts, violating lazy response recovery. | Require recovery for a nonempty unanchored owned log or an anchor/size mismatch; preserve explicit append intent and first-acquisition health gates. Boundary regressions cover configured peers and rollback to empty. [Repair report](../reports/hosted-ci-repair-20261119.md). |
| Dependency provenance and consumption | Pinned registry metadata alone did not implement the accepted vendored-copy boundary. | Both Noble 2.4.0 tarballs, 132 verbatim files and SHA-256/SRI bindings; explicit verified copy installation, resolution checks and build/CI gates. No dependency version or registry-lock change. |

The separate independent engineering reviews found the queued-deletion, delayed-
announcement, failed-opening and historical-offset issues above. Their repairs were returned to the
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

**Client filesystem custody.** Native Windows private operations bind security
inspection and bytes to the same held handle. The POSIX publication repair binds
cleanup to a protected staging namespace under the inspected owner/mode/sticky
policy. It assumes the current effective user and root remain trusted. ACL grants
overriding that policy, including macOS native namespace grants, remain an open
implementation/qualification boundary; ordinary permission bits or normal-path
CI do not establish protection against them. The earlier independent runtime
follow-up was stopped by an automated content check. Its materially narrower
source-only successor records that gap and does not relabel author results as
independent execution.

**Browser state and delivery.** Wrapped keys and durable pending-cast state keep
their existing contract. No plaintext secret persistence or silent memory fallback
was introduced. Lifecycle cleanup is covered; worker URL integrity remains a
separate gap. Draft translation review flags are unchanged.

**Explicit page sessions.** Storage refusal is observed before a one-way, explicit
memory-storage choice. Inaccessible saved state is neither copied nor cleared.
Backup actions gate continuation, stale handles/signers are invalidated and mode
switching stops once a ballot starts. Pending signed retry bytes remain scoped to
the existing document and context. The page-session wrapper still uses the
existing WebCrypto key-wrapping provider. Leaving a document is not an erasure
guarantee, and a download action does not prove a retained backup. The independent
[session/build receipt](INDEPENDENT_SESSION_BUILD_FOLLOWUP.md) records exact source,
tests and the remaining browser/crypto-provider limits.

**Separate-origin browser operation.** A board fragment selects only an explicitly
allowed build-bound origin. Selection is validated before client construction or
key lookup. Client caches and persistent election state include the board origin;
navigation, publication retry and invitations retain that binding. Authenticated
fetch rejects redirects, omits ambient credentials and suppresses referrers. These
controls do not make an operator's configured board trustworthy. Deployment must
apply the generated static-server CSP and configure the API's allowed frontend
origin; the ninth browser journey exercises that actual split.

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
