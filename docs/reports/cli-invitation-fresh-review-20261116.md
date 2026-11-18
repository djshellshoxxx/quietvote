# Independent invitation CLI review — 2026-11-16

Reviewed implementation: `1596ce8b61e4a13ce34b92c9550f5bedba15ec00`.
Reviewer repair: `7092ddb9f36776abc5338bb54644eaa651f74b4f`.
This is AI-assisted source and runtime review of count-only invitation issuance,
not an external security audit or final-candidate qualification.

## Scope and findings

The review checked the explicit modern registration scheme, election ID/origin
binding, existing signed-request audience/key framing, count/idempotency bounds,
exclusive output reservation, response size/schema/canonical bearer validation,
redacted retries, secret-safe terminal output and absence of automatic retries.
The combined election test's new invitation/enrollment segment invokes the actual
CLI commands and starts its voting deadline only afterward. Its verification tail
was not changed by this review.

Three independent regressions reproduced failures on the original implementation:

1. Another process can rename the reserved private output and replace its pathname
   while HTTP issuance is pending. The descriptor receives the returned codes but
   the original implementation incorrectly reports success for the replacement.
2. Replacing the reservation during the protected-key passphrase prompt still
   allows the subsequent POST, even though the intended output is already lost.
3. Widening the reserved inode's POSIX permissions before the response causes
   bearer codes to be written into a file that is no longer private.

The repair adds a pre-send callback after credential/KDF work and immediately
before fetch. It requires a regular descriptor with one link, private POSIX mode,
and matching `lstat`/`fstat` device/inode identity. Before writing, the descriptor
must remain private and singly linked. A renamed but still private inode retains
received bytes; the replacement is untouched and the command reports uncertain
output binding rather than success. An unlinked, multiply linked or nonprivate
descriptor receives no returned bearer bytes. The pathname binding is checked
again before reporting success. No tokens are copied into the error messages.

A fourth independent probe confirms that successful malformed UTF-8 bytes are
preserved byte-for-byte in the private output and rejected without a success
verdict or token disclosure. The response parser is not used to silently repair
or discard the only received invitation credentials.

## Executed evidence

| Source/check | Result |
|---|---|
| Original `1596ce8` with four new review probes | 3 failures reproduced, 1 pass; exit 1 |
| Repaired source: invitation creation, enrollment and review files | 12 tests passed, no failures/skips, 3.668 seconds; exit 0 |
| `NODE_OPTIONS=--max-old-space-size=512 npm run typecheck` | Passed |
| `git diff --check` | Passed |

Command: `node --test --test-concurrency=1 packages/cli/test/invites-review.test.ts packages/cli/test/invites-create.test.ts packages/cli/test/enrollment.test.ts`.
The existing suite includes an actual issuer executable and real HTTP server;
the four new probes exercise controlled filesystem/network interleavings through
the shipped CLI dispatcher. No expectation or acceptance gate was weakened.

## Independent author cross-review

The implementation author independently reviewed exact repair `7092ddb` and ran
all four new regressions on their equivalent cherry-pick `dc41c01`: 4 passed,
0 failed, 0.669 seconds. They confirmed the pre-send check runs after unlock and
outside the network-error handler, preserving a known-not-sent refusal; no scoped
blocker was found. Integrate `7092ddb` once, not its `dc41c01` alias.

## Handoff and boundaries

Integrate the original implementation and its author handoff, then `7092ddb` and
this review note. Qualify the combined executable election on the exact integrated
source after the separate missing-log verdict changes. This review did not rerun
the ten-minute election or claim its later result.

File identity checks detect changes at the observed boundaries; they do not claim
protection from a hostile privileged process racing every filesystem operation.
File fsync is not a complete power-loss/storage qualification. POSIX mode checks
do not establish Windows ACL privacy; supported-platform evidence remains separate.
Lost network responses still cannot recover redacted invitation codes or justify
an automatic new issuance. The command keeps explicit pending/uncertain evidence
and requires inspection of server state before any retry. No further blocker was
found within the reviewed scope.
