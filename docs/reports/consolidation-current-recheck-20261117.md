# QuietVote current branch and audit reconciliation — 2026-11-17

This record is an AI-assisted engineering recheck, not an external security audit, formal approving review, or production/election qualification. The date in this title uses the session's Pacific date; source discovery occurred on November 18 UTC. No deployment or release is authorized by this record.

## Exact source baseline

| Reference | Exact SHA | Current disposition |
|---|---|---|
| `main` | `019f4e789be2ff38a5fb2d348c3b225cc87cf296` | Unchanged; final integration requires reviews |
| Canonical `integration/quietvote-completion`, PR #43 | `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` | 502 commits ahead of main; zero behind |
| Nonce hardening, PR #57 | `fd23cb3a481328a2b6315ae34cc2ee589b31aead` | Source-reviewed and tested; required approvals absent |
| Historical audit handoff, PR #58 | `9a03414e0e826db292f9dd5728e4d3d2f0682784` | Useful historical evidence; author DCO missing |
| Historical recovery, PR #27 | `2aaf0a01816afb256a804c23dd45de86eca2a993` | Selective ports only; do not merge wholesale |

## All original branches and pull requests accounted for

The [machine-readable branch matrix](consolidation-current-branches-20261117.json) covers all **60 branches** found at the initial live snapshot, all **58 historical PRs**, exact SHAs, main/canonical ahead-behind counts, ancestry, patch equivalence and source-specific dispositions. There were four open PRs, eight merged PRs and 46 closed without merging. No tags were found. Branches created by this execution are additional to this initial inventory and will be recorded in the completion section.

Fifty-four current branch tips are exact ancestors of canonical integration. The six noncontained tips are:

| Source | PR | Ahead / behind canonical | Disposition |
|---|---:|---:|---|
| `claude/clever-gates-uqd5p1` | 57 | 4 / 0 | Review-gated nonce repair; also contains QV-ADR-029 and a test-only HTTP fix |
| `claude/sharp-archimedes-tu76rh` | 58 | 1 / 0 | Historical audit evidence; preserve provenance and resolve DCO |
| `claude/laughing-volta-61srfa` | 27 | 9 / 264 | Five unique patches include residual recovery; selectively port current contracts |
| `chatgpt/quietvote-visual-ci-repair-20261102` | 23 | 1 / 346 | Patch-equivalent signed replacement already integrated; trees match |
| `claude/docs-screenshots` | 21 | 1 / 502 | Obsolete documentation; preserve closed PR/source |
| `docs/readme-and-wiki` | 2 | 1 / 503 | Obsolete documentation; current wiki supersedes it |

The maximum integration sequence is: review and provenance gates for #57/#58; compatible narrow #27 recovery ports; combined verification; canonical #43 review and main integration. The reviewed source inventory does not justify remerging old branches or closing the residual #27 checklist.

## Current findings, with historical evidence preserved

The [current finding matrix](consolidation-current-findings-20261117.json) accounts for **all 72 exact identifiers** in PR #58's extract: 22 crypto/verifier entries, 18 server/board/trustee entries, and 32 web entries. Each row distinguishes current source inspection, executed regressions and unresolved scope. The original historical severity and confirmation records are retained. Accounting for a finding does not mean that it was fixed or that its original experiment was repeated.

The original 56-confirmed/16-pending counts concern `424110d90e23dc443aa4498a4340973d3c8cb8b6`. They are not counts of current vulnerabilities. The additional historical KNOWN catalogue has not been exhaustively reproduced in this execution; specific covered cases are identified in the source reviews, and no blanket closure is asserted.

Current, concrete residuals include the already-published control-record freshness issue, the runtime rollback anchor absent from ordinary startup, catalog-only public control reasons, further verifier validation parity, paused-state display, and incomplete governance workflows. Raw replacement of an election DB remains distinct from the protected offline-restore procedure, which already checks independently supplied public/private floors.

The [nonce review](consolidation-nonce-review-20261117.md) records a synthetic comparison of canonical and #57 source. The known failed-randomness issue remains on canonical and is repaired in the reviewed #57 candidate. Verification equations and wire schemas are unchanged in that delta. No private test keys or reproduction scripts are included here.

The [web recheck](consolidation-web-recheck-20261117.md) covers each B3 finding. It identifies 27 repaired historical mechanisms and five partially repaired mechanisms, with 55 selected current tests passing. Static dependency integrity is distinguished from the separate lazy-module/worker coverage limits. Browser cases inspected in that review were not rerun there.

## Verification receipts available at this checkpoint

On exact PR #57 head `fd23cb3`: crypto 101/101, protocol 373/373, verifier 38/38, Python 222/222, TypeScript vectors 423/423, Python vectors 285/285, and strict shared report comparison 27/27 passed. The comparison explicitly excludes board append-only, witness and receipt-sample checks. The two vector runners count different things and their totals are not matching corpus sizes. Vector expectation comparison found no removed rows or changed acceptance/result expectations and three new nonce-registry rows.

Live hosted #57 checks were read: [main CI](https://github.com/djshellshoxxx/quietvote/actions/runs/44249688596), [visual checks](https://github.com/djshellshoxxx/quietvote/actions/runs/44249688608), and [claims/docs](https://github.com/djshellshoxxx/quietvote/actions/runs/44249688587) all passed. Main CI includes Node 22/24 Linux tests and the required browser journey job; it is not a current Windows/macOS qualification.

On canonical `72bccc6`, root typecheck, dependency-boundary checks, lockfile lint and traceability structure passed. Boundary checking retains two declared D-97 deviations; traceability reports coverage links, not full conformance. Selected server/trustee regression groups passed. An initial highly concurrent local run had process/timing failures; rerunning the two affected files serially passed 17/17 without source, timeout or assertion changes. The original failed result is not represented as a pass. Two additional synthetic local experiments rechecked the previously public control-replay and raw-DB-rollback mechanisms; these were observations of defects, not passing release gates.

## Exact approval and provenance blockers

`docs/30-engineering-standards.md` section 10 and QV-30-REQ-018 require two approvals, including a security reviewer, for cryptographic/protocol/vector changes. Both #43 and #57 had zero review submissions at discovery. #43 itself changes cryptographic/protocol code, so excluding #57 does not remove this gate. The code-owner and maintainer records remain placeholders. Source review by an implementation-independent agent does not supply a designated security-reviewer approval.

PR #58's sole commit has no author-matching `Signed-off-by:` trailer. `CONTRIBUTING.md` requires the DCO and states that reviewers must check it manually. This execution does not retroactively attest on its author's behalf, rewrite source history, or reauthor that historical evidence to conceal the gap.

The branch API reported `protected: false` for main and the branch collection. Rulesets returned an empty list; the dedicated protection endpoint returned 403 for the integration. These observations do not grant permission to bypass the written review rules or establish that the planned repository controls are configured.

## Core work and continuation order

1. Obtain the required independent review for the existing nonce candidate; preserve exact-head CI and vector evidence.
2. Qualify the recovered W15 lazy-module integrity port against the unchanged bundle limit and real browser tampering tests. It was previously excluded and is not covered by older canonical browser passes.
3. Repair specification-backed verifier validation differences; keep unratified numeric/schema bounds explicit.
4. Implement D-99 under QV-ADR-029, which is already recorded as accepted in `66b2cbe96ea6ce823a7f646662516b29a1170751` on #57. The runtime work is still absent; do not ask to reapprove that same decision.
5. Complete runtime rollback anchors, recorded export acknowledgement/deletion gates, and compatible control reason/freshness handling in additive migrations and coordinated verifiers.
6. Complete governed manifest/ratification binding, immutable proposals, group membership/recovery/revocation, disputes/remedies and finality.
7. Complete remaining platform, accessibility, protocol and operational qualification. Maintain the experimental prototype status throughout.

## Execution completion

This checkpoint precedes publication/qualification of the new implementation PRs. It is not a declaration that consolidation reached main or that all core functionality is finished. Final candidate SHAs, PRs and CI outcomes will be added after their verification.
