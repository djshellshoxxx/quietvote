# QV-00 — Project Charter

**Status:** Draft  
**Owner:** Project owner — to be recorded  
**Last reviewed:** Not yet reviewed  
**Related specs:** [QV-01](01-capability-map.md), [QV-02](02-product-requirements.md), [QV-03](03-governance-and-policy.md), [QV-07](07-threat-model-security.md), [QV-14](14-business-sustainability.md); [decision log](decision-log.md)

## Objective

Explore and specify a privacy-preserving governance platform that lets voluntary groups run member decisions with private ballots and verifiable outcomes. QuietVote should help groups define decision rules openly, prove that a tally follows those rules, and limit disclosure of each member's choice.

This charter sets the purpose, actors, boundaries, requirements, and open decisions that other specs depend on. It selects no protocol, voting method, deployment model, or license.

## Problem statement

Many online decision tools centralize member identity, participation records, and ballot choices. Groups may want a way to make collective decisions without exposing individual votes or depending on one platform operator. QuietVote will investigate a practical design that balances ballot secrecy, eligibility, auditability, usability, and operational simplicity.

## Actors and intended users

Primary users are organizers and members of voluntary groups, including cooperatives, unions, collectives, member associations, and online communities. Auditors or observers may need to verify procedure and tally without seeing individual choices.

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Organizer | Set up rules; open and close decisions | Organizer role agreed by the group | Decision with published rules |
| Member | Vote privately; confirm the vote was counted | Eligible under group policy | Private ballot and confirmation (content per QV-05) |
| Observer | Verify procedure and tally | Has published evidence | Verifies the tally; sees no individual choices |
| Hosted operator | Run the service | Hosted chosen (decision 2) | Availability; not trusted with ballot secrecy |
| Self-hosting operator | Run the group's own instance | Self-hosting chosen (decision 2) | Controls the instance and its upkeep |
| Maintainers | Maintain specs and software | Governance open (decision 7) | Releases and disclosed limits |

**Initial target group:** Proposed: cooperatives and member associations (decision 1).  
**Initial deployment setting:** Proposed: hosted first (decision 2).  
**Primary user research evidence:** None yet. Proposed: organizer and member interviews in the target group before QV-02 review.

## Product principles

- Make rules visible before participation begins.
- Separate identity and eligibility data from ballot selections wherever feasible.
- Give groups control over membership and governance policies.
- Explain verification and privacy properties in plain language.
- Design for hosted and self-hosted use as separate operating models.
- Make no anonymity, coercion-resistance, or security claim without a defined threat model and evidence.

## User journeys and failure behavior

1. **Set up a decision.** Organizer sets eligibility basis, voting method, open and close conditions, and privacy limits. *Failure:* incomplete or conflicting rules block opening, and the organizer sees which field to fix.
2. **Prove eligibility** (mode per QV-04). *Failure:* the member gets no ballot and a plain reason that confirms or denies no one else's membership (QV-00-REQ-013).
3. **Vote once.** *Failure:* the submission is not counted. The member is told and may retry before close. No counted confirmation is shown for an uncounted ballot (QV-00-REQ-006).
4. **Publish the result** with rules and evidence. *Failure:* missing or failed evidence gives an "unverified" label; the result is not presented as final (QV-00-REQ-005).
5. **Raise a dispute.** *Failure:* the record cannot be saved. The user is told. Nothing is dropped silently. Scope per decision 9.

## Scope

### In scope (candidate initial)

- Organization and decision setup
- Membership and eligibility management
- Proposal and ballot lifecycle
- Private vote submission
- Configurable tally methods
- Results, audit evidence, and dispute workflow (scope per decision 9)
- Privacy and security documentation

### Out of scope until reconsidered

- Government/public elections
- Legally certified corporate elections
- On-chain voting or token-based governance as a default
- Custody or transfer of funds
- Identity-document verification as a default
- Claims of protection against every coercion, endpoint compromise, or administrator threat

### Non-goals (not claimed in any release)

- Anonymity, untraceability, or coercion resistance, unless QV-05 and QV-07 give evidence for a named deployment.
- Protection against compromised member devices, browsers, or servers, or against an administrator who changes the roster or rules.
- Legal validity of any result in any jurisdiction.

## Data handled

Field-level detail belongs in QV-06.

- Member name or pseudonym (per group policy) and membership status.
- Eligibility basis under QV-04. No identity documents by default.
- Ballot content under QV-05. The most sensitive class.
- Participation records. *Linkability risk:* participation timing can correlate with ballot records.
- Rules, audit records, tally inputs and outputs, dispute records, and hosted operational logs.

## Trust boundaries

- **Member device and browser:** trusted only with the member's own choices. Can be compromised.
- **Organizer:** sets rules and roster. Not assumed unable to see participation records.
- **Eligibility source:** authoritative for eligibility. Roster errors go undetected unless QV-04 defines a check.
- **Service or group operator:** trust assumptions in QV-08. **Observers:** published evidence only.
- **Third-party providers:** none selected. [UNVERIFIED: whether any is required for the first release.]

## Abuse cases

Summary. The full list is in QV-07.

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Operator or organizer learns individual choices | Organizer; hosted operator | Loss of ballot secrecy | Separate identity from ballot data (QV-00-REQ-004); protocol per QV-05 | Depends on protocol and deployment |
| Ineligible or duplicate vote | Outsider; member voting twice | Wrong tally | Eligibility and duplicate checks (QV-04, QV-05) | Depends on roster accuracy |
| Membership probing | Outsider | Group membership exposed | Non-revealing responses (QV-00-REQ-013) | Side channels not yet analyzed |
| Silent change of rules or result | Operator; administrator | Untrusted outcome | Rules shown before opening (QV-00-REQ-003); unverified label (QV-00-REQ-005) | Seen only by observers who check evidence |
| Coercion, vote buying, compromised device | Third party; malware | Choice exposed or not reflected | None claimed (non-goals) | Unmitigated |
| Overclaim in public copy | Project | Misplaced trust | QV-00-REQ-001, QV-00-REQ-002 | Claim drift between releases |
| Harassment via disputes or visible participation | Another member | Harm to a member | Pseudonym option (decision 5); dispute scope (decision 9) | Disclosure within the group |

## Dependencies

- [QV-01](01-capability-map.md): module boundaries and build order.
- [QV-03](03-governance-and-policy.md), [QV-04](04-identity-eligibility.md): rules, roster, eligibility.
- [QV-07](07-threat-model-security.md): gates every privacy and security claim.
- [QV-14](14-business-sustainability.md): depends on decisions 7 and 8.
- [Decision log](decision-log.md): records acceptance.

## Success measures to define

- Member comprehension of ballot rules and privacy limits. *Method:* comprehension check in usability testing (QV-10).
- Correct enforcement of eligibility and duplicate-vote rules. *Method:* scripted tests and roster reconciliation (QV-11).
- Independent reproduction of the published tally. *Method:* an observer reproduces the tally from published evidence, using a written procedure.
- Usability across assistive technologies and devices. *Method:* task testing with assistive technology users (QV-13).
- Measured data minimization and deletion. *Method:* field inventory against QV-06; deletion test.
- Successful deployment and recovery. *Method:* scheduled restore and redeploy exercise (QV-12).
- Adoption and sustainability for the selected target group. *Method:* defined in QV-14 once the target group is chosen.

Numeric targets and release thresholds remain open (decision 8).

## Assumptions requiring validation

1. Organizations will value ballot privacy and verifiable procedures enough to change tools. *Validate:* organizer interviews (decision 1).
2. A first product can focus on a specific type of voluntary group. *Validate:* research for decision 1.
3. Participants can use a mix of real names and pseudonyms, subject to group policy. *Validate:* acceptance research; QV-04 review.
4. A hosted service and self-hosted deployment may need different trust and support models. *Validate:* QV-08 comparison.
5. A software specification can distinguish privacy properties from public marketing claims. *Validate:* QV-07 review of copy against each claim.

All five are open.

## Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-00-REQ-001 | The project shall publish, per release, a plain-language statement of privacy properties and non-claims that says who can learn what. | Must | Covers each actor in the actors table. Each property cites QV-07 evidence or is listed as not claimed. | Document review against QV-06, QV-07 |
| QV-00-REQ-002 | No user-facing text, release note, or marketing copy shall call a release anonymous, untraceable, coercion-resistant, or independently verifiable unless the claim names its adversary and assumptions and has evidence. | Must | Copy review finds no unqualified claim. Each qualified claim links to its QV-07 entry. | Copy checklist per release; QV-11 gate |
| QV-00-REQ-003 | The system shall show each decision's full rules (eligibility basis, voting method, open and close conditions, privacy limits) to every eligible member before opening. | Must | End-to-end test: rules are shown before the first ballot. After opening, rules change only by logged amendment. | E2E test (QV-11); UX review (QV-10) |
| QV-00-REQ-004 | Identity and eligibility data shall be separated from ballot selections wherever the approved protocol permits. | Must | QV-04 and QV-05 state where each data type is stored and any approved link. Each remaining link is a listed linkability risk in QV-06. | Design and schema review |
| QV-00-REQ-005 | The system shall not present a result as final unless its verification evidence is complete and passes verification. | Must | Missing or altered evidence gives the result and any export an "unverified" label. | Integration test (QV-11); security review |
| QV-00-REQ-006 | A member whose submission is not counted shall be told so and shall never see a success confirmation for it. | Must | Fault-injection test shows a not-counted message and no confirmation. A retry does not create a second counted ballot. | Integration and fault-injection tests |
| QV-00-REQ-007 | Each group shall define its own membership and decision rules. The software shall not apply a default rule silently. | Must | Any default applied appears in the rule text and in the audit record. | Review; E2E test |
| QV-00-REQ-008 | Hosted and self-hosted operation shall be specified as separate operating models, each with operator, trust assumptions, and support duties. | Must | QV-08 has one section per model. No guarantee applies to one model unless stated for the other. | Review against QV-07, QV-12 |
| QV-00-REQ-009 | No out-of-scope feature shall be enabled in a release without a decision-log entry and a QV-07 update. | Must | Release checklist lists the decision-log ID and QV-07 revision for each enabled item. | Release gate review |
| QV-00-REQ-010 | Each success measure shall have a method, owner, target, and release threshold recorded before any release is approved. | Must | All four fields are filled in the decision log or QV-11 for every measure. | Document review at approval |
| QV-00-REQ-011 | Every member-facing and observer-facing flow shall be operable by keyboard and with screen readers. The accessibility standard used shall be named. | Must | QV-10 lists keyboard and screen-reader checks per flow. QV-13 names the standard. | Accessibility review; AT testing (QV-11) |
| QV-00-REQ-012 | Each assumption shall be marked validated, rejected, or open, with evidence or a decision reference, before QV-00 is approved. | Must | Each of the five assumptions has one status and a link. | Project-owner review |
| QV-00-REQ-013 | The system shall give an ineligible or unknown member a plain reason that confirms or denies no one else's membership. | Must | Ineligible and unknown cases return the same class of message. No message names another member. | Security/privacy test (QV-11); QV-04 review |
| QV-00-REQ-014 | The system shall collect only the data listed in Data handled, for a stated purpose. | Must | The QV-06 field inventory matches this list. A new field requires an update to both. | Review at each spec change |

## Verification

- Project-owner document review and decision-log entries verify this charter. Module tests are collected in QV-11.
- **Release-blocking criteria** (for releases, not for approving this charter): QV-00-REQ-002, QV-00-REQ-005, and QV-00-REQ-006 must pass. A release is blocked if QV-07 or QV-11 has not been reviewed for it.

## Open decisions

Original questions are kept. Proposed options are for review; none is approved.

1. **Which group type is the first target?**
   - Options: cooperatives and member associations; unions and worker collectives; online communities; clubs and mutual-aid groups.
   - Proposed: cooperatives and member associations, where membership rules are usually written. [UNVERIFIED: no research yet.]
   - Owner: project owner.
2. **Is the product hosted, self-hosted, or both for the first release?**
   - Options: hosted only; self-hosted only; both.
   - Proposed: hosted only. Design the self-hosted path but do not ship it until QV-08 and QV-12 are reviewed.
   - Owner: project owner.
3. **Is participation account-based, invite-based, credential-based, or mixed?**
   - Options: as listed.
   - Proposed: invite-based roster with account login. Credential modes wait for QV-17.
   - Owner: project owner, with QV-04.
4. **Which voting methods are required in the MVP?**
   - Options: single-choice; approval; ranked; others. None evaluated.
   - Proposed: one single-choice method for yes/no and single-choice proposals. Other methods wait for QV-05 protocol review.
   - Owner: project owner, with QV-05 reviewers.
5. **Which privacy properties are mandatory, optional, or explicitly unsupported?**
   - Mandatory (proposed): no individual choice published by default; rules and privacy limits shown before opening; no published link from ballot to member identity.
   - Optional (proposed): pseudonymous display names, per group policy.
   - Unsupported in MVP (proposed): anonymity, untraceability, coercion resistance, protection against compromised devices or servers.
   - Owner: project owner, reviewed against QV-07.
6. **What is the minimum viable audit record?**
   - Proposed: rules version, eligibility basis and counts, open and close times, submitted-ballot count, tally inputs and outputs, and verification evidence. Tamper-evidence method per QV-16.
   - Alternatives: plain log without tamper evidence; fully signed record (not until QV-16 review).
   - Owner: project owner, with QV-07 and QV-16.
7. **What license and governance model will apply to the software?**
   - Options: permissive open-source; copyleft open-source; source-available; none yet.
   - Proposed: no license now. Decide before any public code release and record it in the decision log. [UNVERIFIED: legal effects not assessed.]
   - Owner: project owner, with legal review before release.
8. **What success thresholds make the first release acceptable?**
   - Proposed: set after the target group is chosen (decision 1) and research is done. Record provisional thresholds in the decision log with reviewer sign-off.
   - Alternatives: set after a pilot. No thresholds (not recommended; QV-00-REQ-010 would block release).
   - Owner: project owner.
9. **Dispute workflow scope in the MVP.** (Added: candidate scope lists a dispute workflow; README first-release focus does not.)
   - Options: full workflow; recording and notice only; no product support, disputes handled under QV-03.
   - Proposed: recording and notice only. No adjudication tool. Outcomes follow the group's procedure in QV-03.
   - Owner: project owner, with QV-03.
10. **Service unavailable at close.** (Added.)
   - Options: close on time and count failed submissions as not counted; hold open until service returns; manual administrator extension.
   - Proposed: never close early. Close and any extension follow QV-03 rules, announced before opening. Manual extension not recommended, because it gives the organizer control over timing.
   - Owner: project owner, with QV-03 and QV-12.

## Approval

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | Not yet dated | None yet |
