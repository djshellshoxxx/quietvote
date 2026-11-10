# User Guide

> **Experimental and unaudited. Not for real elections or binding group decisions.** This wiki documents a draft design and the prototype in [draft PR #30](https://github.com/djshellshoxxx/quietvote/pull/30). A draft PR is **not merged, approved, released or deployed**.

## Overview and current capabilities

QuietVote explores private-ballot decisions for voluntary organizations. For the proposed workflows and trust assumptions, see [[What is QuietVote]], [[How It Works In 5 Minutes]], and [[Roadmap and Status]]. A working implementation exists on an **unmerged experimental branch**, not as an approved product. Registration-contract and second-verifier decisions are on hold.

## Starting and using the prototype

There is **no supported production installer, hosted service or stable election service**. Developers can evaluate a local checkout of the draft prototype; use [[Developer Guide]] and [[Getting Started Dev]] for source and validation instructions. Do not import real voter data or run binding votes.

Read the role-based design guides before attempting a nonbinding test:
- **Member or voter:** [[Voter Guide]] for the intended ballot and receipt journey.
- **Organizer:** [[Organizer Guide]] for proposed membership, setup and tally roles.
- **Trustee:** [[Trustee Guide]] for custody and release responsibilities.
- **Auditor:** [[Auditor and Verifier Guide]] for checking logs, reports, excluded checks and evidence.
- **Accessibility:** [[Accessibility and Help]] for planned assistive and localization behavior. Native translations and assistive-technology acceptance are **not** qualified.

These guides are explanations of experimental behavior and design goals; they are not proof of correctness or end-to-end acceptance. The browser/server registration contract B3-01 remains unresolved.

## Common questions, troubleshooting and safety

- Start with [[FAQ]] and [[Glossary]] for terminology and common questions.
- For a failed or unconfirmed ballot submission, do **not** infer success from a button state. Preserve the locally available receipt/evidence and verify the published log according to [[Auditor and Verifier Guide]]. See the [current prototype checkpoint](https://github.com/djshellshoxxx/quietvote/pull/30) for tested recovery cases, not a production guarantee.
- For missing or inconsistent verification results, do **not** silently override the strict comparator: the TS/Python verifier report discrepancies D-92–D-94 still require owner decisions.
- For sensitive reports, use the [private security-reporting process](https://github.com/djshellshoxxx/quietvote/blob/main/SECURITY.md), not a public issue.
- Read [[Privacy and Guarantees]] and [[Security Model and Threats]] before considering the design. It does not protect against device compromise, coercion, network observation, colluding trustees or malicious client delivery, and it is **not security audited**.

## State of completion

The specification, prototype, test results, CI and outstanding decisions are separate evidence. Consult [[Roadmap and Status]] and [draft PR #30's exact-source receipt](https://github.com/djshellshoxxx/quietvote/pull/30). No merge, release, deployment, production election safety or official certification is claimed.
