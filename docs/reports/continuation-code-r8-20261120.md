# Continuation code review R8 — November 20, 2026

Reviewed source: `6fc16da296d51d498ff154442a47437ea6cd8482`.
Reviewed tree: `0e6447bd9fdda917811383edb172994dcef75796`.
This fresh worker follows the completed [R7 code review](independent-backup-code-r7-20261120.md).
Scope: final documentation composition, preservation and the next accepted CLI
gap. This is source review, not runtime qualification or formal approval.

## Standards and composition

No new standards or preservation defect was found in the scoped follow-up.
`git diff c7e3232...HEAD` contains documentation plus two SPDX comment additions.
Against feature source `ff61e15`, the only changes in CLI production/tests are
those two comments; executable statements and assertions are unchanged.
All six follow-up commits have author-matching DCO trailers and subjects of at
most 72 characters. This does not repair predecessor or historical DCO gaps.

PR #72 commit `9d3292bf945a283e7ec3b549a603692a902dc0c9` is an ancestor.
Its three report bodies are byte-identical at the reviewed head:

- [Consolidation checkpoint](../audits/CONSOLIDATION_CHECKPOINT_20261119.md).
- [Independent CLI/pool review](independent-cli-pool-review-20261119.md).
- [Independent split-origin review](independent-split-origin-review-20261119.md).

Both `CONSOLIDATION_REPORT.md` and `CONTINUATION.md` now label that checkpoint
historical. The new backup report and ledger distinguish the predecessor's
completed hosted matrix from qualification still needed for the new command.
The recovery guide now contains submission/inspection examples and links to the
same-administrator, 24-hour replay guidance. No runtime fix is requested here.

## Contract assessment: next implementation gap

Independent tally-draft checking remains a concrete CLI gap, explicitly named
in the [CLI README](../../packages/cli/README.md). Current behavior is honest:
`cmdOnlineElectionTallyDraft` in [cmd-online.ts](../../packages/cli/src/cmd-online.ts)
checks the fetched body's `type` and writes it with `verified:false`.
`cmdElectionSignRecord` in [cmd-packet.ts](../../packages/cli/src/cmd-packet.ts)
checks schema, pinned manifest, context and coordinator signing authority; it
does not recompute the proposed tally before adding the convenience signature.
These are documented limitations, not newly introduced regressions.

The existing contract already defines the required arithmetic and evidence:
[QV-16 sections 5.15–5.19 and Appendix C](../16-crypto-protocol.md) require the
counted set/root, per-option aggregates, decryption proofs, recomputed
`T_valid`, exact result rules and spoiled-ballot checks. The source provides:

| Existing source | Reusable responsibility and limit |
| --- | --- |
| [cmd-prepare.ts](../../packages/cli/src/cmd-prepare.ts), `prepareElectionArchive` | Bounded complete public archive, external manifest pin, authenticated board/body binding; protocol and witness checks still belong to the consumer. |
| [protocol/verify.ts](../../packages/protocol/src/verify.ts), `verifyElection` | Validates manifest/DKG/window/ballots, then recomputes tally, results and spoil evidence. No tally leaves tally checks `not_run`; there is no unsigned-draft entry point. |
| [protocol/tally.ts](../../packages/protocol/src/tally.ts) | `buildTally`, `decryptAggregates`, `decryptSpoiled` and proof decoding already implement the adopted primitives. `buildTallyFromAggregate` does not independently bind supplied aggregates to counted ballots. |
| [protocol/ballotlog.ts](../../packages/protocol/src/ballotlog.ts) and [rules.ts](../../packages/protocol/src/rules.ts) | Existing ballot admission/counting, aggregate/root and exact integer result evaluation. |

## Bounded successor work

A useful next slice is a public, read-only draft checker over a pinned complete
archive and an unsigned candidate body, reusing a factored version of the
existing protocol validation. It should produce a scoped comparison report
before any signing step. This requires implementation work, not a new suite,
record type, threshold rule or finality authority.

The extraction must expose only internally verified prerequisite state. The
current public report exposes context/joint key/counts, but not the verified
DKG share keys and eligible-decrypter set needed by the tally stage. Calling
`buildTallyFromAggregate` on server-provided aggregates is insufficient. The
trustee's private release gate also requires secret bundle state and is not a
public coordinator-verification API.

Keep the candidate separate from authenticated board records: do not fabricate
a signed tally, append synthetic evidence, suppress existing failures or turn
an absent tally into a published result. Preserve current supplied-log and
witness requirements, privacy floors, duplicate/conflict classifications,
decrypter-set equality and spoil exclusions. A draft comparison cannot claim
publication, currentness, challenges resolved, FINAL status or full-election PASS.

Acceptance should include the existing valid real-server proposal and public
fixtures, incorrect totals/count-root/context, incomplete proof sets, missing
close evidence, distinct valid trustee subsets and spoil cases, while retaining
all original full-verifier expectations. Bound file sizes and require no private
key or network submission. Formal sensitive-change review remains a promotion
gate; unresolved finality/freshness contracts in the [ledger](../audits/UNFINISHED_WORK.md)
remain separate. No new protocol decision is adopted by this handoff.

## Verification limits

Performed exact tree/ancestry/blob comparisons, follow-up diff inspection,
manual contract tracing and DCO/subject checks. No broad test suite, browser,
native probe or stopped investigation was run. The report is the only change;
the root records final publication and current-head hosted results separately.
Documentation checks passed: 2,297 links across 371 files, none broken; claims
lint found zero findings across 350 files and 45 unchanged rules. Whitespace
checking passed. These are documentation checks, not new product-test counts.
