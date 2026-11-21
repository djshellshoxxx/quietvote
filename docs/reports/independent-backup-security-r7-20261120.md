# Independent backup CLI security review R7

Date: 2026-11-20. Reviewer: `/root/security_audit_r7`, a fresh worker separate
from the implementation author. This is a bounded defensive source review,
not an appointed security review, external audit or release approval.

## Disposition and source identity

**No new blocking security defect was identified in the backup adapter.**
One operator-documentation qualification was found and verified corrected in
the follow-up below. The command preserves the existing signed administrator
API, private-key handling and unknown-outcome behavior. It does not add a
restore operation or change the server's authorization policy.

| Identity | Value |
| --- | --- |
| Previously reviewed candidate | `a5e5d19b6213dd4477b849deda7a3c837ea7fce0` |
| Backup feature commit | `ff61e15c59c4186158ee5407f521f73172cf38d0` |
| Reviewed composition | `c7e32321c0a39aa24397401f5506f85bcd89d1f7` |
| Reviewed composition tree | `8932dc23872ff92aa33e5836e902edc531aca8d4` |
| Original command blob | `7efe0086509114e22b6e850aec2e184c7670bc65` |
| Reviewed correction | `10ea307850493bf7a1cbccd225979f823e608d64` |
| Correction tree | `3e6aa1caaf0701d562b1fc18793667beafc2515a` |
| Isolated review branch | `codex/qv-security-r7-20261120` |

The feature-to-composition diff is empty for packages, workflows, scripts and
dependency manifests. The composition adds preserved review documents. This
review followed the [R6 security handoff](independent-native-security-r6-20261120.md)
and inspected the new command, dispatch/help, README and author tests, together
with the existing transport, signing-key loader, admin route, job view and
offline recovery entry point. The stopped background-runtime/gossip
investigation and its old untracked test were not inspected or resumed.

## Confirmed boundaries

### Request authority and intent

The [new adapter](../../packages/cli/src/cmd-online-backup.ts) requires an
explicit `all` or `election` scope. Election scope requires a canonical
32-character lowercase hexadecimal ID; all scope refuses that option. The
idempotency key is required locally, and the shared transport validates its
8-to-128-character printable, non-space form before loading the signing key.
Only `scope` and the conditional `election_id` enter the request body. The
method and `/api/v1/admin/backups` path are fixed; no local destination, server
filename, returned URL or shell command is constructed from a reply.

The unchanged [route](../../packages/server/src/ext-routes.ts) independently
checks the body, requires the existing signed request, and calls
[admin authorization](../../packages/server/src/admin.ts). That authorization
requires `instance_admin` with a null organization association. The command
does not enroll an administrator, grant a role, accept a new bearer or settle
the documented D-84 authorization-policy decision. The existing server queue
and idempotency transaction remain authoritative.

### Credential and transport lifetime

The unchanged [request helper](../../packages/cli/src/cmd-online.ts) validates
an HTTPS origin, or HTTP on loopback, and refuses credentials, paths, queries
and fragments in that origin. It signs the fixed method/path, configured
audience and exact request body with the existing board framing. It performs
one key load for this single request and wipes the returned seed buffer in a
`finally` block after signing, including signing errors, before network I/O.

The [key loader](../../packages/cli/src/cmd-keygen.ts) retains protected QVKEY1
and existing private-file checks. Passphrases remain file/stdin/prompt inputs,
not command-line values. This is a seed-buffer-lifetime observation, not a
claim that JavaScript strings, all runtime copies or hardware memory are
erased. The existing native protection and wrapping-provider limitations
recorded in R6 remain separate.

Redirect refusal, the existing configurable 1-to-120,000 ms network timeout,
and absence of automatic mutation retries remain unchanged. The new call
uses a 64 KiB response ceiling instead of the general 64 MiB ceiling. Network
failure, server 5xx, an oversized reply or a malformed successful job response
preserve an ambiguous-submission message. Errors do not echo arbitrary reply
text; the shared HTTP-error path accepts only its existing bounded code form.
The network timeout does not establish a deadline for credential loading.

### Job receipt and output

The adapter checks the returned 26-character lowercase base32 job ID,
`kind: "backup"`, exact requested election binding, allowed job state, finite
progress in `[0,1]`, and a parseable creation timestamp. Full scope requires
the election field to be absent, matching the existing
[job representation](../../packages/server/src/jobs.ts).

It prints only the selected receipt fields through JSON serialization. The
scope and election ID come from the validated local request. Extra response
fields, `Location`, `result_ref`, completion details and error objects are
not followed or copied into that output. A schema-consistent receipt remains
a server assertion; it is not independent proof of backup contents or
completion. The [README](../../packages/cli/README.md#server-local-backup-jobs)
states that exit 0 means a valid submission response.

Existing [job-inspect](../../packages/cli/src/cmd-online-exports.ts) validates
the requested ID and makes a signed GET. The server permits the job's creator
or an instance administrator. This command otherwise retains its existing
generic JSON output, without binding returned job fields or independently
verifying results. The documentation accurately describes it as server state;
the new adapter neither automatically consumes its result nor treats a
`result_ref` as a download or local path.

## Finding R7-S1: qualify replay scope and lifetime

**Priority: low; disposition: corrected and source-verified.** At the reviewed
composition, the backup README said an explicit repeat with the same scope,
election and idempotency key identifies the original request. That wording
omitted the signing principal and expiry. The existing
[request wrapper](../../packages/server/src/app.ts) looks up receipts by
principal/key and uses only unexpired entries; the
[control database](../../packages/server/src/controldb.ts) stores a 24-hour
expiry. [QV-09 section 4.4](../09-api-data-contracts.md#44-idempotency)
describes the same boundary.

The coordinator was notified. Correction `10ea307850493bf7a1cbccd225979f823e608d64`
now specifies the same administrator key, unchanged request and 24-hour
window, and says the same key can create a new job after expiry. It preserves
inspection after unknown outcomes and the no-automatic-retry statement.
This reviewer inspected the exact correction diff; its other two changes
are SPDX comments in the new TypeScript files. The runtime implementation
is unchanged. The parallel code review independently found the same issue;
it is one shared documentation correction, not two distinct defects.

## Recovery and qualification limits

The source and README retain the distinction between full server-local
snapshots and election-only snapshots. The latter cannot be supplied to the
existing full-instance [offline recovery implementation](../../packages/server/src/offline-backup.ts).
That implementation requires a full manifest and the original KEK; restore
also verifies the supplied minimum backup floor and requires a new
destination. The adapter performs none of these recovery operations. It
does not download the snapshot, retain an off-site copy, include the KEK,
establish independent freshness or prove a successful recovery drill.

Executed verification was source/diff/tree/blob inspection, the correction
comparison, documentation-link checking and staged whitespace checking.
No runtime suite, native probe, browser execution, dependency audit or
vulnerability reproduction was performed by this worker. No new dependency,
transport helper, key loader or server source changed in the reviewed delta.
Author test results and hosted qualification remain separate evidence. The
previous candidate's passing CI is not a pass for this new source.

The feature and correction commits have matching author/DCO trailers. Older
provenance gaps, including the unsigned-off `a5e5d19` contribution, are not
retroactively attested here. POSIX/macOS ACL custody, native-platform evidence,
secret-runtime erasure, unresolved protocol/governance contracts and formal
sensitive-change approvals remain the existing gates.

## Fresh-worker handoff

For the published composition, compare its actual tree with the reviewed
feature and correction, preserve this source-bound receipt, and obtain the
new source's hosted platform results. If job inspection is extended later,
bind the requested and returned job IDs while preserving other job kinds'
distinct result schemas; keep links as data. No further runtime repair is
requested by this review. Reopen a finding only for a concrete new delta or
new evidence, without repeating unchanged broad suites.
