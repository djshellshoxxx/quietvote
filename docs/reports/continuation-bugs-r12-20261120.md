# Independent receipt consolidation acceptance — R12

Date: November 20, 2026. Fresh functional reviewer: `/root/bug_hunt_r12`.
This worker owns the adapted [online workflow test](../../packages/cli/test/online.test.ts)
and this report. It follows the completed
[R11 functional handoff](independent-receipt-bugs-r11-20261120.md) and reviews
the useful normal-workflow coverage from the parallel
[PR #73 candidate handoff](../audits/CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md).

## Outcome and source identity

**The focused online test file passed all five cases, with zero failures,
skips or cancellations. No new functional defect was confirmed.** The change
retains the parallel candidate's election-open receipt and exact-byte replay
acceptance in the reviewed implementation's output format. Production source
was not changed.

| Identity | Value |
| --- | --- |
| Published starting checkpoint | `29cde9b1d8d774ee201c06f53386a556a2ad48d7` |
| Parallel candidate | `1cab4ae130a4c1823b61e369557340ba4ec3842d` |
| R12 starting composition | `f919d319bd7dd346274e2e0dbbccd973ffd57159` |
| Starting composition tree | `cfbae3de8e200679e919e369c88315183a46e41d` |
| Executed production implementation | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Independent adapted-test commit | `ee123c26ccfd0d3d1d03c1d7724c9b15dbddeec5` |
| Executed composition tree | `bed534f6a6de6f38278b7cd4a9a57baee84f59a5` |
| Isolated branch | `codex/qv-bugs-r12-20261120` |

The test commit changes only `packages/cli/test/online.test.ts`, with 25 added
and two removed lines. Every original assertion and the existing 120-second
lifecycle timeout remain. All package production source is unchanged from
`918f270`; the candidate's historical handoff remains byte-identical, and its
commit remains an ancestor of the starting composition.

External dependencies were shared without installation or version changes.
The isolated checkout has its own `@quietvote` aliases. `import.meta.resolve`
confirmed that CLI, board, crypto, protocol, server and verifier resolved inside
this checkout rather than the coordinator's changing source.

## Preserved normal workflow

The existing real-server fixture creates an organization and election,
registers the voters, publishes the manifest, and completes the ceremony. The
adapted block builds one signed election-opening packet and invokes the real
CLI command handler through the existing in-process `qv` harness, supplying
the fixture's independent log public key. Its normal HTTP response is checked
against the retained R11 implementation.

The test asserts an included receipt, a verified promise and verified
inclusion. The client-reported leaf equals the locally computed hash of the
exact opening header, and the reported key equals the supplied pin. The
normalized result has `scope: "receipt-only"` and explicitly false authority,
witness-quorum, freshness and ballot-counting verification flags.

A second explicit command invocation uses the same saved packet and arguments.
It again succeeds and preserves the admitted receipt sequence, normalized leaf
and client verification result. The fixture then confirms the election is
open. This exercises an opening packet after a real ceremony, complementing
R11's separate manifest-packet acceptance without replacing it.

The remainder of the original test is unchanged: three votes are admitted,
early close is refused, the later close reaches tallying, trustees publish
shares, the tally is relayed, and JSON export is verified. The strict JSON-only
export remains incomplete without board evidence; the explicit content-only
TypeScript verification counts all three ballots. The independent Python
vector CLI compares the shared report fields. Private output permissions on
this Linux host and refusal to overwrite an existing export remain asserted.

The parallel candidate's `server_response` and `client_verification` wrapper
was not adopted. Assertions use the retained selected `status`, normalized
`receipt` and client-owned `verification` contract documented in the
[operator guide](../../packages/cli/README.md#check-returned-submission-evidence).
Its separate alternative helper and helper tests were not executed by this
worker. Their historical source does not inherit this execution receipt, and
this report does not claim that each of their refusal assertions is dynamically
covered by the four R11 groups.

## Execution record

Linux, Node 24.22.3, isolated worktree:

```sh
node --test --test-reporter=spec packages/cli/test/online.test.ts
```

| Case | Result |
| --- | --- |
| Signed API draft creation, inspection and editing | Passed; 242.205 ms. |
| Signed-entry lifecycle with checked opening receipt, replay and export | Passed; 16,346.968 ms. |
| Server URL, identifier and option validation | Passed; 0.868 ms. |
| Malformed and oversized entry input | Passed; 11.962 ms. |
| Mutation ambiguity and redirect refusal | Passed; 11.926 ms. |
| Whole focused file | Five passed; zero failed, skipped, cancelled or todo; 17,006.721 ms. |

The focused file is part of the coordinator's earlier nine-case R11
compatibility run. These five executions qualify the adapted file and are
overlapping coverage, not five wholly new tests to add to that older total.
The four independent R11 receipt groups were not rerun by this worker. Full
TypeScript after final integration remains the coordinator's gate; this worker
did not start a competing compiler or repeat a broad CLI/protocol/server suite.

Documentation validation passed: 2,448 Markdown links across 387 files, none
broken; public-claims lint reported zero findings across 366 files and 45
unchanged rules. The staged report passed whitespace checking. These checks
provide documentation evidence without adding product-test coverage. Test and
report commits carry matching Codex DCO and applicable specification references.

## Limits and fresh handoff

Receipt inclusion concerns the expected entry bytes at the returned signed
checkpoint. It does not establish entry authority, witness quorum, freshness,
consistency with a retained independent observation or ballot counting. The
normal replay is an operator-initiated repeat; the command gains no automatic
retry. Later proof retrieval and durable checkpoint/receipt handling require
their own scope and source-qualified acceptance.

The fresh R12 code and defensive security reviewers received the exact adapted
test commit and execution receipt for source inspection. The coordinator should
integrate it, preserve the R11 corrections and candidate history, and bind final
compilation and hosted checks to the final composition. This report does not
constitute appointed security approval, release qualification or a main merge.

No probe, exploit reproduction, dependency change, browser retry, publication
or external message was performed. The stopped background-runtime/gossip
investigation and old untracked test were not inspected or resumed. Existing
formal approval, historical DCO and native-platform gates remain separate.
