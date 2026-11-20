# R19 independent ordinary checkpoint and consistency verification

Date: 2026-11-20. Worker: `bug_hunt_r19`. This fresh functional review follows
the completed [independent R18 set](../audits/CONTINUATION_R18_INDEPENDENT_20261120.md).
It supplies ordinary conformance execution and a current hosted-status receipt;
it does not supply formal security approval or native custody qualification.

## Source identity and isolation

The isolated worktree started at `76143eb84ac3be9033f745c020686f873112d68d`,
complete tree `06b67b275c2164ff14676bbe151894c1cd4d9da6`. The worker read the R18
handoff and report, contribution rules, and the relevant board/pin source and
tests. No local `AGENTS.md` or `CONTEXT.md` was found. The diagnosing-bugs skill
was used to keep observed failures separate from unsupported causal claims.

Root's shared-verifier repair `561fb1ff4b625c2911b64e1d08dd1f9f2ed91c7b` was
applied as worker commit `bc91c4481f2878430652b29c5d5292aad84114d5`. Both have
complete tree `fce62a6f6a008d78eb410c81848554bc4a989ff7`. The worker inspected the
actual change before execution: the zero-prefix branch preserves the existing
empty-path and canonical old-root checks and now also requires equal roots when
the second size is zero. Existing positive-size branches and input guards are
unchanged. Root owns this production change.

Only external dependencies are shared. Actual Node resolution of
`@quietvote/board` and `@quietvote/crypto` pointed into this worker's checkout;
the root checkout's workspace packages were not executed in their place.
Runtime was Linux, Node 24.22.3.

## Independent test extension and execution

Test commit `7e38b8cd0a33cbe3a273727d63c256a5fb88a625`, complete tree
`ed54349fa4c63cfb16d9c08723723bb4e64dad81`, changes only the existing all-pairs
case in [merkle.test.ts](../../packages/board/test/merkle.test.ts):

- It retains every one of the 20,100 positive-size pairs previously exercised.
- It adds 201 legitimate empty-prefix pairs: 0 to 0 and 0 to every size 1 through
  200, for 20,301 total consistency comparisons.
- All previous positive-size recursive reference comparisons and verification
  assertions remain effective. Each new zero-prefix pair additionally asserts
  that the generated path is exactly empty; the recursive reference function is
  not called with an unsupported zero prefix.

The worker executed the following command after applying the production repair.
The executed test bytes are exactly those subsequently committed above.

```sh
node --test --test-reporter=spec --test-name-pattern='empty root is SHA-256|consistency proofs for all|^review:' packages/board/test/merkle.test.ts packages/cli/test/checkpoint-pin-review.test.ts
```

**Observed result: six groups passed, zero failures, zero skips; 1,012.832655 ms.**

| Selected group | Evidence |
| --- | --- |
| Empty-root known answer | The empty root equals the fixed SHA-256 empty-string vector. |
| All 0 <= m <= n <= 200 | All 20,301 ordinary consistency comparisons passed, including the 201 new zero-prefix pairs and existing reference comparisons. |
| Retained Node Buffer | Modifying the returned unchanged proposal leaves the retained input bytes intact. |
| Valid empty pin and growth | Empty initial/idempotent handling and the real empty proof for growth to size two pass. |
| Multi-level retained pins | Ordinary 1-to-3-to-7 growth passes with real multi-hash paths and retained prior snapshots. |
| Original signed-note bytes | An equal head retains the original note and its generated witness line exactly. |

The final four groups are the existing independent R18
[pin review tests](../../packages/cli/test/checkpoint-pin-review.test.ts), rerun
against the newly changed shared board verifier. They are composition evidence,
not four newly authored R19 groups. The 20,301 comparisons are iterations inside
one test, not 20,301 separately reported test groups. No malformed-root case,
vulnerability reproduction, native probe or broad unchanged suite was executed.
These positive tests establish supported ordinary behavior; source reviewers own
the explicit rejection-rule review. Full integrated TypeScript checking remains
the coordinator's separate gate.

## Windows diagnostic run remains pending

The [R18 bug report](independent-checkpoint-bugs-r18-20261120.md) preserves the
actual R17 Windows failure logs and their exact source identity. This R19 worker
read that report rather than claiming to have newly reproduced or independently
downloaded those historical failed logs. The native deadline's underlying delay
remains unresolved. No timeout, concurrency, retry, owner/DACL check, assertion
or native implementation was modified by this worker.

This worker independently queried [scheduled R18 CI 44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714).
At the final pre-report observation, four jobs were in progress and 23 queued;
none had a final job conclusion. In particular:

| Windows server job | Actual observed state |
| --- | --- |
| [Node 22, 136629081428](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714/job/136629081428) | Workspace tests in progress. Checkout, Node setup, dependency installation and pinned-vendor verification completed successfully. |
| [Node 24, 136629081415](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714/job/136629081415) | Queued. |

The [R18 visual workflow 44835016638](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016638)
had completed successfully. Claims and aggregate CI remained pending. None of
these status observations qualifies the later local R19 board repair.

Independent Git-data readback confirms synthetic merge
`c76c7665092f9e4287e2c44819d4f82a31ef59ce` has parents main
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` and scheduled R18
`5485deb10d24ca0e64628746e954676a60919c50`, with complete tree
`c3e04b91ff324addde7551a777f4a93c8906e817`. The eventual Windows logs must still
establish what those runners checked out and their final outcomes. A running job
and an available synthetic merge are not a completed native test receipt.

## Fresh-worker handoff

Read the eventual Windows results before expanding diagnostics. If the deadline
failure recurs, record the finite voter-key/invite phase supplied by the existing
wrapper, then distinguish the internal service handshake from the subsequent
write only if the new evidence still needs that distinction. Preserve the
15-second deadline, protection checks, teardown and no-retry behavior. If the
run is superseded, cancelled status supplies no pass or root-cause conclusion;
qualify a subsequent exact source instead.

The Linux environment does not provide a native Windows feedback loop, so the
diagnosing-bugs skill's local native reproduction phase cannot be completed here.
No unsupported causal theory or simulated native success substitutes for it.
The coordinator was told that the Node 22 diagnostic test job was already
running before another publication could supersede it.

The [storage draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md) continues
to require native ACL/namespace custody, origin-scoped key association, stable
cross-process locking, newest-state proof revalidation, mandatory file and
directory durability and explicit ambiguous-commit recovery. This test change
does not connect stateful storage or establish freshness, authority or witness
policy. No stopped investigation, browser launch or disallowed network path was
used. The test and report commits carry Codex author identity, matching DCO and
requirement references; original branches and main are unchanged.

Refs: QV-18-REQ-002, QV-18-REQ-026.
