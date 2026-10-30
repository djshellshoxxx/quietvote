# QuietVote restart handoff — ordinary catalog and app build

This is the restart entry point for Claude or another agent. Repository ownership
is **only `djshellshoxxx/quietvote`**. Preserve all local changes before doing work;
CLASSifiedisRUPTed, Circula and Unaltered are outside this task.

## Latest project-label milestone

The README project overview now labels QuietVote as **software artwork**, describing
it as an experimental software and documentation project. This is a descriptive
label; it does not change the AGPL-3.0-or-later license or remove provider,
security, or legal requirements. Existing purpose, experimental status, safety and
trust wording remain in place. No runtime code changed for this milestone.

## Exact refs and known checkpoints

- Local working branch: `feature/ordinary-ux-20261024`.
- Published source work branch: `checkpoint/quietvote-ordinary-ux-20261024`.
- Confirmed main: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`; main is unchanged.
- Software-artwork README milestone: `9dfd02c6f831d885921a9f4d390a2aee1898ccb0`.
- Earlier ordinary shell checkpoint:
  `9c63458f7c0386f851f9d9617e731cd9b91ecfa8`.
- Published catalog/literal-lint milestone:
  `2cd93689ffabfdad40a768b5458873af3fb5f443` (29 focused tests, typecheck/build;
  one outgoing commit/20 blob versions scanned with zero potential secrets).
- Published ICU/app-build implementation milestone:
  `5435bba332d1436d2471d9d1d54fe5ea1859fd37` (42 focused tests, typecheck/lint/build;
  one outgoing commit/14 blob versions scanned with zero potential secrets).
  The remote work ref was read back at this exact SHA. A following documentation
  commit records this receipt without changing implementation. Read the live ref
  before continuing; do not infer later publication from local files alone.

## Fresh resumption and remote reconciliation

The same environment resumed, and fresh `git status`, `rev-parse`, `ls-remote`,
typecheck and test/build commands succeeded. Local HEAD and the live work branch
were already `2cd9368`, newer than the parent's last-known `9c63458`; the three
local precompiler files and `site.ts` integration were preserved. The older local
remote-tracking ref was behind and was refreshed normally, without resetting work.

GitHub metadata-only reconciliation found no newer independent ordinary UI/docs
line. PR #13 remains open/draft at web-triage
`e9d4cd3416371c2c825ee855c5f84f39c4a53b2d`, targeting web-verifier
`e1421698626a4defd744a50ed2f9337066793d6e`. The older docs PR #2 is at
`29313c369aeda4f1ab2503ca3437c5bd22025a09`; broad WIP PR #3 is at
`e56403b6b30f5d438b2f5f04e7fd5b76e8626c6b`. No sibling security stack was merged.
PR search omitted some fields, so ordinary-adjacent PR metadata was fetched
separately; `git ls-remote` supplied exact branch SHAs. No security diffs were reviewed.

## Completed requirements and source boundaries

1. **REQ-060/061, scoped extraction/lint:** `i18n:check` and `i18n:extract` validate
   source entry shape/ICU and report catalog metadata, static/dynamic references,
   unknown IDs, literal findings and exclusions. Seven ordinary text literals and
   the invalid-date detail now use stable IDs; initial app HTML uses catalog copy.
   There are 487 source entries, 282 static references, 14 dynamic references,
   zero unknown IDs/schema/literal findings, and one explicit excluded function.
   Scope is `main.ts`, `ui/app.ts`, `ui/dom.ts`, `ui/charts.ts`; `verifyView` and
   standalone verifier paths are excluded. This is not repository-wide acceptance.
2. **REQ-062, ordinary app build:** ICU parsing runs at build time. Exact text
   literals avoid duplicate AST payload; complex messages use serialized AST
   formatter functions with the existing evaluator. App output is parser-free,
   without eval/Function. The plugin attaches only to the app esbuild call.
3. **Behavior preserved:** the source translator/evaluator, lazy-loader source,
   locale review/offer metadata, guarantee copy and restricted verifier source
   are unchanged. All five translated catalogs remain machine drafts, unreviewed
   and unoffered. No language-picker acceptance is claimed.
4. **Associated evidence:** emitted ESM execution checks all current catalog
   messages against source formatting, fallback/errors and plural/select/bidi;
   CLI and app integration checks run independently of the failed browser path.

## Reproducible ordinary checks

Run from repository root with Node >=22.18 (verified here on 24.19.0):

```sh
npm run typecheck
npm run i18n:check -w @quietvote/web
node packages/web/scripts/i18n-check.ts --json > /tmp/quietvote-i18n-extraction.json
node --test packages/web/test/copy.test.ts packages/web/test/i18n-lint.test.ts packages/web/test/i18n-cli.test.ts packages/web/test/i18n-catalogs.test.ts packages/web/test/navigation.test.ts packages/web/test/charts.test.ts packages/web/test/precompile.test.ts packages/web/test/app-precompile.test.ts packages/web/test/lazy.test.ts
npm run build -w @quietvote/web
git diff --check
```

Latest combined result: typecheck and scoped lint passed; **42 tests passed**, zero
failed/cancelled/skipped; build `335206de1931` passed, gzip JS 190.1 KiB total and
92.9 KiB entry. Existing 200 KiB total / 110 KiB entry test limits were preserved.
The precompiler fixture was also run from `packages/web` cwd (4 passed).

Resolved implementation failures: the first AST-all-messages prototype exceeded
the size limits (255,545 bytes for app/chunks before the worker); exact literal
registration removed duplication. Integration typecheck found and corrected an
EN-entry cast, unused imports/callback argument, and test outputFiles narrowing.
Those failures were not waived; final checks passed. No browser command was rerun.

## Ordered remaining work / blockers

1. The implementation checkpoint is published and verified at the exact SHA above.
   On restart, check local edits and the live work ref before editing. Never
   force-push or overwrite another team's work.
2. The defined ordinary catalog/app-build implementation is complete. Dynamic
   references remain reported rather than fully
   data-flow-resolved; excluded scopes are not accepted by a green lint result.
   Do not invent unrelated features to keep workers busy.
3. Qualified native/second/back-translation review, approved locale terminology,
   style and review records remain human work. Keep translations unoffered; defer
   picker acceptance until a reviewed second language exists.
4. Browser/AT/contrast/RTL/reflow/zoom acceptance remains unverified. The original
   Chromium empty-DOM/static-page timeout evidence is in the earlier handoff and
   preserved diagnostic artifact. Do not rerun that path without materially new
   evidence of a different supported ordinary-browser route.
5. Crypto/nonce, export-role/trust-anchor, authority/trust changes, security-critical
   verification and the stopped browser-verifier tranche remain excluded. The
   privacy `/e` destination and client-verification guidance are unchanged. Scope
   restrictions are not overridden by autonomous continuation or merge permission.

## Ownership and preservation

One integrator owns shared-file integration, commits, source scans, pushes and
handoffs. Six inexpensive workers contributed disjoint compiler, lint, CLI-test,
app-build-test, translation-doc and read-only remote-metadata tasks (two existing
workers resumed, four new; all returned, no admission failures). No duplicate team
or companion work was started.

Original source-only archive SHA-256 remains
`bacf3fe910823f520b4aa8639553f1eea2d999596f8bfb89e17c2012f187eda2` at
`/workspace/quietvote-handoffs/9c63458f7c0386f851f9d9617e731cd9b91ecfa8/`.
It restores the earlier 9c checkpoint, not this newer compiler work. Local files
are ephemeral; the verified GitHub work branch is the source checkpoint. No
Library upload, release, deployment, credential/security-setting change or claim
of election readiness, independent security acceptance or WCAG conformance occurred.

## Publication receipt

`git push origin HEAD:refs/heads/checkpoint/quietvote-ordinary-ux-20261024`
fast-forwarded `2cd9368` to
`5435bba332d1436d2471d9d1d54fe5ea1859fd37`. A fresh `git ls-remote --heads origin`
returned that exact work-branch SHA and unchanged main
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The working tree was clean afterward.

Publication hygiene: detect-secrets 1.5.0, default plugins/filters, all 14 new
source blob versions in the one outgoing implementation commit, zero potential
findings. `--no-verify` disabled credential-verification network calls. Temporary
scan tooling had disappeared on environment resumption; it was reinstalled only
under `/tmp` and the scan passed before pushing. No source, credentials or
security settings were changed to resolve that local tooling issue. This scan
is not independent security acceptance.

The receipt-only documentation checkpoint uses the same tested implementation.
Continue to secret-check outgoing versions and read back each work-branch push.

The software-artwork milestone is documentation-only. The README links were
checked locally and `git diff --check` passed; implementation checks were not rerun
because no implementation files changed. See the software-artwork publication
receipt below for its commit and remote readback.

## Software-artwork publication receipt

Commit `9dfd02c6f831d885921a9f4d390a2aee1898ccb0` added the README label and
updated this handoff. The outgoing-version scan used detect-secrets 1.5.0 with
default plugins/filters and `--all-files --no-verify`: one outgoing commit, two
blob versions, zero potential findings. The push fast-forwarded the ordinary
work branch from `b827c645b3ec5d2887fd1c3f2af823dfffd37b54`; `git ls-remote`
returned the exact `9dfd02c6f831d885921a9f4d390a2aee1898ccb0` SHA for that branch
and main remained `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.

This receipt was finalized in a subsequent documentation-only checkpoint. Resolve
the live branch head with `git ls-remote` before resuming; the README label commit
above is unchanged. No implementation or tests changed for the receipt update.

## Local ordinary continuation — 2026-10-25

This section is newer than the earlier implementation-complete note above.
Starting from local `cf4ebf00b78d8f4fa90c0276545370a5d5d05521`, I made one local
ordinary implementation commit, `b3b64f331ae76d57fcdca9680e3ebd4e9b56ff91`.
The published work branch was still `cf4ebf00b78d8f4fa90c0276545370a5d5d05521`
and main remained `019f4e789be2ff38a5fb2d348c3b225cc87cf296` at the last remote
read. This continuation does not authorize or perform a source push. The current
local HEAD includes this handoff update; inspect `git rev-parse HEAD` and `git
status --short --branch` before resuming.

### Changes and exact regression evidence

- `packages/web/src/flow/live.ts`: `close()` no longer resolves `settled()` while
  a refresh is active. A page response arriving after close is ignored before it
  changes records; a close during context derivation also suppresses later state
  updates and callbacks. The underlying `allEntries` request is not aborted; it
  may finish, but its late result is discarded. SSE and election derivation logic
  were not changed.
- `packages/web/src/i18n/icu.ts`: ICU `number, latn` now passes the explicit
  `numberingSystem: 'latn'` formatter option. This takes precedence over a locale's
  `nu` extension and retains the current locale for other formatting. Other number
  styles continue using the locale-selected numbering system.
- Reproduced before the fix: `node --test packages/web/test/live-lifecycle.test.ts`
  failed both tests. Closing a pending refresh resolved `settled()` too early
  (`true` instead of `false`); a late page appended `{seq: 0, record: undefined}`
  to the closed target. After the fix both focused tests pass.
- Reproduced before the number fix: `format('{n, number, latn}', {n: 1234},
  {locale: 'ar-u-nu-arab'})` emitted Arabic-Indic digits (`١٬٢٣٤`) while the
  `Intl.NumberFormat(locale, {numberingSystem: 'latn'})` oracle returned `1,234`.
  A direct check showed the same mismatch with
  `ar-u-ca-islamic-nu-arab`. The final test covers both locales, the default
  locale numbering system, and the compiled formatter path.
- Final focused command: `node --test packages/web/test/live-lifecycle.test.ts
  packages/web/test/icu-number.test.ts packages/web/test/precompile.test.ts` —
  **7 passed**, 0 failed/cancelled/skipped. This includes emitted app compiler
  integration; it is not browser acceptance.
- `npm run typecheck` passed; `git diff --check` passed. No whole-project test
  suite, production build, browser, assistive-technology run, or translation
  review was performed for this continuation.

The worktree commit is local only. Browser/AT/contrast/RTL/reflow/zoom evidence,
qualified human translation review and restricted crypto/nonce, export-role,
trust/authority, and verifier work remain as described above. No companion
repository was accessed.

## Current validation and checkpoint readiness — 2026-10-25

This section supersedes the preceding local-only status. The local implementation
commit is `a57879538e3ddb19c3eb5b517e2528ba69353221` on
`feature/ordinary-ux-20261024`, after the published checkpoint
`cf4ebf00b78d8f4fa90c0276545370a5d5d05521`. It stages candidate log records and
derives context before committing them to the active view; if the view closes
during derivation, records and callbacks are discarded. The HTTP read still runs
to completion because the current API read has no abort signal. ICU `number, latn`
sets the `Intl.NumberFormat` numbering-system option so it overrides a locale
`nu` extension while ordinary number styles retain the locale default.

The independent ordinary diff review found the close-during-derivation partial
commit edge. A new regression reproduced it before the fix; candidate records are
now committed only after derivation finishes and the view remains open. The red
test observed `[ { seq: 0, record: undefined } ]` where the closed target should
remain `[]`. One read-only review worker completed; the root integrator owns edits
and integration. No excluded verification/security modules were reviewed.

Latest checks after the additional lifecycle fix:

```sh
node --test packages/web/test/live-lifecycle.test.ts packages/web/test/icu-number.test.ts packages/web/test/precompile.test.ts
npm run typecheck
git diff --check
```

Results: **8 tests passed**, zero failures/cancellations/skips; typecheck and diff
check passed. The test run exercises source and compiled formatter behavior and an
esbuild test fixture. No full suite, production build, browser, AT, contrast, RTL,
reflow/zoom or human translation review was performed. Original pre-fix failures
are preserved in the prior continuation section above.

### Publication and merge decision

The owner's newer instruction authorizes a tested source checkpoint. The intended
source target is `djshellshoxxx/quietvote`, branch
`checkpoint/quietvote-ordinary-ux-20261024`, last read at
`cf4ebf00b78d8f4fa90c0276545370a5d5d05521`. The tested implementation SHA is
`a57879538e3ddb19c3eb5b517e2528ba69353221`; the local source branch tip before
this handoff update is `6722599fc316957790ae95717c4a48a1e09ce6e1`. Main was read at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`.

Merge candidate assessment recorded before any merge action: source is the entire
`feature/ordinary-ux-20261024` branch at `6722599fc316957790ae95717c4a48a1e09ce6e1`;
target would be `main` at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The source ancestry includes web
triage `e9d4cd3416371c2c825ee855c5f84f39c4a53b2d`, which merges the web-verifier
line `e1421698626a4defd744a50ed2f9337066793d6e` and audit-QA ancestry. That broad
baseline has not passed the required review under this task's exclusions. A merge
to main is therefore not appropriate; **no merge command was attempted**. Keep
main unchanged.

Pre-push checks completed at local tip `6722599fc316957790ae95717c4a48a1e09ce6e1`:
the only workflow is read-only CI on PRs, `main` pushes and merge groups; a push to
the checkpoint branch does not trigger it, and no release/deployment workflow is
present. The outgoing diff contains only the handoff, `flow/live.ts`, `i18n/icu.ts`
and their two focused tests; no private research packs or user data are included.
Detect-secrets 1.5.0 scanned four outgoing commits and eight blob versions with
zero potential findings. These checks included the source before this handoff
receipt commit; rescan the final outgoing branch versions before push.

After the final scan, fast-forward only the named checkpoint branch and read back
its exact SHA and main's SHA. Never force-push or mutate a PR. The prior no-push instruction was
superseded by the owner's newer explicit checkpoint request; do not infer any
permission for a main merge, release, deployment, credentials or security changes.

### Resume steps

1. In the same QuietVote checkout, run `git status --short --branch` and
   `git rev-parse HEAD`; preserve edits. At this point local source tip before this
   handoff was `6722599fc316957790ae95717c4a48a1e09ce6e1`; resolve the actual live
   local SHA rather than assuming it.
2. Check the live checkpoint and main refs. The checkpoint source is ordinary UX,
   scoped live-refresh cancellation and localized number formatting; no election
   readiness is claimed.
3. The source and handoff are now published on the existing checkpoint branch.
   Resolve the current local and remote heads before continuing; keep subsequent
   source checkpoints secret-scanned and fast-forward only.
4. Continue only ordinary UX, documentation, localization presentation and
   benign application lifecycle work. Browser/AT/contrast/RTL/reflow/zoom and
   qualified language review remain external acceptance gates. Do not access
   companion projects or resume crypto/nonce, export-role, trust/authority,
   election-verifier or browser-verifier work.

## Verified checkpoint receipt — 2026-10-25

`git push origin HEAD:refs/heads/checkpoint/quietvote-ordinary-ux-20261024`
fast-forwarded the existing checkpoint from
`cf4ebf00b78d8f4fa90c0276545370a5d5d05521` to
`176e82f2cf85f087a5f0b2c021306cf9e299a562`. A fresh `git ls-remote` returned that
exact SHA for the checkpoint and left main at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The final pre-push scan at the
published SHA covered five outgoing commits and nine blob versions using
detect-secrets 1.5.0 default plugins/filters with `--all-files --no-verify`;
there were zero potential findings. Outgoing paths were limited to this handoff,
`packages/web/src/flow/live.ts`, `packages/web/src/i18n/icu.ts`, and the two new
focused tests.

Workflow inspection found only read-only CI for pull requests, pushes to `main`,
and merge groups; no deployment/release job exists, and the checkpoint push did
not trigger that workflow. No merge was attempted: the branch's full ancestry is
not compatible with the restricted review boundary noted above. The local
follow-up documentation commit `1d44e29d3b3b1792e100768d783e42d04f34ddcd`
recorded the receipt. Its outgoing scan covered one commit and one blob version
with zero potential findings. The push fast-forwarded the checkpoint from
`176e82f2cf85f087a5f0b2c021306cf9e299a562`; remote readback returned the exact
`1d44e29d3b3b1792e100768d783e42d04f34ddcd` SHA and main remained
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. Resolve the live branch head before
resuming because this handoff records the preceding receipt commit.

## UI/locale/accessibility continuation — 2026-10-27

Branch `claude/quietvote-ui-locale-a11y-sltfb3`, started from checkpoint head
`884f59975bdfcad51d5dac7b77b8bd5ae0d6b067` (re-read live; main still
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`). The close/settled-refresh and `number, latn`
fixes were inspected and present; not redone. Excluded scope unchanged (crypto/nonce,
export-role, browser-verifier, guarantee copy, trust/authority, registration).

- Browser route: Playwright + Chromium 1243 preinstalled in this container renders pages
  (the old `--dump-dom` path still returns an empty DOM). `e2e/help.ts` now uses Playwright:
  12/12 checks in light and dark device modes.
- New `e2e/a11y.ts` (Home, Help, not-found, real build + CSP): 45/45 automated checks.
  It found two real defects, now fixed: first Tab after load skipped the skip link
  (`render()` stole focus on initial load) and long unbreakable text scrolled at 320px
  (`body{overflow-wrap:break-word}`).
- `e2e/run.ts`: stepper assertions updated for the `ol` stepper (the old `getByText('Step N of 4')`
  could not match after C-STEPPER). The "import key file and unlock" step still fails, also on
  pre-ordinary base `e9d4cd3`: the FakeBoard stub has no `POST .../registrations` route (404 →
  E-GEN-UNKNOWN). Not fixed: registration is authority-adjacent; left red, not skipped.
- i18n extractor: 8 of 14 dynamic references now resolve (object maps, literal ternaries,
  template patterns); 6 remain reported with reasons. Unknown resolved keys fail the check.
- Checks: typecheck clean; web unit tests 158/158; `i18n:check` passed.

Automated checks are not WCAG conformance, screen-reader/AT qualification or native
translation review; those remain human gates. All translations stay unreviewed/unoffered.

## Registration-journey 404 — 2026-10-28

Branch `claude/sharp-archimedes-tu76rh`, started from PR #18 head
`3b738004061d6ced57b5a3650491fb894cf99e6d` (base checkpoint `884f59975bdfcad51d5dac7b77b8bd5ae0d6b067`;
merge base with `main` `69c03fb6f50c3b6e865946820f878ea8b595e6ce`; main `019f4e789be2ff38a5fb2d348c3b225cc87cf296`).
PR #18 hosted CI green on `3b73800` (6 typecheck+test jobs, claims lint). No merge into main or the checkpoint.

- Reproduced against the real build (`node e2e/run.ts`, Playwright + preinstalled Chromium):
  "import key file and unlock" timed out. Root cause: the e2e stub `FakeBoard` had no
  `POST …/registrations` route, so the app got a 404 instead of a contract answer.
- The real server (`packages/server/src/app.ts`) and QV-09 refuse registration once the roll is
  committed (`403 REGISTRATION_CLOSED`, checked before invite/idempotency). The stub election is OPEN
  with a committed roll, so the old step asserted a journey the real contract rejects.
- Fix (test infrastructure only; no app, server, crypto or registration-policy change):
  `test/helpers/fake-board.ts` answers registrations as the server does in this state (400 on a
  malformed body, else 403 REGISTRATION_CLOSED); unit regression in `test/flow.test.ts`.
  `e2e/run.ts` now checks (a) an invite link after roll commit shows an error alert and never
  "Your key is registered." and (b) the accepted already-on-roll journey: import the key file
  without an invite (QV-04 new-device import), then vote.
- **Open decision (owner):** QV-10 §8.1 has no UX code for `REGISTRATION_CLOSED`,
  `INVITE_EXPIRED` or `INVITE_USED`; the app shows `E-GEN-UNKNOWN`. A voter who reopens their
  invite link after roll commit and imports their (already rolled) key sees a generic error even
  though they can vote. Choosing copy or treating that 403 as benign is registration UX policy;
  not decided here.

| Command (Node v22.22.0) | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | passed |
| `npm run typecheck` | passed |
| `npm test -w @quietvote/<ws>` each | board 61, cli 29, crypto 49, protocol 172, server 121, trustee 65, verifier 23, web 159 (incl. `i18n:check`); 0 failed/skipped |
| `node e2e/run.ts` (web) | 8/8 steps passed (was 6/7 with the registration step red) |
| `node e2e/help.ts` | 12/12 light + 12/12 dark |
| `node e2e/a11y.ts` | 45/45 automated checks (not WCAG conformance) |
| `node scripts/lint-claims.mjs` | 11 findings in 5 files (non-blocking job; unchanged docs, not triaged here) |
| `git diff --check` | passed |

Not run: `verifier-py` tests (not in CI workflow), live server e2e, AT/screen-reader testing.
Review status: self-review only; **no independent security or accessibility review performed**.
Human translation review still pending; translations stay unoffered. DCO: commits on this branch
carry no `Signed-off-by` (an author attestation the agent cannot make); DCO/authorship not established.

## Ordinary shared-header Help link cleanup — 2026-10-28

This work resumed from a clean local checkout at
`884f59975bdfcad51d5dac7b77b8bd5ae0d6b067`. A live read showed that both the
ordinary checkpoint and `claude/quietvote-ui-locale-a11y-sltfb3` had advanced to
`424110d90e23dc443aa4498a4340973d3c8cb8b6`; the checkpoint was a descendant of
the local source. I fast-forwarded local `feature/ordinary-ux-20261024` to
`424110d` without discarding work. `main` remained
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The checkpoint includes PR #19's
ordinary catalog extraction, navigation/a11y test and FakeBoard/e2e updates.

External ownership check: `claude/sharp-archimedes-tu76rh` still resolves to
`e2ee87460eefaf896ddef575b998c83dad84e8dc`, matching the supplied status for
PR #20's active verification/coverage/audit. Do not duplicate or inspect that
review. GitHub PR metadata queries returned HTTP 403 Forbidden, so status beyond
the supplied context and live branch SHA is unavailable. The separate locale/a11y
branch points at the checkpoint commit `424110d`; no separate unmerged ordinary
change was found in these refs.

The latest NOTES documented a concrete ordinary navigation issue: Help and
accessibility was linked in both the shared primary navigation and a second
header paragraph, creating a redundant link/tab stop on every route. Source
commit `78d3ecd973a448e796b2c6eb613bc8ebb72f36d5` removes only the second Help
link. The existing shared primary-nav link remains; the Privacy and limits link
and its destination are unchanged. `packages/web/e2e/help.ts` now asserts exactly
one `/help` anchor inside the header, and `packages/web/NOTES.md` records the fix.
This is UI navigation cleanup only; no locale strings, election flow, verifier,
trust, or security code changed.

An independent read-only requirements inventory found no other clearly safe,
unowned ordinary feature in the current backlog. Remaining items are gated:
translation review and RTL/AT checks need qualified human review; registration
error copy needs an owner decision; broader voter-help items include ballot,
guarantee, receipt or verifier guidance; offline retry and close behavior can
affect election lifecycle. Do not invent copy or alter those boundaries to keep
work moving.

Validation at source commit `78d3ecd`:

- `npm run typecheck` — passed.
- `npm test -w @quietvote/web` — **159 passed**, 0 failed/skipped; includes
  `i18n:check` (281 static references, 8 resolved dynamic references, 6 reported
  unresolved dynamic references, and one explicit `verifyView` exclusion). This
  is routine package test execution, not an independent security review.
- `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts`
  — 13/13 Help/Home checks passed in both light and dark device modes.
- `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts`
  — 45/45 automated ordinary-page checks passed. These do not establish WCAG
  conformance or replace screen-reader/assistive-technology and disabled-user
  testing.
- The first Playwright invocation could not find the default cached executable;
  `/usr/bin/chromium` was present and the existing `QV_CHROMIUM` path succeeded.
  No old `--dump-dom` path was retried.
- `git diff --check` passed; one read-only independent diff reviewer found no
  issue. Two inexpensive read-only workers completed (requirements inventory and
  exact UI diff review); the integrator owns all edits.

The local implementation is committed but not yet published at this section's
creation. The remote checkpoint was last read at `424110d` before this change.
Before publishing, re-read that ref and `main`, ensure the local source remains a
fast-forward descendant, secret-scan the outgoing source/handoff versions, and
push only `checkpoint/quietvote-ordinary-ux-20261024`. Read back the exact remote
SHA. Keep `main` unchanged; no PR merge or approval was attempted.

The requested whole-codebase code/bug audit remains deferred while PR #20's
verification/coverage/audit is reported running; do not duplicate that active
review. A deep security review was not performed: the earlier crypto/nonce,
export-role, trust/authority, verifier and browser-verifier exclusions remain in
force. No security acceptance, real-election readiness or WCAG claim is made.

### Publication receipt

The source and handoff checkpoint was pushed as a fast-forward from
`424110d90e23dc443aa4498a4340973d3c8cb8b6` to
`04d4daac3301ed935ae89e2cbcced295e8277d6f` on
`checkpoint/quietvote-ordinary-ux-20261024`. A fresh `git ls-remote` returned
that exact checkpoint SHA; `main` remained
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`, and the external PR #20 branch still
resolved to `e2ee87460eefaf896ddef575b998c83dad84e8dc`. The pre-push
detect-secrets 1.5.0 scan covered the four outgoing file versions and found zero
potential secrets. No workflow file changed. This receipt-only update follows
the verified source checkpoint; resolve the current branch HEAD on resumption.

## Dynamic i18n reference resolution — 2026-10-28

Start: live `checkpoint/quietvote-ordinary-ux-20261024` at
`c35ae44ec441fb9b7caa9506addced8f7ebca949` (clean checkout). Live reads before coding:
`main` `019f4e789be2ff38a5fb2d348c3b225cc87cf296`; PR #20 branch
`claude/sharp-archimedes-tu76rh` `e2ee87460eefaf896ddef575b998c83dad84e8dc` (active audit,
not inspected or touched); `claude/quietvote-ui-locale-a11y-sltfb3` still `424110d` (ancestor of the
checkpoint). `claude/dazzling-cerf-n8ha3g` `d75d4a2` is a 2026-10-21 ancestor of the checkpoint,
not new work. No PR metadata operation was attempted. The session's designated branch
`claude/quirky-ritchie-8qxfg0` sits at `main`; the checkpoint does not descend from `main`, so it was
not pushed there (that would need a force-push) and no PR was opened.

Ready queue (done): the six unresolved dynamic translator references reported by `i18n:check`.
`packages/web/src/i18n/extract.ts` (tooling only; no app runtime, catalog, copy or locale change)
now resolves, conservatively and lexically:

- identifiers bound to a `const` with a resolvable initializer (form `binding`); any `var` of the
  name in the file, `let`, destructured, imported, catch/loop names stay dynamic;
- the first parameter of an arrow element callback (`map`, `forEach`, …; at most `(el, i)`, no rest)
  over a const, non-exported array literal whose every other use only reads it (form `array-element`);
  writes (`push`, `length =`, element assignment), escapes into calls, spreads stay dynamic;
- calls to a local const single-expression arrow key builder with arguments substituted (form
  `call`); parameters written anywhere in their function (incl. through `!`/`as`/`<T>`/`satisfies`)
  are never bound;
- limits: 1,000 alternatives, depth 16, 20,000 steps per call; a limit is a hard failure that
  propagates and never becomes a template wildcard; const resolutions are memoized;
- the translator wrapper `const t = (k) => tr.t(k)` is reported as `references.forwarded` only if it
  forwards its first parameter, is not exported, and every `t` use in the scanned files is a direct
  call, a declaration/member name, `x.t(...)`, or proven safe by type-checked evidence: an `x.t`
  value read whose type is primitive, or `{ t }` in a literal holding only the wrapper and primitive
  data, passed directly to a function implemented (body or const function) in a scanned file,
  reached directly or via `import * as ns`/`const ns = await import(…)`, whose receiving parameter
  is used (in defaults and body, incl. shorthand) only as `env.x`. Evidence is withdrawn if a scanned
  file has diagnostics or `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. Otherwise the wrapper's
  call is reported dynamic (`translator wrapper used as a value`).
- `scripts/i18n-check.ts` builds that evidence with a TypeScript program from
  `packages/web/tsconfig.json` (check time ~3 s, was <1 s) and verifies the program read the same text.

App result: 281 static, 13 resolved (was 8), **0 unresolved** (was 6), 1 forwarder, 0 unknown keys,
`verifyView` still excluded. The six resolve to: stepper keys (4), error title/body patterns
`qv.err.*.title|body` (32 each), privacy not-claimed list (6; guarantee copy **unchanged**, only
analysed), receipt titles (6). The theme-option template resolves to its exact 3 keys.

Review history (one independent read-only reviewer, six fix rounds, each finding reproduced by a
test that failed on the previous commit before the fix):

| Round | Findings | Fix commit |
| --- | --- | --- |
| 1 | `var` hoisting, parameter reassignment, callback third argument, exported arrays, exponential blowup (OOM crash), loose forwarder | `ca5621b` |
| 2 | rest callbacks, writes through TS casts, wrapper escape via `ui.t`/export, object-map limit to wildcard, 5.9 s input | `18d5753` |
| 3 | generic/`object`/`{}` types accepted as non-callable; hand-off to unscanned module | `0e14fda` |
| 4 | callee declaration ≠ implementation (param, interface, alias, `declare`); evidence despite type errors | `d6e6a44` |
| 5 | `@ts-` suppressions; receiver passing the object on (replaced a documented assumption) | `b436012` |
| 6 | receiver escape via `{ env }` shorthand, parameter defaults, `this` in a getter/method of the carrier | `6cc194d` |

| Command (Node v22.22.0) | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | passed |
| `npm run typecheck` | passed (it caught two type errors the test runner does not; both fixed) |
| `npm test -w @quietvote/web` (incl. `i18n:check`) | 177/177 passed, 0 failed/skipped |
| `git diff --check` | passed |

Not rerun (no runtime/UI file changed): Playwright `e2e/help.ts`, `e2e/a11y.ts`, `e2e/run.ts`,
other workspaces' tests. Excluded and not reviewed: crypto/nonce, export-role/trust anchors,
authority, ballot verification, verifiers, the stopped browser-verifier tranche, `verifyView`. A
wider web-client code/bug review was **not** started: PR #20 carries the active web-client audit (B3).
The extractor is a developer lint, not a security control; its review is AI-assisted, not independent.

Blocked queue (unchanged; revisit only when the dependency changes):

1. Qualified native/back-translation review; RTL visual, assistive-technology, disabled-user and
   broader usability reviews (human). Translations stay unreviewed, unoffered machine drafts.
2. Registration UX copy for `REGISTRATION_CLOSED`/`INVITE_*` and `commitRoll` wiring (owner decision).
3. Guarantee/trust copy, receipt/ballot/verifier guidance, `/verify-client`, QR codes (decisions /
   excluded scope).
4. Claims-lint: 11 findings in 5 research/audit docs (paper titles and audit wording); triage or
   allowlisting is a claims-policy decision, not done here.
5. Whole-codebase code/bug audit: owned by PR #20; do not duplicate.
6. Merge to `main`: not appropriate (checkpoint ancestry includes unreviewed web-triage/web-verifier
   lines); no merge, approval or PR operation under this handoff.

No other Ready ordinary work was found; do not invent features. On restart, `git ls-remote` the
checkpoint and `main` first; the publication receipt below records the last pushed SHA.

## Restart snapshot and handoff verification — 2026-10-28

This bounded pass made no implementation edits and ran no tests. At entry, local
`feature/ordinary-ux-20261024` was clean at
`c35ae44ec441fb9b7caa9506addced8f7ebca949`, with no untracked or unpushed work.
The live owned work checkpoint had advanced by one Claude-authored commit to
`ed505f522610311f9233060e0143c7f53d868dac`. Local was its ancestor, so it was
fast-forwarded without discarding or rewriting anything; the local branch is now
at that source-plus-handoff commit. `main` remains
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The existing publication branch is
`checkpoint/quietvote-ordinary-ux-20261024`; no new backup branch is needed.

Read-only `git ls-remote` confirmed these live refs:

- `checkpoint/quietvote-ordinary-ux-20261024` —
  `ed505f522610311f9233060e0143c7f53d868dac`.
- `main` — `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- `claude/quietvote-ui-locale-a11y-sltfb3` —
  `424110d90e23dc443aa4498a4340973d3c8cb8b6`.
- `claude/sharp-archimedes-tu76rh` —
  `e2ee87460eefaf896ddef575b998c83dad84e8dc` (supplied as PR #20's active audit
  branch; its code was not inspected).

The remote source-and-handoff commit `ed505f5` records the dynamic-i18n extractor
work and its tests. Its change summary names only `packages/web/src/i18n/extract.ts`,
`packages/web/scripts/i18n-check.ts`, `packages/web/test/i18n-cli.test.ts`,
`packages/web/test/i18n-lint.test.ts`, and this handoff. The recorded result is
281 static references, 13 resolved dynamic references, zero unresolved, one
forwarder, zero unknown keys, and the same explicit `verifyView` exclusion.
Recorded commands/results at that source SHA are `npm ci --ignore-scripts
--no-audit --no-fund` passed, `npm run typecheck` passed,
`npm test -w @quietvote/web` 163/163 passed (including `i18n:check`), and
`git diff --check` passed. Five focused tests failed before the fix and passed
afterward; no assertions were removed except the CLI's obsolete expectation
that dynamic references must remain nonempty, replaced by a forwarder assertion.
No browser suite, other workspace suite, or separate production-size run was
recorded for this tooling-only change. These are handoff-recorded results and
were not rerun during this bounded pass.

Integration/ownership: the Claude-authored change is already on the existing
checkpoint branch and remains unmerged from `main`; this task only fast-forwarded
the local branch. No Claude branch was edited. The upstream handoff says one
independent read-only extractor reviewer completed but refers to a receipt that
is not present in the checked handoff text; treat that review receipt as
unverified. The prior GitHub PR metadata calls returned HTTP 403 Forbidden; this
pass did not retry them and used only read-only Git refs. No new access denial
occurred. No paid model call or additional worker was used here.

Ready/blocked rule for continuation: finish and checkpoint independently
executable accepted code and tests in the Ready queue before revisiting blocked
items. Seek only safe, in-scope alternatives; do not bypass restrictions, reword
denied work, invent approval, weaken tests, or waive real dependencies and
essential pre-release safeguards. Recheck a blocked item only when relevant
evidence, access, or explicit authorization changes. The last requirements
inventory found no additional clearly safe, unowned ordinary implementation
task; do not invent work to stay busy.

Blocked queue remains: qualified translation and terminology review; RTL,
assistive-technology, disabled-user and wider usability acceptance; registration
error-copy/`commitRoll` owner decisions; guarantee/trust/ballot/receipt/verifier
guidance and `/verify-client`/QR scope; claims-policy findings; PR #20's active
whole-codebase audit; and any main merge. Preserve the existing exclusions on
crypto/nonce, export-role, trust/authority, ballot/election verifier, and the
stopped browser-verifier tranche. Do not claim election/security/WCAG acceptance.

The Claude takeover prompt's budget rule remains in force: paid Claude use only
through the existing shared broker, within its cumulative $200 cap and any
stricter reserve; verify available budget before costly work. No budget was
spent in this handoff-only pass. The delivered continuation instructions call
for one integrator, bounded disjoint workers only where useful, strong suitable
models for difficult allowed work and efficient models for routine tasks, and
supported prompt caching only for stable non-sensitive context.

At the end of this pass, the source branch is at `ed505f5`; the following
documentation-only current-state receipt is intended to be committed and
fast-forwarded to the same existing checkpoint branch. Resolve the exact final
documentation HEAD and remote SHA at resume; `main` and all Claude branches must
remain unchanged.

## Integration note — review rounds after the restart snapshot

The restart snapshot above (commit `5fb97cb`, documentation-only, authored on the checkpoint
after `ed505f5`) was preserved unchanged; the review-round commits were rebased onto it while
still unpublished. Its "review receipt not present" note is resolved by the review-history
table in the dynamic i18n section above: the first review found six defects, so `ed505f5`'s
extractor was not final; the published source after this integration includes five fix rounds.
That section's results (177/177 web tests, typecheck, `i18n:check`) supersede the snapshot's
recorded 163/163 at `ed505f5`. Budget: no paid API request outside this Claude Code session was
made; one in-session read-only review subagent was used (six passes).

Round-6 fixes were not re-reviewed. Every round so far found smaller holes in the type-evidence
forwarder path (the six resolved references never depended on it). If a further hole is found and
the fix is not obviously small, the safe fallback is to drop forwarder evidence and let the
wrapper's call report as one dynamic reference (`translator wrapper used as a value`): the check
does not fail on dynamic references, it only loses the "0 unresolved" figure. No shared-broker or ledger
spend was made or recorded here, and no prompt-cache usage was measured or claimed.

### Publication receipt — dynamic i18n resolution

`git push origin HEAD:refs/heads/checkpoint/quietvote-ordinary-ux-20261024` fast-forwarded the
checkpoint from `5fb97cb94a2bb1244b406cac2de71a126df0e9ef` (the restart-snapshot commit, preserved)
to `efe9e4ffac183dc4b33f561f70559c33e4ab0f0d`. An earlier push of `ed505f5` had fast-forwarded it
from `c35ae44`; a later push attempt was rejected as non-fast-forward because `5fb97cb` had landed,
and the unpublished review commits were rebased onto it rather than overwriting it. Fresh
`git ls-remote` after the push: checkpoint `efe9e4f…`, `main`
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`, PR #20 branch
`e2ee87460eefaf896ddef575b998c83dad84e8dc` (unchanged). detect-secrets 1.5.0
(`--all-files --no-verify`, default plugins) over every outgoing file version (9 commits, 17 versions
of the handoff, `extract.ts`, `i18n-check.ts`, `i18n-lint.test.ts`): zero findings; the `ed505f5`
push was scanned the same way (5 versions, zero). No workflow file changed; this receipt is
documentation-only.

## Branch merge pass — 2026-10-29

Owner instruction: "merge any unmerged branches where it makes sense to merge". Inventory from a
fresh fetch of all 23 remote heads. Already contained in the checkpoint (no action):
`dazzling-cerf-n8ha3g`, `quietvote-audit-web-verifier-1`, `quietvote-board-cli-1`,
`quietvote-complete-1`, `quietvote-docs-1`, `quietvote-ui-locale-a11y-sltfb3`,
`quietvote-web-triage-1`; `quirky-curie-n5pxf5` equals `main`.

Merged into `checkpoint/quietvote-ordinary-ux-20261024` (merge commits, no rewriting; net tree
change is two docs files):

- `main` `019f4e7` (owner's `docs/HANDOFF`). The checkpoint now descends from `main`.
- `claude/quietvote-audit-qa-1` `563eec8` (`docs/audit/HANDOFF.md`, the audit stack's landing guide;
  the rest of that branch was already in the checkpoint).
- `claude/quietvote-finish-1` `e56403b`: the keep-alive test change was already present; only its
  comment wording conflicted, and the checkpoint's wording was kept (no code change).

Checks: `npm run typecheck` passed; `git diff --check` passed; claims-lint unchanged (11 findings,
non-blocking). No code changed, so suites were not rerun (177/177 web at the prior commit).

Not merged, and why:

| Branch(es) | Reason |
| --- | --- |
| `quietvote-audit-crypto-protocol-1`, `-audit-server-1`, `-audit-trustee-1`, `-audit-board-cli-1`, `-spoil-wiring-1`, `-trustee-hardening-1`, `-cli-spoil-collect-1` | crypto/protocol/trustee/server security fixes and regenerated vectors: need security review (excluded scope here) and would change code under PR #20's active audit. Land per `docs/audit/HANDOFF.md` §2 after that audit. |
| `sharp-archimedes-tu76rh` (PR #20) | active audit ownership. |
| `quietvote-ci-gates-1` | CI/dependency gate (`npm audit`, lockfile lint, cli→verifier declaration); part of the audit stack, whose handoff says its integration was never re-run as a whole. |
| `docs/readme-and-wiki` (PR #2) | superseded by the checkpoint's `wiki/` and README link; would add a duplicate `docs/wiki/`. |
| `docs-screenshots` | README/SPEC-INDEX notes that are true only of `main` ("no UI on the default branch"); wrong for the checkpoint. |

`main` was **not** changed. Landing the checkpoint on `main` is now a fast-forward, but it would put
the whole unaudited implementation on the default branch without a PR, owner review or the DCO
sign-off that CONTRIBUTING requires (the checkpoint's Claude commits carry no `Signed-off-by`), while
PR #20 is still auditing that code. That is an owner decision through a PR, not an agent merge.

## Continuation reconciliation — 2026-10-30

At entry, local `feature/ordinary-ux-20261024` was clean at `5fb97cb94a2bb1244b406cac2de71a126df0e9ef`.
The live checkpoint was `3a7ecaa03bdc9cda251b72cbea1733de605d82f5`, and `main` remained
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The local commit was an ancestor of the checkpoint
(17 commits behind, no divergence), so I fetched the named checkpoint and used `git merge --ff-only`
to advance the local branch. No edits were discarded or rewritten. At the end of reconciliation,
local HEAD matched checkpoint `3a7ecaa`; the worktree was clean. No `AGENTS.md` was found in this
checkout.

Read-only live-ref checks confirmed the ordinary branches recorded in the prior merge pass had not
advanced: `claude/quietvote-ui-locale-a11y-sltfb3` `424110d`, `claude/dazzling-cerf-n8ha3g`
`d75d4a2`, `claude/quietvote-docs-1` `5341f6f`, `claude/quietvote-web-triage-1` `e9d4cd3`,
`claude/quietvote-finish-1` `e56403b`, and `claude/quietvote-audit-qa-1` `563eec8`. Their tips are
ancestors of the checkpoint. `docs/readme-and-wiki` (`29313c3`) and
`claude/docs-screenshots` (`e671fd1`) remain unmerged and unsuitable for the reasons in the
2026-10-29 branch table; no code from them was reviewed in this pass.

The PR #20-associated ref `claude/sharp-archimedes-tu76rh` now resolves to
`2a02bd3249f3c988ef5afd8e9559fa13a959bdef`, rather than the previously recorded `e2ee874`. I read
only the ref, not its code or PR metadata. The last handoff records active audit ownership; current
PR status is unverified because prior metadata access returned HTTP 403. Preserve that ownership
and do not duplicate or inspect the audit. `main` still resolves to `019f4e7`; no merge, PR action,
or external branch change occurred.

No new independently executable accepted ordinary feature was found. The Ready queue remains empty;
do not invent work. The remaining items are the previously listed human translation/terminology and
RTL/AT/usability gates; owner decisions for registration-error copy and `commitRoll`; claims-policy
triage; PR #20's active audit; and the owner-reviewed merge process for `main`. All crypto/nonce,
export-role/authorization, trust/authority, ballot/election verification, and stopped browser-verifier
work remains excluded. No implementation or test ran during this reconciliation. The existing
177/177 web-suite result is recorded at the prior source SHA; the 2026-10-29 merge pass separately
records a passing typecheck and `git diff --check`, with no code changes in those merges. This note
does not elevate those results into security, election, WCAG, or human-language acceptance.

### Publication receipt

The continuation note above was published by commit `d967508416ab8eb5973d38c21218cfd8e150e576`.
The push fast-forwarded the owned checkpoint from `3a7ecaa03bdc9cda251b72cbea1733de605d82f5`;
fresh `git ls-remote` returned `d967508416ab8eb5973d38c21218cfd8e150e576`, while `main` remained
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The outgoing handoff-only blob was scanned with
detect-secrets 1.5.0 default plugins/filters and `--no-verify`; zero findings. The workflow file
was unchanged; its push trigger is restricted to `main`, so this checkpoint push did not trigger
CI. No implementation changes or tests were part of this publication.

## Owner continuation and merge decision — 2026-10-30

The owner explicitly approved changes and requested consolidation, appropriate merging, autonomous
continuation until project completion or available-credit exhaustion, and frequent GitHub checkpoints.
I reconciled all live branch heads; no new ordinary branch or code change was ready to consolidate.
Previously selected ordinary branches are already contained in the checkpoint. The two remaining
documentation branches are still unsuitable for the documented reasons; the security/audit branches
remain under their existing ownership and exclusions.

No merge to `main` is performed in response to the blanket approval. It does not complete PR #20's
active audit, provide its independent review evidence, or supply the missing DCO author attestation
required by repository contribution rules. The current PR #20-associated ref is
`claude/sharp-archimedes-tu76rh` at `2a02bd3249f3c988ef5afd8e9559fa13a959bdef`; this is a ref-only
observation, not confirmation of current PR status. The earlier PR metadata denial remains binding;
do not inspect that branch or retry metadata access. Keep `main` at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` until the audit, independent owner review, DCO, and
approved PR workflow gates are complete. No unmerged branch is appropriate to merge now.

Continuation policy: proceed autonomously on newly available, independently executable accepted
ordinary work, but keep a separate blocked queue and never bypass a restriction or invent a feature.
Use a single integrator and bounded disjoint workers only when they can help without duplicating an
active owner. Publish tested, secret-scanned checkpoints to the owned checkpoint branch frequently
and verify remote SHAs. Preserve sufficient available credit for a final status and handoff; before
the reported low-credit threshold, record exact refs, completed work, remaining ready/blocked items,
tests, failures, constraints and restart steps. Paid Claude use remains through the existing shared
broker and within its cap/reserve. The security, verifier, human-language and accessibility gates
listed above remain unchanged.

## Ordinary web UI QA and human-review prep — 2026-10-30

Source change at `cb624cc8b250307bb1c811b694885e27f5aadd1e` is limited to Home/Help shell
presentation: `app.ts` marks the shared navigation with `site-nav`; CSS gives its links 12px inline
spacing, 8px row spacing, wrapping, and a 44px minimum target height. A real-browser regression in
`e2e/a11y.ts` checks spacing, target height, and no overflow at 320px. Routes, copy, state, and election
flows were not changed. The screenshots exposed the prior visible defect: adjacent primary-nav links
ran together on desktop and mobile. The updated captures show clear spacing and wrap on mobile.

Checks on the source change:

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm test -w @quietvote/web` | 177 passed, 0 failed/skipped; scoped `i18n:check` reported 281 static, 13 resolved dynamic, 0 unresolved, 1 explicit `verifyView` exclusion |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts` | 13/13 Help/Home checks in light and 13/13 in dark mode |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts` | 46/46 automated checks on Home, Help and not-found pages; includes 320px reflow, 200% text scaling, forced-colors emulation, contrast sampling and the new nav regression |
| `npm run build -w @quietvote/web` | passed; build `cf734e4c27bf`, JS 190.2 kB gzip total / 93.1 kB entry; verifier page 172.0 kB |
| Visual Playwright capture | Home/Help at 1440x1000 light, 1440x1000 dark (Home), and 320x720 light: no uncaught page errors or horizontal page overflow |

The first temporary screenshot server returned 404 for `/help` because it lacked the SPA fallback;
the harness was corrected to match the existing e2e fallback and all five captures then succeeded.
Captures live only in `/tmp` and are not durable review artifacts. The tests are automated heuristics,
not WCAG conformance or assistive-technology evidence. No real election, live server, or restricted
verifier path was exercised. The broader web unit suite is ordinary regression evidence only and is
not independent security acceptance.

Human reviewer brief (not completed by this pass): review Home (`/`), Help (`/help`) and not-found in
light/dark themes at 320, 768, 1024 and 1440 CSS pixels; check keyboard-only navigation and focus
order, touch usability of the 44px nav targets, 200% zoom, platform forced-colors, and screen-reader
announcements with qualified testers. Review English help wording for clarity. Keep es/fr/de/pt-BR/ar
as machine-drafted, unreviewed and unoffered until qualified language reviewers complete the
documented workflow. This pass makes no WCAG, disabled-user acceptance, translation approval, or
election-readiness claim.

### Responsive QA and ordinary-scope code review — 2026-10-30

Starting from source checkpoint `46f77891b0b697264f7ee3e07b0830692a640544`, added a browser
regression in `packages/web/e2e/a11y.ts` that checks Home, Help and not-found at 320, 768, 1024 and
1440 CSS pixels for horizontal page, body and primary-navigation overflow. Source/test commit is
`54f90be81855e2c334705002d615e5d2ef98ff92`. A scoped review of the changed test and shared primary
navigation presentation found no further ordinary UI defect. This is not a full repository audit;
the excluded security, trust, authority, ballot/election-verifier and stopped browser-verifier areas
were not reviewed or changed.

Validation at this source commit:

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts` | 49/49 automated checks passed; responsive matrix passed on all three pages; explicitly not WCAG/assistive-technology acceptance |
| `npm test -w @quietvote/web` | 177/177 passed; `i18n:check` reported 281 static, 13 resolved dynamic, 0 unresolved, 1 explicit exclusion |
| `npm run build -w @quietvote/web` | passed; build `cf734e4c27bf`, gzip JS 190.2 KiB total / 93.1 KiB entry |
| `git diff --check` | passed |

The build output is local at `packages/web/dist`; it has not been published. There is no GitHub Pages
deployment workflow in `.github/workflows` (the existing CI workflow runs on pull requests, pushes
to `main`, and merge groups). The generated `_headers` file does not by itself configure Pages
response headers. Do not deploy a Pages preview as a workaround for the main merge gate: the
handoff's existing PR #20 audit ownership is active, its current status remains unverified after
the prior HTTP 403 on PR metadata, owner review is outstanding, and the checkpoint commits lack
the required DCO sign-off. No merge or deployment was attempted. The user has requested a merge
followed by GitHub Pages publication; reconsider only after those gates have proper evidence and
the published app's hosting behavior is reviewed. Do not forge a DCO attestation. Main remains at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`.

Remaining work is gated human acceptance (language/terminology review, qualified RTL/assistive
technology and disabled-user review, broader usability) and the owner-reviewed main merge/Pages
publication path above. The ordinary UI work selected for this pass is complete; do not invent more
features absent a concrete defect or newly accepted requirement.

### Documentation consistency follow-up — 2026-10-30

`packages/web/NOTES.md` had a stale sentence saying app messages were still parsed at runtime, despite
the same file's completed build-time precompilation section and the REQ-062 implementation above.
Updated only that ordinary status sentence to reflect the tested app build. The adjacent chunk/SRI
discussion was left unchanged. `git diff --check` and a local heading-reference check passed; no code
or tests changed for this documentation-only correction.

## Latest restart status — 2026-10-30

Local branch `feature/ordinary-ux-20261024` is at `54f90be81855e2c334705002d615e5d2ef98ff92`
before the handoff-only commit. It adds the responsive browser matrix described above. The owned
remote checkpoint was last verified at parent `46f77891b0b697264f7ee3e07b0830692a640544`; main
was `019f4e789be2ff38a5fb2d348c3b225cc87cf296`. Re-read both remote refs before publication.
The worktree should be clean after the handoff commit. No other worker owns this slice.

The web typecheck, 49-check ordinary browser run, 177-test web suite, and production build all passed
after the source/test change; the exact commands and limits are in “Responsive QA and ordinary-scope
code review” above. The changed file is only `packages/web/e2e/a11y.ts`; the generated build output
is local and ignored. No additional ordinary runtime fix was found in the scoped presentation review.

Next: inspect outgoing test + handoff diffs, scan outgoing blob versions for secrets, confirm the
checkpoint is still at `46f7789`, inspect workflow side effects, push fast-forward only to
`checkpoint/quietvote-ordinary-ux-20261024`, verify the exact remote SHA, then add a receipt. Do not
merge to `main` or deploy Pages: active PR #20 audit ownership, missing owner review and DCO remain
unresolved; no Pages workflow exists. Do not retry the prior PR metadata denial. Reconsider the
requested main merge and Pages publication only when these gates are resolved through the reviewed
process. All prior security/verifier exclusions and human acceptance gates remain active.

### Publication receipt

`git push origin HEAD:refs/heads/checkpoint/quietvote-ordinary-ux-20261024` fast-forwarded the
owned branch from `46f77891b0b697264f7ee3e07b0830692a640544` to
`157914473efa8aff2288686e12b0b94a69f8db8d`. A fresh `git ls-remote --heads origin` returned that
exact checkpoint SHA and unchanged main `019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The two
outgoing blob versions (responsive e2e regression and handoff) were scanned with detect-secrets
1.5.0, default plugins/filters and `--no-verify`; zero findings. No workflow file changed, so this
checkpoint push did not trigger the existing main-only push CI workflow. No merge, Pages deployment,
release, or external branch update occurred.

## Scoped requirements traceability — 2026-10-30

The owner confirmed the high-level architecture (organization-operated server + browser client +
CLI verifier; separately hosted client allowed; maintainer-hosted service later). This does not
approve every ADR or change the status of all specifications. `docs/plan/COMPLETION.md` has an
additive, scoped implementation-to-requirements table for ordinary web localization and
accessibility. It records the current `i18n:check` and typecheck results, cites the prior 177/177
web tests, 49/49 browser checks, and build evidence at source
`54f90be81855e2c334705002d615e5d2ef98ff92`.

The owner then approved keeping typed TypeScript catalog modules and the project-maintained ICU
precompiler. QV-13 REQ-061/062 and the section 9.1 diagram now describe those choices; QV-ADR-025
records the rationale, consequences and review triggers. This closes those two format/tool-choice
mismatches only. It does not mark translations human-reviewed or approve QV-13 as a whole. This is
not the full C2 requirement audit. Security, trust, authority, ballot/election-verifier and stopped
browser-verifier areas remain unreviewed and excluded. No product code changed; no implementation
tests were rerun solely for these documentation updates.

The checklist and handoff update was committed as `3dafe28f37c6b7b0f3fe99676b27c2b2b0c4cfd3`
and fast-forwarded the owned checkpoint from `b5d9f1ea396abdfa5dca72d39934e2bdcedb04a4`.
Fresh `git ls-remote` returned `3dafe28f37c6b7b0f3fe99676b27c2b2b0c4cfd3`; main remained
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. The two outgoing documentation blob versions were
scanned with detect-secrets 1.5.0 default plugins/filters and `--no-verify`; zero findings. No
workflow or application code changed.

## Copy/paste continuation prompt — ordinary non-server work

Continue only `djshellshoxxx/quietvote`. First read this handoff and
`docs/plan/COMPLETION.md`, then inspect `git status`, local HEAD and live refs. Preserve all local
and remote work; never reset, force-push, delete, or overwrite another owner's branch. The owner
approved the high-level self-hosted-server + browser-client + CLI architecture and approved
QV-ADR-025 (typed TypeScript catalogs plus the project-maintained build-time ICU compiler). The
latest owner checkpoint and main refs may have advanced; verify them before acting.

Work autonomously on accepted items that can be implemented and validated without creating,
exposing, or depending on a test server. Prioritize the open, in-scope ordinary web presentation,
Help/documentation, localization tooling, accessibility presentation, and local tests/builds listed
in the completion checklist and backlog. Do not invent features: if no concrete independent item is
ready, record that and stop implementation. Use existing local fixtures and browser tests only;
do not run elections or use real user data. Do not claim a complete requirements audit from a
scoped pass.

Keep the exclusions intact: do not inspect, modify, review, delegate or route around crypto/nonce,
export-role/authorization, trust/authority, ballot/election-verification, or stopped
browser-verifier work. PR #20 audit ownership remains with its owner; its current status is
unverified after prior GitHub PR-metadata access returned 403. Do not retry that metadata access or
inspect that branch. Do not merge to main until independent audit/owner-review and valid DCO gates
are evidenced. Never forge a sign-off. The owner approved GitHub Pages deployment, but Pages
settings lookup previously returned 403 and no Pages workflow exists; do not publish from a work
branch as a workaround for main gates. Continue only non-publishing prep that does not change
security settings, and report the required admin/review steps.

For code changes, reproduce a specific issue, add a focused regression without weakening existing
assertions, then run relevant tests, typecheck and web build. For documentation/spec changes, run
`git diff --check` and record the rationale. Update this handoff and the completion checklist at
coherent milestones with exact refs, changed files, commands/results, failures, remaining ready and
blocked work, and exclusions. Before an authorized checkpoint push, inspect the outgoing diff and
workflow effects, secret-scan each outgoing blob version, push fast-forward only to the owned
`checkpoint/quietvote-ordinary-ux-20261024` branch, and read back the remote SHA. Keep main and
external branches unchanged. Continue until the independent ordinary work is complete or an actual
approval/access/capacity blocker remains; then report exact evidence and limits.
