# Recorded PUBLIC export CLI implementation

## Scope

The API-only recorded-export slice in QV-09 section 10.1 now has an explicit
operator CLI workflow. Seven commands create an export job, inspect a job,
list/inspect records, download an exact snapshot, acknowledge a retained local
archive, and issue a deletion notice for an explicitly supplied tree/digest.
The base is PR #71 commit `3f0ea6549e2fdf7ffa462de3a4978cd369655458`.

This adds no endpoint, database migration, signed record, cryptographic domain,
deletion policy or automatic retry. The protocol verifier still determines
election correctness. The current CLI byte limit remains 64 MiB, even though the
server can retain larger snapshots; this is documented rather than silently
increasing the existing private-output limit.

## Behavior and boundaries

- All management traffic uses the existing QV-Sig request code, configured
  audience, bounded responses, redirect refusal and mutation ambiguity handling.
  URLs are built from validated election/export/job IDs. Server-returned links
  cannot redirect credentials or select another destination.
- Downloads check record identity, byte length, SHA-256, strict archive framing,
  member checksums, election origin and tree size/root. Existing output paths are
  refused. Output distinguishes `artifact_matches_record:true` from
  `verified:false`, and reports `acknowledged:false`.
- Acknowledgement requires `--retained`, an explicit idempotency key and a local
  archive. The artifact is checked again after key unlocking before any mutation.
  This is the operator's retention statement, not proof of an off-site backup.
- Deletion notices require explicit tree size/root/digest arguments. The server
  retains final-tree/lifecycle authority and the existing 30-day grace period.
  None of these CLI commands deletes the election.
- Management metadata legitimately contains `null` timestamps. An initial
  integration run exposed use of the stricter protocol QV-JSON parser for those
  responses. It was corrected to the existing management JSON profile; the
  artifact itself retains strict parsing. The test fixture now includes the
  nullable fields so this compatibility boundary remains exercised.

## Observed verification

`node --test --test-concurrency=1 --test-reporter=spec packages/cli/test/recorded-exports.test.ts`

- Initial implementation: 3 passed, 1 failed. The real executable download
  correctly exposed the nullable-metadata parser mismatch above.
- Repaired implementation: 4 passed, 0 failed, 0 skipped, 0 cancelled; exit 0.
  The test creates a real completed election, signs actual management requests,
  checks idempotent job creation/read/list, invokes the real CLI executable for
  download, proves it does not acknowledge, issues a notice, refuses a damaged
  retained file and a missing explicit retention statement, and checks repeated
  acknowledgement stability.
- Additional cases reject metadata identity/size/hash mismatch, a corrupt
  download and a checksum-consistent wrong election/tree. They show returned
  links are ignored, changed local bytes stop acknowledgement, and an ambiguous
  mutation is attempted only once.
- A whole-repository typecheck using the unchanged root tsconfig and a 512 MiB
  Node heap was killed with exit 137 without a TypeScript diagnostic. It is not
  a typecheck pass. Final integrated hosted qualification remains required.
- A bounded TypeScript check then passed with exit 0 and no diagnostics. Its
  temporary configuration extends the unchanged `tsconfig.base.json`, uses the
  installed Node types, and selects `packages/cli/src/main.ts` and
  `packages/cli/test/recorded-exports.test.ts` as roots with their transitive
  imports. No compiler rule or source assertion was suppressed. Node heap was
  bounded to 384 MiB. This qualifies that scope, not the whole root gate.
- Dependency boundaries and lockfile lint pass with no new violation. The two
  historical D-97 dependency deviations remain explicitly reported. Relative
  link checking passes: 2,077 links in 333 files, none broken.

## Successor review

Independently check acknowledgement against file replacement during unlocking,
response binding, authorization scope, partial/oversized downloads and malformed
archive metadata. Review whether the documented CLI limits are clear. Preserve
the server's exact retained-artifact condition and the distinction between
artifact matching, independent election verification and operator retention.
