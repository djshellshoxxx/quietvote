# Device preferences and ballot review recovery

This change completes the bounded device-preference, informational rules-acknowledgment and undervote-notice portion of B3-27. It implements the existing QV-10-REQ-011, QV-10 sections V2/V4/V5, and QV-13 local-storage, labeling and message-catalog contracts. It does not claim that all B3-27 residuals are closed.

## User-visible behavior

Every app view includes a labeled device-settings group. **This is a shared or public device** persists the existing `sharedDevice` flag and shows the existing shared-device reminder. **Remember receipts on this device** controls the existing receipt-storage decision. Turning it off affects new receipts only. Existing receipts and keys remain until the user confirms **Clear this device**. Shared-device mode never clears anything automatically, and it does not silently change the separate receipt preference.

The rules page displays the existing guarantee panel and an optional acknowledgment. Its `rulesSeen` value is keyed by the manifest hash in local device settings. It makes no server request, creates no authority or eligibility claim, and never gates Continue or voting. The page remains usable when that local note cannot be read or saved. This is not a new consent policy or a versioned privacy-acceptance mechanism.

Ballot review shows the existing undervote notice for each contest with fewer selections than its maximum. The message is informational; sealing remains available. Bounds are derived from the validated method:

| Method | Maximum |
|---|---|
| yes-no | 1 |
| single-choice | 1 |
| approval | Number of options |
| k-of-n | `selection_limit` |

The number of winners is never used as the approval selection limit. Review selections remain in memory and in the existing `translate="no"` region; preference writes contain no ballot selections.

## Persistence and asynchronous work

IndexedDB settings updates now read and merge the latest row within one read/write transaction. Language, election-ID confirmation, device preferences and acknowledgment updates preserve each other, including across browser tabs. A settings write resolves only after transaction completion, rather than an individual request's earlier success event.

An independently reproduced opening failure also required repair: only a failed opening promise is discarded, so the retry action can open IndexedDB again. Concurrent callers share a pending opening, and successful connections remain cached. An abandoned blocked request aborts a later upgrade or closes a late successful connection; it cannot replace the successful retry connection.

Unreadable preferences stay disabled with an explicit retry action. A failed or uncertain save never produces a saved announcement. The UI shows the last confirmed value and requests a reread instead of substituting an in-memory store or claiming persistence. Route and render generations prevent abandoned views from writing after their transaction read, replacing current output, navigating, or delivering delayed announcements. A write that already committed remains the user's device preference; navigation is not a rollback mechanism.

All new user-facing strings use catalog keys. Existing guarantee copy and translation review metadata are unchanged. The five translated draft catalogs retain matching keys and ICU structure; they remain unavailable in voter flows until their existing review gate is satisfied.

## Verification and remaining gates

Local source checks passed:

- Web TypeScript: `tsc -p packages/web/tsconfig.json --noEmit`.
- 17 tests covering actual `startApp` behavior, settings updates, all four ballot methods, stale routes, delayed announcements and existing SPA/accessibility regressions.
- 14 catalog, copy and locale-preference tests; translated locales remain gated.
- 9 settings, locale and mandatory-browser-runner tests.
- 19 combined source tests covering the production bundle/catalog budgets, copy, actual app behavior and the failed/blocked IndexedDB opening regressions.
- An independent implementation check reran 30 committed settings, locale, SPA and delayed-announcement tests on the final combined source at `fbf9c1f`. The original transient-opening regression also passed against that source.
- Both production-build tests passed on the final combined source, including byte-identical repeated builds and exact preservation of catalog text, keys and review metadata.
- i18n extraction/lint and `git diff --check`.

The groups overlap and are not a combined unique-test count. The final combined source at `fbf9c1f` includes the device UI, IndexedDB retry repair, verifier announcement guards and vendored dependency installation. Its production entry is **101,529 bytes gzip**, below the existing 110 KiB limit. The app's complete split output plus seal worker totals **204,577 bytes gzip**, below the existing 204,800-byte aggregate limit with **223 bytes of headroom**. Both measurements use the same esbuild options and gzip calculation as `app-precompile.test.ts`; budget thresholds and assertions are unchanged. This small remaining margin must be respected by subsequent UI changes.

`e2e/device-settings.ts` is registered as the eighth mandatory browser journey. It exercises the actual production bundle, cross-tab IndexedDB merges, an abort after request success, stale transaction callbacks, unavailable settings, local acknowledgment, all four method maxima, receipt opt-out/opt-in, and confirmed device clearing. It also uses keyboard interaction and checks reflow at 320 CSS pixels. Local Chromium launch failed before any page loaded because the host denied its process-singleton socket (`socket() failed: Operation not permitted`). That is a blocked browser gate, not a browser pass or an automatic skip. Hosted CI must run this journey.

Countdown/freshness, split-origin configuration, timezone policy and other B3-27 residuals remain outside this change. No manual accessibility-conformance or independent security-review approval is asserted.
