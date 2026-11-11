# CI action-pin qualification — 2026-11-09

Baseline: `51851c10`. Code commit: `1f8aad92342860fa15ed0619ada627e5f081ca89`.
Scope: `.github` pin checker, regression tests and workflow configuration.
Requirement: QV-30-REQ-015. No dependency or protocol changes.

The checker rejects empty workflow roots/files, empty action values, malformed
references, extra suffixes and non-SHA remote references. Simply quoted keys and
values are checked. To avoid silently missing action keys in flow collections,
aliases or tagged/escaped keys, it requires ordinary keys and block collections;
empty collections remain allowed. It ignores literal/folded run-block contents.

CI now runs the checker regression suite before scanning actual workflows.
Existing workflow collection syntax was converted without changing its values.
The existing temporary pseudo-locale Playwright installation now explicitly uses
`--ignore-scripts`; its separate pinned version remains unchanged.

Validation on Node `v24.22.1`:

| Check | Result |
|---|---|
| `node --test .github/scripts/check-action-pins.test.mjs` | 11 test groups passed, 0 failed, 0 skipped |
| `node .github/scripts/check-action-pins.mjs` | All 3 workflow files passed |
| `git diff --check` | Passed |
| Local PyYAML structural comparison with baseline | All 3 workflows retain their parsed structure except the added test step and explicit install-script prohibition |

Independent review reproduced flow, alias-key and document-start-marker bypasses
and an inline-comment false positive. Regressions now cover those cases. The
reviewer reran all 11 test groups and the actual 3-file scan on pre-amend commit
`46f7243746ce02726cbabf92cc484faa01c43f21`, with no remaining blocking finding.
The final amendment only corrects outer YAML quoting in a positive test fixture;
the complete suite and scan were rerun after that change.

Limits: this remains a bounded action-pin scanner, not an arbitrary YAML parser
or workflow-schema validator. No GitHub-hosted workflow run was observed here.
The temporary pseudo-locale runner remains Playwright `1.62.0`, separate from
the root lockfile's Playwright `1.57.0`; reconciling those versions is outside
this change. Required external/security review and broader release gates remain
unchanged.
