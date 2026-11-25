# QuietVote continuation: rounds 13–14, November 20, 2026

## Delivered increment

`online receipt-check` verifies a saved normalized receipt before bounded
read-only requests for an explicit inclusion snapshot. It uses independent
election/key/leaf expectations and existing board primitives. Equal-size saved
and requested roots must agree; growth requires consistency. Missing optional
signed checkpoint evidence remains incomplete while preserving older evidence.

The [implementation receipt](../reports/cli-receipt-proof-20261120.md) and
[guide](../../packages/cli/README.md#check-a-later-receipt-proof) explain normal
use, link access, selected JSON, limits and offline reuse. Consistency is relative
to the supplied receipt, not necessarily the user's latest observation. The
command does not persist checkpoints, mutate files/server state or assert
authority, witnesses, freshness, counting or FINAL status.

## Source and executed evidence

Published predecessor `46ede0a4aedb39a0ff648441a9fab6774af17097` and local
`7a2fa27d37cfb5d5bdc2f8f9d266e2baa5a290a0` share complete tree
`2cd074b563c6b11cb2ccb74a680721bea2748d9a`. Work began from that local equivalent.
The prior publication's Git-data read verified its tree, parents and author/DCO;
a cancelled shell fetch is not claimed as a native fetch/diff.

Production: `febb956cdc61e892b7577c8b9c6f33882a6d7498`, tree
`d0b95e5974b57264f67e123e96bb64fcdf5984e0`. R13 tests `38acf8e` and integrated
`b002c2b` share tree `86753b527d02075d5285914ae0e4a932f6c839df`. Guide correction
`2bc160d` distinguishes HTTP from local-input failure. Type correction `b24ed760`,
integrated `333ddcc`, changes no runtime assertions. Fresh R14 starts at
`d08dbce453b5aa6d1d99cc303e1875e728e5edfb`, tree
`4ae5894806c6f6049929c919649a88424b78826b`.

R14 test `e90d9cc62089e8245f0e083dfb459c9f82c064ea` was integrated as
`cab2c18d063785c80e8948148e47c359417dcda9`; both have complete tree
`51a9718bf55e366cb63ffcd71f6fbe0286ac5374`. Production still equals `febb956`.

Linux, Node 24.22.3:

| Check | Observed result and scope |
| --- | --- |
| Full root TypeScript | Passed with a 768 MiB heap on implementation, after test integration, after final R13 typing and after the R14 test addition. |
| Independent R13 acceptance | Four groups passed; zero failures/skips/cancellations; 1.482 seconds. |
| Coordinator new/immediate/offline receipt batch | Nine passed; zero failures/skips/cancellations; 3.361 seconds, concurrency 1. |
| Independent final R14 proof file | Five passed; zero failures/skips/cancellations; 1.683 seconds on tree `51a9718b`. |
| Final documentation composition | 2,569 links across 399 files, none broken; claims lint zero findings across 378 files and 45 rules; whitespace clean. |

The four new groups overlap the nine-case batch. They cover executable/server
promise upgrade, normal size-1-to-2 growth, equal-size checks, private link access,
missing note with either old inclusion or promise-only evidence, offline reuse,
request counts and unchanged files/log/phase. Workspace aliases resolved locally.
No unchanged broad protocol/server/browser suite was repeated.

R14 adds a normal admitted trustee commitment at sequence 2 and checks its
receipt from checkpoint size 3 to 7. Exact inclusion/consistency GETs, multi-hash
inclusion, original promise, offline reuse and unchanged file/log/phase are
asserted. Every previous assertion and timeout remains unchanged. Its five
groups include the earlier four; they are not five additional unique tests.

## Fresh worker handoffs

All R13 workers completed before the fresh R14 set began. All R14 workers then
completed. All six reports are integrated, with no unresolved finding in these
scoped reviews.

| Round | Code audit | Functional bug hunt | Defensive security |
| --- | --- | --- | --- |
| R13 | [Implementation and standards](../reports/independent-receipt-proof-code-r13-20261120.md) | [Saved-receipt workflows](../reports/independent-receipt-proof-bugs-r13-20261120.md) | [Anchors and consistency](../reports/independent-receipt-proof-security-r13-20261120.md) |
| R14 | [Final composition](../reports/continuation-code-r14-20261120.md) | [Larger checkpoint transition](../reports/continuation-bugs-r14-20261120.md) | [Composed source and scope](../reports/continuation-security-r14-20261120.md) |

Optional-note, saved-presence, path and supplied-checkpoint boundaries were
preflight design inputs, incorporated before implementation. They are not
counted as production defects. R13 closed guide wording and test `any`
observations. Engineering review remains separate from appointed approval.

## Publication and remaining gates

The final complete remote tree must match the reviewed local composition before
a non-force expected-head update. Live source, hosted results and status belong
to [PR #71](https://github.com/djshellshoxxx/quietvote/pull/71). PR #73's preserved
history and earlier consolidation are inherited through the predecessor.

Receipt-head CI 44783102623, claims 44783102322 and visual 44783102421 were queued
during R13. Their results qualify that tree, not this new command. Earlier
tally/backup/native/browser receipts retain their own source scopes.

Main, original branches and release state remain unchanged. The stopped
investigation and denied browser attempts remain excluded. Formal approvals,
historical DCO, native ACL, unresolved product contracts and release provenance
remain in [unfinished work](UNFINISHED_WORK.md).

## Next concrete boundary

Durable per-origin tracking must retain the latest independently verified
checkpoint across invocations and require consistency before advancement.
Supplied-receipt checking does not complete that requirement. First establish
the local origin/key binding, bounded format, concurrent-writer/crash behavior,
fail-closed filesystem provider and recovery rules against existing standards.
Do not replace newer evidence with an older successful check, advance on
incomplete evidence, or infer authenticated freshness from checkpoint time.
Keep unsupported native ACL behavior separate from normal-path tests.
