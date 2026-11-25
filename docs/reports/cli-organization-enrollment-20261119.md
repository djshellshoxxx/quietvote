# CLI organization enrollment — November 19, 2026

## Accepted scope

The CLI README listed organization account enrollment as a remaining workflow gap. The server and web client already implement organization registration with the QV-08 signed-request contract. The approved owner register, [N-20 / D-84](../plan/DECISIONS-2026-11-04.md#n-20--organizeradmin-auth-mismatch-d-84), adopts this contract through QV-ADR-027. Older QV-09 challenge/session prose is not a reason to introduce a second authentication mechanism.

This feature adds `qv online org-create` and `qv online org-inspect`. It changes no server endpoint, authentication framing, role policy, protocol field, dependency or migration. Creation signs with the same key supplied as `owner_key`, requires an explicit audience and idempotency key, and follows the server's open/token/closed registration policy. The resulting organization ID can be used by the existing election creation command.

## Input and result handling

- The existing protected-key loader is used once, including for stdin passphrases. The command owns the key and wipes its mutable seed buffer in `finally`.
- Optional registration tokens come only from `--registration-token-file`, a bounded owner-private UTF-8 file. The CLI accepts one nonempty line of 1..200 JavaScript string units; a single terminal LF or CRLF is removed. Spaces, case and a literal leading BOM are preserved. This documented client format is narrower than the server's general string field, which can represent an empty or multiline configured token.
- Registration-token bytes are wiped after decoding. JavaScript strings and runtime copies are not reliably erasable; this is not a complete memory-erasure guarantee.
- A successful create response must identify a lowercase base32 organization ID, the requested name and exactly the expected owner key. Only those public fields are printed. Extra response fields are discarded.
- Token-bearing mutation errors are replaced with static text; server error codes and response fields are not copied into that error text. The organization ID remains server-assigned metadata checked for its format, not independently authenticated content. Requests retain redirect refusal, the configured timeout and a 64 KiB creation-response cap.
- An identical, explicitly repeated request uses the server's existing idempotent result. Mutations are never retried automatically. A changed body under the same idempotency key remains a refusal.

## Verification

Four workflow tests were added before implementation; all four failed on the prior candidate because the commands were absent. The unchanged substantive cases passed after implementation, with an additional exact-token BOM case added before the final batch.

The new tests cover:

1. The real CLI executable reading a protected owner passphrase from stdin, registering an organization on the real server, an explicit idempotent replay, changed-body refusal, inspection and creation of the organization's first election.
2. Real token-gated and closed server modes, missing/wrong token refusal and preservation of spaces/case/BOM with a terminal CRLF.
3. Invalid names/IDs/flags and malformed, oversized or nonprivate token files, with no network request.
4. Response binding, public-field output selection, static token-safe errors and exactly one attempted mutation under failure.

Final serial affected batch: **11/11 passed**, zero failures/skips/cancellations, exit 0, 10.669 seconds. It comprised `organizations.test.ts`, `recorded-exports.test.ts` and `request-auth-compat.test.ts`. These counts overlap the earlier four-case feature run.

A strict TypeScript scope rooted at CLI `main.ts` and the new organization test, including transitive imports, passed with no diagnostics and a 512 MiB compiler cap.

## Fresh-worker handoff

Code and security workers independently checked the adopted contract before implementation. They will review the committed source and record separate exact-source test receipts. Review the owner identity binding, token-file interpretation, ambiguous failure behavior, idempotent recovery and interaction with the existing election creation workflow. Native Windows/macOS and full current-head hosted qualification remain separate gates. This adapter does not add organization key rotation, account recovery, group membership governance, backup/restore or a new authentication protocol.
