# Contributing to QuietVote

QuietVote is in its **specification and early implementation** phase. Specifications are drafted and the core crypto, protocol, and bulletin-board packages have initial implementations that are not yet audited. Read [docs/](docs/) for the specifications and [docs/30-engineering-standards.md](docs/30-engineering-standards.md) for the engineering rules.

## Sign-off (DCO)

Every commit must carry a `Signed-off-by:` line certifying the [Developer Certificate of Origin](DCO). Use `git commit -s`. The name and email must match the commit author. Sign-off is required for every contribution. The pull-request [DCO workflow](.github/workflows/dco.yml) checks every commit reachable from the PR head but not its base, including merged side branches. It checks the actual contributor commits rather than GitHub's synthetic merge commit. A matching sign-off must appear in the final Git trailer block; a name in body prose is insufficient. No bot or merge-commit exemption is applied.

Run the same check locally using the intended PR base and head:

```sh
node scripts/check-dco.mjs --base origin/main --head HEAD
```

For a stacked PR, use its actual base branch. `--repo DIR` selects another checkout and `--json` emits a deterministic report containing commit IDs and fixed issue codes. Exit status 0 means all selected commits passed, 1 means a sign-off or subject rule failed, and 2 means usage or Git inspection failed. Equal base and head select no commits. The check verifies the exact author name/email, Conventional Commit subject syntax and the 72-character subject limit. Reviewers still assess imperative wording and whether a `Refs:` footer is required; the tool does not infer those judgments.

The workflow becoming a required branch-protection check remains a repository-owner setting. The workflow and checker are editable in the PR, so maintainers must review changes to those files; a green result alone is not independent enforcement against altering the checker. An owner-controlled required workflow or external check would need separate configuration. Many historical commits have no `Signed-off-by` trailer; whether and how to attest to them retroactively remains an owner decision. The checker does not add trailers, rewrite commits, or attest to anyone's contribution. There is no CLA. Contributions are accepted under AGPL-3.0-or-later.

## Development

Requires Node.js 22.18 or later.

```sh
npm ci --ignore-scripts
npm run vendor:install
npm run check    # vendor integrity, typecheck, then tests across workspaces
```

`vendor:install` verifies the two exact Noble releases against their published tarballs, the registry lockfile and `VENDOR.lock`, then installs copies from `vendor/`. Run it after every `npm ci`; lifecycle scripts stay disabled. `npm run vendor:check` verifies the installed bytes and actual module resolution. See [vendor provenance and update instructions](vendor/README.md).

Commit messages follow Conventional Commits (`feat(board): ...`, `fix(crypto): ...`) with a subject of 72 characters or fewer, and include a `Refs:` footer with the requirement IDs where they apply.

Keep pull requests small (about 400 changed lines or fewer, excluding generated files and vectors). Use the pull request template checklist.

## Specification contributions

- Link proposals to a spec ID and requirement ID where possible.
- Separate confirmed requirements from hypotheses and open questions.
- Include acceptance criteria and verification methods.
- Explain security, privacy, accessibility, and operational consequences.
- Do not claim anonymity or election integrity without a defined threat model and evidence.
- Update the spec index ([docs/SPEC-INDEX.md](docs/SPEC-INDEX.md)) and decision log ([docs/decision-log.md](docs/decision-log.md)) when scope or an accepted decision changes.
- Avoid selecting a cryptographic construction or protocol without expert review.
- Changes to test vectors, domain separation strings, or encodings are protocol changes and need security review.

## Security

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

## Current project status

The specifications are drafts. Review by the project owner is required before they become approved implementation contracts. The implementation has not been audited and QuietVote is not for real elections. See the [README](README.md#current-status), [wiki/](wiki/), and [docs/plan/](docs/plan/) for the current roadmap and open work.
