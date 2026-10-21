# R-04 — Landscape and Prior Art

**Module ID:** `research-r04`
**Status:** Draft
**Owner:** Research (to be assigned by project owner)
**Last reviewed:** 2026-10-21
**Related specs:** QV-00 (charter), QV-02 (product requirements), QV-05 (ballot protocol), QV-14 (sustainability); ADRs 001–013; companion research R-03.

Evidence grading used below: **[V]** verified by page/paper retrieval in this session (2026-10-21); **[S]** from search-result snippets or secondary sources only; **[B]** background knowledge, not re-checked (treat as `[UNVERIFIED]` until checked). Licence facts marked [V] come from the project repository page. Project status can change; recheck before citing externally.

---

## 1. Executive summary

- The closest prior art is **Helios, Belenios, Zeus and ElectionGuard**: all use homomorphic or mixnet-based end-to-end verifiable (E2E-V) designs with trustees and public verification. QuietVote's cryptographic core (ADR-004) deliberately sits in this lineage; it is **not novel cryptography** and should not pretend to be.
- Real differentiation is in **trust and delivery posture**, not primitives: (1) operator explicitly outside the secrecy/integrity trust base, (2) no mandatory identity/KYC, (3) first-class Tor onion deployment, (4) transparency-log bulletin board with witness cosigning, (5) independent CLI/offline verifier and reproducible builds addressing the web-delivery problem, (6) honest non-claims, (7) no token/chain.
- **Gaps in the market** (hypotheses to validate): tools that are easy for non-technical groups *and* verifiable *and* self-hostable (Belenios is the closest and already serves associations; its trust model collapses to "operator" in simple mode); tools for small groups with strong secrecy and no required email identity; tools for DAO-like groups that want decisions without a token, chain or doxxing.
- **Adoption lesson #1:** the incumbents that win do so on *ease of use for organizers* (Electionbuddy, OpaVote, Belenios's hosted instance), not on cryptographic strength. QuietVote's first release must make an election creatable in minutes by a non-technical organizer even if the verification layers are optional.
- **Adoption lesson #2:** crypto-libertarian DAO tooling shows both demand and failure modes: token-weighted voting, plutocracy, collusion/bribery, and legal fragility (Aragon Association dissolution, Nov 2023). QuietVote's "no token" stance is a differentiator but also removes the economic hooks that sustain those ecosystems; sustainability (QV-14) must come from grants, support and optional hosting.

---

## 2. Comparison matrix

| Tool | Category | Ballot secrecy model | Verifiability | Eligibility/identity | Operator trust | License | Maturity/status |
|---|---|---|---|---|---|---|---|
| **Helios** | E2E-V web voting | Homomorphic ElGamal, trustees (threshold in v3) | Individual + universal (cast-as-intended via Benaloh audit) | Email/Google/GitHub-style; no strong eligibility verifiability | Server controls roll; ballot stuffing possible | Apache-2.0 [V] | Mature, widely used (e.g., IACR elections [B]); 1,118 commits [V] |
| **Belenios** | E2E-V web voting | Helios-derived; credential authority + trustees | Individual + universal + **eligibility** (voter credential signatures) | Credential authority issues one credential per voter | Weak mode: web server plays credential authority and trustee; strong mode separates roles [V] | AGPL-3.0 with OpenSSL exception [V] | Active (Inria/Loria); >1,400 elections/yr in 2020–2021 per developers [S]; certification campaign at SSTIC 2024 [S] |
| **Zeus (GRNET)** | E2E-V (Helios fork) | Mixnet-style shuffle of ballots (README did not confirm) | Publishes ballots, supports non-approval methods | Institutional (Greek academic) | Institutional operator | GPL-3.0-or-later [V] | National academic deployments [B] |
| **ElectionGuard (Microsoft)** | E2E-V SDK for official elections | Homomorphic ElGamal, guardians with quorum; spec 2.x | Verifiable decryption; challenge audit (2.1 changed to nonce release) [S] | Left to integrator | Integrator/vendor | MIT [V] | Pilot deployments (Fulton WI 2020, College Park MD 2023) [S]; SDK evolving |
| **Verificatum** | Mixnet library (Java/C) | Verifiable mix-net with proofs | Universal verifiability of shuffle | Not in scope | n/a | `[UNVERIFIED]` (page not retrievable) | Used in Norwegian & Estonian-style research/pilots [B] |
| **CIVS** | Condorcet-style web voting | Server sees ballots; "anonymous" by policy, not crypto | None cryptographic | Email list of voters | Full trust in service | `[UNVERIFIED]` (site not retrievable) | Long-running free service [B] |
| **OpaVote** | Commercial SaaS | Server-trusted | Audit logs; no E2E-V found in sources [S] | Email/voter-list | Full trust in vendor | Proprietary [B]; $10/user/month per aggregator listing [S] | Mature, many ranked-choice elections |
| **Electionbuddy** | Commercial SaaS | Server-trusted; "observable and auditable" features, "256-bit encryption" marketing [S] | No cryptographic E2E-V found in sources [S] | Voter keys, phone confirmation | Full trust in vendor | Proprietary [B] | Free up to 20 voters; paid tiers $29–$299 [S] |
| **Decidim** | Participatory democracy platform | Mostly public participation; voting module with secret-ish voting plus **Decidim Votings / Bulletin Board with E2E-V (cryptographic voting, "Decidim Bulletin Board" using ElectionGuard-like schemes)** `[UNVERIFIED]` | Newer E2E-V modules `[UNVERIFIED]` | Census/verification handlers | Institutional | AGPL-3.0 [S] | Large civic deployments (Barcelona, etc.) [B] |
| **Loomio** | Deliberation + decision tool | Proposals; "secret" polls are server-trusted [B] | None | Accounts/email | Operator | AGPL-3.0 [V] | Mature, co-op-run (Loomio Co-op) [B] |
| **Polis** | Opinion clustering, not voting | Statements with agree/disagree/pass; no binding decision | Not applicable | Anonymous or integrated | Operator | AGPL-3.0 with §7 additional permission [V] | Used in Taiwan vTaiwan, civic projects [B] |
| **Snapshot** | DAO off-chain signed voting | Public wallet-signed votes by default; **shielded voting** via Shutter threshold encryption (hidden until close) [S] and announced "permanent shielded voting" (ElGamal + ZK) [S, shipped status unconfirmed] | Signed votes on IPFS; strategies computed off-chain | Token/NFT balance snapshot | Snapshot hub + Shutter keypers | MIT (client repo) [V] | Very high adoption in DAOs (382 communities using shielded voting per a dated aggregator page [S]) |
| **Aragon** | DAO framework (on-chain) | Public on-chain votes | Chain consensus | Token-based | Smart-contract/chain | Open-source [B]; Association dissolved Nov 2023 [S] | Declining; governance dispute and tokenholder lawsuit vote [S] |
| **Semaphore** | ZK anonymous group membership + nullifiers | Anonymous signalling/votes within a group | Proofs on chain or off | Group membership (Merkle tree of identity commitments) | Application dependent | MIT [V] | Library, audited components (claims not verified here) |
| **MACI** | Anti-collusion on-chain voting | Encrypted messages to coordinator; key-change to defeat bribery | Coordinator produces ZK proof of correct tally | Signup via gating contracts | **Trusted coordinator can see votes (not alter tally undetected)** [B] | MIT [V] | Repo shown as archived (Aug 2026) with project move indicated [V — recheck new location] |
| **Nostr polls (NIP-88/NIP-41)** | Social-protocol polls | Pubkey-linked, public votes; no standard anonymous scheme found [S] | Relay-dependent | Nostr keys | Relays | Protocol spec (public domain/MIT-style) [B] | Draft/partial client support [S] |
| **Cwtch / Briar** | Metadata-resistant messengers (Tor-based) | Not voting tools; offer transport & group channels | n/a | Pseudonymous keys | Peer-to-peer | Cwtch MIT, Briar GPL/AGPL `[UNVERIFIED]` | Usable as out-of-band channels |

---

## 3. Per-tool analysis

### 3.1 Helios
- **What it is:** Ben Adida's E2E-verifiable web voting (USENIX Security 2008, "Helios: Web-based Open-Audit Voting") [B].
- **Trust model:** server hosts and sees who voted; ballots are encrypted with a trustees' key; voters can audit ("spoil") their encryption (Benaloh challenge). Eligibility is *not* verifiable by outsiders: the server can add ballots on behalf of non-voters (ballot stuffing) because there is no voter signature in the classic Helios; a 2026 e-voting textbook states that current Helios implementations (2.0, 3.1.4) lack some verifiability and secrecy properties relative to the proposed Helios'16 variant [S via arXiv 2602.12398]. Helios'16/ Helios-C variants add voter credentials.
- **Gaps relevant to QuietVote:** no registrar-free eligibility; server-trusted client delivery; limited ballot types.
- **Lessons:** simple cast-or-audit UX works for technical audiences (IACR) but audit participation is low [B].

### 3.2 Belenios
- **Features:** CLI + web server with the same backend; voter credentials (private credential sent to voter, public part to admin); trustees with threshold decryption; election-wide verification via public data [V repository description].
- **Trust model:** repository states that "for maximum security each role must be performed by a different entity"; in the simplest form the web server acts as credential authority and trustee, which is "the simplest (and weakest)" and concentrates trust in the server/operator [V]. A machine-checked analysis found that ballot privacy fails if the registrar misbehaves [S via HAL-01900081], a crucial lesson: **the registrar/credential authority is a first-class trust point and must be modelled in QV-07.**
- **Usage:** developers report >1,400 elections/year in 2020–2021 and >100,000 ballots [S]; developed for "associative or professional elections" [S]; earlier usage skewed academic [S].
- **Licence:** AGPL-3.0 (+OpenSSL exception) [V] — same family as QuietVote's ADR-011; **code reuse is legally possible but the stack differs (OCaml vs TypeScript)** [repo files suggest OCaml, unconfirmed]. Study, don't fork.
- **QuietVote's differences:** (1) ristretto255 vs. Belenios's classic group (per paper; version-specific) [B]; (2) Phase 1 voter-key signature roll committed in manifest; (3) transparency-log bulletin board with consistency proofs; (4) onion-first deployment; (5) no email-centric credential distribution; (6) explicit non-claims.
- **Gaps in Belenios QuietVote could address:** metadata minimization; a transparency-log with witnesses; independent offline verifier packaged for non-experts; no-identity modes. Belenios already has strong formal-methods work (EasyCrypt proof, Tamarin/ProVerif analyses [S]); QuietVote must plan the same assurance (QV-11).

### 3.3 Zeus
- **What it is:** a fork of Helios server developed by GRNET for Greek academic elections, supporting additional voting methods by publishing a tally of cast ballots [V]. License: GPL-3.0-or-later [V]. Describes architecture as closer to the original Helios design [V]. Mixnet claims not confirmed from the README [V], so state only that it is Helios-derived.
- **Lessons:** institutional adoption by a trusted academic network is a realistic path; pluggable counting methods outside the encrypted tally is a design to reconsider for ranked ballots (QV-05 Phase 2).

### 3.4 ElectionGuard
- **What it is:** open-source SDK for E2E-verifiable elections; homomorphic encryption; guardians hold key shares with quorum; MIT licensed [V]. The specification 2.0 reduced election-record proof size by >90% per the spec page; 2.1 changed challenged-ballot auditing to release the encryption nonces instead of performing verifiable decryption [S]. Deployed in pilots such as College Park MD 2023 (5 guardians, quorum 3) and an in-person pilot in Fulton, Wisconsin 2020 whose status (test vs. real contest) is described differently across sources [S].
- **Fit:** ADR-004 explicitly cites ElectionGuard as lineage. Because ElectionGuard targets *public in-person elections* with paper backup, it brings assumptions (voting devices, paper ballots, verification codes) that don't apply to remote web voting. QuietVote should **reuse the published specification's test vectors and ideas where compatible**, but not claim compatibility with it unless byte-level interop is a goal (decision for QV-16).
- **Implication of the 2.1 nonce-release design:** a challenged ballot's nonces are published; this reinforces QV-R03-C-001 (cast ballot nonces must never be retained).

### 3.5 Verificatum
- Verifiable re-encryption mix-net implementation (Wikström) with proofs of shuffle [B]; Norwegian e-voting trials used Scytl, not Verificatum, whereas Verificatum has been used in research and some pilots [B]. Website could not be retrieved here; licence `[UNVERIFIED]`.
- **Relevance:** the mixnet alternative that ADR-004 deferred; needed if ranked/write-in ballots appear. Operational cost: multiple mix servers, ceremonies, and verification of shuffle proofs.

### 3.6 CIVS, OpaVote, Electionbuddy (server-trusted tools)
- **CIVS** (Condorcet Internet Voting Service, Andrew Myers, Cornell): free hosted, Condorcet-Schulze style ranking, email-based voter lists [B]; cannot be verified (site not retrievable here).
- **OpaVote**: SaaS for ranked-choice and other methods; per listing $10/user/month [S]; supports hybrid on-site/off-site voting [S].
- **Electionbuddy**: SaaS with tiers (free ≤20 voters; $29 ≤350; $99 ≤1,000; $299 ≤2,500) [S]; marketing emphasises voter keys, phone confirmation, audit trail, and "verifiable voting" for political parties [S page title]; no cryptographic E2E-V found in sources reviewed [S].
- **Why they win:** zero setup, support, familiar flows, reminders, proxy/in-person hybrid, legal-form templates (notices, minutes), and brand trust for organization secretaries. **Key lesson: organizers buy paperwork-compatibility.** QuietVote can compete only by supplying a printable/exportable election record and notices that standard bylaws accept.
- **Gap:** secrecy is entirely an operator promise; for unions, collectives or activists facing hostile employers/states this is exactly the concern QuietVote targets.

### 3.7 Decidim
- **What it is:** participatory democracy platform (Barcelona City Council origin), AGPL-3.0 [S]. Large-scale civic adoption [B].
- **Voting:** includes modules for votings and, per project materials, cryptographic voting components (bulletin board) `[UNVERIFIED]` — **action: verify before citing**.
- **Lessons:** governance of the *software* by a "Metadecidim" community; strong social contract and public-interest licence; adoption driven by municipalities with in-house IT. Complexity of deployment (Ruby on Rails, modules) is a barrier for small groups — QuietVote's single-binary-ish Node server (ADR-002/003) is a counterpoint.

### 3.8 Loomio
- **What it is:** collaborative decision-making tool for discussion, proposals, polls, outcomes; used by cooperatives, nonprofits, distributed teams [V]; AGPL-3.0 [V]; run by a workers' cooperative [B].
- **Trust model:** server-trusted; "anonymous" polls rely on operator promise [B].
- **Relevance:** the natural **complement and likely integration partner**: Loomio for deliberation, QuietVote for the secret-ballot step (link-out, results import). Co-op target segment is already Loomio's. Position QuietVote as the "secret-ballot companion" to deliberation tools rather than a replacement.

### 3.9 Polis
- **What it is:** opinion-gathering and clustering ("agree/disagree/pass" statements) used for deliberation, not binding decisions; AGPL-3.0 with §7 additional permission [V]; hosted instance free for nonprofits and governments [V].
- **Lessons:** minimal-friction anonymous participation drives engagement; Polis does not claim cryptographic privacy. Useful for pre-vote agenda-setting; not competitor.

### 3.10 Snapshot (+ Shutter)
- **Model:** off-chain gasless voting, signatures from wallets, results from "strategies" (token balances at snapshot block); MIT-licensed client [V]; "easy to verify and hard to contest" tagline [V].
- **Privacy:** votes public by default; **shielded voting** hides vote contents until the proposal closes using Shutter's threshold encryption with keypers (works if threshold of keypers honest) [S]; once finalised votes are revealed with addresses [S]. A newer "permanent shielded voting" design uses threshold-homomorphic ElGamal + ZK proofs to keep votes permanently private while results are computed [S]; shipping status unconfirmed. That design converges on QuietVote's ADR-004 cryptography — **confirming the approach is reasonable** — but inside a token/wallet identity model QuietVote rejects.
- **Adoption signal:** a dated aggregator page claims 382 communities used shielded voting, 2,330+ proposals and 216,805 votes [S] — demonstrates demand for hidden-until-close voting in DAOs.
- **Gaps:** token-weighted plutocracy; wallet addresses linkable to identity; centralized hub; relies on a chain ecosystem.

### 3.11 Aragon
- **Model:** on-chain DAO framework with token (ANT) voting [B]. The Aragon Association announced dissolution on 2 Nov 2023, redeemable treasury ~86K ETH, said the decision could not be put to a public vote for legal reasons, and token holders then voted to sue the Association [S]. Lessons: (1) token-governance can collide with legal reality; (2) governance by the project's own users is hard to make real (the treasury promised to be placed under DAO vote never was [S]); (3) an association (Swiss) as steward ended up a point of legal fragility — relevant to QV-14 and R-03 §6.7.

### 3.12 Semaphore
- **Model:** zero-knowledge group membership proofs with nullifiers allowing anonymous signalling; MIT-licensed; described as "a generic privacy layer" [V]. Nullifier model, audits and setup details were not in the retrieved page; verify at semaphore.pse.dev `[UNVERIFIED]`.
- **Relevance:** QuietVote Phase 3 (ADR-005) cites Semaphore-style ZK Merkle membership with nullifiers. Concerns for QuietVote: trusted setup (Groth16-based) vs transparent alternatives; browser proving time; group-update semantics; library maturity and audit status — need dedicated review before Phase 3.

### 3.13 MACI
- **Model:** voters send encrypted messages to a coordinator who tallies and produces a ZK proof of correct tally; voters can change keys to invalidate earlier bribed votes, so a briber cannot confirm compliance [B]. The coordinator can see votes and could censor, but cannot (undetectably) falsify the tally [B]. License MIT [V]. Repo page indicates "archived by owner Aug 19, 2026" and badges point to another organization path [V] — verify successor and maintenance state before relying on it.
- **Relevance:** the only published design aimed at *collusion-resistance* (coercion mitigation beyond revoting). QuietVote has not adopted it because of the coordinator trust and chain dependency (ADR-012). The **key-change idea** is worth a research track: in Phase 2/3, "re-keying" a voter credential to invalidate a coerced ballot (with the coordinator replaced by threshold trustees). Don't invent: cite MACI and JCJ when specifying (see R-03 §3).

### 3.14 Nostr-based voting
- NIP-88 defines poll events (kind 1068) with options, poll type and end timestamp; NIP-41/other proposals exist; client support limited [S]. Votes are pubkey-identified; no standard anonymous scheme found [S]. One hackathon project (BITvote) requires bitcoin deposits to secure votes [S] — would drag in funds/AML issues (R-03 §6.5).
- **Opportunity:** use Nostr as an *optional bulletin-board mirror / notification transport* (publish signed tree heads as events) consistent with ADR-007 witnessing; never a trust dependency. Needs privacy review (relays see IPs).

### 3.15 Cwtch and Briar
- Metadata-resistant messengers running over Tor onion services (Cwtch from Open Privacy; Briar from the Briar Project) [B; licences `[UNVERIFIED]`]. Not voting tools, but relevant as (a) out-of-band channels for credential delivery and fingerprint confirmation in high-risk groups, (b) architectural precedent for peer-to-peer onion-only apps with no central server.
- QuietVote's P2P-first option was deferred (ADR-002). If revisited (QV-32), Cwtch/Briar illustrate the cost: availability/consistency, offline delivery, and group management.

---

## 4. Feature gap analysis

| Capability | Server-trusted SaaS | Helios/Zeus | Belenios | ElectionGuard SDK | Snapshot/DAO | **QuietVote (planned)** |
|---|---|---|---|---|---|---|
| E2E verifiable tally | No | Yes | Yes | Yes | Partial (signed, public) | Yes |
| Eligibility verifiable | No | No | Yes (credentials) | Integrator | Token-based | Yes (P1 roll commitment; P2/3 tokens) |
| Operator outside secrecy trust base | No | Partially (server sees participants) | Only in strong mode | Integrator | Depends on keypers | **Yes (by design, stated)** |
| No mandatory identity/KYC | No (emails) | No (emails) | Email credentials | n/a | Wallet | **Yes (key-based)** |
| Metadata minimisation / Tor first-class | No | No | No | No | No | **Yes (ADR-009)** |
| Transparency-log bulletin board with witnesses | No | Partial (public ballots) | Partial | Election record | IPFS | **Yes (ADR-007)** |
| Independent offline verifier | No | Yes (JS auditor) | Yes (CLI) | Yes | Partial | **Yes (CLI + offline page)** |
| Reproducible builds / client attestation | No | No | No (as far as researched) `[UNVERIFIED]` | n/a | No | **Planned (ADR-010)** |
| Ranked/Condorcet | Yes | Via Zeus | Limited (check) | Limited | Yes (public) | Phase 2 |
| Paperwork (notices, minutes, templates) | Strong | Weak | Moderate | None | None | **Gap to close (see §6)** |
| Easy hosted trial | Yes | Yes (heliosvoting.org [B]) | Yes (vote.belenios.org [B]) | No | Yes | Later (ADR-002) |
| No token/chain | Yes | Yes | Yes | Yes | No | Yes |
| Coercion-resistance | No | No | No | No | MACI only | **Not claimed (ADR-008)** |

---

## 5. What QuietVote does differently (and does not)

**Differences (defensible):**
1. **Explicit trust decomposition with an untrusted operator** and tests that enforce it (no IP logs, no telemetry — R-03).
2. **Identity-minimal by default:** voter-held keys, a roll committed in the manifest, optional pseudonyms; no email requirement for voting itself.
3. **Verification as a product surface:** CLI verifier, offline verifier page, reproducible builds, and a transparency-log bulletin board with witnesses (ADR-007, ADR-010).
4. **Onion-service first-class deployment** (ADR-009); documented vanguards profile.
5. **Result-disclosure policy in the manifest** protecting small electorates (R-03 §2) — not seen in surveyed tools `[UNVERIFIED as a negative]`.
6. **Honest-guarantee discipline:** published non-claims table; docs linting.
7. **Phased anonymity roadmap** (P1 secret-ballot-public-participation → P2 blind tokens → P3 ZK eligibility) rather than overclaiming.

**Not differences (don't oversell):** the base cryptography (Helios/ElectionGuard/Belenios lineage); threshold trustees; Benaloh audit; AGPL licence (Belenios, Decidim, Loomio, Polis share it).

**Risks of the position:**
- Belenios already occupies "verifiable voting for associations" with a decade of formal analysis; QuietVote must show concrete improvements (metadata, log, no-email, usability) rather than parity.
- "Anarchist/libertarian" branding may reduce adoption by unions, co-ops and foundations that need institutional comfort; keep positioning as design stance (ADR-001) and lead with verifiable privacy in marketing.
- Crypto-libertarian audiences may expect token/chain features; the "no token" decision will be contested.

---

## 6. Adoption lessons

1. **Organizers are the buyer; members are the users.** Incumbents invest in organizer workflow: voter list import, reminders, proxy/in-person hybrid, notices and minutes, support. Budget for these in QV-02/QV-10.
2. **Trust through audit participation is rare.** In Helios-style systems few voters perform audits [B]. Verification must be mostly automatic via observers/auditors (monitors, witnesses), not dependent on mass voter action.
3. **Paperwork compatibility** (bylaws, notices, minutes, legal validity) decides adoption for co-ops and unions (R-03 §6.6).
4. **Operator-hosted trial instance is essential for first contact** (Helios, Belenios offer hosted instances [B]); ADR-002 postpones hosted — consider a clearly labelled demo instance with "not for real elections" banner earlier.
5. **Sustainability by institutions:** Belenios (Inria), Decidim (municipalities/Metadecidim), Loomio (worker co-op), Polis (Computational Democracy Project), ElectionGuard (Microsoft) show that no widely-used tool is sustained by pure volunteers or tokens. See QV-14.
6. **Governance failures of token-based projects** (Aragon) are cautionary for any mission-driven steward; separate the software steward from any treasury.
7. **Interoperability beats replacement:** link with Loomio/Decidim/Discourse/Matrix for deliberation; export standard election records.
8. **Education burden:** secret-ballot caveats (unanimity, coercion) must be explained plainly; surveyed commercial tools rarely do.

---

## 7. Target-user hypotheses (to validate; ranked by initial fit)

| Segment | Needs | Why QuietVote fits | Risks | Validation question |
|---|---|---|---|---|
| **Worker co-ops / consumer co-ops** | Internal decisions, board and policy votes, secret ballots in bylaws, low cost | Existing Loomio culture; values-aligned; AGPL | Statutory notice/proxy rules; small n (R-03 §2) | Do their bylaws permit e-voting and secret ballot via third-party tools? |
| **Mutual-aid groups / collectives** | Anonymous-ish decisions, low trust in platforms, no real-name | No-identity design, onion option | Low funding; high-risk members; usability on phones | Would they use Tor/CLI? What do they use now (Signal polls, Loomio)? |
| **Open-source foundations / communities** | Board/maintainer votes, governance amendments, pseudonymous contributors | Culture of verification; Condor/CIVS precedent (Debian uses its own `devotee` [B]) | Existing tooling (e.g., CIVS, Condorcet votes by mail) is "good enough" | What are pain points in current voting (Debian GR, PSF, Apache)? |
| **DAOs without tokens (membership DAOs, collectives)** | Sybil-limited, private, non-plutocratic decisions | No token; key roll; P3 ZK membership | Sybil resistance without tokens/KYC is hard; fairly niche | How do they define membership; is the roll curated? |
| **Unions (non-statutory votes: consultative, internal)** | Secret internal votes, employer-proof | Operator-untrusted, onion; strong confidentiality | Statutory ballots excluded (R-03 §6.6); legal conservatism; coercion by employer | Which votes are non-statutory? Would the union accept a tool without certification? |
| **Journalist / activist networks** | Secure decisions under adversary | Metadata minimization | Highest risk, highest need for audited code | Threat model workshops |
| **Associations and clubs (general)** | Cheap ballots | Competes with Electionbuddy/OpaVote on price (free self-host) | Self-hosting skill gap; need hosted service | Hosted demand vs self-host |

**Suggested first target** (hypothesis for owner decision): *worker/consumer co-ops and open-source foundations*, with mutual-aid groups as the privacy-maximalist beta cohort. Unions limited to non-statutory votes with explicit legal caveats.

**Research plan (cheap, 4–6 weeks):** 12–20 interviews across 4 segments; capture current tools, vote frequency, electorate size distribution, bylaws language, who administers, and willingness to run a server or Tor. Success metric: ≥3 groups commit to a pilot with a defined election.

---

## 8. Competitive strategy implications

- Position as **"Belenios-grade verifiability with a smaller trust base, easier self-hosting, and a privacy-first network posture"**, plus a "secret-ballot companion" to deliberation tools.
- Prioritise: organizer UX; printable election record; clear non-claims; first formal-methods/audit milestone (QV-11) — Belenios's security credibility rests on its formal analyses.
- Avoid: token features; custody; claims of anonymity in Phase 1; branding that implies legality for statutory elections.
- Opportunities to collaborate: Belenios team (shared test vectors, verifier cross-checks), ElectionGuard spec community, Loomio co-op, Shutter/Snapshot on threshold-homomorphic designs, Tor Project docs.

## 9. Proposed ADRs

- **QV-ADR-P-R04-1 — Position QuietVote as a secret-ballot companion to deliberation tools with documented export/import hooks (Loomio/Decidim/Discourse).** Affects QV-02, QV-09, QV-14.
- **QV-ADR-P-R04-2 — Provide a clearly labelled demo instance earlier than the production hosted offering.** Refines ADR-002. Affects QV-08, QV-12, QV-14.
- **QV-ADR-P-R04-3 — First pilots: co-ops and open-source foundations; mutual-aid as privacy beta cohort; unions only for non-statutory votes.** Affects QV-00 (target group), QV-02.
- **QV-ADR-P-R04-4 — Commit to an organizer "paperwork pack" (notice, minutes, election record) as MVP-adjacent deliverable.** Affects QV-02, QV-10.
- **QV-ADR-P-R04-5 — Assurance plan benchmarks Belenios's formal-analysis practice (symbolic/computational proofs of privacy and verifiability) as a Phase gate.** Affects QV-11.

## 10. Open questions

| Question | Owner | Target review | Proposed default |
|---|---|---|---|
| Verify Decidim's cryptographic voting modules and Bulletin Board status | Research | Before external citation | Treat as unverified |
| Confirm MACI successor repo and maintenance state | Research | Phase 3 planning | Re-fetch |
| Confirm Verificatum and CIVS licences and current status | Research | Before external citation | Treat as unverified |
| Does Belenios offer reproducible builds / signed releases? | Research | QV-11 | Check |
| Is "permanent shielded voting" shipped on Snapshot? | Research | Phase 2 | Check |
| Byte-level interop with ElectionGuard spec worthwhile? | Protocol owner (QV-16) | Protocol design | No; reuse test ideas only |
| Which segment first? | Project owner | After interviews | Co-ops + OSS foundations |

## 11. References (accessed 2026-10-21)

Retrieved (page or search result):
- Belenios repository (licence AGPL-3.0 with OpenSSL exception; roles; weakest/strongest forms) — https://github.com/glondu/belenios
- Helios server repository (Apache-2.0; 1,118 commits) — https://github.com/benadida/helios-server
- ElectionGuard repository (MIT) — https://github.com/microsoft/electionguard ; spec page https://electionguard.vote/spec/ ; roadmap https://electionguard.vote/overview/Roadmap/ ; College Park 2023 https://electionguard.vote/elections/College_Park_Maryland_2023/ ; USENIX Security 2024 Benaloh paper https://usenix.org/system/files/usenixsecurity24-benaloh.pdf
- Zeus (GRNET) repository (GPL-3.0-or-later; Helios fork) — https://github.com/grnet/zeus
- Loomio repository (AGPL-3.0) — https://github.com/loomio/loomio
- Polis repository (AGPL-3.0 with §7 additional permission) — https://github.com/compdemocracy/polis
- Snapshot repository (MIT) — https://github.com/snapshot-labs/snapshot
- MACI repository (MIT; archived notice) — https://github.com/privacy-scaling-explorations/maci
- Semaphore repository (MIT) — https://github.com/semaphore-protocol/semaphore
- Snapshot shielded voting / Shutter — https://decrypt.co/105201/snapshot-adds-shielded-voting-daos-help-solve-voter-apathy ; https://www.theblock.co/news/business/2022-07-18-snapshot-to-let-daos-hide-votes-with-threshold-encryption-158084 ; https://shutternetwork.discourse.group/t/permanent-shielded-voting-is-coming-to-snapshot/761
- Aragon Association dissolution — https://www.theblock.co/news/ecosystems/2023-11-02-aragon-association-to-dissolve-itself-provide-liquidity-for-ant-redemption-261179 ; https://thedefiant.io/aragon-tokenholders-vote-to-sue-aragon-association
- Electionbuddy / OpaVote pricing listings (aggregators; vendor pages not verified) — https://www.techjockey.com/detail/electionbuddy ; https://www.getapp.ie/compare/114697/2050518/opavote/vs/electionbuddy ; https://electionbuddy.com/customers/political-parties/
- Nostr NIP-88 (polls) — https://nips.4rs.nl/nips/88
- Helios vs Belenios properties — "Secrecy and Verifiability: An Introduction to Electronic Voting", https://arxiv.org/pdf/2602.12398 ; Belenios EasyCrypt proofs https://hal.archives-ouvertes.fr/hal-01900081 ; Belenios SSTIC 2024 certification slides https://sstic.org/media/SSTIC2024/SSTIC-actes/belenios_the_certification_campaign/SSTIC2024-Slides-belenios_the_certification_campaign-bossuat_brocas_kovacs_gaudry_glondu_cortier.pdf ; CSF 2021 https://satoss.uni.lu/jun/papers/CSF21.pdf
- Belenios usage figures — https://members.loria.fr/ADebant/files/talks/2022-gt-mfs.pdf ; https://www.loria.fr/?p=3925
- Decidim licence/adoption listings — https://knowledge.iadb.org/en/open-knowledge/code-development/open-source-solution/decidim ; https://cop-demos.jrc.ec.europa.eu/citizen-engagement-organisations/implementation-civic-tech-platform-decidim

Not retrievable in this session (claims tagged `[UNVERIFIED]`/[B]): Verificatum site (verificatum.org), CIVS (civs1.civs.us), Cwtch/Briar licences, Helios original paper (Adida, USENIX Security 2008), MACI documentation (maci.pse.dev), Semaphore docs (semaphore.pse.dev).
