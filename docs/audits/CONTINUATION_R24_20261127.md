# R24 — independently pinned offline ballot status

Date: November 27, 2026 (America/Vancouver).

This is AI-assisted implementation and engineering review. QuietVote remains
unaudited and not for real elections.

## Baseline and plan

Baseline: PR #74 head `60e8f1790c129b9a1d19e5f16cf50e99cafcf241`, tree
`42b0f2cc1fdbfdf1417a416504e40b074fe12b5b`. Main remains the specification tree.
A fresh [branch inventory](BRANCH_INVENTORY.md) found 69 of 76 remote branch tips
preserved in this candidate, with seven retained historical/superseded branches.

The accepted next task is offline ballot lookup, task 4 of the
[CLI inventory](../reports/inventory-20261111/trustee-cli.tasks.md), within T-167.
The implementation plan was:

1. Require an independent manifest pin and bounded complete public archive.
2. Verify ballot, tally and board evidence before issuing any counting status.
3. Prove supersession through the same-voter predecessor chain.
4. Preserve caveats and refuse unsupported control effects.
5. Test real signed synthetic elections, failure cases and bounded mutations;
   obtain independent review, then publish with source-specific evidence.

The command adds no network requests, secret handling, file writes, dependencies,
cryptographic constructions or protocol encodings. A separate command module and
its dedicated acceptance suite account for the change size above the usual
400-line guideline; shared edits are only dispatch and an additive archive result.

## Independent review and corrections

The source reviewer reproduced two defects in the initial unpublished candidate:

- Phase witness checks can pass without a witnessed final tally checkpoint. The
  correction requires the pinned manifest's quorum on the exact origin/size/root.
- An authenticated invalidation can coexist with a mathematical protocol PASS,
  with its limitation recorded only in caveats. The correction preserves caveats
  and returns incomplete for unsupported outcome-affecting controls, without
  inventing terminal semantics.

The archive preparer exposes its already authenticated checkpoints and notices.
Human caveats are JSON-quoted. No voter list, selections or raw finding details are
printed. Status is scoped to one snapshot; freshness and finality remain unchecked.

The corrected independent source review found no remaining blocking scoped issue.
The reviewer separately executed the actual command for a fully witnessed tally,
missing final witness quorum and a fully witnessed invalidation: respectively
COUNTED/exit 0, UNVERIFIED/exit 3 and UNVERIFIED/exit 3, with unchanged input bytes.
These are engineering reviews, not appointed security-reviewer approval.

## Verified source identities

| File | Git blob |
| --- | --- |
| `cmd-ballot-status.ts` | `89c6f0cdcab7f54f9f0982e4b15f4a99e3f4932c` |
| `cmd-prepare.ts` | `d2d24bf2c3aafd4a84f35ea26ac22e2ca3b11744` |
| `main.ts` | `41a4f409fec1ddb5b142de508185f6ea2970a2a8` |
| `ballot-status.test.ts` | `7976a6a0f7f0a4fd1a64c382b385b77e6c062b98` |

## Validation

Independent acceptance run on Linux/Node 24.22.3: **23 passed, zero failures,
skips or cancellations**, 30.981 seconds. This includes 16 deterministic payload
mutation samples inside one test, not 16 additional tests. Fixtures use actual
DKG, signed envelopes, tally proofs, signed board entries and witness cosignatures.
Full TypeScript compilation and 132-file vendored integrity verification passed.

Acceptance covers counted/multi-hop superseded/spoiled/excluded/absent outcomes,
real executable and unchanged files, premature counted arrays, bad signed tallies,
missing/final/zero witness evidence, seven authenticated control actions,
security-notice preservation, wrong chains, quota, late casts, invalid signatures,
wrong/malformed pins and bounded malformed/nonregular inputs.

The combined ballot-status, archive-preparation, tally and receipt regression run
passed **29 tests**, with zero failures, skips or cancellations (32.008 seconds).
The ballot-status acceptance suite also passed **23 tests** on Node 22.18.0
(43.587 seconds). Root typecheck, dependency boundaries (the two documented
inherited D97 edges remain), documentation links, requirement references and
claims lint passed. The full CLI suite is still running its real-clock election
journey; its result and publication readback are recorded after completion.
Earlier hosted passes are not assigned to this new source.

A `detect-secrets` 1.5.0 scan of the nine ballot-status changed files found zero
findings. The synthetic private-key-header positive control was detected when
scanned by a relative path from its working directory. Credential verification
was disabled; no production credential was used. The final twelve-file scan,
including the Windows observation, produced two reviewed inherited matches in
`registration-review.test.ts`: the public Base64url alphabet and a literal
synthetic server-private canary. Both lines are unchanged from the parent;
there are no unreviewed matches or added credentials. The positive control also
passed for this final scan.

## Bounded Windows observation

The baseline Windows failure still has no demonstrated production root cause.
A separate test-only change wraps the existing asynchronous enrollment fixture
on Windows and emits exactly four fields: fixed phase (`voter-key` or `invite`),
monotonic elapsed milliseconds, heartbeat sample count, and the largest callback
gap, including the unsampled terminal gap. It observes the fixture call, not a
particular native startup stage. It never inspects paths, file contents, operation
results/errors or native output. An unavailable diagnostic sink cannot replace
the original operation result/error. Production helpers, deadlines, retries,
concurrency and enrollment assertions are unchanged.

| File | Git blob |
| --- | --- |
| `registration-review.test.ts` | `9687636963bbb7841e23eb9db8f44cfb252f3b85` |
| `native-fixture-observation.ts` | `173b73eb69e86677b44e336a0a49b8e9a4c59000` |
| `native-fixture-observation.test.ts` | `e3b56e81b6ac8dd5b5e8c97b473d9c5d5f2681b0` |

Independent source review found no blocking issue in this observation scope.
The eight observer tests and eight unchanged registration cases passed on
Linux/Node 24.22.3: **16 passed**, zero failures, skips or cancellations, 8.14
seconds. Full-root typecheck also passed. This is instrumentation for the next
native CI run, not evidence that the Windows timeout is repaired.

## Remaining gates

The baseline [CI run](https://github.com/djshellshoxxx/quietvote/actions/runs/45987725942)
has 26 successful jobs and one unchanged Windows/Node 24 server enrollment failure
at `UNAVAILABLE/TIMEOUT/service`. All six CLI and all six trustee cells passed.
The synthetic merge `d735efae5cba5604a7b0f008b9fb54fc29ec0681` has the baseline
head's identical tree. This does not explain or repair the startup timeout.

Main promotion retains the formal review and provenance gates. Durable checkpoint
custody, native startup and ACL qualification, governance, signed freshness,
worker integrity, release review and human/native accessibility evidence remain
in [UNFINISHED_WORK](UNFINISHED_WORK.md). This command does not certify a release.
