# QuietVote — Second-Pass Security Audit

**Date:** 2026-11-15  
**Audited ref:** `integration/quietvote-completion`  
**Observed integration head:** `35a450045861c860f3d592ff414cc46c56f438d0` (from branch comparison)  
**Comparison branch:** `chatgpt/quietvote-s1-02-reverse-spoil-guard-20261114`  
**Scope:** Additional source review, cross-branch comparison, existing audit-note reconciliation, verifier semantics, server controls, trustee/client notes, CI and release posture.

> **Status: unaudited prototype; not for real elections.** This is an AI-assisted source review, not an independent professional audit or completed penetration test. No repository tests, builds, fuzzers, live deployment tests, or PoCs were executed in this pass. Findings are labelled by evidence and confidence. Historical PoCs are not represented as newly executed tests.

## Executive summary

This pass identified one new high-severity ballot-protocol defect in the audited integration branch, confirmed several earlier assurance blockers, and found important gaps in operational key custody and evidence handling.

### Highest-priority issues

1. **S1-02 — reverse-order spoil/cast ciphertext reuse:** the integration branch can admit a cast ballot whose ciphertexts were already publicly opened by an earlier spoil. The opposite order is checked. A separate divergent branch contains the proposed guard and regression test; neither is present on the audited integration ref.
2. **Verifier completeness — overall PASS with V4 not_run:** the TypeScript verifier can return the protocol verifier's PASS even when no board export is supplied and the bulletin-board checks remain not_run.
3. **Manifest authenticity — caller pin optional:** absent an out-of-band manifest hash, a verifier checks consistency against the bundle's own hash and emits a caveat, but may still return PASS.
4. **Rollback/equivocation:** database-local checkpoint history is not an independent high-water mark. Gossip can detect a peer-ahead view, but outbound gossip is disabled by default unless configured.
5. **Cross-verifier gap:** the Python verifier remains a partial independent implementation and does not provide the TypeScript verifier's board/log layer. Protocol disagreements and strict report parity remain open.
6. **Key custody and backups:** the instance KEK is stored alongside the databases; a copied data directory can contain both ciphertext and the key needed to decrypt it. Backup isolation and retention are not complete.
7. **Operational gaps:** open registration is the default; there is no packaged server start command in the server workspace; TLS is expected from an external reverse proxy; the registration wire contract and real browser/server journey remain blocked.

The repository has meaningful controls: strict request signing, replay protection, bounded request bodies, an SSRF-aware webhook transport with DNS validation and address pinning, strict import archive parsing, and worker-thread verification of import bundles. These should be preserved.

---

## Findings

### QV2P-01 — Reverse-order spoil/cast ciphertext reuse

**Severity:** HIGH  
**Status:** Present on audited integration branch; proposed repair exists on a divergent branch.  
**Evidence type:** Direct source comparison plus a regression-test/PoC artifact on the separate branch. Not executed in this pass.

**Affected files**
- `packages/server/src/election.ts`
- `packages/protocol/src/ballot.ts`
- `packages/server/test/s1-spoil-then-cast-rewrap.test.ts` (exists on the separate S1-02 branch, absent on audited integration)
- `docs/audit/2026-11-11/poc/s1-spoil-then-cast-rewrap.repro.ts` (historical related evidence)

**Observed defect**

The integration branch tracks cast ciphertext components in `castAlphas`. When admitting a spoil, it rejects ciphertext overlap with a previously admitted cast. When admitting a cast, however, it checks prior cast ciphertexts but does not check ciphertexts from earlier spoils.

The spoil path also tracks ballot codes. A modified `supersedes` value changes the ballot code without changing the ciphertexts. Consequently, checking only the spoiled code does not prevent a later cast from reusing the opened ciphertexts under a different code.

The separate branch adds a `spoilAlphas` set, rebuilds it during replay, and rejects a cast whose ciphertext components overlap an admitted spoil. Its regression test constructs the reverse order and expects the cast to be rejected with 422.

**Impact**

- A ballot marked as spoiled and publicly revealed can subsequently be admitted as a counted cast under a different ballot code.
- The public reveal can therefore open ciphertexts belonging to a counted ballot.
- The election-wide Benaloh check can report an alarm because a spoiled ciphertext is also counted.
- The intended cast-or-audit separation is not enforced symmetrically at admission.

This does not establish that an attacker can reveal another voter's plaintext: the demonstrated construction uses the attacker's own voter key. It does establish that the server can count a ballot whose ciphertexts have already been opened, violating the intended protocol invariant and potentially undermining ballot secrecy against coercion or vote-proof demands.

**Required fix**

- Port the minimal `spoilAlphas` tracking and cast-side overlap rejection into the current integration branch after reviewing the full divergent diff.
- Rebuild the set from persisted records during replay and import/recovery paths.
- Add symmetric tests: cast-then-spoil and spoil-then-cast.
- Test modified `supersedes`, changed ballot codes, multiple contests, reload/restart, imported bundles and tally construction.
- Ensure the independent TypeScript and Python verifiers agree on the expected finding and status.
- Do not merge the whole S1-02 branch blindly: the branch comparison reports divergence (22 commits ahead and 11 behind).

**Disposition:** Release blocker until the repair and regression test are on the target branch and pass CI.

### QV2P-02 — Overall verifier PASS can coexist with missing bulletin-board evidence

**Severity:** HIGH  
**Status:** Confirmed in current source logic; test execution not performed.

**Affected files**
- `packages/verifier/src/verify.ts`
- `packages/verifier/NOTES.md`
- `packages/web/NOTES.md`
- `docs/35-second-verifier.md`

**Evidence**

When a bundle has no board export, the verifier leaves the board append-only and witness checks as `not_run`, and adds a V4 caveat. However, the final verdict is computed as:

`FAIL` if the protocol verifier fails or the board layer has a failure; otherwise it inherits `pr.verdict`.

A missing board export is not itself a board failure. A protocol-valid bundle with a tally can therefore retain overall `PASS` while V4 is `not_run`.

**Impact**

A consumer that reads only the overall verdict or exit code can mistake protocol-bundle consistency for verification of the actual append-only election history. Missing board evidence means omission, ordering, checkpoint, witness and receipt claims may not have been established.

**Required fix**

- Introduce a distinct overall status such as `PASS_WITH_UNVERIFIED_LOG`, or require board evidence for full `PASS`.
- Keep protocol-only verification available, but label it clearly as protocol-only.
- Ensure CLI, offline HTML, browser UI, JSON report and exit codes use identical semantics.
- Add a regression bundle with a valid tally and no board export; assert that it cannot receive the full-election PASS status.
- Add a second case where the board export is present but malformed or untrusted.

### QV2P-03 — Out-of-band manifest trust anchor remains optional

**Severity:** HIGH  
**Status:** Confirmed design limitation, disclosed by the verifier.

**Affected file:** `packages/verifier/src/verify.ts`

The verifier accepts `pinnedManifestHash` as optional. When absent, it uses the bundle's own manifest hash, records `manifestHashSource = bundle`, and adds a caveat that the hash was not supplied out of band. The final verdict can still be PASS.

**Impact**

The verifier can establish internal consistency of a self-contained bundle without establishing that it is the particular election the user intended to verify. A replacement bundle with internally consistent manifest, keys, signatures and tally can be self-consistent while representing a different election.

**Required fix**

- Require an independently obtained manifest hash or an equivalent trusted election-identity anchor for a result described as fully authenticated.
- Keep unanchored verification available under an explicit status such as `PASS_UNANCHORED`.
- Show the anchor source prominently in every output format.
- Add a negative test replacing the entire bundle with a separately self-consistent election.

### QV2P-04 — TypeScript/Python verifier capability and semantics remain unequal

**Severity:** HIGH  
**Status:** Known unresolved assurance gap.

**Affected files**
- `verifier-py/NOTES.md`
- `packages/verifier/NOTES.md`
- `packages/protocol/NOTES.md`
- `docs/34-test-vectors-conformance.md`

The Python verifier is intentionally independent, which is valuable, but its notes identify incomplete log/board verification and remaining schema/numeric/witness reconciliation. It cannot currently provide equivalent verification of board append-only history, witness evidence and receipt inclusion.

The TypeScript and Python implementations also have documented historical semantic disagreements. The CI comparator is explicitly scoped to shared capabilities and can fail on strict complete-report comparison.

**Impact**

A user may receive different assurances depending on which verifier is used. The independent implementation is not yet an equivalent second verifier for the complete election evidence bundle.

**Required fix**

- Define a machine-readable capability matrix and include it in every verifier report.
- Mark unsupported checks as `not_run`, never as passed.
- Complete Python board/log, checkpoint, witness, rollback and receipt verification.
- Resolve every normative disagreement before changing expected reports.
- Run both verifiers over identical complete positive and negative bundles and require exact agreement within the declared shared capability set.

### QV2P-05 — V13 operator/steward control verification is not implemented

**Severity:** MEDIUM  
**Status:** Confirmed incomplete check.

**Affected file:** `packages/verifier/src/verify.ts`

V13 is explicitly hard-coded to `not_run` because no verifier step exists for steward/operator control entries. It does not appear to force the overall verdict away from PASS.

**Impact**

The verifier does not independently establish the correctness and authorization of all control/governance records covered by the specification. Users must not infer that a PASS includes these checks.

**Required fix**

Implement V13 according to the approved protocol decision, or explicitly state that full election verification is unavailable while V13 is not_run. Add control-record mutation and replay vectors.

### QV2P-06 — Database rollback protection still depends on external observation

**Severity:** CRITICAL  
**Status:** Previously PoC-confirmed in historical audit; residual design gap remains.

**Affected files**
- `packages/server/src/gossip.ts`
- `packages/server/src/election.ts`
- `packages/server/src/electiondb.ts`
- `packages/server/src/config.ts`
- `docs/audit/consolidation-2026-10-30.md`

The server can quarantine a live election when gossip demonstrates that a peer holds a newer signed checkpoint or a conflicting history. This is useful mitigation. However, outbound gossip is disabled by default (`gossipIntervalMs = 0`) and the local database stores the checkpoint history that can itself be rolled back.

If an operator restores an older internally consistent database and there is no independent peer, witness or external checkpoint monitor holding the newer head, the server has no durable external high-water mark from which to detect that rollback.

**Required fix**

- Persist the latest accepted checkpoint in a separately protected trust domain (for example, an external witness/monitor or hardware-backed monotonic state).
- Require an independent checkpoint source for production operation.
- Treat rollback as quarantine, not an automatic continuation.
- Test restore of an older database while an external monitor retains a later signed checkpoint.
- Document the exact recovery and election invalidation procedure.

### QV2P-07 — KEK and encrypted election data are co-located

**Severity:** MEDIUM  
**Status:** Confirmed operational key-custody weakness.

**Affected files**
- `packages/server/src/kek.ts`
- `packages/server/NOTES.md`
- `docs/28-data-model-storage.md`

The instance KEK is stored at `<dataDir>/kek/kek.bin`, while databases and wrapped DEKs are in the same data directory. File modes are restrictive, and AES-256-GCM uses per-record associated data. Those are positive controls.

However, a plain copy of the complete data directory can include both the encrypted records and the KEK needed to unwrap them. Encryption therefore does not protect a backup that contains both components.

**Required fix**

- Move the KEK to a separate secret manager/HSM or separately controlled backup domain.
- Encrypt backups independently with a key not included in the backup.
- Define KEK rotation, recovery, access logging and destruction procedures.
- Test restore using a separately provisioned KEK.
- State clearly what data-at-rest threat the current design does and does not mitigate.

### QV2P-08 — SSE event outbox has no per-election size cap

**Severity:** MEDIUM  
**Status:** Documented implementation gap.

**Affected files**
- `packages/server/src/sse.ts`
- `packages/server/src/electiondb.ts`
- `packages/server/NOTES.md`

The SSE design bounds per-client buffers and active streams. The event outbox is pruned 30 days after ARCHIVED, but the server notes state it is not otherwise size-capped. Entry/checkpoint events are written to the outbox, with additional phase/witness/alert events.

**Impact**

A long-running or high-volume election can accumulate substantial event rows and indexes. The log-size limit does not automatically provide a strict bound on the event table's total storage overhead.

**Required fix**

- Add per-election and global event-row/byte limits.
- Define safe pruning and resynchronization behavior.
- Ensure a connected client receives an explicit resync/410 response if its cursor falls outside retention.
- Add disk-growth tests using maximum permitted entry volume.

### QV2P-09 — Free-text control reasons are copied into the public election log

**Severity:** MEDIUM  
**Status:** Known owner decision pending.

**Affected files**
- `packages/server/src/records.ts`
- `packages/server/src/election.ts`
- `packages/server/NOTES.md`
- `docs/07-threat-model-security.md`

The server notes identify a control-record `reason` field with bounded free text that is copied into the public log. The specification describes reason codes and an OTHER case, but the wire layout is unresolved.

**Impact**

An organizer or administrator can accidentally publish personal information, contact details, incident narratives or other sensitive material in a permanent public election record.

**Required fix**

- Prefer a closed reason-code enum.
- Permit free text only for an explicit OTHER reason, with a short strict bound and a warning that it becomes public.
- Define escaping, bidi-control and PII guidance.
- Add tests that prove private metadata is not copied into public control entries.

### QV2P-10 — Trustee vault file permissions are weaker on Windows

**Severity:** MEDIUM  
**Status:** Documented platform gap.

**Affected file:** `packages/trustee/NOTES.md`

The trustee package skips POSIX mode-bit checks on Windows. In that environment, a bundle is protected by its passphrase encryption but not by a verified restrictive NTFS ACL.

**Impact**

Other local users or processes may be able to copy the encrypted trustee bundle and attempt offline passphrase attacks.

**Required fix**

- Implement Windows ACL inspection and restrictive ACL creation.
- Refuse unsafe locations or require an explicit override with a warning.
- Test inherited ACLs, shared directories, network drives and copied bundles.
- Preserve the high-entropy generated-passphrase default.

### QV2P-11 — Open registration is the server default

**Severity:** MEDIUM  
**Status:** Confirmed configuration default; operator mitigation exists.

**Affected file:** `packages/server/src/config.ts`

`registrationMode` defaults to `open`. The server has per-network rate limits and per-organization election quotas, but the reviewed configuration does not define a global organization-count or aggregate storage quota.

**Impact**

A deployment started without explicit registration configuration can accept organization creation by default. Distributed clients can create many organizations and consume control-database rows and storage over time.

**Required fix**

- Default production registration to `closed` or `token`.
- Require explicit acknowledgement for open registration.
- Add global organization, database-count and storage quotas.
- Document a deployment preflight that refuses insecure production settings.

### QV2P-12 — Registration protocol remains incompatible across client and server

**Severity:** HIGH  
**Status:** Known integration blocker.

**Affected files**
- `packages/web/src/api/client.ts`
- `packages/server/src/app.ts`
- `packages/web/NOTES.md`
- `docs/reports/registration-decision-20261109.md`

The client and server still disagree on invitation-token transmission and proof-of-possession framing. The web notes explicitly retain registration as blocked pending protocol-owner review.

**Impact**

The real browser-to-server registration path is not qualified. A hurried fix that weakens proof-of-possession or token handling could introduce account takeover or invitation replay.

**Required fix**

Approve one byte-exact contract for token hashing, PoP message, expiry, single-use semantics and retries. Implement it on both sides and test against the actual server, not only the fake board.

### QV2P-13 — Client worker and lazy-loaded chunks lack equivalent SRI

**Severity:** HIGH  
**Status:** Documented supply-chain gap.

**Affected file:** `packages/web/NOTES.md`

Static app imports use integrity modulepreloads, but lazy locale/chart chunks and the module worker are documented as lacking equivalent SRI protection.

**Impact**

The browser client is part of the trusted ballot-sealing path. A substituted worker or lazy-loaded module could undermine the user's confidence that the reviewed client code is the code actually executed.

**Required fix**

- Cover worker and lazy-loaded chunks with a verified integrity mechanism.
- Bind all assets to a signed release manifest.
- Provide independent client build verification and a separately hosted client option.
- Test targeted substitution of worker and lazy chunk assets in production builds.

### QV2P-14 — Key-file KDF parameters permit expensive local verification

**Severity:** MEDIUM  
**Status:** Bounded resource-exhaustion risk; not demonstrated as remotely exploitable.

**Affected file:** `packages/web/src/key/keystore.ts`

The key container accepts KDF settings up to 256 MiB, time cost 10 and parallelism 4. This is bounded and protects against unbounded parameters, but a user opening a hostile or deliberately expensive key file can still trigger significant browser resource use.

**Required fix**

- Measure worst-case browser memory/time on supported devices.
- Consider a lower import ceiling or explicit pre-KDF cost confirmation for untrusted key files.
- Keep the current strict floor and ceiling checks.
- Ensure cancellation and UI responsiveness during expensive KDF work.

### QV2P-15 — Backup/recovery and personal-data retention are incomplete

**Severity:** MEDIUM  
**Status:** Documented operational gap.

**Affected files**
- `packages/server/NOTES.md`
- `packages/web/NOTES.md`
- `packages/server/src/retention.ts`

Invite labels and contacts are purged from active election databases after the configured retention period. The notes state that backups made before purge can retain the data until the backup policy removes them, and the 12-month backup policy is not implemented. The browser notes also state that mandatory backup restore-check/enrolment gating is absent.

**Impact**

Active database deletion does not guarantee deletion from backups. A user may also believe a recovery path is usable without a mandatory restore check.

**Required fix**

- Define backup encryption, retention, expiry and deletion verification.
- Ensure backup keys are not co-located with backup data.
- Add tested restore drills and restore-check gating for voter key backups.
- Document residual copies and deletion timelines.

### QV2P-16 — Public tar reader is less strict than import tar reader

**Severity:** LOW  
**Status:** Hardening/contract review.

**Affected file:** `packages/server/src/tar.ts`

The server has a strict `readTarStrict` path for imports, which validates regular-file type, checksums, names, duplicates and end-of-archive framing. The separately exported `readTar` helper is less strict and does not enforce the full strict-uSTAR contract.

**Impact**

Consumers that use the exported convenience reader directly on untrusted `.qvb` files may accept malformed or non-canonical archive structures that the server import path rejects.

**Required fix**

- Mark `readTar` as trusted-input-only or deprecate it for untrusted bundles.
- Export/use the strict reader for all untrusted archive inputs.
- Add tests ensuring callers cannot accidentally choose the permissive path.

### QV2P-17 — Security disclosure policy is not operational

**Severity:** MEDIUM  
**Status:** Confirmed documentation gap on audited ref.

**Affected file:** `SECURITY.md`

The file still contains placeholder reporting details: example-domain email, PGP fingerprint/key, age recipient, security.txt and staging URL. GitHub Private Vulnerability Reporting is marked for confirmation. Its opening description also calls the project a pre-implementation specification project, which is stale relative to the current prototype.

**Required fix**

- Establish a real monitored security contact.
- Configure and verify GitHub private vulnerability reporting.
- Publish real cryptographic reporting keys and security.txt.
- Replace stale project-state wording.
- Confirm safe-harbor scope and response ownership before inviting external testing.

### QV2P-18 — Dependency signature and dependency allowlist policy incomplete

**Severity:** LOW/MEDIUM  
**Status:** Documented CI policy gap.

**Affected files**
- `.github/workflows/ci.yml`
- `docs/audit/dependencies-ci.md`
- `docs/19-client-supply-chain.md`

CI does pin GitHub Actions by full commit SHA, lint lockfile sources/integrity, and runs `npm audit --audit-level=high`. The dependency audit notes that `npm audit signatures` is not enabled and that no exact dependency allowlist/exact-pin policy is enforced.

**Required fix**

Decide and implement the registry signature policy and dependency allowlist strategy. Keep lockfile source/integrity checks and high/critical advisory blocking.

---

## Existing findings rechecked and corrected

### Confirmed remaining

- **B2-07 rollback:** still an integrity blocker unless independently retained checkpoints are available.
- **B2-05 control-record replay:** remains an unresolved protocol/authorization issue requiring sequence/state-bound authorization.
- **B1-07 verifier disagreement:** remains unresolved.
- **B3-01 registration contract:** remains blocked.
- **V13 operator-control verification:** remains not implemented.
- **Python board/log verifier:** remains incomplete.
- **Client SRI gaps:** remain documented.
- **SECURITY.md placeholders:** remain on the audited integration ref.

### Positive controls verified by source inspection

- Request authentication uses Ed25519 signatures over method, raw target, audience, timestamp, nonce and body hash.
- Replay nonces are persisted in the control database after signature verification.
- Request sizes, headers, timeouts and connection counts have explicit bounds.
- The webhook SSRF policy is comparatively strong: HTTPS-only, restricted ports, local/special IP rejection, all-address DNS checks, per-attempt revalidation, pinned destination address and no redirects.
- Import bundles use strict tar parsing, checksum validation and worker-thread protocol/log verification with timeouts and termination handling.
- The rate limiter has a 100,000-entry cap, and the failure counter also has a 100,000-key cap. The second-pass inspection did **not** classify these maps as unbounded.
- Webhook delivery retries are persisted and use stable delivery IDs for receiver-side deduplication.
- The SSE implementation has per-client buffer, slow-client, idle and stream-count limits.

### Corrections to the previous audit summary

1. The import path does have worker-thread verification for protocol and board/log checks. The remaining concern is that some upload parsing, archive/checksum processing, staging and replay work still occurs in the main process; it is inaccurate to describe all import proof verification as main-thread-only.
2. The server package exposes a `buildServer()` service assembly with `start()` and `stop()`. The package still lacks a standalone production launcher/start script and TLS termination, but the server service itself is not wholly absent.
3. The separate S1-02 branch is not integrated. The audited integration branch still lacks the reverse-order ciphertext guard and its regression test.

---

## Branch disposition: S1-02

The branch `chatgpt/quietvote-s1-02-reverse-spoil-guard-20261114` contains:
- A regression test for spoil-then-cast ciphertext reuse.
- A `spoilAlphas` state set.
- Replay reconstruction of spoiled ciphertext components.
- A cast-side rejection when a cast reuses a prior spoil's ciphertexts.

The branch comparison reports **22 commits ahead and 11 behind** the integration branch. It is therefore divergent, not a clean fast-forward candidate. Review the complete diff and port the minimal security fix/test rather than merging the entire branch without reconciliation.

---

## Prioritized remediation order

1. **P0:** Port and test QV2P-01 reverse-order spoil/cast guard.
2. **P0:** Fix full-election PASS semantics when board evidence or trusted manifest anchoring is missing.
3. **P0:** Implement independently protected rollback high-water checkpointing and recovery.
4. **P1:** Complete Python board/log verification and TypeScript/Python semantic parity.
5. **P1:** Implement V13 control-entry verification.
6. **P1:** Resolve registration contract and run the real browser/server registration journey.
7. **P1:** Complete client worker/lazy-chunk integrity and signed release evidence.
8. **P1:** Separate KEK custody from backups; implement backup retention and restore drills.
9. **P2:** Bound SSE outbox storage and formalize public control-reason fields.
10. **P2:** Close Windows trustee ACL, open-registration default, KDF import cost and security disclosure gaps.
11. **P2:** Decide dependency signatures/allowlist and strict archive-reader API policy.

## Verification status

| Activity | Status |
|---|---|
| Integration branch source inspection | Completed for the listed areas |
| Historical audit-note reconciliation | Completed |
| S1-02 branch comparison | Completed |
| New reverse-order defect identified | Source-level confirmed; PoC not executed |
| Verifier PASS/V4 behavior | Confirmed from source logic; no runtime test |
| Server SSRF/auth/limits review | Source inspection |
| CI workflow review | Source inspection |
| Unit/integration tests | Not run |
| Build/typecheck | Not run |
| Fuzzing/penetration test | Not run |
| Independent cryptographic review | Not performed |
| Code changes | None; documentation only |

**Final conclusion:** QuietVote remains an experimental prototype and must not be used for real elections. The newly identified S1-02 defect, verifier PASS semantics, missing external trust anchors and rollback exposure are release blockers. This report is evidence for remediation planning, not a security certification.


### QV2P-19 — Replay of previously authorized control records

**Severity:** HIGH  
**Status:** Previously PoC-confirmed; remains an unresolved protocol decision in the consolidation record.

**Affected file:** `packages/server/src/election.ts`

The historical B2-05 finding concerns pause/resume control records whose signature authenticates the original authorization but does not sufficiently bind it to a unique election state transition and monotonic control sequence. A previously valid multi-signature control record can be replayed under a new board-entry header if the record-level authorization is not made fresh.

**Impact**

A stale authorization may be reused to pause or resume an election at a later point than the signers intended, undermining the intended multi-party control policy and creating an election-availability attack.

**Required fix**

- Bind the authorization to the election ID, current state, expected prior control sequence and exact action.
- Require monotonic control sequence numbers and unique nonces.
- Reject duplicate or stale control records during both admission and independent verification.
- Add replay tests across state transitions, restart, import and alternate log headers.
- Preserve the historical PoC as a regression test and obtain protocol-owner approval for the record format.

Do not treat a new board-entry header as proof that the underlying control authorization is fresh.
