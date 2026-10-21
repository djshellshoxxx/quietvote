# QV-07 — Threat Model and Security

**Module ID:** `security-privacy`  
**Status:** Framework  
**Objective:** Define assets, adversaries, abuse cases, mitigations, residual risks, and release-blocking security evidence.

## Assets to assess

- Ballot choices and participant-to-ballot linkability
- Membership and eligibility records
- Credentials, keys, and recovery channels
- Proposal text and decision timing
- Tally and audit evidence
- Administrative accounts and signing keys
- Availability during open ballots
- Build, release, and update integrity

## Adversaries and failures to assess

- Curious or malicious group administrator
- Compromised or coercive organizer
- Malicious or compromised service operator
- Colluding participants
- Network observer
- Compromised participant device or browser
- Credential theft, phishing, or account takeover
- Denial of service, spam, or ballot flooding
- Supply-chain compromise or vulnerable dependency
- Accidental misconfiguration and human error

For each, document capability, motivation, access, likely impact, and out-of-scope assumptions.

## Abuse cases

- Changing rules or eligibility after a ballot opens
- Impersonating a member or recovering their account
- Linking a ballot to a member through timing or metadata
- Suppressing or selectively delaying votes
- Publishing a false or incomplete tally
- Harassing members through proposal or notification features
- Retaliation or coercion outside the software
- Re-identifying a person from a small group or rare choice

## Required security artifacts

- Data-flow and trust-boundary diagrams
- Security requirements mapped to tests
- Dependency and release integrity policy
- Key management and recovery design
- Incident response procedure
- Independent cryptographic/protocol review before high-assurance claims
- Vulnerability reporting and remediation process

## Open questions

- Which attacker is the MVP required to resist?
- Is the hosting operator in the trust boundary?
- What is the supported threat level for coercion?
- What is the security review budget and release gate?
- Which vulnerabilities require pausing or invalidating an active decision?
