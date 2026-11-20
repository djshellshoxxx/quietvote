# Later receipt-proof composition review — R14

Date: November 20, 2026. Fresh reviewer: `/root/code_audit_r14`.
This worker owns this report only and follows the three completed R13 handoffs.

**No new production blocker or unresolved code-review finding was identified
within the inspected composition.** R13's guide and test-typing corrections
survive integration. R14's additional normal transition test preserves all
earlier acceptance source and changes no production code.

## Fixed source and method

| Identity | Source |
| --- | --- |
| Local feature base | `7a2fa27d37cfb5d5bdc2f8f9d266e2baa5a290a0` |
| Equivalent published predecessor, recorded by coordinator | `46ede0a4aedb39a0ff648441a9fab6774af17097` |
| Shared predecessor tree | `2cd074b563c6b11cb2ccb74a680721bea2748d9a` |
| Frozen R14 composition | `d08dbce453b5aa6d1d99cc303e1875e728e5edfb`, tree `4ae5894806c6f6049929c919649a88424b78826b` |
| Production implementation | `febb956cdc61e892b7577c8b9c6f33882a6d7498` |
| Additional R14 test | `e90d9cc62089e8245f0e083dfb459c9f82c064ea` |
| Coordinator test integration | `cab2c18d063785c80e8948148e47c359417dcda9` |
| Both complete test trees | `51a9718bf55e366cb63ffcd71f6fbe0286ac5374` |

The fixed diff is `git diff 7a2fa27...d08dbce`: eight commits and nine paths,
including the three R13 reports and implementation receipt. Local comparisons
confirm CLI production remains identical to `febb956`. Board, server, protocol,
dependencies and workflows are unchanged relative to the feature base. All
eight commits have matching author/DCO and applicable `Refs`; this does not
attest older history.

This isolated branch is `codex/qv-code-r14-20261120`. Standards and specification
are separate assessment axes within this one source reviewer. The broader round
has independent functional and security workers; no additional nested reviewers
are claimed. Repository contracts and the supplied handoff define the scope.
Prior remote publication equality belongs to the coordinator's receipt; this
worker did not retry the cancelled native fetch or modify remote refs.

## Standards

The [evidence helpers](../../packages/cli/src/receipt-proof.ts) represent anchors,
receipts, checkpoints and output explicitly. Expected refusals return existing
board `Result` values and registered receipt/proof error codes, following
[QV-30](../30-engineering-standards.md) section 7. The
[HTTP adapter](../../packages/cli/src/cmd-online.ts) maps them into the existing
CLI error taxonomy and handles transport parsing at the HTTP boundary. No
ignored result permits promotion to successful output.

Existing receipt, checkpoint and Merkle functions perform cryptographic checks.
The extra checkpoint parse obtains authenticated roots for consistency; it does
not implement another verifier. There is no new dependency, public package API,
schema, primitive, server route or unrelated refactor.

R13's explicit test `any` annotations remain corrected by `b24ed760`/`333ddcc`:
known fixture/report types and literal assurance keys replace them without
changing runtime statements or assertions. The coordinator's post-correction
compiler receipt is separate evidence. New source retains its SPDX header;
commits satisfy [CONTRIBUTING](../../CONTRIBUTING.md)'s DCO/reference rules.
This bounded assessment does not certify repository-wide completion of proposed
tooling or release gates. Standards result: **zero new unresolved findings**.

## Specification and command behavior

Sources are [QV-09](../09-api-data-contracts.md) sections 4.1, 8 and 11.1,
[QV-18](../18-bulletin-board-transparency.md) sections 7–8 and requirements
014/026, the current proof routes and existing board representation.

| Boundary | Inspected final behavior |
| --- | --- |
| Registration | `online receipt-check` is imported, registered and documented in the main table/help. Existing commands remain registered. |
| Saved evidence | Independent election/key/leaf and positive supported size are checked; regular-file input is bounded; all supplied evidence verifies before GET. Present malformed inclusion cannot silently become absent. |
| Requested size | It covers the saved sequence and cannot precede an existing included checkpoint. |
| Transport | Existing origin, timeout, redirect and private read-key rules are reused. Responses are capped at 64 KiB. Strict UTF-8 transport JSON tolerates additive metadata without granting it assurance. |
| Inclusion | Exact sequence, canonical base64url leaf and requested size are required, with at most 64 standard-base64 path hashes. Existing receipt verification authenticates the supplied checkpoint and inclusion. |
| Missing note | The API permits absent `checkpoint_note`; this preserves prior normalized evidence, reports requested inclusion incomplete and makes no consistency request. Present invalid evidence is refused. |
| Equal size | Existing empty-path consistency verification requires equal roots without another request. |
| Growth | One bounded consistency GET with exact old/new sizes and at most 63 hashes must verify before successful output. The intermediate updated receipt is not printed on failure. |
| Promise only | No previous root is invented; consistency is `NOT_CHECKED`. |

Successful scoped inclusion exits 0; missing requested signed evidence exits 3.
Usage/input errors remain exits 2/4; response/HTTP failures exit 1. Guide correction
`2bc160d` still distinguishes failed HTTP reads from local input refusal. A read
failure does not establish original entry rejection or absence.

Requested, previous and actual output receipt sizes remain separate. An older
included receipt in incomplete output cannot be mistaken for the requested new
snapshot. Authority, witnesses, freshness and counting stay false. No file write,
server mutation, polling or retry is introduced. The
[guide](../../packages/cli/README.md#check-a-later-receipt-proof) limits consistency
to the caller-supplied checkpoint. Specification result: **zero new production
blockers within this workflow**.

## Additional normal transition and evidence ownership

Test `e90d9cc` saves a normally admitted ceremony receipt at sequence two/tree
three and continues the ordinary ceremony to seven entries. It checks a
multi-hash inclusion path and three-to-seven consistency, exact GETs, original
promise identity, independent expectations and false assurance flags. The
normalized output is reusable offline; input bytes, log count and phase remain
unchanged during checking.

This reviewer removed only the added case and two imports from the final test
text and obtained the previous file byte for byte: all **64 original assertion
lines** remain, with **20 added assertion lines**. The commit changes only
[online-receipt-proof.test.ts](../../packages/cli/test/online-receipt-proof.test.ts),
has matching DCO/Refs, and leaves production identical to `febb956`. Native local
Git comparison also confirms coordinator integration `cab2c18` has the same
complete tree as the worker test.

The functional worker reports **five groups passed**, zero failures/skips/
cancellations, in **1.683 seconds**, on that test tree. Four groups overlap R13;
one extends normal sequence/path coverage. It does not independently qualify
the underlying Merkle primitive. The coordinator separately reports successful
full root TypeScript after integration, with a 768 MiB heap. This reviewer
inspected sources without running product tests or a competing compiler.

R13's four-group result and the coordinator's overlapping nine-case receipt
batch remain attributed to their recorded source in the
[implementation receipt](cli-receipt-proof-20261120.md) and functional report.
No prior hosted pass is assigned to the new feature.

## Handoff and limits

Final publication needs a complete local/remote tree binding and hosted evidence
for its actual tested source. QV-18-REQ-026 still requires durable latest-per-origin
checkpoint custody. A subsequent increment needs explicit storage ownership,
selection and update rules, including concurrent writers and interrupted
publication, before claiming latest-observation tracking. This review adopts no
new persistence format and does not begin that implementation.

No runtime probes, exploit reproduction, browser retry, network bypass, external
comment or publication was performed. The stopped background-runtime/gossip
investigation and old untracked test remain excluded. Appointed approval,
historical DCO, native ACL and release/product-contract gates remain separate.

Documentation checks passed: 2,537 links across 396 files, none broken; claims
lint zero findings across 375 files and 45 unchanged rules. The staged report
passes whitespace checking. Only this report is committed, with matching Codex
DCO and specification references.
Standards: zero new unresolved findings. Specification: zero new blockers.
