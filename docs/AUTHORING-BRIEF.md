# Authoring Brief (shared by all spec/research authors)

Read first: `README.md`, `docs/SPEC-INDEX.md`, `docs/decision-log.md` (baseline ADRs 001–013 are binding), `docs/templates/SPEC-TEMPLATE.md`, and your assigned framework docs.

## Project stance
QuietVote is a minimal-trust, exit-friendly, crypto-libertarian private voting system: verify don't trust; operator is untrusted for secrecy/integrity; no mandatory identity/KYC; no token/chain; full export; honest guarantees (never claim more than the threat model supports; list non-claims).

## Rules
1. Write only the files assigned to you. Do NOT edit `docs/SPEC-INDEX.md` or `docs/decision-log.md`; put proposed new/changed decisions in a "Proposed ADRs" section of your own doc (use IDs `QV-ADR-P<spec#>-n`).
2. Follow the spec template (all 13 sections where applicable; add sections as needed). Set `Status: Draft` (or `Review` if truly complete) and last-reviewed 2026-10-21.
3. Requirements: stable IDs `QV-<spec#>-REQ-nnn`, normative language (shall/should), priority (Must/Should/Could), testable acceptance criteria, verification method. Cross-reference other specs by ID. Aim for complete, engineer-ready detail: concrete parameters, formats, state machines, tables, error codes, algorithms, failure modes, and worked examples — not placeholders. Close open questions where you can (state the decision and rationale); list the rest in an explicit table with owner and proposed default.
4. Research: use WebSearch/WebFetch to verify facts (standards numbers, library versions, attack names, legal citations). Cite sources with URLs and access date in a "References" section. Never invent citations; mark unverifiable claims `[UNVERIFIED]`.
5. Do not invent cryptography. Use standard, published constructions; cite the paper/RFC for each.
6. Be dense and concrete; avoid filler. Markdown only. Mermaid diagrams welcome.
7. Don't write application code (that's a later phase) except short illustrative pseudocode/snippets.
8. Final reply to the orchestrator: ≤120 words — files written, key decisions made, unresolved cross-spec conflicts or ADRs proposed.
