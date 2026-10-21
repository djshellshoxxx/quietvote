# QV-04 — Identity and Eligibility

**Module ID:** `identity-eligibility`  
**Status:** Framework  
**Objective:** Define how a group establishes eligibility and prevents duplicate participation while limiting unnecessary identity disclosure.

## Identity modes to compare

- Named account managed by the organization
- Pseudonymous account
- Invitation or group-issued credential
- External identity provider
- Privacy-preserving proof of membership
- Hybrid mode selected by each organization

For each mode, document setup friction, linkability, recovery, administrator visibility, collusion assumptions, and operating cost. Do not claim anonymity merely because display names are hidden.

## Eligibility lifecycle

Specify how membership is created, verified, suspended, revoked, renewed, and snapshotted for a ballot. Define whether eligibility is fixed when a decision opens or evaluated at submission time.

## Duplicate-vote prevention

Document the mechanism ensuring one permitted participation per eligible member, including how it behaves if a member changes devices, loses a credential, or submits from multiple sessions. State what metadata the mechanism exposes.

## Recovery and changes

Specify account or credential recovery, member role changes, lost-device handling, credential rotation, suspected compromise, and handling of a recovery during an open ballot. Describe any possibility that recovery links a person to a ballot.

## Requirements and tests

- Eligibility rules are visible before voting.
- Ineligible members cannot submit a valid ballot.
- A member cannot exceed the permitted ballot count.
- Recovery does not silently alter a submitted ballot or tally.
- Administrative actions are logged without exposing ballot choices.
- All requirements identify an adversary model and verification method.

## Open questions

- Who is authoritative for a group's membership?
- Can a group offer different identity modes?
- Is anonymous participation a group setting, participant choice, or both?
- How are lost credentials recovered without enabling impersonation?
- Must observers be able to verify eligibility counts independently?
