# Developer Home

> **Draft – unaudited software.** The codebase is an early implementation with failing tests (see [[Roadmap and Status]]). Specs are the source of truth; check them before writing code.

Welcome. Start here:

1. [[Getting Started Dev]]: install and run the checks.
2. [[Architecture Overview]] and [[Repository and Packages]]: how the code is organized.
3. [[Cryptographic Protocol Summary]] and [[Bulletin Board Summary]]: the two core designs.
4. [[Security Model and Threats]] and [[Testing and Conformance]]: what must hold and how it is tested.
5. [[Contributing]]: rules for commits, reviews and specification changes.
6. [[Roadmap and Status]] and [[Specification Index]].

## Ground rules

- **No hand-rolled cryptography.** Use the `@noble` libraries (decision log QV-ADR-003). Do not describe them as audited unless you have the report.
- **Specs first.** Changes to protocol, encodings, domain strings or test vectors are protocol changes and need extra review.
- **Claims follow evidence.** Do not claim anonymity or integrity beyond the threat model. See [[Privacy and Guarantees]].
- **Claims register.** Public wording is recorded in [docs/claims/claims-register-v0.md](https://github.com/djshellshoxxx/quietvote/blob/main/docs/claims/claims-register-v0.md). Check new text against it and run `node scripts/lint-claims.mjs` (banned phrases; the CI job is non-blocking). Banned phrases are listed in `docs/claims/banned-phrases.txt`.
- **Dependency licences.** Regenerate the snapshot with `node scripts/licence-snapshot.mjs` after changing `package-lock.json`. The snapshot is not legal advice.
- **Architecture decisions** go in the [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md).
