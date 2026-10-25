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
