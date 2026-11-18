# QV-14 — Business and Sustainability

**Module ID:** `sustainability`  
**Status:** Framework  
**Objective:** Evaluate how QuietVote can remain maintained while keeping privacy, trust, and member control central.  
**Owner:** Project owner (proposed; to be confirmed)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-00, QV-03, QV-06, QV-07, QV-08, QV-12, QV-15

## Actors

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Project maintainers | Keep releases signed, secure, and documented | Named release-key holders (REQ-010) | Maintained software; decisions in QV-15 |
| Hosting operator | Run a hosted service for groups | A hosted model is accepted (REQ-001) | Hosted groups served under REQ-005 terms |
| Group administrator | Evaluate, buy, or exit a paid service | Organization account exists | Clear terms; full export on exit |
| Member of a free or community group | Vote without paying or being monetized | Group on free tier or self-hosted | Same privacy and export features as paid groups (REQ-007) |
| Self-hosting operator | Run an own instance | Released software and docs | Runs with no project-operated service |
| Sponsor, funder, or partner | Support the project | Agreement offered | Publicly listed; no data access (REQ-009) |

## Scope

### In scope
- Comparing funding and monetization models and their effect on privacy and governance
- Pricing principles, including what data a pricing metric needs
- Data export, exit, and continuity for hosted groups
- Disclosure of sponsors, funders, and commercial partners
- Sustainability of self-hosted distribution and support

### Out of scope
- Choosing one model, setting prices or amounts, or choosing a payment vendor (decided later through QV-15)
- Ballot protocol and cryptography (QV-05, QV-16)
- Accessibility and localization (QV-13)
- Legal terms, licenses, trademarks, and entity or tax structure (open decisions, needing legal review)

**Non-goals:** This spec does not promise funding, profitability, or long-term survival. Revenue may never override the privacy model.

## Models to compare
- Free self-hosted software with paid support
- Hosted subscription by organization or member count
- Cooperative ownership or membership
- Donations, grants, or sponsorship
- Paid audits, integrations, or managed deployment
- Hybrid open-source and hosted offering

For each, estimate operating costs, support burden, likely users, revenue assumptions, and how funding affects governance and data practices.

| Model | Effect on governance and data | Support burden | Estimates |
|---|---|---|---|
| Free self-hosted + paid support | Groups keep data on their own servers; support access follows REQ-012 | Support queue, docs | Not estimated [UNVERIFIED] |
| Hosted subscription | Operator holds group data; member-count pricing makes membership counts operator-visible (REQ-002) | Operator runs and secures infrastructure | Not estimated [UNVERIFIED] |
| Cooperative ownership | Members may set pricing and roadmap; membership rules depend on QV-03 | Member administration | Not estimated |
| Donations, grants, sponsorship | Funder conditions may pull on the roadmap; disclosure required (REQ-009) | Funder reporting | Not estimated |
| Audits, integrations, managed deployment | Third parties get deployment access; must be scoped and logged (REQ-012) | Contracts, access control | Not estimated |
| Hybrid open-source and hosted | Hosted features can diverge from self-hosted; parity required (REQ-007) | Two deployment paths | Not estimated |

No cost, user, or revenue figure is asserted here. Any figure added later needs a source and date (REQ-011).

## Trust and incentive questions
- Who controls the project roadmap and release keys?
- Who may change pricing, terms, or privacy policy?
- Can hosted customers export all group data and move providers?
- How are free/community groups supported?
- What commercial incentives could encourage excess data collection?
- How are service continuity and project succession handled?

## User journeys and failure behavior
- **Hosted subscription lapses.** New groups and new ballots are blocked. Existing records stay readable and exportable through a grace period (OD-6). No data is deleted without the notice in REQ-005.
- **Group exits to self-hosting.** Administrator requests export. The archive includes a manifest of record counts so partial exports are detectable. An interrupted export restarts; it is never marked complete.
- **Project ends the hosted service.** Administrators get notice (OD-4), an export window, then deletion under QV-06. Self-hosted copies keep running. An abrupt shutdown is covered by the succession plan (REQ-008).
- **Sponsor offers funding.** Maintainers check REQ-001 and REQ-009. Accept only with public disclosure; decline any undisclosed condition.

## Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-14-REQ-001 | The project shall not adopt a funding or monetization model until it is recorded as Accepted in QV-15, listing affected requirement IDs. | Must | No model is adopted in any doc without a matching QV-ADR entry. | Review against QV-15 |
| QV-14-REQ-002 | A monetization model shall use only personal data that QV-06 permits for that purpose; billing records shall be stored separately from ballot and eligibility records, with no link from a payer to a ballot choice. | Must | QV-06 lists each billing or membership field with its purpose; QV-09 defines no join from billing to ballot records. | Review of QV-06 and QV-09 when written |
| QV-14-REQ-003 | Hosted groups shall export all group data in a documented, versioned, machine-readable format that a self-hosted instance can import. | Must | Export of a test group contains every record class in QV-09 plus a count manifest; import reproduces the counts. | Integration test; review |
| QV-14-REQ-004 | The operator shall give administrators written notice before any change to pricing, terms, or privacy policy, and shall allow export during that notice period. | Must | Notice period is set (OD-4); no change applies to a group without it; export succeeds during it. | Change-log review; export test |
| QV-14-REQ-005 | Self-hosted deployments shall make no outbound call to a project-operated service unless the operator opts in. | Must | With project domains blocked, a self-hosted install completes a test ballot. | Integration test with blocked network |
| QV-14-REQ-006 | Free, community, and self-hosted groups shall have the same privacy, security, and export features as paid groups; paid tiers may add only support or capacity. | Must | Feature matrix shows no privacy, security, or export control limited to a paid tier. | Feature-matrix review |
| QV-14-REQ-007 | Hosted and self-hosted deployments shall keep feature parity for privacy and export controls. | Must | Each privacy and export control has a passing test in both deployment modes. | Test matrix review |
| QV-14-REQ-008 | The project shall maintain a written succession plan for release keys, hosted-service continuity, and orderly shutdown. | Must | Plan names triggers, owners, and steps; a tabletop exercise is recorded before any hosted launch. | Document review; tabletop exercise |
| QV-14-REQ-009 | Sponsors, funders, and partners shall be publicly listed with their conditions and shall get only the aggregate reporting QV-06 allows. | Must | Public list covers every agreement; no agreement grants access to individual ballot or eligibility data. | Review of listing and agreements |
| QV-14-REQ-010 | Release-signing keys and roadmap decision rights shall be held by named roles, and every change of holder shall be recorded. | Must | A maintained holder list exists; each change has a QV-15 or changelog entry. | Records review |
| QV-14-REQ-011 | Any cost or revenue figure in a business case shall state its source and date, or be marked [UNVERIFIED]. | Should | No unmarked figure appears in any business case. | Review |
| QV-14-REQ-012 | Support staff access to group data shall occur only through the QV-12 process: logged, time-limited, and notified to the group administrator. | Must | Each support session has a log entry, a notice to the administrator, and an expiry. | Support-workflow test; log review |

## Data handled and trust boundaries
- **Data inputs:** administrator contact and organization name; subscription status; billing contact and payment status (only if a paid model is accepted); member counts (only if used for pricing, see OD-3); sponsor agreements; support requests, which may contain group data.
- **Data outputs:** invoices and status to administrators; export archives; aggregate sponsor reports.
- **Not needed for business purposes:** ballot choices and any ballot-linked data.
- **Trust boundaries:** (1) maintainers and release signing; (2) hosting operator and tenant group data; (3) operator staff and support data (REQ-012); (4) sponsors and public records (aggregate only); (5) payment provider, not yet chosen [UNVERIFIED]; (6) self-hosting operator and project (no default callbacks, REQ-005).

## Abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Member-count pricing drives collection of full membership rolls | Commercial incentive | Excess personal data held by operator | REQ-002; pricing metric per OD-3 | Operator still learns counts |
| Sponsor seeks ballot data or roadmap control | Funder | Privacy loss; project capture | REQ-009, REQ-010 | Influence is hard to detect |
| Terms or privacy policy changed after groups depend on them | Operator | Loss of trust; forced exposure | REQ-004 notice and export | Groups with no exit stay exposed |
| Hosted service ends or is sold abruptly | Business failure, acquisition | Loss of group records | REQ-003, REQ-008 | Abrupt failure gives little notice |
| Payment lapse disrupts an active decision | Billing failure | Disputed outcome | Lapse blocks new groups only (journey 1) | Disputes still possible |
| Release-key misuse or compromise | Insider or outside attacker | Malicious software for all users | REQ-010; OD-7; QV-07 controls | Single-key risk until OD-7 is decided |
| Impostor hosted service collects group data | Attacker | Data theft | Publish official channels; signed releases (QV-07) | Users may not verify |

## Dependencies
- **Upstream:** QV-00 (mission and boundaries), QV-03 (who changes rules and terms), QV-06 (minimization, retention, deletion), QV-07 (release-key and hosting threats), QV-08 (hosted vs self-hosted architecture), QV-12 (support, backup, shutdown), QV-15 (decision record).
- **Downstream:** QV-09 (export and billing contracts), QV-10 (pricing and export screens), QV-11 (release gates).
- **Contracts:** export format and manifest are to be defined in QV-09. No billing interface exists yet.

## Verification
- Document review of each requirement against QV-06 and QV-15.
- Export/import test on a test group (REQ-003).
- Self-hosted install with project domains blocked (REQ-005).
- Feature-matrix and test-matrix review (REQ-006, REQ-007).
- Tabletop succession exercise (REQ-008).
- **Release-blocking for any hosted launch:** REQ-001, REQ-003, REQ-004, REQ-008, REQ-012 pass.

## Assumptions requiring validation
- Enough organizations will value self-hosting support to fund maintenance [UNVERIFIED].
- Enough organizations will pay for hosting [UNVERIFIED].
- A small team can maintain the software within a sustainable budget [UNVERIFIED].

## Trust and incentive answers
Each question above maps to an open decision: roadmap and keys (OD-5, OD-7); terms and pricing (OD-4); export (REQ-003); free groups (REQ-006); incentives (REQ-002, OD-3); succession (REQ-008).

## Open questions
- Is revenue from hosting acceptable for the product's values and goals?
- Should governance of the software itself be member-owned?
- What is the minimum sustainable support and infrastructure budget?
- What licenses and trademarks are appropriate?
- What service-level commitments can be supported without compromising the privacy model?

## Open decisions

| ID | Question | Options | Recommendation | Owner |
|---|---|---|---|---|
| OD-1 | Which model, if any, comes first? | The six models above | Proposed: free self-hosted software with optional paid support as the baseline. Evaluate hosting after QV-06, QV-08, and QV-12 are settled. | Project owner |
| OD-2 | Is revenue from hosting acceptable? | Yes; yes with conditions; no | Proposed: yes, with conditions REQ-002, REQ-003, REQ-004, and REQ-006 met. | Project owner |
| OD-3 | Which pricing metric, if any? | Flat per group; per organization; per member count; none | Proposed: no member-count metering unless QV-06 approves it. | Project owner |
| OD-4 | What notice period applies to changes and shutdown? | A fixed period set before launch | Proposed: set the period before any hosted launch; value chosen by owner. | Project owner |
| OD-5 | Should software governance be member-owned? | Project owner; foundation; member-elected board; cooperative | Proposed: keep owner governance with REQ-008 succession; revisit after first hosted adopters. | Project owner |
| OD-6 | What happens when a subscription lapses? | Immediate block; grace period; no block | Proposed: block new groups and ballots; keep records readable and exportable for a grace period matching OD-4. | Project owner |
| OD-7 | Who may approve a release? | One key holder; two or more holders | Proposed: at least two named holders before any public release; details in QV-07. | Project owner |
| OD-8 | What budget and service levels are committed? | Estimate first; commit to a level | Proposed: no service-level promise until QV-12 defines capacity; estimates per REQ-011. | Project owner |
| OD-9 | Which license and trademark policy? | Undecided; permissive; copyleft; source-available | Proposed: decide before any public release, with legal review [UNVERIFIED]. | Project owner with legal review |
| OD-10 | Which payment provider, and how long are billing records kept? | Undecided | Proposed: defer until a paid model is accepted under REQ-001. | Project owner |
