# Organizer time-zone input and explicit DST choices

This bounded B3-27 change wires the existing QV-13 section 9.5, REQ-092 contract into the organizer form. The requirement already specifies rejection with alternatives for nonexistent local times and an explicit offset choice for ambiguous local times; it does not need a new ambiguity policy.

## Implemented behavior

The organizer chooses an IANA zone, initially the browser's zone, and enters opening and closing wall-clock times. Resolution uses the existing `zonedLocalToUtc` helper and the browser's `Intl` time-zone data. Each valid choice displays its exact UTC instant before freezing.

- A DST gap is invalid. Suggested real local times are offered as explicit buttons; clicking one updates the input and returns keyboard focus to it.
- A fold displays both candidate offsets as native radio controls. Neither is preselected. The form refuses to freeze until the organizer chooses an offset. The selected UTC instant is shown, and keyboard focus remains on the selected offset after the preview refreshes.
- Editing a wall time or its zone discards the previous offset choice and invalidates the frozen publication preview. Invalid calendar dates and unknown zones are refused without browser-local normalization.
- The existing publisher signs only `voting_open` and `voting_close` in the existing closed manifest schema. The zone and offset choices are form state, not new signed fields.

The existing `qv.org.zoneHint` is deliberately not displayed: it promises election-zone and viewer-zone presentation that this slice does not implement. No catalog text, translation review record, manifest field or verification budget was changed.

## Distinguishing helper repair

Exposing the resolver found a separate confirmed defect in gap suggestions. The original fixed one-hour suggestions for `Pacific/Apia`, 2011-12-30 12:00, were 11:00 and 13:00 on the same nonexistent day. The preserved regression rejected the first suggestion because resolving it still produced `kind: 'gap'`.

Suggestions now reproject actual instants using the offsets on each side of the transition. This supplies real alternatives for ordinary one-hour gaps, Lord Howe's half-hour transition, and Apia's skipped day. It does not silently select an alternative or an offset.

Independent follow-up review found two further cases in the same date-resolution defect family. JavaScript's `Date.UTC` remapped years 0–99 to 1900–1999 in both wall-time construction and offset reconstruction. Both paths now use exact-year setters, with Gregorian era handling for year zero and the surrounding offset samples. No new year bound was introduced, and the organizer's invalid-calendar checks remain intact. The actual application regression now verifies that a UTC input in year `0099` previews year `0099`.

The offset helper also rounded historical second offsets: Paris at noon on 1900-01-01 incorrectly previewed 11:51:00Z instead of 11:50:39Z, and Kathmandu incorrectly previewed 06:19:00Z instead of 06:18:44Z. Resolution now retains second precision, and offset labels include seconds when needed. Gap alternatives are rounded away from the gap to a representable input minute. These were incorrect accepted-input previews; the unchanged manifest rule `created <= voting_open` already prevents publishing those historical elections with today's creation time.

## Verification

The pre-change actual-application regression failed because the time-zone control was absent. Separate before-change regressions reproduce the Apia suggestions, early-year conversion and historical second-offset failures. After the changes, **18 focused checks passed**, including:

- Actual `startApp` interaction with gaps, folds, explicit offset changes, invalid calendar/zone input and preview invalidation.
- An actual application publication attempt whose intercepted manifest has a valid coordinator signature over the exact selected UTC instants, and no `display_time_zone` or replacement timestamp fields.
- One-hour, half-hour and skipped-day transitions; exact years 0000, 0001, 0099, 0100 and 2027; a fixed-offset year boundary; historical second offsets; and the existing organizer/time/catalog logic checks.

Scoped web TypeScript, the changed browser journey's strict TypeScript check, i18n source lint and `git diff --check` also passed. The new native-browser step is in the already mandatory `e2e/device-settings.ts` journey; its registration and fail-on-error runner are preserved. That step covers a browser zone different from the selected zone, keyboard gap/offset selection, focus restoration, reset on edit, and 320 CSS-pixel reflow. Actual Chromium execution remains a hosted-CI gate because this environment's previously reproduced process-singleton socket denial prevents browser startup. No local browser pass is asserted.

Against `be098bee`, the isolated feature including exact-year/second corrections adds **1,259 gzip bytes**: the entry is **102,788 bytes** and the aggregate is **205,836 bytes**. The exact-year/second follow-up adds 85 gzip bytes to the original timezone slice. The aggregate is above the existing limit until composed with the separately coordinated lossless catalog representation optimization. Exact combined-source budget qualification belongs in the final integration receipt; neither the 200 KiB aggregate limit nor the 110 KiB entry limit is raised.

## Combined application publication check

After integrating the timezone and separate-origin branches, the actual-application
publication test runs with a distinct frontend and API origin and a board-scoped
organizer key. It verifies the selected UTC instants and manifest signature, the
returned log-origin binding, and the request signature against the API audience.
The same request signature fails verification against the page audience. All
publication requests go to the configured API. The combined date/origin/catalog
batch passes **14/14 checks** with the original bundle limits intact.

## Remaining schema and time-authority boundaries

QV-13 REQ-090/091/096's authenticated election display zone, dual-zone publication and recorded offsets still require reconciliation with QV-16 section 5.6.1's closed suite-v1 manifest. This change does not invent those fields or claim those workflows. Authenticated live time, countdown/freshness and split-origin routing remain separate lanes. The form supplies exact UTC values to the existing election-window contract.
