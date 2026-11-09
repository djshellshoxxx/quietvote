# Contributing

> **Draft – unaudited software.** Project is in its specification phase.

Read [CONTRIBUTING.md](https://github.com/djshellshoxxx/quietvote/blob/main/CONTRIBUTING.md) first. Full rules: spec [30 Engineering standards](https://github.com/djshellshoxxx/quietvote/blob/main/docs/30-engineering-standards.md).

## Specification contributions

- Link proposals to a spec ID and requirement ID.
- Separate confirmed requirements from hypotheses and open questions.
- Include acceptance criteria and a verification method.
- Explain security, privacy, accessibility and operational effects.
- Do not claim anonymity or integrity without a defined threat model and evidence.
- Update the [Specification Index](https://github.com/djshellshoxxx/quietvote/blob/main/docs/SPEC-INDEX.md) and [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md) when scope or an accepted decision changes.
- Do not choose a cryptographic construction without expert review.

## Code contributions

- **Sign off every commit** with `git commit -s` (Developer Certificate of Origin, DCO; decision QV-ADR-011). The DCO check is planned but not yet in the repo.
- **Conventional Commits:** `feat`, `fix`, `test`, `docs`, `build`, `ci` and so on, with the package as scope. Subject 72 characters or fewer. Add a `Refs:` footer where possible.
- **Pull requests** should stay near 400 changed lines or fewer. Larger ones need a design note.
- **Reviews:** the author cannot approve their own pull request. Crypto or protocol changes need at least two approvals, one from the security reviewers.
- **Never commit secrets** or large generated binaries.
- Run [[Getting Started Dev]] checks before opening a pull request.
- Public text (README, docs, wiki) must match the [claims register](https://github.com/djshellshoxxx/quietvote/blob/main/docs/claims/claims-register-v0.md). Run `node scripts/lint-claims.mjs` and fix what it reports in files you change.

## Review checklist highlights

Threat-model impact considered, tests added, no new dependency without a decision record, docs updated, protocol version impact assessed.

## Licence

AGPL-3.0-or-later for code (`LICENSE` file present). CC BY-SA 4.0 is proposed for docs (QV-ADR-011).
