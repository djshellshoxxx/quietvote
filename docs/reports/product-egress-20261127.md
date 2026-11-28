# Product T8: bounded server egress coverage

Date: 2026-11-27 (America/Vancouver). Base: PR #76,
`d38c55c3d6f0d8254967efea066cd282c4012553`. No production or schema edits, new
dependencies, transport deadline changes, retry-policy changes or R26 source
copies are required.

## Contract and plan

[QV-06-REQ-015](../06-privacy-data-lifecycle.md) permits configured outgoing
connections and forbids telemetry. The implemented
[webhook contract](../../packages/server/NOTES.md) deliberately delivers public
events to configured HTTPS targets; [QV-09](../09-api-data-contracts.md) specifies
private-address blocking, DNS pinning and no redirect following. Configured
gossip is also deliberate; the default peer list is empty and the timer is off.
These explicit integrations are not classified as leaks.

The bounded plan was to isolate a real server from its HTTP test client, install
guards before server imports, prove those guards work, drive a complete default
election, then exercise an allowed webhook and rejected alternate destinations.
The implementation adds [egress.test.ts](../../packages/server/test/egress.test.ts)
and a dedicated [worker helper](../../packages/server/test/helpers/egress-worker.ts).

## Evidence

| Case | Verified behavior |
|---|---|
| Guard positive controls | All **69** installed guards were invoked through actual ESM exports or DNS resolver instances and refused before I/O. These include callback/promises DNS, HTTP/HTTPS request/get, TLS connect, net connect/createConnection, `Socket.prototype.connect`, and fetch. DNS wrapper identities are checked before probing. |
| Default complete election | Real registration, manifest, 2-of-3 DKG, opening, four voters, a revote, a spoil, close, trustee decryption, signed tally, audit close, JSON/QVB exports, explicit empty-peer gossip run and shutdown produced **zero outbound attempts**. The exported tally's real decryption check passes; protocol verification remains `INCOMPLETE` for the fixture's missing log/witness evidence. |
| Webhook delivery | The normal `systemResolver` and `httpsTransport` imports run. Intercepted DNS returns a controlled public address. Before any local mapping, the HTTPS boundary checks the production pinned lookup, POST path, configured hostname/port, SNI and enabled certificate verification. A real TLS listener receives the request; its HMAC is checked independently using Node crypto. |
| Rejected registration | HTTP and private IP literals are refused before DNS/transport. A hostname with a private answer is refused after the recorded lookup, without HTTPS/TLS/TCP or a stored webhook. |
| Redirect | A real TLS endpoint returns 302 with a different hostname. Only the configured destination is contacted, the delivery is marked failed, and no redirect or retry occurs. |
| Rebinding | After successful registration, the configured name receives a private DNS answer. The next real election event is blocked before HTTPS/TLS/TCP; no extra listener hit or retry occurs, and the outbox drains. |

The worker uses the same two-second ballot test interval as `World`, injected
election time via shared memory, and high fixture rate limits. No production
deadlines or retry counts are overridden. Parent-thread client sockets are outside
the worker guards. The server's numeric loopback bind lookup is handled without
DNS I/O and counted separately as inbound setup.

## Boundaries

This is a Node module/native connector regression guard, not kernel enforcement.
It does not claim that arbitrary native addons, subprocesses or newly spawned
workers are sandboxed. The exercised server paths create no such network client.
It covers the complete core election flow, not every optional background job or
future feature. Configured gossip behavior has its existing dedicated tests; this
test runs the actual empty-peer path. SMTP and witness polling remain unimplemented
and are not claimed as covered.

No third-party endpoint is contacted. For the allowed webhook, the test checks the
real transport's validated public address pin and only then maps that single
connection to a local TLS port with a generated test CA. DNS answers are simulated
at the Node DNS boundary; HTTP success is not mocked and no application resolver
or transport override is installed. The test therefore verifies real policy and
transport composition while keeping physical traffic local. OpenSSL is needed to
generate the ephemeral certificate; absence skips only this real-TLS case, with an
explicit reason. The no-egress election and guard probes still run.

## Validation

- New tests: **2 passed, 0 failed, 0 skipped** on Node 24.22.3/Linux with OpenSSL
  3.5.9.
- Combined new egress and existing SSRF regression run: **21 passed, 0 failed,
  0 skipped**, 6.99 seconds.
- Repository TypeScript check, pinned vendor integrity (132 files), and diff
  whitespace checks: passed.
- No production defect was found. Initial fixture-only corrections aligned its
  ballot interval with `World` and used the typed TLS SNI callback for observation.
