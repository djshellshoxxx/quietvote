# QV-06 — Privacy and Data Lifecycle

**Module ID:** `security-privacy`  
**Status:** Framework  
**Objective:** Inventory personal and decision data, minimize collection, and specify visibility, retention, export, and deletion.

## Data inventory

Complete one row per field or artifact, including derived data.

| Data item | Purpose | Source | Who can see it | Linkability | Retention | Deletion behavior |
|---|---|---|---|---|---|---|
| Account or credential identifier | TBD | TBD | TBD | TBD | TBD | TBD |
| Eligibility status | TBD | TBD | TBD | TBD | TBD | TBD |
| Ballot ciphertext/record | TBD | TBD | TBD | TBD | TBD | TBD |
| Network and access metadata | TBD | TBD | TBD | TBD | TBD | TBD |
| Audit evidence | TBD | TBD | TBD | TBD | TBD | TBD |

## Privacy requirements

- Collect only data tied to a documented need.
- Separate identity, eligibility, and ballot records where the protocol allows.
- Define what organizers, other members, seed/hosting operators, and support staff can see.
- Define metadata and timing leakage, including logs, backups, notifications, analytics, and crash reports.
- Publish retention periods and deletion consequences.
- Explain that immutable public artifacts may not be erasable after publication.
- Provide a data export and organization exit plan.

## Privacy notice checklist

Before participation, explain in plain language: data collected, who can see it, how ballots are protected, what cannot be hidden, how long data is retained, and how to ask questions or request deletion.

## Open questions

- Which data must persist to verify old results?
- Should audit data be group-controlled or publicly replicated?
- What is the minimum useful operational telemetry?
- How will backups and logs honor deletion commitments?
- What privacy claims can be independently tested?
