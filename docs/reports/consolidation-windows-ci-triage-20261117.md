# Windows CI triage and web fixture path review

## Outcome

The reviewed Windows job remains failed: **server 272 passed, 15 failed, 7 skipped of 294; web 337 passed, 1 failed of 338**. One web test path bug has a narrowly scoped source repair with no blocking review finding. Two failures assume POSIX signal delivery on Windows. One HTTP reset occurs at the exact request already changed by #57. **Twelve recovery failures remain substantive and unresolved**; source inspection identifies a common path-validation hypothesis, not a proven Windows root cause.

This is an independent AI source/log review, not a formal approving review. No source files, assertions, timeouts or CI metadata were changed, and no broad suite was rerun.

## Exact evidence and source provenance

The [hosted job](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558/job/134662337870) ran Node **22.23.4**, npm **10.9.9**, Windows Server 2025 **10.0.26100**, image **windows-2025-vs2026 20261103.298.1**. Its log records checkout **d2ccc322ba3c7381357627272e47fcfb8e49c84b**, merging PR60 head **754c586aa65735d50514b543a62a5e3c96a4d138** into canonical **72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54**. The hosted merge object was not available locally; comparisons below use the recorded head's Git objects, not an independently rehashed hosted merge tree.

All **15 inspected files** match canonical at the PR60 head. All also match #57 **fd23cb3a481328a2b6315ae34cc2ee589b31aead**, except `packages/server/test/e2e.test.ts` and `packages/server/test/helpers/world.ts`, which #57 changes for fresh HTTP connections. No inspected failing path was introduced by W15. Unchanged source does not prove earlier Windows CI failed or excuse the present failures. Exact blob IDs are recorded in `windows-ci-source-identity.json` and the consolidated JSON.

## Failure inventory

Each log line points to the named test's failure block in `analysis/branch_inventory/pr60-run44263515558-job134662337870.log`. The JSON also preserves source-test and assertion locations, original failure messages and expected/actual values.

| ID | Exact failed test name | Classification | Observed condition | Log line |
|---|---|---|---|---|
| WIN-01 | another process cannot open a live server data directory | Signal assumption | Observed child exit [null, SIGTERM], expected [0, null]; test sends child.kill(SIGTERM) and assumes its JavaScript cleanup handler runs. | 561 |
| WIN-02 | full election over HTTP: 3-of-5 trustees, 22 voters, revotes, spoils, close, tally, export, evidence-gated verification | HTTP reset | Direct export.qvb fetch at e2e.test.ts:143 failed with read ECONNRESET after synchronous verifier subprocesses; #57 already changes this exact request to a fresh connection. | 584 |
| WIN-03 | committed election with a lost response stays reserved while storage fails and recovers after restart | Recovery unresolved | Retry after restart returned 409 IDEMPOTENCY_INTERRUPTED instead of 201. | 599 |
| WIN-04 | launcher starts actual server, answers readiness and stops on SIGTERM | Signal assumption | Readiness succeeded; after child.kill(SIGTERM), exit code was null instead of 0. SQLite warning in the assertion message is not the failing condition. | 617 |
| WIN-05 | process exit after create commit recovers its redacted original result and audit exactly once at startup | Recovery unresolved | Startup left the committed create response at status -1 instead of 201. | 638 |
| WIN-06 | process exit after invites commit recovers its redacted original result and audit exactly once at startup | Recovery unresolved | Startup left the committed invites response at status -1 instead of 201. | 656 |
| WIN-07 | process exit after clear commit recovers its redacted original result and audit exactly once at startup | Recovery unresolved | Startup left the committed clear response at status -1 instead of 200. | 674 |
| WIN-08 | failure after committed election initialization retains its binding and recovers on same-process retry | Recovery unresolved | Same-process retry returned 409 IDEMPOTENCY_INTERRUPTED instead of recovering 201. | 692 |
| WIN-09 | startup leaves a committed response pending when its election storage has missing damage | Recovery unresolved | After the missing storage was restored, startup still left response status -1 instead of 201; the damage-rejection assertions had passed. | 710 |
| WIN-10 | startup leaves a committed response pending when its election storage has symlink damage | Recovery unresolved | After the symlink was removed and original storage restored, startup still left response status -1 instead of 201; the damage-rejection assertions had passed. | 728 |
| WIN-11 | startup leaves a committed response pending when its election storage has identity damage | Recovery unresolved | After the original database identity was restored, startup still left response status -1 instead of 201; the damage-rejection assertions had passed. | 746 |
| WIN-12 | second crash during registry recovery preserves lifecycle projections and retention timestamp | Recovery unresolved | An append-completion intent remained pending (1 instead of 0) after the second restart. | 764 |
| WIN-13 | process exit after append commit reconstructs its phase exactly once at startup | Recovery unresolved | An append-completion intent remained pending (1 instead of 0); startup did not reconstruct the phase. | 782 |
| WIN-14 | startup forwards committed events lost before the control outbox without requiring a client to reopen the election | Recovery unresolved | Startup delivered zero of the three expected committed webhook events. | 800 |
| WIN-15 | cursor failure after pending delivery insertion cannot send uncommitted deliveries or lose the source event | Recovery unresolved | After cursor-failure recovery, zero of the three expected webhook events were delivered. | 818 |
| WIN-16 | N-20: ApiClient has no session-token or challenge/session methods and no export with those names | URL path | readFileSync received the URL pathname as a filesystem string and attempted D:\D:\a\quietvote\quietvote\packages\web\src\api\types.ts. | 1204 |

## Repair boundaries

### Confirmed web path bug: source repair reviewed

Reviewed **fc72bc1d1139ba0ff64f65f60896e71dc6fc07c8**, tree **d90e35d19d2401a405feeb288d2e4a18d08c2e12**, parent canonical **72bccc6** in `quietvote-web-test-path`; clean worktree and diff check passed. Its sole changed line makes `here(p)` return a `URL` object instead of `.pathname`. Both consumers are `readFileSync`, whose [documented file-URL handling](https://nodejs.org/docs/latest-v22.x/api/fs.html#file-url-paths) performs the platform conversion. Existing security assertions and runtime code are unchanged. **No blocking source-review finding.**

The root's focused log shows both existing no-bearer tests pass. The separate temporary probe log records an encoded-space pathname negative control, URL positive control, and Windows drive conversion probe passing. This reviewer read those logs and did not rerun them. No native Windows execution of the repair has been observed; hosted qualification remains outstanding.

### Two signal assumptions: preserve the cleanup contract

Both tests call `child.kill('SIGTERM')` and expect JavaScript shutdown cleanup followed by exit code zero. [Node 22 documentation](https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html#subprocesskillsignal) describes unconditional, abrupt termination for this call on Windows. That matches the logged exit status. The data-lock fixture can use its existing IPC channel to request `server.stop()` for portable exclusivity and cleanup testing, while retaining a separate platform-specific signal contract. The real launcher needs an explicit supported Windows shutdown mechanism if graceful shutdown is to be qualified there. Accepting a signal exit as successful graceful cleanup would weaken the test and can leave the deliberate fail-closed data lock behind.

### One HTTP reset: an existing candidate repair, not a proven Windows fix

`e2e.test.ts:143` is the first direct export request after synchronous verifier subprocesses. #57 changes that exact fetch and the surrounding World fixture to use fresh connections. The observed `read ECONNRESET` is consistent with stale keep-alive reuse after blocking the event loop. PR60 alone excludes that change. Carry the existing #57 repair into combined verification, then run the exact case on Windows; source correspondence is not an executed Windows confirmation. No timeout extension or blind retry is warranted by this evidence.

### Twelve recovery failures: diagnose before changing the guard

`ElectionPool.stored` (`pool.ts:147–157`) and `WebhookService.recoverStored` (`webhooks.ts:125–136`) both require a canonical registry path, regular file, exact equality of `realpathSync.native(path)` and the constructed path, and matching database identity. Exceptions become generic `election_recovery_pending` events. These checks precede the response, append-intent and webhook recovery that failed.

The shared data root comes from **non-native** `realpathSync` in `data-lock.ts:14`, then becomes `cfg.dataDir` in `app.ts:63–64`. [Node's realpath documentation](https://nodejs.org/docs/latest-v22.x/api/fs.html#fsrealpathpath-options-callback) notes that this form does not normalize case on a case-insensitive filesystem. A native/non-native Windows spelling mismatch is therefore a plausible common cause. **Neither the actual resolved paths nor the caught errors are in this log, so this remains a hypothesis.** The missing/symlink/identity-damage tests passed their rejection checks and failed only after the original storage was repaired; those are availability/recovery failures, not evidence that damaged storage was accepted.

The next bounded Windows diagnosis should record the two canonical root forms, constructed and native-resolved file paths, and the caught condition, while preserving all test outcomes. If that confirms the mismatch, consistently native-canonicalizing the owned root is a candidate narrow repair. Retain registry, regular-file, canonical-file and identity guards; do not delete equality, blindly lowercase paths, skip the recovery tests, or relax exactly-once/outbox assertions.

## Receipts and limits

`windows-ci-triage.json` contains all 16 failures, source blob IDs, CI and test-log hashes, repair binding, confidence labels and follow-up scope. Its inputs are `windows-ci-failures-extract.json`, `windows-ci-source-identity.json`, the hosted job log, and root-executed `analysis/web-test-path-focused.log` / `analysis/web-test-path-url-regression.log`. This review had no Windows runtime. It does not declare Windows supported, the job green, or any human approval gate satisfied.

## Publication note

Bare log/receipt names and session-evidence paths identify intermediate records outside this repository. Source identities, commands, results and hashes are retained in the [validation receipt](consolidation-current-validation-20261117.json). The [current reconciliation](consolidation-current-recheck-20261117.md) and timestamped [remote snapshot](consolidation-remote-snapshot-20261117.md) record later published heads and CI observations. This source review does not supply a formal approval.
