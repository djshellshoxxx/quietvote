# Independent receipt-proof composition acceptance — R14

Date: November 20, 2026. Fresh functional reviewer: `/root/bug_hunt_r14`.
This follows the completed [R13 functional receipt](independent-receipt-proof-bugs-r13-20261120.md)
and reviews the [later-proof implementation](cli-receipt-proof-20261120.md).
The worker owns one additive normal case in the existing
[focused test file](../../packages/cli/test/online-receipt-proof.test.ts) and this
report. Production source was not changed.

## Outcome and exact source

**The complete focused file passed five groups, with zero failures, skips or
cancellations. No new functional defect was found within the assigned scope.**
One additional case covers a nonzero-sequence receipt and growth from a
non-power-of-two supplied checkpoint, extending R13's size-one-to-two case.

| Identity | Value |
| --- | --- |
| Frozen R13 composition | `d08dbce453b5aa6d1d99cc303e1875e728e5edfb` |
| Starting complete tree | `4ae5894806c6f6049929c919649a88424b78826b` |
| Unchanged production implementation | `febb956cdc61e892b7577c8b9c6f33882a6d7498` |
| Independent additive test commit | `e90d9cc62089e8245f0e083dfb459c9f82c064ea` |
| Executed composition tree | `51a9718bf55e366cb63ffcd71f6fbe0286ac5374` |
| Isolated branch | `codex/qv-bugs-r14-20261120` |

Native Git comparison confirms the CLI production directory matches `febb956`.
Removing only the new case and its two added named imports yields the exact
original test file from `d08dbce`: all prior assertions, fixtures, statements and
timeouts are preserved. The change is 62 added lines and one changed import
line. No existing gate was weakened.

The isolated checkout's CLI, board, crypto, protocol, server and verifier imports
were resolved explicitly with `import.meta.resolve`; all `@quietvote` aliases
point inside that checkout. Only external dependencies are shared. No package
installation, version change or network fetch was needed. The changing parent
checkout was not the runtime source for this execution.

## Ordinary three-to-seven checkpoint transition

The new case creates a normal local server through the existing `World` harness,
registers voters and admits a signed manifest. A normal ceremony-start marker
is followed by the first trustee's legitimate signed DKG commitment. Its actual
HTTP append response supplies an included receipt at sequence **2**, checkpoint
size **3**. The fixture independently retains the exact generated header leaf,
election origin and log public key.

The case saves that normalized receipt before continuing the ordinary ceremony
prefix. The remaining two trustee commitments, round-one-open marker and first
dealing bring the board to size **7**. All entries use the existing signed
protocol producers and normal admission endpoint; there is no alternate tree
or artificial history.

`online receipt-check` then checks the saved receipt at explicit size seven.
The normal server's request event records method/path/query without changing
handlers or responses. The observed command requests are exactly:

| Request | Bound fields |
| --- | --- |
| Inclusion GET | Saved sequence `2`, requested tree size `7`. |
| Consistency GET | Previous tree size `3`, new tree size `7`. |

The result reports verified promise, requested inclusion and supplied-checkpoint
consistency. Requested, previous and output-receipt sizes are respectively
7, 3 and 7. The included path contains multiple hashes. The original receipt
identity, signature and promise timestamps remain identical; only its included
snapshot evidence advances.

The shared scope assertions confirm `receipt-proof`, expected origin/key/leaf,
and explicit false authority, witness-quorum, freshness and ballot-counting
flags. Saving the returned contained receipt allows the existing offline
`verify-receipt` command to verify its inclusion successfully. The original saved
file remains byte-identical, the board stays at seven entries and its phase is
unchanged by proof checking.

## Execution record and limits

Linux, Node **24.22.3**:

```sh
node --test --test-reporter=spec packages/cli/test/online-receipt-proof.test.ts
```

| Check | Observed result |
| --- | --- |
| Complete focused file | Five passed; zero failures, skips or cancellations; **1.683 seconds**. |
| New sequence-two, size-three-to-seven case | Passed in **0.306 seconds** within that file. |

The five groups comprise the four existing R13 groups plus one new case. They
are not five additional unique tests beyond R13 or the coordinator's overlapping
nine-case receipt batch. This worker did not repeat broad CLI, protocol, server
or browser suites. Final integrated TypeScript remains the coordinator's gate;
this report does not invent a worker compiler result.

Report validation passed: **2,531 Markdown links across 396 files**, none broken;
claims lint found **zero findings across 375 files and 45 unchanged rules**.
The final staged diff passes whitespace checking. These documentation checks
are not additional product tests.

This is normal functional verification of the supplied-receipt command. It
does not independently qualify all Merkle algorithms, witness policy, entry
authority, newest-state detection, durable checkpoint retention or native ACLs.
The command's consistency claim remains relative to the supplied verified
checkpoint, which need not be the user's latest observation.

## Fresh-review handoff

The test commit and exact execution receipt were sent to the coordinator and
fresh code reviewer for final composition inspection. The report and test have
matching author DCO and specification references. No production defect was
asserted and no production repair was requested.

Use the final composed tree when recording hosted qualification. Earlier green
checks retain their original source scope. Appointed security approval and
historical provenance decisions remain separate. The stopped investigation,
its old untracked test and denied native browser work were not inspected or
resumed; no external probe, vulnerability reproduction, publication or message
to an external party was performed.
