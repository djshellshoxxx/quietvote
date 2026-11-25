# Later receipt-proof code review — R13

Date: November 20, 2026. Fresh reviewer: `/root/code_audit_r13`.
This report follows the completed [R11–R12 handoff](../audits/CONTINUATION_R11_R12_20261120.md).
The worker owns this report only. Product code and normal functional tests have
separate owners; no appointed approval or external audit is supplied here.

## Scope and source identities

**No new production blocker was identified in the inspected implementation.**
All four changed paths were inspected at
`febb956cdc61e892b7577c8b9c6f33882a6d7498`, tree
`d0b95e5974b57264f67e123e96bb64fcdf5984e0`:
[receipt-proof.ts](../../packages/cli/src/receipt-proof.ts),
[cmd-online.ts](../../packages/cli/src/cmd-online.ts),
[main.ts](../../packages/cli/src/main.ts) and the
[guide](../../packages/cli/README.md#check-a-later-receipt-proof).

The fixed local base is `7a2fa27d37cfb5d5bdc2f8f9d266e2baa5a290a0`, complete
tree `2cd074b563c6b11cb2ccb74a680721bea2748d9a`. The coordinator's publication
receipt maps that exact tree to canonical
`46ede0a4aedb39a0ff648441a9fab6774af17097`. This worker verified the local base
and tree, used isolated branch `codex/qv-code-r13-20261120`, and did not retry the
cancelled native network fetch.

The fixed review diff is `git diff 7a2fa27...febb956`: one implementation commit,
216 insertions and six deletions. This worker verified its matching Codex DCO
and QV-09/QV-18/QV-30 `Refs` trailer. The remote tree mapping is attributed to
the coordinator's receipt, not a native fetch by this worker.

Final inspected integration is `10d5021a6d292b356c36d2e2253d6682d1dee690`, tree
`48f47b3a511d66be69159d911959971dbe7d2362`. Production is byte-identical to
`febb956`; the test is byte-identical to the inspected type correction `b24ed76`.

The bounded feature is later inclusion-proof retrieval using a saved normalized
receipt, independent election/log-key/leaf expectations and an explicit requested
tree size. It may establish consistency with the checkpoint contained in that
supplied receipt. Durable latest-per-origin retention and automatic pin updates
remain separate work.

This is the code-review skill's standards and specification assessment in one
independent worker. The overall round has distinct code, functional and security
workers; no nested parallel standards/specification agents are claimed. Sources
are the repository contracts and the explicit R12 handoff, not an inferred issue.

## Contract preflight

The reviewed foundations are [QV-09](../09-api-data-contracts.md) sections 4.1,
8 and 11.1, [QV-18](../18-bulletin-board-transparency.md) requirements 010–014 and
026 plus sections 7–8, and the current server proof routes. Existing board
receipt, checkpoint, inclusion and consistency functions supply the verification
semantics. The feature needs no new schema or cryptographic primitive.

| Boundary | Existing source contract | Required treatment in this increment |
| --- | --- | --- |
| Saved evidence | Board normalized receipt JSON carries flat timestamps, standard-base64 leaf/signature and optional inclusion. | Verify the supplied receipt under independent expectations before any request; preserve an existing included checkpoint rather than silently dropping it. |
| Requested snapshot | Inclusion accepts explicit `seq` and `tree_size`; current API bounds sizes to `2 ** 40`. | Require a positive supported size covering the saved sequence, and refuse a size below its existing included checkpoint. |
| Inclusion response | `seq`, `leaf_hash`, `tree_size` and `path` are required. `checkpoint_note` is optional. Inclusion paths contain at most 64 standard-base64 hashes. | Bind all identity fields; distinguish omitted note from malformed present evidence. An unsigned path alone cannot complete inclusion verification. |
| Optional note | The server returns the note only when it has a stored checkpoint for that exact size. | Legitimate omission remains `INCOMPLETE`, keeps the original normalized receipt and causes no poll or further proof request. |
| Growing checkpoint | Consistency response requires `old_size`, `new_size`, and a path capped at 63 hashes. | Verify exact sizes and existing Merkle consistency before returning updated included evidence. |
| Equal-size checkpoint | Existing `verifyConsistency` requires an empty proof and identical roots. | Check root equality locally without a redundant consistency request. |
| No prior checkpoint | A signed promise alone supplies no previously observed root. | Report consistency as not checked; do not fabricate an empty-tree or newest-head anchor. |
| Retention | QV-18-REQ-026 calls for persistent latest-per-origin checkpoints and subsequent consistency. | Consistency with one caller-supplied receipt is a narrower increment; it does not close durable latest-observation tracking. |

Code and security preflights independently agreed on the optional-note branch,
the 64/63 path limits and the narrower retention scope. These were implementation
design inputs, not reproduced defects or independent runtime results.

## Standards

The three pure helpers return the board `Result` for expected input, inclusion
and consistency refusals, following [QV-30](../30-engineering-standards.md)
section 7. The command maps these to existing CLI input or verification errors.
UTF-8/transport parsing errors remain local to the HTTP adapter. No ignored
result permits output promotion.

The new helper has its SPDX header, keeps evidence/anchors in explicit types,
bounds path and note fields, and reuses board parsing, receipt and Merkle
verification. The repeated checkpoint parse obtains the root for consistency
after existing receipt verification; it adds no competing verifier. There is
no new dependency, package public export, primitive, protocol rule, workflow or
server route. No larger adapter/board refactor is warranted by this increment.

The implementation meets Conventional Commit, DCO and `Refs` requirements in
[CONTRIBUTING](../../CONTRIBUTING.md). Two explicit `any` parameters in the new
independent test were identified under QV-30 sections 5.2/8. Type-only correction
`b24ed760d919db644f3578404b2e8cc12bb5c4b1`, tree
`be682d0f28b73d4ece6dc6301126174273656139`, replaces them with a known fixture
wire interface and `ReceiptProofReport`, using a type-only import and literal
assurance-key tuple. Source inspection confirmed unchanged runtime assertions
and production. The low-priority test-maintainability observation is closed.
The coordinator integrated the change as
`333ddcc55d0b7c4cdbb97f6857974592a3acb2a5` and reports a subsequent successful
full TypeScript check. Standards
result: **zero new unresolved findings in the inspected source.**

## Specification and compatibility

Election ID, strict key, expected leaf and supported size are checked before
bounded regular-file reading. Saved inclusion is checked by property presence;
a malformed falsey value cannot silently become absence. The existing receipt
parser/verifier authenticates the saved evidence under independent origin,
leaf and key expectations. The selected size must cover its sequence and cannot
precede supplied inclusion. All these checks occur before the first GET.

The proof response requires exact sequence, canonical base64url leaf and selected
size, plus a bounded canonical standard-base64 path. Omission of the optional
note preserves the old normalized receipt and returns requested inclusion as
incomplete. Present malformed or failing evidence is refused. New signed
inclusion reuses the existing promise/checkpoint/Merkle checks, including origin
and size binding.

At equal size, the existing empty-path consistency rule checks root equality.
For growth, consistency stays incomplete inside the intermediate result until
one GET for exact old/new sizes passes the existing Merkle verifier. The command
prints only after that check; a failure cannot expose the intermediate updated
receipt as success. A promise-only input supplies no fabricated previous root
and correctly reports consistency `NOT_CHECKED`.

Both output modes retain online JSON. Known fields are selected into a
client-owned report; additive server metadata cannot become verification claims.
Requested, prior and actual output receipt sizes are separate. Authority,
witness quorum, freshness and counting flags remain false. The guide retains
the distinction between one supplied prior checkpoint and durable tracking of
the user's latest observation.

Requests keep the existing private read-key, timeout and redirect handling,
64 KiB response bounds and no automatic retries/polling. There are no file writes
or server mutations. Existing immediate-submit/offline receipt helpers, all
board/protocol/server source, dependencies and workflows are unchanged by the
feature. One guide clarification distinguishes a failed HTTP read (exit 1) from
unreadable local saved evidence (exit 4); the behavior was already separate.

Specification result: **zero new production blockers identified within this
supplied-receipt workflow.**

## Independent acceptance source

This worker inspected functional test-only commit
`38acf8e64a3c042faa7a35a92e7987cb3fff4f1b`, tree
`86753b527d02075d5285914ae0e4a932f6c839df`, and verified production equality
with `febb956`. Coordinator integration
`b002c2b6821b11f6db84a02cca87ce65af34c0c1` has that same complete composition
tree. Tests are in
[online-receipt-proof.test.ts](../../packages/cli/test/online-receipt-proof.test.ts).

The first group uses an actual server and child-process CLI to upgrade a saved
promise. It checks normalized offline reuse, growth from included evidence
with exactly two expected GETs, and same-size checking with one GET. Input bytes,
log length and server phase stay unchanged. A second actual-server group checks
legitimate link-election access through a private read-key file, including file
preservation and absence of the access value in output.

An ordinary optional-note fixture covers both promise-only and already-included
saved receipts, preserving older evidence and distinct snapshot fields. Harmless
additive null/fractional/non-NFC metadata and advisory output do not replace
client assurance. One request and no polling/consistency fetch are asserted
without a signed target note. Local checks cover missing/malformed keys,
different supplied anchors, invalid sizes, nonregular/oversized files and a size
below saved inclusion, all before GET. These are normal command-contract checks,
not vulnerability probes.

The functional worker reports **four groups passed**, zero failures, skips or
cancellations, in **1.482 seconds**. This reviewer inspected source and received
the execution receipt without rerunning tests. The coordinator reports a
completed bounded full TypeScript check and **nine new/immediate/offline receipt
cases passed**, zero failures/skips/cancellations, in **3.361 seconds** before
the type-only annotation correction. The coordinator subsequently completed
another full TypeScript check after integrating that correction. There was no
unnecessary product rerun for erased annotations. The four cases are included
in those nine; counts are not added as unique tests. The
[functional report](independent-receipt-proof-bugs-r13-20261120.md) preserves the
original executed source identity and separately records the type-only follow-up.

## Guide observation

The exit-1 row originally said “failed read,” while local file errors correctly
exit 4. Documentation-only `2bc160da382d98c21c8af0f806ae6718d141f7db`, tree
`be15fdb5cb18869293170ccd56fb05f25174257f`, changes this to “failed HTTP read.”
This worker inspected the correction and verified unchanged production and
test content. The low-priority wording observation is closed; behavior was
already correct.

## Execution and promotion boundaries

This worker performs source review and documentation checks only. Independent
functional execution and coordinator compilation must be attributed to their
actual source and owners, without adding overlapping cases as unique tests.
Previous R11/R12 passes do not qualify new production changes.

The stopped background-runtime/gossip investigation and old untracked test are
excluded. No runtime probes, exploit reproduction, browser retry, network
escalation, publication or message to an external party is part of this review.
Formal appointed security approval, historical DCO decisions, native ACL and
release/protocol-contract gates remain separate.

## Fresh-worker handoff

Report validation passed: 2,515 Markdown links across 393 files, none broken;
claims lint zero findings across 372 files and 45 unchanged rules. The staged
report passes whitespace checking. Only this assigned report is committed, with
matching Codex DCO and specification references.

The final composition review should verify unchanged production relative to
`febb956`, the corrected test types and guide wording, and the separate source
identities for executed assertions and documentation. Hosted checks must be
bound to their actual tested tree. Do not assign earlier receipt-source passes
to this later-proof command or treat these engineering reviews as appointed
approval. Preserve the explicit remaining latest-checkpoint custody boundary.

Standards: one low-priority test-typing observation closed. Specification/guide:
one low-priority error-wording observation closed. No unresolved production
blocker was identified on either axis.
