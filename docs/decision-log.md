# QuietVote Decision Log

Record decisions that affect product scope, privacy guarantees, protocols, architecture, deployment, or project governance. Keep rationale and rejected alternatives so later contributors can understand the tradeoffs.

## Decision template

### QV-ADR-NNN — [Short title]

- **Status:** Proposed / Accepted / Superseded / Rejected
- **Date:** YYYY-MM-DD
- **Decision owner:** [role/person]
- **Context:** [Problem and constraints]
- **Decision:** [What is selected]
- **Alternatives considered:** [Options]
- **Consequences:** [Benefits, costs, privacy/security effects]
- **Requirements affected:** [IDs]
- **Review trigger:** [What evidence would reopen this]

---

## Initial decisions

No architecture, cryptographic protocol, voting method, deployment model, license, or monetization model is approved yet. The repository README and charter capture project direction, not final technical decisions.

### QV-ADR-000 — Create a specification-first framework

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Project owner
- **Context:** The project is newly created and needs a structured way to settle product and engineering questions before implementation.
- **Decision:** Establish a documentation index, capability map, charter, and module specification framework before writing application code.
- **Alternatives considered:** Begin implementation from a high-level concept; write a single monolithic specification.
- **Consequences:** The repository begins with explicit open questions and proposed module boundaries. No implementation decisions are implied. The capability map requires review before module specs become approved.
- **Requirements affected:** None yet.
- **Review trigger:** Project owner review of the capability boundaries and initial target users.
