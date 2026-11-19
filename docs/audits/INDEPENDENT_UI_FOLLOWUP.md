# Independent UI integration follow-up

Date: 2026-11-19. This is an engineering review by a separate review agent that did
not implement the production changes under review. The reviewer supplied
distinguishing regressions and reviewed the repairs. It is not an external
security audit, a human approval, or authorization to release or deploy.

## Source identity and scope

The integrated source reviewed by this receipt is
`ba728be0140751bc77d464db32c5f9dc110dd007`, tree
`bf64cc5646a8eebc57fceae891a60d716399959b`. The reviewer independently confirmed
that head/tree in a clean worktree before the final checks. This report is an
additive receipt; `INDEPENDENT_BUILD_REVIEW.md` remains the historical review of
the earlier candidate. Later session-only storage or ACL changes are outside
this exact-source receipt and require their own integration checks.

The comparison starts at `be098bee3498ca0de742008c3067f0727862b117`. It covers the
lossless catalog representation, organizer timezone input and exact UTC
conversion, configured/fragment-selected API origins, connection caches,
encrypted-key and election-state namespaces, publication request audiences,
internal links, CORS metadata, build configuration, and Home/IPv6 compatibility.
The changed-file inventory contains additions and modifications, with no deleted
files. The narrow server recovery repair in `65b47fb` has a separate independent
review; this receipt does not substitute for it.

The seven independent split-origin regressions were committed separately as
`45d00dd17d8ddd48ff9f38a0779093e56ca054d8` and integrated by the parent as
`af23745`. They are durable repository tests:

- `packages/web/test/split-origin-ui.test.ts`: six cases drive actual `startApp`
  callbacks using a deterministic DOM/task adapter and real protocol fixtures.
- `packages/web/test/split-origin-redirect.test.ts`: native Node HTTP/fetch
  exercises redirect refusal, with a successful direct-origin positive control.

Production source was not edited in the review lane.

## Findings and their disposition

### Exact calendar and UTC previews

The reviewer independently reproduced three incorrect conversions before the
repair: year `0099` became `1999`; Paris local noon on 1900-01-01 resolved 21
seconds late; Kathmandu local noon on that date resolved 16 seconds late. A
modern Kolkata conversion passed as a positive control. The root review also
identified the small-year problem. These are preview/resolver errors: the
existing manifest condition `created <= voting_open` prevents publishing those
past windows with the current clock.

The repair uses exact-year setters and retains historical second offsets. The
unchanged independent probe changed from three failures and one positive
control to four passes on `391290f`. The five helper cases in
`organizer-timezone.test.ts` additionally cover early-year boundaries, explicit
half-hour folds, and real alternatives for one-hour, half-hour and skipped-day
gaps. The earlier fixed-one-hour Apia suggestion would still have been on a
nonexistent day; the new alternatives are reprojected from actual instants.

The actual-application tests refuse gaps, require an explicit fold choice,
reject invalid calendars/zones, reset the choice on edits, and invalidate the
frozen preview. The final integration extends the publication case to a separate
board: it reads the scoped organizer key, verifies the selected UTC fields and
coordinator signature in the intercepted manifest, and verifies request
authentication for the API origin while rejecting the page-origin audience.
No display-zone field or replacement timestamp was added to the closed manifest
schema.

### Board selection, credentials and navigation

The unchanged six-case application probe failed on the pre-split source
`391290f` and passed on integrated `32deb381`. It establishes that the same server
election ID on two allowed boards does not share a cached client, that changing
or removing the read credential causes the appropriate new client/read, and
that malformed or unallowed selectors stop before requests or stored-key reads.
It checks read-only fragments without invitation tokens, legacy same-origin key
slots, disjoint remote slots, an actual wrapped-key unlock/seal/CAST using the
original server API ID, scoped receipt storage, and refusal to reuse another
board's unlocked signer.

An early source pass found one remaining post-cast receipt link that dropped the
fragment. The author corrected it before the split-origin commit. The durable
application test checks both the successful key-to-vote link and the post-cast
receipt link. This is an integration correction within the feature, not another
independent preexisting defect family.

The native redirect probe observed the earlier client follow a 302 and forward
its dummy `QV-Read-Key` to the redirect target. The new client refuses the
redirect and the target receives no request. This is an added transport
boundary; no previous redirect-refusal guarantee is asserted. Native Node fetch
evidence does not establish browser CORS enforcement.

### Origin and Home compatibility

The new validator initially rejected canonical IPv6 page origins before Home
rendered. The root and this reviewer independently identified that regression.
The follow-up preserves same-origin HTTPS IPv6 and HTTP `[::1]` identities and
their historical storage, while continuing to reject literal IPv6 entries in
the external CSP origin list. The existing CSP `'self'` permission is sufficient
for the same-origin path; the repair does not add an external permission.

Home now uses the existing exact route parser for current 32-character hex and
legacy 26-character base32 IDs. It preserves the fragment for relative or
same-frontend absolute election addresses. Foreign frontend origins, URL
credentials and unsupported routes are refused. This does not infer a board
from a pasted foreign URL.

Two old security assertions still expected malformed board escapes to be ignored
and path-bearing origins to be normalized. They failed on `32deb381`. The
follow-up retains those negative inputs and changes their expectations to
refusal; actual `startApp` tests preserve the original route-survival concern by
requiring an error view without a request or key lookup. No negative case was
removed to obtain a passing result.

## Build and policy review

The emitted catalog representation preserves source strings, parsed formatting
semantics, missing-key slots and review metadata. Focused tests execute emitted
formatters for every catalog message, including quoted literals. All five draft
catalogs remain in their chunks and remain unoffered without the existing
reviews. The optimization does not introduce runtime parsing or `eval`.

The build configuration supplies the same finite origin list to runtime metadata
and both generated CSP policies, includes the default API explicitly, and binds
configuration into the build identity. Source inspection preserves the aggregate
200 KiB, entry 110 KiB and standalone-verifier 400 KiB gates, SRI/preload checks,
the worker boundary, and the verifier's network-disabled policy. The external
list remains bounded at 16 origins. Operator documentation correctly requires a
separate static host to apply generated headers; the reference API server's
built-in static route retains its own same-origin header CSP.

Fresh `npm ci --ignore-scripts` and `npm run vendor:install` completed in this
review worktree before the follow-up. The package manifests and lockfile did not
change in the reviewed delta. The execution environment is Node 24.22.3 and npm
11.9.0.

## Execution receipts for the reviewed source

These rows concern the exact head/tree above, not earlier successful
revisions.

| Check | Result |
| --- | --- |
| Scoped web TypeScript, `tsc -p packages/web/tsconfig.json --noEmit` | Passed, exit 0, no diagnostics, 256 MiB Node heap limit. |
| Explicit changed-browser TypeScript | Passed, exit 0, no diagnostics, 256 MiB limit. Temporary config extends `tsconfig.base.json` and explicitly includes `e2e/device-settings.ts` and `e2e/split-origin.ts`, with the checkout's Node type root. |
| Focused application/configuration/catalog/CORS/runner checks | Passed 63/63, exit 0, zero failures, cancellations or skips. Files ran serially with `--test-concurrency=1`. |
| Malformed-fragment security compatibility checks | Passed 2/2, exit 0, no skips, selected with `--test-name-pattern='WV-3:|invite fragment: only'` in `security.test.ts`. |
| Repeated production CLI builds | Both completed with exit 0 after the documented disk-space repair. All 15 output files have identical names and bytes across the default output and a separate repeat directory. |
| Manifest and HTML integrity comparison | Every emitted asset matches the manifest's SHA-256, SHA-384 and size; every HTML SRI reference matches its actual bytes. Default deployment metadata matches the same-origin configuration. |

The 63-case batch consists of `run-browser-journeys.test.mjs`,
`split-origin-cors.test.ts`, and the web tests `precompile`, `app-precompile`,
`lazy`, `home-origin-ui`, `split-origin`, `split-origin-ui`,
`split-origin-redirect`, `organizer-timezone`, `organizer-timezone-ui`,
`publish-ui`, and `ui-logic`. Thus the durable seven independent cases and the
root's separate-board/timezone publication integration case were executed again
on this exact source, as were the Home/IPv6 and repaired security contracts.

### Measured production output

Both CLI builds identify their output as **`e5d8522123ff`**.

| Output | Measured bytes | Existing limit | Remaining bytes |
| --- | ---: | ---: | ---: |
| All application/chunk/sealing-worker JavaScript, gzip | 203,133 | 204,800 | 1,667 |
| Entry module, gzip | 103,457 | 112,640 | 9,183 |
| Standalone verifier HTML, uncompressed | 197,449 | 409,600 | 212,151 |

The existing strict size assertions pass. These values include all emitted
JavaScript assets, including the unoffered catalogs and sealing worker; they do
not substitute entry size for the aggregate budget.

The sealing worker remains byte-identical to the historical candidate, with
SHA-256 `f2d2c87e8f1d89ef7f0bd8b902ec1578c76e3fd39be5217ef29270a15eb41a5e`.
The standalone verifier also remains byte-identical, with SHA-256
`9338d967e5b156ecd9681a3d56bfb8d466b503ba3de75922711151e0ed1ec9ca`.
The default generated `_headers` is byte-identical to that baseline as well.

For historical comparison only, catalog commit `d86a89d` passed 14 focused tests
and produced build `8ff1d4c1b86d` at 200,936 aggregate gzip bytes and 101,260 entry
bytes. The seal worker and standalone verifier were byte-identical to the earlier
candidate. That intermediate size is not a measurement of the final source.
The unchanged six application probes plus native redirect case passed 7/7 on
`32deb381`; their durable adaptation also passed 7/7 before being committed.

## Qualification limits

The execution environment temporarily became unavailable twice during this
review. Interrupted or empty-output sessions were not counted as successful;
the worktree head/tree was rechecked after recovery. The first pair of CLI build
attempts subsequently failed with `ENOSPC` while creating output directories.
The parent removed disposable dependency trees from completed worktrees,
preserving source, historical build output and evidence. A fresh filesystem
check showed 610 MiB available before the two successful builds. The failed
attempts remain recorded as infrastructure failures; they are not counted as
successful builds. These interruptions did not leave a scoped check pending in
the completed table above.

No full-repository local TypeScript pass is asserted. Repeating equivalent
resource-failing full checks was avoided; the required hosted check must qualify
the new candidate. No native browser pass is inferred from the previously
observed Chromium `EPERM`/`SIGABRT` startup failure or from DOM-adapter tests.
The required runner retains all prior journeys and adds split-origin as the
ninth, with tests requiring missing tooling and journey failures to fail the
runner. New-head hosted browser execution remains necessary for actual CORS,
IndexedDB, keyboard/focus, layout and end-to-end deployment behavior.

This engineering receipt does not complete external security review, native
translation review, manual accessibility assessment, operational qualification,
or formal release approval.
