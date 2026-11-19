# Historical source disposition — 2026-11-18

PRs [#58](https://github.com/djshellshoxxx/quietvote/pull/58) and
[#67](https://github.com/djshellshoxxx/quietvote/pull/67) are retained as
historical source records, with their branches and commits preserved. Neither
is a candidate for a wholesale merge into canonical integration. Closing the
PRs without merging does not adopt their requirements, certify their findings
against current code, or supply their missing original-author DCO attestations.

The clause-level comparison used local composed source
`f395f3453bc49a6ce14a4246486c0aaa17cc2620`. The pinned-membership implementation
in that source is documented in the [separate implementation note](pinned-membership-implementation-20261118.md).
This disposition records source analysis, not formal CODEOWNER/security review.

## PR #58: historical verification experiments

Preserve branch `claude/sharp-archimedes-tu76rh` at
`9a03414e0e826db292f9dd5728e4d3d2f0682784`, including both exact source files:

- [Historical verification narrative](https://github.com/djshellshoxxx/quietvote/blob/9a03414e0e826db292f9dd5728e4d3d2f0682784/docs/audit/2026-10-28/interim-verification-quietvote.md).
- [Historical experiment records](https://github.com/djshellshoxxx/quietvote/blob/9a03414e0e826db292f9dd5728e4d3d2f0682784/docs/audit/2026-10-28/interim-verification-quietvote.json).

Those experiments concern
`424110d90e23dc443aa4498a4340973d3c8cb8b6`. Their final recorded scope was
**56 confirmed and 16 pending extracted findings; 33 KNOWN items were not
reverified; no extra-lens results were produced**. The additional High-finding
checks, skeptic/coverage critic, and consolidated synthesis did not run.
These are historical experiment counts, not current vulnerability counts.

[Merged #59](https://github.com/djshellshoxxx/quietvote/pull/59), source
`7824e6178572c61dea133ba7e81d5e1b6a1b3234` and merge
`f199242b5a516d254393b7e635e03db85205a82e`, supplies the newer
[finding assessment](consolidation-current-findings-20261117.json) and
[recheck narrative](consolidation-current-recheck-20261117.md) for all 72
extracted identifiers. It supersedes #58 as the current remediation tracker.

The historical files are **not byte-equivalent** to that newer assessment.
#58 adds full batch records for B1-09 through B1-12 and enriches 36 existing
batch records with commands, output, refutation attempts, proof-of-concept
text and some assessed severities. The current retained legacy JSON has the
earlier 52-batch version. The pinned JSON above preserves the unique experiment
detail without importing a historical contribution with a missing DCO sign-off.

The original source commit has no author-matching `Signed-off-by:` trailer.
This disposition does not rewrite it or attest for its author. Closure does
not mean all findings are fixed or all historical experiments were repeated.

## PR #67: specification completion against an obsolete base

Preserve branch `nodata/affectionate-archimedes-0pr6w5` at
`3350a1a4566eda73d6cfb331956bc05c9841518c`. Its original base was the
specification-only main commit
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`.

The core 00–14 documents, old cryptography design and spec index conflict with
the newer canonical specifications. Thirty introduced identifiers collide
with active requirements. For example, the source uses QV-04-REQ-001 for a
rules view, while current QV-04 uses it for local key generation and never
transmitting secret material. Active QV-17, QV-18 and QV-19 now identify
trustees, bulletin-board transparency and client supply-chain requirements.
The [current spec index](../SPEC-INDEX.md) marks the older optional drafts as
non-authoritative. All eight source commits lack author-matching DCO trailers.

The remaining useful material is a research/scenario inventory under the
existing N-19 reconciliation item and N-48 delegation backlog. It does not
supply missing D-99 membership semantics or approved implementation rules.

| Retained source detail | Current home and disposition |
|---|---|
| [Portable credentials](https://github.com/djshellshoxxx/quietvote/blob/3350a1a4566eda73d6cfb331956bc05c9841518c/docs/17-portable-membership-credentials.md), OD-07 and data rules: consented credential transfer versus reissue under a fork's new identity. | Existing credential/delegation drafts, `IDEAS.md` §1 and N-19. Preserve the conflict as an unresolved research question; adopt neither side or its old identifiers. |
| [Federated governance](https://github.com/djshellshoxxx/quietvote/blob/3350a1a4566eda73d6cfb331956bc05c9841518c/docs/18-federated-governance.md), failure/retry and verification sections: incomplete delivery near close, conflicting signed group records, challenged local results, withdrawal/quorum recomputation, lost evidence, competing key histories and split identities. | Existing federation draft and `IDEAS.md` §8. Keep the detailed scenarios for future cross-group governance design. Current QV-32 relay/witness infrastructure does not resolve local ratification, dissent/publication, combination rules or automation criteria. |
| [Delegation/exit/fork](https://github.com/djshellshoxxx/quietvote/blob/3350a1a4566eda73d6cfb331956bc05c9841518c/docs/19-delegation-exit-fork.md), transition/failure tables and OD-02/05/06/07: delegate acceptance, abandoned drafts, expiry/cutoff, direct-ballot override ordering, either party's exit, retry and restore effects. | Existing delegation draft, `IDEAS.md` §7, N-48 and T-361. Preserve scenarios without adopting its state machine. Terminal consumption versus later override remains unresolved; its acknowledgment wording also conflicts with its own lost-response scenario and current durable management receipts. |
| Same delegation source, export failure/partial-export clauses and OD-11–14: refuse an incomplete governance export, label missing items, or export only completed decisions; fork timing and ongoing source decisions. | Current QV-06 §7.4, QV-09 §10 and [core handoff](consolidation-core-handoff-20261117.md) N-32(b). Preserve only the additional policy alternatives. Existing export/fork principles are already retained. This is not permission to change `.qvb` verification, completeness or deletion-acknowledgment behavior. |

The retained current 17/18/19 draft files are still byte-identical to their
original-base versions. The expanded scenario tables remain in the pinned
source links above; they have not been silently copied into active specs.

The core rewrite also proposes freeze at opening, separate recorded member
acceptance, no MVP revoting, and broad concealment of eligibility/participation.
These conflict with the current manifest binding, permitted revoting,
no-separate-consent-artifact MVP, and public Phase-1 roll/participation facts.
The old cryptography document reopens choices now addressed by QV-16 and
accepted decisions. None of those clauses is recovered by this disposition.

## Membership boundary retained

Accepted D-99 option A distinguishes the complete immutable eligible list from
actual registration. The full list drives commitment, replay, quorum,
pagination and export; an absent member cannot block commitment or acquire
ballot authority merely by appearing on the list. Imported membership has
unknown registration history. #67 has no equivalent contract and must not
overwrite [QV-09 §7.1.1](../09-api-data-contracts.md#711-authenticated-complete-pinned-membership)
or the implementation described in the source comparison above.

The remaining proposal choices stay in their existing backlog. No source
branch is deleted, history rewritten, requirement identifier reassigned,
review approval supplied, release made or deployment performed by this
historical disposition.
