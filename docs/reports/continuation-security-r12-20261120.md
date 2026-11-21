# Independent receipt consolidation security review — R12

Date: November 20, 2026. Fresh reviewer: `/root/security_audit_r12`.
This bounded defensive source review supplies no appointed security approval,
runtime qualification or release authorization.

## Outcome and exact source

**No new blocking security defect was identified in the inspected composition.**
Independent anchors, exact packet binding, bounded receipt conversion and the
limited assurance result survive the consolidation. The parallel candidate's
history is preserved without replacing the reviewed implementation.

| Identity | Value |
| --- | --- |
| Published baseline | `29cde9b1d8d774ee201c06f53386a556a2ad48d7` |
| Baseline tree | `9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d` |
| Retained production source | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Production source tree | `af59d1f37fe78851e23c4673ce02eeafb94a4674` |
| Parallel PR #73 candidate | `1cab4ae130a4c1823b61e369557340ba4ec3842d` |
| Parallel candidate tree | `69fd28869df9c5627cea7f919f6f3ce544d88664` |
| Reviewed preservation merge | `f919d319bd7dd346274e2e0dbbccd973ffd57159` |
| Preservation merge tree | `cfbae3de8e200679e919e369c88315183a46e41d` |
| Reviewed adapted acceptance | `ee123c26ccfd0d3d1d03c1d7724c9b15dbddeec5` |
| Adapted acceptance tree | `bed534f6a6de6f38278b7cd4a9a57baee84f59a5` |
| Reviewed API example correction | `ac42798cef20d5e07b3b757b22addef124af94a8` |
| Example correction composition tree | `3519d720d01cf406f15a52e717d47baa14d72696` |
| Isolated reviewer branch | `codex/qv-security-r12-20261120` |

Native Git checks confirm that PR #73 is an ancestor of the preservation merge,
its [original handoff](../audits/CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md)
is byte-identical, and the merge changes no package content relative to its
retained parent `fa16bdb`. CLI production equals `918f270` through the inspected
`ac42798` composition. The adapted test also matches its inspected
`ee123c26` source. The broader baseline comparison changes no server, board or
protocol implementation, dependency manifest/lockfile, vendor content or workflow.
The candidate, preservation, adapted-test and example-correction commits carry
matching author DCO and references; this does not attest to older history.

This review extends the [R11 security review](independent-receipt-security-r11-20261120.md)
to the parallel candidate and consolidation. R11 did not review PR #73. The
preserved candidate report is historical evidence and continues to state that
its original source had no local product-test or compiler execution receipt.

## Disposition of all seven candidate paths

| Candidate path | Retained decision and security consequence |
| --- | --- |
| `docs/audits/CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md` | Preserved unchanged, retaining the candidate's explicit qualification limits. |
| `packages/cli/README.md` | Retained the R11 guide's independent pin provenance, normalized receipt format, JSON output, input/response bounds, exit semantics and possible-acceptance guidance. |
| `packages/cli/src/cmd-online.ts` | Retained strict key validation before packet reading, regular-file checked input, 64 KiB response bound, generic strict UTF-8 transport JSON and typed receipt result handling. |
| `packages/cli/src/main.ts` | Retained help for the same optional flag, promise-only incompleteness and witness/freshness/counting limits. |
| `packages/cli/src/submit-receipt.ts` | Did not adopt the duplicate helper. Active `receipt-check.ts` preserves the reviewed boundaries and selected normalized output while reusing the existing board verifier. |
| `packages/cli/test/online.test.ts` | Adapted actual election-open and exact-packet replay acceptance in `ee123c26`; original lifecycle/export assertions remain. |
| `packages/cli/test/submit-receipt.test.ts` | Did not add the alternative helper's test suite. Its authored source was inspected; several scenarios overlap the existing R11 actual-wire groups. This is not a claim that every discarded assertion has executed coverage. |

The chosen output projects selected `status`, normalized `receipt` and
client-generated `verification` instead of returning the candidate's raw
`server_response` and separate `client_verification`. Additive server metadata
cannot supply client assurance. Both normal online output and `--json` retain
the established JSON contract.

The retained helper returns the board `Result` for expected refusal. The CLI
maps refused evidence or parse failure to static possible-acceptance guidance.
The candidate uses exceptions for expected verification refusal and parses the
whole response as QV-JSON. The retained generic strict UTF-8 JSON parser avoids
applying protocol-artifact restrictions to additive transport metadata, while
known receipt fields still receive explicit validation and projection.

## Trust and resource boundaries

The [active adapter](../../packages/cli/src/receipt-check.ts),
[online command](../../packages/cli/src/cmd-online.ts),
[board receipt verifier](../../packages/board/src/receipt.ts),
[header parser](../../packages/board/src/entry.ts) and
[server projection](../../packages/server/src/app.ts) were inspected together
with the [API contract](../09-api-data-contracts.md) and
[receipt specification](../18-bulletin-board-transparency.md#7-receipts-and-proofs).

| Boundary | Source-verified behavior and limit |
| --- | --- |
| Caller to key | Canonical lowercase hex is decoded and checked with the existing strict Ed25519 point predicate before packet reading/POST. The CLI cannot prove how the caller obtained the pin. |
| Packet to expectation | Validated election ID supplies origin; canonical base64url/header decoding, exact body length/digest and existing body caps bind retained bytes. Expected leaf comes from those original header bytes. This does not authenticate entry-author authority. |
| File to mutation | Checked mode reads a bounded regular-file descriptor, at most 1,153,434 bytes, with no-follow/nonblocking flags where supported. It does not reread or reconstruct the packet from response data. |
| Transport to parser | Existing HTTPS-or-loopback policy, redirect refusal and deadline remain. The returned body is capped at 64 KiB before receipt processing. |
| Wire to board | Nested promise fields and canonical base64url leaf/signature are explicitly converted to flat board timestamps and standard base64. Known integers/lengths are bounded; unknown members are omitted. |
| Evidence to verdict | Existing verification checks the signed promise/deadline, checkpoint origin/size/signature and Merkle inclusion. No new primitive or signature framing is introduced. |
| Failure to next action | Promise-only remains incomplete. Failure after POST does not establish rejection and adds no automatic retry or polling. |

Required duplicate inclusion `seq` and `leaf_hash` agree with QV-09 section 11.1's
`InclusionProof.required` schema and current server `receiptView`; PR #73 checks
them only when present. The older section 8.1 worked example omitted them.
Inspected correction `ac42798` adds both duplicates and explains their equality
without changing the schema or implementation. This closes documentation
ambiguity rather than changing admission or proof rules. The QV-18 receipt
sketch remains a shorter conceptual representation.

The proof path is capped at 64 strings, with canonical 32-byte hash decoding and
checkpoint/proof conditions delegated to the unchanged board implementation.
The candidate's narrower per-note cap is not required for the retained command's
already bounded 64 KiB response processing. Known `included` and `sequenced`
states must agree with inclusion presence. Unknown future states receive no
invented assurance and retain possible acceptance; the guide documents this
limited interpretation instead of claiming future-state semantics.

## Adapted acceptance and evidence ownership

The committed [online acceptance](../../packages/cli/test/online.test.ts) at
`ee123c26` checks an actual signed election-opening packet after the existing
ceremony. It derives the expected leaf locally from the original header and
uses the fixture's independently supplied log key. It asserts verified promise
and inclusion, `receipt-only` scope, and false authority, witness quorum,
freshness and counting flags. Explicit replay preserves sequence, normalized
leaf and the complete verification result.

Original OPEN state, voting, early-close refusal, later closing/tally, export,
TypeScript/Python comparison and overwrite/mode assertions remain. Production
source is unchanged. The functional report at
`5cd620e37257d49a1cb66b988917d178f8814144` records five focused cases passed,
zero failures/skips/cancellations, in 17.006720632 seconds. This reviewer read
that report and the committed test source; the execution belongs to the
functional worker. Its five cases overlap the older R11 compatibility run.

The [R11 functional report](independent-receipt-bugs-r11-20261120.md) separately
owns its four receipt groups. Coordinator compilation and compatibility checks
are separately attributed. None of these totals qualify the original alternate
PR #73 helper. Hosted qualification must bind to the actual final published
source or a verified equal tree.

Report validation passed: 2,457 Markdown links across 387 files, none broken;
public-claims lint found no findings across 366 files and 45 unchanged rules.
The staged report passed whitespace checking. These are documentation checks,
not additional product-test or cryptographic qualification.

## Assurance limits and fresh handoff

The [operator guide](../../packages/cli/README.md#check-returned-submission-evidence)
keeps receipt inclusion separate from authority, witness quorum, authenticated
freshness, later-head consistency and ballot counting. A signed deadline is not
a current-time verdict. The normalized receipt member can be extracted for
the [offline command](../../packages/cli/src/cmd-receipt.ts) with independent
origin/key/leaf expectations; the whole wrapper is not that input format.

No new private key or credential is loaded, and no receipt file is written.
Arbitrary server text is not copied into assurance or static errors. The no-pin
path retains its acceptance-only response. A valid public key for another log
can fail only after submission may have succeeded; the corrected R11 guide
preserves exact-packet retention and inspection before a repeat.

This worker performed source, commit/tree, acceptance-source and documentation
checks only. No product execution, dependency installation/audit, probe,
vulnerability reproduction, browser work, external message, publication or
release was performed. The stopped background-runtime/gossip investigation and
old untracked test were not inspected or resumed. Appointed approval, historical
DCO provenance, native ACL and release gates remain separate.

The next fresh reviewer should preserve these identities and dispositions,
inspect the final composition, and qualify later features at their own source.
Proof retrieval or checkpoint persistence needs its own anchor, consistency,
storage and acceptance review; receipt-only inclusion must not silently become
witness, freshness, finality or counting assurance.
