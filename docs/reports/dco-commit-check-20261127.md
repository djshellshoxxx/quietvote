# DCO and commit-format gate — 2026-11-27

## Scope and plan

The accepted process inventory T1, QV-25-REQ-003 and QV-30-REQ-019 require
matching author sign-offs and Conventional Commit subjects. The previous source
documented manual review because no automated DCO workflow existed. This
increment implements the existing rules without changing their provenance or
inventing an exemption for bots, merges or historical commits.

The plan was to inspect actual PR-range commits, use Git's trailer parser, add
distinguishing temporary-repository tests, and run the same command in a
read-only PR workflow. All implementation uses Node built-ins and Git. No npm
package or new third-party action is introduced.

## Implemented behavior

`scripts/check-dco.mjs --base REF --head REF` resolves both endpoints to commit
objects and visits every commit reachable from head but not base, including
merged side branches. It does not inspect only the first parent or count GitHub's
synthetic PR merge commit as a contributor commit. Equal endpoints select zero
commits. The optional `--repo DIR` supports an explicit checkout, including a
path containing spaces.

Raw commit messages use Git's `--no-divider` trailer mode, so a Markdown
horizontal rule neither hides a later sign-off nor truncates later body prose.
Each commit must have a final `Signed-off-by:` trailer whose value exactly
matches the commit's author name and email. Another person's trailer does not
suffice; a matching trailer alongside other sign-offs is allowed. Body prose
that resembles a sign-off is not accepted. The subject must use one of the ten
documented Conventional Commit types, optional scope and breaking marker,
followed by a nonempty description. Control characters are rejected. The
72-character limit counts Unicode code points. Reviewers still judge imperative
wording and whether a requirement `Refs:` footer applies.

Exit statuses are 0 for a passing range, 1 for a failed commit rule, and 2 for
usage or inspection failure. Text and deterministic JSON reports contain full
commit IDs and finite issue codes; they omit author identities, message bodies
and arbitrary Git error output. The checker does not edit commits or add an
attestation.

The PR-only `.github/workflows/dco.yml` runs on opening, updates, reopening and
PR edits. It checks out the exact PR head with complete history, grants only
`contents: read`, disables credential persistence, and passes base/head SHAs
through environment variables into quoted command arguments. Existing pinned
first-party checkout/setup-node revisions are reused. The test suite runs
before the actual range check. Docs-only changes also receive this workflow.

## Verification

The initial thirteen focused tests passed using real temporary Git repositories. They
cover exact and mismatched names/emails, missing trailers, body-only lookalikes,
multiple sign-offs, Unicode names/lengths, no bot exemption, merged side commits,
merge subject format, empty ranges, deterministic JSON, explicit repository
paths and bounded invalid-input diagnostics. The merged-side fixture contains
an unsigned side commit that a first-parent-only scan would miss.

The initial combined focused and existing workflow tests passed **31/31**, with no
failures or skips. The action-pin scan then correctly rejected an inline YAML
event list unsupported by the repository's conservative scanner. Changing only
that list to the existing block form made the scan pass for all four workflows;
the scanner and its enforcement remain unchanged. `git diff --check` passes.

Separate source review identified Git's default patch-divider handling as
incorrect for raw commit messages. Two new tests reproduce both errors: a real
final sign-off after a horizontal rule was rejected, while an apparent sign-off
before that divider and later body prose was accepted. Both fail against the
initial implementation. Adding only `--no-divider` corrects their interpretation;
the final fifteen focused tests plus eighteen existing workflow tests pass
**33/33**, with zero failures or skips. All four action-pin scans, claims lint
and `git diff --check` pass. Repeating both actual-history checks with the
corrected parser yields the same counts recorded below.

The actual published PR77 delta from
`d38c55c3d6f0d8254967efea066cd282c4012553` to
`6764bf231801a782a57b2778a344c6ab26063e9b` passes: one selected commit, no issues.
A read-only check from main `019f4e789be2ff38a5fb2d348c3b225cc87cf296` to that
same head selects **556 commits**, of which **216 pass** and **340 fail** at least
one rule. Overlapping issue counts are 241 missing sign-offs, nine author
mismatches, 103 subject-format failures and 114 length failures. These are
observations of the existing history, not new attestations or rewritten commits.

## Remaining owner and review boundaries

Repository settings must designate the check as required if it is to block
branch promotion. Both the workflow and checker remain editable by the PR, so
maintainer review of those files is necessary. A green result is not independent
enforcement against changes to the checking code; an owner-controlled required
workflow or external check would need separate configuration. The read-only
`pull_request` event is retained, with no automatic switch to a privileged
event. PR-only scope does not invent a DCO for a merge-queue-generated
commit. Historical authors must supply any missing attestations through the
project's adopted provenance process. This tool does not establish legal
ownership, a cryptographic commit signature, a completed security review or
release readiness. The existing formal review and promotion requirements remain.
