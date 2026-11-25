# Final remote snapshot — refresh after PR #66

Captured **2026-11-18 09:00:15 UTC–09:01:17 UTC** on 18 November 2026. The requested filename date `20261117` is retained. The prior 08:46 snapshot and original #60 failure receipt are preserved in final-remote-snapshot-before-pr66-20261117.json (retained intermediate snapshot).

**Publication boundary:** this snapshot precedes root's final-report publication on #59. The observed #59 head is still `4113625422e8e6b23dc7f9ed137cedcfb4b3a39f`. It cannot record its own future publication commit or infer that commit's checks.

## Inventory and formal reviews

**68 live branches; 66 PRs: 12 open, 8 merged, 46 closed without merging.** #57 is **ready for formal review**; the other **11 open PRs are drafts**. Every open PR returns **zero formal review submissions**.

- Main remains `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Canonical integration remains `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`.
- All original 60 branch heads remain unchanged. Eight branches were added for #59–66; none were deleted.
- #57's head is unchanged at `fd23cb3a481328a2b6315ae34cc2ee589b31aead`. Ready-for-review status does not supply an approval.
- #65 and #66 target #60's branch, `codex/quietvote-lazy-integrity-20261117`, at `754c586aa65735d50514b543a62a5e3c96a4d138`.

## Exact-head checks

| PR | State | Exact head SHA | Available check/run evidence |
|---|---|---|---|
| [#27](https://github.com/djshellshoxxx/quietvote/pull/27) | Draft | `2aaf0a01816afb256a804c23dd45de86eca2a993` | **Failure**, CI [42938522724](https://github.com/djshellshoxxx/quietvote/actions/runs/42938522724); 12 successful checks and 1 failed check. |
| [#43](https://github.com/djshellshoxxx/quietvote/pull/43) | Draft | `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` | **Success**, all 14 checks; CI [44230866630](https://github.com/djshellshoxxx/quietvote/actions/runs/44230866630). |
| [#57](https://github.com/djshellshoxxx/quietvote/pull/57) | **Ready for review** | `fd23cb3a481328a2b6315ae34cc2ee589b31aead` | **Success**, all 14 checks; CI [44249688596](https://github.com/djshellshoxxx/quietvote/actions/runs/44249688596). |
| [#58](https://github.com/djshellshoxxx/quietvote/pull/58) | Draft | `9a03414e0e826db292f9dd5728e4d3d2f0682784` | **Success**, all 13 checks; CI [44244964260](https://github.com/djshellshoxxx/quietvote/actions/runs/44244964260). |
| [#59](https://github.com/djshellshoxxx/quietvote/pull/59) | Draft | `4113625422e8e6b23dc7f9ed137cedcfb4b3a39f` | **Claims lint success only**, [44261828235](https://github.com/djshellshoxxx/quietvote/actions/runs/44261828235); 2 checks, no full CI returned. |
| [#60](https://github.com/djshellshoxxx/quietvote/pull/60) | Draft | `754c586aa65735d50514b543a62a5e3c96a4d138` | **3 failed Windows jobs; matrix unfinished**, [44263515558](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558). |
| [#61](https://github.com/djshellshoxxx/quietvote/pull/61) | Draft | `04171611e8c8d836ede49c30f0c6f0acc9d0da05` | **Unfinished**, CI [44263619713](https://github.com/djshellshoxxx/quietvote/actions/runs/44263619713); 2 CI jobs pass, 2 run, 7 queue; claims lint passes. |
| [#62](https://github.com/djshellshoxxx/quietvote/pull/62) | Draft | `6875cd36c65427dbc0b877b356727a396b7f9581` | **Queued**, CI [44265471409](https://github.com/djshellshoxxx/quietvote/actions/runs/44265471409); visual and claims also queued. |
| [#63](https://github.com/djshellshoxxx/quietvote/pull/63) | Draft | `0042967a76ef871d01f3726d1ff9331293e9a255` | **Queued**, CI [44265671528](https://github.com/djshellshoxxx/quietvote/actions/runs/44265671528); claims also queued. |
| [#64](https://github.com/djshellshoxxx/quietvote/pull/64) | Draft | `4b88209afb5a6c8fba1df06e0af8d1c1ac21d15f` | **Queued**, CI [44267702258](https://github.com/djshellshoxxx/quietvote/actions/runs/44267702258); visual and claims also queued. |
| [#65](https://github.com/djshellshoxxx/quietvote/pull/65) | Draft | `0653163a3cee2b230398a572723a028c0dda6d7d` | **Queued**, CI [44268847279](https://github.com/djshellshoxxx/quietvote/actions/runs/44268847279); visual and claims also queued. |
| [#66](https://github.com/djshellshoxxx/quietvote/pull/66) | Draft | `ae17bd0c2a33427a77b2d71673ed55787c463c6c` | **Queued**, full CI [44271792772](https://github.com/djshellshoxxx/quietvote/actions/runs/44271792772); 27 matrix jobs, visual and claims queued. |

The API reports #27 as non-mergeable and the remaining PRs as mergeable. Neither flag nor green checks establishes required human/security-group approval. No available checks/workflows were returned for the current main SHA; this is not a historical “never tested” claim.

### Branch refs

| PR | Head branch | Base branch |
|---|---|---|
| #27 | `claude/laughing-volta-61srfa` | `claude/clever-gates-uqd5p1` |
| #43 | `integration/quietvote-completion` | `main` |
| #57 | `claude/clever-gates-uqd5p1` | `integration/quietvote-completion` |
| #58 | `claude/sharp-archimedes-tu76rh` | `integration/quietvote-completion` |
| #59 | `codex/quietvote-current-audit-20261117` | `integration/quietvote-completion` |
| #60 | `codex/quietvote-lazy-integrity-20261117` | `integration/quietvote-completion` |
| #61 | `codex/quietvote-python-tie-validation-20261117` | `integration/quietvote-completion` |
| #62 | `codex/quietvote-board-policy-anchor-20261117` | `integration/quietvote-completion` |
| #63 | `codex/quietvote-python-decrypter-validation-20261117` | `integration/quietvote-completion` |
| #64 | `codex/quietvote-marker-equivocation-20261117` | `integration/quietvote-completion` |
| #65 | `codex/quietvote-revote-copy-20261117` | `codex/quietvote-lazy-integrity-20261117` |
| #66 | `codex/quietvote-web-checks-20261117` | `codex/quietvote-lazy-integrity-20261117` |

For #27, PR metadata retains base SHA `761da0a45c538aa2232ee5511eb84e3fc1ca4e21` while the live named base branch points to `fd23cb3a481328a2b6315ae34cc2ee589b31aead`; the JSON keeps both.

## #60: three real Windows failures

Full run **[44263515558](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558)** at head `754c586aa65735d50514b543a62a5e3c96a4d138` has **27 jobs: 11 success, 3 failure, 2 running, 11 queued**. Run-level status remains `queued` with null conclusion; the completed failures must remain explicit.

| Failed job | Observed result | Preserved log |
|---|---|---|
| **134662337870**, server + web, Node 22 Windows | Server: 272 pass / 15 fail / 7 skip. Web: 337 pass / 1 fail. | [Original Node 22 log](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558/job/134662337870) |
| **134662337901**, server + web, Node 24 Windows | Same suite totals; server recovery/process assertions and web malformed-file-path failure persist. | [Node 24 log](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558/job/134662337901) |
| **134662337730**, CLI + board, Node 22 Windows | CLI: 109 pass / 1 fail / 3 skip. Board: 78 pass / 0 fail. `all-clients-executable.test.ts:241` receives process exit code null, expected 0. | [CLI/board log](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558/job/134662337730) |

Both server/web logs contain `packages/web/test/no-bearer.test.ts:19` attempting `D:\\D:\\a\\quietvote\\quietvote\\packages\\web\\src\\api\\types.ts`. Separate server failures concern process exit, HTTP e2e and recovery/outbox assertions. No baseline Windows reproduction or attribution to W15 was performed by this inventory.

The following same-head evidence remains successful:

- Production browser journeys, CSP and automated a11y: **job 134662337368**.
- Vectors, Python verifier and production build: **job 134662336848**.
- Typecheck and supply-chain gates: **job 134662337560**.
- Pseudo-locale visual workflow: **run 44263502603**.
- Claims-lint workflow: **run 44263502711**.

Earlier smaller CI **44263502704** has 11 **cancelled** jobs. It is separate from these three failed jobs.

## #66: requested Windows evidence is pending

#66 is a test-only source-path and app-encoding QA repair at `ae17bd0c2a33427a77b2d71673ed55787c463c6c`. Its **`ci:full-matrix` label is observed**.

Full run **[44271792772](https://github.com/djshellshoxxx/quietvote/actions/runs/44271792772)** has **27 queued jobs**, including production browser/CSP/a11y job **134689992602**. Pseudo-locale run **44271713642** and claims run **44271713706** are also queued. Earlier smaller CI **44271713635** has 11 **cancelled** jobs; cancellation is not failure.

No Windows success is inferred from local Linux focused tests. The separate Windows server/runtime failures remain open qualification issues.

## Existing #27 failure and limits

Historical run **[42938522724](https://github.com/djshellshoxxx/quietvote/actions/runs/42938522724)**, job **130254443170**, remains failed at cross-verifier comparison: **24/27 report agreement, 27/27 verdict agreement**, exit 1. Its [failure excerpt](https://github.com/djshellshoxxx/quietvote/actions/runs/42938522724/job/130254443170) is retained.

The JSON includes all 68 branch SHAs, all PR-number groups, fresh reviews, exact-head checks, workflow/job IDs, timestamps and conclusions. Check/workflow collections use `per_page=100`; every returned length equals `total_count`, and all returned SHA fields match the queried head. Legacy commit-status arrays are empty; Actions checks provide the CI evidence.

The prior main-protection read returned **HTTP 403, Resource not accessible by integration**. Accessible rulesets `[]` and branch metadata do not establish absence of protection; complete enforcement requirements remain unverified.

Read-only remote/source work; scratch evidence only. No approvals, merge actions, source edits or branch deletion. Pending jobs may change after this timestamp.


## Publication note

The [structured snapshot](consolidation-remote-snapshot-20261117.json) retains exact heads, all branch names, checks and observation times. Bare log names identify execution evidence outside this repository; hosted job links remain the public source. This snapshot precedes the current report publication, so its observed #59 head is an earlier documentation checkpoint. The publishing commit and PR description identify the final report revision.
