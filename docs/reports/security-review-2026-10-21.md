# Security review, 2026-10-21: server network surface and protocol log check

**What this is.** An AI-assisted adversarial code review (Claude, driven from a Claude Code session) of a bounded set of files. It is
**not an independent security audit**, it was not performed by a third party, it carries **no guarantee** that the reviewed code is free of
vulnerabilities, and it must not be cited as an audit result. Findings were accepted only when a test reproduced them against the unfixed code;
everything else is listed as an unconfirmed suspicion or residual risk.

## Scope

* `packages/protocol/src/logcheck.ts`
* `packages/server/src/{sse,ssrf,webhooks,gossip,imports,admin,range,tar}.ts` and their authentication paths `auth.ts`, `http.ts`
  (plus the routes that call them in `app.ts` / `ext-routes.ts`, read only).
* Out of scope: `packages/{trustee,board,cli,crypto,web,verifier}`, `test-vectors`, deployment/TLS termination, dependencies.

Hunted for: SSRF bypasses (DNS rebinding, redirects, IPv6 / IPv4-mapped / NAT64 / 6to4, octal/hex/integer IPv4, userinfo, ports, trailing dots),
webhook secret leakage, signature replay and timestamp handling, SSE authorisation and read-key leakage, header injection, unbounded memory/CPU
(Range, tar, gossip notes, import queues, SSE buffers, webhook outbox), path traversal in tar/imports, timing leaks in secret comparisons, TOCTOU in
quarantine/clear, `logcheck` fail-open paths (waiver/notice handling, threshold edge cases, integers/NaN/negatives, prototype-keyed lookups), and the
persistence of the webhook outbox.

Method: manual reading of every in-scope file, a probe script over ~45 hostile URLs / IPs / Range headers, then one failing test per suspected
finding before any fix. Regression tests: `packages/server/test/security-review.test.ts` (SR-1..SR-4) and
`packages/protocol/test/security-review.test.ts` (SR-5).

## Confirmed findings (fixed)

| ID | Severity | Component | Finding | Fix |
|----|----------|-----------|---------|-----|
| SR-1 | Medium | `server/src/auth.ts` | Signed-request replay: the `(key, nonce)` replay record expired at `now + 125 s` although a request with a future timestamp (`ts` up to `now + 120 s`) stays acceptable until `ts + 120 s`. A captured future-dated management request could be replayed for up to ~115 s after its nonce was forgotten. | Nonce kept until `max(now, ts) + 120 + 5 s`. |
| SR-2 | Medium | `server/src/admin.ts` `clearQuarantine` | TOCTOU: permanent fork evidence, the incident id and the rollback minimum size were checked on the runtime *before* the awaited evict / re-open / audit. Fork evidence posted to the public gossip endpoint during that window was ignored and the quarantine was lifted (appends resumed) although the log key had signed two histories. | All three are re-checked on the fresh runtime after the last `await`; no `await` remains between the checks and `clearForcedQuarantine()`. |
| SR-3 | Medium (availability; fail-closed direction) | `server/src/admin.ts` `auditLog` | The self-audit job yields every 512 entries but compared its recomputed root with the runtime's *current* root and judged checkpoints signed after its snapshot against the shorter recomputed tree. On a live election with appends during the audit this produced `ROOT` / `CHECKPOINT_ROOT` failures and a **false quarantine** (503 on every append until an admin clear with witness evidence). | Root compared at the audited size `n`; checkpoints of size `n < s <= current size` are checked for signature and against the in-memory tree; checkpoints beyond the current log still fail. |
| SR-4 | Low (defence in depth) | `server/src/ssrf.ts` `parseTargetUrl` | Host names with empty labels (`https://localhost../`, `a..example.com`) passed the static policy (suffix / `localhost` checks are fooled by the extra dot). Not exploitable end to end in this code: the mandatory resolution step still rejected the loopback answer. It mattered for the start-time static check of `gossipPeers` and for any future caller relying on the static check alone. | Empty labels are refused (`TARGET_BLOCKED`); one trailing dot (FQDN) is still accepted. |
| SR-5 | Low | `protocol/src/logcheck.ts` `witnessAnchors` | Caller-supplied witness anchors (used when the manifest lists no witnesses, X-23) could name one key twice under two names; `witnessStatus` dedupes by name, so a single witness cosigning twice met a quorum of 2. The manifest path already refused duplicate keys. Requires mis-configured trust anchors, so Low. | Duplicate keys (case-insensitive hex) make the anchor set invalid (`source: 'none'`, fail closed when `witness_quorum > 0`). Test-vector bytes are unaffected. |

Evidence (each test failed before its fix, with these observations):

* SR-1: replay of `GET /orgs/{org}/webhooks` signed with `ts = now + 120`, clock advanced 130 s: `200` (expected `401 REPLAY`).
* SR-2: `quarantine/clear` with a gossip fork note injected after `pool.evict`: `200 {"quarantined": false}` while `hasPermanentEvidence()` was true.
* SR-3: `auditLog` over a 600-entry log whose `tick()` appends two entries and signs a checkpoint: failures `ROOT` and `CHECKPOINT_ROOT 602`.
* SR-4: `parseTargetUrl('https://localhost../')` did not throw.
* SR-5: `witnessStatus(..., quorum 2)` with anchors `[a: K, b: K]` and two cosignature lines by K returned `witnessed: true`.

Verification: `npm run typecheck && npm test -w @quietvote/server -w @quietvote/protocol` passes with the new tests (see the session log of this
review; the existing 117 server and 169 protocol tests were green before and after).

## Flagged, not redesigned

* **Webhook outbox vs QV-28-REQ-019.** `control.webhook_outbox.body` stores the full public P0 delivery payload (election id, event id/type/seq, event
  `data`) in the control DB until delivered/pruned (<= `webhookMaxQueue` rows). QV-28-REQ-019 says the control DB holds "no election content other than
  the registry row". The payload is public (P0) and bounded, but this is a literal deviation; options for the owner: keep only `(election_id, event_id)`
  in the outbox and rebuild the body from the election DB's `event` table at send time, or record an explicit erratum.

## Unconfirmed suspicions / hardening suggestions (not changed)

* **SSE slot leak window.** If a client disconnects while the handler awaits `pool.get`, `res` may already have emitted `close` before `attach()` registers
  its listener. The stream then ends only via the slow-client timer (`sseSlowClientMs`) or the idle close, holding a per-bucket slot and `rt.inUse` until
  then. Not reproduced; bounded by those timers. Hardening: end immediately if `res.destroyed` at attach time.
* **Import upload pre-auth.** `preflightAuth` (before the body is read) checks header shape, timestamp and that the key id exists, but not the signature
  (it covers the body hash). Anyone who knows a registered key id can make the server reserve `maxImportUploads x maxImportBytes` (default 2 x 64 MiB) for up
  to `requestTimeoutMs`. Bounded by design; a per-bucket upload cap would narrow it.
* **Duplicate witness keys in server config.** `cfg.witnesses` (config.ts, outside this review's write scope) is not checked for duplicate keys; it feeds the
  import witness gate when a manifest lists no witnesses and the names accepted by `quarantine/clear`. Same class as SR-5; operator-controlled.
* **Prototype-keyed lookups in `logcheck.ts`.** `MARKER_TYPE[String(name)]` / `DKG_TYPE[type]` use plain object indexing; names such as `constructor` or
  `__proto__` resolve to inherited values. Every such path was checked to fail closed (type mismatch / unresolved author -> `F`), so verdicts are correct,
  only the diagnostic is misleading. `Object.hasOwn` guards would be cleaner.
* **`verifyReceiptChain` takes the manifest unvalidated** (callers are expected to have validated it). A schema-invalid `witness_quorum` (negative, non-integer)
  degrades to "not witnessed", never to a false `witnessed: true`; since the coordinators choose the quorum anyway, no escalation was found.
* **Non-strict `readTar`** (exported from `@quietvote/server`) has no checksum, typeflag or size validation. No production caller in this repository (tests only);
  untrusted input must go through `readTarStrict`.
* **Gossip peer URLs** are concatenated with `/api/v1/gossip/checkpoints`; a configured peer with a query or fragment would move the path. Config-only.
* **Webhook receivers** must enforce their own timestamp window and constant-time signature comparison; the event type header is not signed (the type is in the
  signed body). Documented in `packages/server/NOTES.md`.

## Areas reviewed with no finding

SSRF address classes (all IPv4 special ranges listed in `ssrf.ts`; IPv6 outside 2000::/3, Teredo, ORCHID, documentation, IPv4-mapped/-compatible, NAT64,
6to4; zone ids), WHATWG canonicalisation of octal/hex/integer/percent-encoded IPv4, userinfo, ports, DNS answers mixing public and private addresses,
connection pinning (no second lookup) with TLS name verification, no redirects, bounded response reads and deadlines; webhook secret handling (sealed at
rest, shown once, dropped from the idempotency cache, never logged); HMAC input framing; Range parsing (single range only, 15-digit bounds, suffix ranges,
`If-Range` strong ETag only); strict tar (checksums, regular files only, safe names, no prefix, no duplicates, bounded file count, trailing data refused);
import path construction (election id validated as 32 hex before any path join); read-key comparison (hash + `timingSafeEqual`); incident `ack` comparison;
gossip input bounds and the "only our log key's notes count" rule; SSE per-client memory bounds; `logcheck` notice handling (waiver/extension/pause never
relax a gate), witness threshold edge cases (`quorum >= 1` required by `witnessStatus`), control-record closed schema and coordinator multi-signature.

## Residual risk

This review covered a subset of the code for a limited time. Absent findings in other packages, in the cryptography, in the board layer, or in
deployment configuration say nothing about their security. An independent, human-led security audit is still required before any binding election use.
