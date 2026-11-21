# Functional continuation preflight — R8, November 20, 2026

Reviewed source: `6fc16da296d51d498ff154442a47437ea6cd8482`.
Reviewed tree: `0e6447bd9fdda917811383edb172994dcef75796`.
Fresh worker: `bug_hunt_r8`, isolated checkout. This is a source and fixture
inventory, not a new runtime qualification or formal security approval.

## R7 handoff closed

The [R7 functional report](independent-backup-bugs-r7-20261120.md) suggested
linking the full recovery guide and adding the online request path there.
Source inspection of `e7fe059361883cae7757b77eafd69a1f4484b924` confirms both:
the [CLI guide](../../packages/cli/README.md#server-local-backup-jobs) links
[offline recovery](../OFFLINE-BACKUP-RESTORE.md), which now shows `backup-create`
and `job-inspect`. The text preserves submission/completion and recovery limits.
No remaining functional defect was confirmed in this bounded follow-up.

## Next gap: independent tally-draft checking

The CLI README explicitly lists this as unfinished. Current
[`cmdOnlineElectionTallyDraft`](../../packages/cli/src/cmd-online.ts) validates
options, downloads the existing proposal, checks `body.type`, and writes
`verified: false`. This is disclosed transport behavior, not a new defect.
[`sign-record`](../../packages/cli/src/cmd-packet.ts) validates schema, pinned
manifest and election context before signing; it does not independently compare
the proposed tally arithmetic, counted set or results before that signature.

The [server builder](../../packages/server/src/election.ts) derives a proposal
from admitted aggregate/share state, and submission compares it with the same
server recomputation. That is not an independent client check. Existing
[protocol verification](../../packages/protocol/src/verify.ts) recomputes
ballot analysis, counted root, aggregates, decryption proofs, all valid
decrypters, totals, rules and listed spoiled results. However, it returns before
its tally section when no signed tally exists. A prospective unsigned-draft
checker needs an explicit candidate boundary; it must not invent a signed or
logged tally to obtain a complete-election verdict.

Useful existing seams are `analyzeBallotLog`, `countedRoot`, `aggregate`,
`decryptAggregates`, and `evaluateAll`, plus the existing verifier's checks.
`buildTallyFromAggregate` explicitly does not establish counted-ballot binding.
The [archive preparer](../../packages/cli/src/cmd-prepare.ts) checks the manifest
and board structure but reports protocol/witness checks as unfinished; the
[trustee consumer](../../packages/trustee/src/trustee.ts) demonstrates separate
log, close, witness and counted-set gates. Neither helper alone is a complete
unsigned-tally verdict.

## Distinguishing acceptance cases for the next implementation

These are proposed checks, **not tests executed in R8**. Reuse existing protocol
cases in [verify.test.ts](../../packages/protocol/test/verify.test.ts),
[tally.test.ts](../../packages/protocol/test/tally.test.ts), and the existing
[CLI packet flow](../../packages/cli/test/packet-executable.test.ts).

| Case | Required distinguishing observation |
| --- | --- |
| Valid unsigned proposal before publication | Independently reproduce totals/results from supplied evidence without a signing key, network trust or fictitious log entry. Keep draft success distinct from published-election verification. |
| Latest ballot and counted membership | Supersession, excluded ballots, counted count/root and aggregate columns follow the existing analysis, rather than server-supplied totals. |
| Threshold and decrypter identity | Fewer than `t` valid complete sets cannot pass; accepted `decrypters` equals all recomputed `T_valid`, not just the canonical smallest `t` subset. Preserve current handling of an invalid extra share. |
| Shape, context and arithmetic disagreement | Wrong context, contest/option arrangement, aggregate, total or outcome cannot produce a checked-draft success. Existing schema and error classifications remain authoritative. |
| Rules, privacy and spoils | Exercise existing privacy floor, quorum/tie/method evaluation and reveal/trustee spoil verification; do not introduce new floor, finality or omission rules. |
| Evidence limitations | Missing close, incomplete DKG, absent board/witness evidence and stale-but-authentic history retain explicit distinctions. A manifest pin alone is not freshness or complete-log evidence. |
| Actual operator flow | Capture a pre-publication export from the existing fixed-clock `World`, check its genuine draft, then explicitly sign/submit and compare with the normal verifier. Retain protected-key and output semantics without another real-time ten-minute election. |

## Fixture inventory actually checked

A dependency-free Node JSON inspection asserted exactly one tally and nonempty
contest/results arrays in each existing fixture, then reported public metadata:

| `test-vectors/v1/elections/` fixture | Counted | Decrypters | Spoils | Method |
| --- | --- | --- | --- | --- |
| `tiny-yesno-3v` | 4 | 1, 3 | 1 | yes-no |
| `small-approval-20v` | 18 | 1, 2, 4, 5 | 1 | approval |
| `log-layer-4v` | 4 | 1, 2 | 0 | yes-no |

All three inspections passed. Their `bundle.json` files have no `board` member.
Use them for content/arithmetic coverage; use the existing separate board fixture
or a genuine exported pre-publication archive for log-evidence coverage. This
inspection did not execute cryptography or establish a new verification result.

Report checks: 2,295 documentation links in 371 files, none broken; claims lint
zero findings across 350 files and 45 unchanged rules; whitespace check passed.

## Limits and handoff

No source/test/contract changes, full elections, broad suites, browser runs,
native probes or vulnerability reproductions were performed. The coordinator's
already-running full CLI process was not touched. No stopped investigation or
old untracked test was inspected. The diagnosing-bugs discipline is limited here
to separating observations from hypotheses: no observed failure justified a
reproduction or causal claim. Implement the explicit draft boundary using
adopted checks, then have fresh workers review its exact source and meaningful
functional cases; unresolved freshness/finality contracts remain separate.
