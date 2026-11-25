# QuietVote continuation supplement and fresh-worker handoff

Date: November 19, 2026 (America/Los_Angeles).

This supplement continues PR #71 after its published `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab` checkpoint. It records distinct repairs, another completed CLI workflow and independent worker handoffs. It does not qualify unrelated source, adopt unresolved protocol contracts or supply the project's formal sensitive-change approvals.

## Consolidation with concurrent work

This session started at `3f0ea6549e2fdf7ffa462de3a4978cd369655458`. A concurrent authorized session published overlapping work as `8b7aa031` while our first code/bug/security workers were finishing. The branch movement was detected before any successful publication from this session. Our first composition was preserved locally, and this supplement was rebuilt directly on the published source with only distinct improvements.

In particular, the published export-command module and explicit retained-file acknowledgement, runtime eviction/drain implementation, clearing confirmation and stronger native child-close wait were preserved. Older parallel versions were not applied over those implementations.

The live branch inventory was rechecked: the 73-branch set had 66 tips contained in the original candidate, including the candidate itself. The seven outside tips retain the prior [inventory dispositions](BRANCH_INVENTORY.md): one patch-equivalent visual repair, selectively reconstructed historical recovery work and historical/conflicting documentation. All 72 original tips matched their captured values; none was moved or deleted by this continuation. These are preservation counts, not counts of separate features.

## Distinct implementation

| Area | Completed change | Detailed evidence |
| --- | --- | --- |
| Organization CLI | `org-create` registers a protected owner key through the adopted signed-request API, with explicit idempotency and optional private token file. `org-inspect` completes account inspection before the existing election workflow. | [Feature and author tests](../reports/cli-organization-enrollment-20261119.md), [fresh code review](../reports/independent-organization-code-review-r4-20261119.md), [security review](../reports/independent-org-cli-security-20261119.md), [independent boundary case](../reports/independent-organization-boundaries-r4-20261119.md). |
| Protected export commands | Download and acknowledgement unlock once across their two signed requests, then wipe the command-owned mutable seed buffer. | [Protected-key follow-up](../reports/recorded-export-key-lifetime-20261119.md). Existing retained-file recheck, bounds and no-retry behavior remain. |
| Runtime startup | Cache publication follows startup recovery; a recovery exception closes the opened runtime and allows a fresh later acquisition. | [Distinguishing failure and repair](../reports/pool-startup-cleanup-followup-20261119.md). The published capacity/eviction implementation remains. |
| Navigation | Redundant same-URL hash events do not rebuild newly filled controls. Retiring views invoke their cleanup callback, clearing detached password fields without locking the application-wide voter signer. | [Six distinguishing cases](../reports/navigation-lifecycle-follow-up-20261120.md). |
| POSIX cleanup | Protected directory ancestry is checked before cleanup, and the absolute path is captured before asynchronous work. | [Custody report](../reports/posix-cleanup-followup-20261119.md). This retains the documented effective-mode permission assumption. |
| Native diagnostics | Synchronous process failures distinguish explicit timeout, recognized launch failure, other process failure and selected invalid responses using finite labels. | [Diagnostics report](../reports/native-helper-diagnostics-20261119.md). Raw process data is discarded; native refusal codes, deadline, permission checks and no-retry behavior remain. |
| Verifier favicon | Generated standalone verifier HTML supplies a self-contained data icon under the existing CSP. | [Actual hosted failure and generated-HTML repair](../reports/independent-bug-hunt-r4-20261119.md). No browser assertion or CSP directive was relaxed. |

## Independent review and exact-source receipts

Separate code-audit, bug-hunt and security-audit workers completed their scopes and handed off to fresh workers. Reports distinguish author tests, later independent tests, source-only review and native qualification. The latest completed round reviewed the organization workflow and added a separate boundary test rather than manufacturing another production change.

| Reviewed source | Scope and observed result |
| --- | --- |
| `17a4a8c8b4cc4ac1b0343d881595401e21866f8b`, tree `f6f820130e92510b84b4282d4c5f9143aa63fc4c` | Independent code worker: **42/42** pool startup/capacity and four affected application suites. Independent security worker: **19/19** export/auth/private-file tests. [Code receipt](../reports/independent-code-review-r3-20261119.md), [security receipt](../reports/independent-security-followup-20261119.md). |
| `434b2b5458b5894b8e3a595e416c030421d79932`, tree `006b0302d998be1f86d1ae89d368a338be7a0352` | Fresh bug worker: **24/24** combined diagnostic/transport/lifecycle/publication tests. [Receipt](../reports/independent-bug-hunt-r4-20261119.md). |
| Favicon production delta integrated as `ecf51d5` | New generated-HTML assertion fails before repair; **4/4** complete build tests pass after repair, including byte-identical output. No native browser pass is assigned to this result. |
| `c9d59e3175bb876176de1a5edef76aadeed8fbd6`, tree `68a449a95a9118477429c8d0e25b64dc41ab1f56` | Organization author batch **11/11** with export/auth neighbors and strict scoped TypeScript. Independent code worker **5/5** organization/auth; independent security worker **3/3** selected token/input/response cases; independent bug worker **1/1** additional multibyte-limit, duplicate-owner and replay workflow. Linked reports above preserve each result. |

Counts overlap and must not be added as a unique-test total. The earlier web batch had 37/38 passes when an organizer wait exhausted its existing harness; an unchanged isolated rerun and later independent 42-case batch passed. The earlier failure is retained, and no cause is asserted or timeout enlarged.

An automatic content check stopped a second-round background-runtime investigation. The successor was restricted to source review of the already completed pool change. That uncompleted investigation and its untracked test were not resumed or integrated; no runtime evidence is claimed for that scope.

## Hosted evidence and remaining qualification

The [published-base matrix](https://github.com/djshellshoxxx/quietvote/actions/runs/44660024709) belongs to `8b7aa031`, before this supplement. Its browser checkout `53ea07da01e74fa0291e174643b5fefa293b398e` has the same complete tree. Type/supply-chain and vectors/Python/build jobs passed; Windows Node 24 CLI/board and trustee/crypto also passed. Documentation/claims and visual workflows passed. Other cells were still running or queued at this checkpoint.

That base's browser job failed the implicit favicon request and the split-origin voter-list wait. The favicon repair has distinguishing generated-output evidence. The newer navigation tests cover a relevant draft-to-ready, invite-removal and paired-event sequence, but the hosted log does not prove it was the exact failing mechanism. The unchanged browser journeys must execute on the new published source.

The older `3f0ea654` Windows registration fixture failed its first legitimate private write after approximately 16.4 seconds. The retained error proves absent/malformed helper output, not its cause. The diagnostic addition does not claim to repair that historical failure or enlarge its 15-second deadline. Current-source Windows Node 22/24 results remain required.

Local Chromium aborts before assertions with a denied socket operation. Earlier whole-root TypeScript attempts were killed with exit 137 under shared workspace contention; those outcomes remain incomplete. A fresh round-five worker subsequently passed the unchanged full-root TypeScript gate once on `f81d372b63f2b35f3acb48fb5daf3aa2598c1eef`, tree `fb4383d276104531ed4a22e1d7d92d97fdef074f`, with a 512 MiB compiler cap and no diagnostics. Vendor, dependency, lockfile, links and traceability checks passed. One report phrase was clarified without changing claims rules, after which claims lint reported zero findings. [Final integration receipt](../reports/final-integration-checks-r5-20261119.md).

The fresh round-five security worker also checked the exact `f81d372` source without new execution: all 14 selected production/native-script blobs matched the earlier reviewed checkpoints. The two Windows bridges retained blob `6e72bd8941939833354c3f73e24b30463bff5fc8`, and both native scripts retained published blob `12e703315de1fd0a5d7c8459f2ea18cc9fc55599`. There were no production changes after `c9d59e3`; subsequent additions were documentation and the separate organization boundary test. All 14 new local commits in that inspected range had literal author-matching sign-off trailers. This records current trailer text and source preservation, not historical provenance or formal approval.

## Successor work and promotion boundaries

Continue from the published composition and compare exact trees before reapplying any patch. Inspect actual current-head hosted failures, preserving assertions, timeouts and platform gates. The organization adapter's normal workflow, credential handling and boundary cases now have separate reviews; subsequent changes need their own receipts.

[UNFINISHED_WORK](UNFINISHED_WORK.md) is updated to distinguish these completed workflows from unresolved governance/ratification, membership, challenge/finality and authenticated-freshness contracts. Native ACL grants beyond the inspected POSIX mode/sticky policy, worker delivery integrity, signed display-zone schema and the crypto-provider contract conflict remain open, as do manual language/accessibility and external release evidence.

Main promotion still requires the repository's formal approvals, including an appointed security reviewer, and the historical DCO provenance decision. Agent audits do not satisfy those roles. This continuation performs no main merge, deployment, release, original-branch deletion or retrospective historical sign-off.
