# QuietVote continuation: rounds 11–12, November 20, 2026

## Delivered increment

`online election-submit --log-key` verifies the returned signed promise and
optional inclusion under an independent log-key pin, bound to the exact packet
and selected election. No-pin mode is unchanged. Checked JSON contains a
normalized reusable receipt and explicit `receipt-only` scope. Promise-only
evidence exits incomplete. A failed check after POST retains possible acceptance
and never triggers an automatic retry.

The [implementation receipt](../reports/cli-returned-receipts-20261120.md) and
[operator guide](../../packages/cli/README.md#check-returned-submission-evidence)
describe limits and offline reuse. Inclusion does not establish authority,
witness quorum, freshness, counted ballots or consistency with another head.

## Exact sources and verification

Published base: `29cde9b1d8d774ee201c06f53386a556a2ad48d7`, tree
`9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d`. Final production source:
`918f27022ab0071b5b83418263c6a3cf9643f37f`, tree
`af59d1f37fe78851e23c4673ce02eeafb94a4674`. R11 tests and guides follow it.
Preservation merge `f919d319bd7dd346274e2e0dbbccd973ffd57159`, tree
`cfbae3de8e200679e919e369c88315183a46e41d`, changes no package content.

R12 test `ee123c26ccfd0d3d1d03c1d7724c9b15dbddeec5` was integrated as
`48c7ad7057f057aed8a540681b2a1e1b9fe9483a`; both have complete tree
`bed534f6a6de6f38278b7cd4a9a57baee84f59a5`. Documentation correction
`ac42798cef20d5e07b3b757b22addef124af94a8`, tree
`3519d720d01cf406f15a52e717d47baa14d72696`, aligns the worked API example with
its existing inclusion schema. R12 changes no production code or schema.

Linux, Node 24.22.3:

| Check | Observed result and source scope |
| --- | --- |
| Full root TypeScript | Passed with a 768 MiB heap after R11 acceptance integration, and again after the R12 test integration. |
| Independent R11 receipt acceptance | Four passed; zero failures/skips/cancellations; 1.239 seconds on production `918f270`. |
| Coordinator R11 receipt acceptance | Same four passed; zero failures/skips/cancellations; 1.680 seconds. |
| Existing receipt, packet and online compatibility | Nine passed; zero failures/skips/cancellations; 22.162 seconds before the R12 test addition. |
| Independent R12 complete online test file | Five passed; zero failures/skips/cancellations; 17.007 seconds on tree `bed534f6`. |
| Final documentation composition | 2,501 links across 391 files, none broken; claims lint zero findings across 370 files and 45 rules; whitespace clean. |

R12 adds signed election-open receipt/replay checks after the ceremony while
retaining every original assertion and timeout for opening, votes, close,
export and TypeScript/Python verification. Its five cases overlap the earlier
nine; the four R11 cases also overlap. Counts are not summed as unique tests.
Each functional worker verified its own local workspace module resolution.

## Worker handoffs

All R11 workers completed before three fresh R12 workers began. All three R12
workers then completed, with their reports integrated. Source review,
independent execution and coordinator checks have separate receipts.

| Round | Code audit | Functional bug hunt | Defensive security |
| --- | --- | --- | --- |
| R11 | [Compatibility and results](../reports/independent-receipt-code-r11-20261120.md) | [Returned wire evidence](../reports/independent-receipt-bugs-r11-20261120.md) | [Pin and assurance boundaries](../reports/independent-receipt-security-r11-20261120.md) |
| R12 | [Seven-path disposition](../reports/continuation-code-r12-20261120.md) | [Opening and replay workflow](../reports/continuation-bugs-r12-20261120.md) | [Consolidated source review](../reports/continuation-security-r12-20261120.md) |

Closed R11 observations: additive REST JSON compatibility, expected-failure
`Result` convention and pin-error timing in the guide. R12 identified an example
omitting inclusion sequence/leaf fields required by its own schema; the example
now includes them. Schema and current server already agree. No new production
blocker was identified within these scopes. Appointed approval remains separate.

## Concurrent PR #73 preservation

The hourly continuation independently authored
`1cab4ae130a4c1823b61e369557340ba4ec3842d`, tree
`69fd28869df9c5627cea7f919f6f3ce544d88664`, on the same tally base. The commit
remains an ancestor of local preservation merge `f919d31`. Its
[original handoff](CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md) is byte-identical
and retains its authored-but-unexecuted qualification. Its branch is unchanged.

Fresh review covers all seven paths. Adapter, help and guide retain the reviewed
implementation and online JSON convention. The duplicate helper and alternative
unit suite are not installed as another implementation; their examined cases
do not acquire runtime qualification from R11/R12. The useful election-open/replay
acceptance is adapted and independently executed. The 64 KiB cap and required
duplicate inclusion fields are explicit supported-wire decisions, not claims
of accepting every input handled by the alternative candidate.

Canonical publication must preserve PR #73's source parent and prove complete
tree equality with the final local composition. Live disposition, publication
identity and hosted checks belong to
[PR #71](https://github.com/djshellshoxxx/quietvote/pull/71). Historical candidate
prose is not the current implementation or approval status.

## Hosted and promotion boundaries

At 17:15 UTC on November 20, tally-head workflows
[CI 44777317053](https://github.com/djshellshoxxx/quietvote/actions/runs/44777317053),
[claims 44777317011](https://github.com/djshellshoxxx/quietvote/actions/runs/44777317011)
and [visual 44777317095](https://github.com/djshellshoxxx/quietvote/actions/runs/44777317095)
were queued. They precede this receipt source. New publication requires its own
observed hosted result; queueing and predecessor passes do not qualify it.

Main, release state and original branches are preserved. Historical DCO gaps,
appointed approvals, native ACL and unresolved product contracts remain in
[unfinished work](UNFINISHED_WORK.md). The stopped investigation and denied
native browser attempts remain excluded.

## Next concrete increment

Inspect the existing read-only inclusion-proof endpoint and offline verifier
for bounded later-proof retrieval. Require saved evidence and independent
election/key/leaf expectations; verify the promise before network access, then
request and verify one explicit snapshot through existing primitives. Preserve
incomplete evidence as incomplete. Do not infer witness/freshness from unsigned
API data or silently update retained checkpoints. Retention and consistency
need their own explicit workflow. Start with fresh workers and exact sources.
