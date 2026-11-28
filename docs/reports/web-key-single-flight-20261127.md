# Web key operations and preview single-flight — 2026-11-27

This completes [inventory web task 2](inventory-20261111/web.tasks.md): prevent overlapping key operations, disable the associated inputs and preview actions while work is pending, and expose the busy state through `aria-busy`. The changes are confined to the voter key view and an optional busy-state notification from the existing organizer key panel.

## Confirmed gaps

The existing voter form used generation checks and atomic key installation to reject obsolete results, but it did not prevent a second operation from starting. Repeated Create performed three real default-cost derivations instead of the intended wrap/unlock pair. Repeated Unlock performed two instead of one. These failures were reproduced against the unchanged integration app (`9f23a9b54ac221201e155df6fdd5475a419d0288`). They establish redundant work; they do not establish that two containers were installed.

Review of the initial correction found two more ways to overlap work: the recovery-code button appeared while the original unlock still awaited membership information, and repeated recovery-code requests could derive concurrently. Both produced two derivations instead of one against the intermediate app (`f52e871a84a330f1dc4e3e40c94a073da3c86e92`). The final correction includes those actions in the same guard.

The organizer panel already guarded its own key operations. The create view's separate Freeze election button remained enabled during a later unlock after an organizer had already unlocked successfully. Its preview now follows that existing busy state. No KDF is added to the synchronous preview.

## Behavior

The active voter key view admits one Create, Unlock, recovery display or encrypted-backup continuation at a time. It sets `aria-busy` on the form and backup regions and disables the related inputs and buttons before the first asynchronous step. Explicit callback guards also reject synthetic duplicate events. Generate and mode changes cannot alter a pending operation, and the selected mode, password and file are captured before their asynchronous use.

The guard covers the original operation through storage, key unlock and its membership/registration continuation. The backup download continuation is awaited as well. A successful form redraw retains the separate backup controls, so they are restored when work ends. A failed operation or cancelled cost prompt releases the controls for an explicit retry. Existing generation, route and storage checks still reject late installation or display after navigation or confirmed device clearing; cancelling that clearing request allows the original work to finish.

Recovery-code display shares the guard without advancing the main key-operation generation or invalidating the unlocked signer's closure. The existing Hide action remains usable for privacy. It also invalidates a pending redisplay of that code, so a delayed result cannot reveal it again after Hide. This is a DOM behavior check, not a memory-erasure guarantee.

The organizer panel's optional `busyChanged` observer disables Freeze election and guards its handler while key work is pending. The existing route check rejects stale callbacks. Success, failure and cancellation restore preview availability. Observer errors cannot interrupt panel cleanup or release its own guard.

KDF parameters, cost confirmation, encrypted-container format, key import validation, atomic installation, session backup requirements, input retirement and signer locking remain in their existing modules. No dependency, protocol, storage schema, wire behavior, copy or locale policy changes are introduced.

## Acceptance

The new `packages/web/test/key-single-flight-ui.test.ts` drives the actual `startApp` through the deterministic DOM harness. Its 17 cases use real default Argon2id and AES rather than a substituted derivation. The observer pauses/counts the native AES-key import after derivation and then forwards the original operation unchanged. It records counts, not secret material.

The cases cover repeated Create and Unlock, exact single installation, saved-container preservation, import-file delay and failure, attempted Generate/mode/file/password changes while pending, recovery restore, cancelled cost confirmation, wrong-password retry, cancelled and confirmed device clearing, navigation, recovery display during membership loading, repeated display, Hide during delayed redisplay, display after navigation or clearing, failed display retry, and a previously unlocked organizer's pending unlock. The organizer case also checks preview recovery after failure and cost cancellation.

The cost-cancellation fixture changes well-formed cost metadata solely to reach the existing confirmation before any derivation. It is not claimed to be valid ciphertext under those changed parameters. The retry restores the original genuine encrypted container.

`packages/web/e2e/key-single-flight.ts` exercises the built SPA, native controls, IndexedDB, real Argon2id and native AES with the existing FakeBoard fixture. Five steps cover duplicate Create, duplicate Unlock, repeated recovery display and Hide, cost cancellation followed by valid import, and the previously unlocked organizer's Freeze control during another unlock. It sends both normal and synthetic duplicate clicks, checks disabled inputs and `aria-busy`, preserves backup availability and checks recovery after completion. The browser reports no page/CSP errors or external requests and makes only GET requests. This journey is not a real-server contract test.

The runner retains all 16 previous browser journeys and adds `key-single-flight` as the seventeenth. Its failure controls retain the earlier `vote-methods` and `a11y-election` cases. No existing browser assertion, timeout or repository launch flag was relaxed. The local run used the documented scratch Chromium wrapper, with `QV_REQUIRE_BROWSER=1`; no tooling skip was counted as a pass.

| Check | Result |
|---|---|
| New 17-case actual UI suite plus existing key, organizer setup, session-storage UI and organizer-time-zone regression suites | 63 passed, 0 failed, 0 skipped; 54.725 s |
| Built production browser journey | All five steps passed; 1 test, 0 failures, 0 skips; 12.852 s |
| Web and browser strict TypeScript checks | Passed with the existing strict settings |
| Required-browser runner failure-propagation tests | 3 passed, 0 skipped |
| Existing reproducible-build, CSP/SRI, verifier-size and DOM/CSS lint checks | 4 passed, 0 skipped |
| Shell syntax and diff checks | Passed |
| Build `101eb20c6469`, all JavaScript gzip | 194,066 / 204,800 bytes |
| Entry module | 57,221 bytes gzip; 174,201 bytes raw |
| Standalone verifier | 202,554 / 409,600 bytes |

The isolated source includes the preceding web increments and the integration branch's corrected receipt copy/COPY. A 193-file inherited-source ledger verifies that only the two production modules and the two runner files changed before this report/NOTES addition; the new test and browser journey are additive. All 63 English guarantee entries, all five unoffered draft catalogs and locale review metadata are unchanged. The integration branch's unrelated main-browser null-body typing correction was carried into the baseline, not included as part of this feature.

## Source binding and review scope

| Source | Git blob |
|---|---|
| `packages/web/src/ui/app.ts` | `fa15e0329cca716d037f04395a8aaa7153e604ff` |
| `packages/web/src/ui/organizer-key.ts` | `dcf1036403bf73c584aacd80eedad860f05c7e84` |
| `packages/web/test/key-single-flight-ui.test.ts` | `91e7ecc6d2e1ce64f683f8852834d11b8ed9d32a` |
| `packages/web/e2e/key-single-flight.ts` | `8d6d0e48203ad054587f396fe89c0ed3ae9acf44` |
| `.github/scripts/run-browser-journeys.sh` | `4e5e24dce5522f357323371f56cb6309ab8676aa` |
| `.github/scripts/run-browser-journeys.test.mjs` | `8e292a5f9f8998a647ddd3bce87393000499b8cf` |

The frozen handoff includes the exact minimal production patch, test sources, source hashes and positive/negative execution logs. The integration maintainer independently reviews the two production changes and runs composed validation before publication. The checks above do not claim a broad independent security audit, native assistive-technology qualification or completion of held freshness, prefix-evidence, final-server verification, worker-CSP or translation-review contracts.

## Composed web-suite follow-up

After integration onto PR #78, the complete web suite passes **527/527**, with
zero skips, on Node 24.22.3 in 207.993 seconds. This run used a local 512 MiB
per-process heap limit and file concurrency 1; repository CI settings and test
deadlines were not changed.

The first composed run completed 500 reported tests, with 496 passes and four
failures. Two i18n CLI children ended with `SIGKILL`; the i18n-lint file also
failed before reporting its individual cases. Those process failures do not
establish a specific resource cause. The fourth failure was the existing
`publish-ui.test.ts` source assertion, which required the former preview-button
markup. Its expectation now requires the new `disabled: organizerBusy` option
and typed button binding. The production hashes above remain unchanged. All
four affected areas pass in the complete rerun; the earlier log is retained
as `r28-web-full-bounded.log`, alongside `r28-web-full-serial.log`.


## Final composed browser acceptance

The final production build `a46bc13c1331` passed all seventeen required browser
journeys in one combined run, including the key-operation journey and the exact
Experimental disclosure. This uses Chromium 143.0.7499.0 and the existing
no-zygote wrapper. The key implementation blobs are unchanged from the frozen
handoff. The subsequent banner copy is separately covered by i18n and executable
checks; the full 527-case web run predates only that disclosure copy edit.
[The R28 receipt](../audits/CONTINUATION_R28_20261127.md) binds the complete results.
