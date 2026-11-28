# Invitation token width: compatibility decision required

**Status:** Unadopted. This records a concrete conflict; it authorizes no token-width, encoding or registration-scheme change.
**Reviewed:** 2026-11-27 (America/Vancouver), current implementation based on `5ae96e9`.

## Existing contracts conflict

[QV-29 section 6.4 and QV-29-REQ-008](../29-abuse-dos-prevention.md) specify 20 random bytes (160 bits),
with a `qvi1-` Crockford-base32 display/checksum format. That section also describes a different pending-registration
and token-record model. The older [server inventory task 8](../reports/inventory-20261111/server.tasks.md)
proposed an issuance-only increase from 16 to 20 bytes while retaining the existing registration framing.

The later [QV-09 section 3.3](../09-api-data-contracts.md), implementing [QV-ADR-028](../decision-log.md),
explicitly specifies a canonical unpadded base64url token `C = b64u(T)` with **16 random bytes** `T`.
The [2026-11-16 implementation addendum](../reports/registration-implementation-20261116.md) records the same exact contract.
Modern redemption sends `b64u(SHA-256(T))`, not `C`; the server checks the persisted `hashed-pop-v1` scheme,
uses the invite-bound 107-byte PoP message, and stores a separately domain-separated verifier.
Legacy elections retain `legacy-raw-v1`, raw `C`, the old PoP and their existing verifier/expiry records.

[QV-ADR-027/B2-10](../plan/DECISIONS-2026-11-04.md) selected the 14-day default and the unknown/used failure policy.
It does not resolve the later exact-width contract against QV-29. Completing the independent new-issuance 30-day lifetime
cap therefore does not imply adoption of 20-byte tokens or the rest of QV-29's different registration design.

## Concrete compatibility boundaries

These are actual input checks, not only comments or sample data:

| Consumer | Current gate | Effect of an issuance-only change to 20 bytes |
|---|---|---|
| [Web fragment parser](../../packages/web/src/flow/invite.ts), `parseFragment` | Canonical base64url decoding must yield exactly 16 bytes. | New invitation links have no accepted token. |
| [Web enrollment builder](../../packages/web/src/flow/onboarding.ts), `registrationBody` | `a.token.length !== 16` is refused before hashing/signing. | Direct 20-byte enrollment input is refused. |
| [CLI enrollment](../../packages/cli/src/cmd-online.ts), `cmdOnlineEnroll` | Invite-file token must be canonical base64url of exactly 16 bytes. | New invitation files are refused. |
| [CLI invite creation](../../packages/cli/src/cmd-online.ts), `cmdOnlineInvitesCreate` | Every returned code must canonically decode to exactly 16 bytes. | Issuance succeeds on the server but the CLI reports an invalid response; its private output preserves recovery evidence. |
| [Legacy server redemption](../../packages/server/src/app.ts), registration handler | `canonicalB64u` requires 16 bytes for `legacy-raw-v1`, versus 32 bytes for a modern hashed bearer. | A new 20-byte legacy invitation cannot be redeemed. |

Modern registration already consumes a 32-byte hash, so changing raw-token width need not change the modern PoP bytes,
at-rest hash framing or wire bearer width. It does change organizer output, invitation links/files and client validation.
An already distributed 16-byte token remains a usable artifact; widening issuance must not silently invalidate it.

## Options requiring a later decision

1. **Retain the exact current width for existing schemes.** Keep current clients, links, files and legacy issuance intact;
   record the older 160-bit requirement as unmet for these schemes. A future format can address it separately.
2. **Stage a compatible modern input expansion.** First teach modern clients to accept canonical 16- and 20-byte raw tokens,
   preserving old artifacts, then adopt 20-byte issuance for `hashed-pop-v1`. Keep `legacy-raw-v1` issuance at 16 bytes and
   retain its old hash/PoP path. The rollout must handle older clients that reject new tokens; the exact documentation and
   advertised capability/version policy need approval. Modern wire hashing and PoP framing can remain unchanged.
3. **Introduce an explicitly versioned issuance contract.** Advertise a new token format/capability or persisted scheme,
   with fail-closed negotiation for old clients. Preserve existing elections and outstanding artifacts under their original
   rules. Any migration must state how outstanding invitations, backups and rollback protection are handled; no implicit
   conversion or bulk revocation follows from this RFC.

Adopting the full `qvi1-` display/checksum format is an additional design choice, not a consequence of selecting 20 random bytes.
No option here changes already stored expiry deadlines, weakens canonical encoding checks, exposes raw tokens in redemption,
or authorizes a new fallback between registration signature schemes.

## Evidence required before adoption

Exercise old and new links/files through actual web and CLI entry points, both permitted raw widths where applicable,
canonical-encoding negatives, unchanged modern hash/PoP framing, legacy 16-byte redemption, backup/reopen behavior and
old-client refusal. Issuance must remain recoverable when a client cannot parse the returned token. Review the normative
documentation and protocol compatibility boundary before claiming the older 160-bit requirement complete.
