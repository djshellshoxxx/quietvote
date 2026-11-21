# Audit: @quietvote/server

- Scope: `packages/server` (HTTP layer, auth, rate limiting, SSE, webhooks/SSRF, static, export/tar, KEK/secret handling, SQLite access, append path)
- Date: 2026-10-21
- **AI-assisted review, not an independent professional audit.** Findings below are what this review found and verified by running code; absence of a finding is not a claim of absence of defects. QuietVote is unaudited and not for real elections.

## Threat model

Assets: election log integrity and availability (append-only, receipts, checkpoints); voter anonymity/unlinkability metadata (no IPs/UAs stored or logged, invite-to-voter link not stored); org signing keys and roles; per-election DEK, log/server signing secrets (sealed under the instance KEK); webhook URLs and secrets; read keys of `link` elections; instance availability.

Trust boundaries: (1) internet to `node:http` (anonymous voters, readers, attackers); (2) signed management requests (org owners/organizers, instance admins); (3) server to webhook receivers (outbound, attacker-chosen URLs); (4) process to disk (control.sqlite, per-election DBs, `kek.bin`); (5) reverse proxy to server (optional bucket header); (6) `.qvb` consumers (readTar on downloaded bundles).

Adversaries: anonymous network attacker (DoS, probing, crash bugs); malicious voter (valid roll key, floods, malformed entries); malicious/compromised organizer key (privilege escalation, cross-org access); malicious org owner (SSRF via webhooks, resource exhaustion); host-local reader of the data dir (KEK co-located); malicious `.qvb` producer.

Assumptions: TLS and header sanitising are done by a reverse proxy; the data directory is private to the service user; the operator chooses `registrationMode`; the board/crypto/protocol packages are correct (reviewed elsewhere, not here); single process (no cluster).

Failure modes considered: process crash on hostile input; memory amplification; rate-limit bypass; cross-org or cross-election access; replay of signed requests; partial append (tree ahead of DB); secret leakage via logs/problem bodies/idempotency cache; SSRF/DNS rebinding; path traversal; SQL injection.

## Findings

| ID | Severity | Evidence | Remediation | Status |
|---|---|---|---|---|
| SRV-001 | high | `src/http.ts:381` (was `req.socket.destroy()` in a `finish` handler). When a request is refused with `Connection: close` (body too large, bad media type, rate limited) and the peer disconnects first, `req.socket` is null and the handler throws inside an event emitter: uncaught exception, whole process down. Reproduced pre-fix: chunked body over the limit and abrupt client close. Unauthenticated. | `req.socket?.destroy()` | fixed; test `SRV-001: a chunked body without Content-Length...` (failed pre-fix with `TypeError ... reading 'destroy'`, passes now) |
| SRV-002 | medium | `src/ratelimit.ts` `BucketKeyer.bucket` took the first four colon-separated tokens of the IPv6 text. Node prints zero runs as `::`, so `2001:db8::1:2:3:4` and `2001:db8::5:6:7:8` (same /64) got different buckets: a client holding one /64 (with groups 3-4 zero) gets up to 2^16 to 2^32 buckets and bypasses every per-bucket limit (read, write pre-auth, auth, SSE stream cap, invite-failure counter). | `v6Prefix64` expands `::`, embedded IPv4 and strips zone ids before taking 64 bits | fixed; test `SRV-002: IPv6 clients inside one /64 share a bucket...` |
| SRV-003 | medium | `src/app.ts` `readable()` gated link elections on `QV-Read-Key`, but routes still answered `Cache-Control: public, max-age=31536000, immutable` (e.g. `log/proof/consistency`, `log/entries/:seq`, manifest, `log/entries` pages, export) with `Access-Control-Allow-Origin: *`. A shared cache could serve read-key protected content to clients without the key. Observed headers on a link election pre-fix. | `Ctx.restricted`; http.ts forces `private, no-store` | fixed; test `SRV-003: read-key protected responses are never publicly cacheable` |
| SRV-004 | medium | `GET .../log/entries?limit=1000` loaded and base64-encoded up to 1000 entries per request (ballots up to `maxBallotBytes` 128 KiB default, 256 KiB hard: ~170-340 MB of JSON built in memory per request, 120 requests/min/bucket allowed). | byte cap `maxPageBytes` (4 MiB default) with `next_from` continuation; page loaded in chunks of 25 | fixed; test `SRV-004: log entry pages are bounded in bytes...` (the 128 KiB x 1000 worst case itself was not run) |
| SRV-005 | low | `src/tar.ts` `readTar` (public export): a size field such as `-1001` made `o += 512 + ceil(size/512)*512` add 0, an infinite loop (reproduced with a verbatim copy of the old loop); non-octal sizes gave NaN; sizes beyond the buffer were silently truncated; duplicate names silently replaced earlier members; empty/`.` segments accepted. Affects consumers of untrusted `.qvb`; the server itself only calls `writeTar`. | strict octal size, bounds, duplicate and path-segment checks | fixed; test `SRV-005: readTar rejects malformed headers...` |
| SRV-006 | low | `src/static.ts` `serve`: SPA fallback answered any extension-less path, including mistyped `/api/...`, with 200 HTML (clients see HTML where problem+json is documented). No filesystem access is derived from the request (in-memory map), so no traversal. | `/api` and `/api/*` return undefined (404 problem) | fixed; test `SRV-006: static server...` (also asserts traversal spellings never read files) |
| SRV-007 | low | `src/app.ts:117` built `DELETE FROM idempotency ... '${key}' ...` with manual quote doubling. Not exploitable as written (key limited to printable ASCII, principal is a key id, SQLite doubles quotes correctly) but the only string-built statement over request data. | `ControlDb.dropIdemInProgress` with bound parameters | fixed (hardening); test `SRV-007: quotes and SQL metacharacters...` (passes pre-fix too: no exploit existed) |
| SRV-008 | info | `src/config.ts` default `registrationMode: 'open'`; `POST /api/v1/orgs` needs only proof of possession and is limited per network bucket (10/min); `maxElectionsPerOrg` is per org, so unlimited orgs give unlimited election DB files (disk growth). | Deploy with `token` or `closed`; consider a global election cap | open (operator guidance; no code change) |
| SRV-009 | info | `src/ratelimit.ts` / `http.ts:203`: with `bucketHeader` set the client-supplied header is trusted verbatim. If the proxy does not strip/overwrite it, every limit is bypassable. | Document: proxy must overwrite the header; never expose the server directly | open (documented here) |
| SRV-010 | info | Webhook registration errors distinguish `DNS_FAILED`, `TARGET_BLOCKED` ("resolves to a non-public address") for owner-supplied names: a weak internal-DNS oracle for org owners (rate limited, 10 hooks/org). Delivery-time results are not returned. | Accept or collapse to one code | open |
| SRV-011 | info | `src/kek.ts`: KEK file lives in `<dataDir>/kek/kek.bin` next to the databases (a plain data-dir backup contains both), no `kek_id` rotation path, DEKs/KEK not zeroised. Sealing itself is sound (AES-256-GCM, random 96-bit IV, per-record AAD binding id and purpose, file mode 0600, dir 0700). | Store the KEK outside the backed-up data dir or in an HSM/secret store; add rotation | open |
| SRV-012 | info | `src/app.ts` `idem()`: a crash mid-request leaves a `status=0` marker for 24 h (409 IDEMPOTENCY_IN_PROGRESS for that key) until expiry. Failure (exception) path is cleaned. | Expire in-progress markers sooner | open |
| SRV-013 | info | `src/http.ts:216-223` CORS preflight answers `Access-Control-Allow-Origin: *` for any path that has a GET route, including signed management paths; actual responses carry no ACAO for non-allowed origins, so browsers still block them. Cosmetic inconsistency. | Use the same decision as the actual response | open |
| SRV-014 | info | `src/http.ts` reads and buffers the JSON body (<= route `maxBody`, <= 1.1 MiB on log entries) before signature authentication of management routes; bounded by the per-bucket class limit and request timeouts. | none needed | open (accepted) |

Reviewed and found sound, with tests pinning them (`test/audit.test.ts`, existing `test/negative.test.ts`, `test/ssrf.test.ts`, `test/events.test.ts`):

- Auth: strict header grammar (duplicates, extra fields, oversize, bad base64url, non-canonical encodings all 401, none 500); signature covers method, raw target, audience (`qv:<instance>@<publicUrl>`), timestamp, nonce, body hash; the replay cache is written only after the signature verifies; unknown keys take the same verification path; revoked keys stop working immediately; last owner key cannot be removed.
- Authz: organizers cannot add/remove keys, use webhooks or delete elections; an organizer cannot mint an owner key; a proof of possession for another org is rejected; foreign orgs/elections answer 404; webhook `election_id` must belong to the org.
- SSRF: https-only, no credentials, ports 443/8443, numeric/obfuscated/mapped/NAT64/6to4/Teredo/ULA/link-local forms blocked (about 35 spellings probed), every resolved address must be public, re-validated before each attempt, connection pinned to the validated address, no redirects, response and time bounded.
- Path traversal: static server is an in-memory map built at startup; request paths are percent-decoded and `..`/`.`/NUL/backslash rejected; `.qvb` file names are generated by the server (`log/checkpoints/<digits>.txt`).
- SSE: per-bucket and global caps, slow-client drop, bounded buffer, idle close, link elections need the read key.
- Append integrity: entry, projection, checkpoint and outbox events are one SQLite transaction; if the in-memory tree moved and the transaction fails the runtime is poisoned and reloaded. Test `append integrity` injects a projection failure and shows no committed seq, unchanged checkpoint, next append reuses the same seq, error text not echoed or logged.
- Logging/problem details: closed field set, control characters stripped, route templates only; 500s are generic; hostile-input probes return small problem bodies with no paths or stack frames.
- SQL: all other statements are parameterised (`${}` only in constant column names and pragmas); filters are validated by regex/enum before use.

Not examined: crypto and board package internals, the proof verifiers and projection logic in `election.ts` beyond the append/rollback path, lifecycle semantics, load/soak behaviour, TLS/proxy deployment, the web client. The Node `node:sqlite` module is experimental.

## Verification

- `npm test -w @quietvote/server`: 82 tests, 82 pass (71 existing + 11 in `test/audit.test.ts`).
- `npm run typecheck`: no errors in `packages/server`. The repo-wide run reports one unrelated error in `packages/board/test/audit.test.ts` (unused import), outside this scope and not touched.

## Addendum: trustees-mode spoil shares (QV-ADR-020), AI-assisted, not independent audit
New unauthenticated-by-session endpoint `POST /api/v1/elections/{id}/spoil-shares` (non-log, self-authenticating trustee-signed record). Reviewed: author must be manifest trustee `j`
with a valid signature under scope ctx; wrong ctx, cast/unknown/reveal-mode codes, wrong `spoil_seq`, missing/duplicate/forged shares, repeat posts, pre-close and post-tally posts are
refused (tests in `packages/server/test/spoil-shares.test.ts`). DoS bound: 1 MiB body cap, schema caps shares at 4096, exact-coverage check before proof verification, per-trustee
rate limit, one row per (code, trustee) so storage is bounded by spoils x n. No new findings of severity >= medium. Info: a trustees-mode spoil with < t shares is omitted from the
published tally rather than blocking it; a draft fetched before a late share is refused by `vTally` until re-fetched. Not run end to end against a hostile multi-process deployment.
