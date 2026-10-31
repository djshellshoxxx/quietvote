# @quietvote/web notes

Framework-free TypeScript SPA (QV-19). `npm run build -w @quietvote/web` -> `dist/` (hashed assets, SRI, CSP meta + `_headers`,
`asset-manifest.json`, offline `verifier.html`). `npm run e2e -w @quietvote/web` uses the pinned Playwright development dependency and supported shared loader against `test/helpers/fake-board.ts`. Set `QV_REQUIRE_BROWSER=1` to fail on unavailable tooling, as CI does; only optional local runs may skip. Browser checks are separate from `npm test`.

## Current audit consolidation (2026-10-30)

This section supersedes older gap/status statements in the implementation history below. The original B1/B2/B3 reports
remain evidence of the audited revision, not claims that the current tree has passed an independent audit.

* Results now run the shared protocol verifier on the exact loaded record snapshot, the derived manifest hash and the full
  paginated voter list. Counts/charts are drawn only after aggregate, decryption and result-rule checks pass. Signed but false
  coordinator counts are hidden. The itemized report and caveats are visible: board/witness/receipt evidence is not supplied
  by this in-page path, so those checks remain not run. An independent verifier/client and an outside Election ID still matter.
* Both verifier UIs make an outside Election-ID mismatch a visible failure. The English PASS headline is “Supplied checks
  passed”; not-run checks and caveats remain explicit. Protocol report verdict rules are unchanged. Both file inputs reject
  more than 64 MiB before reading. The offline verifier remains on the main thread without a worker pool/progress/resume.
* The build pins transitive **static** app imports with integrity modulepreloads. Lazy catalog/chart chunks and the module
  worker still lack SRI. Unreviewed/unoffered catalogs are not preloaded. The common generated CSP permits only the exact
  offline inline script/style hashes, and the verifier route adds its closed offline policy; simultaneous matching policies
  work. The app's strict meta policy continues to reject inline script/style. The server independently recomputes the
  offline file's hashes and recognizes only this closed policy before serving its route exception.
* Vote entry rereads the signed record before deriving the next supersedes link. Concurrent cast calls share one submission.
  Signed promise-only receipts remain downloadable and optionally stored for inclusion checks; unknown delivery retries the
  same signed bytes with pending copy. A local save failure preserves the verified recorded receipt. “Logged” uses the signed
  promise timestamp. Rejected links no longer claim a newer ballot was recorded; refused ballots do not show receipt proof.
* No-invite key completion checks the committed voter list rather than claiming registration. A 409 is not registration
  success. **Registration remains blocked pending protocol-owner review:** QV-19/QV-04 and QV-09 disagree on invitation/PoP
  bytes; this change does not reconcile them. The existing server-contract negative evidence remains relevant.
* Backup/recovery actions are available after later unlock and before registration, so a failed registration does not hide
  the backup. Recovery-code restore is wired. Mandatory backup restore-check/enrolment gating is still absent; the new
  backup/recovery UI needs its own full browser journey. Clear actions require native-dialog confirmation. Idle lock warns,
  visibly removes active seal/send controls, clears displayed key secrets and prevents sealing with a locked signer. Hidden
  duration is checked before reset on resume. Actual suspended-tab behavior across browsers/devices remains unverified.
* Read-only rules and proof-gated results work when IndexedDB opening fails. This does not introduce memory-only voting or
  claim WebCrypto-free key wrapping. Confirmation is bound to the manifest hash. Route epochs discard stale asynchronous
  views/redraws. Unlock autocomplete, malformed-key copy, fast-device rewrap, prototype-named selectors and the duplicate
  shared Help link have focused fixes. Send/Test share their primary style and equal width/minimum height; an exact browser
  dimension assertion remains to be added.
* Final review adds unconditional wiping of the unwrapped seed when an upgrade KDF or storage write fails, and rechecks
  the result snapshot after lazy chart import. The production regression delivers a real SSE reread while holding the chart
  HTTP response; a newly appended conflicting signed tally must fail before any table is drawn. Both regressions failed
  before these fixes and pass afterward.
* Paused-state machine reasons/copy, normative one-ballot guarantee wording and web/CLI passphrase normalization remain owner
  review gates. Existing normal English error/verifier wording was corrected; no guarantee string/review hash was changed,
  no translation was endorsed, and every draft locale remains unoffered. Draft normal-string wording needs review against
  the changed English source before release.

Browser tooling is a pinned root dev dependency in CI, with supported managed/legacy installation fallbacks in
`e2e/browser.ts`; `QV_CHROMIUM` selects a binary and `QV_REQUIRE_BROWSER=1` fails when tools cannot run. Production browser
checks use actual served pages/CSP, not request-routing interception. Current successful receipts: app 12/12, production Help 64/64,
ordinary accessibility heuristics 49/49, and verifier 16/16 (generated policies, actual reference-server static serving, honest/forged
results, anchor mismatch, skipped evidence, static-chunk tamper, stale navigation, blocked IndexedDB and file bounds).
The final package unit suite passed 186/186, including local-save-failure and final-review seed cleanup regressions.
The final consolidated validation record at its recorded commit supersedes these package receipts.

These automated checks are **not WCAG conformance**, security certification, manual assistive-technology testing, Tor/mobile
acceptance or a release/reproducibility/signing claim. Announcement truncation/extra live regions, organizer invite-link UX,
remaining unwired flows, KDF ceiling costs and chart/banner semantics still need work. See the consolidated B3 ledger for
per-finding evidence and review gates.

## Historical implementation record

## Layout
`src/flow` (state machines, controllers, election derivation, receipts, receipt standing, live refresh, chart model, organizer logic), `src/net` (SSE client), `src/key` (QVKEY1, passphrase, signer,
lock, storage), `src/api`, `src/i18n` (ICU subset, catalog, locales), `src/ui` (DOM views), `src/build`, `src/verifier`, `src/worker`.
All logic is node-testable; `src/ui` and `main.ts` are covered by the e2e only. `COPY.md` is generated from the catalog.

## Ordinary Help and navigation changes (2026-10-24)
* Help now exposes the existing catalog's Colour theme selector (Follow my device, Light, Dark). Explicit themes set
  `data-theme`; automatic removes it and follows the device. Native controls use the matching `color-scheme`.
* Theme and High contrast controls read their current document attributes when Help is revisited. Contrast overrides
  the chosen palette while enabled. Preferences last for this page session; a full reload restores device defaults.
* Internal links use SPA routing only for unmodified primary clicks. Modified/non-primary/already-cancelled clicks
  retain browser behavior. `test/navigation.test.ts` covers the click predicate.
* `node packages/web/e2e/help.ts` is a separate Help/Home-only smoke runner with empty in-memory storage. It checks
  display controls, computed palettes, navigation and focus in light/dark device modes. `QV_CHROMIUM` selects the binary.
  **Not verified in the saved environment:** Chromium returned no DOM; a minimal static-page diagnostic also timed out
  (DBus/font/runtime errors were reported; root cause not established). This is no browser or accessibility acceptance.
* Fresh checks on this work: repository typecheck, the smoke runner's separate TypeScript check, 22 focused
  copy/catalog/chart/navigation tests and the web build passed. The full election/verifier browser suite was not run.
  No locale messages, guarantee strings or review records were edited. Draft translations remain unoffered.

### Ordinary continuation
* Existing global and election-tab links now expose `aria-current="page"` and a weight/underline treatment for the
  current route. Matching uses the existing route parser; trailing slashes and the overview alias are equivalent.
* The existing step indicator is a native ordered list with one `aria-current="step"` item and localized progress
  label. This changes presentation only; it does not create step routes or alter state transitions.
* Election page titles include the already-loaded election name (QV-13 C-SHELL). The footer includes the specified
  source-code repository link using the existing catalog label (QV-10 section 5.3).
* README links the expanded contributor/reviewer translation checklist. Per-locale style and terminology decisions
  remain pending qualified human review; no catalogs, review gates or guarantee copy changed.
* The original failed browser evidence above still applies. Chromium was not rerun in this continuation: no materially
  different supported ordinary-browser path was identified. See `docs/handoffs/2026-10-24-ordinary-inventory.md`
  for requirement status and evidence, including incomplete items. No browser/AT or security acceptance is implied.

### Catalog extraction and literal-copy lint
* `npm run i18n:check -w @quietvote/web` validates English entry metadata/ICU, checks static catalog references, and
  flags ordinary DOM text, titles, field hints, copy attributes and literal/translation concatenation in the bounded UI
  scan. The web test script runs it before unit tests. `i18n:extract` (or the CLI's `--json`) emits catalog metadata,
  static/dynamic references, findings and explicit exclusions as JSON. TypeScript is existing build-time tooling only.
* Scope: `main.ts`, `ui/app.ts`, `ui/dom.ts`, `ui/charts.ts`; `verifyView` and standalone verifier files are excluded
  under this task's restrictions. Dynamic translator expressions are reported, not claimed statically resolved. This is
  a scoped REQ-060/061 check, not proof that every string in the repository has been extracted.
* The seven reported ordinary literals (four document titles, browser fallback, organizer field label/hint) now use
  source IDs. The existing invalid-date detail and initial app HTML copy also use catalog text. English wording,
  routing, authority and validation behavior are preserved. New es/fr/de/pt-BR/ar entries are machine drafts, unreviewed
  and unoffered. Spanish `Error` is an explicit cognate for the new title, not an untranslated placeholder.

### Ordinary app ICU precompilation
* The app-only esbuild plugin parses English and all five draft tables at build time. Exact plain-text messages use
  direct string formatters; ICU/quote-normalized messages use build-emitted AST formatter wrappers with the existing
  evaluator. The emitted ordinary app has no ICU parser or eval/Function fallback. Source/test `index.ts` and `icu.ts`
  are unchanged, and the plugin is not attached to the standalone verifier build.
* Lazy catalogs register their build-compiled formatters only when imported. Existing offer/review gates and source
  lookup/fallback rules are unchanged. Runtime-created messages must have a formatter included at build time; arbitrary
  string compilation is intentionally absent from the app path. No translated locale is newly offered.
* Fixture tests execute emitted ESM and compare all 487 messages in all six catalogs against source formatting, plus
  fallback/missing-message, plural/select, bidi, malformed ICU and canonical module-resolution cases. App-only tests
  verify repeated output bytes, parser-marker absence and the existing gzip limits. CLI tests verify JSON, cwd and errors.
* Fresh combined evidence: typecheck, scoped i18n check, 42 focused tests and build passed. Build `335206de1931` is
  190.1 KiB gzip for all JS, 92.9 KiB for the entry, below unchanged 200/110 KiB test limits. Browser/AT/contrast/RTL
  acceptance remains unverified. Full security suites and the excluded browser-verifier tranche were not run.

## Decisions and deviations
* Added `argon2idKdf*` to `packages/crypto` (the only `@noble` importer). Web depends on workspace crypto/protocol/board; esbuild 0.28.2 pinned (dev).
* Voter-facing copy follows the plain-language rules (<= 20 words/sentence, banned jargon; `test/copy.test.ts`). Normative QV-10 section 7
  guarantee strings are kept verbatim except: `qv.privacy.g2` uses `{trustee_names, list}`; `qv.audit.public` follows QV-ADR-020
  (spoil is posted, its reveal stays private unless the voter opts in), so it differs from QV-10 wording. They sit under "More details".
* Registration: `invite_code` carries SHA-256(token) (QV-19-REQ-010) and the PoP signs (election id, SHA-256(token), pk) under `QV-REG-v1`
  (QV-19 over QV-09 wording). Passphrase policy (>= 12 chars or 6 words) follows QV-19, not QV-10 "optional".
* Entry bodies are JCS bytes of protocol records/envelopes; ballots use type `ballot`, tests `ballot_audit`. Organizer auth
  challenge message and `bb.log_id = SHA-256(origin)` are my choices (undefined in specs).
* Organizer management calls (createElection, putDraft, createInvites) are QV-08 signed requests (`api/signing.ts`, mirrors
  server `auth.ts`), because the server has no `/auth/*` session routes. `authChallenge`/`authSession`/bearer in `ApiClient` are
  left over from QV-09 and are not used by the server. The audience (`qv:<instance_id>@<publicUrl>`) is supplied by the caller.
* Client derives K/ctx itself by re-running DKG adjudication from the log. Word list is generated (placeholder, QV-19 open question).
* Sealing runs in a Worker via a Trusted Types policy `qv-default` (script URL only); falls back in-thread.
* Under hash-pinned CSP the standalone verifier page has inline script/style by spec (QV-19 section 7); index.html has none.

## Audit changes (docs/audit/web-verifier.md)
* WV-4: the client now trusts the manifest's `bb.log_pk` and `logOrigin(manifest)` (`bindServerLog`), not the server's `log_pk`/`origin`; a mismatch makes the election fail to load (`E-ORG-MANIFEST` box). `test/helpers/fake-board.ts` now uses the conformant origin.
* WV-3: `parseFragment` ignores a malformed `%` escape instead of throwing. WV-5: `csp()`/`headersFile()` reject any connect origin that is not a bare https origin (http only for localhost/127.0.0.1/.onion); `version`/`build` meta values are HTML-escaped; the inline verifier script has `<script` and `<!--` escaped.
* Offline `verifier.html` page: file-size bound, any exception is shown as FAIL, unknown check keys fall back to the raw key, an Election ID mismatch is also announced in the live region. Blob URLs for downloads are revoked.
## Live updates, standing, charts, chunks
* SSE (`net/sse.ts`, `flow/live.ts`): fetch-streaming client, not `EventSource`, so the cursor (`Last-Event-ID`) and read key (`QV-Read-Key`) travel in headers and the URL is only `/api/v1/elections/{id}/events`. Strict parser (bounded line/event size, CR/LF/CRLF, BOM) and per-event validation of the five server event types (entry, checkpoint, phase, alert, witness); unknown names are skipped, malformed known ones are skipped and reported (`onInvalid`), a frame without its own id is malformed. Duplicates (id <= last delivered) are dropped. Reconnect: equal-jitter exponential backoff 1 s..30 s, server `retry:` as base (1..60 s), `Retry-After` honoured, idle watchdog 60 s (server heartbeats are 5..60 s), backoff resets after progress or a connection older than 10 s. 410 drops the cursor and calls `onResync` once the stream is open again; other 4xx (not 408/429) and a non-event-stream answer stop for good (`failed`). `close()` aborts the request and ends the loop.
* Events are hints only. `LiveElection` coalesces them (100 ms), re-reads the log from the first sequence it lacks, appends the records and re-derives the context (phase, tally) from the signed log, then calls `onChange`. A forged or lost event can delay but not change what the page shows. The UI (`ui/app.ts`) starts one stream per opened election, closes it when leaving election pages, shows a `qv.live.*` status line, and repaints only the receipt and results views in place. The vote view is not repainted (it would discard input), so a close that happens while a voter is on the ballot is still found when they cast (WRONG_PHASE).
* Receipt standing (`flow/supersede.ts`): `BallotIndex` incrementally verifies cast/spoil envelopes (voter signature over the cast digest) and answers current / superseded / unknown / mismatch for a receipt's (entry, code). It walks the voter's `supersedes` chain like `analyzeBallotLog`: first admissible link wins, only entries between the open and close markers, `max_per_voter`, spoiled codes excluded. "Superseded" means a later admissible ballot of the same voter key exists in the log loaded in the page; it says nothing about the counted tally. The receipt view shows it for every saved receipt and for an uploaded receipt file, updating live. Mismatch (entry exists but is another ballot or its signature fails) is never shown as current.
* i18n: new keys `qv.receipt.standing.*`, `qv.live.*`, `qv.results.chartLabel|barValue|barCount|winnerTag` are `normal` (not guarantee) strings, added to `en.ts` and the five catalogs as machine drafts like the rest; no `review` record was added for any of them.
* Results chart (`flow/chart.ts` model, `ui/charts.ts` DOM): horizontal bars, inline SVG (no dependency). Every bar has a text label, printed count and share, a distinct hatch pattern (6, then reused), an outline, and a "Winner" text tag. Colours are CSS classes only (no inline colour or style), with `forced-colors` (system colours) and print overrides. Geometry is mirrored for RTL. The existing results table stays as the text alternative; if the chart chunk fails to load the table still shows. Lengths are proportional to counts on a common axis scaled to the largest option.
* Chunks: `build/site.ts` uses esbuild splitting. Catalog tables (`i18n/runtime.ts`) and the chart are separate chunks; `locales-core.ts` has no tables, `locales.ts` (all tables) is for tests/tooling only and `index.ts` no longer re-exports `LOCALES` (use `locales.ts`; `src/index.ts` still does). `main.ts` awaits `loadLocaleDefs()`, which fetches a table only for locales with review records (none today, so no catalog is downloaded). Review records now live in `LOCALE_META` (`locales-core.ts`). Sizes are printed by `npm run build -w @quietvote/web` (entry vs all files). The 200 kB total JS warning and the verifier.html < 400 KB check are unchanged.

## Gaps
* es/fr/de/pt-BR/ar have complete message tables (`src/i18n/catalogs/*.ts`), drafted by an AI model and not native-reviewed (the publish strings added later are drafts in the same way). They stay unoffered (only `en`) until each locale's `review` map holds a hash for every guarantee key; the matching-review path is tested in `test/i18n-catalogs.test.ts`. RTL CSS is logical-only; the ar layout has not been checked visually.
* App ICU messages are precompiled at build time (REQ-062; see "Ordinary app ICU precompilation"). Lazy chunks exist (see "Live updates, standing, charts, chunks"), but chunks loaded by `import()` carry no SRI and there is no import-map integrity (it would need an inline script); they are same-origin, content-hashed by esbuild, listed in `asset-manifest.json`, and covered by `script-src 'self'`. Whoever can alter a chunk on the host can also alter `index.html`, which carries the entry's SRI.
* No QR codes (text/file alternatives only). `/verify-client` not done.
* Organizer publish: `flow/publish.ts` (`publishElection`: election, signed manifest, dkg-open marker, invites; `commitRoll`:
  roll-commit) is unit-tested against a fake client and against the real `ApiClient` over a fake fetch. The create view
  (`ui/app.ts`) shows a "Publish election" section after a valid roll preview: organization ID, organizer key passphrase, then
  `flow/publish-ui.ts` `runPublish` (unlocks `organizer` key, reads the instance ID, signs requests with audience
  `qv:<instance_id>@<page origin>`, runs `publishElection`). A failed run keeps its state in memory so the same button resumes it;
  invite codes are shown once and are not stored. `test/publish-ui.test.ts` covers the DOM-free part and checks the view wiring
  by source. Assumption: the server's `publicUrl` equals the page origin; if not, the signed requests are refused.
  Not done: no run against a live server or e2e; `commitRoll` is not wired (it needs approved registrations, a separate step);
  the organization ID is typed by the organizer (no lookup or creation in the web client); other ceremony markers (r1..r3,
  dkg-final) and trustee invites are not driven from the web; withheld invite codes on a replayed request are not recoverable
  (the batch is re-issued, the old invites stay open).
  Trustee flows are CLI-only (ADR-024).
* Standalone verifier does bundle verification only (no audit-package or canary self-test; packages/verifier was in flux).
* Live/standing/chart UI wiring is checked by source assertions only; the e2e stub server (`e2e/run.ts`, FakeBoard) has no `/events` route, so the e2e shows "live updates are off". No browser run of the chart in forced-colors/RTL or with a screen reader was done.
* Not covered: `witness` events are ignored; the `checkpoint` event is a re-read hint only (no head pinning from it); a voter's ballot count/`max_per_voter` edge cases beyond the verifier's chain walk are not cross-checked against `analyzeBallotLog` output on the same log (roll membership is not checked for standing).
* Unit tests cover no DOM; a11y checks (axe), RTL visual and AT matrix are not automated here.

## Second-wave triage (behaviour changes, see docs/audit/web-verifier.md)
* Cast: any 5xx, 429, `BAD_RESPONSE` (non-JSON answer) or network/timeout after the ballot was sent is an unknown delivery: `PENDING_UNCONFIRMED`, secrets and the signed entry kept, retry resends the SAME bytes. Only a 4xx problem answer is `REJECTED`/`AFTER_CLOSE`/etc.
* Cast: the checkpoint in the append receipt is checked against the pinned head (rollback, fork, consistency proof via `api.consistency`) before it replaces the pin; on alarm the pin is kept, no receipt is saved, and the screen shows the board alarm.
* State machine: after a failed CAST that is not retryable (e.g. a board alarm) `NEW_SEAL` is refused (the ballot may be recorded; a new seal would carry a stale `supersedes`). A failed SEAL or a failed audit still allows a new seal. New event `LOCK`.
* `BallotController.lockSession()` is called from the app's auto-lock/`lockAll`: an unsubmitted sealed/sealing ballot goes back to review (randomness wiped, code dropped); a submission in flight keeps its signed bytes. `seal()` catches a rejecting sealer (-> failed) and drops a result that arrives after a lock.
* `deriveElectionContext`: a `tally` record counts (phase `tallied`, `ctx.tally`) only if `body.ctx` equals the derived ctx and it is signed under ctx by a manifest coordinator key. Unsigned/foreign tallies are ignored.
* Live: highest local seq is found by a loop (no `Math.max(...)` spread). A refresh error now shows `qv.live.failed` in the status line (it was swallowed).
* UI: registration failures are shown (HTTP 409 = already registered counts as success); `clearAll()` failures are announced (E-KEY-STORAGE) not reported as cleared; invalid organizer dates give an error instead of throwing (`isoUtc`); the garbled "Election ID see Election ID after signing" line was removed from the roll preview; ballot code groups use visible-to-AT text instead of `aria-label` on a span; the "test ballot is public" warning (`qv.audit.public`) and its two checkboxes are no longer inside a collapsed `details`.

## Automated accessibility browser checks (e2e/a11y.ts, e2e/help.ts)
* `node packages/web/e2e/a11y.ts` (repo root) drives the real production build (`buildSite`, real CSP header) of the ordinary pages only (Home `/`, Help `/help`, not-found) with Playwright + Chromium. Neither is a repo dependency (global install, loaded via `createRequire('/opt/node22/lib/node_modules/')`); the script skips with exit 0 when missing. `e2e/help.ts` is the same pattern (Playwright, not `chrome --dump-dom`, which returns an empty DOM in CI containers) and keeps its original 12 palette/control/navigation assertions.
* Checks: landmarks (one main, banner, named nav, contentinfo, one h1, html lang/dir); skip link (first Tab after load, visible on focus, Enter focuses main); Tab traversal reaches every link/control with a computed outline or box-shadow and `:focus-visible`; `aria-current="page"`; Help controls found by label; WCAG contrast ratios from computed colour over the composited effective background (light, prefers dark, explicit dark, high contrast, high contrast + dark; 4.5:1 normal text, 3:1 large); forced-colors emulation; reflow at 320x640 and 200% root font size at 640px (no horizontal scroll, no text running past its box); pseudo-locales en-XA and ar-XB (test entry bundles `startApp` with tables built by `i18n/pseudo.ts`, registered as tier 1 with computed review hashes because tier `pseudo` is never offered to `?lang=`), lang/dir, 320px reflow, overflow; no CSP/Trusted Types violations.
* These are automated heuristics, NOT a WCAG conformance claim and NOT a substitute for manual keyboard testing, screen reader / voice control / switch testing, or review by disabled users. Not covered: target size (2.5.8), non-text contrast of borders, focus appearance size, any election/vote/key/verifier/receipt/API page, real RTL visual review.
* Found by these checks, then fixed (checks unchanged and strict): (1) the first Tab after page load skipped the skip link and nav because `render()` moved focus to the step heading on every render; it now moves focus only after client-side navigation (`go`/popstate) or after the first keydown/pointerdown, so initial-load renders (including async election loads) keep the browser start position while in-place renders after a click or key press still move focus to the new heading. `e2e/run.ts` asserts focus does not fall back to `<body>` after the review render; that run reaches the page by navigation, so the direct-load + interaction path is covered by code reasoning only. (2) Long unbreakable runs (pseudo-locale padding; also real long words) scrolled horizontally at 320px; `body` now has `overflow-wrap:break-word`. Result: 45/45 automated checks pass; `help.ts` 12/12 in light and dark device modes.
* The pseudo-locale review hashes exist only inside the test bundle so `gate()` lets the harness render them; no catalog, review map or offer gate changes, and no translation is marked reviewed.
* The shared header exposes one Help and accessibility link in the primary navigation; the previous duplicate link beside Privacy was removed and is asserted by `e2e/help.ts`.
