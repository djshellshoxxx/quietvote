# Trustee cleanup permission continuation

Date: 2026-11-19 (America/Los_Angeles). Agent: `/root/security_audit_r1`.
This follows native transport commit
`b03e00856dcb8f595b505ce20d8aa871e49f2127` without changing its Windows
permission provider or operation timeouts.

## Resulting behavior

Trustee cleanup now checks the same POSIX directory ownership and mode/sticky
policy already required for file publication. Inspection creates no temporary
file or directory. An unsafe ancestor causes cleanup to return false before
overwrite randomness, file writes or removal. Existing callers retain their
manual-recovery behavior for a backup that was not safely removed.

The shared helper exposes that existing permission check independently of stage
creation; both package-local copies remain byte-identical. Cleanup resolves its
input once before asynchronous work so a later caller cwd change cannot redirect
the operation. Existing symlink, hardlink, fingerprint and file-identity refusal
checks remain in place.

This is the existing effective-POSIX-permissions boundary, including trusted
current effective UID/root. It does not inspect overriding native ACL grants and
does not close the macOS/native ACL limitation recorded in
[the earlier source review](../audits/INDEPENDENT_TRUSTEE_PUBLICATION_SOURCE.md).
Windows namespace custody is outside this POSIX change.

## Source-bound verification

Linux, Node 24.22.3, using the unchanged package dependency lock and verified
vendor copies:

- The new unsafe-ancestor regression failed against the pre-repair `shred`
  implementation: cleanup returned true instead of false. The repaired case
  passes, confirms unchanged file bytes and confirms no overwrite callback ran.
  Its trusted sticky-parent control still completes ordinary cleanup.
- Four affected private-file/publication files: **21 pass, 0 fail, 0 skip**.
  This includes relative-path cleanup while cwd changes and retains the previous
  publication, permission, identity and substitution regressions.
- Adjacent backup/destruction/custody cases: **11 pass, 0 fail, 0 skip**.
  They cover replacement preservation, rollback cleanup, concurrent backup
  exclusivity, moved backups and resumable destruction.
- Strict eight-root TypeScript checking passed with a 256 MiB compiler heap;
  `git diff --check` passed. The roots cover both native bridges, both POSIX
  helper copies, trustee file utilities and the changed TypeScript tests.

Commands:

```sh
node --test --test-concurrency=1 --test-reporter=spec packages/trustee/test/private-files.test.ts packages/cli/test/private-files.test.ts packages/cli/test/private-file-publication.test.ts packages/trustee/test/private-file-publication.test.ts
node --test --test-concurrency=1 --test-reporter=spec --test-name-pattern='^TR-08:|^B2-08:|^custody:' packages/trustee/test/custody.test.ts
```

These receipts overlap the earlier private-file evidence and are not added to
it as a unique-test total. They do not qualify native Windows or macOS ACL APIs.

## Next independent review

Check both native transport changes and this cleanup permission change in the
integrated candidate. Preserve the explicit native ACL boundary. Inspect the
new Windows Node 22/24 jobs for the real concurrent-backup and relative-path
cases; mocked transport tests cannot supply those native results. The separate
server fixture UNAVAILABLE result remains open until final-source hosted logs
identify whether it persists and why. No retry, assertion removal or timeout
increase is included here.
