# QuietVote continuation: rounds 6–8, November 20, 2026

## Delivered increment

The new `qv online backup-create` command completes the accepted signed admin
submission path for full and election-only server-local snapshots. Existing
`job-inspect` reads progress. The command validates scope, explicit idempotency,
bounded job metadata and requested election binding; it preserves protected-key
handling and unknown outcomes without automatic retries. The [implementation
receipt](../reports/cli-backup-jobs-20261120.md) and [operator guide](../../packages/cli/README.md#server-local-backup-jobs)
record its scope and the separate offline recovery procedure.

PR #72's original documentation commit
`9d3292bf945a283e7ec3b549a603692a902dc0c9` is preserved as an ancestor. Its three
historical report bodies remain byte-identical. Current introductions label
their `8f865fb` evidence historical rather than qualifying this new feature.

## Exact local sources and verification

Feature source: `ff61e15c59c4186158ee5407f521f73172cf38d0`, tree
`576779cb78a0486391ec79e1d1874435ad9bb59b`. Fresh R7 review composition:
`c7e32321c0a39aa24397401f5506f85bcd89d1f7`, tree
`8932dc23872ff92aa33e5836e902edc531aca8d4`.
The only later production/test changes are the two SPDX comment lines in
`10ea307`; executable statements and assertions are unchanged. Recovery guide
follow-up `e7fe059` changes documentation only. R8 reviewed composition
`6fc16da296d51d498ff154442a47437ea6cd8482`, tree
`0e6447bd9fdda917811383edb172994dcef75796`.

| Check | Actual result and scope |
| --- | --- |
| Dependency preparation | Existing lockfile installation and two pinned vendored packages succeeded. |
| Root TypeScript | `npm run typecheck` passed after the feature and tests were added. |
| New feature tests | Three passed, no failures/skips/cancellations; actual signed server flow, protected-key executable, both scopes, explicit replay and error/binding behavior. |
| Full CLI workspace | `npm test --workspace=@quietvote/cli`: 154 tests; 143 passed, 11 skipped, zero failures/cancellations; 763.6 seconds on Linux/Node 24.22.3. Includes the unchanged real-clock executable election with its actual ten-minute voting-close deadline. Skips are not execution evidence. |
| R7 independent compatibility | Eight actual-server-mapper/CLI cases plus help dispatch; separate report below. |
| R7 independent functional checks | Twelve normal cases including empty-instance backup, passphrase file, missing election, job inspection, one stdin read and early option refusal. |
| R8 fixture inventory | Three public JSON fixtures inspected for proposed tally-check acceptance; this is static inventory, not cryptographic qualification. |

These counts overlap and are not summed into a unique product-test total.
No native browser retry occurred. New source needs its own hosted checks;
the final publication commit/tree mapping and later outcomes belong to
[PR #71](https://github.com/djshellshoxxx/quietvote/pull/71) and its actual checks.

## Completed worker handoffs

Each set finished before the next fresh set began. Every worker used an isolated
checkout and committed only its report; supported fixes were integrated by the
coordinator.

| Round | Code | Functional bug hunt | Defensive security |
| --- | --- | --- | --- |
| R6 | [CI orchestration and consolidation](../reports/independent-ci-code-review-r6-20261120.md) | [Actual hosted source and backup gap](../reports/independent-bug-hunt-r6-20261120.md) | [Native delta and adapter constraints](../reports/independent-native-security-r6-20261120.md) |
| R7 | [Backup contract and compatibility](../reports/independent-backup-code-r7-20261120.md) | [Independent normal operator flows](../reports/independent-backup-bugs-r7-20261120.md) | [Request, key and recovery boundaries](../reports/independent-backup-security-r7-20261120.md) |
| R8 | [Final composition and next implementation](../reports/continuation-code-r8-20261120.md) | [Tally acceptance fixtures and cases](../reports/continuation-bugs-r8-20261120.md) | [Unsigned tally trust boundaries](../reports/continuation-security-r8-20261120.md) |

Closed R7 findings: same-administrator/24-hour idempotency qualification, required
SPDX comments and direct linkage to the complete recovery guide. The code and
security workers independently identified the same retry wording issue; it is
one shared correction. No new blocking runtime defect was confirmed in these
scopes. Security source reviews are not runtime tests or formal appointed review.

## Prior hosted qualification

Published predecessor `a5e5d19b6213dd4477b849deda7a3c837ea7fce0`, tree
`a5aa203ca47b10e0aa1fb63d3fc913933cc0e053`, passed all 27 jobs in
[CI 44762725138](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138),
plus claims and visual workflows. R6 fetched the actual logged synthetic merge
and confirmed an identical tree. Windows Node 24 CLI had 145 passes/6 skips;
server had 352 passes/7 skips; board 78 and web 441 all passed. All nine required
browser journey groups executed. This is one successful exact-source run, not
proof of the original native timeout cause or qualification of new code.

## Next concrete increment

Implement a read-only unsigned tally-draft comparison against an externally
pinned public archive, using the existing protocol verifier's recomputation.
R8 maps the required manifest/DKG/window/ballot/aggregate/proof/T_valid/rule/spoil
checks and suitable fixtures. Keep the candidate outside authenticated board
history; do not manufacture signatures or logged evidence. Preserve existing
full-verifier and trustee-release behavior. A scoped matching draft cannot
establish publication, currentness, challenge resolution or FINAL status.

Formal sensitive-change approvals, the appointed security reviewer, historical
and recent DCO provenance, native ACL limits and unresolved protocol contracts
remain separate promotion gates. Preserve main and original source branches.
Continue from live refs, reconcile concurrent work, and bind every later hosted
result to its actual tested tree. Keep the stopped investigation excluded.
