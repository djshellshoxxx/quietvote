# QV-03 — Governance and Policy

**Module ID:** `product-policy`  
**Status:** Framework  
**Objective:** Specify which governance rules a group may configure, how they are made visible, and how disputes are handled.

## Decision lifecycle to specify

Proposed stages: draft → review → scheduled/open → closed → tallying → published → challenged/resolved → archived. Confirm or replace this lifecycle. Define valid transitions, authorized roles, deadlines, and immutable records for each transition.

## Policy topics

- Who may create proposals and ballots
- Required review and amendment periods
- Eligibility snapshot or eligibility-at-vote-time rule
- Quorum and participation thresholds
- Vote method, tie handling, abstention, and invalid ballot handling
- Whether voting is one-time, revocable, or changeable before close
- Extensions, pauses, cancellation, and emergency termination
- Result disclosure and audit windows
- Challenge, recount, and appeal procedure
- Member notice and consent to published rules
- Group-specific policy versus platform-enforced constraints

## Rule transparency requirements

Before a ballot opens, participants should be able to inspect:

- The proposal text and its version
- Who is eligible and the eligibility cutoff
- Voting method and any weighting
- Opening and closing conditions in the member's local context
- Quorum and pass/fail thresholds
- Whether votes may be changed
- What is revealed during and after voting
- Available verification and dispute process

Define how QuietVote records acceptance of rules and protects against silent changes after opening.

## Roles and authority matrix

| Action | Member | Organizer | Admin | Observer | Platform operator |
|---|---|---|---|---|---|
| View published rules | TBD | TBD | TBD | TBD | TBD |
| Create/edit proposal | TBD | TBD | TBD | TBD | TBD |
| Open/close ballot | TBD | TBD | TBD | TBD | TBD |
| View individual choice | TBD | TBD | TBD | TBD | TBD |
| Verify tally evidence | TBD | TBD | TBD | TBD | TBD |
| Export/delete records | TBD | TBD | TBD | TBD | TBD |

Do not assume the platform operator should have ballot access; explicitly assess and specify the trust model.

## Open questions

- What voting and quorum rules are mandatory for the first release?
- Which policy settings are unsafe or too complex to expose?
- Can group administrators change eligibility after opening?
- How are minority reports, abstentions, and tied results handled?
- Who decides a dispute, and can that decision be appealed?
