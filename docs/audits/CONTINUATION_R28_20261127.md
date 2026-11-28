# R28 — atomic append completion, key controls and repository evidence

Date: November 27, 2026 (America/Vancouver).

Baseline: published R27 commit `c110e06bc584e642e9130a82f7a16493ad8b12e3`,
tree `e5416dc074185a38c1c66ac0dd5625366dad39ef`, in
[draft PR #78](https://github.com/djshellshoxxx/quietvote/pull/78).
The continuation branch is `codex/quietvote-atomic-flows-20261127`.
Main and the preceding candidate stack remain unmerged.

This receipt records implementation and bounded engineering review. QuietVote
remains unaudited and not for real elections. A source review by another agent
is not an appointed security approval or release sign-off.

## Plan and integration boundaries

The current source was compared with the accepted server, web and process
inventories. Older absence notes were checked against implementation before
choosing work. The selected increments were:

1. Reproduce the append/outbox transaction gap, move lifecycle projections and
   append-generated events into the same transaction, and preserve recovery of
   earlier completion intents through an appended migration.
2. Independently examine failure after that transaction; retire any runtime
   whose application, archive erasure or registry completion failed.
3. Serialize voter key work and recovery previews, disable related controls,
   and connect the organizer's existing busy state to its preview action.
4. Add the prescribed DCO/commit-format check, deterministic SBOM and unpublished
   security-contact template validation without inventing provenance or owners.
5. Complete bounded secret-scan, coverage-report and release-dossier tooling,
   preserving actual test exits and distinguishing evidence from approval.
   Apply the prescribed Experimental wording to the existing CLI, server, UI
   and README presentation points.
6. Run composed server/web, installed CLI, browser, TypeScript and repository
   gates on the integrated source, retaining unsuccessful earlier attempts.

Production patches were integrated only after source review, with each frozen
handoff's blobs checked. Earlier R27 migration, archive and receipt changes were
preserved. New implementation and review findings are described below.

## Atomic append outbox and completion recovery

[Server inventory task 5](../reports/inventory-20261111/server.tasks.md#5-move-phasealert-outbox-rows-into-the-append-transaction-qv-28-req-005)
requires entry, Merkle/checkpoint data, lifecycle projection and append-generated
outbox events to commit or roll back together. A new test injected failure after
phase insertion and before commit. The original source returned HTTP 201 with a
committed entry and advanced independent anchor. The corrected source returns
HTTP 500 with no entry, checkpoint, completion intent or event, no callback, and
the original DRAFT/size-zero projection and anchor.

The transaction now includes title/state/phase-sequence projection and
entry/checkpoint/phase/append-generated alert rows. It never spans an `await`.
Asynchronous DKG adjudication stays outside the transaction. The independent
control-database runtime anchor is persisted before append outcomes and normal
event publication. Cross-database atomicity is not claimed.

Election migration 12 adds `append_completion.events_committed`, constrained to
0 or 1. All eleven earlier descriptors and SQL strings remain unchanged. Old
flag-0 intents reconstruct missing events using their original timestamp; new
flag-1 intents finish application and remove the intent without regenerating
events, including deliberately pruned history. Actual schema-11 fixtures and
terminal upgrade paths exercise this distinction. The data inventory now
classifies 230 columns across 36 tables; the new column is C3 operational data.

The [independent review](../reports/outbox-postcommit-review-20261127.md) found
two additional failures on the first patch. Registry refusal or rolled-back
archive key erasure left an unpoisoned cached runtime. A later pool acquisition
could forward its phase event before completion, and an identical retry could
return success without healing the registry or erasing persisted keys.

The correction poisons and rethrows failures from post-anchor application,
archive finalization and registry synchronization. Existing pool recovery then
finishes the durable work before returning a usable runtime. The unchanged
distinguishing tests failed before and passed after this correction. Strengthened
tests require a different recovered handle, no pending intent, the healed
registry, exactly one phase delivery, null persisted archive keys at delivery
and a native read-only archive connection. Immediate retry and later clean
keyless-reload behavior remain explicitly checked under the existing receipt
policy; in-memory key lifetime is unchanged.

The author record is
[append-outbox-atomicity-20261127](../reports/append-outbox-atomicity-20261127.md).
The final reviewed election module is Git blob
`de9fc2149b93db13210483d929bda4764512e0cb`.

## Key actions and organizer preview

[Web inventory task 2](../reports/inventory-20261111/web.tasks.md) is implemented
by a shared guard covering Create, Unlock, recovery-code display and encrypted
backup continuation. Related controls disable and expose `aria-busy`; selected
inputs are captured before asynchronous work. Failure and cancelled cost
confirmation release the controls. Existing navigation, generation and storage
checks continue to reject stale results after navigation or confirmed clearing.

Recovery preview preserves an already unlocked signer and its backup actions.
Hiding a code also cancels a pending redisplay. Organizer Freeze election uses
the key panel's existing busy state and guards direct handler invocation as well
as the visible button. KDF floors, encrypted containers, signers, 63 English
guarantee messages, all five unoffered translated catalogs and locale review
metadata remain unchanged.

Seventeen actual-UI cases and one built-browser journey distinguish duplicate
work, pending membership, input mutation, cost cancellation, retry, clear,
navigation, recovery hiding and previously unlocked organizer behavior. The
required browser runner retains its earlier sixteen journeys and adds the key
journey. See the
[source-bound key-operation report](../reports/web-key-single-flight-20261127.md).

## Repository evidence tools

The [Experimental disclosure correction](../reports/experimental-banner-20261127.md)
adds the exact QV-27-REQ-006 wording to both CLI version spellings, successful
server startup stderr, the existing English UI banner and README. The existing
version prefix and JSON listening event remain compatible. Actual executable
checks pass; no audit result or release approval is asserted.

The [DCO check](../reports/dco-commit-check-20261127.md) examines every reachable
commit in the PR's actual base-to-head range, including side branches. It uses
raw author identity and Git's final trailer parser, requires an exact author
sign-off, and checks the existing Conventional Commit subject format/length.
Independent review found Git's default patch-divider handling inappropriate
for raw commit messages. Two distinguishing tests failed before adding
`--no-divider` and pass afterward. No historic sign-off was invented or rewritten.
The reviewed historical range still has 340 failing commits among 556; these
remain a provenance decision. A PR-editable workflow is not a tamper-proof
independent approval gate.

The [SBOM generator](../reports/sbom-20261127.md) emits deterministic CycloneDX
1.6 JSON from the lockfile's production dependency closure: eight workspaces
and two external Noble packages. Registry integrity values are checked before
filtering; supported SHA-256/384/512 values are emitted without inventing hashes
for local workspace content. Development inclusion produces 43 components.
Existing package signatures, legal approval, release provenance and two-builder
qualification are not inferred from this inventory.

The [security.txt validator](../reports/security-txt-20261127.md) checks bounded
UTF-8/NFC input, field/URI/language/timestamp syntax and the accepted expiry
window. Template mode reports four unresolved owner fields; release mode refuses
them. The template supplies no contact, hosting identity or key. Publication,
reachability, staffing and signatures remain owner work.

The [release dossier and notes tools](../reports/release-dossier-20261127.md)
read the actual fourteen assurance gates and seven release items. Deterministic
checklists record only local artifact presence and hashes; every gate remains
unassessed and every checkbox unchecked. Pre-1.0 channel restrictions, actual
audit-artifact prerequisites and visible Experimental/review disclaimers are
checked without inventing a review, sign-off or release. The existing docs-checks
job runs the new tests and notes lint, including on documents-only PRs.

The [secret scanner](../reports/secret-scan-20261127.md) covers current tracked
and nonignored files and complete available branch/remote/tag history, with
bounded pattern checks, explicit binary exclusions and closed findings that
never echo matched values. Its 286 exact exceptions identify reviewed public
or deterministic fixture values; directories and arbitrary inline exemptions
are not accepted. A separate pinned workflow covers every PR, including docs,
and scans history nightly. Independent integration review reproduced a blocked
read when a tracked file was replaced with a FIFO. Nonblocking open now permits
regular-file inspection and refusal before a read; the unchanged regression
passes for both scanned files and the exception file. All 22 scanner cases pass
on Node 24 and Node 22. This is scoped pattern detection, not a proof that no
secret of any encoding can exist or an owner-configured required check.

The [coverage reporter and workspace launcher](../reports/coverage-reporting-20261127.md)
correct a reproduced argument-ordering bug: test-runner options previously
followed the test glob and the requested concurrency cap was ineffective.
Forwarded options now precede the unchanged glob in all eight workspaces.
Coverage is a separate, opt-in manual job for one named workspace; normal PR
and matrix tests remain uninstrumented. Integer counters are weighted against
the complete production-source inventory. Missing sources, failed or cancelled
tests, and failed outer npm steps produce unavailable results with no percentage
or threshold claim. Independent review moved runner-dependent environment values
into supported step scope. The final 39-case reporter/launcher/workflow batch
passes on both Node 24 and Node 22. The earlier instrumented crypto termination
is retained as a failure, with no established resource cause; its unchanged
normal-execution file passes. Invocation-specific native branch counters do not
establish a complete assurance coverage gate.

The [Python static boundary check](../reports/python-import-boundary-20261127.md)
checks the existing 25-module, standard-library-only runtime without executing
its source. It detects external imports, missing local dependencies, observed
shadowing, native artifacts and named execution/loader bridges under explicit
bounds. The checker runs before Python verification in CI. All 17 boundary tests
pass; runtime source and requirements remain unchanged. This closes the static
import/dependency portion only. Independent authorship, semantic independence,
arbitrary reflection and the separate human review are not inferred.

## Composed validation

The local runtime is Node 24.22.3 on Linux. Resource bounds described here are
local execution settings; no test assertion, repository deadline or KDF floor
was relaxed.

| Gate | Current source-bound result |
| --- | --- |
| Complete web suite before the subsequent disclosure-copy edit | 527/527 pass, zero skips, 207.993 seconds; local file concurrency 1 and 512 MiB per-process heap. The later English message is covered by scoped i18n and the composed browser run. |
| Independent post-commit review and adjacent recovery/archive tests | 25/25 pass, zero skips, 40.891 seconds; unchanged original two-case failure first reproduced, then passed on the correction. |
| Complete server suite through the corrected workspace launcher | 646 pass, zero failures, one existing platform skip; 647 tests, 212.606 seconds, file concurrency 2 and 512 MiB local heap. |
| Root and explicit server-bin/browser TypeScript | Passed with a 768 MiB local heap bound. |
| Experimental disclosure executable checks | CLI 1/1 and server launcher 7/7 pass, zero skips; scoped i18n passes. |
| Required production browser journeys | All 17 pass in one combined run using Chromium 143.0.7499.0 and the existing no-zygote wrapper. |
| Production web/verifier build | Build `a46bc13c1331`; aggregate JavaScript gzip 194,071 / 204,800 bytes; standalone verifier 202,578 / 409,600 bytes. Entry alone is 57,221 gzip / 174,201 raw bytes. |
| Final scanner on Node 24 / Node 22 | 22/22 each, zero skips; 2.951 / 1.773 seconds. The new FIFO refusal first failed with a bounded child timeout, then passed unchanged. |
| Final coverage/launcher/workflow batch on Node 22 | 39/39 pass, zero skips, 3.139 seconds; author final Node 24 batch also passes 39/39. |
| Python static boundary | 17/17 pass in 0.596 seconds; actual scan covers 25 files / 225,739 bytes with no findings. |
| Installed archive/trustee CLI adapters | 19/19 pass, zero skips, 10.806 seconds. |
| All root tooling and workflow/runner tests | 198/198 pass, zero skips, 24.654 seconds, file concurrency 1. |
| Dependency, lockfile, vendor and action pins | No new dependency violations (two retained D-97 exceptions); 35 registry entries / eight workspace links; two packages / 132 vendor files; pins in five workflow files verified. |
| Release tooling on the composed repository | Notes lint has zero findings; SBOM and dossier generation succeed; security template validates while reporting all four unresolved owner fields. |
| Current-tree secret scan | Complete, zero unexcepted findings, 1,612 text files, 2,641 reviewed allowed occurrences and four explicit binary exclusions. |
| Complete available Git-history secret scan | Complete, zero unexcepted findings; 16,263 text patch sections / 236,998,018 input bytes, 32,899 reviewed allowed occurrences and six binary-version exclusions. |
| Documentation and traceability | Claims lint: zero findings across 437 files / 45 rules. Links: 3,006 links across 458 files, none broken. Traceability and diff checks pass. |

The first web run reported 496 passes and four failures among 500 reported tests.
Two i18n CLI children ended with `SIGKILL`; the i18n-lint process failed before
reporting its individual cases. A specific resource cause was not established.
The other failure was an existing source assertion for the previous preview
markup; it now requires the busy option and typed button binding. The complete
serial rerun passes, with the production key modules unchanged.

The first server run reported 640 passes, six failures and one platform skip
among 647 tests. All six failures came from older-schema fixtures that retained
the new `events_committed` column while removing its migration ledger entry.
The four fixture locations now remove that later column when constructing their
historical inputs. Migration behavior, old checksum validation, membership
security floors and registration assertions remain unchanged.

The next full server attempt reported 643 passes, one failure and one skip among
645 reported tests. Its remaining failure was the legacy-draft test's hardcoded
schema version 11; it now expects the appended schema version 12. That attempt
did not report two later large-import/body-cap cases, and no cause for the
missing cases is asserted. The complete pinned-roll file then passed all 15
cases, including those two, in 42.624 seconds. The final full run through the
corrected launcher then reports all 647 tests with zero failures.

The execution environment became unavailable during a later diagnostic run.
After recovery, the source edits and completed logs were verified intact. The
interrupted no-coverage crypto log was empty and supplies no result. Completed
worktrees were preserved as verified Git tree references before retirement;
active worktrees were retained. The temporary Chromium binary was restored to
the same 143.0.7499.0 version before the final browser run. The interruption is
not attributed to a particular resource cause.

## Hosted status observed during this continuation

The read-only snapshot at 2026-11-28 03:10:54 UTC (November 27 in Vancouver)
reported PR #76's matrix run 46087969999 with 19 successful and eight queued
jobs. Its Windows Node 22 and Node 24 trustee/crypto jobs both passed. PR #77's
run 46091204879 had ten successful, one running and sixteen queued jobs. PR #78's
run 46098436998 had all 27 jobs queued; its claims and pseudo-locale runs were
also queued. These were nonfinal snapshots, not complete current-source matrix
passes. The later successful Windows jobs do not explain or erase the older
PR #75 first-key acknowledgement timeouts. This continuation requires its own
hosted checks after publication.

## Remaining boundaries

This increment does not adopt the unresolved final-server derived-record,
pre-close receipt, renewable signed-time, invitation-width, governance,
membership or challenge/FINAL contracts. Native Windows/macOS custody and
durability, assistive technology and locale review, external cryptographic
review, release signatures and two-builder provenance remain separate.

The older hosted Windows Node 22 trustee startup timeouts remain unexplained.
The newly reproduced test-option ordering defect does not establish their cause.
The existing formal main-promotion requirement still needs two human approvals,
including the designated security reviewer. See
[unfinished work](UNFINISHED_WORK.md) for concrete contracts and closure evidence.
