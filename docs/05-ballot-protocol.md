# QV-05 — Ballot Protocol

**Module ID:** `ballot-engine`  
**Status:** Framework  
**Objective:** Define ballot formats, vote submission, tallying, and what participants can independently verify.

## Protocol guarantees to define separately

For each guarantee, specify the adversary, assumptions, and evidence:

- Ballot secrecy from other members
- Ballot secrecy from organizers and platform operators
- Eligibility enforcement
- Duplicate-vote prevention
- Cast-as-intended, recorded-as-cast, and tallied-as-recorded verification
- Tally correctness and reproducibility
- Integrity under server or administrator compromise
- Coercion resistance and vote buying (likely unsupported unless proven)
- Availability and graceful failure
- Revoting or ballot replacement behavior

Avoid using “anonymous” as a blanket guarantee. State what is protected from whom and under which assumptions.

## Voting methods to evaluate

- Single-choice / yes-no
- Multiple selection
- Approval voting
- Ranked-choice
- Weighted voting
- Delegation or proxy voting
- Quorum and supermajority rules

For each method, define encoding, invalid-ballot handling, tally algorithm, tie behavior, audit procedure, and known limitations. Select the MVP methods explicitly.

## Protocol lifecycle

Specify ballot definition/versioning, eligibility setup, open/close events, ballot submission, receipt behavior, tally computation, result publication, verification, challenge/recount, and archive. Identify which artifacts are public, group-visible, participant-only, or secret.

## Threat-model dependencies

Protocol selection must follow decisions in QV-03, QV-04, and QV-07. Include a cryptographic review plan and reference primary protocol literature before implementation. Record algorithm and library choices in an ADR; do not invent cryptography.

## Open questions

- Is a trusted organizer acceptable for the first release?
- Must the server be unable to decrypt individual ballots?
- Is public verifiability required, or is group-only verification enough?
- How can a member confirm inclusion without revealing their choice?
- What is the acceptable complexity for members and observers?
- What failure should stop the ballot versus allow a documented fallback?
