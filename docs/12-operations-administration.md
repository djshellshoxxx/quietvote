# QV-12 — Operations and Administration

**Module ID:** `operations-assurance`  
**Status:** Framework  
**Objective:** Specify safe administration, support, reliability, and incident handling for each deployment model.

## Operating procedures

- Organization onboarding and offboarding
- Admin role assignment and recovery
- Ballot scheduling, time-zone handling, pause, close, and cancellation
- Backup, restore, migration, and export
- Credential/key rotation
- Software updates and rollback
- Abuse reports, disputes, and support escalation
- Security incident and privacy incident response
- Service retirement and organization exit

## Observability boundaries

Define what metrics and logs are needed for reliability without creating ballot-choice or identity linkages. Set access controls, retention, redaction, and review procedures for operational records.

## Reliability targets to set

- Availability during open ballots
- Submission acknowledgment latency
- Recovery point and recovery time objectives
- Maximum supported group size and concurrent ballots
- Support response targets
- Upgrade and compatibility policy

Do not choose numerical targets until deployment assumptions and user needs are known.

## Open questions

- Who operates a hosted instance and who may inspect its logs?
- What happens if the service is unavailable near a deadline?
- Who can authorize recovery, recount, or invalidation?
- What is the support model for self-hosted organizations?
