# Independent organization CLI code review — November 19, 2026

## Reviewed source

| Identity | Value |
| --- | --- |
| Candidate commit | `c9d59e3175bb876176de1a5edef76aadeed8fbd6` |
| Complete candidate tree | `68a449a95a9118477429c8d0e25b64dc41ab1f56` |
| Feature commit | `c9d59e3175bb876176de1a5edef76aadeed8fbd6` |
| Review scope | `cmd-online-org.ts`, its main dispatcher/help integration, CLI documentation and organization tests, with existing request authentication and server organization handlers as references |

This fresh worker independently checked the accepted contract before implementation, then fast-forwarded an isolated worktree to the committed feature and inspected its actual source. It made no production or test changes. The included favicon repair and earlier runtime, browser and private-file repairs are outside this review's new scope; their other receipts retain their own source identities.

## Contract and code assessment

**No concrete functional blocker was found in the reviewed adapter.**

The [owner decision register](../plan/DECISIONS-2026-11-04.md#n-20--organizeradmin-auth-mismatch-d-84) and [accepted QV-ADR-027](../decision-log.md#qv-adr-027--owner-approval-of-the-2026-11-04-decision-register-categories-ad) support the QV-08 signed-request default. The current server and web client already implement self-signed organization creation. Adding the CLI adapter does not choose a new authentication protocol despite the remaining historical challenge/session prose in QV-09.

The reviewed behavior is consistent with those existing handlers:

- Creation supplies the public key derived from the loaded key as `owner_key` and signs the same body with that key through the existing request helper. The response must name the expected board-derived key ID and `org_owner` role.
- The name limit follows the server's JavaScript string-length convention and NUL refusal. The token file preserves spelling, spaces and a literal leading BOM, except for the documented single terminal LF/CRLF. Its nonempty one-line format is explicitly a narrower CLI input format than the server's general string field.
- The create command requires a stable idempotency key and leaves replay handling to the existing server journal. It adds no automatic mutation retry, new role, endpoint or session state.
- The existing command-owned signer helper ensures one unlock. Its `finally` wipes the mutable seed buffer after command settlement, including failures. This is a source-level lifecycle conclusion, not a claim that JavaScript strings, runtime copies or all secret representations are erasable.
- Success checks the assigned organization ID's format, the exact requested name and the owner-key binding. It prints a constructed public-field object instead of the complete response. Failure paths use static text for token-bearing requests. The assigned organization ID remains server-provided metadata: output filtering does not independently authenticate that assignment or establish complete information-flow isolation from an arbitrary server.
- Inspection validates a path-safe organization ID and uses the same signed management helper and existing server authorization. The helper continues to enforce audience binding, timeout and redirect refusal.
- Main-command dispatch and help expose the new commands without changing the existing export or election command dispatch.

## Independent execution

The unchanged focused files ran together on the exact candidate above:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec \
  packages/cli/test/organizations.test.ts \
  packages/cli/test/request-auth-compat.test.ts
```

**Observed result: 5 passed, 0 failed, 0 skipped, 0 cancelled; exit 0; 2.921 seconds.**

These five cases exercise the real CLI executable with a protected owner key and stdin passphrase, the real server's organization-to-first-election workflow, explicit replay and changed-body refusal, registration policies, exact token spelling, rejected input, output field selection and existing request-signing compatibility. The source also checks one attempted mutation for each covered failure path. The fixture's output checks support those selected scenarios, not a universal assertion about every possible response from an arbitrary server.

Dependency preparation reused the installed pinned dependencies in the isolated worktree. The vendor check passed for two pinned packages and 132 verbatim files before the feature fast-forward; that fast-forward changed no dependency manifest, lockfile, vendor source or resolution target. A final whitespace check passed for this report.

The author's four-case feature run and eleven-case affected batch are separate, overlapping evidence. This independent five-case result is not added to them as a unique full-suite total. No assertion, test timeout or production deadline was relaxed.

## Limits and successor handoff

Whole-repository TypeScript, browser execution and native Windows/macOS filesystem qualification were not repeated by this worker. The author's bounded TypeScript receipt remains in the [implementation report](cli-organization-enrollment-20261119.md); it is not relabeled as an independent compiler result here.

The next reviewer should compare any later adapter or helper changes against this source and inspect actual hosted results for the published composed head. New evidence should identify its exact source and preserve unresolved native ACL, formal sensitive-change review and historical contribution-provenance boundaries. Agent engineering review supplies no formal security-reviewer appointment or release approval.

The separately stopped background-gossip investigation was not resumed, and its untracked test was neither inspected nor used.
