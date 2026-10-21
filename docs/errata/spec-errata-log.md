# Spec errata log

Append-only. Each entry records a place where the specification and the reference implementation disagree, or where a spec fact was found wrong. Entries do not change the spec silently; the owner decides which side moves.

| ID | Spec location | Spec says | Implementation / evidence | Status |
|---|---|---|---|---|
| E-001 | docs/16-crypto-protocol.md §5.12.1 (tracking-code display) | Crockford base32 (`0-9A-Z` without `I L O U`), 52 characters. Spec previously called this an "RFC 4648 alphabet variant", which is wrong: it is a separate alphabet. | `packages/protocol/src/logcheck.ts` (`B32`) and `packages/board/src/entry.ts` use the RFC 4648 lowercase alphabet `a-z2-7`, unpadded (log origin derivation). The tracking-code encoder was not checked in this docs pass. Source: part-2-standards-crypto.md S20. | **Open: owner decision needed** (change spec to RFC 4648 lowercase, or change implementation to Crockford). |
| E-002 | docs/09-api-data-contracts.md (rate-limit headers) | Spec text still names `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; note added that the current IETF httpapi draft (-11, May 2026, not final) uses `RateLimit-Policy` and `RateLimit`. | `packages/server/src/http.ts` emits the early-draft names. Source: part-2-standards-crypto.md S12. | **Open: owner decision needed** (keep early names, or move to the current draft names once it is final). |
