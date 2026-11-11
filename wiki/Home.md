# QuietVote

> **Draft – unaudited software, not for real elections yet.** QuietVote is a plan and an early build. Do not use it for a real vote. See [[Roadmap and Status]].

**QuietVote is an experimental design for private-ballot group decisions with independently checkable evidence.** It is intended for clubs, co-ops, unions, open-source groups and online communities. The draft prototype has unresolved verifier-report differences and unapproved protocol decisions; it cannot yet establish that any real vote was private or correctly tallied. Independent review and acceptance testing are still required.

## Choose a guide

- **[[User Guide]]** — members, voters, organizers, trustees, auditors, accessibility, troubleshooting, and privacy limitations.
- **[[Developer Guide]]** — source setup, CLI/tests, architecture, APIs, contribution rules, CI, debugging, and release gates.

These are top-level navigation hubs for a **draft and unaudited prototype**, not a supported production service.

## New here?

Read [[How It Works In 5 Minutes]] first. It explains the whole idea with a simple picture.

## Where to start

| If you are... | Start with |
|---|---|
| A member who will vote | [[Voter Guide]] |
| A steward or organizer running a vote | [[Organizer Guide]] |
| A trustee holding a piece of the key | [[Trustee Guide]] |
| An auditor or observer checking results | [[Auditor and Verifier Guide]] |
| Curious about what is and is not protected | [[What is QuietVote]] and [[Privacy and Guarantees]] |
| A developer or reviewer | [[Developer Guide]] and [[Developer Home]] |

Quick answers are in [[FAQ]]. Accessibility guidance and display settings are in [[Accessibility and Help]]. Hard words are explained in [[Glossary]].

## Important

- The proposed privacy model does **not** cover observation during voting, compromised devices or coercion. The design aims to make participation observable while keeping ballot choices confidential, but this is **not a verified guarantee of the draft prototype**. Read [[Privacy and Guarantees]] and the unresolved security/protocol status before relying on any claim.
- The detailed rules are in the specifications under `docs/` (see [[Specification Index]]). These wiki pages are simple summaries.
- Current status, with test results and known gaps, is in [[Roadmap and Status]]. The public-claims register, which lists what the project may and may not say, is at [docs/claims/claims-register-v0.md](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/claims/claims-register-v0.md). The dependency licence snapshot is at [docs/reports/dependency-licence-snapshot.md](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/reports/dependency-licence-snapshot.md).
