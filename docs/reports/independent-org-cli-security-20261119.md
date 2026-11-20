# Independent organization CLI security review — November 19, 2026

Reviewer: `/root/security_audit_r4`, separate from the feature author.
Date uses America/Los_Angeles. This is an independent agent engineering review,
not a formal sensitive-change approval or an external cryptographic audit.

## Disposition and exact source

**No additional blocking issue was found in the scoped organization CLI change.**
The selected existing tests passed on the committed feature. This receipt does
not qualify unrelated parts of the candidate or unexecuted native platforms.

| Identity | Value |
| --- | --- |
| Reviewed and executed candidate | `c9d59e3175bb876176de1a5edef76aadeed8fbd6` |
| Complete candidate tree | `68a449a95a9118477429c8d0e25b64dc41ab1f56` |
| Feature | `feat(cli): complete organization enrollment and inspection` |
| Reviewer worktree | Isolated branch `codex/qv-security-bd157-r4` |

The review covered the new organization adapter, dispatch/help, feature tests
and README, together with the unchanged key loader, signed-request helper,
private-input reader and server organization routes they use. No production or
test changes were needed. The inherited favicon change and earlier pool,
navigation, native-diagnostic and POSIX supplements retain their own receipts.

## Source assessment

### Contract and signing-key ownership

The approved [N-20 / D-84 decision](../plan/DECISIONS-2026-11-04.md#n-20--organizeradmin-auth-mismatch-d-84)
selects the QV-08 signed-request contract. The server and web client already use
that contract for organization registration. This adapter adds no new session,
authority, protocol framing or server endpoint.

Creation constructs `owner_key.pk` from the same loaded key used to sign the
request. The existing server verifier binds that public key and its key ID to
the signed request body. The success check uses the server's full
`b64u(authorKeyId('ed25519', publicKey))` identity, rather than the keyfile UI's
short display fingerprint.

The command calls the existing `withManagementKey` owner once. That owner's
`finally` wipes the mutable seed buffer after success or any callback failure.
There is no new process-wide credential cache or second stdin passphrase read.
This is source-level buffer-lifetime evidence, not proof that JavaScript erases
every string, temporary copy or cryptographic intermediate.

### Registration token and transport

The optional token is read through the existing bounded owner-private input
provider. Fatal UTF-8 decoding preserves a literal leading BOM. The parser
removes only one final LF or CRLF; it preserves case and spaces and refuses an
empty, multiline, NUL-containing or over-200-unit value. Its temporary input
buffer is wiped in `finally`. The README and author report describe this
single-line client format; the server's broader general string field is not
silently redefined.

The constructed request uses the supplied origin, audience and idempotency key.
It retains the shared transport's redirect refusal, deadline and prohibition on
automatic mutation retry. Creation supplies a 64 KiB response bound. The
registration mode remains an actual server decision; the adapter introduces no
override of token-gated or closed registration.

### Response and error handling

All request `FailError` instances are replaced with fixed creation-failure text,
so the shared helper's otherwise permitted server error code cannot be copied
through this command's error path. Malformed success responses also produce
fixed text that preserves the uncertain-outcome condition.

Successful creation requires the requested name, expected sole owner key and
role, plus a correctly shaped organization ID. Output is constructed from that
restricted set of fields; arbitrary extra response fields are discarded. The
successful response byte buffer is wiped in `finally`.

**The organization ID remains server-assigned metadata.** Its format check is
not independent authentication of that metadata, and field filtering is not a
complete noninterference guarantee against a server choosing arbitrary values
inside allowed fields. This review's no-reflection conclusion concerns direct
token-input copying, discarded extras and static error paths. That distinction
was sent to the author for precise documentation wording.

## Independent verification

Linux, Node 24.22.3, on the exact candidate and tree above:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec --test-name-pattern='organization creation|organization input' packages/cli/test/organizations.test.ts
```

**3 passed, 0 failed, 0 skipped, 0 cancelled; exit 0; 0.780 seconds.** These
selected unchanged cases cover actual token-gated/closed server modes and exact
token spelling, invalid input before network activity, and benign response/error
fixtures checking output filtering and one attempted mutation. The protected-key
real-executable bootstrap case was outside this selected batch; it retains the
author and separate code review's evidence, rather than being counted here.

No new probe or reproduction was created. These three cases overlap the
author's feature batch and must not be added as a unique project test total.
The vendor checker also passed on this candidate: two pinned packages and 132
verbatim files. Whitespace checking passed. Dependencies and lockfiles were not
changed by this review.

## Remaining limits and successor handoff

The feature uses the existing private-file providers. Linux checks do not
qualify native Windows handles or resolve POSIX/macOS ACL grants beyond the
inspected mode policy. The existing JavaScript secret-erasure limitation remains.
This review did not run full-repository TypeScript, native browsers or the hosted
platform matrix, and did not change assertions, timeouts, protocol fields or
permission rules.

A successor should keep this finding tied to the exact source, compare any later
adapter/request/key-loader changes, and inspect current-source hosted results.
Preserve the distinction among local engineering review, native qualification
and the repository's required formal approvals. The separately stopped
background-gossip investigation was not inspected, resumed or used as evidence.
