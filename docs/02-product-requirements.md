# QV-02 — Product Requirements

**Module ID:** `product-policy`  
**Status:** Framework  
**Purpose:** Turn the charter into a bounded MVP and testable user requirements.

## User groups to validate

- Member eligible to participate
- Organizer who configures a decision
- Observer or auditor who checks the process and result
- Organization administrator who manages membership and policy
- Service operator, if hosted operation is selected

For each group, document goals, constraints, technical access, privacy needs, and consequences of exclusion.

## Candidate user journeys

1. An organization configures its rules and membership source.
2. An organizer drafts a proposal and ballot, previews the rules, and opens voting.
3. A member verifies eligibility, reviews the privacy notice, and submits a ballot.
4. A member confirms whether their ballot was accepted without revealing its choice.
5. An observer checks the published result and available audit evidence.
6. An organizer closes or cancels a decision and handles a challenge.
7. An organization exports records or leaves the service.

Map alternate paths, errors, accessibility needs, and privacy implications for each journey.

## Requirement areas

- Organization creation and configuration
- Membership and roles
- Proposal lifecycle and amendments
- Ballot construction and preview
- Opening, closing, pausing, canceling, and extending a decision
- Vote submission and confirmation
- Tally methods and result publication
- Audit evidence and challenges
- Notifications and reminders
- Data export, retention, and deletion
- Hosted and self-hosted administration

## MVP boundary worksheet

| Capability | MVP? | Rationale | Dependencies |
|---|---|---|---|
| Basic majority ballot | TBD | TBD | QV-03–QV-05 |
| Ranked-choice ballot | TBD | TBD | QV-05 |
| Anonymous eligibility credential | TBD | TBD | QV-04 |
| Publicly verifiable tally | TBD | TBD | QV-05 |
| Self-hosted deployment | TBD | TBD | QV-08 |
| Hosted multi-organization service | TBD | TBD | QV-08, QV-12 |

## Acceptance criteria

Write criteria in observable form. Examples to refine, not approved requirements:

- An eligible member can submit no more ballots than the published rule allows.
- A member can understand the ballot, closing time, and privacy limits before submitting.
- A group can reproduce or verify the published tally using the documented evidence.
- The system exposes no ballot-choice-to-member mapping through ordinary organizer views.

Specify edge cases, failure behavior, and exact test methods before approval.

## Open questions

- What is the first target organization type?
- Which single decision flow makes a useful MVP?
- What participation and quorum rules must be supported?
- Can ballots be changed or withdrawn before close?
- What happens if a member loses access during an active decision?
- What must the audit record contain, and who can inspect it?
- What are the minimum accessibility and language requirements?
