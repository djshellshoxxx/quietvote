# Election enrollment implementation — 2026-11-16

This continuation implements the accepted QV-ADR-028 wire contract and the
specific QV-ADR-027/B2-10 default-expiry/error-policy choices. The historical
2026-10-30 hold and the 2026-11-09 task's retained hold are provenance, not a
reason to ignore the recorded approval in this completion task. Independent
protocol/security review remains required before merge or non-experimental use.

## Exact modern contract

Let `T` be 16 random bytes, `C = b64u(T)`, `H = SHA-256(T)`, `I` the 32-character
lowercase-hex API election ID, and `P` the raw 32-byte Ed25519 public key.

| Component | Exact bytes / behavior |
|---|---|
| Issuance | Return canonical unpadded base64url `C` once to the organizer. New invites default to `issued_at + 14 days`; an explicit expiry overrides the default. |
| Redemption | `{invite_code: b64u(H), pk: b64u(P), alg: "ed25519", pop: b64u(signature)}`; exact widths and canonical encodings required. |
| PoP | Ordinary Ed25519 over `UTF8("QV-REG-v1") || 0x00 || UTF8(I) || 0x00 || H || P` (107 bytes). Shared implementation: `packages/protocol/src/registration.ts`. |
| At-rest verifier | `SHA-256(UTF8("QV-INVITE-HASH-v1") || 0x00 || H)`; the fixed-width `H` is raw bytes, not encoded text. |
| Scheme selection | Server uses only persisted `election.registration_scheme`. No client selector, length-based mode inference or try-both-signatures fallback. |
| Success | Browser/CLI require the returned `voter_kid` to equal the submitted public key's board author ID and status to be `approved` or `pending`. They retain/print only these two fields. |

The extra at-rest domain is an implementation refinement, not wording that
ADR-028 already specified. `H` is itself a usable enrollment bearer: theft of a
database storing `H` directly would permit registration with the thief's own key.
The extra hash preserves the former stored-verifier theft barrier. A compromised
live server still sees `H`; issuance itself generates and returns the raw code.
The claim is only that redemption omits `T/C`, not that all traffic or the server
never sees usable credentials.

Unknown, revoked and used-with-new-key invitations return `409 INVITE_USED`.
Expired invitations return `422 INVITE_EXPIRED`, including the exact recorded deadline. Unknown/revoked/consumed refusals use the same problem body apart from the request ID and perform the same key/invite lookup shape; this is not a measured constant-time claim. Shape/signature failures remain
separate. Consumption and voter insertion share the same SQLite transaction;
concurrent distinct-key attempts cannot create two voters from one invitation.

## Durable compatibility boundary

Schema 9 adds a checked `registration_scheme` column with default
`legacy-raw-v1`. Thus existing databases keep the original raw-code/old-PoP
contract and their outstanding hashes, expiry, registered voters and roll state.
Only the new-election creation transaction selects `hashed-pop-v1` explicitly.
Draft/public input cannot change that column. Imported mirrors still refuse
registration. The private backup floor preserves the scheme, including when
there are no invitation rows.

There is no mathematical migration from the old stored
`SHA-256(UTF8("QV-INVITE-v1") || 0x00 || UTF8(C))` to `H`. The authenticated
`GET /api/v1/elections/:id/registration-migration` reports scheme, outstanding
invitations, voter count and `automatic_conversion:false`, without returning
tokens or modifying rows. Its CLI counterpart is `qv online registration-preview`.

Operators can preserve an old election and its existing clients, or create a new
modern election. A future in-place cutover would need explicit revocation/reissue,
preview, confirmation and rollback-floor treatment; no such destructive action
is performed or implied here. Modern clients refuse absent, unknown or legacy
scheme metadata before sending the bearer. CLI additionally checks the returned
election ID and derived board origin before reading invite/key files; web checks
the same metadata before POST.

## Connected workflow

The browser previously required completed DKG and roll context before showing
key enrollment, although registration closes at roll commitment. An explicit
invitation now opens the existing key creation/import/recovery controls before
ceremony, including the first voter in a draft election. This path registers a
key only; it cannot cast, claim roll membership or certify a manifest. Voting and
receipt paths retain full context verification. Unknown/legacy enrollment shows
an invitation-update message. Native translation review flags remain unchanged.

`qv online enroll` uses an invite file, never a token argument. The input must be
a bounded regular UTF-8 file; nonblocking/no-follow opening prevents FIFO hangs
and symlink substitution. It signs the same binding as the browser, preserves
private-key wiping and does not automatically retry ambiguous network failures.

`packages/web/e2e/registration.ts` is an additional required hosted-browser
journey: first-voter enrollment before manifest, saved key/reload retry, exact
hashed wire credential, no raw token in requests, unknown/legacy scheme refusal,
mobile layout, CSP and no external requests. Local Chromium cannot start in the
current environment; the test is not claimed passing until hosted evidence exists.

## Remaining contracts

- **D99 pinned rolls:** the manifest contains only a Merkle root and size. No
  authoritative full pinned list or registration membership-proof field exists.
  The approved-voter table cannot identify absent members. This endpoint does
  not solve pinned membership admission or the pinned/approved-set commit conflict.
- **B2-10 retry linkage:** preserving the explicit no invite-to-voter relation
  means a used invitation plus any already registered key can return that key's
  status. It adds no second voter but does not establish the original redemption
  pair. A privacy-reviewed relationship policy remains needed for that guarantee.
- **Group/label membership:** this election endpoint is not QV-04's complete
  group-scoped enrollment, label binding, rotation or revocation contract.
- Legacy in-place conversion, independent review, supported-platform and human
  qualification remain separate evidence; this report is not release completion.

## Validation and fresh handoff

Starting source: `bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912` (PR #52 continuation).
The first integrated focused run passed 53 tests, covering modern registration,
actual CLI process, schema8 upgrade, restore downgrade refusal, complete HTTP
election, existing negative cases and earlier crash-recovery migrations. Review
then added response-identity validation, bounded regular invite-file input,
origin checks and the approved B2-10 policy; final rerun receipts are recorded in
the [milestone handoff](../handoffs/QUIETVOTE-REGISTRATION-20261116.md).

Fresh reviewer owns independent bearer-theft, canonical-encoding, forged-success,
scheme-metadata and filesystem probes. Existing vectors and expected protocol
reports are not modified by this lane.
