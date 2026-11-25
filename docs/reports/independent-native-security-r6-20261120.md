# Independent native-file security review R6

Date: 2026-11-20 UTC. Reviewer: `/root/security_audit_r6`, a fresh worker
separate from the implementation authors. This is a bounded defensive source
review, not a formal appointed-reviewer approval or an external security audit.

## Disposition and exact source

**No new blocking security regression was identified in the scoped changes.**
The Windows fixture and CI adjustments retain the existing native protection
path. The POSIX cleanup adjustment retains the already documented ownership,
mode and sticky-bit assumption; it does not close the native ACL limitation.

| Identity | Value |
| --- | --- |
| Comparison base | `7452d2cf697e690a663fcb8e5facd2d8cb63dd3c` |
| Reviewed source | `a5e5d19b6213dd4477b849deda7a3c837ea7fce0` |
| Reviewed tree | `a5aa203ca47b10e0aa1fb63d3fc913933cc0e053` |
| Isolated review branch | `codex/qv-security-bd157-r6` |

The reviewer read the contribution and governance instructions, the unfinished
work ledger, the previous independent security follow-up, and the intervening
POSIX, Windows-fixture and Windows Node 24 CI reports. Source assessment covers
the native-file, fixture and CI deltas plus the existing API/CLI boundaries for
a proposed backup adapter. Other intervening changes are outside this receipt.
The separately stopped background-runtime/gossip investigation and its old
untracked test were not inspected or resumed.

This report is the worker's only change. No production or test source was edited,
no native or repository tests were executed, and no remote publication occurred.
Current hosted qualification belongs to the separate exact-head CI review; it
is not an execution result produced by this source reviewer.

## Retained native-file boundaries

The [CLI Windows bridge](../../packages/cli/src/windows-private-files.ts) and
its trustee copy are byte-identical, at Git blob
`6e72bd8941939833354c3f73e24b30463bff5fc8`. The
[PowerShell helper](../../packages/cli/src/windows-private-files.ps1) and its
trustee copy are also byte-identical, at blob
`12e703315de1fd0a5d7c8459f2ea18cc9fc55599`. Both pairs are unchanged from the
comparison base. The CLI private-file implementation and both package-local
POSIX staging helpers are likewise unchanged; both staging copies compare equal.

Inspection confirms the unchanged Windows properties relevant to this delta:

- Executable selection uses the absolute system PowerShell path with no shell,
  profile or PATH search; request data travels through framed stdin rather than
  interpolated command arguments. Helper cwd is the stable system root, while
  each file path is anchored to the caller before dispatch.
- Asynchronous calls acquire their helper at the serialized queue head. A
  refusal retires the failed service. A subsequent queued call can acquire a
  fresh service; an already issued operation is not automatically replayed.
- Per-message and synchronous-call deadlines remain 15,000 ms. Child-process
  closure retains a separate bounded wait and refuses with `CLEANUP` if it
  cannot complete. The CI change does not extend these deadlines. Queue waiting
  and service acquisition are not a new end-to-end 15-second guarantee.
- Native creation applies the current user's protected DACL before secret
  bytes are written. Owner, DACL, regular-file, link-count, volume/file identity
  and path checks remain associated with the held stream. Publication and
  cleanup retain their native held-handle operations.
- Native stderr is discarded. Synchronous transport errors expose only finite
  diagnostics, with an explicit native refusal taking precedence. Raw process
  error objects, arguments and stderr are not attached to the replacement
  error. The asynchronous timer path still has its existing generic refusal;
  this source does not identify the cause of an older generic `UNAVAILABLE`.

The new [async fixture helper](../../packages/cli/test/private-fixture.ts)
selects `writeWindowsPrivateFile` only on Windows, with the same replacement
choice as its existing synchronous fixture helper. POSIX continues through the
existing helper. The two changed enrollment fixture writes are awaited before
the CLI runs; failures propagate. No unprotected fallback, exception suppression,
native-script edit, automatic retry or changed forged-response assertion was
introduced.

The [CI loop](../../.github/workflows/ci.yml) resets its argument array for each
workspace and adds `--test-concurrency=2` only for Windows 2025, Node 24, and the
CLI/server workspaces. It retains one common npm test invocation, every
workspace in the shard, and aggregate failure propagation. Its accompanying
source assertions are supplemental checks, not native-runtime evidence.
Reduced test-file fan-out can avoid concurrent fixture startup pressure; a pass
under that configuration does not establish the root cause of earlier native
failures or qualify unrestricted process concurrency.

## POSIX cleanup assessment

The changed [trustee cleanup](../../packages/trustee/src/fsutil.ts), blob
`750a3abcc6e5f233101d53713b0f1d333c5f57c2`, now replaces the caller's resolved
path with `protectedPosixPath(path)` before its first asynchronous filesystem
operation. That helper resolves only the parent, walks the physical ancestry,
checks current-EUID/root ownership and the existing mode/sticky policy, and
returns a physical parent plus the original final component.

Consequently a trusted ancestor alias, such as the ordinary macOS `/var`
mapping, can be accepted without making a symlinked final file acceptable.
Final-component `lstat` and canonical-path checks, single-link refusal, held
descriptor identity, optional expected fingerprint, pre-overwrite checks and
pre-unlink identity checks remain. `UNSAFE_DIRECTORY` still returns false before
overwrite. The new source regression exercises an accepted ancestor alias and
a refused leaf alias; this reviewer inspected it but did not execute it.

The protection still depends on effective rights following the inspected mode
and sticky bits, and on trusting the current effective UID and root. Native
ACL grants can exceed those bits and are not inspected or refused. Identity
comparisons do not independently make a pathname unlink conditional. An ordinary
macOS or Linux CI pass does not supply the missing native ACL permission provider
or its distinguishing fixtures.

## Existing backup adapter contract and handoff

The accepted implementation boundary is a thin `online backup-create` adapter
to the existing API, with existing `job-inspect` for subsequent state. The
[server route](../../packages/server/src/ext-routes.ts),
[admin authorization and backup work](../../packages/server/src/admin.ts),
[job representation](../../packages/server/src/jobs.ts), and
[API documentation](../09-api-data-contracts.md#10-export-import-jobs-admin)
already establish the following constraints. This receipt reviews those
contracts, not an adapter implementation authored later.

1. Use the fixed signed `POST /api/v1/admin/backups`. The current server requires
   `instance_admin` with a null organization association. Preserve the configured
   signature audience and explicit caller-supplied idempotency key; do not add a
   bearer credential, administrator enrollment or new role authority. The
   unresolved D-84 policy decision is not settled by exposing this existing API.
2. Require an explicit scope of `all` or `election`. Election scope requires one
   canonical 32-character lowercase hexadecimal election ID; all scope forbids
   that field. Send only `scope` and the conditional `election_id`, with no
   destination path or caller-controlled backup filename.
3. Retain the existing private signing-key handling, single unlock for a single
   request, seed-buffer wipe, HTTPS-or-loopback origin rule, redirect refusal,
   bounded timeout and no automatic mutation replay. Bound this small job
   response separately from the general 64 MiB transport ceiling; the existing
   64 KiB management metadata limit is sufficient for this adapter.
4. Validate the returned job identifier and backup kind, and bind any election
   field to the requested election. Project only the relevant job metadata.
   Treat malformed successful mutation replies as an unknown submission outcome;
   do not manufacture success, resubmit, or print arbitrary returned secrets.
5. `GET /api/v1/jobs/{job_id}` is already signed and restricted to the creating
   key or an instance administrator; other principals receive the same 404 as
   an unknown job. Existing `job-inspect` validates the requested ID but otherwise
   prints the returned JSON object. Its output reports server state, without
   independent verification. If strengthened later, bind the returned ID to
   the requested ID and preserve the distinct result contracts of other job
   kinds instead of imposing the backup result shape on every job.
6. Never follow a returned `Location` or `result_ref` as an authenticated network
   destination or local file path. A backup's `result_ref` is a server-local
   reference such as `backups/{job_id}`; the existing completed backup result
   contains file and byte counts. This adapter must not imply a download,
   off-site copy, external encryption, complete KEK backup, restore, or
   independent restore verification.

Source tests for a new adapter should distinguish exact request scope and
signing, missing/contradictory flags before submission, returned job/election
binding, refusal of unrelated principals, stable idempotent replay, sanitized
output, and no replay after an ambiguous response. These are prospective
acceptance checks, not tests performed in this review. Existing client native
protection is not evidence about the server backup directory's native ACLs.

## Verification and remaining gates

Executed checks were read-only Git diff/tree/blob inspection and byte comparisons
of the package-local native and staging copies. They succeeded at the exact
reviewed source. This report's whitespace was checked with `git diff --cached --check`.
No runtime, browser, vulnerability reproduction, native ACL probe, full suite or
dependency audit is claimed.

Fresh workers should review the actual backup adapter diff and its focused
tests, then record qualification against its new source. Preserve the distinction
between this independent engineering review, author tests, hosted results and
appointed human approvals. POSIX/macOS ACL custody, secret-runtime erasure and
timing, worker integrity, wrapping-provider and unresolved protocol/governance
contracts remain open. Required formal sensitive-change approvals, historical
DCO provenance and release evidence remain separate gates; this report grants
none of them.
