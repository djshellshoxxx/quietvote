# QuietVote consolidation publication receipt — 2026-11-17

The reviewed candidate is merged into `integration/quietvote-completion`.
The initial **49 open PRs are reduced to 2**: [#43](https://github.com/djshellshoxxx/quietvote/pull/43)
is the cumulative draft against main, and [#27](https://github.com/djshellshoxxx/quietvote/pull/27)
retains the concrete recovery work. This is prototype integration; the
[full review](consolidation-review-20261117.md) records the remaining core and qualification gaps.

## Published source and integration

| Item | Exact reference |
|---|---|
| Qualified candidate / PR | `8686e625270826bc0776596a1bbaf434832f4afd` / [#56](https://github.com/djshellshoxxx/quietvote/pull/56) |
| Candidate tree | `f8e11e87605b7155b5cd4d7fe31a7e3f0f71c7d7` |
| Equivalent local candidate | `2af439963267ecbd8e7a5272d882a3647e98a07c` |
| Canonical merge | `38192a5498a7b6fdc612c8e6c240a8596626d579` |
| Exact-head main CI | [Run 44227868083](https://github.com/djshellshoxxx/quietvote/actions/runs/44227868083), **11/11 jobs passed** |
| Earlier baseline merge | `44f73ca8c52511d8587d8381ef7a5c589c4626af` / #54 |
| Main | `019f4e789be2ff38a5fb2d348c3b225cc87cf296`; not merged |

The merge tree is byte-identical to the qualified candidate tree. The published
checkpoint preserves the original remote parents. The original local repair,
review and merge history is available in the [documented source archive](../provenance/README.md).

This receipt and the accompanying status/provenance corrections form a
documentation-only follow-up: README and docs paths change; application,
verifier, test, dependency and workflow paths remain identical to the qualified
candidate. The hosted results below identify that candidate explicitly rather
than attributing its run to the later documentation commit.

## Verification on the published candidate

Both Node versions ran the same package counts, with zero failures or skips:

| Workspace | Node 22 | Node 24 |
|---|---:|---:|
| Board | 78 | 78 |
| CLI | 113 | 113 |
| Crypto | 93 | 93 |
| Protocol | 370 | 370 |
| Server | 294 | 294 |
| Trustee | 113 | 113 |
| Verifier | 38 | 38 |
| Web | 326 | 326 |
| **Total per Node version** | **1,425** | **1,425** |

The required hosted browser job passed production journeys, CSP checks, 26 verifier
checks and 49 automated accessibility checks. Automated checks do not supply
manual assistive-technology or cross-platform acceptance.

Python units passed **221/221**; CLI vectors passed **420/420** with no unrun files;
the Python corpus passed **282/282** with no unsupported cases within that corpus.
The strict shared report comparator agreed on **27/27**. Its excluded capabilities
remain `chk.board.append_only`, `chk.board.witness` and `chk.receipts.sample`;
this is not universal conformance.

Typecheck, production build, dependency boundaries, lockfile checks and tooling
gates passed. The existing size budgets were preserved, and npm audit reported
zero vulnerabilities. The PR's separate blocking documentation links and
traceability checks also passed.

The nonblocking claims-lint workflow had reported **19 wording findings in 11
files** on the candidate. The documentation follow-up corrects source/agent-review
wording and returns **zero findings**, with the same 45 rules. No linter rule or
acceptance gate was relaxed.

## PR and branch reconciliation

- **45 PRs closed as superseded or obsolete**, each with a checked exact head,
  disposition note, canonical continuation link and preserved historical description.
- Of those, **43 exact source heads are contained in the candidate ancestry**,
  including #31's preserved historical plan. **#2 and #21** are obsolete
  documentation and were closed without importing their stale text.
- **#47 and #54** were already merged during baseline consolidation; **#56** is
  the new reviewed consolidation merge.
- **#43 and #27** are the only open PRs after cleanup.
- All **59 original source branches** are retained. **55 original tips** are exact
  ancestors of the candidate; the other four are one patch-equivalent source,
  two obsolete documentation tips and the partially recovered #27 source.

The [machine-readable publication receipt](consolidation-publication-20261117.json)
records every closure and CI job. The [inventory](consolidation-inventory-20261117.json)
preserves the original discovery classifications and final dispositions.

## Remaining recovery and qualification

The /56 rate bucket and keyless receipt repairs are included. Default invitation
expiry/retention, signed requests and request-log privacy were already covered by
newer history. The [PR27 residual review](consolidation-pr27-residuals-20261117.md)
specifies additive rollback/export migrations, complete signing-path gating,
durable export acknowledgement/deletion behavior and legacy-compatible control
reason admission.

The prepared **W15** port is archived at `e421221` and excluded from active code.
It emits **204,814** compressed JavaScript bytes against the unchanged strict
`<204,800` test, requiring at least **15 bytes** reduction. Fourteen focused tests
pass; the size test fails. Two reproduced preload hangs were fixed during review.
Its authored browser tampering cases have not passed; the current candidate's
browser result does not qualify that excluded port. See the
[port receipt](consolidation-w15-residual-20261117.md) and
[separate source review](consolidation-w15-security-review-20261117.md).

The main review retains D-99 pinned-roll enrollment, approved CP-02/DKG nonce work,
governed manifest/ratification, proposals, group membership/recovery, disputes/
finality, remaining verifier/control semantics and external operational/security/
accessibility acceptance as unfinished work.

The first hosted merge `44f73ca` lacks a DCO sign-off. The published candidate
`8686e62` and runtime merge `38192a5` have sign-offs matching their publisher
author; readback verified them. The inherited contribution-provenance gaps remain
recorded. History was not rewritten and no retrospective attestations were added.
