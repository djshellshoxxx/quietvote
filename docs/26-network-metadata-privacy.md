# QV-26 — Network and Metadata Privacy

**Module ID:** `network-metadata-privacy`
**Status:** Draft
**Owner:** Security/privacy lead
**Last reviewed:** 2026-10-21
**Related specs:** QV-07 (threat model), QV-06 (data lifecycle), QV-08 (architecture), QV-04 (identity phases), QV-20 (voting methods §10), QV-31 (telemetry), QV-12 (operations), QV-32 (federation); ADR-005, ADR-008, ADR-009, ADR-010.

## 1. Objective
Cryptography hides *what* a voter chose; network metadata can reveal *who voted, when, from where, and on what device*. This spec defines transport, Tor deployment, log policy, fingerprint and timing-correlation mitigations, optional submission padding/batching/delay, small-group result-granularity rules, and an honest per-phase anonymity-set analysis. ADR-008 already states that resistance to network-level metadata analysis is **not** claimed without Tor; this document specifies what is and is not achieved with it.

## 2. Scope
### In scope
Client–server transport; onion service deployment; server/proxy logging; browser fingerprint surface of the QuietVote client; ballot-submission timing/size behaviour; log-order privacy; small-group disclosure; anonymity-set analysis for ADR-005 Phases 1–3.
### Out of scope
Compromised voter devices (ADR-008); global passive adversaries beyond what Tor offers; coercion in person; legal compulsion of operators (QV-25); mixnet-grade anonymous messaging.

## 3. Actors and adversaries (network-relevant)
| Adversary | Capability | Relevant to |
|---|---|---|
| Local network observer (ISP, Wi-Fi) | Sees destination IP/SNI, packet sizes/times | Who contacts the server and when |
| Hosting provider / server operator | Sees all connections, can log IPs, observe timing | IP↔ballot submission linkage |
| Reverse-proxy/CDN (discouraged) | Same plus TLS termination | Excluded by ADR-009 (no CDN) |
| Global passive adversary | Observes both ends of Tor circuits | Tor does not defend [R1] |
| Colluding voters | Share their own timing/IP/receipt info | Anonymity-set shrinkage |
| Malicious registrar (Phase 2) | Sees token issuance time and identity | Issuance↔spend correlation |
| Malicious operator serving altered client | Can embed tracking | ADR-010 residual |

## 4. Transport (Must)
- **QV-26-REQ-001** TLS 1.3 only for clearnet; HSTS with `max-age ≥ 31536000; includeSubDomains`; certificates via ACME; no TLS 1.2 fallback in the reference config. OCSP stapling optional. 
- **Single origin:** all JS, CSS, fonts, images from the same origin; no third-party requests (ADR-009). CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`. `Referrer-Policy: no-referrer`; `Permissions-Policy` denies all features; `Cross-Origin-Opener-Policy: same-origin`; `Cache-Control: no-store` on API responses.
- **No cookies by default.** Authentication via signed requests (voter key signs a nonce-bound request; QV-09). Any session cookie (organizer UI) is `Secure; HttpOnly; SameSite=Strict`, never present on ballot-submission endpoints.
- **Encrypted DNS/SNI:** clearnet cannot hide SNI without ECH; ECH deployment is a Could and depends on server stack support [UNVERIFIED current status in chosen server]. Documented: an ISP can see that a device contacts the QuietVote host.
- **HTTP/2 or HTTP/3** permitted; server SHALL NOT vary response by User-Agent.

## 5. Tor onion service deployment (first-class target, ADR-009)
### 5.1 Modes
1. **Dual-publish:** same instance reachable on clearnet and as a v3 onion service; clearnet responses carry `Onion-Location: http://<addr>.onion/…` so Tor Browser offers the onion [R2 — Tor Project documentation; verify header support at implementation].
2. **Onion-only:** for high-risk groups; no clearnet listener.
3. **Authenticated (private) onion:** v3 client authorization (x25519 keys per voter-group) so that the service address is not usable by non-members; descriptors are encrypted to authorized clients [R3 — Tor onion services client authorization; verify].
### 5.2 Reference `torrc` (illustrative)
```
HiddenServiceDir /var/lib/tor/quietvote/
HiddenServiceVersion 3
HiddenServicePort 80 unix:/run/quietvote/http.sock
HiddenServicePoWDefensesEnabled 1     # Tor >= 0.4.8; dormant until under load [R4]
HiddenServiceEnableIntroDoSDefense 1
HiddenServiceMaxStreams 64
HiddenServiceMaxStreamsCloseCircuit 1
```
- Run Tor as a separate unprivileged unit; application listens on a Unix socket only, so the app never sees a client IP at all (strongest log policy).
- Enable **Vanguards** (Tor's built-in vanguards-lite is on by default in modern Tor; the full `vanguards` addon is optional) to blunt guard-discovery attacks [R5].
- PoW defense and OnionBalance are currently documented as not working together [R6]; therefore **horizontal onion scaling via OnionBalance is not a supported MVP configuration**; scale vertically (QV-12 capacity).
- Operational: back up the onion secret key offline (it *is* the identity; QV-12 key rotation runbook = new address + signed redirect on the old one + manifest update); monitor `bootstrap` and descriptor publication health from inside the host (QV-31).
### 5.3 Client in Tor Browser
- No TLS on `.onion` is required for confidentiality (onion layer encrypts and authenticates to the address), but WebCrypto and some APIs require a secure context; the client uses only `crypto.getRandomValues` (available in non-secure contexts) with `@noble` primitives (ADR-003), so it SHALL NOT depend on `crypto.subtle` or service workers (Must). [UNVERIFIED which Tor Browser versions treat `.onion` as secure context.]
- Tor Browser safest-security level disables JavaScript: QuietVote cannot vote without JS (client-side encryption). Documented limitation; a non-JS fallback would require server-side encryption and is **rejected** (violates ADR-001).
- WASM: Avoid in MVP (safest-mode and fingerprint concerns); pure-JS noble is fast enough for MVP methods (QV-20).
### 5.4 Requirements
| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-26-REQ-010 | Reference deployment shall include dual-publish and onion-only profiles with Unix-socket app binding | Must | App process holds no TCP listener in onion-only profile; integration test with `tor` | Deploy test |
| QV-26-REQ-011 | Client shall function in Tor Browser at "Standard" level without storage, service workers or WebCrypto subtle | Must | E2E test (Playwright/Firefox ESR with Tor-like prefs) | E2E |
| QV-26-REQ-012 | Docs shall state Tor is a mitigation, not anonymity of participation in Phase 1 | Must | Doc review | Review |

## 6. Log policy
**QV-26-REQ-020 (Must):** By default the application, reverse proxy and OS SHALL NOT persist client IP addresses, User-Agent, Referer, or full URLs with identifiers.

| Layer | Policy | Reference setting |
|---|---|---|
| Application | Structured logs contain: timestamp rounded to the minute, route template (not path params), status, duration bucket, error code. No voter id, no ballot id, no token | QV-31 §4 allowed fields |
| Reverse proxy (nginx/Caddy) | `access_log off;` or a format excluding `$remote_addr`, `$http_user_agent`, `$http_referer`, `$request_uri` | `log_format qv '$time_iso8601 $status $request_time_bucket';` (bucket via map) |
| Tor | `SafeLogging 1` (default), `Log notice` to syslog only; no `Log debug` | torrc |
| OS/systemd | journald `Storage=volatile` or `MaxRetentionSec=7d`; no `auditd` rules on socket peers | QV-12 hardening |
| Firewall/conntrack | Connection tracking entries contain IPs transiently; flush on a short timeout; no persistent netflow export | OS config |
| Rate limiting | In-memory counters keyed by `HMAC(daily_random_key, ip_prefix)` (IPv4 /24, IPv6 /48 optionally); key regenerated daily and never written to disk; counters never logged | App middleware |
| Debug mode | Must refuse to start with IP logging unless `--unsafe-debug-logging` is set and the manifest-visible banner "logging enabled" appears in `/.well-known/quietvote/privacy` | Config |
| Retention | Logs ≤ 7 days, then deleted; integrity events (not metadata) kept per QV-12 | |
The privacy endpoint `/.well-known/quietvote/privacy` (QV-09) publishes the *effective* log policy, including the logging toggles, so voters and auditors can detect configuration drift. This is self-attested by the operator and not verifiable by observers (stated).

## 7. Fingerprint and tracking-surface mitigations
- **Uniform client:** every voter receives byte-identical HTML/JS/CSS (no per-user nonces in markup; CSP uses hashes, not per-request nonces). Per-user personalization happens client-side after load.
- **No client-side feature probing** beyond what the app needs: no canvas, WebGL, audio, font enumeration, `navigator.hardwareConcurrency` branching, battery, WebRTC, or timezone/locale reads for anything sent to the server. Locale is selected by an explicit UI control and not transmitted. (Test: static scan of the bundle for a deny-list of APIs — QV-26-REQ-030.)
- **Uniform requests:** ballot POST has fixed header set; no custom headers that differ by browser; server ignores `Accept-Language`. 
- **Uniform errors:** failed-auth, not-on-roll, and unknown-voter responses are the same status/body/timing class to prevent roll-membership oracle (QV-04 enumeration).
- **No analytics, no beacons, no error-reporting SDK.** Client crash reports are user-triggered, locally rendered text that the user may copy (QV-31).
- **Static assets cacheable but not unique:** no ETag-per-user tracking; use content-hash filenames; `ETag` omitted on dynamic routes (ETag cache tracking is a known technique).
- **Browser storage:** only the voter key (if stored), and optional ballot-draft; clearly labelled; "forget everything" button; storage disabled in Tor Browser safest/private windows must degrade to in-memory.
- **Release integrity** (ADR-010): reproducible builds, signed manifest — also a metadata safeguard since a malicious operator could otherwise add tracking JS.
| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-26-REQ-030 | CI shall fail if the client bundle references denylisted fingerprinting APIs or any non-same-origin URL | Must | Static analysis step | CI |
| QV-26-REQ-031 | HTML shall be byte-identical across requests (excluding explicit operator banner) | Must | Two-request diff test | Integration |
| QV-26-REQ-032 | Auth/roll-membership failures shall be indistinguishable by status/body and within ±20 % latency class | Should | Differential timing test | Security test |

## 8. Timing correlation and submission shaping (options)
### 8.1 The problem
An observer who sees "device D connected at T" and a log entry "ballot appended at T+ε" can link them. Phase 1 already links ballots to voter keys (public participation), so shaping only protects *which IP/device* corresponds to which key; in Phase 2/3 it protects the voter↔ballot link against a server that logs timing, and against a colluding observer of both the network and the log.
### 8.2 Options (configured per election in the manifest `submission_privacy` block; defaults in bold)
| Mechanism | Description | Effect | Cost |
|---|---|---|---|
| **S0: none** | Immediate submit and append | Baseline | — |
| **S1: client random delay** (**default in Phase 2/3**) | Client waits `U[0, D]` (default D = 10 min; organizer may set 0–24 h) before submitting, tab must stay open or a service-less "scheduled submit" is declined; UI shows countdown and a "send now" override | Breaks tight timing correlation with the user's browsing/issuance event | Voters at deadline: `D` must be ≤ close − buffer; UI blocks delay within `D` of close (submits immediately and warns) |
| **S2: epoch batching of log appends** | Server collects accepted ballots into epochs of length `E` (default 5 min or ≥ k=10 ballots, whichever later) and appends them **sorted by ballot hash** (not arrival order), then publishes the new signed tree head | Hides arrival order and sub-epoch timing from log readers (not from the server itself) | Receipt delayed ≤ E; low-turnout epochs still leak coarse time; server operator still sees arrival times unless it discards them (policy only) |
| **S3: fixed-size padding** | Ballot body is already fixed length per manifest; HTTP request/response padded to the next multiple of 1 KiB; ballots with different vector lengths (method-dependent) are identical within an election | Removes size side channel (e.g., approval ballots with different selection counts are still same size by construction) | Negligible |
| **S4: cover traffic (dummy submissions)** | Clients send a fake "ping" ballot-shaped request at random times that server rejects after constant-time validation | Hides *whether* a user voted from the network observer | Bandwidth; fake-looking requests are distinguishable only with the pre-auth signature check; **Could**, research-grade, not MVP |
| **S5: multiple endpoints / relay** | Submit via a third-party relay or secondary mirror (QV-32) so server sees relay IP | Splits operator/IP knowledge | Relay is another party to trust for availability and metadata |
Phase 1 note: because voter signatures link ballots to keys, S1/S2 hide only IP↔key; S2 is nevertheless cheap and recommended.
### 8.3 Requirements
| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-26-REQ-040 | Manifest shall support `submission_privacy {delay_max_s, epoch_s, epoch_min_ballots, pad_to}` | Must | Schema validation | Unit |
| QV-26-REQ-041 | Epoch appends shall be ordered by canonical ballot hash and shall not expose arrival timestamps; the log entry time shall be the epoch end time | Should | Log inspection; shuffle test | Integration |
| QV-26-REQ-042 | Client random delay shall use a CSPRNG, and shall not delay past `close − 2·D_margin` | Should | Property test | Unit |
| QV-26-REQ-043 | Ballot receipts shall be issued only after append, containing inclusion proof, so that delayed append does not create "accepted but unlogged" ballots | Must | Crash-recovery test | Integration |
| QV-26-REQ-044 | The server shall not store per-ballot arrival time beyond the epoch (in-memory only), and shall document that this is operator policy | Should | Storage review | Review |

## 9. Anonymity-set analysis per identity phase (ADR-005)
Definitions: the **anonymity set** for a ballot is the set of voters to whom an adversary cannot rule out attributing it, given the stated observations.

| Phase | What links ballot to person | Anonymity set against… | Network-layer additions | Claim allowed |
|---|---|---|---|---|
| **1: signed ballots, public roll** | Ballot is signed by the voter's key; key↔person mapping is held by the group | Anyone who knows the mapping (organizer/roll holder): **size 1** (participation public). Observers without the mapping: all keys on the roll (pseudonymous). Content of ballot: hidden (≥ t honest trustees) | IP reveals person→key link to the operator unless Tor/relay; revoting increases observable footprint | "Secret ballot, public participation." **No anonymity-of-participation claim** |
| **2: blind-signed single-use tokens (RFC 9474)** | Registrar sees *who obtained a token and when*; ballot carries an unblinded token not linkable by cryptography [R7] | Spent tokens: all voters who obtained tokens before this spend (≤ N). Reduced by: (a) timing — issuance time vs spend time if few issuances precede it; (b) per-weight classes (QV-20 §9.1); (c) per-group sub-rolls; (d) registrar+server collusion using IP or timing; (e) voters who prove/receipt-sell their token | Spend must be via fresh Tor circuit/different network from issuance; S1 delay ≥ typical issuance window; S2 batching; issuance and spending should be on different origins/paths ideally | "Unlinkable ballots from the registrar given non-colluding issuance and spend channels." Effective anonymity bounded by the *issuance cohort at the time of spend* |
| **3: ZK Merkle membership + nullifiers (Semaphore-style [R8])** | Proof reveals only that some leaf in the root set voted; nullifier prevents double-vote | Group size N (the whole roll's leaf set at manifest time), minus voters known to have *not* voted via out-of-band channels | Timing/IP are the only residual links; S1/S2 apply; the roll root must be fixed before open (late additions shrink set); proving needs client-side heavy computation (device fingerprint: time) | "Anonymous participation within the roll," given Phase 3 maturity and review |

### 9.1 Effective anonymity-set estimator (documented to organizers, QV-10)
For Phase 2 with issuance cohort size `I(t)` at time `t` and batch size `k`: effective set ≈ `min(I(t_spend), epoch_batch_size · …)` is **not** computed precisely; the UI shows a simple conservative number: *"at least the number of tokens issued before this ballot's epoch and not yet spent by others"* and warns when < 10. Quantitative entropy modelling is a Could (research item QV-OQ-26-2).
### 9.2 Tied observations that destroy sets
- Few-member groups (< 10) — all cases.
- Everyone-votes-quickly flows (all submit in one minute): timing carries little info, but a single early voter's set is 1 after issuance if issuance and spend happen only seconds apart for her.
- Voter proof sharing: voters can reveal their token/nullifier secret to a coercer; not preventable (ADR-008).
- Roll or token metadata (e.g., membership tier encoded in weight) partitions the set.

## 10. Small-group result-granularity rules
Complements QV-20 §10. Verifiability requires per-option counts, so granularity can be reduced only by *what else* is published.
| Rule | Detail | Priority |
|---|---|---|
| R1 | Reject manifests with `|roll| < 3` | Must |
| R2 | For `|roll| < 10`: organizer must tick an explicit acknowledgement; result page shows the standing notice: "In small groups, results can reveal how individuals voted." | Must |
| R3 | Do not publish per-voter-class (e.g., per-department) breakdowns where any class has `< 5` voters; class aggregates require separate ciphertext aggregates and are available only if the manifest declares the classes up front | Must |
| R4 | Ranked ballots (full pairwise matrix) require `|roll| ≥ 15` unless acknowledged | Should |
| R5 | Participation statistics (turnout over time) are not published live; publish only final count (in Phase 2/3, count of tokens/nullifiers at close) | Should |
| R6 | No "voter X has voted" live feed in Phase 2/3; Phase 1 participation list is published only as per the group's declared policy (QV-03) and defaults to *visible to organizer and verifiers at close* | Should |
| R7 | Comment/free-text attached to ballots is not supported (side channel) | Must |
| R8 | Unanimity (all counts in one option) shows a notice that all voters' choice is thereby public | Should |

## 11. Requirements summary (additional)
| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-26-REQ-001 | TLS 1.3-only clearnet; strict headers per §4 | Must | Scanner (e.g., testssl/header check) passes in CI against reference deployment | Deploy test |
| QV-26-REQ-020 | Default no-IP/UA/Referer persistence at app, proxy and OS-log layers | Must | Grep of logs after test traffic finds none of test IPs/UAs | Integration |
| QV-26-REQ-050 | Effective log policy is published at `/.well-known/quietvote/privacy` | Should | Endpoint matches config | Integration |
| QV-26-REQ-060 | Small-group rules R1–R3, R7 enforced by manifest validator | Must | Validator tests | Unit |

## 12. Security and abuse cases
| Case | Attacker | Impact | Mitigation | Residual |
|---|---|---|---|---|
| IP↔ballot via operator logs | Operator | Deanonymise Phase 2/3 voters | No IP logging; Unix-socket onion; relay | Operator can still log at kernel/network layer — unverifiable |
| Timing join of issuance and spend | Registrar+operator | Break Phase 2 unlinkability | S1/S2, separate channels | Small cohorts |
| Log-order inference | Log reader | Arrival-order leakage | S2 | Coarse epoch time |
| Tracking JS injected | Malicious operator | Full deanonymisation | Reproducible builds, SRI, pinned client (ADR-010) | Voters rarely verify |
| Fingerprint via UI differences | Observer | Device/locale leak | Uniform client | Browser-level fingerprints remain |
| Roll membership oracle | Anyone | Learn membership | Uniform errors | Timing noise |
| Traffic confirmation | Global adversary | Deanonymise Tor users | None offered | Residual, stated |
| DoS on onion service | Attacker | Availability | Tor PoW, intro rate limits [R4] | Persistent attackers |

## 13. Interfaces and dependencies
Upstream: QV-04 (phases), QV-08 (deployment profiles). Downstream: QV-09 endpoints (`/privacy`), QV-10 UI copy, QV-12 runbooks, QV-31 field allow-lists. Failure behaviour: if S2 epoch server crashes, ballots in the uncommitted epoch are re-requested from clients because receipts were not issued (REQ-043).

## 14. UX, accessibility, localization
- Explain in plain language: "Your ballot is encrypted on your device. Others could still see *that you connected*. For stronger privacy use Tor Browser (link)". Provide an "Open privacy panel" showing detected conditions (e.g., not using Tor → informational only; do not fingerprint to detect).
- The delay countdown must be perceivable to screen readers (live region, non-intrusive) and cancellable.
- Low bandwidth: padding capped at 1 KiB multiples; no cover traffic by default.
- Localization of privacy notices without third-party font/CDN requests; translations ship with the bundle.

## 15. Operations
Configuration via manifest + deployment profile; monitoring by QV-31 (no PII); backups exclude any volatile counters; incident: suspected log leakage → QV-12 privacy incident runbook, rotate onion address if Tor key compromise suspected.

## 16. Testing and verification
Unit: padding/ordering, schema. Integration: log-leak tests ("canary IP/UA in traffic, grep all storage"), epoch shuffling test, uniform-error test. E2E: Tor Browser–like profile run. Security: network capture test that confirms no third-party hosts contacted. Independent review: before any Phase 2 anonymity claim. Release-blocking: REQ-001, 011, 020, 030, 060.

## 17. Constraints and assumptions
- Tor provides low-latency anonymity and cannot defend against global passive adversaries [R1].
- Operators can lie about log policy; only architectural choices (Unix socket, no direct IP) provide enforcement.
- ECH, Tor Browser behaviours and torrc options must be re-verified at implementation time.

## 18. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-26-1 Should Phase 1 require a pseudonymous-key-mapping that the operator cannot hold (keys generated client-side, mapping held by group admins)? | Identity lead | QV-04 review | Yes: operator never holds mapping |
| QV-OQ-26-2 Quantitative anonymity-set estimator | Researcher | Phase 2 | Conservative counter only |
| QV-OQ-26-3 Cover traffic (S4) worth it? | Security lead | Phase 3 | No |
| QV-OQ-26-4 Default D for S1 | UX/Security | Phase 2 pilot | 10 min |

## 19. Proposed ADRs
- **QV-ADR-P26-1 — Application binds to a Unix socket in onion profiles so IPs are never visible to application code.**
- **QV-ADR-P26-2 — Epoch-batched, hash-sorted appends and client random delay as Phase 2/3 defaults.**
- **QV-ADR-P26-3 — No JS-free voting fallback (rejected); document Tor Browser Standard level as the supported maximum.**
- **QV-ADR-P26-4 — Small-group floor of 3 and mandatory acknowledgement under 10.**

## 20. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## References (accessed 2026-10-21)
- [R1] Dingledine, Mathewson, Syverson, "Tor: The Second-Generation Onion Router", USENIX Security 2004 (global passive adversary limitation) [UNVERIFIED URL; Tor design documents at https://spec.torproject.org].
- [R2] Tor Project documentation on Onion-Location header [not retrieved by search; verify at https://community.torproject.org/onion-services/].
- [R3] Tor onion services client authorization [UNVERIFIED; verify in Tor manual].
- [R4] Tor Project, "Introducing Proof-of-Work Defense for Onion Services", https://blog.torproject.org/introducing-proof-of-work-defense-for-onion-services (found by search; PoW introduced in Tor 0.4.8).
- [R5] Vanguards: results confirm it is a controller add-on by Mike Perry; Arti version shipped — see https://onionbalance-federico-30355186830e9bb095edebace68d79c9b3157e903.pages.torproject.net/security/ (search result; secondary).
- [R6] OnionBalance man page: not compatible with PoW defense — https://dyn.manpages.debian.org/trixie/onionbalance/onionbalance.1 (search result).
- [R7] RFC 9474, "RSA Blind Signatures", https://www.rfc-editor.org/rfc/rfc9474 [number per ADR-005; not re-fetched].
- [R8] Semaphore protocol, https://semaphore.pse.dev [not fetched].
