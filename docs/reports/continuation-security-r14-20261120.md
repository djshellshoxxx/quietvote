# Later receipt-proof composition: defensive security review — R14

Date: November 20, 2026. Fresh reviewer: `/root/security_audit_r14`.
The worker owns this report only. This is a bounded defensive source review,
separate from appointed security approval, external cryptographic review and
release authorization.

## Outcome and exact source

**No new blocking security defect was identified in the inspected composition.**
Saved evidence remains the input anchor for requested proof checking; missing
new signed evidence is incomplete, and successful growth output requires
consistency with the supplied previously included checkpoint.

| Identity | Source |
| --- | --- |
| Frozen composition reviewed | `d08dbce453b5aa6d1d99cc303e1875e728e5edfb` |
| Frozen complete tree | `4ae5894806c6f6049929c919649a88424b78826b` |
| Production implementation | `febb956cdc61e892b7577c8b9c6f33882a6d7498` |
| Original implementation tree | `d0b95e5974b57264f67e123e96bb64fcdf5984e0` |
| Final guide clarification | `2bc160da382d98c21c8af0f806ae6718d141f7db` |
| Integrated type-only test correction | `333ddcc55d0b7c4cdbb97f6857974592a3acb2a5` |
| Final inspected R14 test | `e90d9cc62089e8245f0e083dfb459c9f82c064ea` |
| Coordinator integration of that test | `cab2c18d063785c80e8948148e47c359417dcda9` |
| Final inspected test-composition tree | `51a9718bf55e366cb63ffcd71f6fbe0286ac5374` |
| Isolated reviewer branch | `codex/qv-security-r14-20261120` |

Native local comparisons confirm that all CLI production source at the frozen
composition is byte-identical to `febb956`, and the initial R14 test file equals
the inspected independent type correction `b24ed760`. Relative to local baseline
`7a2fa27`, the feature changes the helper, command adapter, help/guide and test;
the other additions are source-bound reports. No server, board, protocol,
cryptographic primitive, dependency or workflow is changed.

The coordinator's publication receipt maps baseline `7a2fa27` to published
`46ede0a4aedb39a0ff648441a9fab6774af17097`, complete tree
`2cd074b563c6b11cb2ccb74a680721bea2748d9a`. This reviewer checks the local
composition and does not claim a new remote fetch or current hosted pass.

## Source and contract inspection

The review covers [receipt-proof.ts](../../packages/cli/src/receipt-proof.ts),
the [online adapter](../../packages/cli/src/cmd-online.ts),
[registration/help](../../packages/cli/src/main.ts), and
[guide](../../packages/cli/README.md#check-a-later-receipt-proof). Adjacent
inspection includes the existing [receipt verifier](../../packages/board/src/receipt.ts),
[checkpoint parser](../../packages/board/src/checkpoint.ts),
[Merkle verifier](../../packages/board/src/merkle.ts), canonical byte codecs,
protected read-key helper, and the existing inclusion/consistency route bodies.
The governing sources are [QV-09](../09-api-data-contracts.md) sections 8/11.1,
[QV-18](../18-bulletin-board-transparency.md) sections 7/8 and REQ-014/026,
and [QV-30](../30-engineering-standards.md) sections 7–10.

| Boundary | Confirmed source behavior |
| --- | --- |
| Independent expectations | Validated election ID determines origin; strict public-key and hexadecimal leaf options are supplied by the caller. The response cannot replace those anchors. |
| Saved input | The 64 KiB regular-file reader precedes parsing. Present inclusion must be an object with bounded canonical path and note; it cannot silently become absent. The saved promise and all supplied inclusion verify before GET. |
| Snapshot selection | Positive supported size covers the saved sequence and cannot precede its included checkpoint. Request and response bind exact sequence, leaf and size. |
| Transport | Existing origin policy, redirect refusal and per-request timeout apply. Each response is capped at 64 KiB; strict UTF-8 JSON is projected onto known fields. |
| Proof encoding | Inclusion/consistency paths retain the 64/63-hash schema bounds and canonical standard-base64 32-byte hashes. The transport leaf remains canonical base64url. |
| Missing note | QV-09's optional absent note yields incomplete requested inclusion, preserves the verified old receipt and stops without another request. A present invalid note is refused. |
| Consistency | No prior checkpoint means `NOT_CHECKED`. Equal-size roots must agree locally. Growth requires exact old/new sizes and an existing-verifier proof before successful output. |
| Selected output | Normalized receipt and client-owned verification distinguish requested, previous and returned-receipt sizes; unrelated server fields cannot create assurance. |

The internal helper may represent verified inclusion while consistency is still
incomplete. The adapter cannot print that intermediate growth state: it awaits
and verifies the required consistency response before `printJson`. Failures do
not cause retry, polling, file replacement or a submission. HTTP read failure
does not establish that the original entry was rejected or absent.

Read-key access reuses the existing bounded protected-file helper for each GET.
The bearer value is placed in the existing header, not the URL, selected report
or static error text. There is no new credential argument or signing-key unlock.
This review does not claim that two reads form an immutable credential snapshot,
that JavaScript strings are erased, or that native ACL qualification is complete.

Output's `receipt_tree_size` distinguishes older included evidence retained in
an incomplete report from the newly requested checkpoint. Authority, witness
quorum, freshness and ballot counting stay explicitly false. A signed promise
deadline or log checkpoint is not promoted to authenticated current time.
The guide accurately limits consistency to the supplied receipt and leaves
automatic latest-observation custody unfinished.

## Prior observations and evidence ownership

The [R13 code report](independent-receipt-proof-code-r13-20261120.md) closes two
small observations: guide wording now says `failed HTTP read`, and the new test
uses known fixture/report types instead of two explicit `any` annotations.
Source inspection confirms both survive this composition without a production
change or weakened assertion. R13's optional-note, inclusion-presence, path-bound
and retention preflights are design inputs, not additional discovered defects.

The [R13 functional report](independent-receipt-proof-bugs-r13-20261120.md)
records four passing groups on its exact implementation/test tree. The
[coordinator receipt](cli-receipt-proof-20261120.md) records the overlapping
nine-case new/immediate/offline batch and full compilation after the type-only
correction. This reviewer inspected source and those receipts without executing
product tests. Their counts must not be summed as independent unique coverage.

### Fresh larger-checkpoint acceptance

The R14 functional worker adds one case in
[the existing acceptance file](../../packages/cli/test/online-receipt-proof.test.ts).
This reviewer inspected exact commit `e90d9cc6` and confirmed that it changes
only that file: two imports and one additive case, preserving the original
cases and assertions. Production still equals `febb956`. The isolated review
branch fast-forwarded to that test commit before report validation.

The new normal server workflow saves an admitted ceremony receipt at sequence
two, included in a three-entry checkpoint. Ordinary ceremony records advance
the actual log to seven entries. The check then requires exactly one inclusion
GET for sequence two/size seven and one consistency GET for sizes three/seven.
It asserts verified inclusion/consistency, the multi-hash path, original signed
promise/receipt identity, all four false assurance flags through the existing
scope helper, offline reuse and unchanged saved input, board length and phase.

The coordinator relayed the functional worker's completed focused-file result:
**five groups passed, zero failures/skips/cancellations, 1.683 seconds**, on
the exact test source/tree above. This is the functional worker's execution;
the security reviewer did not run application tests. The five groups include
the original four R13 groups and are not five additional unique tests. Native
local comparison confirms the coordinator's `cab2c18` integration has the same
complete tree. The coordinator also reports a successful full root TypeScript
check with a 768 MiB heap after integration; that is separately attributed
compiler evidence, not execution by this reviewer.

## Separate durable-tracking follow-up

QV-18 REQ-026 requires persistence of the latest observed checkpoint per origin.
A caller-supplied receipt can be older than another observation, so this command
does not close that requirement. A future bounded design should specify how an
independently authenticated origin/key selects retained state, how concurrent
processes preserve monotonic advancement, and how atomic publication/crash
recovery keeps the old trusted state until the new consistency check succeeds.
Equal-size conflicting roots, unavailable storage and failed checks need explicit
outcomes; no silent fallback should claim that a checkpoint was persisted.

Those are acceptance questions for the next scoped work, not a selected storage
backend, approved schema, implemented custody policy or instruction to reopen
unrelated investigations. Existing file identity/permission and native platform
boundaries must remain explicit. Witness monitoring, authenticated freshness,
authority and finality need their own contracts and evidence.

## Validation and handoff

Documentation checks passed on Node 24.22.3: 2,542 links across 396 files, none
broken; claims lint found zero findings across 375 files and 45 unchanged rules.
The staged report passed whitespace checking. The report-only commit carries
matching Codex DCO and specification references. These checks qualify the
report, not application execution or cryptographic correctness.

No runtime probe, exploit or vulnerability
reproduction, browser retry, cancelled-fetch retry, external publication or
formal approval is performed. The stopped background-runtime/gossip investigation
and its old untracked test are excluded. Historical DCO, native ACL, appointed
review and release gates remain separate.
