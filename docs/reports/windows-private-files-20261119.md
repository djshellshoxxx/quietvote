# Native Windows private-file protection

## Status and review boundary

The implementation, operator notes and real filesystem fixtures are complete for integration review. Independent runtime review found and reproduced two correctness issues in the new bridge/CLI writer and one separate, inherited trustee publication defect; those repairs are retained as regressions. A subsequent independent engineering source review found that the POSIX identity-check/`unlink` sequence still lacked a controlled namespace. The bounded staging repair below is implemented and its exact-source author checks passed. **Native Windows execution is not yet qualified.** This workspace is Linux and has no Windows PowerShell 5.1 / .NET Framework runtime. The required Windows Node 22 and Node 24 CI jobs must execute the final published source before this gap can be marked verified. **ACL-backed POSIX namespace custody is also unresolved:** the new staging policy does not inspect macOS ACL grants that override BSD permission bits.

Local validation used Node **24.22.3** on Linux. Before the controlled-staging follow-up, the core batch passed **26 tests**, with **13 Windows-only cases unexecuted on Linux**, no failures and no cancellations. The narrowed caller/custody batch passed **44 tests**, with no failures, skips or cancellations. After the separate inherited trustee repair, the author executed its unchanged independently supplied probe with **6/6** passes and a focused trustee custody/publication batch with **29/29** passes. The accompanying strict typecheck covered **17 explicit roots**. Earlier scoped bridge checking, dependency-boundary checking and installed-vendor integrity checking also passed. An earlier optional broader caller-file run was interrupted after it entered unrelated slow vector traversal; that run is not a passing qualification result.

Final author validation on controlled-staging source **`239dfaf9ddedf5c0f3288ed566e6a81be54d4e45`** passed **35 focused tests**, with the same **13 native Windows-only cases unexecuted on Linux**, plus **19/19 adjacent custody/public-artifact controls**. There were no failures or cancellations. The final strict check passed with **22 explicit roots**: all **17** changed CLI/trustee production TypeScript files, the changed server registration fixture, and four focused POSIX publication/private-file test files. Dependency-boundary checking passed. These are author runtime results; the later report-only commit does not change the tested source.

This slice changes client file I/O and its fixtures. It does not change the election protocol, server production code, web code, dependency versions, allowlists or hosted timeouts. Commits carry the project's required DCO sign-off; no release, deployment or remote mutation is performed by this worker.

## Requirement and implementation

QV-17 section 6.5 requires private secret files. A POSIX mode such as `0600` does not establish a private Windows DACL. The former Windows permission bypass is replaced by a fixed Windows PowerShell 5.1 script using .NET Framework and native handle APIs. No npm dependency is added.

The Node bridge invokes the installed `System32/WindowsPowerShell/v1.0/powershell.exe` beneath `SystemRoot` using `execFileSync` or `spawn`. It passes a fixed module-relative script, disables profiles and interactive mode, and sends requests as JSON over stdin. Private I/O accepts ordinary local drive paths; UNC shares, device paths and alternate data streams are refused. Paths, passphrases, keys and response bytes are never interpolated into command text or placed in command arguments. There is no shell, PATH lookup, execution-policy bypass or unvalidated-read fallback. Native diagnostics are reduced to constant error codes. A missing or unusable native runtime refuses the operation.

The embedded C# uses syntax supported by the compiler exposed by Windows PowerShell 5.1, without assuming current Roslyn language features. Async operations reuse one bounded, serialized helper process to avoid repeated compilation for every trustee read/write. Each request anchors its data-only file path to the Node caller's current directory, so a reused native process cannot apply a stale working directory. Active operations have a 15-second deadline. Idle helper pipes and the process are unreferenced, and an idle retirement timer closes the helper. Held invitation reservations have per-operation deadlines rather than a deadline spanning the operator's credential prompt.

### Same-handle privacy and identity

`FileStream.GetAccessControl()` supplies the ACL for the exact stream that supplies secret bytes. Validation requires the current user SID as owner, a protected and present non-null DACL, recognized non-callback ACEs, no allow grant to any other SID, and the necessary owner data rights. Name-based account comparisons are not used. Inherited/broad grants, unknown ACE forms, null DACLs, wrong ownership and unavailable inspection refuse the read.

Native handle metadata must describe a seekable ordinary disk file with exactly one link. The helper checks a 128-bit file ID and volume identity. It compares the final handle path with the requested long-form path, rejecting device paths, alternate data streams and unresolved reparse targets. **Harmless DOS 8.3 names are expanded in production using `GetLongPathNameW`**, so ordinary Windows `TEMP` paths work without test-only normalization. No server fixture normalization was added.

Trustee's existing `realTarget` bundle-alias policy remains in place: explicit bundle aliases resolve to one canonical bundle, release ledger and lock before the private helper opens the canonical path. Direct private-input and reservation paths still undergo the native reparse/path checks. Existing alias/custody regressions are retained.

Reads are bounded to the caller's limit, never exceeding 64 MiB. The stream's permissions, size and write time are checked around the read. POSIX secret reads now likewise validate ownership, mode, link count, size and identity on the descriptor supplying bytes, and reject a substituted pathname or changed snapshot.

### Creation, publication and invitation issuance

Private creation supplies owner-only, protected `FileSecurity` to the `FileStream` `CreateNew` constructor **before any secret write**. A write flushes the native stream with `Flush(true)`. Atomic outputs publish by a rename of the held file handle; failed publication marks only the held temporary file for deletion, checks the native result and returns a constant `CLEANUP` refusal if that operation fails; the stream is disposed even on cleanup failure. Exclusive creation remains exclusive. Replacement never writes through an existing target file or link. POSIX private output keeps exclusive temporary creation, descriptor validation, fsync, atomic publication and conditional cleanup. It verifies the published entry against the held descriptor before returning success; exclusive publication also validates both staging links before removing the temporary name. Cleanup retains the descriptor while checking identity so the original inode cannot be recycled.

The adjacent trustee writer now applies the same held-identity publication checks to its POSIX/private and cross-platform/public branch. Requested permissions are set on the held file before writing, preserving public `0644` outputs even under POSIX umask `077`. It never chmods a published pathname. Public Windows files receive identity/link checks without treating Node's mode bits as Windows ACLs; private Windows files continue through the native ACL helper. This inherited custody repair is covered by Linux filesystem evidence, separately from the pending native Windows qualification.

### Controlled POSIX staging and its exact boundary

QV-17 section 6.3 requires temp-file, fsync and rename updates; section 6.5 requires private bundle/state files. Its section 2 non-claims exclude a compromised trustee device, and QV-07's TB2 trusts each trustee device by its holder. The earlier [custody report](next-custody-20261109.md) separately records the limits of hostile filesystem rollback and arbitrary active filesystem tampering. These sources support a current-effective-user/root trust boundary; they do not make a pathname check followed by `unlink` atomic.

Both POSIX writers now resolve the destination parent once and use that canonical path for publication and directory fsync. They inspect every component from root to parent: it must be a real directory owned by the current effective user or root. Group/other write permission is refused unless the directory has the sticky bit; the ownership checks on the sticky directory and every descendant remain mandatory. A private child beneath writable nonsticky ancestry is therefore refused as `UNSAFE_DIRECTORY` before staging or writing secret bytes.

An exclusive random `0700` staging directory is created beneath that validated parent and checked for current-user ownership, exact mode and the same filesystem. The held payload is written and published from inside this namespace. Cleanup removes only that payload and an owned, matching **empty** staging directory; it never recursively traverses or deletes staged entries. Existing file-identity checks remain useful refusal checks, including the retained independent regressions, but are not presented as atomic conditional deletion. The security argument is that another UID cannot rebind the protected names in the supported namespace.

**Supported-permissions assumption:** effective namespace access must follow the inspected POSIX owner/mode/sticky policy, with the current effective UID and root trusted. Same-UID/root compromise and filesystem administrators overriding those permissions are outside this boundary. ACLs that grant namespace mutation beyond those bits, including macOS `delete`/`delete_child` rights, are not inspected and remain an unresolved native custody implementation/qualification boundary. Normal-path macOS test results cannot close that limitation. No universal ACL-safe POSIX claim is made, and no native inspection result is inferred from Linux mode checks. The Windows private backend and existing public Windows branch are unchanged by this staging follow-up.

The cleanup change preserves the requested `0600`/`0644` modes, exclusive-versus-replacement API, held-file checks and same-filesystem atomic target publication. A crash can still leave a private staged file, as it could leave a temporary file before this repair; no automatic crash scavenger or recursive recovery was added. The destination is never intentionally exposed as a partially written output. Existing relative paths and parent aliases resolve once to their canonical destination; substitution regression fixtures now canonicalize their initial temporary directory to bind the hook to that documented target.

Invitation issuance reserves one private stream before POST, writes its pending marker, and checks output binding again after credential unlock immediately before sending the request. Received bytes go to that same stream. If the pathname was replaced after issuance, the response remains recoverable in the original private file and success is refused; the replacement is untouched. If privacy was lost, the response is not written. No automatic issuance retry is added. Existing single-issuance, malformed-response preservation, binding-loss and no-secret-output assertions remain intact.

## Caller scope

- Trustee encrypted bundles, passphrase input, backups, and sealed-file comparison reads.
- CLI voter keys, seed files, passphrase files, governance signing inputs, read-key files and invitation token files.
- Held invitation response output and private ballot audit output.
- Existing CLI output paths that previously requested `0600`, including governance, policy, packet, lifecycle, preparation, export and tally drafts.

Public trustee packets, release ledgers and tombstones remain public artifacts. Server data-directory custody is outside this client slice.

The package architecture forbids CLI-to-trustee production imports and Node I/O in the shared pure packages. The two clients therefore contain byte-identical package-local native bridges and POSIX staging helpers. A regression compares the TypeScript, PowerShell and staging copies byte-for-byte. No architecture exception is introduced.

Legitimate test fixtures now explicitly create private keys, seeds, passphrases and invitation tokens through the native private writer. Malformed cryptographic fixtures remain private so their parsing and cryptographic assertions still reach the intended layer. Deliberate broad-permission and substitution fixtures remain adversarial.

## Independent review repairs

1. **Native process termination could hide a refusal.** Node may emit `exit` before the last stdout bytes are delivered. The original bridge finalized on `exit`, turning valid `ENOENT`, `EEXIST` and `CLEANUP` frames into generic `UNAVAILABLE`. The independent actual-bridge probe failed all three cases on the review baseline. The bridge now finalizes on `close` after stdio drains, preserves operation deadlines and immediate spawn/stdin failures, and disposes all pipes idempotently. The author obtained **3/3** passes, and the original reviewer independently confirmed those three cases on `e10e605`. Its normal package-test wrapper starts a separate test lifecycle and explicitly requires all three cases to execute; no package-test command or production flag changed.
2. **POSIX publication could report success for a substituted source.** Replacing the temporary pathname immediately before `linkSync` or `renameSync` caused both exclusive and replacement writes to return success with unrelated broad-permission bytes at the requested path. The independent real-filesystem probe failed **2/2** cases. The writer now verifies the published identity and private metadata against the still-open descriptor before clearing custody. It refuses without rewriting or deleting the independent replacement, and the original private bytes remain recoverable. The author obtained **2/2** passes, and the original reviewer independently confirmed those two cases on `e10e605`.
3. **Inherited trustee publication could also mutate an unrelated replacement.** The original async `atomicWrite` closed its file before publication and then used `chmod(path)`. The independent Linux probe passed two ordinary controls but failed all four substitutions across private/public modes and exclusive/replacement publication: it returned success with unrelated bytes and changed that replacement's mode. The repair retains the handle, sets the requested mode through it before writing, validates both exclusive staging entries and the final published identity/mode, and conditionally cleans only its own staging inode while held. The author executed the six unchanged independent cases successfully and obtained the **29/29** focused result on the `44d9d067` source. An attempted independent runtime follow-up after that commit stopped at an automated content check; it supplies no passing revalidation result. The preserved repository file additionally checks public create/collision/replace behavior on every platform. This was an inherited custody defect, not a native Windows execution result.
4. **The cleanup namespace still needed protection.** A separate independent engineering source review of the preceding repair identified that a matching `lstat` followed by `unlink` leaves a rebinding window. No new exploit probe was needed or commissioned. The approved minimal follow-up uses the controlled staging namespace described above for both POSIX writers. Its claim is bounded by effective POSIX permissions and trusted current-UID/root authority; overriding ACL grants remain open. Independent source assessment, author runtime validation and native platform qualification remain separate evidence categories.

The source follow-up also checks native deletion-marking failures, anchors each request to the Node caller's cwd, and isolates inherited-DACL fixtures from elevated Windows tokens' default owner. These changes do not relax any permission check or timeout. The detailed native Windows cases remain unqualified until hosted execution.

The later independent engineering source review inspected exact commit `239dfaf9ddedf5c0f3288ed566e6a81be54d4e45` (tree `c0a44b19c2e4e13a7cdcbda2b431b3cbfe4a6fe5`) and found no remaining blocking source issue **within the documented effective-POSIX-permissions boundary**. That reviewer executed no project code. The reviewer also caught the helper-error integration detail: trustee now translates `UNSAFE_DIRECTORY` into structured `REFUSED`/exit `60`, with an ordinary regression assertion. Source review is not native macOS/Windows qualification or an independent runtime rerun.

## Validation evidence

Raw local evidence is under `quietvote-evidence/` in the shared workspace:

| Evidence | Local result |
|---|---|
| `windows-acl-npm-ci.log` | Regular `npm ci --ignore-scripts --no-fund --no-audit` installed the pinned workspace dependencies; no package or lock change |
| `npm run vendor:install` | Passed: two pinned packages, 132 verbatim files |
| `windows-acl-focused-qualified-linux.log` | 26 passed, 13 Windows-only unexecuted, 0 failed, 0 cancelled |
| `windows-acl-caller-focused-linux.log` | 44 selected caller/custody tests passed, 0 failed/skipped/cancelled |
| `windows-acl-scoped-typecheck-final.log` | Pre-staging strict scoped native bridge/filesystem/regression TypeScript check exited 0 |
| `windows-acl-caller-typecheck-final.log` | Pre-staging strict check of 17 explicit roots exited 0: all 15 then-changed CLI/trustee production TypeScript files, server registration fixture, and trustee publication regression |
| `windows-acl-deps-check.log` | No new dependency-boundary violations; existing D-97 deviations unchanged |
| `windows-acl-vendor-check.log` | Installed bytes match two pinned packages and 132 verbatim files |
| `windows-acl-transport-green.log` | Original independent transport probe passed 3/3 |
| `windows-acl-publication-green.log` | Original independent publication probe passed 2/2 |
| `windows-acl-regression-wrappers-green.log` | Repository probe discovery passed 3 top-level tests, including the 3-case transport child |
| `final-review-trustee-publication-red-e10e605.log` | Independent inherited trustee baseline: 2 positive controls passed, all 4 substitutions failed |
| `windows-acl-trustee-publication-green.log` | The unchanged independent trustee probe passed 6/6 after repair |
| `windows-acl-trustee-custody-final.log` | Final trustee publication/custody/public-artifact batch passed 29/29, 0 failed/skipped/cancelled |
| `windows-acl-scoped-tsconfig.json` | Exact local scope for reproducing the narrow typecheck |
| `windows-acl-caller-tsconfig.json` | Preserved pre-staging 17-root caller/fixture scope, with unchanged inherited strict compiler settings |
| `posix-staging-focused-linux.log` | Author final-source batch: 35 passed, 13 native Windows cases unexecuted, 0 failed/cancelled |
| `posix-staging-custody-linux.log` | Author final-source adjacent custody/public-artifact controls: 19 passed, 0 failed/skipped/cancelled |
| `posix-staging-typecheck.log` | Author final-source strict 22-root TypeScript check exited 0 |
| `posix-staging-tsconfig.json` | Exact final 22-root scope; prior compiler settings unchanged |
| `posix-staging-deps-check.log` | Final-source dependency boundary check passed; existing D-97 deviations unchanged |
| `windows-acl-caller-linux.log` | Optional wider caller-file run interrupted with exit 130; not a passing gate |

The narrowed caller selection exercised keygen, private ballots, malformed/protected keys, governance executables, actual CLI enrollment, backup races/rollback/recovery, alias custody, passphrase-file refusal and live bundle privacy. The focused batch includes real invitation issuance and output handling, private output exclusivity and cleanup, bounded snapshots, symlink/hardlink/FIFO refusal, held-output substitution, a deterministic POSIX substitution during the descriptor read, and forged KDF-header refusal.

The pre-staging trustee-only batch exercised the new seven-case publication file, private snapshots, the custody suite, backup destination protection, public CLI output protection, failed-save cleanup, at-rest secrecy, backup/restore, transcript export and destruction. Both ordinary POSIX modes remain exact under a restrictive umask, and all four substituted replacements retain their original bytes and mode `0640` after refusal. The final controlled-staging batches repeated the retained publication and custody coverage and added two ordinary directory-policy controls: writable nonsticky ancestry is refused despite a private leaf, while trusted sticky ancestry, canonical aliases, relative paths and normal cleanup work. Trustee refusal assertions also require its structured class and exit code. The final 22-root typecheck includes the new helper copies and these changed fixtures. No repository-wide typecheck was retried locally.

Native Windows fixtures mutate actual filesystem ACLs and exercise actual create/read/save/rename operations. They cover inherited Everyone access, explicit broad access, protected creation beneath a permissive parent before the first write, null DACLs, callback ACEs, readable data with uninspectable security, an ordinary foreign-owned system file, hardlinks and junctions, literal filenames, same-handle substitution and ACL loss, actual DOS short names where the filesystem supplies them, relative paths across caller cwd changes, multi-MiB pipe round trips, unavailable native protection, shipped keygen and trustee CLI execution, and trustee keygen/open/backup/restore. Invitation permission-loss and governance/private-passphrase tests now also exercise Windows ACL refusal.

Representative exact local commands (run from this worktree):

```sh
node --test --test-concurrency=1 --test-reporter=spec packages/cli/test/private-file-publication.test.ts packages/cli/test/private-file-transport.test.ts packages/cli/test/private-files.test.ts packages/cli/test/private-files-windows.test.ts packages/cli/test/invites-review.test.ts packages/cli/test/invites-create.test.ts packages/trustee/test/private-files.test.ts packages/trustee/test/private-files-windows.test.ts packages/trustee/test/kdf-budget.test.ts
node --test --test-concurrency=1 --test-reporter=spec --test-name-pattern='keygen|ballot|key files|tampered QVKEY1|^secrets:|governance CLI|independent pins|replacement steward|strict documents|actual protected|^T[25689]:|^bundle at rest|^wrong passphrase|^backup [+] restore|^B2-08:|^TR-0[38]:|^custody:|shipped CLI enrollment|actual CLI refuses' packages/cli/test/cli.test.ts packages/cli/test/audit.test.ts packages/cli/test/audit-regressions.test.ts packages/cli/test/governance-executable.test.ts packages/trustee/test/hardening.test.ts packages/trustee/test/lifecycle.test.ts packages/trustee/test/custody.test.ts packages/server/test/registration-review.test.ts
node --max-old-space-size=256 node_modules/typescript/bin/tsc -p ../quietvote-evidence/windows-acl-scoped-tsconfig.json --pretty false
node --test --test-concurrency=1 --test-reporter=spec ../quietvote-evidence/final-review-trustee-publication.test.mjs
node --test --test-concurrency=1 --test-reporter=spec --test-name-pattern='trustee|^POSIX trustee|^custody:|^B2-08:|^TR-0[38]:|^bundle at rest|^backup [+] restore|^destroy:|^transcript:|^T[569]:' packages/trustee/test/private-file-publication.test.ts packages/trustee/test/private-files.test.ts packages/trustee/test/custody.test.ts packages/trustee/test/hardening.test.ts packages/trustee/test/lifecycle.test.ts
node --max-old-space-size=256 node_modules/typescript/bin/tsc -p ../quietvote-evidence/windows-acl-caller-tsconfig.json --pretty false
node --test --test-concurrency=1 --test-reporter=spec packages/cli/test/private-file-publication.test.ts packages/cli/test/private-file-transport.test.ts packages/cli/test/private-files.test.ts packages/cli/test/private-files-windows.test.ts packages/cli/test/invites-review.test.ts packages/cli/test/invites-create.test.ts packages/trustee/test/private-file-publication.test.ts packages/trustee/test/private-files.test.ts packages/trustee/test/private-files-windows.test.ts packages/trustee/test/kdf-budget.test.ts
node --test --test-concurrency=1 --test-reporter=spec --test-name-pattern='^custody:|^B2-08:|^TR-0[38]:|^bundle at rest|^backup [+] restore|^destroy:|^transcript:|^T[569]:' packages/trustee/test/custody.test.ts packages/trustee/test/hardening.test.ts packages/trustee/test/lifecycle.test.ts
node --max-old-space-size=256 node_modules/typescript/bin/tsc -p ../quietvote-evidence/posix-staging-tsconfig.json --pretty false
npm run deps:check
npm run vendor:check
```

The raw evidence also retains the independent red probes and the earlier interrupted/configuration/harness failures. The scoped config explicitly anchors its Node type root; the nested test wrapper removes the outer runner's `NODE_TEST_CONTEXT` and checks the executed test count. Neither issue was treated as a passing gate.

The native fixtures are required by the existing Windows package-test matrix. Their platform condition only prevents executing Windows APIs on Linux/macOS; it does not disable them on Windows. No existing assertion, CI gate or timeout is weakened. Full dependency/audit gates and final-source Windows execution remain part of the parent integration qualification.

## Primary API references

- [Node child-process `exit` and `close` events](https://nodejs.org/api/child_process.html#event-close)
- [Apple filesystem security schemes and ACL evaluation](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html)
- [FileStream.GetAccessControl](https://learn.microsoft.com/en-us/dotnet/api/system.io.filestream.getaccesscontrol?view=netframework-4.8)
- [FileStream creation overload with FileSecurity](https://learn.microsoft.com/en-us/dotnet/api/system.io.filestream.-ctor?view=netframework-4.8)
- [GetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle)
- [GetFinalPathNameByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew)
- [GetLongPathNameW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getlongpathnamew)
- [SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle)
- [FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info)
