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
