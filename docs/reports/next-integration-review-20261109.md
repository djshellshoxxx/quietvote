# Next-phase review and provenance — 2026-11-09

Baseline `35b5d4d6161c5ea0cd99ec4746cb9a4bb11a3f6e`. These are scoped independent AI reviews, not external security approvals.
The full frozen-candidate result and publication identity are maintained on [PR #30](https://github.com/djshellshoxxx/quietvote/pull/30).
Reviewers did not edit author branches; authors addressed findings, then reviewers checked the repairs.

## Source provenance

| Slice | Author commit | Local integration commit |
|---|---|---|
| A: server availability/publication | `59f1bb081f49abf937d304f46d8a7d53e2f69bb5` | `75e1f24ae122c6e61c0d64b0327f83759d589a9e` |
| B: offline progress/cancellation | `90433a0d2eca4c674efbea74e2180b1e7ee9252f` | `4e3a532261d28c6f0f68d33c2c15289e157ab483` |
| C: backup rollback diagnostics | `b6561e51bb025285895f73e22cf8c5745512601e` | `c158ffcc0ee9351cabe8932250c1d4235ef6a401` |
| E: upload recovery | `7c881b678653f13a847f6df89c74196ee55c7930` | Same; browser-test follow-ups `166afb4b895f06a91e2da78e31b6c23cbaf26167`, `c7f490d2d0dbc9a0b79f6c46c15dbb5c4ee63a6a` |
| F: CI coverage/failure visibility | `0ae53718762b4a21508fda23913e8b06d251c957` | `4a2c73fe70288de0f068e0470650d94a0bdbe0ec` |

The only cherry-pick conflict was two independent append-only sections in `packages/web/NOTES.md`; both were preserved.
Production source blobs match the corresponding author changes. Local commits have matching author/DCO signoffs.
If publication uses the connector, remote commit identities differ: verify tree equality and the PR's mapping rather than claiming
local worker commit objects were pushed. No source branch merge, deletion, closure or approval is implied by this table.

## Independent findings and reruns

**A reviewer:** independently reproduced the baseline quota race (count 3 under cap 2) and registry visibility before replay failure.
Requested staged replay, atomic publication/audit, cleanup diagnostics, joined shutdown beyond the old cutoff, a positive board
equivalence control and authorized partial-upload disconnect coverage. All are in the reviewed commit. Independently ran the five
worker lifecycle/report-equivalence tests, zero skips, and inspected the raw 43/43 focused author receipt, typecheck and bounded
benchmark results. No remaining identified source blocker. Parsing/staging/replay, per-phase timeout and cleanup limits remain
explicit in [the server report](next-server-20261109.md).

**B reviewer:** found a default-API edge where a scheduling-shaped hostile getter exception could escape the default verifier;
the conditional opt-in rethrow and negative regression resolve it. Requested explicit positive/adversarial log-evidence tests.
Independently installed in a detached worktree; 40 focused protocol/log/report/build/UI tests passed with zero skips, typecheck and
build passed. Both candidate paths were compared against independently captured unchanged-baseline output: **66 byte-exact report
comparisons across 33 cases passed**. Strict comparison still exits 1 with identical 27-case differences arrays, three differing
reports and 17 fields. Required browser execution failed before assertions with Chromium socket EPERM. No remaining identified
source blocker; actual browser qualification remains necessary. See [offline report](next-offline-20261109.md).

**C reviewer (lead):** inspected source, new fault/CLI tests and existing fingerprint/identity-safe shred behavior. Independently ran
the 14 custody/CLI tests, all passed with zero skips. A second reviewer independently reran four new custody regressions and checked
secret-safe diagnostics, invalidation and recovery instructions. No blocker identified. Abrupt-kill publication/registration recovery
and Windows ACL acceptance remain unimplemented, not inferred from this handled-failure repair.

**E reviewer:** independently ran 19 spoil UI/flow tests, all passed with zero skips. Reviewed single-flight submission, input/route
revision guards and preservation of partly accepted input. Requested bounded POST waits and exact decoded-selection assertions in
the browser journey; both were added. A second reviewer found the keyboard retry could race an unfinished refresh; the journey now
waits for the submit control to exist and be enabled. Both follow-ups were rechecked. Required browser launch failed before assertions;
no local browser acceptance is claimed. No remaining source blocker identified in this slice.

**F reviewer:** independently installed and ran 19 script tests, zero skips; copied baseline workflows reproduced three failed
coverage assertions. Pins across all three workflows, 35 registry/8 workspace lockfile entries, Bash syntax and unchanged dependency
manifests were checked. Required mode rejects unavailable browser tooling. The fifth journey is integrated with the web slice.
No blocker identified. No self-approval by the CI author is used for these lines.

The CI author was reused for the final integration/qualification lens, while the separate server reviewer supplies the final
security/correctness lens. Their final integrated findings and exact-candidate receipts belong on PR #30 after the source is frozen.

## Approval reconciliation and boundaries

Two independent analysts agree that B3-26 permits optional cooperative progress/yield while keeping the closed offline policy.
They separately inspected ADR-027/028, the November 4 register, OPEN-DECISIONS, current handoffs and existing decision packets.
B3-01 and D-92–D-94 remain held under the current execution instruction because applicable approval records conflict. There is no
new evidence that historical approval was revoked and no new applicable resolution in PR #30's baseline comments/reviews.
The existing packets already contain the smallest useful decision request; they were not recreated or silently interpreted.

No comparator field/exclusion, expected vector, registration bytes, authority policy, crypto construction, passphrase/KDF rule,
dependency pin, offered translation or guarantee wording was changed to manufacture a pass. The verifier options change scheduling
and cancellation only; report-equivalence evidence includes both unchanged-baseline and default/cooperative comparisons.
Claims lint remains non-blocking in its workflow but actually fails with 20 individually classified contextual/historical findings.
Internal review and automated accessibility/browser checks are not external crypto/security, native translation or assistive-technology approval.
