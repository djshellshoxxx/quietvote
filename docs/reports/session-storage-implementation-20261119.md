# Explicit page-session storage implementation

This report covers the storage component of B3-12 on the candidate based on
`ba728be`. It is ordinary feature completion under the existing browser-storage
requirements, not adoption of a new cryptographic construction or a claim of
complete Tor Browser compatibility. The separate WebCrypto-free wrapping work
is outside this slice.

## Contract and implementation boundary

The relevant existing requirements are [QV-26-REQ-011 and the browser-storage
provision](../26-network-metadata-privacy.md), [E-KEY-STORAGE and
QV-10-REQ-020](../10-user-experience.md), and [QV-19-REQ-008](../19-client-supply-chain.md).
The implementation retains the ordinary `QVKEY1` format and its existing
`crypto.subtle` wrapping dependency. It changes no ballot verification equation,
server admission rule, public entry encoding or CSP origin permission.

`main.ts` still constructs IndexedDB storage. A `StorageSession` observes actual
storage failures and exposes a deliberate Retry browser storage / Use this page
only choice. It never silently substitutes memory. The session choice is local
to one document, reports persistence as false, starts with a separate empty
memory store, and never copies or clears inaccessible persistent data. The UI
explicitly describes the risk of losing access to page-session data and does not
claim the inaccessible store is empty. Once any ballot has started, the mode
cannot be switched in that document.

A mode switch invalidates existing key work, locks retained signers and rebuilds
board-scoped storage handles. Temporary organizer enrollment/publication signers
are tracked as well as voter keys: a late unlock is locked, a signature finishing
after invalidation is discarded, and queued signing cannot issue a later
authenticated request. This does not undo a request already sent. Old handles cannot silently begin using the new
store. Stale key creation, import and recovery installations use existing atomic
installation guards. A failed clear does not claim success or invalidate the
prior pending recovery context permanently. A successful session clear empties
only memory and says that saved browser data was not cleared.

A voter must invoke the key-file download before session continuation or ballot
preparation. The Vote route independently checks this condition, so a tab or
deep link cannot bypass the key view. Organizer setup uses the same explicit
backup-action gate. This is an observed download action, not proof that the user
saved the file safely. Key encryption, passphrase policy, KDF bounds and import
validation remain unchanged. Session unlocking does not transparently rewrap an
imported file, so the downloaded container remains the imported container.

The original durable pending-cast gate remains in front of signing and phase
checks. A page-session retry retains the existing controller only for a cast in
flight or an uncertain transport failure. Its lookup includes the board, API
election ID and read-credential context; it additionally checks the signed
manifest hash and signing identity against the current stored key. A changed
context does not inherit the retry. Leaving a ballot view drops its choices and
uses the existing randomness-discard path. Signed retry bytes remain only in
memory for the unresolved action, not in `DeviceStorage`, exported files or a
URL. A retry remains an explicit action and sends the original bytes.

Both the sealed and unresolved views expose a public ballot-code file. Signed
receipt downloads remain available when the receipt was returned, even when
receipt remembering is off. Public inclusion recovery does not manufacture a
missing signed receipt. Session recovery uses internal application navigation
instead of a full reload that would reinitialize the application. The ordinary durable
reload recovery path remains intact.

Nine normal copy entries were added in English and all five existing draft
catalogs. The guarantee strings and locale review/offer gates were not changed.
The storage notice uses the existing shell announcement regions, rather than
adding an independent live region. No budget, test, crypto capability, browser
runner or security gate was disabled.

## Verification evidence

The implementation was checkpointed with sign-off at
`df6064a0ec5e970448b2d6f4b789766b190845a0` and
`272f8097eeb8d904cf93a25fb28c209545b68b7e` before the final signer guard,
browser journey and this report were completed. The author's final checkpoint is
`b0dfbc6aff8f1a8216d7bf96b0f44de8b1c9c871`. The copy-only independent-review
correction below is a later source boundary and does not retroactively qualify
it with the author's earlier test results.

The distinguishing before-case runs the first new actual-application test
against `ba728be`'s `app.ts`, changing only its test import to that source. It
fails at the assertion that **Use this page only** is available after storage
refusal. The candidate passes that same actual-application case. The baseline
probe reports one expected failure, not a tool or harness error; its temporary
source/test files were removed. This demonstrates the missing storage
continuation, not an additional cryptographic defect.

The broader adjacent batch passed **80/80 tests, no skips**, in **50.7 seconds**.
It covers storage/session and actual-app behavior, device settings, organizer
setup, cast recovery, IndexedDB opening, split-origin routing, catalogs/lint and
mandatory browser-runner registration. It preceded the final temporary-signer
guard. The final guard/timer/affected-flow batch passed **34/34 tests, no skips**, in
**13.9 seconds**, including the actual app and organizer flows. The batches
overlap and should not be summed as unique coverage.

The final guard tests also hold an organizer during instance discovery, switch
storage, and verify that its signer is locked and **no POST occurs**. A separate
case completes a pending signature after invalidation and confirms it is
zeroed rather than returned to the request builder. Other distinguishing cases
cover switching while a key unlock is pending, refusing already stale unlocks,
refusing a storage-mode switch after ballot start, exact-byte retry through SPA
navigation with receipt saving off, changed boards/read keys/stored signing
keys, and preservation of inaccessible durable data after session clearing.

The app's active-key predicate includes both voter keys and protected temporary
organizer signers. An actual-app regression first failed because an organizer-only
key received no eight-minute warning. It now verifies the unchanged warning,
non-expiry at exactly ten minutes, and expiry at ten minutes plus one millisecond
through the interval, pointer and keyboard paths. The hidden-page policy and
all timeout values remain unchanged.

The final strict TypeScript check completed with exit 0 and no diagnostics.
Its combined scope explicitly includes `packages/web/src`,
`packages/web/test`, and `packages/web/e2e/device-settings.ts` under the existing
strict configuration and a 384 MiB heap. No full-repository typecheck was run in
this lane.

Raw task-workspace receipts:

- `quietvote-evidence/session-storage-before.log`: expected baseline refusal.
- `quietvote-evidence/session-storage-final-tests.log`: 80/80 adjacent checks.
- `quietvote-evidence/session-storage-final-guard-timer-tests.log`: 34/34 final guard/timer/flow checks.
- `quietvote-evidence/session-storage-organizer-timer-before.log`: expected failure before the organizer active-key predicate was connected.
- `quietvote-evidence/session-storage-final-source-tsc.log`: final explicit source/test/journey typecheck.

The existing mandatory `device-settings` production browser journey now denies
IndexedDB through the browser environment, uses the explicit fallback, checks
the backup gate, loses a cast response, navigates within the app, resends exact
bytes, downloads the code and receipt, and verifies that reload loses the
session key and mode choice. It remains in the mandatory nine-journey runner
with `QV_REQUIRE_BROWSER=1` and fail-on-error behavior. This new browser step has
not been executed locally in this slice: the parent task instructed workers not
to repeat the already reproduced environment-level Chromium launch failures.
A Node DOM harness does not establish native browser behavior, so hosted browser
execution remains a required qualification step.

## Bundle measurement

The exact committed input `272f8097eeb8d904cf93a25fb28c209545b68b7e` produced build
`51747191bb33`. Its aggregate JavaScript gzip size was **206,933 bytes**, an
increase of **3,800 bytes** over the **203,133-byte** `ba728be` baseline and
**2,133 bytes above** the unchanged **204,800-byte** limit. The main entry was
**105,669 bytes**, within **112,640 bytes**. `verifier.html` was **198,737 bytes**.
Exact asset measurements are retained in
`quietvote-evidence/session-storage-build-272f809.log`.

The separate packaging branch uses a shared app/module-worker build graph.
Its production/test commit is `0ae40d1ada4a9b2cac12a90ddca5d16858e86ede`; its
report commit is `157f8287b1c1044e84569623eb5dbab64f645228`. The parent measured
that packaging change on the exact `272f809` feature checkpoint: build
`ecaf632ce7c4`, **188,295 bytes** aggregate JavaScript gzip, **54,516 bytes** for
the entry file, and the same **198,737-byte** standalone verifier. Shared static
chunks also load; the entry-file figure is not the whole initial download.
The parent reports 24/24 focused packaging checks including actual emitted
module-worker sealing and the unchanged size/CSP/SRI/determinism gates.

The feature branch alone is not presented as budget-compliant. The parent will
merge the final feature source with the independent packaging branch and
measure the final combined candidate. The final signer guard came after the
quoted packaging measurement; this report does not silently assign that older
measurement to a later tree. No budget limit or message was removed to fit.

## Limits

Session-only markers are not durably saved and cannot be relied on after closing,
reloading or leaving the document. They are not a lock across tabs, devices or
later visits. An inaccessible persistent store
may already hold a pending marker; the explicit choice cannot inspect it. The
operator documentation directs users who previously submitted a ballot to use
its saved code before trying another vote. Clearing memory does not clear the
browser's inaccessible persistent store or any downloaded file.

Independent source review found that the original loss disclosure overstated
navigation's clearing effect. Browsers can preserve a document and its JavaScript
memory in the [back/forward cache](https://web.dev/articles/bfcache). The existing
`pagehide` handler only cancels verification; it does not promise destruction of
the session. The English disclosure, all five draft translations, this report
and the operator README now distinguish unavailable recovery from erasure, and
direct intentional clearing to **Clear this page session**. The actual-app
regression checks both disclosures while retaining every storage/state assertion.
No destructive navigation handler, new clearing policy or translation review
claim was added. This is a source/documentation finding; no native browser
reproduction or physical memory-erasure guarantee is claimed.

The feature preserves the existing browser crypto requirement and makes no
claim that the separate `crypto.subtle`-free requirement, Tor Browser testing,
native browser journey or overall security review has been completed.
