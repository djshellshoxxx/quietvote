# Fresh functional continuation — R10

Date: November 20, 2026. Reviewer: `bug_hunt_r10`.
This follows the completed [R9 functional handoff](independent-tally-bugs-r9-20261120.md)
and [tally-draft implementation receipt](cli-tally-draft-20261120.md).

**Three independent normal-workflow cases passed through six actual offline
CLI process invocations. No new functional defect was confirmed in this scope.**
No production or permanent test file was changed; this report is the only
contribution.

## Exact source and isolation

| Item | Identity |
| --- | --- |
| Reviewed and executed composition | `4df1e3289e1bb1387e5f2f2ec66897c53043c8b5` |
| Composition tree | `5563f02ea96b4f11ff89ead2a276f4d46b7f7f69` |
| Production/test implementation represented | `c123608e0fb1d523d6a3bc442111b18448a6661e` |
| Isolated branch | `codex/qv-bugs-r10-20261120` |
| Local runtime | Linux, Node 24.22.3 |

The worktree started from the exact composition above. External dependencies
were linked from the existing installation without changing the lockfile or
running installation scripts. Each `@quietvote` workspace alias instead points
to the package inside the isolated worktree. `import.meta.resolve` confirmed
local paths for CLI, protocol, board, crypto and server; execution therefore
does not depend on a changing coordinator checkout through workspace symlinks.

The diagnosing-bugs workflow was applied to discriminating assertions on the
ordinary user flow. No newly observed failure required causal minimization or
a production patch. The original source-only witness finding was already
corrected before this review; no vulnerable-source reproduction was attempted.

## Independently executed normal flow

A separate stdin-driven Node harness constructed two ordinary three-voter
elections using the existing `World` helper, fixed distinct R10 seeds,
three trustees, threshold two, and fresh local HTTP connections. The organizer
was explicitly the first coordinator to stay within the preparer's unchanged
manifest-author policy. The manifests used the proper log origin binding.

Both fixtures ran the actual server ceremony, opening, three valid votes,
closing and two trustee-share submissions. The proposed body came from
`qv online election-tally-draft`; the archive came from the normal public
export endpoint. The proposed totals were not substituted in a mock response.
Every offline comparison used the shipped CLI executable through `spawnQv`.

For the one-witness fixture, legitimate setup, open, final-ballot and close
checkpoints were cosigned. The close checkpoint was witnessed **before** the
two later public trustee-share entries. This supplies the required closed
phase coverage while leaving the latest tree head without quorum, allowing
the report's phase-versus-latest-head distinction to be checked normally.

| Declared quorum | CLI option | JSON and text result | Exit | Observed qualification |
| --- | --- | --- | --- | --- |
| One | Default | `MATCH` | 0 | Required board/witness/time checks pass; the caveat that the latest tree head lacks witness quorum remains visible in both formats. |
| Zero | Default | `INCOMPLETE` | 3 | Body matches and append-only checks pass; witness status remains `not_run`, with the zero-quorum caveat. |
| Zero | `--content-only` | `MATCH` | 0 | The same body and archive match under the explicit content-only choice; content-only and unwitnessed qualifications remain visible. |

All three cases also checked the following:

- JSON reports `scope: "tally-draft"`, a body match, `published: false` and
  `freshnessVerified: false`; result rules equal the proposed body's results,
  and the counted total is three.
- Both output formats identify the exact independent manifest pin, SHA-256 of
  the canonical proposed body, origin, tree size and tree root. Text contains
  every warning and caveat present in JSON and explicitly retains the
  publication/freshness limit.
- Archive and proposal bytes remain identical before and after both commands.
  The live server remains in `TALLYING`; checking does not publish a tally.

The entire separate harness completed in **10.97 seconds**. These are three
case assertions and six executable invocations, not six distinct test suites.
They overlap the author's acceptance concepts and must not be added to the
author's 459-test total as a unique coverage count. The author's complete
protocol/verifier suites, root typecheck and three committed CLI acceptance
tests were not repeated here.

Report validation checked 2,375 Markdown links across 379 files with none
broken. Public-claims lint reported zero findings across 358 files and 45
unchanged rules; whitespace checking passed.

## Hosted backup-source qualification

The hosted observation during this review remains separate from the local
tally implementation. Backup checkpoint
`547ea2d402f265c38e0d6d24c66f1c20bf3580ae` has tree
`68c3b990f6511982d075d54af9c466ed9eb2f44f`.

At the observed snapshot of [CI run 44771157652](https://github.com/djshellshoxxx/quietvote/actions/runs/44771157652),
the first-page result contained all 27 jobs: 25 queued, one in progress and
one successful. The successful [macOS 15 / Node 24 protocol-and-verifier job](https://github.com/djshellshoxxx/quietvote/actions/runs/44771157652/job/136408877175)
executed Node 24.22.3. Its logs reported:

| Workspace | Passed | Failed | Skipped | Cancelled |
| --- | --- | --- | --- | --- |
| Protocol | 403 | 0 | 0 | 0 |
| Verifier | 38 | 0 | 0 | 0 |

The logged checkout was synthetic PR merge
`529f6bfc27d365b572b7a7ebf03697ce26baacc9`. The reviewer fetched that exact object
and inspected its parents: main
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` and backup checkpoint `547ea2d`.
Its tree is exactly `68c3b990f6511982d075d54af9c466ed9eb2f44f`, and an explicit
tree comparison against the backup checkpoint returned no differences.
These successful native results therefore qualify the backup tree only;
they do not execute or qualify the new tally-draft source.

[Visual workflow 44771157685](https://github.com/djshellshoxxx/quietvote/actions/runs/44771157685)
was reported successful by workflow metadata; its individual logs were not
independently inspected here. [Claims workflow 44771157737](https://github.com/djshellshoxxx/quietvote/actions/runs/44771157737)
remained queued. The top-level CI metadata also still said queued despite the
individual job progress, so this receipt records the returned job states
explicitly. This is one time-bound observation, not an all-green claim or a
prediction of later results. No workflow was rerun or repeatedly polled.

## Next functional handoff

The remaining automatic receipt-checking gap is narrower than absence of a
receipt verifier. The existing [offline command](../../packages/cli/src/cmd-receipt.ts)
already distinguishes a signed promise from inclusion using externally supplied
log key, origin and leaf hash. The current
[`online election-submit`](../../packages/cli/src/cmd-online.ts) relays the
packet through the general JSON request path without integrating that check.

The next ordinary acceptance should use a real server `AppendResult` envelope
and the exact bytes submitted by the CLI. QV-09's REST receipt uses a nested
`promise` and base64url leaf/signature fields, whereas the board library's
standalone receipt JSON has flat promise fields and standard base64. The
existing [browser receipt adapter](../../packages/web/src/flow/receipt.ts)
documents that mapping. A standalone `receiptToJson` fixture alone would not
qualify the actual CLI/API adapter.

After the source/contract review chooses the bounded interface, distinguish
an ordinary included append from a valid promise-only response, preserve
unknown submission outcomes and exact-packet retry semantics, and require
caller-provided trust anchors. A receipt result must retain its exclusion of
witness quorum, freshness, election result and ballot-counting claims.
No receipt implementation, new authority or protocol policy was added here.

No blocked background-runtime investigation, old untracked test, native browser
retry, exploit probe or vulnerability reproduction was read or resumed. This
worker made no external publication or message. Formal appointed review,
native ACL, historical DCO, provenance and release gates remain separate.
