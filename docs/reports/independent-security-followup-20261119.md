# Independent supplemental security review — November 19, 2026

Reviewer task: `/root/security_audit_r3`, separate from the implementation authors.
Date uses America/Los_Angeles. This is an engineering review, not a formal
sensitive-change approval or an external cryptographic audit.

## Disposition and exact source

**No additional blocking issue was identified in the scoped supplemental
changes.** Existing focused tests passed on the composed candidate. This finding
is limited to the source and behavior below; it is not a statement that the
complete project or every filesystem platform is qualified.

| Identity | Value |
| --- | --- |
| Published comparison base | `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab` |
| Reviewed and executed candidate | `17a4a8c8b4cc4ac1b0343d881595401e21866f8b` |
| Complete candidate tree | `f6f820130e92510b84b4282d4c5f9143aa63fc4c` |
| POSIX cleanup supplement | `e9f8ff3` |
| Export signing-key supplement | `17a4a8c` |

The reviewer used an isolated worktree and made no production or test changes.
This additive report is the only contribution from this review. Other workers
own the pool/browser review and the native process-diagnostic follow-up.

## Source assessment

### Trustee cleanup

The change in [trustee file utilities](../../packages/trustee/src/fsutil.ts)
resolves the cleanup path synchronously, before any asynchronous work. Later cwd
changes therefore cannot select another relative path. The existing regular-file,
link-count, canonical-path, fingerprint and held-file identity checks remain.

Before destructive work on POSIX, cleanup now applies the same directory
ownership and mode/sticky policy as publication. An `UNSAFE_DIRECTORY` refusal
returns false, preserving the caller's manual-recovery behavior. The reusable
inspection routine creates no staging artifact. Both package-local
`posix-staging.ts` copies were compared and remain byte-identical.

This source conclusion depends on the documented effective POSIX ownership and
permission model, including trusted current effective UID/root. It does not
establish protection from native ACL grants overriding the inspected mode bits.
The [prior source review's ACL boundary](../audits/INDEPENDENT_TRUSTEE_PUBLICATION_SOURCE.md)
therefore remains unresolved. The supplemental diff does not modify the native
Windows private-file bridge or supply Windows cleanup qualification.

### Export signing-key lifetime

[The request helper](../../packages/cli/src/cmd-online.ts) distinguishes a
request-owned key from a command-owned key. Single-request callers still load
their key and wipe the seed immediately after signing. The two multi-request
export commands use `withManagementKey`, which loads once and wipes its seed in
`finally` after the command's callback resolves or throws. Neither path adds a
process-wide key cache. The wipe implementation fills that seed buffer with
zeros; this is not proof that a JavaScript runtime erases every temporary secret
copy.

[The export commands](../../packages/cli/src/cmd-online-exports.ts) preserve the
published interfaces and validation. Download remains separate from explicit
retention acknowledgement. Acknowledgement still requires `--retained`, checks
the archive against recorded metadata, and re-reads and validates the retained
file immediately before sending the POST. The supplemental signer reuse does
not remove that check.

The reviewed transport still constructs destinations from the validated origin
and local paths, refuses redirects, bounds metadata/archive responses and does
not automatically retry an ambiguous mutation. The existing archive digest,
framing and election/tree checks remain. Matching an archive to server metadata
is not an independent election-verification verdict, and an acknowledgement
does not establish future off-site retention.

## Independent verification

Linux, Node **24.22.3**, at the exact candidate and tree recorded above. Installed
dependencies were copied into the isolated worktree without changing lockfiles;
the vendor checker verified the package bytes and their actual module resolution
there before tests ran.

| Check | Observed result |
| --- | --- |
| Existing recorded-export, request-auth and private-file tests below | **19 passed**, 0 failed, 0 skipped, 0 cancelled; exit 0; 7.79 seconds |
| Vendor check | Passed: 2 pinned packages, 132 verbatim files |
| Package-local POSIX helper comparison | Byte-identical |
| Supplemental native private-file bridge diff | No changes against the published comparison base |
| Whitespace check | Passed |

Executed command:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec packages/cli/test/recorded-exports.test.ts packages/cli/test/request-auth-compat.test.ts packages/trustee/test/private-files.test.ts packages/cli/test/private-files.test.ts
```

The batch includes both protected stdin export commands, their single-read/two-
request checks, the existing retained-file recheck and ambiguous-outcome checks,
POSIX cleanup refusal and ordinary completion, and cwd anchoring. All cases were
existing tests; this review added no new probe or reproduction. Its test count
overlaps earlier author evidence and must not be added as a unique project total.
Whole-project typechecking, native browser tests and hosted jobs were not run by
this reviewer. Prior author TypeScript results retain their separate attribution.

## Fresh-worker handoff

1. Keep this receipt tied to the recorded source. Review any later change to the
   scoped files before extending the conclusion to a newer candidate.
2. Obtain current-source hosted Windows results through the ordinary CI process;
   Linux execution does not qualify the native handle or ACL APIs. Preserve the
   published helper's operation serialization, stable cwd and bounded child-close
   behavior when integrating the separate diagnostic work.
3. Keep overriding POSIX/macOS ACL permissions as an unresolved implementation
   and qualification boundary. An ordinary platform matrix pass does not close it.
4. Preserve the distinction between this independent agent engineering review,
   author checks, hosted qualification and the repository's required formal
   approvals. This receipt neither appoints a reviewer nor authorizes a main merge.

The separately stopped background-gossip investigation was not inspected,
resumed or used as evidence by this reviewer.
