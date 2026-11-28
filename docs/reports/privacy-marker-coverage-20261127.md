# T7 privacy marker lifecycle coverage

Date: 2026-11-27 (America/Vancouver). Base: `5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7`
on PR #75. This change adds tests and documentation only.

## Plan and result

The accepted task was to follow actual private data through invitation issuance,
enrollment, ballots, server storage, logs and exports. A schema inventory alone
cannot show whether a mixed response container stores an invitation label.
The test therefore inspects both actual durable response writers and their
output immediately after issuance, before expiry or cleanup can remove it.

The focused fixture passed. No private marker was found. No production correction
was needed for the exercised paths. The fixture covers six invitations: four
registered voters, one revoked invitation and one left unused past expiry. It
uses the adopted 16-byte token contract and an explicit one-day expiry, inside
the accepted 30-day issuance cap. Three trustees with threshold two conduct a
real DKG; four genuine signed/proved casts, one public spoil and one private spoil
are admitted over HTTP. The election closes, receives decryption shares, posts a
signed tally, archives and creates/downloads a persistent PUBLIC export.

## What is checked

| Surface or obligation | Distinguishing evidence |
|---|---|
| Raw server files | Recursive scan without file exclusions at issuance, after enrollment, during voting, after archive and after retention. Both control/election database, WAL and SHM files must actually be present. |
| Durable response containers | Actual `control.idempotency.response` and `election.operation_receipt.response` values are read as logical JSON as well as scanned in raw files. The invitation receipts must be exactly IDs plus `code_withheld:true`; neither codes nor labels are cached. |
| Server logs | The real server logger's captured sink is scanned at every storage phase, including retention summaries. Failure diagnostics contain marker/surface names, not marker values. |
| Exports | Default JSON, full-board JSON and QVB are downloaded during voting, after archive and after retention. The recorded export is scanned both as downloaded bytes and as the persisted snapshot. QVB members and base64 board bodies are decoded and scanned; JSON is also canonicalized for whitespace/key-order independence. |
| Private marker set | 42 families: six labels, six contacts, six raw invite codes, eleven client signing keys, three final trustee secret shares, four cast seeds and four private cast selection maps, plus the private spoil seed and selection map. Binary secrets are checked raw, lower/upper hex, base64, base64url and two common JSON byte-array forms. |
| Non-vacuous private inputs | Initial issuance actually returns the supplied labels/codes; both caches exist before cleanup; enrollment consumes four invitations; final trustee shares and ballot seeds are the actual client values used by the fixture. |
| Public data | Public contest text, aggregate tally record and the intentionally published spoil's seed/selection map must be present in the final JSON export. The public opening must also reach the scanner through decoded full-board/QVB/recorded-snapshot bodies. Bare option identifiers and aggregate counts are not treated as private markers. |
| Server-owned key | `kek/kek.bin` must exist and match the live server KEK. It remains part of the file scan, but the server KEK itself is not a forbidden client marker. |
| Retention | Registered contacts become NULL immediately; all six encrypted labels remain during grace. No premature purge occurs. After grace, registered/revoked/expired invitations have both private columns NULL; the next sweep changes zero rows. Invite identifiers are also absent from exports. |

The separate scanner test injects every supported binary encoding and a private
contact marker, verifies canonicalized private selection detection, and checks a
clean public surface. It makes a silently ineffective scanner fail locally.

## Source decisions

Requirements: [QV-06 privacy requirements](../06-privacy-data-lifecycle.md),
particularly QV-06-REQ-003/004/017, and [QV-28 storage requirements](../28-data-model-storage.md),
particularly QV-28-REQ-006/008. The implementation contracts inspected at the base
commit were:

| Source | Exact base blob | Relevant behavior |
|---|---|---|
| `packages/server/src/app.ts` | `e44b9e341b64dfcb96770e5be23bb8edb7c2e72a` | `idem` applies the response redactor before both `storeOperationReceipt` and `storeIdem`; invitation issuance encrypts label/contact and redacts replay output. |
| `packages/server/src/electiondb.ts` | `ca1528dc881142c955e4a18e105c63c832b39c8e` | `consumeInvite` NULLs contact; `purgeInviteData` NULLs label/contact after the configured grace; operation receipts and recorded snapshots are durable. |
| `packages/server/src/controldb.ts` | `a123ead1b938292d716f1004dc85886ccae6c1f6` | `storeIdem` persists the provided response bytes; this container must be tested rather than assumed private by classification. |
| `packages/server/src/export.ts` | `dbd83d4fba73c1643c68c1eca23e27a422d00a5d` | Default protocol export and full QVB are built from public records; QVB wraps board bodies in base64. |
| `packages/server/src/retention.ts` | `526ab32d1300e59d390701c6056cf68f181ac314` | Explicit sweep traverses non-imported election stores and emits count-only summaries; timer disabled only in this test for deterministic phase scans. |
| `packages/server/src/kek.ts` | `5ddf0f75e91fe5108e6ad77fa7528ec57505a34e` | Raw server KEK intentionally persists in its private file; invitation fields use authenticated envelope encryption. |
| `packages/protocol/src/ballot.ts` | `c32e4bd8c8ebe831cd1036c3c21b25ca8b6ae759` | Cast envelopes omit `xi` and selections; public spoil intentionally reveals both; private spoil carries only the reveal digest. |

## Validation and limits

`node --test --test-reporter=spec packages/server/test/privacy-markers.test.ts`:
**2 passed, 0 failed, 0 skipped**, 5.45 seconds locally on Node 24.22.3.
The strict scoped TypeScript check includes the new test and its dependencies.
Vendor integrity is checked against the pinned 132 verbatim files. The root
integration owns the full server suite and native CI; this report does not claim
their result for this source.

This finite literal-marker sweep does not prove the absence of arbitrary
transformations, partial private values, all protocol encodings, private bits
inferred from public counts, in-process memory, core dumps or external backups.
It checks logical NULLing and absence of plaintext canaries, not physical removal
of old ciphertext from SQLite pages/WAL or crypto-erasure of a deleted election.
The fixture uses witness quorum zero and does not call an export verifier; public
content and privacy checks establish no authenticated finality or freshness. The
separate derived-record/server-author compatibility decision remains unresolved.

No protocol vectors, authority inputs, production schemas, token widths,
registration proof rules, retention durations or existing test deadlines change.
