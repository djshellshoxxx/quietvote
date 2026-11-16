# CLI invitation issuance and enrollment handoff — 2026-11-16

Implementation: `1596ce8b61e4a13ce34b92c9550f5bedba15ec00`, based on
`f7dd48f`. The prior modern registration implementation is already in that base.
This is a narrow CLI-parity milestone, not release qualification.

## Delivered behavior

`qv online invites-create` uses the existing signed count-only management route
used by the web organizer. It requires an explicit election, count from 1 to 1000,
organizer key/audience, idempotency key and private output path. It validates the
public election ID, deterministic origin and `hashed-pop-v1` scheme before
loading credentials or attempting issuance. Optional read-key-file access follows
the existing client convention.

The command reserves a new file exclusively with mode `0600`, writes and flushes
a public pending-operation marker, then sends exactly one mutation. No existing
file, directory or symlink is overwritten. The successful HTTP response is
bounded to 256 KiB and saved/flushed to that reserved descriptor before parsing;
this retains any actual credentials even when the success response is malformed.
Success requires exactly the requested number of distinct invitation IDs and
canonical 16-byte base64url codes, with a closed count-only response schema.
Stdout contains only the output path, election ID, count and invitation IDs.
Mutation error bodies are never echoed, even in a server-controlled error-code
field. Temporary decoded token and successful response buffers are wiped.

No retry is automatic. A pending marker means there is no confirmed saved batch;
it does not prove that the server did not receive or commit the request. HTTP
rejections, network ambiguity and oversized responses retain that marker.
Malformed or redacted HTTP-success bytes remain in the private file, with exit 1.
The server intentionally excludes raw codes from idempotent replay. Inspect the
reserved file and server state before retrying; choosing another idempotency key
can create another batch. Storage errors or a lost response still cannot guarantee
raw-code recovery, and the implementation makes no power-loss guarantee.

The combined all-clients executable election now invokes actual `invites-create`
and `enroll` commands for all three voters. Enrollment validates the returned
voter identity, and issuance stdout is checked for bearer leakage. The real-clock
voting deadline still begins only after key provisioning and enrollment. The
organization bootstrap and public manifest choices remain fixture inputs; no
cryptographic/DKG/ballot/tally artifacts are fabricated by this change.

## Validation and review

On the frozen implementation:

- Root TypeScript typecheck passed.
- Invitation and existing enrollment tests: 8 passed, 0 failed/cancelled/skipped,
  2.019 seconds. Seven tests are new invitation-specific cases.
- Links: 1302 links across 245 files, none broken at the implementation freeze.
- `git diff --check` passed.

The tests invoke an actual issuer process against a real server, inspect the
private output permissions and stored invitations, and prove redacted replay
does not issue another batch or pretend to recover codes. Hostile probes cover
reservation before POST, invalid count, existing output/parent failures,
symlink refusal, metadata/scheme mismatch, canonical and duplicate bearer
validation, secret-bearing HTTP errors, response-size bounds and no retry after
network ambiguity. The symlink probe is POSIX-specific; no Windows ACL or
supported-platform qualification is claimed.

The full ten-minute executable election was deliberately not rerun in this lane;
the integrator's final hosted CLI suite must execute its updated issuance and
enrollment segment together with the independently changing verification tail.
Fresh review was requested from `cli_invitation_review`; its receipt is separate.

## Integration and remaining boundaries

Cherry-pick the implementation once, then this documentation commit. Preserve
the P1 worker's verification-tail changes in
`packages/cli/test/all-clients-executable.test.ts` and its unrelated CLI command
imports/help entries. Shared `request()` defaults remain unchanged; only the new
command selects a smaller response limit.

This does not convert legacy invitations, send messages, implement group/label
membership, resolve D99 pinned-roll admission, add invite-to-voter linkage or
recover a raw credential from its stored one-way verifier. It mirrors the web's
count-only issuance flow; optional contact/label/delivery administration remains
outside this command. See the current
[registration handoff](QUIETVOTE-REGISTRATION-20261116.md) for those contracts.
