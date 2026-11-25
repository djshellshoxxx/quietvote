# Native private-file continuation and successor handoff

Date: November 19, 2026 (America/Los_Angeles).

Worker: `/root/security_audit_r1`, separate from the server and browser workers.
Starting source: `3f0ea6549e2fdf7ffa462de3a4978cd369655458` (PR #71).
Implementation: `3146f40d1de596296e9837943a79fab7e81b07a0`.

## Scope and outcome

This round inspected the existing Windows private-file bridge and its hosted
failures, repaired request and process lifecycle defects, and retained the
existing native permission/identity checks. The C#/PowerShell helper, its ACL
policy, file-size limits, per-operation 15-second deadline, CI matrix and
production dependency set are unchanged. These are engineering repairs and
local transport checks; final-source native Windows qualification remains open.

### Independent operations after a native refusal

The reusable native service terminates on an operation refusal. Previously,
concurrent JavaScript callers acquired that same service before their turns to
send. An expected exclusive-write collision could consequently fail an unrelated
queued read or save. The native trustee jobs below reported that neither of two
concurrent backups succeeded, although the contract requires exactly one winner.

The bridge now queues service acquisition together with operation execution.
After a refusal, an operation that has not been issued acquires a fresh helper.
An already issued operation is never replayed, including a write whose
publication status might be uncertain. The helper still terminates on refusal;
no error is converted into success and no ACL check is relaxed.

The new transport regression submits two exclusive writes and a read. It
requires the first bytes to survive, the second write to report `EEXIST`, the read
to succeed through a fresh helper, and exactly two write attempts. On the
unchanged baseline, the read was also rejected. The repaired bridge passes it.

### Process completion and directory lifetime

Previously `close()` returned after the protocol acknowledgement and a kill
request. It did not wait for the child process to finish. The Windows relative
path fixture then failed to remove its directory with `EBUSY`/`EPERM`.

The bridge now waits for the child's `close` event, with a bounded cleanup
refusal if termination does not complete. This is the event after process exit
and stdio closure described in the [Node child-process documentation](https://nodejs.org/api/child_process.html#event-close).
The new transport test deliberately separates acknowledgement from completion;
the baseline returned prematurely, while the repair waits.

Both synchronous and asynchronous helpers also use `SystemRoot` as their
working directory. Request paths remain absolute and are resolved from the
Node caller's working directory before dispatch. A persistent idle helper
therefore does not retain an operator's temporary directory merely because the
operator started an operation there. Windows prevents deleting another live
process's working directory; see Microsoft's [current-directory explanation](https://devblogs.microsoft.com/oldnewthing/20101109-00/?p=12323).
A transport check covers both dispatch forms, and an additional native test
requires immediate removal of a directory after a fresh reusable service starts
inside it. That native case is unexecuted on Linux.

### Unavailable-runtime fixture

The existing Windows keygen refusal fixture supplied a deliberately invalid
`SystemRoot` to a newly launched Node process. Both hosted Node versions exited
with status `134` instead of reaching the expected application refusal `4`.
The fixture now starts Node under its ordinary environment, imports the normal
CLI dispatcher, then changes the helper lookup inside that running process.
The same keygen command, refusal status, no-output and no-secret assertions
remain required. This fixture correction still needs native execution.

## Source-bound observations

All hosted observations below belong to the starting source, not the repair.
The [baseline full matrix](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481)
had completed before this round inspected its logs.

| Job | Observed result relevant to this scope |
| --- | --- |
| [Windows Node 22 CLI/board](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405197) | Unavailable-runtime fixture: `134 !== 4`; relative-path cleanup: `EBUSY`. |
| [Windows Node 24 CLI/board](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405574) | Same refusal fixture mismatch; relative-path cleanup: `EPERM`. |
| [Windows Node 22 trustee/crypto](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405383) | Concurrent-backup fixture: zero successes instead of exactly one. |
| [Windows Node 24 trustee/crypto](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405596) | Same concurrent-backup failure. |
| [Windows Node 24 server/web](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405498) | Shipped CLI enrollment fixture stopped at its first synchronous native private-file creation with `UNAVAILABLE`; duration 16,404.9585 ms. |

The server auditor separately inspected Node 22 server job `135596405544` and
reported the same first-write failure at 16,422.3178 ms. Those durations are
consistent with the 15-second helper deadline, but the sanitized log does not
establish the underlying cause. This round does not label the server failure
fixed or increase that deadline.

## Executed local verification

Environment: Linux, Node 24.22.3. Installation used the unchanged lockfile with
`npm ci --ignore-scripts --offline`, followed by `npm run vendor:install`.

| Check | Observed outcome |
| --- | --- |
| New lifecycle fixture against baseline bridge | Three tests executed; all three failed their distinguishing assertions. |
| Same lifecycle fixture against repaired bridge | 3/3 passed; zero skips or cancellations. |
| Focused normal-runner batch: CLI lifecycle, retained transport, CLI private files and trustee private files | 12/12 passed; zero failures, skips or cancellations. The two transport wrappers execute their separate internal cases; those overlapping cases are not added to the total. |
| Strict check of four explicit TypeScript roots | Passed using the unchanged root compiler options and a 256 MiB heap: both bridge copies, the new wrapper and the changed native CLI test. An ephemeral include list was removed afterward. This is a scoped check. |
| Dependency boundary check | Passed with the existing two documented protocol/board deviations unchanged. |
| Installed vendor integrity | Passed: two pinned packages, 132 verbatim files. |
| Native Windows test-file discovery on Linux | 13 cases skipped, zero executed native passes. |
| Whitespace/diff check | Passed. |

The first new wrapper attempt hit its 10-second nested-runner timeout while the
host reported load above 54. The direct distinguishing run and subsequent
unchanged wrapper both completed; the timeout is retained as an unsuccessful
environment attempt, not a source failure or a passing result.

Two whole-repository typecheck attempts, first with the default heap and then
with 512 MiB, were killed with exit `137`. Neither is a passing typecheck. No
compiler options, test timeouts or gates were weakened. The integration worker
must use actual current-source hosted typechecking for the complete repository.

## Fresh successor tasks and unchanged limits

1. Independently inspect the committed request queue, terminal refusal handling,
   child completion and fixture correction. Pay attention to error preservation
   when native termination itself fails; never introduce automatic write replay.
2. Run the normal Windows Node 22/24 jobs on the final published composition.
   Confirm the real concurrent-backup, directory-lifetime and keygen refusal
   cases. Linux transport simulation does not supply these native results.
3. Reassess the server registration fixture's first-write `UNAVAILABLE` against
   fresh native evidence. If it recurs, identify timeout, startup or helper
   failure directly before adjusting runtime policy or test scheduling.
4. Keep POSIX/macOS ACL overrides as an unresolved provider boundary. This round
   did not change `posix-staging.ts` and did not introduce a native ACL inspector.
   Mode/sticky checks and an ordinary macOS pass cannot establish protection
   against ACL grants beyond those bits. The preceding [source review](INDEPENDENT_TRUSTEE_PUBLICATION_SOURCE.md)
   and [unfinished-work ledger](UNFINISHED_WORK.md) retain this limit.
5. Preserve the distinction between agent engineering review, hosted execution,
   formal sensitive-change approvals and release evidence. This worker made no
   remote mutation, main merge, deployment, release or historical attestation.

Signed-off-by: Codex <codex@openai.com>
