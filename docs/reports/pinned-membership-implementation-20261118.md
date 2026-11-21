# Pinned membership implementation and verification — 2026-11-18

This change implements the accepted D-99 option A with a complete,
authenticated pinned membership list. Membership is stored separately from
registration, so an absent member cannot prevent roll commitment and cannot be
reported as registered merely because their public key belongs to the roll.

This is also the design note for the change spanning server storage and
admission, browser publication, CLI management, and private recovery. It does
not introduce a new cryptographic construction or alter signed manifest,
invitation proof-of-possession, log, or archive encodings.

## Source and decision provenance

| Purpose | Exact source |
|---|---|
| Canonical integration at start | `810e7375ef3697a88fe903840f33494453e6777e` |
| Prior web/platform consolidation candidate, PR #69 | `b239bc5a53098341ae634aca924dd8ccb8e2e719` |
| Conflict-free composed baseline tree | `e941c647ff08bd04fc947636edd92dd43a3f7ffd` |
| Accepted QV-ADR-029 | [`66b2cbe96ea6ce823a7f646662516b29a1170751`](https://github.com/djshellshoxxx/quietvote/commit/66b2cbe96ea6ce823a7f646662516b29a1170751) |

ADR-029 is recorded on the separate cryptographic-review branch in PR #57.
Its owner decision authorizes the membership behavior. This implementation
does not import that branch's nonce changes or supply its missing formal
security approvals. The [preceding source handoff](consolidation-core-handoff-20261117.md)
describes the complete data-path gap this change addresses.

## Technical contract

The optional `pinned_roll` creation field is a nonempty array of canonical,
strictly ascending lowercase hex Ed25519 public keys. The existing signed
management request authenticates the exact list. The server validates key
points, order, uniqueness, configured voter count, and request bytes before
creating election state. No new production dependency or global size-limit
increase is required.

Election migration 10 adds one immutable `pinned_roll` row containing root,
size, and canonical full-list JSON. It preserves all earlier migration strings
and checksums. The membership row and durable creation/attachment operation
receipt share the election database transaction. Reusing a management request
key with different bytes remains an idempotency mismatch.
The storage JSON bound is 6,700,001 characters, sufficient for the canonical
100,000-key maximum already supported by larger archive imports. The stricter
1,153,434-byte management-request ceiling remains unchanged; it is not applied
as a new archive storage restriction.

| Surface | Required behavior |
|---|---|
| Signed election creation | Persist the full list independently of registered voters; a supplied list applies even before manifest publication. |
| Manifest admission | The signed root and size must match the list; a provisioned list cannot be discarded by publishing an unpinned manifest. |
| Historical recovery | Signed `PUT /api/v1/elections/:id/pinned-roll` attaches the exact list matching an existing pinned manifest, or immutably provisions an unpublished draft. Identical attachment is idempotent; conflicting contents are refused. |
| Registration | Check the full list before invitation consumption and before consumed-invitation success. Off-roll and unavailable-list errors leave voter/invitation/log state unchanged. |
| Roll commitment | Pinned mode uses the full authenticated membership; unpinned mode retains approved-registration membership. |
| Replay, quorum, export, pagination | Use the complete membership consistently, including members without voter rows. |
| Private restore | An independently retained minimum backup protects the full root/size/list binding even after management receipts expire. |
| Browser and CLI | Send the actual validated list inside the signed request; retries cannot silently replace it. |

Registration, attachment, and lifecycle admission use the runtime mutex. This
prevents a request validated against one membership or phase from committing
against a concurrently changed state. Existing ballot author resolution still
requires an actual registration for active elections; list provisioning does
not create voter rows or registration timestamps.

The wire fields and error codes are documented in
[QV-09 §7.1.1](../09-api-data-contracts.md#711-authenticated-complete-pinned-membership).
The byte ceiling remains authoritative even when a configured voter limit is
higher than the number of keys that fits in one request.

## Compatibility and evidence boundaries

Existing signed bytes and registration schemes remain unchanged. Historical
committed membership can be recovered from the committed list only when its
root and size match the signed commitment. An uncommitted historical subset
cannot reveal absent keys; the authenticated attachment operation supplies the
missing full list. Opaque draft JSON is never a membership authority.
The same signed attachment can provision an older unpublished `DRAFT`; later
manifest admission must match. An already published unpinned manifest cannot
be converted by attachment.

An imported public archive proves membership and signed ballot authorship,
but it contains no complete registration transcript. Imported member status
therefore exposes `registered:null, registration_known:false`. Internal
read-only imported voter indexes continue to support replay and signature
checking. Active absent members report `registered:false` and retain no
synthetic voter rows. Imports remain unable to sign or accept registrations.
The API remains experimental `/api/v1/`; consumers of the imported-registration
read model must accept its nullable `registered` value and the added
`registration_known` field. The [unreleased change note](../../CHANGES.md)
records this client compatibility effect and the additive schema migration.

The backup security binding is private verification state. Public backup
reports do not gain membership lists. The full protection applies when
`restoreBackup` compares against an independently retained minimum backup;
a public `BackupReport` alone does not carry that private floor. This work
does not implement the separate ordinary-startup runtime rollback anchor or
independent witness/peer startup checking.

This implementation also leaves proposal/ratification, group membership
rotation and revocation, recorded export acknowledgment, control freshness,
and disputes/finality as separate unfinished features.

## Verification receipt

The composed implementation was checked with Node 24.22.1 and Python 3.12.14
on Linux. Server, web, and CLI test files ran with `--test-concurrency=1` to
bound this worker's memory use. This changes scheduling only; test assertions,
timeouts, request ceilings, and production build budgets remain unchanged.

| Check | Result |
|---|---|
| Complete server suite | 317 tests: 316 passed, one Windows-only case-alias test skipped, zero failed. Includes the new full-membership lifecycle, recovery, and independent review regressions. |
| Complete web unit/integration suite | 347 passed, zero failed or skipped. |
| CLI suite excluding the separately executed real-clock journey | 116 passed, zero failed or skipped. |
| Corrected real-clock executable CLI journey | One passed, zero failed or skipped, in 653.61 seconds. Together with the separate subset, all 117 CLI tests pass. The journey retains actual server/trustee/voter executables, exact totals and independent verification. |
| Root TypeScript check | Passed with the normal `tsc -p tsconfig.json --noEmit` command and a 512 MiB Node heap. |
| Production browser build | Build `6321e67e9d96`; 200,992 gzip bytes in all JS files and 99,630 entry bytes, below the unchanged strict 204,800 / 112,640 byte ceilings. |
| Scoped i18n check | Passed; 360 static and 21 resolved dynamic references. The existing unresolved dynamic reference and scan exclusion remain explicitly reported. |
| Documentation links, traceability structure, claims lint, diff hygiene | Passed: 1,607 links in 298 files; zero claims findings across 277 files and 45 rules. Traceability is a structural check, not a claim that all linked requirements are complete. |

Server and the 116-test CLI subset ran from composed commit
`617e0569c86c7bda928f9eefe23622c892188100`. The corrected real-clock fixture
and web suite use the composed source tree
`e642f855749f5b594a82d260d2aeddb5015c0355` at local commit
`f395f3453bc49a6ce14a4246486c0aaa17cc2620`.
Only the excluded CLI fixture differs between these two test sources.
The final documentation and SPDX header completion do not change executable
behavior. The remote publication tree is compared to the final local tree.

The first combined runs overcommitted this worker: several child test
processes received `SIGKILL` and the typecheck/web processes exited 137. Clean
serialized reruns resolved those process failures. An isolated rerun also
found a real fixture inconsistency: the executable journey provisioned a full
list but constructed an unpinned manifest. Setting its existing `World`
fixture's `pinnedRoll:true` makes the signed manifest match the provisioned
list; the mismatch refusal remains enforced and independently tested.

Independent source review covered membership authorization and atomicity,
same-organization restrictions, absent-member quorum/privacy denominators,
archive evidence limits, startup consistency, client checkpoint binding,
request bounds, and the private backup floor. Three additional maintained
review tests passed for unauthorized/cross-organization attachment, a valid
stored list conflicting with the signed manifest, and malformed stored draft
membership. The fixture correction was reviewed separately; no remaining
blocking source defect was found.

Local Chromium could not launch because the worker denied its singleton
socket. No local browser pass or native Windows/macOS pass is claimed for
this new implementation. Its exact published-head hosted results are tracked
in the publication PR, separately from the preceding PR #69 platform matrix.

No human/CODEOWNER/security approval, release, deployment, or independent
election qualification is supplied by AI-assisted implementation and tests.
