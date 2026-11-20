# Later receipt-proof checking — November 20, 2026

## Delivered workflow

`online receipt-check` verifies a saved normalized receipt under independent
election, log-key and exact-leaf expectations before requesting an explicit
snapshot. It reuses existing receipt, checkpoint, inclusion and consistency
verification. The [guide](../../packages/cli/README.md#check-a-later-receipt-proof)
documents invocation, input/output formats, limits, link access and offline reuse.

One GET names the saved sequence and requested size. Missing optional signed
checkpoint evidence leaves that request incomplete and preserves older verified
evidence. A present invalid note fails. Growth from a supplied included checkpoint
requires one additional, exact-size consistency proof before successful output.
Equal-size roots are checked locally. A saved promise has no consistency anchor.

JSON separates requested, previous and returned-receipt tree sizes. The command
does not mutate the server, rewrite files, poll, retry or persist checkpoints.
Consistency is relative to the supplied receipt, not necessarily the latest
observation. Authority, witnesses, freshness and counting remain false. Durable
latest-per-origin tracking under QV-18 remains separate work.

## Exact source and input boundaries

Published predecessor `46ede0a4aedb39a0ff648441a9fab6774af17097` and local
`7a2fa27d37cfb5d5bdc2f8f9d266e2baa5a290a0` share complete tree
`2cd074b563c6b11cb2ccb74a680721bea2748d9a`. This branch starts from that local
equivalent without merging distinct publication/source graphs.

| Change | Source |
| --- | --- |
| Production, help and guide | `febb956cdc61e892b7577c8b9c6f33882a6d7498`, tree `d0b95e5974b57264f67e123e96bb64fcdf5984e0` |
| Independent acceptance | `38acf8e64a3c042faa7a35a92e7987cb3fff4f1b`, integrated as `b002c2b6821b11f6db84a02cca87ce65af34c0c1`; identical complete tree `86753b527d02075d5285914ae0e4a932f6c839df` |
| HTTP versus local-input wording | `2bc160da382d98c21c8af0f806ae6718d141f7db` |
| Test typing correction | `b24ed760d919db644f3578404b2e8cc12bb5c4b1`, integrated as `333ddcc55d0b7c4cdbb97f6857974592a3acb2a5` |

Production remains `febb956`. The annotation correction changes no runtime
statement or assertion. No schema, server, board primitive, dependency or workflow
changes. New helpers use the existing board `Result` convention.

Saved input is a regular QV-JSON file of at most 64 KiB. Present malformed
inclusion cannot silently become absent. All saved evidence verifies before
GET. Requested size covers the entry, cannot precede saved inclusion and stays
within the existing 1..2^40 API range. Each response is at most 64 KiB; inclusion
and consistency paths retain 64/63-hash limits. Strict UTF-8 transport JSON
tolerates additive metadata while binding sequence, leaf and size explicitly.
Private link credentials use the existing read-key mechanism and are not printed.
Bounded reading does not claim a universal atomic snapshot or native ACL coverage.

Missing requested notes exit 3, successful scoped checks exit 0, and failing
response evidence/HTTP reads exit 1 without claiming entry rejection or absence.
Input and usage errors remain distinct. Returned normalized receipts work with
the existing offline verifier; save them separately rather than replacing a pin
automatically.

## Executed evidence and review

Linux, Node 24.22.3. Independent workspace aliases resolved locally; only external
dependencies were shared.

| Check | Observed result |
| --- | --- |
| Full root TypeScript | Passed with a 768 MiB heap on implementation, after test integration and after the final type-only correction. |
| Independent final R13 acceptance | Four groups passed; zero failures/skips/cancellations; 1.482 seconds. |
| Coordinator new/immediate/offline receipt batch | Nine passed; zero failures/skips/cancellations; 3.361 seconds, concurrency 1. |
| Fresh R14 proof file | Five passed; zero failures/skips/cancellations; 1.683 seconds. The additional normal sequence-2 receipt advances from checkpoint 3 to 7. Final integrated TypeScript passed. |

The four new groups overlap the nine-case batch. Runtime execution precedes the
erased annotation correction; final compilation qualifies its types. The
[functional report](independent-receipt-proof-bugs-r13-20261120.md) records actual
executable/server promise upgrade, normal ceremony growth, equal-size checking,
offline reuse, legitimate link access, missing-note retention, local refusal,
request counts and unchanged files/log/phase.

R14 test `e90d9cc62089e8245f0e083dfb459c9f82c064ea`, integrated as
`cab2c18d063785c80e8948148e47c359417dcda9`, has complete tree
`51a9718bf55e366cb63ffcd71f6fbe0286ac5374` in both checkouts. Its five groups
include R13's four; no sum of these overlapping counts is claimed. The
[continuation handoff](../audits/CONTINUATION_R13_R14_20261120.md) records final
composition and fresh review scopes.

Preflight design boundaries were incorporated before implementation, not counted
as production defects. Review corrected the guide's HTTP/local-input distinction
and two explicit test `any` annotations. R13/R14 reports retain their source and
scope. Hosted results must qualify the new published tree. Formal approvals,
historical DCO, native ACL, unresolved product contracts and release evidence
remain separate gates.
