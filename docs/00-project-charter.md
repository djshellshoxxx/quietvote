# QV-00 — Project Charter

**Status:** Draft  
**Owner:** Project owner — to be recorded  
**Last reviewed:** Not yet reviewed

## Objective

Explore and specify a privacy-preserving governance platform that lets voluntary groups run member decisions with private ballots and verifiable outcomes. QuietVote should help groups define decision rules openly, prove that a tally follows those rules, and limit disclosure of each member's choice.

## Problem statement

Many online decision tools centralize member identity, participation records, and ballot choices. Groups may want a way to make collective decisions without exposing individual votes or depending on one platform operator. QuietVote will investigate a practical design that balances ballot secrecy, eligibility, auditability, usability, and operational simplicity.

## Intended users

Primary users are organizers and members of voluntary groups, including cooperatives, unions, collectives, member associations, and online communities. Auditors or observers may need to verify procedure and tally without seeing individual choices.

**Initial target group:** To be selected.  
**Initial deployment setting:** To be selected.  
**Primary user research evidence:** To be added.

## Product principles

- Make rules visible before participation begins.
- Separate identity and eligibility data from ballot selections wherever feasible.
- Give groups control over membership and governance policies.
- Explain verification and privacy properties in plain language.
- Design for hosted and self-hosted use as separate operating models.
- Make no anonymity, coercion-resistance, or security claim without a defined threat model and evidence.

## Project boundaries

### Candidate initial scope

- Organization and decision setup
- Membership and eligibility management
- Proposal and ballot lifecycle
- Private vote submission
- Configurable tally methods
- Results, audit evidence, and dispute workflow
- Privacy and security documentation

### Explicitly out of scope until reconsidered

- Government/public elections
- Legally certified corporate elections
- On-chain voting or token-based governance as a default
- Custody or transfer of funds
- Identity-document verification as a default
- Claims of protection against every coercion, endpoint compromise, or administrator threat

## Success measures to define

- Member comprehension of ballot rules and privacy limits
- Correct enforcement of eligibility and duplicate-vote rules
- Independent reproduction or verification of the published tally
- Usability across chosen assistive technologies and devices
- Measured data minimization and deletion behavior
- Successful deployment and recovery exercises
- Adoption and sustainability metrics for the selected target group

Numeric targets, measurement methods, and release thresholds remain open.

## Assumptions requiring validation

1. Organizations will value ballot privacy and verifiable procedures enough to change tools.
2. A first product can focus on a specific type of voluntary group.
3. Participants can use a mix of real names and pseudonyms, subject to group policy.
4. A hosted service and self-hosted deployment may need different trust and support models.
5. A software specification can distinguish privacy properties from public marketing claims.

Validate or reject each assumption through research and documented decisions.

## Open decisions

- Which group type is the first target?
- Is the product hosted, self-hosted, or both for the first release?
- Is participation account-based, invite-based, credential-based, or mixed?
- Which voting methods are required in the MVP?
- Which privacy properties are mandatory, optional, or explicitly unsupported?
- What is the minimum viable audit record?
- What license and governance model will apply to the software?
- What success thresholds make the first release acceptable?

## Approval

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |
