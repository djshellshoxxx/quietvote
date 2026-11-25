# Recorded export signing-key continuation

Date: November 19, 2026 (America/Los_Angeles). Agent: `/root/security_audit_r2`.
Supplement base: `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab`.

## Finding and repair

The published recorded-export commands loaded a protected signing key separately
for the metadata request and the download or acknowledgement request. A real
stdin stream is exhausted after the first passphrase read. A caller supplying
`--passphrase-stdin` therefore received `wrong passphrase or damaged key file`
before the second request, despite supplying the correct passphrase. Interactive
use also requested a second unlock.

Two focused regressions exercise the actual CLI dispatcher with a protected
QVKEY1 fixture and an input provider that returns its passphrase once, then EOF.
Both failed on the published base with exit 4. The unchanged cases pass after the
repair, require exactly one read and two signed requests, and check the resulting
archive or confirmed acknowledgement.

Download and acknowledgement now own one unlocked key for their complete
two-request operation. The shared request helper accepts that command-owned key
without destroying it after the first signature. A `finally` block wipes its
seed buffer on command success or failure. There is no process-wide key cache.
Ordinary single-request callers retain their existing per-request key loading
and immediate seed-buffer wipe after signing. This is a source-level buffer
lifetime property, not a claim that a JavaScript runtime erases every temporary
copy of secret material.

The published command names, response fields, module split and deletion-notice
interface are retained. Acknowledgement still requires the explicit `--retained`
statement and checks the retained file again immediately before its POST.
Downloads remain distinct from acknowledgements. IDs construct same-origin
routes, response URLs do not choose the destination, redirects remain refused,
and ambiguous mutations are not retried. The 64 MiB archive bound, 64 KiB metadata
bound, strict checksummed archive validation and binding checks are unchanged.
These checks do not supply an independent election verdict or prove future
off-site retention.

Relevant sources are [the command transport](../../packages/cli/src/cmd-online.ts),
[recorded-export commands](../../packages/cli/src/cmd-online-exports.ts),
[regressions](../../packages/cli/test/recorded-exports.test.ts), and
[the CLI guide](../../packages/cli/README.md#recorded-public-export-management).

## Verification on the supplement

Linux, Node 24.22.3, with unchanged dependency locks and verified vendor copies:

- Before repair: the two protected stdin cases both failed with exit 4.
- After repair: those same two cases passed with one passphrase read each.
- The serial command below passed **19 tests**, with zero failures, skips or
  cancellations, in 41.01 seconds. It includes the full existing recorded-export
  HTTP workflow, signed online commands, request-signing compatibility, and
  invitation output reservation and ambiguous-response handling.
- Strict TypeScript checking rooted at the CLI dispatcher and recorded-export
  test passed with the repository's unchanged base compiler options, transitive
  imports, and a 512 MiB compiler heap.
- Dependency checks found no new violations; the two existing D-97 declarations
  remain. Vendor checking passed for two pinned packages and 132 verbatim files.
- `git diff --check` passed. No assertion or timeout was relaxed.

```sh
node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec packages/cli/test/recorded-exports.test.ts packages/cli/test/request-auth-compat.test.ts packages/cli/test/online.test.ts packages/cli/test/invites-create.test.ts
```

These results apply to the source and tests included with this report. The
two-case run overlaps the 19-test run and is not an additional unique-test total.

## Earlier independent review and source consolidation

The first review composition combined CLI feature
`dc2b7811abbac2e3a8b0876bf8e26138c0cae7c5`, native continuation
`b03e00856dcb8f595b505ce20d8aa871e49f2127`, and POSIX cleanup continuation
`bd0c410b8f85082b44015d1fed0b7a6428fd4222`. Its review-only head was
`dbc085ab9e855b12efc1ae64f744e7dfba6cc972`, tree
`38662ce51960660436076f175226554466522030`. Independent serial recorded-export,
native-transport-wrapper, CLI publication, trustee private-file and trustee
publication tests passed **21 tests**, with zero failures, skips or cancellations.
The wrapper's nested transport cases are not added to that count.

A concurrent published update supplied the separate `cmd-online-exports.ts`
implementation and the stronger native helper shutdown. The supplement therefore
starts from the published head and ports only the useful signing-key lifetime
behavior; it does not replace those commands with the earlier implementation.

The published native bridge already serializes operations before selecting a
shared helper, avoids the caller's working directory, and waits for child close
with a bounded `CLEANUP` refusal. The earlier native continuation overlaps the
first two changes and must not overwrite the published close behavior. Source
review found the earlier POSIX cleanup permission guard coherent with the
existing publication policy; its integration is handled separately from this
CLI supplement.

The earlier 21-test result belongs only to that earlier composition. Linux
transport mocks do not qualify Windows APIs, and POSIX mode checks do not
establish native macOS ACL coverage. Hosted native Windows and the full combined
candidate matrix still require results tied to their exact source. This focused
review is not a formal sensitive-change approval or an independent cryptographic
audit.
