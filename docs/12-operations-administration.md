# QV-12 — Operations and Administration

**Module ID:** `operations-assurance`
**Status:** Draft
**Owner:** Operations lead
**Last reviewed:** 2026-10-21
**Related specs:** QV-08 (architecture), QV-11 (testing), QV-07 (threat model), QV-06 (data lifecycle), QV-26 (metadata), QV-31 (telemetry), QV-14 (sustainability), QV-25 (legal), QV-32 (federation), QV-16/QV-20 (protocol); ADR-002, ADR-003, ADR-007, ADR-009, ADR-010.

## 1. Objective
Specify how a QuietVote instance is provisioned, run, observed, backed up, upgraded, and recovered, such that the **operator remains untrusted for secrecy and integrity and trusted only for availability** (ADR-001/008). Every procedure is designed so that an operator mistake or malice is either harmless to the guarantees or detectable by verifiers. Operations must never require an operator to see ballot plaintext, trustee shares, or voter identity mappings.

## 2. Scope
### In scope
Single-node self-hosted deployment (ADR-002) and a maintainer-hosted instance on the same code; runbooks; monitoring; backups/DR; upgrades/migrations; incident response; on-call; SLOs; capacity; admin guide outline.
### Out of scope
Multi-operator federation (QV-32), multi-region active/active, anything requiring KYC/support access to member data, bespoke enterprise integrations.

## 3. Actors
| Actor | Responsibility | Never has |
|---|---|---|
| Instance operator (sysadmin) | Host, OS, Tor/TLS, backups, upgrades | Trustee shares, ballot plaintext, roll↔person mapping (QV-26 OQ-1) |
| Group organizer | Creates elections/manifests, roll, eligibility | Trustee shares (unless also a trustee) |
| Trustee | Holds a key share; performs DKG & decryption | Operator privileges by default |
| Auditor/monitor | Runs verifier, watches tree heads | Write access |
| Maintainer on-call (hosted only) | Platform incidents | Access to group-private data |

## 4. Provisioning

### 4.1 Reference topology (single node)
```mermaid
flowchart LR
  V[Voter browser / Tor Browser] -->|TLS1.3 or onion| P[Reverse proxy or Tor]
  P -->|unix socket| A[quietvote-server (Node 22)]
  A --> S[(SQLite: node:sqlite WAL)]
  A --> L[(Append-only log files + STH signing key)]
  M[Mirrors / witnesses] -->|pull STH, consistency| A
  B[Backup target (encrypted, offsite)] <-- A
```
Minimum hardware (Phase 1, ≤ 10,000 voters/election): 1 vCPU, 1 GB RAM, 20 GB SSD, Linux x86_64/arm64, Node.js 22 LTS (ADR-003). Reference distribution: a container image (rootless, read-only rootfs, non-root UID) and a systemd unit; both reproducible and signed (ADR-010).

### 4.2 Provisioning steps (checklist)
1. Obtain release artifact + signed release manifest; verify signature with the project release key (QV-OQ-12-1: key distribution) and the reproducible-build hash (ADR-010).
2. Create unprivileged user `quietvote`; directories `/var/lib/quietvote` (0700), `/run/quietvote` (socket 0660 to proxy group).
3. Generate the **STH signing key** on the host (Ed25519), store with 0600; export the public key into the instance descriptor. Back up offline (§7).
4. Configure TLS (ACME) or Tor onion service (QV-26 §5); verify headers; disable access logs of IPs (QV-26 §6).
5. Start service; run `quietvote doctor` (config lint: log policy, clock sync, file perms, disk space, backup configured, time source) — must pass before first election (QV-12-REQ-001).
6. Create instance admin credential: a signing key held by the organizer (no passwords), see §5.
7. Publish `/.well-known/quietvote/instance` descriptor (version, build hash, STH key, log policy, support contact, operator-declared jurisdiction).
8. Smoke test with a test election including Benaloh audit, then **delete** the test org (data export + secure delete).

### 4.3 Organization onboarding/offboarding
- Onboarding: organizer creates an org (a signed `OrgCreate` record with the organizer public key); no email required. Optional contact channel is stored encrypted to the organizer key only if provided.
- Offboarding/exit: `quietvote export --org` produces the full portable archive (manifests, rolls, log segments, ballots, results, audit transcripts, STH chain; format owned by QV-09, Must per ADR-001); `quietvote purge --org` deletes DB rows and tombstones the org; the append-only log retains only hashes/pseudonymous keys (QV-25 erasure analysis). Operator-initiated removal requires a published reason code.

## 5. Admin roles, keys, and recovery
| Role | Auth | Recovery |
|---|---|---|
| Instance admin | SSH + OS; app has no web admin UI in MVP (CLI only) | Standard OS recovery |
| Org admin(s) | Ed25519 key(s); k-of-m multi-admin optional (default 1-of-1, recommended 2-of-3 for groups >50) | Pre-registered recovery admin key, or a time-locked recovery after N days with public notice in the log (no operator override) |
| Trustees | DKG share + passphrase-wrapped on hardware token/file | Threshold design: loss of up to n−t shares tolerated; beyond that the election cannot be decrypted (see §10.5) |
Rules: changes to roles are log entries; operators cannot add org admins; no "support override" (ADR-001). Key rotation: STH key rotation = new key announced in an STH signed by both keys; org admin rotation = admin-signed record; onion address rotation = QV-26 §5.2.

## 6. Election lifecycle operations (runbook R-ELECT)
| Stage | Operator actions | Org/trustee actions | Checks |
|---|---|---|---|
| Schedule | None | Manifest drafted; times in UTC with explicit local-time display (QV-10) | Manifest validation passes; clock skew < 1 s (NTP/Chrony) |
| DKG | Host the ceremony coordinator (untrusted) | Trustees run DKG; publish transcript | Verifier checks transcript |
| Open | Confirm `doctor`, backups fresh, disk ≥ 5× projected ballot size | Sign & publish manifest | First STH published |
| Open period | Monitor (§8); no restarts except emergencies; freeze upgrades | Answer voter questions | SLOs |
| Pause (exceptional) | Only if the manifest declares `pause_allowed` and org admin signs; recorded in log | Org | Time extension rules (QV-03) |
| Close | Reject new ballots at close time (server clock + signed `CLOSE` entry) | — | Final STH |
| Tally | Host artifacts | ≥ t trustees decrypt; publish partials | Verifier PASS |
| Archive | Export + backup | Publish result | Retention timers (QV-06) |
| Cancel | Org admin signed `CANCEL`; data retained per policy | — | Log shows reason |
**Deadline outage policy (closes an open question):** the server cannot unilaterally extend a deadline. If an outage ≥ 5 minutes occurs during the final hour and the manifest allows, the org admin may publish a signed `EXTEND` entry (max cumulative extension declared in manifest, default 24 h); otherwise the election closes as scheduled and the outage is recorded in the audit report. Ballots submitted but unlogged due to outage have no receipt and are not counted (QV-26-REQ-043).

## 7. Backups and restore drills
- **What:** SQLite DB (online backup API or `VACUUM INTO`), log files, instance config, STH key (separately, offline). **Not** backed up: trustee shares (the operator never has them), volatile rate-limit keys.
- **How:** nightly full + hourly WAL-aware incremental during open elections; encrypt with `age` (X25519) to an offline backup key held by the operator; push to ≥ 1 offsite target (different provider). Backups contain only ciphertexts, pseudonymous keys and public data, so a leak is not a secrecy failure — but it is a metadata/privacy event (rolls, participation), hence encrypted.
- **RPO/RTO targets (hosted & recommended for self-host):** RPO ≤ 5 min during open elections (hourly WAL ship is insufficient — use continuous replication such as Litestream-style WAL shipping [UNVERIFIED tool choice] or accept RPO = 1 h and a **ballot receipt-based recovery**: voters retain receipts; ballots acknowledged but lost can be resubmitted from the client because client holds the signed ballot for 24 h after cast — QV-10). RTO ≤ 4 h for a hosted instance, ≤ 24 h self-hosted guideline.
- **Integrity of restore:** after restore, the server must prove consistency: it recomputes the Merkle tree and compares the root to the last STH witnessed by mirrors. If the restored log is *behind* any published STH, the instance enters `RECOVERY_FORK_RISK`: it refuses new appends and publishes a signed explanatory entry until the org admin confirms how to reconcile (resubmission from receipts). Never present a shorter log as continuous.
- **Restore drills:** quarterly (Must for hosted, Should for self-host) restoring to a clean host, running the verifier against the restored data, measuring RTO. Record in the ops journal (no PII).
- **Backup key custody:** two custodians; yearly test of decrypting the latest backup.

## 8. Monitoring without PII
Detailed allow/deny lists are in QV-31. Principles:
- Health & SLI metrics are **aggregate counters/gauges/histograms only**: request counts by route template and status class, latency histograms, ballots-accepted counter, rejection counters by error code, queue depth, DB size, WAL size, disk free, certificate expiry days, Tor bootstrap/descriptor status, clock offset, backup age, last STH age.
- No per-voter labels, no per-IP series, no raw URLs; label cardinality capped (QV-31).
- Metrics endpoint bound to loopback/unix socket, scraped locally; alert delivery contains no identifiers.
- Synthetic probes: an external prober hits `/health/ready` and fetches the STH every minute (probe IP is the prober's, not a voter's); a canary "test org" election may run continuously in hosted mode.
- Witness/mirror monitor: independent party compares STHs and runs consistency checks; alert on any inconsistency (this is both an integrity and an availability signal).
| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-12-REQ-010 | Monitoring shall use only aggregate metrics defined in QV-31 | Must | Metrics scrape lint passes denylist | CI |
| QV-12-REQ-011 | Alerts shall fire for: STH age > 10 min during open election; ballot-reject rate spike; disk < 20 %; backup older than 26 h (2 h in open election); cert expiry < 14 d; clock offset > 500 ms | Must | Alert rules unit-tested with synthetic data | Test |

## 9. Upgrades and migrations
- **Versioning:** SemVer for server, separate `protocol_version` (QV-16) that is fixed per election at manifest signing. A running election is **never** upgraded across protocol versions (Must).
- **Policy:** security patches may be applied during an open election only if protocol-neutral (no change to validation/tally code); otherwise defer to after close unless a Critical (below) forces an emergency decision (§10).
- **Procedure (runbook R-UPGRADE):** (1) read release notes and signed manifest; (2) verify signature/hash; (3) take backup + verify; (4) stop traffic gracefully (drain); (5) apply DB migration (forward-only, transactional, each migration tested with up/restore); (6) start; (7) `doctor` + smoke test + verifier on a sample election; (8) monitor 1 h; (9) rollback = restore previous binary + DB backup (migrations are not reversible, so rollback uses the pre-upgrade backup; any ballots accepted after the upgrade would be lost → therefore upgrade only when no election is open, or accept the receipt-resubmission path).
- **Client updates:** the client bundle served is bound to the manifest's `client_hash`; an election opened with client hash H serves H until close (ADR-010). Rolling clients mid-election is forbidden unless hash matches a manifest-allowed set.
- **Deprecation:** each major version supported ≥ 12 months for security fixes; export formats stable and versioned.
- **Schema migrations:** documented in QV-09; every migration ships with a `down` rehearsal in CI against fixtures.

## 10. Incident response
### 10.1 Severity
| Sev | Examples | Response |
|---|---|---|
| S1 Critical | Verifier mismatch on live data; trustee share exposure; STH signing key compromise; tally out of bounds (QV-20 REQ-008); logs leaking IPs; malicious client build served | Immediate: freeze affected election (org admin signed `PAUSE` if allowed; else operator takes instance read-only), notify org admins within 1 h, publish advisory within 24 h |
| S2 High | Availability loss during open election > 15 min; backup failure; cert expired | Restore within RTO; extend deadline per §6 |
| S3 Medium | Elevated rejects; degraded perf | Next business day |
| S4 Low | Docs/UX | Backlog |
### 10.2 Playbooks (one-liners; full runbooks live in the repo `ops/runbooks/`)
1. **STH key compromise:** stop signing; rotate key via cross-signed rotation if the old key is still trusted for the pre-compromise range, otherwise declare a fork notice; witnesses' cosigned heads define the trustworthy prefix (ADR-007).
2. **Trustee share loss/compromise:** <t compromised: no secrecy loss, rotate before next election; ≥ t suspected: treat that election's ballots as publicly decryptable → notify all org admins and voters, mark result as *integrity intact, secrecy lost*, never silently continue; long-term secrecy measures (ADR-013): destroy shares after audit window.
3. **Malicious/compromised client served:** revert to the manifest `client_hash`; publish incident; voters who cast during the window are told to verify via Benaloh audit/receipt with an independent client; org may void and rerun.
4. **Log fork/rollback detected:** see §7 `RECOVERY_FORK_RISK`; publish evidence.
5. **Privacy incident (log retention of IPs, leak of backup):** stop the leak, delete, publish a notice, notify org admins (who are controllers; QV-25 for 72-h GDPR clock).
6. **Vulnerability report:** per `SECURITY.md` (90-day coordinated disclosure default [UNVERIFIED norm choice]); critical patches get an advisory + CVE request.
### 10.3 Authority for recount/invalidation (closes OQ)
Invalidation or rerun is a **group decision**: the org admin (per manifest `dispute_policy`, QV-03) signs a log entry; the operator cannot invalidate and cannot refuse export. A recount = re-running the verifier (anyone may); a "recount" of decryption by trustees is possible only while shares exist (before destruction).
### 10.4 Post-incident
Blameless review within 7 days, published in sanitized form; action items tracked; update runbooks.
### 10.5 Trustee absence
If fewer than t trustees are available at tally, the election result is *unavailable*, not insecure. Options declared pre-election: extended wait, backup trustee pool (t-of-n with n > t by design; recommended n = 2t−1 or n = t+2), or an organizer-declared rerun. No operator escrow.

## 11. On-call and support
- **Self-hosted:** community support via issue tracker/forum/chat (no PII in public tickets); best-effort. Paid support: QV-14.
- **Hosted:** business-hours support (e.g., UTC+0..+2 for hosted v1), email response ≤ 2 business days for S3/S4; S1/S2 24×7 page for a single maintainer rotation; with a volunteer-run project, the honest commitment is **best effort for non-paying groups, SLA only on paid contracts** (QV-14).
- Support staff **never** request ballot choices or private keys; support tooling shows only aggregate/instance state. Support channel guidance for members to prove identity not applicable (no KYC).
- On-call rota: ≥ 2 people; handover notes; paging via a service that does not receive voter data. Runbook tests ("game days") twice a year.

## 12. SLOs and capacity
Numerical targets are now proposed since the deployment assumption is fixed (single-node, SQLite) — closing the earlier "do not choose numbers" note.
| SLI | Target (hosted v1) | Measurement |
|---|---|---|
| Availability during open election windows | 99.5 % per election (≈ 3.6 h/month per 30-day window if continuous; during short windows, error budget ≤ 1 failed 15-min period per 48 h) | External prober, `/health/ready` |
| Ballot submission acknowledgment latency | p95 ≤ 2 s, p99 ≤ 5 s (excluding client proving time; Tor: p95 ≤ 8 s) | Server histogram |
| Receipt/inclusion proof availability | ≤ 1 epoch + 60 s | STH age |
| STH publish freshness | ≤ 10 min during open | Gauge |
| Data durability | RPO ≤ 5 min open / ≤ 24 h otherwise | Backup monitor |
| Restore time | RTO ≤ 4 h hosted | Drill |
| Security patch SLA (Critical) | Patch/mitigation ≤ 72 h from triage | Release notes |
**Capacity model (to be validated by load tests, QV-11):**
- Ballot size (approval, n = 10 options): ≈ 10×192 B + 64 B sum proof + 64 B signature + envelope ≈ 2.3 KB (QV-20 §5); at 100,000 voters ≈ 230 MB per election (plus revotes ×1.5 typical).
- Verification cost per selection ≈ several scalar multiplications; assume 2–5 ms per selection in Node with noble [estimate; benchmark] → 10-option ballot ≈ 20–50 ms CPU → 20–50 ballots/s/core. A 10,000-voter election spread over a 7-day window is trivial; a flash close (50 % of voters in the last hour) = 5,000 ballots/h ≈ 1.4/s: fine. Supported maximum for MVP: **100,000 voters/election, 20 concurrent open elections per node, 100 ballots/s peak** (to be proven by test; adjust).
- Ranked n = 8 (strict): ≈ 13 KB, 56 pairs + 56 triples proofs → ≈ 0.3–0.6 s CPU/ballot; supported max 10,000 voters per node unless batch verification is added.
- Final tally verification is O(ballots); the CLI verifier should process ≥ 200 ballots/s/core (approval).
- Storage growth: ~1.5× ballots size for log + indices; keep ≥ 5× headroom before open.
- Scaling: vertical; read replicas of the public log via static mirrors (QV-32).

## 13. Disaster recovery
| Scenario | Plan |
|---|---|
| Host loss | Restore from encrypted backup to new host; consistency check against witnessed STH; resubmission window |
| Provider account loss/seizure | Restore elsewhere using offsite backup; onion key/ domain move; export is portable by design (exit-friendly) |
| Operator unavailable / abandonment | Org admin has the full export; any party can host a read-only mirror to serve the archive; dead-man's-switch publication of a `LAST_WILL` backup key escrow to org (QV-OQ-12-3) |
| Ransomware | Immutable/offline backups; verifier recovery; no ransom — rotate keys |
| Clock failure | Refuse to accept ballots if clock offset > 1 s from NTP or STH age mismatch; fail closed |
| Trustee quorum lost | §10.5 |
| Site-wide legal order | QV-25 counsel checklist; export + warrant canary [UNVERIFIED legal value] |

## 14. Self-host administrator guide — outline
1. Is self-hosting right for your group? (Threat model, who's untrusted, what you must do: patch, back up, protect keys.)
2. Choose deployment: VPS + TLS, home server + Tor, air-gapped tally.
3. Install: verify signatures, reproducible build check, container/systemd.
4. First-run: `doctor`, instance descriptor, TLS/Tor hardening, log policy verification.
5. Creating your org, admins, backup admin, trustee selection (who, how many, how to store shares; ceremony script).
6. Running an election: manifest checklist, rolls, testing with a dry run, voter communications templates (no PII in public channels).
7. Monitoring and alerting setup (local Prometheus-style scraper, with the allowed metric list).
8. Backups & restore drills (copy-paste scripts), key custody.
9. Upgrades: schedule, procedure, rollback, when not to upgrade.
10. Incident response cheatsheet and who to notify; legal notes (QV-25).
11. Retirement/exit: export, purge, destroy shares, publish final STH.
12. Appendix: config reference, error codes, ports, file layout, glossary, troubleshooting.

## 15. Requirements
| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-12-REQ-001 | `quietvote doctor` shall validate log policy, perms, clock, disk, backup configuration, and refuse election opening on failure | Must | Misconfigured fixture fails with specific code | Integration |
| QV-12-REQ-002 | The server shall provide full org export and purge commands without operator-held secrets | Must | Export imported into a fresh instance yields identical verifier PASS | E2E |
| QV-12-REQ-003 | No code path shall allow the operator to alter a manifest, add voters, or invalidate an election after signing | Must | Authorization tests; log shows only admin-signed changes | Security test |
| QV-12-REQ-004 | The server shall fail closed on clock skew > 1 s and when restored log is behind a witnessed STH | Must | Fault-injection tests | Integration |
| QV-12-REQ-005 | Backups shall be encrypted to an operator-held offline key; a restore drill procedure and script shall ship | Must | Drill script restores and verifier passes | Test |
| QV-12-REQ-006 | A protocol/validation change shall never be applied to an election after its manifest is signed | Must | Server refuses start with mismatching protocol version for open elections | Integration |
| QV-12-REQ-012 | Emergency extension shall require a manifest-declared allowance and org-admin signature | Should | Test | Integration |
| QV-12-REQ-013 | Runbooks for incidents §10 shall exist in-repo and be exercised ≥ twice/yr (hosted) | Should | Game-day record | Review |
| QV-12-REQ-014 | Support tooling shall expose no ballot or identity data | Must | Tool review; denylist test | Review |
| QV-12-REQ-015 | SLOs in §12 shall be measured and published at `/status` aggregate page for hosted | Could | Page shows SLIs | Manual |

## 16. Data and privacy
Operational data: aggregate metrics, config, rotated logs (no IPs). Controller: the group (self-hosted) or group with maintainer as processor (hosted; QV-25). Retention: logs ≤ 7 days, metrics ≤ 90 days aggregated, backups ≤ 35 days (rolling) plus an annual archive only if the group asks. Not claimed: that the operator cannot observe network-layer metadata outside the application (QV-26).

## 17. Security and abuse cases
| Case | Cause | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Operator edits DB | Malicious operator | Altered ballots | Signatures, Merkle log, verifier, mirrors | Availability harm, censorship |
| Backup theft | Compromise | Roll/participation exposure | Encryption, minimal contents | Metadata exposure if key stolen |
| Supply-chain upgrade | Compromised release | Malicious code | Signature, reproducible build, dependency minimalism (ADR-003) | Key compromise of maintainers |
| Admin key loss | Human error | Org locked out | Recovery admin / time-lock | Delay |
| Ops dashboard leak | Misconfig | Metrics leak | Aggregates only | Low |

## 18. Interfaces and dependencies
Upstream: QV-08 components, QV-11 gates, QV-31 field lists, QV-26 profiles. Downstream: QV-14 (support offering), QV-25 (policies). CLI: `quietvote doctor|export|purge|backup|restore|verify|rotate-sth-key`.

## 19. UX, accessibility, localization
Admin tooling is CLI + generated static HTML status pages; CLI output machine-readable (`--json`) and screen-reader-friendly (no colour-only meaning). Admin guide translations are Could. Voter-facing outage notices are plain-language, localised, and accessible (QV-13).

## 20. Testing and verification
Backup/restore drill automated in CI against fixtures; chaos tests (kill -9 mid-append, disk full, clock jump); load tests for §12; upgrade rehearsal; log-leak canary tests (QV-26). Release-blocking: REQ-001–006 pass.

## 21. Constraints and assumptions
Single-node SQLite constrains horizontal scale. Volunteer-run support limits SLAs. Tooling choices (Litestream-like replication, age) are proposals requiring supply-chain review.

## 22. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-12-1 Release-key distribution and rotation (multi-sig? threshold of maintainers) | Maintainers | Before 1.0 | 2-of-3 maintainer signatures, key in repo and mirrors |
| QV-OQ-12-2 Who may inspect hosted logs | Hosted operator | Before hosted launch | Nobody beyond aggregate metrics; no PII exists |
| QV-OQ-12-3 Abandonment/escrow of instance keys | Ops/Legal | Hosted launch | Orgs hold their own exports; no escrow |
| QV-OQ-12-4 Continuous replication tool | Ops | Phase 1 | Evaluate Litestream-style vs `VACUUM INTO` cron |

## 23. Proposed ADRs
- **QV-ADR-P12-1 — No web admin UI in MVP; CLI + signed records only.**
- **QV-ADR-P12-2 — Operator cannot extend/pause/invalidate; only manifest-authorised org-admin-signed log entries.**
- **QV-ADR-P12-3 — Restored-behind-witness logs fail closed with receipt-based resubmission.**
- **QV-ADR-P12-4 — Upgrades never cross protocol versions for an open election.**

## 24. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |
