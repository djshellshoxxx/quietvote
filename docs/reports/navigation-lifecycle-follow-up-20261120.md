# Navigation lifecycle follow-up and second bug-hunt handoff

Date: November 20, 2026. This is an engineering review and repair, not a formal
security approval or native-browser qualification.

## Source boundary and consolidation

The fresh bug-hunt worker first reviewed predecessor
`ec7f99faae5c626a424941fd9dce728094d7e5ab`, independently exercised its same-document
navigation deduplication, and found a separate form-cleanup defect. While that
review was running, the published candidate advanced to
`8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab`. This follow-up is based on that newer
candidate and preserves its clearing-confirmation implementation and synchronous
retirement of invalidated controls. The two unique changes are:

1. Bring forward the predecessor's same-URL `hashchange` deduplication. Every
   `popstate` still routes; an actual changed URL still routes, including while an
   earlier route is awaiting its response.
2. Invoke the retiring view's existing `keyLock` cleanup callback before the router
   discards that callback. This clears obsolete voter, admin and organizer
   passphrase fields without locking the active voter signer needed on the next
   voting screen.

Final application blob: `e8b938fe49aef8f493e382564b060a280082403e`.
Final split-origin regression blob: `35d1615db2bfdee3a68725be63a42d00d8343505`.
Both are Git blob IDs produced by `git hash-object` for the tested files.

The source changes are confined to
[the application router](../../packages/web/src/ui/app.ts) and
[its existing application-level test harness](../../packages/web/test/split-origin-ui.test.ts).
CLI, server, trustee, native browser journeys, native assertions and their timeouts
are unchanged from `8b7aa03`.

## Confirmed behavior

### Duplicate native event notifications can erase newly entered input

On the published candidate, a `popstate` followed by a delayed `hashchange` for the
same URL rebuilt an already rendered key form. A passphrase entered between the
events disappeared. The inherited regression delivers those events separately,
checks the form identity and entered value, and then unlocks the key successfully.

The two new independent history cases additionally exercise back/forward between
different boards, the selected board's key-storage scope, repeated queued hash
notifications, and a changed hash while an older metadata response is held. The
latest address remains authoritative after that old response completes. Duplicate
notifications do not issue extra reads or replace the live key form. No defect was
found in the predecessor's deduplication boundary under these exercised cases.

### Retired passphrase fields were detached without cleanup

The router previously assigned `keyLock = undefined` without first invoking it.
The old password input stopped being visible, but its `.value` still held the
entered passphrase and the application had discarded the cleanup callback. Three
new regressions keep a reference to the actual retired field, navigate away from
voter-key, admin and organizer-create views, and require its value to be empty
synchronously.

The repair runs the existing view cleanup after invalidating the route epoch and
before detaching the form. The voter view's callback also invalidates its pending
work and clears its existing recovery/file controls. This change does not call
the global signer lock or discard ballot retry custody. The existing key-to-vote,
session backup, pending retry and late receipt paths were exercised below.

This establishes explicit UI-field cleanup. It does not establish erasure of every
copy of a JavaScript string or protection from script already executing in the
page. Relevant existing requirements are
[QV-19-REQ-008/009 and split-origin QV-19-REQ-022](../19-client-supply-chain.md), and
[retry preservation QV-10-REQ-020](../10-user-experience.md).

## Verification record

All executions used Node 24.22.3. No timeout or assertion was weakened.

- Before the repair, byte-exact `8b7aa03` application source with the final six
  distinguishing tests produced **0/6 passes**, exit 1. The paired-event case,
  back/forward queued-event case and held-response case all observed a replacement
  form; all three retiring-field cases observed their canary still present.
- On the final application source, the unchanged six cases all passed within the
  affected application batch. The serial batch covered `split-origin-ui`,
  `session-storage-ui`, `admin-ui` and `organizer-timezone-ui` under
  `packages/web/test/*.test.ts`, using
  `node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec`.
  It finished **37/38 passes**, exit 1, in 56.701 seconds, with no skips or
  cancellations. All six new cases, clear confirmations, successful key-to-vote,
  exact retry preservation and late receipt handoff cases passed.
- The one failed case was the existing separate-board organizer publication test:
  its `until()` helper exhausted 2,000 `setImmediate` turns waiting for the prepared
  publication at `organizer-timezone-ui.test.ts:182`. The exact unchanged test file
  immediately passed **2/2**, exit 0, in 2.216 seconds in isolation. That rerun does
  not turn the earlier batch into a clean run, and its count must not be added to
  the overlapping batch. Current-source hosted checking remains necessary to
  resolve the intermittent wait result.
- Earlier exploration on the predecessor source produced three failing retired
  field cases before repair and passed those same cases after repair; its affected
  batch passed **36/36**. These are predecessor-source results, not a substitute
  for the final-source record above.
- A scoped strict TypeScript check, capped at 512 MB and including the application
  and regression file with their imports, initially was killed with exit 137
  without diagnostics. The concurrent i18n checker was also killed with exit 137.
  Running each checker separately resolved those resource failures: the same
  scoped strict TypeScript check passed, exit 0, with no diagnostics, and i18n
  checking passed. Full repository typechecking was not attempted in this lane.
- The production build passed, exit 0, with build ID `87f8ae9f0bd9`, at 184.8 KiB
  aggregate JavaScript gzip within the unchanged 200 KiB ceiling. The standalone
  verifier is 194.2 KiB raw.
- Vendor verification passed for two pinned packages and 132 verbatim files. The
  relative-link check found no broken links among 2,103 links in 338 files.
  `git diff --check` passed.

## Fresh-worker handoff

Review this small delta independently on the composed candidate, especially that
view cleanup leaves the unlocked voter signer available to the next screen and
does not release pending ballot bytes. Run the unchanged required native browser
journeys on a supported browser, including device settings, same-document
enrollment completion, back/forward and queued-event behavior. The prior worker's
native attempt failed before assertions because Chromium could not create its
process-singleton socket; no native-browser success is claimed here. Resolve the
existing organizer publication wait on current-source CI without weakening the
native waits. Run the full current-source strict typecheck on the composed candidate;
the focused typecheck and i18n results above cover this lane's source only.
