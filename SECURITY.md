# Security Policy

QuietVote is a **pre-implementation specification project** (no released software yet). Its security claims are limited to those in the [claims register](docs/07-threat-model-security.md#12-security-claims-register); the project makes **no claim** of anonymity, coercion-resistance, certification, or production readiness. Full policy: [QV-33](docs/33-vulnerability-disclosure.md).

## Reporting a vulnerability

Please **do not** open public issues for security problems. Use, in order of preference:

1. **GitHub Private Vulnerability Reporting** — repository **Security** tab → *Report a vulnerability*. `[PLACEHOLDER: confirm enabled]`
2. **E-mail:** `security@quietvote.example` `[PLACEHOLDER]` — encrypt exploit details with the key below.

| Item | Value |
|---|---|
| PGP fingerprint | `[PLACEHOLDER — 40 hex characters]` |
| PGP key | `[PLACEHOLDER — https://quietvote.example/.well-known/pgp-key.txt]` and `security/pgp-key.asc` in this repo |
| age recipient | `age1[PLACEHOLDER]` |
| security.txt | `https://quietvote.example/.well-known/security.txt` `[PLACEHOLDER]` (RFC 9116) |

Anonymous or pseudonymous reports are welcome; we do not require your identity or an NDA.

**Please include:** affected version/commit and component; what property is broken (see P1–P15 in QV-07 §6, e.g. "verifier accepts an invalid ballot proof"); reproduction steps or PoC; whether live elections could be affected; how you would like to be credited.

## What is in scope

Code and release artifacts in this repository (server, browser client, verifier/CLI, trustee tool, build and release pipeline), the **protocol specification** (a flaw in a proof statement, DKG, or ballot rule counts), privacy defects (e.g. IP logging in the default configuration), and **documentation or UI claims that overstate our guarantees**.

Out of scope: third-party self-hosted instances and other groups' elections, denial-of-service testing, social engineering or physical attacks, compromised-voter-device scenarios and other documented non-claims (QV-07 §11), and automated scanner output without demonstrated impact.

## Safe harbor

If you make a good-faith effort to follow this policy, we will not pursue or support legal action against you for your research on project-controlled code and systems, and will work with you to resolve the issue. Good faith means: test only your own installation, a local stack, or our designated staging instance (`[PLACEHOLDER]`); never test against live elections; avoid accessing, modifying or retaining other people's data; no service degradation; no extortion; and give us the chance to fix before public disclosure. We cannot bind third parties (operators, hosts, law enforcement). This summary is not legal advice; see QV-33 §4.

## Our commitments

| Stage | Target |
|---|---|
| Acknowledge | within 3 business days |
| Triage and initial severity | within 7 days |
| Status updates | every 14 days (every 3 days for Critical) |
| Fix or mitigation | Critical ≤ 14 days · High ≤ 30 · Medium ≤ 90 · Low best effort (≤ 180) |
| Public disclosure | with the fix, and by default **90 days** after report (extendable by agreement by up to 30 days); within **7 days** if active exploitation is confirmed |

Severity is assigned with **CVSS v4.0** plus QuietVote overrides for election-integrity and ballot-secrecy impact (QV-33 §5). Advisories are published as GitHub Security Advisories with signed Markdown (`QV-SA-YYYY-NNN`) and, for qualifying issues, a CVE; they state the impact on active elections and who must act.

## Supported versions

There are no releases yet. Once released, the latest minor version and the previous one receive security fixes; this table will be updated.

| Version | Supported |
|---|---|
| `main` (pre-release) | Best effort; reports welcome |

## Open items (before this policy is operational)

- Security contact address `security@quietvote.example` is a placeholder; no real contact has been chosen.
- Confirm GitHub Private Vulnerability Reporting is enabled.
- PGP fingerprint and key, `age` recipient and `security.txt` are placeholders.
- Staging instance for safe-harbor testing is a placeholder.
- The preamble above ("pre-implementation specification project, no released software") predates the code now in the repository; owner to confirm the wording.

## Bug bounty

There is currently **no cash bounty**. Reporters are credited (hall of fame, advisory) unless they prefer anonymity. A staged bounty plan is in QV-33 §10 and will be announced only when funded.
