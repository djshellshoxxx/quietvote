# QuietVote

**Software artwork:** an experimental software and documentation project exploring private decision-making for voluntary groups.

**Studio credit:** QuietVote is a Circuit Drift Labs development project. [Visit Circuit Drift Labs](https://djshellshoxxx.github.io/circuitdriftlabs/).

**A private, verifiable decision-making tool for voluntary groups.**

QuietVote is a proposed platform for organizations that want members to make collective decisions without publishing each person's ballot. It is intended for groups such as cooperatives, member associations, unions, collectives, and online communities. The project explores how a group can verify that eligible members participated, prevent duplicate voting, and audit the result while keeping individual choices private.

This branch contains a **consolidated experimental prototype** across eight TypeScript packages and a separate Python verifier. The specifications remain drafts. Security, protocol and authority-policy review are still required; this is **unaudited software, not for real elections**.

## What is QuietVote?

- QuietVote is a tool that lets a group vote in secret and still check that the result is right.
- It is for clubs, co-ops, unions, open-source groups and other voluntary groups.
- Your choice is locked away. Nobody can read it alone, not even the server.
- Anyone can check the final count, so you do not have to trust the people who run it.
- It is an unaudited draft, not ready for real votes. In version 1, others can see who voted, but not how.
- It does not protect you from someone watching you vote, a hacked phone, or being forced to vote a certain way.

## Product direction

QuietVote aims to support voluntary governance where:

- A group defines its own membership and decision rules.
- Members can participate under real names, pseudonyms, or privacy-preserving credentials, according to the group's chosen policy.
- Ballot choices are private from other members and, where the selected protocol permits, from administrators.
- The group can verify eligibility, enforce its configured participation rules, and validate the tally.
- Groups can choose a hosted service or a self-hosted deployment as the product matures.

The design should favor user-controlled disclosure, minimal data collection, transparent rules, accessible interfaces, and verifiable outcomes. The exact trust model and cryptographic protocol remain open.

## Cryptography and technology

QuietVote uses **cryptography as a trust-reduction tool**, not necessarily cryptocurrency. Candidate design elements include encrypted ballots, zero-knowledge eligibility and ballot-validity proofs, decision-scoped nullifiers to prevent duplicate voting, threshold tally keys, digital signatures, and tamper-evident audit records. The byte-level draft is [Cryptographic protocol (QV-16)](docs/16-crypto-protocol.md). The older [Cryptography and Technical Design](docs/15-cryptography-and-technical-design.md) is a retained, non-authoritative draft.

A token or public blockchain is not a core requirement. The prototype implements the draft QV-16 protocol; implementation does not establish approval or security. See the [Future Ideas backlog](IDEAS.md) for optional extensions such as portable credentials, federated group decisions, and forkable governance rules.

## Intended users

- Cooperatives and member associations
- Unions and worker collectives
- Online communities and open-source organizations
- Voluntary clubs, federations, and mutual-aid groups

## Initial scope

The first release should focus on member proposals, private ballots, configurable voting rules, auditable tallies, and a clear record of how each decision was conducted. The first target setting, supported voting methods, membership model, identity model, and deployment model require explicit decisions in the specifications.

QuietVote is initially scoped for **internal decisions in voluntary organizations**. The project does not currently target public governmental elections, legally binding corporate shareholder elections, or other settings with specialized certification requirements.

## Documentation framework

Start with the [specification index](docs/SPEC-INDEX.md), which tracks each specification, dependencies, status, and open decisions. The [project charter](docs/00-project-charter.md) records the current product intent. The [capability map](docs/01-capability-map.md) proposes module boundaries and build order. Use the [spec template](docs/templates/SPEC-TEMPLATE.md) when expanding a module into an implementation-ready contract.

Web translation contributors can use the [translation workflow and review checklist](docs/TRANSLATING.md).

For the current consolidation and next work, use the [comprehensive report](docs/audits/CONSOLIDATION_REPORT.md) and [unfinished-work ledger](docs/audits/UNFINISHED_WORK.md). The [November 17 review](docs/reports/consolidation-review-20261117.md) and its [publication receipt](docs/reports/consolidation-publication-20261117.md) describe an earlier checkpoint. Earlier implementation evidence is in [the parallel teams checkpoint](docs/handoffs/QUIETVOTE-TEAMS-CONTINUATION-20261116.md), its [feature and branch ledger](docs/reports/quietvote-teams-feature-ledger-20261116.md) and milestone review handoffs. The [earlier 2026-11-16 checkpoint](docs/handoffs/QUIETVOTE-RESUME-20261116.md) preserves prior evidence. The previous checkpoint is [the 2026-11-11 consolidation and discovery handoff](docs/handoffs/QUIETVOTE-COMPLETION-20261111.md). An earlier checkpoint is [the 2026-11-09 integration checkpoint](docs/handoffs/QUIETVOTE-MILESTONE-20261109.md). For earlier source refs, branch/PR accounting, validation and remaining gates, use the [consolidation handoff](docs/handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md) and [integration ledger](docs/plan/CONSOLIDATION.md). The [restart entry](docs/handoffs/QUIETVOTE-NEXT.md) preserves earlier checkpoint receipts. These status documents are not approved specifications or an independent audit.

The [wiki](wiki/) provides voter, organizer, trustee, auditor and developer guides. Screenshots are not included here; the production web build and reproducible browser checks are described in the handoff.

## Current status

**Experimental — not for binding elections**

The [comprehensive consolidation report](docs/audits/CONSOLIDATION_REPORT.md)
records the current branch recovery and source composition. Its
[branch inventory](docs/audits/BRANCH_INVENTORY.md),
[unfinished-work ledger](docs/audits/UNFINISHED_WORK.md),
[security review](docs/audits/SECURITY_REVIEW.md) and
[verification receipt](docs/audits/FINAL_VERIFICATION.md) distinguish implemented
behavior from remaining contracts and qualification. The
[November 17 publication receipt](docs/reports/consolidation-publication-20261117.md)
describes an earlier snapshot and its then-current PR count.

**Stage:** Experimental prototype; core workflows and qualification remain incomplete<br>
**Implementation:** Code exists in all eight packages (`crypto`, `protocol`, `board`, `server`, `trustee`, `verifier`, `cli`, `web`) and in `verifier-py/`. Modern web/API/CLI voter enrollment, the connected organizer ceremony/open/close/tally console, executable election workflows and offline recovery are implemented. The accepted ADR-027/028 decisions supersede the old registration and report-parity holds. The [continuation handoff](docs/handoffs/QUIETVOTE-TEAMS-CONTINUATION-20261116.md) records source-specific validation and its limits.<br>
**Specification status:** Drafted; decisions and acceptance criteria remain to be completed  
**Use:** **Not for real elections.** Do not rely on this software for any real decision.  
**Release status:** No release

Do not treat placeholder requirements or proposed capability boundaries as approved product decisions.

Public verification requires authenticated append and witness evidence by default; an explicit content-only mode reports its narrower scope. The independent Python verifier includes board/receipt checks, approved detailed-report parity and a bounded JSON Lines adapter. These implemented capabilities do not establish complete conformance or an independent security audit.

Signed GroupRules provides an isolated pinned-history core and offline CLI. Governed manifest binding and ratification, proposal versions/review, group membership/rotation/recovery, and disputes/finality remain unfinished core work. Authenticated pinned-roll enrollment, prover nonce hedging including trustee-index separation, runtime rollback floors and recorded public exports are implemented in this candidate. Newer terminal control effects and remaining verifier semantics still need the contracts and evidence listed in the current ledger.

Independent security/protocol review, witness/WAL activation and backup custody, supported-platform qualification, native translation review and assistive-technology qualification still need evidence. All five translated catalogs remain unreviewed and unoffered. Automated browser checks are not WCAG or screen-reader acceptance. Main has not been merged, and nothing has been released or deployed.

Use the [current unfinished-work ledger](docs/audits/UNFINISHED_WORK.md) for source status and the [remaining-contracts review](docs/handoffs/QUIETVOTE-REMAINING-CONTRACTS-20261116.md) for its decision provenance. The broader backlog is in [docs/plan/TODO.md](docs/plan/TODO.md), the roadmap and decisions are in [docs/plan/](docs/plan/), and simple summaries are in [wiki/](wiki/). Older receipts describe their named snapshots; later accepted decisions and implementation handoffs supersede their obsolete holds.

## Guiding principles

1. **Private by design:** collect and expose only the information needed for a decision.
2. **Verifiable outcomes:** describe what participants and observers can independently verify.
3. **Honest guarantees:** state who can learn what, including administrators, hosting providers, and colluding participants.
4. **Member-defined governance:** make rules explicit and understandable before a ballot opens.
5. **Choice of deployment:** evaluate hosted and self-hosted operation without making decentralization claims the system cannot support.
6. **Accessible participation:** accommodate assistive technology, low-bandwidth use, and different devices.
7. **Incremental assurance:** do not claim anonymity or election integrity until the protocol and implementation have been independently reviewed.

## Contributing

Implementation and specification work continue together. Contributions should identify assumptions, tradeoffs, threat-model effects, and testable acceptance criteria, and preserve existing signed-byte compatibility and verification gates. See [CONTRIBUTING.md](CONTRIBUTING.md) for DCO sign-off and the development workflow.

## Repository description

Suggested GitHub description: **Private, verifiable decision-making for cooperatives, collectives, and other voluntary groups.**

## License

QuietVote is licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later). See [`LICENSE`](LICENSE). The software is unaudited and not for real elections.
