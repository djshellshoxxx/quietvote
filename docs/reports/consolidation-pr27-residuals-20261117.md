# QuietVote PR #27 residual integration review — 2026-11-17

> Follow-up: the /56 and keyless receipt slices were integrated as `fffa143` and `4b93752`; combined typecheck and 26 focused tests passed. Remaining schema, rollback, export and control compatibility findings below are unchanged.

Read-only source audit against current consolidation candidate `25d26aa3dc35127015100ace20419c57509ed338`, with the original `66dcfafa885bdbd82cae808c33cebe0d7f8a21ab` checked for provenance. The reviewed paths have the same relevant behavior at both commits. The separately prepared IPv6 repair is `d6c3be005b09c4299cbd7a906dc9d81a6276ccc9`; the keyless-receipt repair is being handled independently and is not assessed as completed here.

Sources: PR #27 head `2aaf0a01816afb256a804c23dd45de86eca2a993`, especially `13b86c2` and `07fd61c`; current source, tests, migration arrays, QV-ADR-027 and the accepted decision register. This report is static review, not a new test-execution receipt or external security qualification.

## Disposition at a glance

| Slice | Current implementation | Residual status | Smallest next integration |
|---|---|---|---|
| Default invitation expiry / B2-10 | New invites default to 14 days; explicit deadline retained; current enrollment enforces expiry and uniform unknown/used/revoked refusal | **Already implemented through other history** | No PR #27 runtime port; retain current modern/legacy enrollment and tests |
| Invitation PII retention / B2-11 | Purge after register/revoke/expiry/open plus configured grace; scheduled and lazy sweeps; expiry SQL repaired for Node 22 | **Already implemented** | No historical retention replacement |
| IPv6 /56 / N-32(a) | Selective recovery prepared as `d6c3be0` | **Ready for integration** | Integrate that reviewed commit; do not merge the rest of `07fd61c` with it |
| Recorded public export and deletion acknowledgement / N-32(b) | Ad hoc QVB/JSON downloads exist; no persistent export record or acknowledgement; deletion checks lifecycle state only | **Absent** | Add election migration **10**, recorded export lifecycle, acknowledgement/grace gate in current deletion paths, and crash/retry tests |
| Runtime rollback anchor / B2-07 | Offline restore has public-history and private-security floors; gossip can detect evidence after opening; no independent runtime high-water floor | **Partially covered by different mechanisms; runtime anchor absent** | Add control migration **8**, monotonic local floor, startup/receipt gating and current recovery integration; then bounded witness/peer acquisition |
| Request log privacy / B2-16 A | Minute rounding, allowlist, duration bucket, field drops and tests already exist | **Already implemented** | Preserve current logger behavior |
| Public control reason enum / B2-16 C-lite | Server, CLI packet schema and both verifiers accept bounded free text | **Absent** | First implement catalog-only admission and packet generation with explicit legacy read compatibility; complete cross-verifier policy separately without rewriting existing corpus semantics |

**Authorization:** QV-ADR-027 accepts the recommended defaults across categories A–D. The earlier blanket owner holds in old handoffs are superseded. Remaining work below is implementation, migration, compatibility and verification work; it does not need another request to approve the same defaults. Independent protocol/security review remains a release qualification requirement.

## 1. Default invitation expiry and retention are already recovered

Current `packages/server/src/app.ts`, POST `/api/v1/elections/:id/invites`, initializes `expires_at` to `nowMs() + 14 * 86_400_000` and replaces it only when an explicit date is supplied. The default arrived through `62d8292` (`feat: complete hashed voter enrollment across server web and CLI`), not the divergent #27 commit. `registration.test.ts` and `registration-review.test.ts` assert the 14-day deadline, exact expiry boundary, stored-verifier protection, restart behavior and modern enrollment.

Current registration deliberately retains the recorded legacy contract. `registration-review.test.ts` includes `schema8 null-expiry legacy invitations retain their original redemption contract`. A consolidation must not retroactively assign expiries or change registration schemes on those old rows while trying to recover a feature that already exists.

`ElectionDb.purgeInviteData` already removes label/contact data after the earliest applicable closure, expiry or opening time plus grace. Election migration 5 already added `closed_at`. The current SQL binds three positional cutoffs to support Node 22, repaired at `66dcfaf`. `consumeInvite` removes contact data immediately and does not persist an invite-to-voter link. `RetentionSweeper` supplies scheduled purging, and invite access supplies lazy purging. `b2-fixes.test.ts` covers not-before-grace, register/revoke/expiry, lazy purge and bounded configuration; `retention-health.test.ts` covers failure visibility and retries.

**Action:** mark default expiry and retention as covered. Do not import old `app.ts` or `electiondb.ts` for these purposes. This corrects the initial topology report's overly broad listing of default expiry as a residual.

## 2. Recorded public exports and acknowledgement are genuinely missing

### What exists

- `app.ts` has GET `export.qvb` and `export.json`, with current access checks, bounded cache and export evidence behavior.
- `export.ts` builds current board/election bundles.
- `pool.ts::remove` checks both registry state and authoritative replayed log state, records a resumable tombstone/DEK removal, then closes/unlinks files. `ext-routes.ts` provides the admin deletion job path.
- No current `export_record`, `addExport`, `acknowledgeExport`, `publicExportsOf` or recorded-export POST/GET routes exist. Neither organizer nor admin deletion enforces export acknowledgement.

### Why `07fd61c` cannot be merged wholesale

Its election migration **6** creates `export_record`; current election migrations 6–9 instead implement webhook bridge floor, append-event completion, management receipts and registration scheme. Existing migration hashes are part of database validation. Renumbering or replacing applied migrations would damage supported upgrades. The next additive election migration is **10**, not control migration 8.

The historical export job uses the older idempotency/job API shape and predates durable management-operation receipts and resumable deletion. Its deletion change would also lose the newer authoritative-log-state check if copied at file level. Its byte reconstruction depends on a pinned creation time but can fail when current checkpoint cosignatures change; this behavior must remain explicit and tested. It sets `acknowledged_at` before a download response completes. Treating mere request admission as completed delivery needs a clear acknowledgment contract and aborted-transfer tests. Generation and download both use rate class X in the old code, a recorded usability/lockout concern.

### Minimal safe next slice

1. Add election migration 10 and a bounded record model keyed to an exact public-export snapshot: tree size/root, bundle digest, creation/expiry and acknowledgement. Preserve all current migrations.
2. Port only the recorded public-export lifecycle and pinned snapshot generation, using the current durable job/idempotency reservation and response-journaling patterns. A retry or crash must not create ambiguous duplicate exports or forget the completed operation.
3. Define acknowledgment explicitly. If download delivery is used, incomplete/aborted downloads must not accidentally satisfy the destructive-operation gate; an explicit organizer acknowledgment can be a separate documented operation. Retain the accepted 30-day grace alternative.
4. Apply the archived-export condition in the authoritative `pool.remove` path before tombstoning/DEK destruction and in organizer/admin preflight. Keep the newer replayed-state check and resumable cleanup intact. Current accepted N-32(b) focuses on ARCHIVED; the wider CANCELLED/ABORTED/IMPORTED wording in QV-28 §11.2 must be recorded as a separate contract reconciliation, not silently claimed complete.
5. Test schema9→10 upgrade, legacy opening, wrong/stale tree and hash, failed/aborted download, first acknowledgement preservation, exact grace boundary, both delete routes, direct pool use, crash/restart and retry behavior.

## 3. Private restore floors overlap rollback safety but do not replace B2-07

### Existing protection

`offline-backup.ts::restoreBackup` requires a separately supplied minimum backup and verifies both snapshots. It checks instance identity, election origin/log key, minimum tree size, the root at the minimum prefix, missing elections and deletion tombstones. `backup-security-floor.ts` additionally prevents rollback of changes invisible to the Merkle tree: revoked account keys, suspended/deleted organizations, disabled/deleted webhooks, unexpired replay nonces and idempotency state, forwarding cursors, operation receipts, registration schemes, consumed/revoked invitations and erased contact markers.

These checks execute on the explicit offline restore path. They depend on the operator supplying an appropriate independently retained floor. They do not record the last externally released signed head continuously, and cannot detect replacing the live election DB with a coherent older snapshot before ordinary startup unless newer evidence remains elsewhere. Current `BoardLog` has no external floor input; current `ControlDb` has no anchor columns. Current gossip can quarantine newer/conflicting evidence, but its periodic sweep is not a mandatory gate before the first new signature after startup.

### Why `13b86c2` is not sufficient as-is

- Its control migration **5** conflicts with current gossip-health migration 5, deletion migration 6 and webhook cursor migration 7. The next additive control version is **8**.
- It predates append completion intents, the webhook bridge, management journals, current startup recovery and private restore floors. Anchor persistence must fit their transaction/exposure ordering rather than overwrite it.
- Its boot polling covers public gossip peers, not a separately implemented configured-witness read path; link elections are excluded. That implements only part of accepted option B.
- The historical `bootGossipPending` check lives inside `processLocked`, while `append` first calls `precheck` and returns a duplicate result immediately. That precheck can call `outcomeFor` and sign a duplicate receipt before the boot check. Its claim that polling happens before any signing therefore needs correction and a dedicated regression.
- The old raise API returns `conflict` for the same size/different root; each integration caller must treat this outcome explicitly as a refusal/quarantine rather than assume a successful write.

### Minimal safe next slice

1. Add control migration 8 with a monotonic authenticated `(size, root)` floor; test real schema7→8 upgrades and preserve migration hashes. Exclude imported/keyless mirrors from own-key anchor claims.
2. Validate the floor before allowing a reopened runtime to issue any new signature, including duplicate promise receipts. Quarantine rollback and same-size forks; preserve readable evidence and require newer valid data to clear the floor mismatch.
3. Persist the local floor before externally exposing the corresponding receipt/checkpoint/events. Integrate the failure path with current poison/reload, append intents and durable event forwarding. Exercise crashes on each side of both database commits and repeated recovery.
4. Reuse the offline restore floor checks and extend them to preserve the new runtime anchor. A coherent whole-disk rollback can still defeat a co-located local floor; implement bounded authenticated startup witness/peer evidence acquisition as the distinct option-B increment, with explicit unavailable-peer semantics and privacy-preserving treatment of link elections.
5. Test ordinary startup after a single election DB rollback, same-size fork, whole-disk stale snapshot with newer independent head, all duplicate/signing paths, anchor persistence failure, unavailable peers, import/mirror behavior and repeated crashes.

## 4. Control-reason enum remains a compatibility-aware protocol slice

B2-16's request-log part is already present: `logger.ts` rounds timestamps to the minute, emits `dur_bucket`, applies `LOG_ALLOWLIST`, drops request IDs/election IDs/byte counts and tracks dropped fields. Existing `b2-fixes.test.ts` covers the allowlist and canaries. Preserve that code.

The enum part is absent. `server/src/records.ts::controlSchema` permits `reason: str(256)`. `cli/src/cmd-packet.ts` duplicates that bounded-text schema. `protocol/src/logcheck.ts::CONTROL_RECORD` and Python `qv_verifier/logcheck.py::_control_action` deliberately accept the legacy bounded text contract; current shared corpus records include `reason: "outage"` and `reason: "tie-break"`. The current Python path explicitly labels this legacy N-12 compatibility.

Historical `13b86c2` restricts only server admission to 14 QV-07 catalog codes. It does not update both independent verifiers or the newer CLI packet builder. Importing only its `records.ts` file would therefore leave clients preparing packets the server refuses and would still not complete full cross-implementation C-lite policy.

**Smallest next integration:** share a canonical public reason-code catalog with the packet-generation/admission boundary, constrain newly generated/submitted reasons to that catalog, and add no-side-effect/no-log-leak negatives. Keep replay/import/offline verification of already-signed legacy records explicit and tested; their existing signatures and public history cannot be rewritten. Full verifier enforcement needs an explicit legacy/new acceptance distinction, equivalent TS/Python tests and a documented record compatibility contract. Do not simply replace both verifier schemas with an enum and alter existing expected vector outcomes to force agreement.

## Checklist justifying retention of PR #27

- [x] Historical implementation ancestry included in the canonical candidate.
- [x] Default 14-day invitation expiry and retention recovered through newer history.
- [x] Existing signed-request/rate-header/logging work accounted for.
- [x] IPv6 /56 slice recovered independently as `d6c3be0` (integration handled by lead).
- [ ] Independently reviewed keyless receipt fix integrated and qualified (separate active lane).
- [ ] Additive runtime rollback anchor with complete signing-path/startup recovery coverage.
- [ ] Recorded export/acknowledgement lifecycle and archived-deletion gate preserving current recovery semantics.
- [ ] Catalog control reasons for new operations with explicit legacy verification compatibility.
- [ ] Lazy module integrity/preload recovery qualified against the current build and real browser tampering checks (separate remaining #27 slice, outside this focused audit).

Keep the original #27 branch as provenance and recovery material. Its old pause language and blanket approval holds are not the current blocker. Its rejected web-ballot WIP remains historical, unapplied evidence and should not be treated as an available implementation patch.
