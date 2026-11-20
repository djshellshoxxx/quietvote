# R18 independent bug hunt: checkpoint proposals and Windows CI

Date: 2026-11-20. Worker: `bug_hunt_r18`. Scope: ordinary checkpoint transitions,
the exact R17 Windows CI failure, and the scheduled R18 diagnostic change.
This is an independent worker review, not a formal security approval.

## Source and execution boundary

The published R17 source is `995b31f804f5905f1df29f4f453ab3a404518dc0`, complete
tree `79f4fa63e9094b61b6c370de0f225455ff507fd4`. Root verified its equivalent
local source at `e31825ee9f79d44e66d966f4aed68b811bc7a24b`. This worker created
an isolated worktree there. Both `@quietvote/board` and `@quietvote/crypto`
resolve to the worktree's packages; only external dependencies are shared.

The Windows finding comes from actual hosted logs, not a Linux simulation.
No native Windows execution, vulnerability reproduction, intrusive probe, or
previously stopped investigation was performed. The available Linux environment
cannot qualify native Windows behavior. The diagnosing-bugs skill's local
reproduction phase is unavailable for this finding; source and the exact
existing failure logs establish only the conclusions below.

## Observed R17 hosted failure

All 27 job outcomes were read from [CI run 44815131888](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888).
Twenty-five succeeded. Both failed jobs reached the same test in
`registration-review.test.ts`: “review: shipped CLI enrollment rejects forged
success and sanitizes extra response data.”

| Job | Server result | Failing test duration | Web result |
| --- | --- | --- | --- |
| [Windows Node 22, 136561521896](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888/job/136561521896) | 351 passed, 1 failed, 7 skipped; 359 total | 17,068.1905 ms | 441 passed, 0 failed |
| [Windows Node 24, 136561521857](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888/job/136561521857) | 351 passed, 1 failed, 7 skipped; 359 total | 16,548.9774 ms | 441 passed, 0 failed |

Both logs explicitly checked out synthetic merge
`44df7ddd7e616d1774e4a5586ec40415f6518b4e`. Independently fetched Git-data confirms
its parents are main `019f4e789be2ff38a5fb2d348c3b225cc87cf296` and R17, and its
complete tree is the same `79f4fa63e9094b61b6c370de0f225455ff507fd4`.

The failure is `WindowsPrivateFileError`, code `UNAVAILABLE`, diagnostic
`undefined`, originating at `HeldStream.abort` and the `send` deadline callback.
The configured native response deadline is 15,000 ms. The stack identifies
deadline expiry; it does not identify why a reply did not arrive.

Node 22 used default test-file concurrency. Node 24 already passed
`--test-concurrency=2` to the server tests. These logs do not support calling
the failure fixed by applying the existing Node 24 cap again.

The separate [Windows Node 24 CLI/board job 136561521861](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888/job/136561521861)
passed 168 CLI tests with 6 platform skips (174 total), and all 78 board tests.
Its log includes successful native private-file and reusable-service cases.
Those results establish that the helper can run on that hosted platform; they
do not explain the server-job failure or qualify new source.

## Source localization and diagnostic correction

The two ordinary setup writes in
[registration-review.test.ts](../../packages/server/test/registration-review.test.ts)
await `writePrivateFixtureAsync` before invoking the CLI helper. On Windows,
[private-fixture.ts](../../packages/cli/test/private-fixture.ts) calls the shared
asynchronous native service. Although `qv` is an in-process helper,
[main.ts](../../packages/cli/src/main.ts) catches all command errors and returns
exit codes. The direct uncaught native exception therefore localizes this
failure to setup rather than an enrollment-result assertion.

In R17, [windows-private-files.ts](../../packages/cli/src/windows-private-files.ts)
gives synchronous process failures a finite diagnostic classification, but
asynchronous `HeldStream.abort` always creates a generic
`WindowsPrivateFileError()` and clears the pending request. This drops both
the timeout classification and whether the pending request was the initial
`service` handshake or a subsequent `write`. Neither existing failed log
contains an acknowledgement or stage marker that recovers that distinction.

The scheduled R18 publication `5485deb10d24ca0e64628746e954676a60919c50`, local
equivalent `c1f413ce14cf750199fea019d6c11948e1ed8f8b`, tree
`c3e04b91ff324addde7551a777f4a93c8906e817`, adds `abort('TIMEOUT')` for that
deadline and a test-only wrapper naming the `voter-key` or `invite` fixture.
This worker inspected the exact diff from R17:

- The CLI and trustee native changes are identical. Both resulting files have
  SHA-256 `9ad4ece0bdf65b59aa261898b900ef2e4cd5bd1697edc113fed252bf9d4b5caf`.
- The 15-second deadline, refusal code, teardown, no-retry behavior and native
  owner/DACL, identity, path and size checks remain unchanged.
- The wrapper catches only `WindowsPrivateFileError`, includes its bounded
  code/diagnostic and fixed fixture label, then throws. Other errors are
  rethrown. It contains no `assert.fail` and cannot swallow its own assertion.
- The added message contains no path, file contents, invite value or seed.
  Its `cause` is the already bounded native error.

This is a supported diagnostic improvement, not a demonstrated timeout
root-cause repair. It still cannot distinguish the service handshake from
the following write within a fixture. First inspect its actual Windows result
and fixture label before adding more instrumentation. Preserve all protection
checks and deadlines while gathering that evidence.

At this review's final observation, [scheduled R18 CI run 44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714)
had all 27 jobs queued. The Windows server jobs are `136629081415` (Node 24)
and `136629081428` (Node 22). No result from that run is claimed here.

Unresolved possibilities are helper startup/compilation missing the handshake
deadline, a later native write failing to finish within the deadline, or parent
response handling missing the timer. A fixed pending `service` versus `write`
classification would distinguish the first two; additional native evidence
would distinguish delayed native work from delayed response handling. The
existing logs justify no speculative timeout increase or skipped assertion.

## Independent ordinary checkpoint execution

The worker applied the scheduled diagnostic equivalent and root's minimal
checkpoint correction. Worker commit `012d5c42f2873388168cf01f45b778414b7f6a70`
has complete tree `e820a5b81fca362bf28a49b4916b1344ca193f41`, identical to root
`ba9f181b53ea2aa1fe7e12b1e2592e8065e44e90`. The helper now copies a retained
snapshot independently of its concrete byte-array subclass, requires the
defined empty root at size zero, and compares equal-size roots directly.

The worker authored and ran
[checkpoint-pin-review.test.ts](../../packages/cli/test/checkpoint-pin-review.test.ts)
with four groups:

1. A retained Node `Buffer` snapshot remains unchanged when the separately
   returned `UNCHANGED` proposal is modified.
2. A correctly signed empty head can be retained unchanged and grow to size two
   using the RFC's exact empty consistency path.
3. Successive sizes 1, 3 and 7 use actual multi-hash consistency paths and retain
   independently readable prior snapshots.
4. Equal signed roots preserve the exact original note with a genuine generated
   witness line. This tests byte retention, not witness-policy enforcement.

Command on Linux, Node 24.22.3:

```sh
node --test --test-reporter=spec packages/cli/test/checkpoint-pin-review.test.ts
```

Result: **4 passed, 0 failed, 0 skipped**, 346.457662 ms. The exact new test bytes
were subsequently committed as `2ac3d6dc53794a6d3676391570b54646ff68aa7b`, complete
tree `e7db62be8310e383c85d7e7473df74f4fc63c6a0`. `git diff --check` passed. These
are four independently authored ordinary groups, separate from the eight
R15–R17 author-designed groups. No production Windows operation or persistent
storage claim is tested here. Full integrated compilation remains root's gate.

## Fresh-worker handoff

Review the four ordinary cases against the final integrated tree, then inspect
exact Windows logs for the scheduled diagnostic source and any subsequent
source. Record the actual pending phase before choosing a repair. Do not
attribute a new run's result to an older source tree. No broad rerun is needed
solely to repeat this worker's four passing groups.

The checkpoint helper still proposes bytes only. Completing QV-18 REQ-026 needs
a supported custody provider with separate review, stable cross-process lock, newest
locked reread, atomic publication, mandatory durability barriers and crash
recovery described in the [R15 draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md).
Passing these pure tests supplies none of those storage guarantees.
