# QV-08 — Architecture and Deployment

**Module ID:** `platform-interfaces`  
**Status:** Framework  
**Objective:** Select system boundaries and deployment models that satisfy product, security, privacy, and operational requirements.

## Architecture areas to decide

- Client types: responsive web, mobile web, native app, or other
- Application services and trust boundaries
- Storage for membership, ballot artifacts, results, and audit records
- Cryptographic operations and key custody
- Identity and eligibility integration
- Notifications and time handling
- Hosted multi-tenant isolation
- Self-hosted installation and upgrade path
- Backup, restore, export, deletion, and migration
- Optional federation or distributed storage (evaluate only against defined needs)

## Deployment models

| Model | Benefits to evaluate | Risks/costs to evaluate | Decision |
|---|---|---|---|
| Maintainer-hosted SaaS | Low setup burden, controlled upgrades | Operator trust, recurring cost, availability | TBD |
| Organization self-hosted | Local control, custom policy | Admin skill, updates, backups, misconfiguration | TBD |
| Federated/community-run | Multiple operators, resilience | Consistency, discovery, abuse handling | TBD |

Do not equate self-hosting or decentralization with anonymity, security, or reliable operation.

## Architecture deliverables

- Context, container, and deployment diagrams
- Data-flow and trust-boundary diagrams
- Component responsibility and failure modes
- Tenant isolation and authorization model
- Encryption and key-management design
- Availability, recovery, and migration targets
- Dependency and technology decision records
- Deployment threat model for each supported model

## Open questions

- What is the first supported deployment model?
- What are the minimum supported hardware and operating-system targets?
- Is offline participation required?
- How are date/time boundaries displayed across time zones?
- What is the operating model for seed nodes, if any?
