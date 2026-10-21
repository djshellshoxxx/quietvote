# QuietVote test vectors (protocol version qv1)

Licence: CC0-1.0. Format: QV-34 §6 (envelope with `vectors[]`, `input`, `expect`). Hex is lower-case; scalars are 32-byte
little-endian; points are canonical ristretto255.

* `v1/primitives`, `v1/protocol`: known answers and negative vectors per operation (see `operation` in each file).
* `v1/elections`: complete election bundles (`bundle.json`) with `expected-report.json`.
* `v1/mutations`: one mutant per file derived from `elections/tiny-yesno-3v` (the QV-34 text derives them from the
  20-voter election; the tiny election is used here to keep verification cheap) with the exact set of failing named checks.
* `v1/canary`: the verifier self-test bundle (wrong aggregate + forged CDS proof).
* `schema/error-codes.json`: QV-16 error codes used in vectors and their QV-34 registry equivalents.

Status: every set is `candidate`. No independent implementation has reproduced them yet (QV-34-REQ-005), the MANIFEST is
unsigned, and the external-standard sets (FIPS 180-4, RFC 8032, RFC 9496) contain only the few values quoted from memory and
re-checked by computation; they have not been imported verbatim from the source documents (QV-34-REQ-003 open).

Regenerate: `node packages/protocol/test/vecgen/write.ts` (zero diff expected; `vectors.test.ts` enforces it).
Deterministic randomness: SHA-512 counter-mode stream RNG seeded per scenario (not the HKDF `vecrng-v1` of QV-34 §8.1).
