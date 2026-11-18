# Ordinary Help, shell and localization inventory

Continuation from `8f9fb75c9818d15eac6929f25cfbec55c8bd66df` on
`feature/ordinary-ux-20261024`, repository `djshellshoxxx/quietvote` only. This
inventory covers the existing ordinary requirements relevant to this work; it
does not mark the entire web specification implemented or accepted. The earlier
[handoff](2026-10-24-ordinary-ux.md), including failed-browser evidence, is preserved.

## Requirement to implementation and evidence

| Existing requirement | Implementation/evidence now | Remaining status or exact limit |
| --- | --- | --- |
| QV-13-REQ-024: accessibility Help and AT tips | `/help` renders existing keyboard/screen-reader guidance; `wiki/Accessibility-and-Help.md` is linked from wiki Home/sidebar | Content present by source inspection; browser/AT acceptance unverified |
| Existing `qv.help.theme.*` and contrast settings; QV-13-REQ-034 theme presentation | Help offers automatic/light/dark and contrast, restores controls during the page session; native controls use matching colour scheme | Source/build checked; computed colours, visual contrast and forced-colour behavior unverified |
| QV-13 C-SHELL/C-HELP: landmarks, skip link, consistent Help | Existing header/nav/main/footer, skip link and stable Help links preserved; current route links now have `aria-current="page"` plus weight/underline | Nine focused navigation tests cover click and route matching; DOM, keyboard and AT behavior still unverified |
| QV-13 C-SHELL: election-aware document title | Render uses existing localized `{step} — {election} — QuietVote` with the already-loaded election title; non-election title unchanged | Typecheck/build and scoped code review; no new election/browser run |
| QV-13 C-STEPPER: ordered list and current step | Existing four-step indicator is now native `ol`/`li` with one `aria-current="step"` and existing localized progress label | Presentation implemented; full separate-route-per-step requirement remains partial because existing flow/state/routes were preserved |
| QV-10 section 5.3: build/version and source footer link | Existing build/version text retained; source repository link added with existing `qv.shell.footer.source` label | Source/build checked; no release-manifest or verification-flow claim |
| Existing Help About/report text | Existing catalog-backed sections preserved without changing guarantees or trust guidance | No review of assurance claims, contact policy or verification advice undertaken |
| Wiki navigation and Help discoverability | Added Help guide remains linked; 87 non-code `[[page]]` references resolve to existing local wiki files | Live wiki is not published here; external URLs and historical claims were not accepted or revalidated |
| T-314 / QV-13 section 9: translation workflow and style guides | README links expanded `docs/TRANSLATING.md`; contributor/reviewer checklist and five pending locale worksheets documented | Partial: qualified reviewers, approved terminology/register/style guides and review records remain absent |
| QV-13-REQ-060/061: catalog use, stable IDs/context | Existing catalog/copy tests pass; this work reuses existing message IDs and adds no user-facing source strings | Full extraction/literal-text lint across all screens is not complete; existing organizer/fallback literals remain |
| QV-13-REQ-062: build-time ICU precompilation | Existing runtime parser preserved | Open architecture/dependency work; not represented as completed by passing catalog tests |
| QV-13-REQ-063/064: locale choice and normal/guarantee fallback | Existing tests cover catalog completeness, placeholders, formatting and offer gates; only English is currently offered | Persisted language-switcher/state-preservation requirement remains unimplemented; no reviewed second locale is available |
| QV-13-REQ-065/071: pseudo-locales and text expansion | Existing pseudo-locale helpers retained; logical layout and wrapping step list use no fixed text widths | Visual pseudo-locale/reflow/zoom checks remain unverified |
| QV-13-REQ-068/070: localized formatting and terminology | Existing catalog/chart tests cover formatting cases; reviewer checklist identifies terminology/plural/direction review work | No approved per-language glossary or human rendered-language acceptance; Arabic visual review pending |
| T-310/311/312/315/316; QV-13-REQ-020/030/033/034 | No claimed WCAG, screen-reader, browser matrix, low-end-device or external audit acceptance | Browser/runtime and qualified-human evidence required; focused Node tests do not replace it |
| T-332: in-app voter Help/FAQ | Ordinary accessibility help exists; wiki voter guide/FAQ exist | Broader voter FAQ remains partial. Ballot, guarantee, receipt and verifier instructions were not expanded under this task's restrictions |

## Restricted-scope items left untouched

- Header `Privacy and limits` currently links to `/e`, which the existing route
  parser does not serve. No redirect, new guarantee page or contextual trust
  presentation was added: selecting its intended destination/content must be
  separated from the restricted trust-model work before changing it.
- Footer `Verify this page` and Help verifier/trust guidance were preserved.
  Changing client/release verification or recreating the stopped browser-verifier
  tranche is outside the authorized ordinary continuation.
- Election authority, ballot state transitions, cryptography, nonce handling,
  export roles and security-critical verification were not reviewed or changed.
  This was a scope boundary, not a new tool denial. Independent ordinary items
  above continued; no stopped security operation was retried or delegated.

## Fresh checks and browser gate

Node `v24.19.0`, npm `11.9.0`, TypeScript `5.9.3`:

- `npm run typecheck`: passed after the final application/CSS changes.
- `node --test packages/web/test/copy.test.ts packages/web/test/i18n-catalogs.test.ts packages/web/test/navigation.test.ts packages/web/test/charts.test.ts`:
  26 passed, zero failed/cancelled/skipped.
- `npm run build -w @quietvote/web`: passed, build `4c797bd705b7`; JS gzip
  179.1 kB total, entry 92.5 kB. Build output is compilation evidence only.
- Wiki target check: 87 references, zero missing local targets (inline-code
  examples excluded). README translation-link target exists.
- Scoped ordinary presentation review by navigation worker: no concrete issue.
- `git diff --check`: passed. No catalog or translation-review record changed.

No browser command was rerun. The same installed Chromium was the only located
browser binary, and no materially different supported ordinary-browser path was
identified. Original empty-DOM failures and static-page timeouts remain the gate;
root cause remains unestablished. They are **unverified behavior**, not passing
tests or new approval denials. No acceptance was weakened to get a green result.

## Local source handoff and continuation

After the final local commit, create a source-only `git archive` under
`/workspace/quietvote-handoffs/<exact-HEAD>/`. The artifact directory records exact
branch/HEAD/tree, archive SHA-256, per-source-file SHA-256, restore instructions,
the preserved diagnostic stderr log, and a restore-verification receipt. The
receipt is the source of truth for actual archive/extraction/check results.

The archive excludes dependencies, build output, Git metadata and companions.
Restoration yields a source snapshot, not the original Git history. Verify the
archive hash, extract into a new empty directory, verify `SOURCE-SHA256SUMS`, then
install the locked dependencies with scripts disabled and run the focused checks
listed above. Do not rerun the failed browser path or restricted reviews as a
restore step.

This continuation reused two inexpensive `gpt-6-luna` workers with disjoint file
ownership (navigation logic/tests; translation docs/README link) and one
integrator. No additional workers were spawned. The selected environment resumed
successfully; one immediate command preceded tool readiness and made no changes.
There were zero worker startup failures.

Everything remains local and ephemeral. No upload, GitHub mutation/push, release,
deployment, credentials or security-setting change occurred. Companion projects
were untouched. QuietVote remains unaudited and not for real elections.
