# Release evidence checklist and release-note checks

Date: 2026-11-27 (America/Vancouver)

## Accepted scope and baseline

This implements [process inventory T9](inventory-20261111/process.tasks.md#t9-release-checklistdossier-generator-and-release-notes-lint)
on PR #78 base `c110e06bc584e642e9130a82f7a16493ad8b12e3`, using Node built-ins.
The checklist follows [QV-11 §11.1 and §11.2](../11-testing-assurance.md)
and [QV-27 §7.2–§7.3](../27-project-governance-release.md), under the accepted
D-04 scope recorded by that inventory task. No release decision or new assurance
policy is made here.

`CHANGES.md` already had an Unreleased section and the required changelog
categories. Its existing content is preserved. The initial new lint run failed
with exactly two findings: the missing Experimental banner and missing
independent-review qualification. Those two statements and a tooling entry are
added; no historical release, reviewer, audit, contact, signature or approval
is fabricated.

## Checklist behavior

[`release-dossier.mjs`](../../scripts/release-dossier.mjs) reads the actual
fourteen G1–G14 rows from QV-11 and seven numbered items from QV-27 §7.3.
The item sequence and counts must match; a missing or changed table structure
refuses instead of silently omitting a gate. Full source-file byte lengths and
SHA-256 hashes are included in the output, binding the checklist definitions.

The default command emits an Unreleased/nightly Markdown checklist. JSON is
available for tooling. Both formats are deterministic for the same source,
options and file bytes, with no wall-clock timestamp or absolute machine path.
Every checkbox stays unchecked and every gate evaluation stays `not assessed`.

| Artifact observation | Recorded status |
|---|---|
| No path supplied | `not evidenced` |
| Missing, empty, unreadable, non-regular, symlinked, oversized or observed-changing file | `not evidenced`, with a fixed reason code |
| Nonempty bounded regular local file read successfully | `artifact present — not evaluated`, with path, byte length and SHA-256 |

Even a file whose contents explicitly say that tests failed receives only the
presence status. The generator does not parse the report into a gate verdict,
assess its relevance or provenance, identify independent reviewers, evaluate
findings, verify signatures, or sign off. The output always has
`assurance_level_attained: null` and `release_approval: "not assessed"`.

### Local input format

An optional manifest uses this exact schema and known item identifiers:

```json
{
  "format": "qv-release-evidence/v1",
  "gates": {
    "G1": "tests/ci.json",
    "G9": "review/audit-gate.json",
    "QV27-5": "notes/release-notes.md"
  }
}
```

These are example relative names, not evidence supplied by this change.
Paths use portable ASCII letters, digits, underscores, dots, hyphens and path
separators, with a maximum of 240 characters. Absolute paths, parent traversal,
empty path components, terminal controls and symlink components refuse. The
explicit root directory is resolved before checking its relative inputs.
The manifest is capped at 64 KiB; each artifact is capped at 8 MiB. Larger
evidence needs a separately prepared bounded pointer/hash record, consistent
with QV-11 §10; the generator does not fetch that target.

The shared [`release-input.mjs`](../../scripts/release-input.mjs) checks regular
file identity before and after opening, uses no-follow/nonblocking flags where
available, hashes through a 64 KiB buffer, and refuses observed size, time or
named-identity changes. Text inputs use fatal UTF-8 decoding. These are local
file checks, not a native custody claim against an adversarial process changing
directory ancestry during the read. No evidence contents are printed.

### Requested channels

Unreleased and every pre-1.0 version permit only `nightly` or `rc`, including
when an arbitrary existing audit artifact is supplied. A requested `stable`
channel also refuses a prerelease version and requires an actual G9 artifact.
`--audit-gate` supplies that G9 path; conflicting manifest and flag paths refuse.
File presence does not establish that G9 passed. A future stable request with
a file remains a proposal carrying the Experimental banner and unassessed
gates; this tool cannot authorize or publish it. The other release gates and
human approval remain outside this presence-only mechanism.

```sh
node scripts/release-dossier.mjs
node scripts/release-dossier.mjs --json
node scripts/release-dossier.mjs --version 0.9.0-rc.1 --channel rc \
  --root /path/to/local/evidence --evidence evidence-map.json --json
```

The last command shows syntax for a proposed version, not an existing release.
Output goes to stdout; the tool does not write an evidence directory, sign
anything, invoke GitHub, or perform network requests. Exit 1 indicates a
channel/audit prerequisite refusal; exit 2 indicates invalid/unavailable input.
A checklist containing unevidenced items exits 0 because no gates are being
evaluated.

## Release-note wording and CI

[`lint-release-notes.mjs`](../../scripts/lint-release-notes.mjs) checks the
current Experimental profile. It requires these exact visible paragraphs:

> Experimental — not for binding elections
>
> QuietVote has not yet been independently reviewed.

The first comes from QV-27 §7.2; the second supplies the required qualification
from QV-11 §11.2. Neither is a claim that the L-0 gates have been attained.
Comments, fenced examples, inline code, block quotes and indented code cannot
stand in for the required plain paragraphs.

The lint reads the existing [banned-phrase policy](../claims/banned-phrases.txt)
and adds the copy restrictions already listed in [QV-10 §7.5](../10-user-experience.md).
It retains literal word boundaries, case-insensitive rules and documented
conditional forms. Explicit negation uses a bounded sentence-local heuristic;
conditional context cannot cross a sentence/paragraph boundary to borrow the
required disclaimer. General claims-lint ignore markers do not exempt positive
release-note claims. This heuristic does not establish semantic truth or replace
the required claims review. The general public-claims lint and its policy file
are unchanged.

By default the tool checks `CHANGES.md`; explicit file arguments are also
supported. Notes are capped at 256 KiB each, with at most 16 files. Exit 0 means
the mechanical wording checks passed, exit 1 indicates wording findings, and
exit 2 indicates usage/input refusal.

```sh
node scripts/lint-release-notes.mjs
node scripts/lint-release-notes.mjs path/to/proposed-notes.md
```

The existing [`claims-lint.yml`](../../.github/workflows/claims-lint.yml)
`docs-checks` job gains the focused tool tests and a blocking release-note lint
step. Its unrestricted pull-request trigger includes documents-only changes.
The existing general claims step remains non-blocking. No new action,
dependency, token permission, release workflow or signing operation is added.

## Validation

Validation uses Node 24.22.3 on the local Linux workspace. Dedicated tests
cover the exact 21 source items, unchanged unevidenced states, deterministic
output and known byte hashes, invalid evidence kinds and paths, source drift,
pre-1.0 refusal even with evidence, stable prerequisite refusal, non-promotion
despite present failing reports, actual CLI exit outcomes, visible banner
requirements, phrase/negation regressions and documents-only workflow coverage.

```sh
node --test scripts/release-dossier.test.mjs scripts/lint-release-notes.test.mjs
node --test .github/scripts/check-action-pins.test.mjs .github/scripts/check-workflow-coverage.test.mjs
node .github/scripts/check-action-pins.mjs
node scripts/lint-release-notes.mjs
node scripts/check-links.mjs
node scripts/trace.mjs --check
git diff --check
```

Dedicated checks: **24/24 tests pass**. Composed with the existing action-pin
and workflow coverage regressions: **42/42 pass**, zero skipped, 6.835 seconds.
All three existing workflows pass the action-pin scanner. The actual release-note
lint reports zero findings; the relative-link check reports 2,943 links in 446
files with none broken. Requirement traceability structural checks and
`git diff --check` pass. No full application suite was repeated for these
standalone tools. No hosted or native Windows execution is claimed by this report.
