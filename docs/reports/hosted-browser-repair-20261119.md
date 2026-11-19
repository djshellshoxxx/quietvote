# Hosted browser and UI integration repair

This repair is based on `94efba2b43991e27bbf9191621c646c1d01859de`, the report-only
successor of the tested local composition `cde2db2`. It investigates the web
unit, split-origin journey and pseudo-locale visual failures reported for
published candidate `bcd4115`. Earlier hosted results do not qualify this new
source.

The fixture repair is committed at
`4ba620716d3d2a18b394351f92756bbf78fe4598`. The production repair and its
regressions are committed at
`4929153190c9dce4f9d7d51a0d27d63797316c06`, tree
`5d153e6cf2c7e0c4ad82b32cbfa3fed93af4de23`. Both commits carry DCO sign-off.
The original session-storage branch and its `b0dfbc6` checkpoint are preserved.
The cache-freshness follow-up is committed with sign-off at
`826a08d8e4c9cd5c4dc60c5635b3226460ece8c7`, tree
`15ea644bffd12d30ef502961a7f52ef0337c08a3`. Its separate receipts are recorded
below; the earlier receipts remain tied to the source they tested.
The final metadata-refusal follow-up is committed with sign-off at
`d5435026d6b8c68ff8bf5d4edd76e645ef919724`, tree
`44982f388a0d101ae5c5b2acc44ecfff8f680672`, with its own receipts below.

## Findings and changes

### Author-pin test location fixture

The hosted unit test failed during module startup, before any author-pin
assertion, because its hand-written `location` object omitted `origin`.
`startApp` passes the native page origin to the deployment policy, and the
fixture supplied `undefined`. The unchanged test reproduces the same
`safeBoardOrigin` TypeError on local Node 24.22.3.

The fixture now uses a `URL` object for its existing HTTPS address. Its origin,
path, search, fragment and full address remain consistent as the test navigates.
All assertions about trusted author pins, stale reads, navigation and live
result replacement remain in place. This is a fixture repair, not a production
origin-policy relaxation.

### Pseudo-locale visual origin

The route-fulfilled visual fixture used `http://quietvote.test`. The deployment
policy rejects that non-loopback, non-onion HTTP origin during `startApp`, before
the main heading exists. This explains the source-level startup path behind
the hosted `main h1` timeout. The fixture now uses `https://quietvote.test`;
Playwright still fulfills the same HTML, JavaScript and styles locally.

The first heading wait now reports collected uncaught page errors if startup
fails, rather than hiding them behind only a locator timeout. The existing
language, direction, stored preference, viewport, navigation, request-origin
and uncaught-error assertions are retained. No wait or timeout is increased.
Native visual execution on this source remains pending hosted CI.

### Enrollment becoming a verified election in the same page

The split-origin journey's second navigation changes only the fragment on the
same election key route: it removes the invitation token after the fixture
finishes the ceremony. That retains the existing application document.
The controller had two related enrollment-transition defects:

- Without a completed live refresh, `load` returned the cached draft even
  though it had no verified election context. Removing the invitation then
  displayed the unavailable-manifest view instead of the key form.
- A successful live refresh set `Loaded.ctx` directly. The original load had
  no manifest with which to bind the server's log identity, so the receipt key
  remained all zeroes. The same path also allowed a newly derived context to
  reach the key view without comparing the server's original log key and
  origin to the signed manifest.

The application now keeps the original public server log claims and applies
one `bindServerLog` helper during both initial loading and the synchronous live
change callback. A live context is bound before the view is repainted. A
mismatch removes the usable context and retains the existing diagnostic; the
application does not silently replace a mismatched claim with the manifest's
key. Cached drafts without a bound context are refreshed on the next route,
and their old live stream is closed before its snapshot is replaced.

The existing storage-generation and route-epoch checks, board/read-key cache
scope, signed manifest checks and receipt verification stay in place. The
browser journey still changes only the fragment and now explicitly asserts
that `page.goto` returns `null` for that same-document navigation. A forced
reload is not the repair.

A separate real-HTTP probe repeated the journey's registration, manifest,
ceremony, opening and read-key database transition with `World` and the real
`ApiClient`. It read all 21 log entries through the selected board origin,
derived the open context, verified its log binding and rejected a wrong read
key with HTTP 403. The read-key hash and access gate were not the cause of the
missing form.

These are two test-fixture corrections and one enrollment-lifecycle repair
with two observed state-handling failures. The evidence does not establish
acceptance of a forged receipt: the positive cast regression instead shows
that the old unbound key prevented a valid recorded receipt from receiving
the successful UI outcome.

## Distinguishing regressions

The actual-application tests run `startApp` against the existing deterministic
DOM adapter and signed protocol simulation. They are not native browser
qualification. The first before-case run retained the six existing split
routing/storage/cast successes and failed all three newly added cases: delayed
live hints, live completion followed by a real unlock/seal/cast, and a
mismatched server log key. A symmetric mismatched-origin case was then added.

The final transition cases verify:

1. A draft refreshes when its invitation is removed through `hashchange`, even
   when live hints have not arrived, and the scoped key form becomes usable
   without a reload.
2. A live-derived context leads through real wrapped-key unlocking, ballot
   sealing and a signed receipt to the recorded-vote message.
3. A server log key that disagrees with the signed manifest cannot expose the
   key form after live derivation.
4. The same refusal holds for a mismatched log origin.

The final focused command on `4929153` passed **24/24 tests, zero failures,
skips or cancellations**, in **14.9 seconds**:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/web/test/author-pins-ui-fresh-review.test.ts \
  packages/web/test/split-origin-ui.test.ts \
  packages/web/test/live-lifecycle.test.ts \
  packages/web/test/home-origin-ui.test.ts \
  .github/scripts/run-browser-journeys.test.mjs
```

This includes the original author-pin, board/read-key isolation and cast
assertions; stale live-refresh guards; Home and IPv6 compatibility; and the
nine-journey runner's required-tooling and failure-propagation checks.
The earlier 21-case run overlaps this batch and is not additional unique
coverage.

The strict TypeScript check completed with exit 0 and no diagnostics under a
384 MiB heap. Its explicit scope extends the repository's strict options and
includes `packages/web/src`, `packages/web/test`, and
`packages/web/e2e/split-origin.ts`. The temporary scope file was removed.

The unchanged `packages/web/test/app-precompile.test.ts` passed **2/2 tests**.
It compiles the production app and sealing-worker graph twice, requires
byte-identical output, checks complete catalog parity and retains the aggregate
JavaScript gzip limit below **204,800 bytes** and entry-file limit below
**112,640 bytes**. These are the existing limits, not newly measured file sizes.
No message, catalog, worker or assertion was removed to fit.

The pseudo-locale module passed `node --check`. A separate Node probe called
the actual `startApp` with the old HTTP origin and confirmed refusal before
any DOM startup, then read the repaired fixture origin from the visual script
and confirmed that the unchanged deployment policy permits it. This probe
does not execute Playwright or establish visual layout.

## Follow-up: overlapping draft loads

Independent engineering review identified another concrete cache-publication
race on `4929153`. Two routes could refresh the same cached draft. If the newer
response completed first, it installed a ready context and started its live
stream. The older response could then replace that cache entry after its
route was obsolete. Its caller correctly refused to render, but the cache
write had already happened. A later route unnecessarily refreshed again, and
`stopLive` could no longer find the displaced active stream in the map.

The independent actual-application regression holds two real adapter responses
for the same board, election and read credential. The first captures an empty
draft; the second captures a complete signed election. It releases them in
reverse order and observes the AbortSignals of actual `LiveElection.start`
requests. Before the fix it reports one expected assertion failure, with no
skips or cancellations:

| Observation | Required | Before repair |
|---|---:|---:|
| Extra metadata reads after the newer context is ready | 0 | 1 |
| Total streams, including the original draft | 2 | 3 |
| Streams still open after leaving the election | 0 | 1 |

`load` has one caller, `electionView`, whose existing route epoch identifies
each request. The caller now passes that epoch explicitly, and `load` publishes
its cache entry only while the epoch remains current. The existing
storage-generation refusal and caller's post-await route guard remain. Already
bound cache entries are reused as before. This adds no read-credential token
map and does not broaden cache invalidation.

The regression is retained as
`packages/web/test/live-draft-refresh-ui.test.ts`. Its test body is byte-for-byte
identical to the preserved independent probe. Strict checking found one unused
`main` helper in the copied DOM adapter; only that helper was removed, outside
the test body. The body SHA-256 is
`f0c48fa69d61fccad84d8b255074817193b29caa58dad8266b37fd41a8d2d012`.

The affected four-file command passed **17/17 tests**, with no failures, skips
or cancellations, in **18.5 seconds**:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/web/test/live-draft-refresh-ui.test.ts \
  packages/web/test/split-origin-ui.test.ts \
  packages/web/test/author-pins-ui-fresh-review.test.ts \
  packages/web/test/live-lifecycle.test.ts
```

After removing the unused adapter helper, the unchanged distinguishing test
was rerun by itself and passed **1/1**, reproducing the required `{0, 2, 0}`
observations. Strict checking of `packages/web/src` and that test completed
with exit 0 and no diagnostics under the same 384 MiB heap limit. The unchanged
app build, determinism, catalog parity and budget tests again passed **2/2**.
The temporary TypeScript scope file was removed. These batches overlap the
earlier checks and are not an additive unique-test total.

This follow-up covers the cache write shared by initial loads and draft
refreshes; the distinguishing regression specifically exercises overlapping
cached-draft refreshes. It does not add native browser qualification.

## Follow-up: omitted server log key

Independent engineering review found an exception-safety edge in the live
binding callback on `826a08d8`. A draft summary without `log_pk` supplied
`undefined` to the base64url decoder. That decoder could throw before its
internal catch. `LiveElection` had already assigned the new context and caught
the callback exception, leaving the unbound context available to a later
route. The ordinary initial ready-election load instead reached the router's
refusal path.

The independent actual-application probe confirmed the distinction: enrollment
with the omitted field was followed by live derivation and removal of the
invitation through `hashchange`. The pre-fix run failed one refusal assertion
because **Unlock key** remained available once, instead of being absent. It
reported one expected failure with no skips or cancellations.

`bindContext` now removes the usable context before attempting any binding.
`bindServerLog` accepts the untrusted server key value as `unknown`, checks that
it is a string before decoding, and returns the existing log-key refusal for
missing or non-string values. The context is restored only after successful
binding. This preserves normal pre-manifest enrollment, valid live completion,
the key/origin mismatch checks and the route-epoch cache guard.

The independent test body is retained unchanged in
`packages/web/test/split-origin-ui.test.ts`, with SHA-256
`f2dfee470fd2d4e9db161fa885d0d6cc107cede40a96aa74521bd68d9a03e7d1`.
It also verifies the diagnostic and absence of an additional POST. The existing
WV-4 boundary test now checks that omitted and null log keys return the same
refusal as a mismatched key, without relying on an exception.

The final five-file batch passed **27/27 tests**, with no failures, skips or
cancellations, in **20.4 seconds**:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/web/test/split-origin-ui.test.ts \
  packages/web/test/live-draft-refresh-ui.test.ts \
  packages/web/test/author-pins-ui-fresh-review.test.ts \
  packages/web/test/live-lifecycle.test.ts \
  packages/web/test/security.test.ts
```

Strict checking of web source/tests and the explicit split-origin journey
completed with exit 0 and no diagnostics under the 384 MiB heap limit. The
unchanged app build, determinism, catalog parity and size gates passed **2/2**.
The temporary scope file was removed. This is a narrow refusal follow-up to
the enrollment binding; these overlapping checks do not represent a broader
audit or a new native browser qualification.

## Evidence and qualification boundary

The retained hosted evidence files are
`second-publication-job-135510589532.log`,
`second-publication-job-135510589502.log` and
`second-publication-job-135510588300.log`. Local evidence includes
`hosted-browser-author-pins-before.log`,
`hosted-browser-enrollment-before.log`,
`hosted-split-read-key-probe.mjs`,
`hosted-split-read-key-probe.log`, and
`hosted-browser-repair-final-tests.log`,
`hosted-browser-repair-typecheck.log`,
`hosted-browser-repair-build-gates.log`, and
`hosted-browser-visual-origin-probe.log` in the integration evidence directory.
The typecheck log is empty because the successful command emitted no
diagnostics. `git diff --check` passed on the completed changes.

The follow-up evidence is retained as
`independent-live-draft-refresh-probe.source.txt`,
`live-draft-refresh-independent-before.log`,
`hosted-browser-draft-race-followup.log`,
`hosted-browser-draft-race-final-probe.log`,
`hosted-browser-draft-race-test-identity.log`,
`hosted-browser-draft-race-typecheck.log`, and
`hosted-browser-draft-race-build-gates.log` in the same evidence directory.

The final metadata-refusal evidence is retained as
`independent-live-missing-log-key-probe.source.txt`,
`live-missing-log-key-independent-before.log`,
`hosted-browser-missing-log-key-followup.log`,
`hosted-browser-missing-log-key-test-identity.log`,
`hosted-browser-missing-log-key-typecheck.log`, and
`hosted-browser-missing-log-key-build-gates.log`.

No local Chromium launch was attempted in this lane because the already
reproduced environment failure occurs before browser assertions. The new
source must pass the mandatory hosted split-origin journey and the native
pseudo-locale visual workflow. Node DOM, HTTP and source checks do not prove
browser CORS, IndexedDB, layout or same-document navigation behavior. No
workflow bypass, skipped journey, timeout increase, deployment, release or
remote publication is part of this repair.
