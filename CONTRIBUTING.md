# Contributing to QuietVote

QuietVote is in its **specification and early implementation** phase. Specifications are drafted and the core crypto, protocol, and bulletin-board packages have initial implementations that are not yet audited. Read [docs/](docs/) for the specifications and [docs/30-engineering-standards.md](docs/30-engineering-standards.md) for the engineering rules.

## Sign-off (DCO)

Every commit must carry a `Signed-off-by:` line certifying the [Developer Certificate of Origin](DCO). Use `git commit -s`. The name and email must match the commit author. The `dco` check fails commits without it. There is no CLA. Contributions are accepted under AGPL-3.0-or-later.

## Development

Requires Node.js 22.18 or later.

```sh
npm ci
npm run check    # typecheck, then tests across workspaces
```

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
