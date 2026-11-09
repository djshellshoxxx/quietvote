# Branch disposition and integration review — 2026-11-09

This is an AI-assisted source and ancestry review, not independent security approval.
It records the upstream baseline before the 2026-11-09 implementation work. Later
commits must have their own verification receipts; these CI results do not transfer
to descendants.

## Exact scope

- Repository: `djshellshoxxx/quietvote`.
- Default branch: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Selected cumulative implementation baseline, PR #28:
  `51851c10c5ac33cd89f05f9e0af44fd43b41b930`.
- PR #27 source reviewed: `250e7fa191195cd8e1dd3e2573778db2968b91f7`.
- PR #29 audit-only tip: `934357fd21a4a9e667e253fe00e0c0acab556560`.
- PR #29 was integrated without altering its history by local signed merge
  `a4f3384`; this is not a merge to remote `main`.
- All remote-tracking branch tips below were examined locally; GitHub PR metadata,
  review submissions, review threads and exact-head PR workflow runs were read on
  2026-11-09. Local source comparisons are complete, unlike the older GitHub
  compare endpoint's 300-file cap.

## Cumulative chain

`left / right` means commits exclusive to the first / second ref, from
`git rev-list --left-right --count FIRST...SECOND`. Changed paths are from
`git diff --name-only FIRST SECOND`, without the API file cap.

| From | To | Exclusive commits | Changed paths |
|---|---|---:|---:|
| main `019f4e7` | #22 `aae414e` | 0 / 203 | 659 |
| #22 `aae414e` | #25 `a222037` | 0 / 2 | 3 |
| #25 `a222037` | #26 `761da0a` | 0 / 9 | 21 |
| #26 `761da0a` | #27 `250e7fa` | 0 / 24 | 60 |
| #27 `250e7fa` | #28 `51851c1` | 0 / 2 | 2 |
| #24 `06e0898` | #27 `250e7fa` | 0 / 81 | 276 |

Use #28 as one cumulative source history. Separate merges of #22, #25, #26,
#27 and #28 would repeat already-contained work. #24 and every older
implementation/security branch tip are ancestors of #28. Ancestry proves
historical inclusion; the source review below separately checks notable reversions
and retained gates.

## Every remote branch

Counts below are **baseline-only / branch-only** relative to `51851c10`.
The symbolic `origin/HEAD` is excluded. No branch deletion or PR closure is implied.

| Branch on origin | Full tip | Exclusive commits | Disposition |
|---|---|---:|---|
| `chatgpt/quietvote-ci-action-pin-guard-20261104` | `51851c10c5ac33cd89f05f9e0af44fd43b41b930` | 0 / 0 | Selected cumulative implementation baseline (#28) |
| `chatgpt/quietvote-trustee-fixture-paths-20261102` | `a222037328e3aceed1b8c177002b5dc4652e3339` | 35 / 0 | Ancestor; retain history, no separate merge needed |
| `chatgpt/quietvote-visual-ci-repair-20261102` | `980a5cd72c9b05bc8ce28a588376462ce85f8206` | 84 / 1 | Superseded by signed #24; identical tree, preserve branch |
| `chatgpt/quietvote-visual-ci-signed-20261102` | `06e089895d94dd1710afd5113fec2a01a235e979` | 83 / 0 | Ancestor; retain history, no separate merge needed |
| `checkpoint/quietvote-ordinary-ux-20261024` | `1b531b8f83eea607de07da847c4044c861964056` | 84 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/clever-gates-uqd5p1` | `761da0a45c538aa2232ee5511eb84e3fc1ca4e21` | 26 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/dazzling-cerf-n8ha3g` | `d75d4a20c6b92c35ddfcbcdaeb4a1dbf1b7fba1d` | 206 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/docs-screenshots` | `e671fd1d9d19127ded0e0ea85e16d97d9d1bff2d` | 240 / 1 | Do not merge obsolete no-UI/spec-ID text; selective reconciliation already recorded |
| `claude/laughing-volta-61srfa` | `250e7fa191195cd8e1dd3e2573778db2968b91f7` | 2 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-audit-board-cli-1` | `8770aae07e5bb3897e2e64c2bbe14bf01ecc200c` | 154 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-audit-crypto-protocol-1` | `55aff9ad1efab30c00eb145a46de3c2daabd6c26` | 151 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-audit-qa-1` | `563eec8659184e32771244088d59acc5035fa798` | 157 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-audit-server-1` | `6b3208551acdfa45313d85b67a9f4adf3e3f25a8` | 151 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-audit-trustee-1` | `f0973a12b7bcdb81918679079bc3726c66b14c4c` | 152 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-audit-web-verifier-1` | `e1421698626a4defd744a50ed2f9337066793d6e` | 153 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-board-cli-1` | `c69473f242c9848847c3e899016c562e51a325e4` | 176 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-ci-gates-1` | `57ba6cd779e7621603cd36179887379e942b5e63` | 157 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-cli-spoil-collect-1` | `709729a5763c99940d075c3bc8e53b40b2fd95fb` | 153 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-complete-1` | `fdc552aa0fb769116b25223e7d6e75dd70adc913` | 164 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-docs-1` | `5341f6f66d237e0bba6a6d68efcc11ace5c8ac6c` | 197 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-finish-1` | `e56403b6b30f5d438b2f5f04e7fd5b76e8626c6b` | 171 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-spoil-wiring-1` | `fe8b75e8cf4c3fbdef92500bc80130074c980da2` | 143 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-trustee-hardening-1` | `f0423305cb4571b584a7b9454ed774d006663613` | 151 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-ui-locale-a11y-sltfb3` | `424110d90e23dc443aa4498a4340973d3c8cb8b6` | 128 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quietvote-web-triage-1` | `e9d4cd3416371c2c825ee855c5f84f39c4a53b2d` | 150 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/quirky-curie-n5pxf5` | `019f4e789be2ff38a5fb2d348c3b225cc87cf296` | 240 / 0 | Ancestor; retain history, no separate merge needed |
| `claude/sharp-archimedes-tu76rh` | `2a02bd3249f3c988ef5afd8e9559fa13a959bdef` | 124 / 0 | Ancestor; retain history, no separate merge needed |
| `codex/quietvote-consolidation-audit-20261104` | `934357fd21a4a9e667e253fe00e0c0acab556560` | 240 / 1 | Unique audit documentation; integrated locally at a4f3384 |
| `codex/quietvote-milestone-20261109` | `d45238dbeb7e98f07b9241cd1786d188c3b5cadf` | 0 / 2 | New work branch observed during this review; descendant, not a pre-existing source branch |
| `docs/readme-and-wiki` | `29313c369aeda4f1ab2503ca3437c5bd22025a09` | 241 / 1 | Do not merge obsolete docs/wiki snapshot; current wiki retained |
| `integration/quietvote-consolidated-20261030` | `aae414e6f303d277cf1c5f79d7e2a34c47c45f42` | 37 / 0 | Ancestor; retain history, no separate merge needed |
| `main` | `019f4e789be2ff38a5fb2d348c3b225cc87cf296` | 240 / 0 | Ancestor; retain history, no separate merge needed |

The unsigned/superseded YAML repair `980a5cd` and signed repair `06e0898`
have exactly the same tree: `b39c3cf25df1fb795ee56f320a64d0c3d40803d4`.
The former's unique commit therefore adds no source change to the selected baseline.
The `e671fd1` documentation says there is no runnable UI and no `16-*` spec; both
statements are obsolete in the implementation candidate. `29313c3` adds an older
`docs/wiki/` map. Their useful documentation intent was selectively reconciled in
[CONSOLIDATION](../plan/CONSOLIDATION.md); neither branch should overwrite the
current README, spec index or `wiki/`.

## GitHub state at the inspected heads

All of #22, #24, #25, #26, #27, #28 and #29 were open, draft, unmerged and
reported mergeable. Mergeability is not approval. The actual PR bases are:

| PR | Base | Head |
|---|---|---|
| #22 | `main` | `integration/quietvote-consolidated-20261030` |
| #24 | `checkpoint/quietvote-ordinary-ux-20261024` | `chatgpt/quietvote-visual-ci-signed-20261102` |
| #25 | `integration/quietvote-consolidated-20261030` | `chatgpt/quietvote-trustee-fixture-paths-20261102` |
| #26 | `integration/quietvote-consolidated-20261030` | `claude/clever-gates-uqd5p1` |
| #27 | `claude/clever-gates-uqd5p1` | `claude/laughing-volta-61srfa` |
| #28 | `claude/laughing-volta-61srfa` | `chatgpt/quietvote-ci-action-pin-guard-20261104` |
| #29 | `main` | `codex/quietvote-consolidation-audit-20261104` |

Review and inline-thread lists for #22, #26, #27, #28 and #29 were empty.
No security/code-owner approval was observed. `.github/CODEOWNERS` remains a
placeholder with only `@djshellshoxxx`; the approval requirements in
[QV-30 sections 9–10](../30-engineering-standards.md) are not established by an
empty review list or a green test job. Repository branch-protection settings were
not inspected by this review.

| Head | Workflow | Result | Evidence |
|---|---|---|---|
| #27 `250e7fa` | ci | Failure only at strict verifier comparison; all eight Linux Node 22/24 test shards, typecheck/supply-chain and browser jobs passed | [41806030218](https://github.com/djshellshoxxx/quietvote/actions/runs/41806030218) |
| #27 `250e7fa` | pseudo-locale visual | Success | [41806030324](https://github.com/djshellshoxxx/quietvote/actions/runs/41806030324) |
| #27 `250e7fa` | claims lint | Workflow success; lint is explicitly non-blocking | [41806030356](https://github.com/djshellshoxxx/quietvote/actions/runs/41806030356) |
| #28 `51851c1` | ci | Failure only at strict verifier comparison; all eight Linux Node 22/24 test shards, typecheck/supply-chain and browser jobs passed | [41876093966](https://github.com/djshellshoxxx/quietvote/actions/runs/41876093966) |
| #28 `51851c1` | claims lint | Workflow success; lint is explicitly non-blocking | [41876094101](https://github.com/djshellshoxxx/quietvote/actions/runs/41876094101) |

The #28 conformance job `126735772986` passed Python unit tests, TS vectors,
Python vectors, production build, scoped i18n and the licence snapshot before
failing `Compare verifiers within shared capabilities`. Its log reports:

- Detailed reports: 24/27 agree; three disagree (`count-altered`,
  `manifest-signature-removed`, `result-flipped`). Verdicts: 27/27 agree.
- Board append-only, witness and receipt checks are excluded capabilities,
  explicitly **not agreement**.
- Python vector sweep: total 282, pass 229, fail 0, not implemented 53.

No macOS/Windows job is present in these two exact-head runs. The workflow
restricts ordinary PRs to Linux unless labeled `ci:full-matrix`; main, merge
queue, nightly and manual runs select all three OSes. That policy does not supply
current macOS/Windows evidence for the trustee fixture repairs. The returned
workflow API is limited to the first page of PR-triggered runs; this review does
not claim to exhaust all push, manual or scheduled runs.

## Source review and blocking integration issues at #28

1. **Review and CI gates remain unmet.** #27's stale PR body says crypto/protocol
   changes are not yet applicable, but its final diff includes the `spoilDecVerify`
   identity-key rejection (`1447d6a`) and TS/Python report-semantics changes
   (`e858b9e`), plus crypto mutation tests. These require the applicable reviews;
   owner approval is not independent review. Exact-head conformance also fails as
   recorded above. Updating a PR description cannot substitute for those gates.
2. **B3-01 registration remains a real code mismatch.** At the inspected source,
   `packages/web/src/flow/onboarding.ts:128` hashes the invite and signs the
   invite-bound message; `packages/server/src/app.ts:546` still implements the
   older raw-token contract. ADR-028 records an owner decision, while the older
   hold and later PR descriptions disagree about authorization. This review does
   not resolve that policy conflict or change registration bytes. A documented
   approval decision and real client/server journey remain necessary before
   calling the milestone unblocked.
3. **Report status gaps remain.** `packages/protocol/src/verify.ts:133` can produce
   PASS when board evidence is absent, and `packages/verifier/src/verify.ts:130`
   catches board-layer failures separately. P1/TSV-04/TSV-05 require the planned
   fail-closed completion and regression evidence. The three strict report
   disagreements must be fixed without excluding extra fields or weakening
   negative vector expectations. The recorded ADR-027 defaults and later D-92–94
   proposals disagree; no silent policy choice is made here.
4. **B2-02 is only partially isolated.** #27 moves protocol proof verification to
   a worker with a timeout, but `packages/server/src/imports.ts` still parses
   `election.json` on the main thread before the worker (line 233) and calls
   synchronous `verifyLog` (line 298). The narrow worker test does not establish
   an end-to-end import CPU bound. This is a remaining issue, not evidence that
   the worker itself fails.
5. **Historical gate successes must be qualified.** `claims-lint.yml` retains
   `continue-on-error: true`, so workflow success does not prove zero findings.
   #28 fixes dash-prefixed `uses:` references, but its five regression tests are
   not invoked by `ci.yml` at the inspected baseline. The checker is a line regex,
   not a complete YAML parser; source-shape bypass coverage requires separate
   review and should not be described as complete action-reference validation.

Retained restrictions confirmed by the #26→#27 net diff:

- No committed `test-vectors/` file or nonce-label registry changed.
- The blob-worker verifier experiment was reverted by `45dfb43`; #27 leaves no
  net change to the standalone verifier build/entry paths. B3-26 is explicitly
  reopened, rather than claimed fixed through a CSP relaxation.
- The strict comparison command remains blocking and runs last in conformance;
  its failing cases have not been excluded from the comparison.
- Locale catalog additions remain drafts; this review found no change marking a
  translation reviewed. Native translation and assistive-technology acceptance
  remain external gates.
- The web spoil-share view verifies public signed records and does not introduce
  browser-held trustee secret shares. This source observation is not a completed
  cryptographic review of that flow.

## Reproduction and limits

Ancestry and source inspection used `git for-each-ref`, `git rev-list --left-right
--count`, `git diff --name-only`, `git diff` and
`git rev-parse COMMIT^{tree}`. GitHub metadata/review/job queries were read-only.
This report does not claim fresh local package tests, release readiness, external
security approval, WCAG qualification or native translation approval. Preserve
all source branches and evidence until the applicable integration gates pass.
