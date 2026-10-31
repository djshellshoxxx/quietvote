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

For exact source refs, branch/PR accounting, validation and remaining gates, use the [consolidation handoff](docs/handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md) and [integration ledger](docs/plan/CONSOLIDATION.md). The [restart entry](docs/handoffs/QUIETVOTE-NEXT.md) preserves earlier checkpoint receipts. These status documents are not approved specifications or an independent audit.

The [wiki](wiki/) provides voter, organizer, trustee, auditor and developer guides. Screenshots are not included here; the production web build and reproducible browser checks are described in the handoff.

## Current status

**Stage:** Consolidated prototype; review milestone remains blocked<br>
**Implementation:** Code exists in all eight packages (`crypto`, `protocol`, `board`, `server`, `trustee`, `verifier`, `cli`, `web`) and in `verifier-py/`. The integration and audit ledgers record tested repairs and remaining gaps. The web/server registration wire contract is blocked pending protocol review, as explicitly retained by the owner; the working server registration path must not be mistaken for a successful real-client registration journey.<br>
**Specification status:** Drafted; decisions and acceptance criteria remain to be completed  
**Use:** **Not for real elections.** Do not rely on this software for any real decision.  
**Release status:** No release

Do not treat placeholder requirements or proposed capability boundaries as approved product decisions.

Independent security/protocol review, unresolved owner decisions, native translation review and assistive-technology qualification remain external gates. All five translated catalogs remain unreviewed and unoffered. Automated browser checks are not WCAG or screen-reader acceptance. Main has not been merged, and nothing has been released or deployed.

For the consolidated list of open work, see [docs/plan/TODO.md](docs/plan/TODO.md). The roadmap, backlog and decisions are in [docs/plan/](docs/plan/), and simple summaries are in [wiki/](wiki/).

## Guiding principles

1. **Private by design:** collect and expose only the information needed for a decision.
2. **Verifiable outcomes:** describe what participants and observers can independently verify.
3. **Honest guarantees:** state who can learn what, including administrators, hosting providers, and colluding participants.
4. **Member-defined governance:** make rules explicit and understandable before a ballot opens.
5. **Choice of deployment:** evaluate hosted and self-hosted operation without making decentralization claims the system cannot support.
6. **Accessible participation:** accommodate assistive technology, low-bandwidth use, and different devices.
7. **Incremental assurance:** do not claim anonymity or election integrity until the protocol and implementation have been independently reviewed.

## Contributing

The project is not yet implementation-ready. Contributions to the specification framework should identify assumptions, tradeoffs, threat-model effects, and testable acceptance criteria. See [CONTRIBUTING.md](CONTRIBUTING.md) for DCO sign-off and the development workflow.

## Repository description

Suggested GitHub description: **Private, verifiable decision-making for cooperatives, collectives, and other voluntary groups.**

## License

QuietVote is licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later). See [`LICENSE`](LICENSE). The software is unaudited and not for real elections.
