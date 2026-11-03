# Developer Home

> **Draft – unaudited software.** The codebase is an early scaffold. Specs are the source of truth; check them before writing code.

Welcome. Start here:

1. [[Getting Started Dev]]: install and run the checks.
2. [[Architecture Overview]] and [[Repository and Packages]]: how the code is organized.
3. [[Cryptographic Protocol Summary]] and [[Bulletin Board Summary]]: the two core designs.
4. [[Security Model and Threats]] and [[Testing and Conformance]]: what must hold and how it is tested.
5. [[Contributing]]: rules for commits, reviews and specification changes.
6. [[Roadmap and Status]] and [[Specification Index]].

## Ground rules

- **No hand-rolled cryptography.** Use the audited `@noble` libraries (decision log QV-ADR-003).
- **Specs first.** Changes to protocol, encodings, domain strings or test vectors are protocol changes and need extra review.
- **Claims follow evidence.** Do not claim anonymity or integrity beyond the threat model. See [[Privacy and Guarantees]].
- **Architecture decisions** go in the [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md).
