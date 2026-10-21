# QV-31 — Telemetry and Observability

**Module ID:** `telemetry-observability`
**Status:** Draft
**Owner:** Operations lead with privacy lead
**Last reviewed:** 2026-10-21
**Related specs:** QV-12 (operations), QV-26 (metadata privacy §6 log policy), QV-06 (data lifecycle), QV-07 (threat model), QV-25 (legal), QV-09 (API); ADR-009, ADR-001.

## 1. Objective
Provide operators enough signal to keep an instance healthy and detect integrity problems **without** creating linkage between a person and a ballot, a ballot and a time/network location, or a person and their participation beyond what the identity phase publishes (QV-26 §9). Telemetry is a privacy liability first and an operational asset second: everything not explicitly allowed here is forbidden (default-deny).

## 2. Scope
### In scope
Metrics, logs, traces, health endpoints, crash handling, client-side diagnostics, retention, access control, redaction, and review procedure for QuietVote server, client and CLI.
### Out of scope
Product analytics (none exist: no analytics, ADR-009); billing metrics (QV-14); third-party SaaS observability (prohibited for voter-facing paths).

## 3. Principles
1. **Default-deny schema:** observability fields come from a checked-in allowlist (`telemetry/schema.json`); a build/CI step rejects any metric, log field, or span attribute not in it.
2. **Aggregates over events:** counters/histograms, not per-request records. Event logs only for operator-facing audit actions (admin-signed actions, deployments) that contain no voter data.
3. **No identifiers:** no voter key, ballot id/hash, token, nullifier, IP, user agent, referrer, session id, org-member name, or full URL.
4. **Bounded cardinality and time resolution:** label values from enumerations; timestamps rounded to 1 minute in logs; small counts suppressed (k ≥ 5 per label combination in any externally shared view).
5. **Local-only by default:** metrics exposed on a loopback/Unix socket; no outbound telemetry, no phone-home (QV-25 REQ-007). Operators may opt in to forwarding to their own infrastructure; the project never receives data.
6. **Client telemetry: none.** The client does not send diagnostics. Errors are shown locally; the user may copy a sanitized report.

## 4. Allowed and forbidden fields

### 4.1 Metrics (server)
| Metric | Type | Labels (enumerated) | Notes |
|---|---|---|---|
| `qv_http_requests_total` | counter | `route` (template), `status_class` (2xx/4xx/5xx), `method` | route templates only; e.g. `/api/v1/elections/:id/ballots` |
| `qv_http_request_duration_seconds` | histogram | `route`, `status_class` | buckets fixed |
| `qv_ballots_accepted_total` | counter | `method` (voting method), `phase` (1/2/3) | **no election id** unless instance has ≥ 5 elections concurrently? → default: omit election label; per-election counts are public in the log anyway |
| `qv_ballots_rejected_total` | counter | `code` (E_ENCODING, E_PROOF, E_AUTH, E_SUPERSEDED, E_CLOSED, E_RATE) | QV-20 §13 |
| `qv_log_entries_total`, `qv_log_tree_size` | counter/gauge | none | public information |
| `qv_sth_age_seconds` | gauge | none | |
| `qv_sth_sign_duration_seconds` | histogram | none | |
| `qv_epoch_pending_ballots` | gauge | none | QV-26 epoch batching; rounding to 10 recommended |
| `qv_db_size_bytes`, `qv_wal_size_bytes`, `qv_disk_free_bytes` | gauge | none | |
| `qv_backup_age_seconds` | gauge | `kind` (full/incremental) | |
| `qv_tor_bootstrap_percent`, `qv_onion_descriptor_published` | gauge | none | from local Tor control port (read-only, no circuit data) |
| `qv_cert_expiry_days` | gauge | none | |
| `qv_clock_offset_seconds` | gauge | none | |
| `qv_process_*`, `qv_nodejs_*` | standard runtime | none | CPU, memory, event-loop lag |
| `qv_rate_limited_total` | counter | `route` | no per-client dimension |
| `qv_build_info` | gauge=1 | `version`, `commit`, `client_hash` | public |
| `qv_active_elections` | gauge | `state` | counts only |

### 4.2 Logs (server)
Allowed fields: `ts` (rounded to the minute, UTC), `level`, `event` (enumerated name), `route` (template), `status`, `dur_bucket` (`<50ms`, `<250ms`, `<1s`, `<5s`, `>=5s`), `code` (error enumeration), `component`, `build`, `msg` (static message from catalog, no interpolated user data), `org_hash` (**not allowed**; omit), `epoch_no`, `tree_size`. Admin audit events (`org_created`, `manifest_published`, `close`, `extend`, `pause`, `key_rotated`) may carry the public object ids already present in the public log.

### 4.3 Forbidden everywhere (logs, metrics, traces, crash dumps, tickets)
IP address (any form, including hashed or truncated, except the ephemeral in-memory rate-limit key in QV-26 §6, which is never exported), User-Agent, Accept-Language, Referer, cookies, full URL with query string or path params, voter public key, signature, ballot ciphertext, ballot hash/id, receipt, token/credential, nullifier, trustee key material, backup keys, email addresses, names, free text from users, timing of a *specific* voter's request, request/response bodies, stack traces containing request data, environment variables, core dumps.

### 4.4 Traces
Distributed tracing is **disabled** in the reference build (single process). If enabled by operators, spans carry only `route`, `status_class`, `dur_bucket`, no attributes from requests; sampling ≥ 1 % random, no tail-based sampling on errors with details.

### 4.5 Crash and error reporting
No automatic reporting. Unhandled exceptions log `event=crash`, `component`, error class name and a stack trace of **application frames only** with arguments stripped; dumps disabled (`ulimit -c 0`, `--no-node-snapshot`-like settings as available). A `quietvote support-bundle` command assembles config (secrets redacted), version, metrics snapshot and log tail, runs a scrubber (denylist regexes for IPs, emails, 32/64-hex strings, base64 > 40 chars) and **shows the bundle to the operator for review** before they send it anywhere.

## 5. Health endpoints
| Endpoint | Purpose | Auth | Content |
|---|---|---|---|
| `GET /health/live` | Process alive | none; loopback or public (hosted) | `200 {"status":"ok"}` only |
| `GET /health/ready` | Ready to serve: DB reachable, log writable, clock offset OK, STH key loaded, disk free > threshold | none | `200`/`503` with static body; a failing check yields a coarse `reason` enum (`db`,`log`,`clock`,`disk`,`key`) |
| `GET /health/integrity` | Log self-check: last STH signature verifies, tree size monotone, consistency with last checkpoint | none | `{"tree_size":N,"sth_age_s":S,"consistent":true}` — public info |
| `GET /.well-known/quietvote/instance` | Descriptor (version, build, STH pubkey, log policy, source_url, support contact) | none | public; static (QV-25, QV-26) |
| `GET /metrics` | Prometheus-format metrics | bound to loopback/Unix socket; optional token | §4.1 only |
| `GET /status` (hosted, optional) | Public SLIs | none | aggregates; availability %, p95 ack latency over 30 days; k-suppression applies |
Health endpoints are uniform for all callers and respond within constant time classes; they never reveal per-organisation info. Over Tor onion services, `/metrics` is not exposed.

## 6. Retention, access, review
| Data | Retention | Access |
|---|---|---|
| Application logs | ≤ 7 days (rotate daily, delete) | Instance operator via SSH, no copying out of host |
| Metrics (raw) | ≤ 30 days; downsampled aggregates ≤ 13 months | Operator/on-call |
| Admin audit events | Life of org + export | Org admins (via export), operator |
| Support bundles | Deleted when ticket closed (≤ 30 days) | Support staff named in ticket |
| Public log | Permanent (by design) | Public |
- Access control: SSH keys with MFA/hardware tokens; no shared accounts; access to hosted logs is recorded (who/when, in an operator-only journal).
- **Review:** monthly automated check that deployed config matches allowlists; quarterly manual review of logs/metrics samples by a second person; any schema addition goes through PR with "privacy review" label and an entry in this document.
- **Redaction:** structured logger drops unknown keys (allowlist), truncates strings to 128 chars, and refuses to log objects (only primitives); unit-tested with canary values.

## 7. Requirements
| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-31-REQ-001 | The server shall emit only metrics/log fields in the allowlist; unknown fields shall be dropped and counted | Must | Canary test injects voter key, IP, UA; none appear in any sink | Integration |
| QV-31-REQ-002 | CI shall fail when a new metric/log field/label lacks allowlist entry and privacy-review label | Must | PR fixture fails | CI |
| QV-31-REQ-003 | No outbound network connections for telemetry shall exist by default | Must | Network-capture test | Test |
| QV-31-REQ-004 | The client shall transmit no diagnostics, analytics or error reports | Must | Static scan + capture test | CI |
| QV-31-REQ-005 | Health endpoints `/health/live`, `/ready`, `/integrity` shall exist with the semantics of §5 | Must | Contract tests; failure injection flips status | Integration |
| QV-31-REQ-006 | `/metrics` shall be unreachable from public listeners and onion services by default | Must | Port scan/integration | Test |
| QV-31-REQ-007 | Label cardinality shall be bounded (≤ 200 series per metric) and per-election/per-voter labels forbidden | Must | Metrics lint | CI |
| QV-31-REQ-008 | Logs retained ≤ 7 days and timestamps rounded to 1 minute | Must | Rotation config test; log format test | Integration |
| QV-31-REQ-009 | Support bundle shall scrub per §4.5 and require operator confirmation | Should | Scrubber unit tests with canary corpus | Unit |
| QV-31-REQ-010 | Public status page values with count < 5 shall be suppressed | Should | Unit | Unit |
| QV-31-REQ-011 | Health responses shall be uniform regardless of caller | Must | Differential test | Integration |
| QV-31-REQ-012 | Alert rules in QV-12 REQ-011 shall use only §4.1 metrics | Must | Rule lint | CI |

## 8. Data and privacy
Telemetry data classes: operational aggregates (non-personal), admin audit events (organisation-level, may include admin public keys — pseudonymous personal data; minimal), support bundles (scrubbed). Linkability risks: low-count metrics can reveal activity of a single small election — mitigated by omitting election labels and by k-suppression in shared views. Privacy properties claimed: server telemetry cannot be used to link voters to ballots or network locations. Not claimed: that a malicious operator cannot add instrumentation (QV-26 §6: self-attested policy; verifiable only via reproducible builds and the architecture of Unix-socket onion binding).

## 9. Security and abuse cases
| Case | Attacker | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Metrics leak election activity (e.g., ballots/min) | Anyone with scrape access | Side-channel about turnout timing | Loopback only, no election label, minute rounding | Operator sees activity (also in DB) |
| Log injection | Voter | Log forging | Structured logging, no user data in messages | Low |
| Observability dependency compromise | Supply chain | Data exfiltration | Minimal deps, no vendor SDKs, no outbound by default | Low |
| Over-collection drift | Developer | Privacy erosion | Allowlist + CI + review | Human error |
| Cardinality attack to exhaust memory | Attacker | DoS | Enumerated labels | Low |
| Support bundle leak | Support | Exposure | Scrubber, review, short retention | Residual |

## 10. Interfaces and dependencies
Upstream: QV-12 (alerts, SLOs), QV-26 (log policy), QV-20 (error codes), QV-09 (route templates). Downstream: Prometheus-compatible scraper (optional), operator dashboards. Versioning: schema versioned (`telemetry/schema.json` semver); removals allowed, additions require review.

## 11. UX, accessibility, localization
Voter-facing: a "Privacy panel" states that the client sends no telemetry. Operator-facing: `/status` and CLI outputs accessible, localised, readable without colour alone.

## 12. Operations
Config keys: `telemetry.metrics.bind`, `telemetry.logs.retention_days` (max 7 unless `--unsafe`), `telemetry.forward.url` (empty default). Monitoring of the monitoring: `qv_telemetry_dropped_fields_total` counter (labelled by sink) alerts developers to schema drift. Incident: any discovery of forbidden fields in sinks is an S2 privacy incident (QV-12 §10): purge, publish note.

## 13. Testing and verification
Unit: allowlist logger, scrubber. Integration: canary-injection tests across all sinks including stderr, journald, crash path. E2E: health state transitions. Security: capture test for outbound connections and third-party hosts. Release-blocking: REQ-001–006, 011.

## 14. Constraints and assumptions
Prometheus text format assumed (open format; no vendor lock-in) [UNVERIFIED: choice of exact exposition library — hand-written minimal exporter preferred to avoid dependencies, ADR-003]. Node.js 22 diagnostics (reports, heap dumps) must be disabled in production profile.

## 15. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-31-1 Should election id appear in any metric label for hosted multi-tenant capacity planning? | Ops + privacy | Hosted design | No; use aggregate only |
| QV-OQ-31-2 Opt-in anonymous usage statistics for funders (QV-14)? | Steward | Stage 2 | No telemetry from deployments; funders get self-reported figures |
| QV-OQ-31-3 Differential-privacy noise on public status? | Researcher | Later | Not needed with k-suppression |

## 16. Proposed ADRs
- **QV-ADR-P31-1 — Default-deny telemetry schema enforced in CI.**
- **QV-ADR-P31-2 — No client telemetry; no outbound telemetry by default.**
- **QV-ADR-P31-3 — Tracing and automatic crash reporting disabled in the reference build.**

## 17. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## References
Internal ADRs and specs only; Prometheus exposition format (https://prometheus.io/docs/instrumenting/exposition_formats/) referenced as the metrics wire format [not retrieved in this session; verify].
