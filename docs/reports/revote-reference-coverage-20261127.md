# Seeded revote reference-model coverage

Date: 2026-11-27 (America/Vancouver).
Base: `5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7` (PR #75).
Scope: [product inventory T4](inventory-20261111/product.tasks.md).

## Contract and plan

[QV-16 §5.14](../16-crypto-protocol.md), QV-16-REQ-015/017 and
[QV-04-REQ-008](../04-identity-eligibility.md) define one counted ballot per voter:
the last admissible successor, bounded by the manifest's cast limit. A stale
predecessor, excluded spoiled code or over-limit attempt cannot advance that
chain. Spoils consume no cast slot. Adopted [NOTES X-10 and B1-01](../../packages/protocol/NOTES.md)
require every authenticated spoiled code to remain excluded, even when the spoil
is later than its cast. The new tests exercise those existing rules.

The plan was to express the expected chain independently, generate bounded signed
histories, compare exact counted sets and predecessors, and vary global order
without changing each voter's order. Production policy and vector expectations
are outside this test-only change.

## Independent oracle

The test plans candidates as symbolic IDs, each with a voter and predecessor ID.
Its reference model removes all authenticated-spoiled candidates, groups the
remaining cast edges by voter, then traverses the earliest eligible successor
from the zero predecessor for at most the declared number of hops. A hand-worked
example independently pins its fork, later spoil, orphaned child, recovery,
single-mode and empty-voter behavior.

This differs from the production streaming `last`/`admissibleCount` bookkeeping.
The oracle does not call `analyzeBallotLog`, parse the wire envelope or inspect a
production verdict. The generator also does not ask either implementation for
the current admissible head: random parent choices come from all previously
created candidates, including rejected and spoiled candidates.

Candidate IDs are then encoded with the existing `buildBallot`, `makeCast` and
`makeSpoil` helpers under a real simulated DKG context. Signatures, context and
proofs run through the real analyzer; the tests require its ballot-validity and
canonical-encoding checks to remain successful. Counting refusals therefore
cannot be accidentally explained by malformed fixture cryptography.

## Bounded corpus

| Dimension | Coverage |
|---|---|
| Cast caps | `max_per_voter` 1, 2 and 4 |
| Seeds | `revote-property-<cap>-alpha` and `revote-property-<cap>-beta` |
| Voters / contests | Four voters; one yes/no contest with yes, no and blank selections |
| Fixed prefix | Spoil then cast, first-ballot fork, rejected-fork child, valid chain through the cap, over-limit cast, later spoil, orphaned child and recovery, audit-only voter |
| Random suffix | Twelve seeded operations per history: new zero-parent casts, arbitrary/last-created parents, repeated casts, existing-candidate spoils, new spoil/cast pairs |
| Comparisons | Prefix, complete history, and voter-order-preserving interleaving: 18 analyzer comparisons over six histories |
| Bounds | At most 40 envelope events and 26 constructed ballots in any history |

The tests compare counted voter, ballot code, board sequence and the predecessor
of the terminal admissible chain. They also check unique counted voters, cast and
spoil observations, single-mode zero predecessor, and exact error/class/sequence
for guaranteed fork, rejected-child, spoiled-code and vote-limit cases. A
cross-voter interleaving must preserve counted identities and predecessors.

## Evidence and limits

The focused run passes all four top-level tests with zero skips. The three cap
cases take roughly 5–8 seconds each locally; each has a fixed 60-second test bound.
A scoped strict TypeScript check of the new test and its imported dependencies
passes with a 1 GiB heap bound; it does not replace the integrated repository check.

```sh
node --test packages/protocol/test/revote-property.test.ts
```

Source bindings:

| File | Git blob |
|---|---|
| New `packages/protocol/test/revote-property.test.ts` | `2815bd3447995c2e7672e83fb2d0d7cc08d46668` |
| Unchanged `packages/protocol/src/ballotlog.ts` | `82387b2e8fe7ea6b5693485613acbdb3052b6f26` |
| Unchanged `packages/protocol/test/helpers/sim.ts` | `4a48651dfeff147c5ffbf7a12ba34bcccb53b213` |

This implements the bounded, TS-only allowance in inventory T4. The existing
Python adapter exposes envelope and full-election verification, but no standalone
ballot-log selection operation for this generated corpus. No new adapter or
full-election bundle pipeline was added.

[QV-07-REQ-025](../07-threat-model-security.md) separately calls for at least
10,000 histories across implementations. That broader acceptance remains open.
These tests make no new claim about server admission, Python parity, final
snapshot witnesses, freshness, tally decryption or complete-election verdicts.
No production source, signature policy, protocol encoding or vector changed, and
no production defect was observed in this bounded corpus.
