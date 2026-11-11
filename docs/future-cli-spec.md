# QV-FUTURE-CLI — Future command-line interface
Status: DRAFT / FUTURE ONLY; not approved. QuietVote is at the specification stage. This document does not claim implemented cryptography, anonymous ballots, or a working CLI.

## Objective
Provide headless administration and independently reproducible verification for voluntary-group elections, using the same policy, eligibility, ballot and tally protocols as the eventual application. CLI must not create a second security model.

## Proposed commands (subject to protocol selection)
- `quietvote --help|--version`; `quietvote doctor`; `quietvote config validate`; `quietvote init`
- `quietvote org create|show`; `quietvote member list|import|status`
- `quietvote proposal create|show|list`; `quietvote election create|show|open|close`
- `quietvote ballot prepare|submit|status`; `quietvote tally compute|show`
- `quietvote verify election --evidence DIR --offline --json`
- `quietvote audit export|verify`; `quietvote key generate|inspect|rotate`
No command should promise anonymous voting until an approved, independently reviewed protocol supports it. Secret key operations must use vetted key stores and avoid exposing material in shell arguments or logs.

## Trust and privacy constraints
Enforce role-specific authorization, eligibility and duplicate-vote protections. Election rules become immutable once voting starts except through an explicit auditable protocol-defined process. Separate identity and ballot records wherever the chosen protocol permits. Never expose member-to-ballot linkage through JSON, logs, audit exports or debug flags. Audit exports should be independently verifiable while minimizing personal data. Offline verification must verify all published commitments/proofs supported by the selected protocol and clearly report what cannot be verified; do not silently equate signatures with ballot secrecy or tally correctness.

## Interface contract
Contextual help; `--json`, `--quiet`, `--verbose`, timeouts, noninteractive mode, deterministic and versioned JSON, stdout data/stderr diagnostics, stable exit codes (0 success, 2 invalid input, 3 failure, 4 no result, 5 cancelled). Require explicit confirmation for destructive operations and avoid interactive prompts in CI. Accessible human-readable diagnostics and documentation for Windows/Linux/macOS.

## Acceptance criteria
1. CLI and GUI/API share one canonical election policy and validation implementation.
2. Invalid eligibility, duplicate voting and closed-election submissions are rejected without state change.
3. Offline verifier catches modified evidence, missing records and inconsistent tally proofs.
4. Audit exports contain no unnecessary voter-identifying data; privacy tests exercise logging/errors.
5. Repeated tally/verification on identical evidence is deterministic.
6. Help/JSON/exit-code contracts pass automated tests without GUI.
7. End-to-end election fixtures cover creation, eligible voting, close, tally, verification and failed/adversarial cases.
Protocol-dependent tests are BLOCKED until the underlying protocol is selected and implemented; never substitute toy cryptography.

## Delivery phases
F0: settle election model, privacy threat model, approved cryptographic protocol and CLI boundaries.
F1: read-only configuration, diagnostics and election inspection.
F2: organizer and member workflows reusing approved APIs.
F3: standalone offline evidence verifier, adversarial fixtures, packaging and docs.
Defer implementation until prerequisite specifications are approved; this is future planning only.
