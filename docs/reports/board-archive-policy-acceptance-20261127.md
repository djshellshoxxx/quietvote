# Archive framing and existing-policy acceptance — 2026-11-27

Baseline: [PR #79](https://github.com/djshellshoxxx/quietvote/pull/79), commit
`f7e055d839a369f27a1be2c7a2653340a74a4862`. This report records a shared archive
reader correction and two bounded acceptance tasks from the
[board/verifier inventory](inventory-20261111/board-verifiers.tasks.md).

## Strict archive text framing

Review of the new offline archive adapter found that the shared strict tar and
checksum readers used a fatal UTF-8 decoder with its default BOM handling.
That handling removed a leading byte-order marker before the existing filename
or checksum-line grammar could reject it. A member named `\ufeffelection.json`
therefore appeared under a different name, and a malformed BOM-prefixed
`SHA256SUMS` line was normalized into an accepted one.

Two cases in [archive-framing.test.ts](../../packages/board/test/archive-framing.test.ts)
first failed with missing expected exceptions. Each includes an ordinary valid
control. The correction sets `ignoreBOM: true` on the existing fatal decoders in
the strict tar and checksum readers. Despite the option's name, this preserves
the character in decoded text, allowing the existing grammar to reject it.
The permissive tar reader, writer, limits, checksum algorithm and trust policy
are unchanged. The helpers still return in-memory entries without extraction.

The unchanged regressions then passed **2/2** on Node 24.22.3 in 0.206 seconds.
The adjacent server import checks and actual HTTP archive/JSON parity case
passed **10/10**, without skips, in 15.584 seconds. These are separate runs;
the composed board suite is recorded in [R29](../audits/CONTINUATION_R29_20261127.md).
The two failing-first assertions are retained in the local evidence log.

## Zero-witness disclosure characterization — task 6

The new case in [negative.test.ts](../../packages/server/test/negative.test.ts)
uses a real four-voter server election that has completed its ceremony and
opened with `witness_quorum: 0`. It establishes the actual current behavior:

| Surface | Asserted behavior |
| --- | --- |
| Signed manifest | Quorum is zero; no `none_acknowledged` field is present |
| State HTTP response | Phase is OPEN, `witnessed` is false, required/have are both zero |
| Full-board JSON export | Export witness policy has quorum zero and derived `noneAcknowledged: true` |
| Existing board verifier | Emits `NOT WITNESSED`; reports zero witnesses and `latest: false` |
| Caller policy with acknowledgement false | Reports `QV_BOARD_GRAMMAR` mentioning the missing acknowledgement |

This test passed **1/1**, without skips, in 1.639 seconds. It intentionally
supplies no author resolver and makes no full-verification claim. It does not
invent or enforce a new signed acknowledgement field. The inventory's explicit
acknowledgement contract remains unresolved; the derived flag is documented,
not represented as evidence of an organizer's explicit action.

## Python signature R policy — task 8

Two additions to
[test_audit_regressions.py](../../verifier-py/tests/test_audit_regressions.py)
exercise the existing strict signature policy using synthetic keys. One checks
identity R with a scalar that satisfies the bare verification equation, plus a
valid prime-subgroup R control. The other checks both a noncanonical y-coordinate
alias and a zero-x encoding with the sign bit set, recalculating the challenge
for each byte string. Each must be rejected by the existing verifier.

The new cases passed **2/2** in 0.020 seconds. The existing mixed-order case
passed **1/1** in 0.021 seconds; the existing Ed25519 primitive tests passed
**2/2** in 0.047 seconds. These five distinct checks run with Python 3.12.14's
standard-library test runner in isolated mode. The implementation, frozen
vectors and policy remain unchanged. This is regression evidence, not a new
signature-policy decision, independent cryptographic review or timing assurance.

## Scope

The archive framing correction is production code; both policy additions are
tests of existing behavior. None changes witness defaults, author authority,
report verdicts, canonical signed-record rules, retention scheduling, release
signatures or finality. Current-source hosted/native qualification remains a
separate gate.
