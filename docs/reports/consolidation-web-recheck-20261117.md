# QuietVote historical B3 reconciliation

Current source: `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`. Historical source: `424110d90e23dc443aa4498a4340973d3c8cb8b6`. Historical final-verification evidence read at `9a03414e0e826db292f9dd5728e4d3d2f0682784`.

Historical B3-01 through B3-32 reconciliation. Source review of each reported mechanism; selected current regression execution. No full browser run, external audit, platform qualification or new production data. No product source edits.

## Current disposition

All 32 identifiers assessed: 27 already fixed in the specific reported mechanism; 5 partially fixed. These are source-based assessments with evidence depth recorded below, not a claim of 32 new browser reproductions.

Fresh execution: **55 focused tests passed, zero failed/skipped**, plus a successful residual reproduction for B3-06. Node v24.22.1 on Linux.

## Remaining work

- **B3-06:** a valid pause is accepted by the server (PAUSED), but the web derives open from the same log. Placeholder/refusal/receipt copy portions are fixed.
- **B3-12:** public read-only pages tolerate blocked storage; key/vote/receipt operations still need IndexedDB. No session-only adapter is selected.
- **B3-14:** final limit errors are not retried, but the guarantee panel still claims revoting in one-ballot elections.
- **B3-26:** approved cooperative progress/cancel is implemented. Individual operations/JSON parsing remain synchronous; resumability and SPA scheduling are not provided. These are documented scope/performance limits, not a newly proven vulnerability.
- **B3-27:** recovery, roll checking and lock warnings are wired. Timezone conversion, fragment board origin, privacy settings and several deadline/undervote messages remain unwired.

## Finding matrix

| ID | Historical severity | Current status | Confidence | Current conclusion |
|---|---|---|---|---|
| B3-01 | High | already fixed | high | Current web enrollment uses the approved shared hashed-pop-v1 contract and succeeds against the real server. |
| B3-02 | High | already fixed | high | Results are gated by proof verification and authenticated board evidence; a coordinator signature alone cannot expose forged counts. |
| B3-03 | Medium | already fixed | high | Generated headers permit the exact standalone verifier script/style hashes and the reference server serves a verifier-specific CSP. |
| B3-04 | Medium | already fixed | high | The historical static-import integrity gap is repaired: the build traverses static dependencies and emits integrity-bearing modulepreloads. |
| B3-05 | Medium | already fixed | medium-high | Entering Vote now refreshes all entries before deriving supersedes, and a rejected link is described as failure to replace an earlier ballot. |
| B3-06 | Medium | partially fixed | high | Missing error arguments, incorrect refusal mapping and false receipt-proof copy are repaired. Signed pause controls are still absent from web phase derivation. |
| B3-07 | Medium | already fixed | medium-high | The audit view now shows contest selections from the decrypted audit result and offers an audit-package download for another device. |
| B3-08 | Medium | already fixed | medium-high | Clearing the device requires an explicit modal confirmation; Cancel resolves without clearing. |
| B3-09 | Medium | already fixed | medium-high | Backups are available after unlocking and before registration succeeds; recovery codes have a reachable import form. |
| B3-10 | Medium | already fixed | high | Registration success requires an approved or pending response tied to the client request; an invite conflict is shown as an error, and no-invite state is neutral/on-roll. |
| B3-11 | Medium | already fixed | high | Auto-lock checks hidden duration before clearing it, provides warning/extend controls, redraws ballot state, and prevents sealing or a new cast with a wiped signer. |
| B3-12 | Medium | partially fixed | high | Rules/results and startup no longer depend on successful settings storage. Key creation/import, voting recovery and stored receipts still require IndexedDB; there is no session-only fallback. |
| B3-13 | Medium | already fixed | high | Signed promise-only responses are retained as downloadable receipts; ambiguous POST failures remain pending and do not claim the ballot was unsent. |
| B3-14 | Medium | partially fixed | high | REVOTE_LIMIT is no longer retried and the immediate ballot note is conditional. The guarantee panel still promises revoting unconditionally. |
| B3-15 | Low | already fixed | high | Cast and Test now share the primary style and equal-width layout rules. |
| B3-16 | Low | already fixed | high | Anchor mismatch forces visible FAIL; successful headings say Supplied checks passed and list skipped checks. |
| B3-17 | Low | already fixed | high | Navigation and result generations reject stale awaited work before rendering. |
| B3-18 | Low | already fixed | high | Announcements are not truncated and phishing has a short dedicated announcement key; local status nodes do not add competing live roles. |
| B3-19 | Low | already fixed | high | The unlock form uses current-password; key-format/parameter/checksum errors are presented as import errors instead of storage failure. |
| B3-20 | Low | already fixed | high | Fast below-default unlocks now rewrap with stronger parameters. |
| B3-21 | Low | already fixed | medium-high | The broken /e privacy-link target is absent. Election navigation provides a Rules and privacy tab and that page renders the guarantee panel. |
| B3-22 | Low | already fixed | high | Selection lookup uses a null-prototype map; ICU and message lookups reject prototype aliases, and malformed tally results cannot bypass the verification gate. |
| B3-23 | Low | already fixed | high | Invitation rows contain complete usable links and copy the clean underlying string. |
| B3-24 | Low | already fixed | high | Confirmation is keyed by the signed manifest hash, not the route/API election identifier. |
| B3-25 | Low | already fixed | high | CLI and web use the same canonical passphrase function with bounded legacy fallback and immutable old-container fixtures. |
| B3-26 | Low | partially fixed | high | Approved cooperative option A now supplies progress, cancellation, stale-run invalidation and task yielding in the standalone verifier. It does not provide worker execution or resume-from-checkpoint, and parsing/individual operations remain synchronous. |
| B3-27 | Low | partially fixed | high | Several formerly unreachable capabilities are now wired, but significant library-only/settings/copy gaps remain. |
| B3-28 | Info | already fixed | high | Approved mitigation preserves stronger compatible key files but requires an explicit cost confirmation before above-default KDF work; cancellation performs no derivation. |
| B3-29 | Info | already fixed | high | SPA verification rejects files larger than 64 MiB before calling File.text(). |
| B3-30 | Info | already fixed | high | CI now installs pinned Chromium and runs browser, CSP, standalone verifier and accessibility journeys with fail-closed browser requirements. |
| B3-31 | Info | already fixed | high | Logged time comes from the verified receipt promise, not Date.now(). |
| B3-32 | Info | already fixed | high | Notices now sit inside the header landmark and the chart figure uses its caption without role=group. |

## Evidence per finding

### B3-01 — already fixed

Current web enrollment uses the approved shared hashed-pop-v1 contract and succeeds against the real server.

Evidence:

- packages/web/src/flow/onboarding.ts:134-144 shares registrationMessage and sends inviteHash(token).
- packages/web/src/ui/app.ts:430-435 checks advertised enrollment scheme before pre-manifest enrollment.
- packages/server/test/registration.test.ts:47-66 drives registrationBody and ApiClient.register against the HTTP server, asserts one approved voter and idempotent same-key result.

Verification:

- Executed registration.test.ts as part of 17/17 interop/build checks.

### B3-02 — already fixed

Results are gated by proof verification and authenticated board evidence; a coordinator signature alone cannot expose forged counts.

Evidence:

- packages/web/src/ui/app.ts:843-865 verifies the loaded snapshot before rendering charts/counts.
- packages/web/src/flow/verification.ts:13-31 passes actual records/roll/board to verifyElection and requires PASS plus tally aggregate/decrypt/rule checks.
- packages/web/test/verification.test.ts:10 tests forged coordinator-signed tally and missing evidence.

Verification:

- Executed verification.test.ts, including forged-count negative controls, as part of 38/38 targeted checks.

Limits / remaining work: This is shared-implementation validation, not an external cryptographic audit.

### B3-03 — already fixed

Generated headers permit the exact standalone verifier script/style hashes and the reference server serves a verifier-specific CSP.

Evidence:

- packages/web/src/build/site.ts:35-46 adds exact hashes to common matching headers and a verifier-specific policy.
- packages/server/src/static.ts:50-72 checks actual verifier HTML and derives its CSP.
- packages/server/src/http.ts:281 applies static-file CSP.
- packages/web/e2e/verifier.ts:86-106 exercises both generated-header and real-server paths.

Verification:

- Executed build.test.ts in 17/17 interop/build checks.
- Browser scenario inspected, not rerun in this lane.

Limits / remaining work: Fresh browser qualification must refer to the tested candidate head.

### B3-04 — already fixed

The historical static-import integrity gap is repaired: the build traverses static dependencies and emits integrity-bearing modulepreloads.

Evidence:

- packages/web/src/build/site.ts:150-159 traverses non-external import-statement dependencies.
- packages/web/src/build/site.ts:77-83 emits SHA-384 integrity for entry, static modules and stylesheet.
- packages/web/test/build.test.ts:34 verifies pinned static imports.
- packages/web/e2e/verifier.ts:269-278 tampers a static shared chunk and requires its code not to execute.

Verification:

- Executed build.test.ts in 17/17 interop/build checks.
- Tampering browser scenario inspected, not rerun in this lane.

Limits / remaining work: Dynamic imports and sealing-worker integrity remain the separately tracked W15 boundary. No W15 candidate was reviewed here.

### B3-05 — already fixed

Entering Vote now refreshes all entries before deriving supersedes, and a rejected link is described as failure to replace an earlier ballot.

Evidence:

- packages/web/src/ui/app.ts:416-423 refreshes records and re-derives the context on entering Vote.
- packages/web/src/ui/app.ts:609 derives the last own verified ballot from refreshed records.
- packages/web/src/i18n/en.ts:468-469 explicitly says the earlier ballot may still be current.
- packages/web/src/flow/ballot-controller.ts:193-195 maps explicit rejected links to REJECTED, not a claim of replacement.

Verification:

- Source review of refresh, signature binding, outcome and copy.

Limits / remaining work: The original SSE-disabled full browser revote scenario was not rerun in this lane; concurrent changes can still cause a legitimate refusal.

### B3-06 — partially fixed

Missing error arguments, incorrect refusal mapping and false receipt-proof copy are repaired. Signed pause controls are still absent from web phase derivation.

Evidence:

- packages/web/src/api/errors.ts:42 maps PAUSED-style WRONG_PHASE to E-API-UNAVAILABLE.
- packages/web/src/api/errors.ts:68-74 supplies required time/rate placeholders.
- packages/web/src/ui/app.ts:672-674 shows recorded proof text only for ACCEPTED_RECORDED.
- packages/web/src/flow/election.ts:13,75-115,155 has no paused phase or control-record processing.
- packages/web/src/ui/app.ts:607 gates on derived phase, so a paused log still reaches the open form.

Verification:

- Executed error-args.test.ts in 38/38 checks.
- Executed b3-pause-reproduction.mjs against a synthetic real HTTP server: pause accepted 201; server PAUSED; web phase open; error mapping E-API-UNAVAILABLE.

Limits / remaining work: Implement the approved signed-control authority/freshness contract before claiming paused-state UX completion. Do not treat old generic approval holds as current policy.

### B3-07 — already fixed

The audit view now shows contest selections from the decrypted audit result and offers an audit-package download for another device.

Evidence:

- packages/web/src/ui/app.ts:659-667 renders a contest/choice table, match controls, download and second-device help.
- packages/web/src/flow/ballot-controller.ts:257-273 checks the audit package and retains the exact text for download.

Verification:

- Source review.

Limits / remaining work: No new browser execution of the audit table in this lane. A QR/link affordance is not claimed.

### B3-08 — already fixed

Clearing the device requires an explicit modal confirmation; Cancel resolves without clearing.

Evidence:

- packages/web/src/ui/app.ts:138-158 prompts with cancel/confirm and returns before clearAll on cancellation.
- packages/web/e2e/run.ts:254-283 covers Cancel preserving the key and confirmed clear removing keys/receipts.

Verification:

- Source review; existing browser tests inspected.

Limits / remaining work: Browser confirmation scenario not rerun in this lane.

### B3-09 — already fixed

Backups are available after unlocking and before registration succeeds; recovery codes have a reachable import form.

Evidence:

- packages/web/src/ui/app.ts:502-507 builds download/recovery actions before registration at 509-518.
- packages/web/src/ui/app.ts:529-532 invokes finish after normal unlock.
- packages/web/src/ui/app.ts:537-549 exposes recovery mode and calls restoreFromRecovery.
- packages/web/src/flow/onboarding.ts:81-88 decodes and persists the recovered seed, wiping the temporary seed.

Verification:

- Source review.

Limits / remaining work: No fresh full-browser recovery import performed. Backup-confirmation/waiver qualification is a separate UX requirement.

### B3-10 — already fixed

Registration success requires an approved or pending response tied to the client request; an invite conflict is shown as an error, and no-invite state is neutral/on-roll.

Evidence:

- packages/web/src/ui/app.ts:508-523 sets registered only after successful ApiClient.register and uses notYetRoll/onRoll when no registration occurred.
- packages/web/src/api/client.ts register() validates identity metadata and response fields.
- packages/web/test/audit2.test.ts:225-233 guards against treating arbitrary 409 as success.
- packages/server/test/registration.test.ts:92-107 exercises a consumed invite against another key.

Verification:

- Executed registration.test.ts in 17/17 interop/build checks.
- UI outcome paths reviewed.

### B3-11 — already fixed

Auto-lock checks hidden duration before clearing it, provides warning/extend controls, redraws ballot state, and prevents sealing or a new cast with a wiped signer.

Evidence:

- packages/web/src/ui/app.ts:95-118 checks elapsed hidden/idle time and calls ballotLock.
- packages/web/src/ui/app.ts:614-615 redraws locked ballot sessions.
- packages/web/src/flow/ballot-controller.ts:88-105 rejects locked sealing and discards late results.
- packages/web/src/flow/ballot-controller.ts:130 rejects a new cast with locked signer.

Verification:

- Executed B3-11 controller regression in audit3.test.ts, part of 38/38 targeted checks.

Limits / remaining work: Hidden-tab suspension behavior on real Tor/Firefox/mobile was not rerun; source ordering is corrected.

### B3-12 — partially fixed

Rules/results and startup no longer depend on successful settings storage. Key creation/import, voting recovery and stored receipts still require IndexedDB; there is no session-only fallback.

Evidence:

- packages/web/src/i18n/preference.ts:4-9 catches storage failure during startup.
- packages/web/src/ui/app.ts:440 catches overview settings failure; rules/results do not require that read.
- packages/web/e2e/verifier.ts:233-240 asserts rules/results remain readable with blocked IndexedDB.
- packages/web/src/key/storage.ts:144-157 throws when IndexedDB fails and has no fallback adapter selection.
- packages/web/src/ui/app.ts:527 and packages/web/src/flow/onboarding.ts:65-78 require key storage.

Verification:

- Source review and blocked-storage browser scenario inspection; browser scenario not rerun.

Limits / remaining work: Do not claim complete storage-free client use. Key form startup rejection and session-only key workflows need focused browser qualification.

### B3-13 — already fixed

Signed promise-only responses are retained as downloadable receipts; ambiguous POST failures remain pending and do not claim the ballot was unsent.

Evidence:

- packages/web/src/flow/ballot-controller.ts:166-179 constructs/saves a receipt regardless of immediate inclusion.
- packages/web/src/flow/ballot-controller.ts:187-198 maps 5xx/network/bad-response to E-NET-TIMEOUT and pending delivery.
- packages/web/src/ui/app.ts:673,676,681-683 displays pending copy and save/retry actions.
- packages/web/test/audit3.test.ts:41 confirms promise-only receipt storage and signed sequenced time.

Verification:

- Executed audit3.test.ts in 38/38 targeted checks.

Limits / remaining work: Receipt integrity remains checked by verifyAppendResult; this does not equate a promise with verified inclusion.

### B3-14 — partially fixed

REVOTE_LIMIT is no longer retried and the immediate ballot note is conditional. The guarantee panel still promises revoting unconditionally.

Evidence:

- packages/web/src/api/client.ts:259 respects an explicit retryable flag.
- packages/web/src/api/errors.ts:43,80 maps REVOTE_LIMIT and prohibits retry.
- packages/web/src/ui/app.ts:685 chooses oneBallot vs revoteNote by max_per_voter.
- packages/web/src/ui/app.ts:394 always renders qv.privacy.g4.
- packages/web/src/i18n/en.ts:116 states that the voter can vote again without a one-ballot condition.

Verification:

- Executed B3-14 no-retry regression in 38/38 targeted checks.
- Confirmed remaining copy path by source review.

Limits / remaining work: Apply approved conditional guarantee wording for max_per_voter=1. General limit exhaustion above one ballot also deserves accurate copy; do not lower the cap.

### B3-15 — already fixed

Cast and Test now share the primary style and equal-width layout rules.

Evidence:

- packages/web/src/ui/app.ts:646-651 marks both buttons primary and places both inside row equal.
- packages/web/static/styles.css:20-21 assigns equal flex sizing and full-width matching button heights.

Verification:

- Source review.

Limits / remaining work: No new screenshot or computed-style comparison in this lane.

### B3-16 — already fixed

Anchor mismatch forces visible FAIL; successful headings say Supplied checks passed and list skipped checks.

Evidence:

- packages/web/src/flow/verification.ts:6-9 overrides visible verdict on anchor mismatch.
- packages/web/src/ui/app.ts:913-919 uses verificationSummary for the SPA report.
- packages/web/src/verifier/page.ts:108-129 includes anchor mismatch in heading and live announcement.
- packages/web/src/i18n/en.ts:315 uses Supplied checks passed rather than All checks passed.

Verification:

- Executed verification.test.ts and offline-verifier.test.ts in 38/38 targeted checks.

Limits / remaining work: A PASS can still have explicitly optional not_run checks; the UI no longer asserts all checks ran.

### B3-17 — already fixed

Navigation and result generations reject stale awaited work before rendering.

Evidence:

- packages/web/src/ui/app.ts:326-346 maintains routeEpoch and rejects late error rendering.
- packages/web/src/ui/app.ts:409-423 checks epochs after election load, entries and derived context.
- packages/web/src/ui/app.ts:577-581,692-694,843-864 checks epochs/generations for vote, receipts and results.
- packages/web/e2e/verifier.ts:222-231 preserves Help after a delayed earlier election load.

Verification:

- Source review; existing browser stale-navigation scenario inspected.

Limits / remaining work: No fresh browser navigation-race execution in this lane.

### B3-18 — already fixed

Announcements are not truncated and phishing has a short dedicated announcement key; local status nodes do not add competing live roles.

Evidence:

- packages/web/src/ui/app.ts:82-83 creates the polite and assertive live regions.
- packages/web/src/ui/dom.ts:25-36 assigns the complete message without slicing.
- packages/web/src/ui/app.ts:455,458 uses qv.phish.announce.
- packages/web/test/audit3-ui.test.ts:42-69 checks announcement retention and region wiring.

Verification:

- Executed audit3-ui.test.ts in 38/38 targeted checks.

Limits / remaining work: Manual screen-reader acceptance remains outside this source/DOM review.

### B3-19 — already fixed

The unlock form uses current-password; key-format/parameter/checksum errors are presented as import errors instead of storage failure.

Evidence:

- packages/web/src/ui/app.ts:529-531 sets autocomplete=current-password when an existing key is unlocked.
- packages/web/src/ui/app.ts:496-500 separates KeyError import/recovery errors from storage errors.

Verification:

- Source review.

Limits / remaining work: Browser password-manager behavior was not exercised.

### B3-20 — already fixed

Fast below-default unlocks now rewrap with stronger parameters.

Evidence:

- packages/web/src/flow/onboarding.ts:118-125 upgrades when needsRewrap and elapsedMs < 3000.
- packages/web/test/audit3.test.ts:65-78 forces a 100 ms unlock and asserts increased memory plus rewrapped=true.

Verification:

- Executed fast-unlock regression in 38/38 targeted checks.

### B3-21 — already fixed

The broken /e privacy-link target is absent. Election navigation provides a Rules and privacy tab and that page renders the guarantee panel.

Evidence:

- packages/web/src/ui/app.ts:427-428 builds valid per-election rules links.
- packages/web/src/ui/app.ts:462 renders guaranteePanel(L) on rules.
- packages/web/src/ui/app.ts:1099-1100 constructs header/footer without the historical /e link.

Verification:

- Source review.

Limits / remaining work: First-entry/versioned privacy acknowledgement remains part of B3-27; this row closes the specific dead-link defect only.

### B3-22 — already fixed

Selection lookup uses a null-prototype map; ICU and message lookups reject prototype aliases, and malformed tally results cannot bypass the verification gate.

Evidence:

- packages/web/src/ui/app.ts:618 copies selections into Object.create(null).
- packages/web/src/ui/app.ts:858-865 rejects unverified results before accessing outcome presentation.
- packages/web/src/i18n/icu.ts uses own-property selector checks; packages/web/src/i18n/index.ts rejects unknown message IDs.
- packages/web/test/audit3.test.ts:80 tests constructor/__proto__/toString selector inputs.

Verification:

- Executed prototype-name ICU regression and forged-result gate tests in 38/38 targeted checks.

Limits / remaining work: The original full manifest-ID browser PoC was not rerun; current source removes the reported inherited-property lookup.

### B3-23 — already fixed

Invitation rows contain complete usable links and copy the clean underlying string.

Evidence:

- packages/web/src/ui/invites.ts:9-11 constructs origin/election/#inv links.
- packages/web/src/ui/invites.ts:21-25 renders code text and a per-row Copy action.
- packages/web/test/audit3-ui.test.ts:70-89 checks round-trip parsing, clean copied text and malformed-token handling.

Verification:

- Executed invitation-row DOM regressions in 38/38 targeted checks.

### B3-24 — already fixed

Confirmation is keyed by the signed manifest hash, not the route/API election identifier.

Evidence:

- packages/web/src/ui/app.ts:444 reads settings.confirmed[ctx.manifestHashHex].
- packages/web/src/ui/app.ts:446 writes confirmation under ctx.manifestHashHex.
- packages/web/src/ui/app.ts:420 pins refreshed records to the existing manifest hash.

Verification:

- Source review.

Limits / remaining work: No fresh manifest-swap browser execution; old URL-keyed booleans no longer satisfy the current lookup.

### B3-25 — already fixed

CLI and web use the same canonical passphrase function with bounded legacy fallback and immutable old-container fixtures.

Evidence:

- packages/cli/src/keyfile.ts:6,45-52 uses canonicalKeyPassphrase/keyPassphraseUnlockCandidates.
- packages/web/src/key/keystore.ts:195-213 tries bounded shared candidate inputs.
- packages/cli/test/keyfile-compatibility.test.ts:41-69 verifies legacy files and new cross-client containers.

Verification:

- Executed keyfile-compatibility.test.ts in 17/17 interop/build checks, including both implementations.

Limits / remaining work: Existing accepted legacy containers remain readable; no new container protocol introduced.

### B3-26 — partially fixed

Approved cooperative option A now supplies progress, cancellation, stale-run invalidation and task yielding in the standalone verifier. It does not provide worker execution or resume-from-checkpoint, and parsing/individual operations remain synchronous.

Evidence:

- packages/web/src/verifier/page.ts:36-103 handles cancellation/progress and yields tasks at checkpoints.
- packages/web/src/flow/verification.ts:21-27 forwards cooperative scheduling.
- packages/web/src/ui/app.ts:945 calls the SPA verifier without cooperative options.
- packages/web/NOTES.md:250-256 documents the accepted cooperative implementation and synchronous limits.
- docs/plan/DECISIONS-2026-11-04.md:359-367 selects cooperative yielding without widening offline CSP.

Verification:

- Executed offline-verifier.test.ts in 38/38 checks: cancel/retry, delayed reads, anchor/page invalidation.

Limits / remaining work: Do not reintroduce a worker/CSP relaxation merely to match the historical suggested fix. Large-election responsiveness and any resumability claim need separate evidence; remaining limits are not reported as a newly reproduced vulnerability.

### B3-27 — partially fixed

Several formerly unreachable capabilities are now wired, but significant library-only/settings/copy gaps remain.

Evidence:

- packages/web/src/ui/app.ts:107,521,546 wires lock warning, roll checking and recovery import.
- packages/web/src/ui/app.ts:763 adds bounded receipt-file reading; organizer admin now prepares roll commitment through its own route.
- packages/web/src/i18n/datetime.ts:57,80 still has zonedLocalToUtc/offsetText with no production call outside the definition file.
- packages/web/src/flow/invite.ts:32,40 parses board origin, while app.ts:307 still uses env.apiBase without using frag.board.
- packages/web/src/key/storage.ts:31-39 retains sharedDevice/rulesSeen; no UI setter exists.
- qv.ballot.undervote and qv.ballot.closingSoon still have catalog definitions without production UI call sites.

Verification:

- Targeted symbol/call-site source inspection across web/src; no historical unused-message count reused.

Limits / remaining work: Do not carry forward 115/487 as a current count. Complete or explicitly scope away remaining contracts, including timezone, split-origin configuration, privacy settings and countdown/undervote UX.

### B3-28 — already fixed

Approved mitigation preserves stronger compatible key files but requires an explicit cost confirmation before above-default KDF work; cancellation performs no derivation.

Evidence:

- packages/web/src/key/keystore.ts:82-83 computes above-default cost.
- packages/web/src/key/keystore.ts:188-192 checks confirmCost before KDF.
- packages/web/src/ui/app.ts:120-136 creates a modal with the actual memory/passes/lanes and passes the callback.
- packages/web/test/kdf-cost-confirm.test.ts:31-110 verifies defaults, all elevated parameters, cancellation and unchanged floor/ceiling.

Verification:

- Executed kdf-cost-confirm.test.ts in 38/38 targeted checks.

Limits / remaining work: The expensive cost itself is intentionally retained after consent. Headless callers without confirmCost retain their documented behavior; no claim that Argon2 cost disappeared.

### B3-29 — already fixed

SPA verification rejects files larger than 64 MiB before calling File.text().

Evidence:

- packages/web/src/ui/app.ts:942-943 checks f.size before reading.
- packages/web/src/verifier/page.ts:65 enforces the same standalone bound.
- packages/web/e2e/verifier.ts:261-267 exercises a sparse 64 MiB + 1 file on both pages.

Verification:

- Source review; existing oversized-file browser test inspected.

Limits / remaining work: Browser scenario not rerun in this lane. The bound still permits bounded memory use up to the configured maximum.

### B3-30 — already fixed

CI now installs pinned Chromium and runs browser, CSP, standalone verifier and accessibility journeys with fail-closed browser requirements.

Evidence:

- .github/workflows/ci.yml:167-189 defines the browser job and QV_REQUIRE_BROWSER=1.
- .github/scripts/run-browser-journeys.sh runs run/help/a11y/verifier/spoil-shares/server/registration and preserves failures.
- packages/web/e2e/verifier.ts:86-106 explicitly opens verifier.html on both serving configurations.

Verification:

- Source review of workflow and runner.

Limits / remaining work: This confirms workflow coverage, not protected-branch enforcement or a new hosted run. Root must cite exact-head CI separately.

### B3-31 — already fixed

Logged time comes from the verified receipt promise, not Date.now().

Evidence:

- packages/web/src/flow/ballot-controller.ts:163-166 verifies the append receipt then retains promise.sequenced_at.
- packages/web/src/ui/app.ts:672 renders new Date(rep.sequencedAt * 1000).
- packages/web/test/audit3.test.ts:49 asserts the reported time equals the stored promise time.

Verification:

- Executed promise/timestamp regression in 38/38 targeted checks.

Limits / remaining work: No fresh browser-clock spoofing experiment; the source of the rendered time is directly verified.

### B3-32 — already fixed

Notices now sit inside the header landmark and the chart figure uses its caption without role=group.

Evidence:

- packages/web/src/ui/shell.ts:4-5 nests banners in header.
- packages/web/src/ui/app.ts:1099 uses buildHeader.
- packages/web/src/ui/charts.ts:34 uses figure with aria-labelledby and no role override.
- packages/web/test/audit3-ui.test.ts:91-103 checks the two repaired structures.

Verification:

- Executed audit3-ui.test.ts in 38/38 targeted checks.

Limits / remaining work: This closes the named DOM defects; it does not claim full/manual accessibility qualification or a fresh axe sweep.

## Executed checks

```sh
node --test --test-reporter=spec packages/web/test/audit3.test.ts packages/web/test/audit3-ui.test.ts packages/web/test/error-args.test.ts packages/web/test/verification.test.ts packages/web/test/offline-verifier.test.ts packages/web/test/kdf-cost-confirm.test.ts
```

Result: 38 passed, 0 failed, 0 skipped.
Log: `b3-targeted-tests.log`.

```sh
node --test --test-reporter=spec packages/web/test/build.test.ts packages/server/test/registration.test.ts packages/cli/test/keyfile-compatibility.test.ts
```

Result: 17 passed, 0 failed, 0 skipped.
Log: `b3-interop-build-tests.log`.

```sh
node /workspace/scratch/2a75600f2d9c/analysis/branch_inventory/b3-pause-reproduction.mjs
```

Confirmed signed pause remains server PAUSED / web open; refusal text is repaired.
Log: `b3-pause-reproduction.log`.

## Preserved boundaries

- Historical audit files were not modified, and historical finding severities were not rewritten.
- Required human/security-group approvals are not supplied by this review.
- Existing browser scenarios were read to trace intended protection. This lane did not execute those browser scenarios.
- Static-import SRI is repaired. W15 lazy-import and sealing-worker boundaries remain separately tracked; no later W15 candidate is covered here.
- No runtime source was edited and no vulnerability details were publicly posted.
