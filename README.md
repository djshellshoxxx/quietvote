# QuietVote

**A private, verifiable decision-making tool for voluntary groups.**

QuietVote is a proposed platform for organizations that want members to make collective decisions without publishing each person's ballot. It is intended for groups such as cooperatives, member associations, unions, collectives, and online communities. The project explores how a group can verify that eligible members participated, prevent duplicate voting, and audit the result while keeping individual choices private.

QuietVote is at the **documentation and specification framework stage**. This repository defines the questions, capabilities, and assurance work that must be settled before implementation. It does not yet claim to provide anonymous voting, cryptographic verifiability, or production-ready election software.

## Product direction

QuietVote aims to support voluntary governance where:

- A group defines its own membership and decision rules.
- Members can participate under real names, pseudonyms, or privacy-preserving credentials, according to the group's chosen policy.
- Ballot choices are private from other members and, where the selected protocol permits, from administrators.
- The group can verify eligibility, enforce its configured participation rules, and validate the tally.
- Groups can choose a hosted service or a self-hosted deployment as the product matures.

The design should favor user-controlled disclosure, minimal data collection, transparent rules, accessible interfaces, and verifiable outcomes. The exact trust model and cryptographic protocol remain open.

## Cryptography and technology

QuietVote uses **cryptography as a trust-reduction tool**, not necessarily cryptocurrency. Candidate design elements include encrypted ballots, zero-knowledge eligibility and ballot-validity proofs, decision-scoped nullifiers to prevent duplicate voting, threshold tally keys, digital signatures, and tamper-evident audit records. The proposed technical flow and the limits of these guarantees are documented in [Cryptography and Technical Design](docs/15-cryptography-and-technical-design.md).

A token or public blockchain is not a core requirement. Existing voting protocols and standards are research starting points; the project has not selected or implemented a protocol. See the [Future Ideas backlog](IDEAS.md) for optional extensions such as portable credentials, federated group decisions, and forkable governance rules.

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

## Screenshots

None: this branch contains specifications only and has no runnable user interface. No mock-ups are shown because they would misrepresent the project's current state.

## Current status

**Stage:** Framework / pre-implementation  
**Implementation:** None on the default branch. Prototype work (protocol records, board CLI, audit tooling) exists only in separate draft pull requests and is unaudited; see [docs/HANDOFF](docs/HANDOFF)  
**Specification status:** Draft; decisions and acceptance criteria remain to be completed  
**Release status:** No release

Do not treat placeholder requirements or proposed capability boundaries as approved product decisions.

## Guiding principles

1. **Private by design:** collect and expose only the information needed for a decision.
2. **Verifiable outcomes:** describe what participants and observers can independently verify.
3. **Honest guarantees:** state who can learn what, including administrators, hosting providers, and colluding participants.
4. **Member-defined governance:** make rules explicit and understandable before a ballot opens.
5. **Choice of deployment:** evaluate hosted and self-hosted operation without making decentralization claims the system cannot support.
6. **Accessible participation:** accommodate assistive technology, low-bandwidth use, and different devices.
7. **Incremental assurance:** do not claim anonymity or election integrity until the protocol and implementation have been independently reviewed.

## Contributing

The project is not yet implementation-ready. Contributions to the specification framework should identify assumptions, tradeoffs, threat-model effects, and testable acceptance criteria. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository description

Suggested GitHub description: **Private, verifiable decision-making for cooperatives, collectives, and other voluntary groups.**

## License

**To be decided.** No license has been selected yet. Until a license file is added, reuse permissions are not granted by this repository.
