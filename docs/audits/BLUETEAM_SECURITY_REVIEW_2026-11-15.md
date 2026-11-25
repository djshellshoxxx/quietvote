# QuietVote — Blue-Team Defensive Security Review

**Date:** 2026-11-15  
**Target:** `integration/quietvote-completion` (branch head observed: `af7a52661169d3080b0d5d741ad3b3a9f6b09e93`)  
**Review type:** AI-assisted source/configuration review; defensive blue-team perspective.  
**Status:** **NOT CLEARED FOR REAL ELECTIONS.** This is not an independent professional audit, penetration test, deployment assessment, or cryptographic certification.

## 1. Scope and method

Reviewed the current integration-branch source and existing audit records, with emphasis on prevention, detection, containment, recovery, and release governance:

- HTTP request authentication, replay handling, authorization boundaries and rate limiting
- registration defaults, proxy trust, server configuration and resource controls
- encryption-key storage, backups, database hardening and retention
- webhook egress / SSRF controls and checkpoint gossip
- ballot admission and verifier assurance
- CI supply-chain controls and vulnerability-disclosure readiness

This pass was source-led. No tests, builds, fuzzers, live services, exploit PoCs, backup restores, or production configuration were executed. Findings below distinguish source-confirmed conditions from previously documented assurance gaps.

## 2. Executive assessment

QuietVote has a meaningful defensive foundation: signed management requests bind method, target, audience, timestamp, nonce and body hash; replay nonces are persisted after signature verification; unknown keys take a dummy verification path; SQLite connections enable foreign-key enforcement and disable trusted schema; request and import limits exist; webhook targets use HTTPS/public-address validation and DNS-pinned transport; CI uses read-only permissions, pinned action SHAs, lockfile checks and high/critical dependency-audit gates.

These controls do not offset the outstanding election-integrity and assurance blockers. The integration branch still contains a reverse-order spoil/cast ciphertext-reuse defect. The full-election verifier can report PASS without board evidence or an independently pinned manifest. Key custody, registration policy, trusted-proxy configuration, and security-response readiness also require operator or project-owner action.

## 3. Findings and defensive actions

### BT-01 — Reverse-order spoil/cast ciphertext reuse
**Severity: HIGH — release blocker**  
**Status: Confirmed present on the reviewed integration ref; repair exists on a divergent branch.**

The integration branch records cast ciphertext components in `castAlphas` and rejects a spoil that overlaps a previously admitted cast. It does not maintain the corresponding `spoilAlphas` set or reject a later cast that reuses ciphertexts from an earlier publicly revealed spoil. The separate `chatgpt/quietvote-s1-02-reverse-spoil-guard-20261114` branch contains the symmetric set tracking, cast-side rejection, and a focused regression test.

**Defensive impact:** a publicly opened spoil can be rewrapped as a later counted cast under a different ballot code. This breaks the cast-versus-audit separation and can expose a counted ballot's selections. It can also trigger an election-wide verifier alarm.

**Action:** review and port the minimal S1-02 implementation and test; replay the projection from persisted records; test restart/import/recovery, changed `supersedes`, multiple contests and tally construction. Run the full integration suite and both verifier implementations. Do not merge the divergent branch wholesale without reviewing its complete diff.

### BT-02 — Full-election PASS can omit bulletin-board evidence
**Severity: HIGH — release blocker**  
**Status: Carried forward from the 2026-11-15 second-pass audit; source logic documented there.**

The verifier can retain an overall PASS when a bundle has no board export and board append-only / witness checks are `not_run`. A consumer that relies on the top-level verdict or exit code may mistake protocol-bundle consistency for verification of the actual published election history.

**Action:** require board evidence for the full-election PASS, or introduce an unmistakable protocol-only / incomplete status. Keep CLI, JSON, offline HTML, browser UI and exit codes aligned. Add a valid-tally/no-board regression fixture and malformed/untrusted-board cases.

### BT-03 — Manifest authenticity anchor is optional
**Severity: HIGH — release blocker for authenticated-result claims**  
**Status: Carried forward from the 2026-11-15 second-pass audit.**

When no out-of-band manifest hash is supplied, verification can use the bundle's own manifest hash and still return PASS with a caveat. Internal consistency does not establish that the bundle is the election the user intended to verify.

**Action:** require an independently obtained manifest hash or equivalent trusted election identifier for a fully authenticated result. Otherwise label the result unanchored in every output format and test replacement with a self-consistent alternate election bundle.

### BT-04 — Independent verifier capability mismatch
**Severity: HIGH — assurance blocker**  
**Status: Known gap in existing audit/handoff records.**

The Python verifier does not yet provide the same board/log verification coverage as the TypeScript verifier. The two implementations therefore cannot currently provide equivalent independent confirmation of append-only history, witness evidence and receipt inclusion.

**Action:** publish a capability matrix; ensure unsupported checks never appear as PASS; add shared negative/mutation vectors and cross-verifier comparisons for every shared capability. Treat the Python implementation as partial until parity is demonstrated.

### BT-05 — Instance KEK resides inside the application data directory
**Severity: MEDIUM/HIGH depending on host threat model**  
**Status: Source-confirmed design condition; previously documented.**

`loadOrCreateKek()` creates `dataDir/kek/kek.bin` with restrictive mode bits, while encrypted database material and backups are also associated with the data directory. A filesystem-level copy or compromise of that directory can therefore expose both encrypted records and the key needed to decrypt them. File permissions protect against some local users, not against a backup operator, host compromise, or copied data directory.

**Action:** support a separately protected key source (KMS/HSM or separately mounted secret with independent backup/access policy). Document key rotation, recovery, disaster restoration, and compromise procedures. Verify backups never silently include the KEK and conduct a restore exercise using separately provisioned key material.

### BT-06 — Open registration is the default
**Severity: MEDIUM — deployment hardening required**  
**Status: Source-confirmed.**

`resolveConfig()` defaults `registrationMode` to `open`. The existing server audit notes that public organization registration can enable unbounded organization/election database growth even when per-organization quotas and network rate limits exist.

**Action:** for hosted deployments, require an explicit registration-mode choice and prefer token or closed registration unless public self-service is an intentional product requirement. Add startup warnings or a production-mode refusal when open registration is enabled without explicit acknowledgement; add global quotas and alerting for organization/election creation and disk use.

### BT-07 — Optional proxy bucket header is trusted as supplied
**Severity: MEDIUM — configuration-dependent**  
**Status: Source-confirmed.**

The HTTP layer passes the configured `bucketHeader` value directly into the network-bucket keyer. If the service is reachable without a proxy that strips and overwrites this header, clients can choose their own bucket identifiers and bypass per-network rate limits.

**Action:** do not enable this option unless the application is network-restricted to the trusted reverse proxy and the proxy overwrites the header. Prefer an authenticated proxy-to-app signal or an explicit trusted-proxy configuration. Add deployment tests proving direct clients cannot control the bucket identity.

### BT-08 — Vulnerability-disclosure policy is not operational
**Severity: MEDIUM — governance / incident-response gap**  
**Status: Confirmed in `SECURITY.md`.**

The security contact email, PGP fingerprint/key, age recipient, security.txt location and staging instance are placeholders. Private vulnerability reporting is marked for confirmation. The policy also describes the project as pre-implementation even though this branch contains substantial code.

**Action:** publish a monitored security contact and verified encryption key, enable and test private vulnerability reporting, publish a real security.txt, define a safe staging target, and align the policy with the implementation and supported release status. Exercise the reporting and incident-triage path before inviting external reports.

### BT-09 — Outbound gossip is opt-in and does not itself create independent monitoring
**Severity: MEDIUM — operational assurance gap**  
**Status: Configuration-dependent; documented in the existing second-pass audit.**

Outbound gossip depends on configured peers and a nonzero interval. A locally consistent checkpoint history is not an independent high-water mark. With no independently operated peers/witnesses, rollback or equivocation detection is materially weaker.

**Action:** define a minimum witness/monitor topology for any deployment claiming externally witnessed transparency. Alert on missing peer exchanges, stale checkpoints, peer disagreement and witness quorum loss. Test monitor independence and recovery rather than treating self-gossip or a single operator-controlled peer as independent evidence.

### BT-10 — CI hardening is useful but does not prove release readiness
**Severity: MEDIUM — release-process gap**  
**Status: Mixed: controls confirmed in workflow; governance must be checked separately.**

The workflow has narrow permissions, pinned action SHAs, dependency checks and workspace/conformance/browser jobs. However, workflow success is not evidence that a human-reviewed release gate, protected branch policy, independent security approval, or production configuration review is in force. The repository branch listing showed the observed branches as unprotected at review time; verify current repository rules before relying on required CI.

**Action:** configure branch protection/rulesets for the release branch; require reviewed changes, required CI and no force-pushes; separate release approval from implementation; retain signed build provenance and release artifacts; require the high-severity findings above to be closed or explicitly accepted by the accountable owner.

## 4. Positive controls to preserve

- Signed requests use a domain-separated message binding method, target, audience, timestamp, nonce and body digest.
- Replay protection is recorded only after signature verification and persists nonce expiry.
- Authentication uses a dummy Ed25519 verification path for unknown keys to reduce key-enumeration timing differences.
- SQLite enables foreign keys, `trusted_schema=OFF`, secure deletion and integrity-oriented settings.
- HTTP code has request/header/time bounds, strict JSON parsing and bounded response pages.
- Import verification runs in workers with timeout/abort cleanup and strict archive parsing.
- Webhook transport has HTTPS-only target policy, public-address checks, DNS validation/pinning and no redirects.
- CI pins actions to full SHAs, disables persisted checkout credentials, uses read-only permissions and includes dependency/lockfile checks.

These are source-level observations, not proof that every path or deployment preserves the controls.

## 5. Prioritized remediation plan

1. **Stop-ship:** port and test BT-01.
2. **Stop-ship:** correct verifier status semantics for missing board evidence and missing manifest trust anchors (BT-02/BT-03).
3. **Assurance:** close verifier capability gaps and cross-check results (BT-04).
4. **Deployment baseline:** isolate key custody, disable open registration unless explicitly approved, and harden proxy trust (BT-05/BT-06/BT-07).
5. **Operational readiness:** establish independent witnesses/monitors and make vulnerability disclosure actionable (BT-08/BT-09).
6. **Release governance:** verify branch rules, CI requirements, provenance and human security sign-off (BT-10).

## 6. Verification required before changing status

- Run the full test suite on the exact release candidate, not a sibling branch.
- Run the S1-02 regression test and restart/import/replay variants.
- Run verifier tests for absent board evidence and absent manifest pin.
- Run TypeScript/Python cross-verifier vectors and mutation tests.
- Exercise backup restore with a separately held KEK; test key rotation and disaster recovery.
- Verify production registration, TLS termination, proxy header stripping, CORS, logging, storage permissions and monitoring.
- Confirm branch protection/rulesets and required CI on the actual release branch.
- Obtain independent cryptographic/protocol and application-security reviews.

**Final disposition:** QuietVote has useful defensive engineering controls, but the current integration branch is not suitable for real ballots. High-severity election-integrity and verifier-assurance issues remain, and operational security prerequisites are incomplete.
