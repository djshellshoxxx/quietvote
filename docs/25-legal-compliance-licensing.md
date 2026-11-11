# QV-25 — Legal, Compliance and Licensing

**Module ID:** `legal-compliance`
**Status:** Draft
**Owner:** Project steward with qualified counsel
**Last reviewed:** 2026-10-21
**Related specs:** QV-06 (data lifecycle), QV-12 (operations), QV-14 (sustainability), QV-26 (metadata), QV-31 (telemetry), QV-03 (governance); ADR-001, ADR-011, ADR-012.

> **Not legal advice.** This document is an engineering and product analysis prepared by non-lawyers to scope what counsel must review. Statutes and regulations change; every citation below must be re-verified against current official text by qualified counsel in the relevant jurisdiction before reliance. Templates in this document are starting points, not approved text.

## 1. Objective
Define the licensing mechanics (AGPL-3.0-or-later code, CC BY-SA 4.0 docs, DCO sign-off per ADR-011), required disclaimers, a privacy-policy template, GDPR role analysis for self-hosted and maintainer-hosted deployments, an export-control notice, a terms-of-use template, and the checklist of questions that require counsel.

## 2. Scope
### In scope
Licensing, contribution mechanics, trademark basics, disclaimers, privacy-law role analysis (primary lens GDPR/UK GDPR; others flagged), export-control notice, election-law positioning, counsel checklist.
### Out of scope
Jurisdiction-specific legal opinions; tax; corporate formation; certification as a public-election system (explicitly not targeted — README scope).

## 3. Licensing mechanics

### 3.1 Code: AGPL-3.0-or-later (ADR-011)
- Each source file carries an SPDX header: `SPDX-License-Identifier: AGPL-3.0-or-later` and `SPDX-FileCopyrightText: <year> QuietVote contributors`. Repository includes `LICENSE` (full AGPL-3.0 text, obtained from https://www.gnu.org/licenses/agpl-3.0.txt) and a REUSE-compliant layout (https://reuse.software) [spec not re-fetched; verify].
- **Network clause (§13):** if a modified version interacts with users remotely, the operator must offer those users the Corresponding Source of the *modified* version. QuietVote implements this via a footer/`/source` route and `/.well-known/quietvote/instance` field `source_url` pointing to the exact commit/build (QV-12 descriptor). [Text of §13 from GNU AGPL-3.0; the search run did not retrieve it — counsel/maintainer to confirm exact wording.] Requirement: unmodified deployments also expose `source_url` (Should) to make compliance a non-event.
- **Dependencies:** `@noble/curves`, `@noble/hashes` are MIT-licensed [VERIFIED: noble-curves and noble-hashes repos, 2026-10-21] — MIT is compatible for inclusion in an AGPL work. Dependency policy: only licences compatible with AGPL-3.0-or-later; CI runs a licence scanner; no GPL-2.0-only, SSPL, BUSL, or non-commercial licences.
- **Static client bundle** is served to users; it is AGPL code, so Source offer applies to bundle sources (reproducible build, ADR-010).
- **Hosted forks** must publish modifications (design goal of ADR-011). AGPL does **not** restrict running unmodified software commercially; does not stop hosting competitors; consistent with QV-14.
- **Warranty disclaimer/limitation** (AGPL §15–16) is preserved in `LICENSE` and surfaced in the UI "About" page.
- "Or later" grants FSF-published future versions; project policy: re-assess when a new AGPL version appears [UNVERIFIED].

### 3.2 Documentation: CC BY-SA 4.0 (ADR-011)
- Specs/docs are CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Creative Commons itself advises that CC licences are not recommended for software, so **code in docs** (snippets, pseudocode, schemas) is dual-licensed: CC BY-SA 4.0 and AGPL-3.0-or-later (reader may choose) — recorded in a `docs/LICENSE-NOTE.md`. [Counsel to confirm that dual-licensing text is valid and workable.]
- Compatibility: CC lists GPL-3.0 as a one-way compatible licence for BY-SA 4.0 adaptations [UNVERIFIED for AGPL-3.0; do not assume]. Therefore snippets are dual-licensed rather than relying on the compatibility mechanism.
- Attribution: "QuietVote contributors" with link to repository; the NOTICE lists third-party content.

### 3.3 Contributions: DCO
- Contributors certify the Developer Certificate of Origin v1.1 (https://developercertificate.org, text maintained by the Linux Foundation) by adding `Signed-off-by: Name <email>` to each commit (`git commit -s`). The DCO lets the project accept contributions under the repository's licence **without transferring copyright** and without a CLA. [Source: Linux Foundation best-practices page and project CONTRIBUTING files found in search; exact four-clause text to be copied from developercertificate.org.]
- Enforcement: CI check (DCO app or script) fails commits lacking sign-off; `CONTRIBUTING.md` explains pseudonymous contributors: the certification requires a real-person name per many interpretations — project policy for pseudonymous/anonymous contributors is **open** (QV-OQ-25-2; tension with ADR-001 ethos; counsel input needed).
- **Relicensing consequence:** no CLA ⇒ no unilateral relicensing; changing to a later AGPL version is permitted by "or later"; dual-licensing for proprietary use is **not** possible without contributor consent (acknowledged; consistent with QV-14 open-core rejection).

### 3.4 Trademark and name
"QuietVote" name/logo: register or at least use consistently; policy permits accurate references, forks under different names; hosted offerings using the name must run unmodified official builds or clearly state modifications. [Search for conflicting existing marks required — not performed.] 

### 3.5 Patents
AGPL-3.0 includes an express contributor patent licence (§11) [to be confirmed by counsel]. Cryptographic constructions used are published/standard; no patent clearance has been performed [UNVERIFIED].

## 4. Disclaimers (must appear in README, UI footer, results page, ToU)
1. **No warranty:** software provided "as is" under AGPL §15–16.
2. **Not a certified election system:** QuietVote is intended for internal decisions of voluntary organisations. It is not certified for public/governmental elections, statutory union ballots, company shareholder votes, or any context where law prescribes a voting method, supervisor, or certified system. Using it in such contexts is the organisation's responsibility. <!-- claims-lint-ignore -->
3. **Experimental status until independent review:** "No security audit has yet been completed" banner until QV-11 gates are passed. No claim of anonymity or coercion resistance beyond the specifications (ADR-008).
4. **Residual risks:** compromised devices, coerced voters, small-group inference, metadata (list from ADR-008 and QV-26).
5. **Results are group decisions:** the maintainers/operators are not responsible for outcomes or disputes.
6. **Not legal/election-administration advice.**

## 5. Privacy-policy template (hosted instance; adapt per deployment)
> **Privacy notice — [Operator name], hosting QuietVote at [domain/onion].**
> **Who we are.** [Operator] hosts the QuietVote software for organisations. For the personal data of members in an organisation's election, the organisation decides why and how data is used and is the controller; we act as its processor under a data-processing agreement. For visitors' basic connection data and for our own account/billing data, we are the controller.
> **What we process.** (a) *Organisation account data:* organisation name, admin public key(s), optional contact email (stored encrypted to the admin key if you supply it). (b) *Election data:* voter public keys (pseudonymous), the signed election manifest, encrypted ballots and proofs, public results, audit transcripts. We cannot read individual choices; they are encrypted to trustees' keys. (c) *Technical data:* we do **not** store IP addresses, user agents or referrers in logs. Short-lived, in-memory rate-limit counters use a keyed hash that is discarded daily. Aggregate metrics (counts, latency histograms) contain no personal data. (d) *Billing data:* processed by [payment processor].
> **Cookies and tracking.** None. We use no analytics or third-party resources.
> **Purposes and legal bases.** Operating the service for the organisation (contract / controller's instructions); security and abuse prevention (legitimate interests); billing (contract; legal obligations).
> **Retention.** Election data: as the organisation configures, default [X] days after close; log files ≤ 7 days; backups ≤ 35 days. The public append-only log contains only pseudonymous keys and hashes; deleting an organisation removes the mapping from keys to people (held by the organisation), not entries from the log (which cannot be rewritten by design).
> **Your rights.** Contact the organisation (controller) for access, rectification, erasure, restriction, objection and portability; we will assist. You may complain to your supervisory authority.
> **Transfers.** [Hosting location/subprocessors list.] 
> **Security.** Encryption in transit; ballots encrypted on the voter's device; threshold trustee decryption; open source. No system is perfectly secure; see our threat model and limitations.
> **Changes.** Material changes announced 90 days in advance; expansions of data collection require community review (QV-14 REQ-007).
> **Contact.** [Contact]; [DPO if required].

## 6. GDPR role analysis
(Primary references: Regulation (EU) 2016/679, Art. 4(7) controller, 4(8) processor, 24, 25, 26, 28, 30, 32, 33, 35. Article text was not retrieved in this session; the EDPB Guidelines 07/2020 on the concepts of controller and processor, summarised by Mayer Brown at https://www.mayerbrown.com/en/insights/publications/2020/09/european-data-protection-board-publishes-guidelines-on-the-concepts-of-controller-joint-controller-and-processor, state the joint-participation test for joint controllers and the requirement of a binding arrangement. Counsel to verify article numbers and EDPB guidance.)

| Deployment | Organisation (group) | Operator | QuietVote project/maintainers |
|---|---|---|---|
| **Self-hosted by the group** | Controller (determines purposes/means); also the operator | (same entity) | **Not** a controller or processor: supplies software and does not process data [counsel to confirm; relies on no telemetry — QV-31 and no phone-home] |
| **Self-hosted by a third-party (e.g., a technical member or vendor)** | Controller | Processor (Art. 28 contract needed) | Not involved |
| **Maintainer-hosted** | Controller of members' personal data (voter keys, roll mapping if provided) | Maintainer = processor for election data; **controller** for own account/billing and any security logs | Same entity as operator |
| **Federated / multi-operator (QV-32)** | Controller | Each operator a processor or, if setting own purposes, joint/separate controller → arrangement under Art. 26 needed | — |

Key analyses:
1. **Is the voter key personal data?** A pseudonymous public key linked to an identifiable person by the group is personal data (pseudonymisation does not remove GDPR scope). On the operator's side, if the operator cannot re-identify (no mapping), it may still be personal data in context — treat as personal data (conservative).
2. **Special categories (Art. 9):** Voting in a trade union, political, religious or similar organisation can reveal trade-union membership, political opinions or religious belief; **participation lists (Phase 1) can themselves be special-category data**. Choice secrecy aids compliance, but public participation and roll membership require an Art. 9(2) condition (e.g., 9(2)(d), processing by a not-for-profit body with political/philosophical/religious/trade-union aim for its members) [counsel to confirm applicability and Member State law]. Hosted deployments should minimise (no names on server).
3. **Data minimisation / protection by design (Art. 5(1)(c), 25):** supports QuietVote's design (ADR-009, QV-26, QV-31). Record this in the DPIA.
4. **DPIA (Art. 35):** likely required for large-scale processing of special-category data or systematic monitoring; deliver a DPIA template with the spec; hosted operator to maintain a record of processing (Art. 30) for processor activities.
5. **Right to erasure (Art. 17) vs append-only log:** conflict managed by (i) logging only pseudonymous keys/hashes, (ii) the key↔person mapping lives outside the log and can be deleted, (iii) ciphertexts become undecryptable after share destruction (ADR-013). Whether this meets "erasure" is a legal question [counsel]. Exceptions Art. 17(3) may apply (legal claims). Document explicitly that the log is immutable by design.
6. **Portability (Art. 20):** export function (QV-12).
7. **Breach notification (Art. 33/34):** processor notifies controller without undue delay; controller notifies authority within 72 hours when required. Incident runbook (QV-12 §10) includes the timing.
8. **International transfers (Chapter V):** choose EU/EEA hosting for hosted offering where possible; list subprocessors.
9. **ePrivacy / cookies:** no cookies/storage beyond strictly necessary functionality; local storage of keys is user-controlled; thus consent banner likely unnecessary [counsel].
10. **UK GDPR, CCPA/CPRA, Swiss FADP and others:** similar role concepts; confirm separately.
11. **EU representative (Art. 27) / DPO (Art. 37):** assess when hosted for EU data subjects from outside EU/EEA; DPO needed if core activities involve large-scale special-category processing [counsel].
12. **Employment/works-council context:** employer-run internal votes may be subject to national labour law.

## 7. Election-law positioning
- Project scope excludes governmental elections and legally binding statutory votes (README). Some organisations are legally required to use specific procedures (e.g., union officer elections under national statutes such as the US LMRDA secret-ballot provisions, 29 U.S.C. §481, or UK trade-union legislation) [citations from memory — UNVERIFIED; counsel to confirm]; cooperatives' and associations' bylaws/statutes may mandate quorum, notice, proxy rules, or physical records. The manifest/UX should surface a notice: "Check your bylaws and applicable law before relying on an electronic ballot".
- Template statement for organisers: "The organisation is responsible for ensuring this electronic voting method is permitted by its governing documents and applicable law."
- Delegation/proxy (QV-20 §9.2) and electronic notice rules vary by jurisdiction.

## 8. Export-control notice
QuietVote contains and implements strong cryptography (ristretto255 / Ed25519 / hashes), published as open-source code.
- **United States (EAR):** Open-source encryption source code that is publicly available is generally treated under EAR §740.13 / §734.3(b)(3) provisions; a 2021 BIS final rule narrowed the notification requirement so that email notice to BIS and the ENC Encryption Request Coordinator now applies only to publicly available encryption source code and beta software implementing **non-standard cryptography** (found via search of law-firm summaries, e.g., https://www.jonesday.com/en/insights/2021/04/commerce-reduces-requirements-relating-to-massmarket-encryption-items-and-publicly-available-software; current citation appears as §740.13(b), previously (e) — **verify against current eCFR**). Whether ristretto255-based constructions count as "standard cryptography" under the EAR definition (Part 772) requires counsel/BIS confirmation; Ed25519 and SHA-2/3 are widely published standards, but the novel combination in the protocol is not an item of "non-standard cryptography" merely by composition [UNVERIFIED].
- **EU:** Dual-use Regulation (EU) 2021/821, Category 5 Part 2; publicly available ("in the public domain") software generally outside scope [UNVERIFIED; counsel].
- **Distribution notice (README/releases):** "This software includes cryptographic functionality. Export, re-export, or use of cryptographic software may be restricted in some countries. Users are responsible for compliance with applicable laws. Do not download or use this software if prohibited." Sanctions: do not knowingly distribute hosted services to embargoed regions; the open-source repo itself is generally treated as published information [counsel].
- **Use-restrictions:** some jurisdictions restrict personal use of encryption or Tor [UNVERIFIED]; document that onion hosting and use are the operator's/users' responsibility.
- Action: counsel decides whether to send a BIS notification as a precaution and whether GitHub hosting or release signing changes anything.

## 9. Terms-of-use template (hosted offering and project website)
1. **Acceptance and scope.** The service lets organisations conduct internal votes. By creating an organisation you accept these terms.
2. **Eligibility and no identity requirement.** We do not require identity verification; organisations are solely responsible for deciding who may vote.
3. **Your responsibilities.** Comply with law and your governing documents; do not use the service for unlawful purposes, harassment, impersonation, or governmental/statutory elections requiring certified systems; protect keys — **we cannot recover lost keys** (QV-12 §5). <!-- claims-lint-ignore -->
4. **Data and export.** You own your content. You may export all election data at any time and free of charge; we will not hold data hostage (QV-14 REQ-001).
5. **Privacy.** See Privacy Notice; the DPA is incorporated for organisations in scope of GDPR.
6. **No guarantee of secrecy beyond documented model.** Secrecy depends on honest trustees and uncompromised devices; see "Guarantees and non-claims".
7. **Availability.** Best-effort for free tier; SLA only per paid contract; we may suspend during security incidents; ballots cannot be extended by us (QV-12 §6).
8. **Acceptable use & enforcement.** We may suspend organisations for abuse after notice where practical; because we cannot see content, enforcement relies on reports and metadata of public manifests (titles may be public by group choice).
9. **Intellectual property.** Software: AGPL-3.0-or-later; docs: CC BY-SA 4.0; trademarks: see policy.
10. **Warranty disclaimer; limitation of liability** [jurisdiction-specific; counsel] — to the maximum extent permitted by law.
11. **Indemnity** [counsel; consider omitting for consumers/small groups].
12. **Termination and exit.** You may leave at any time; we give ≥ 90 days' notice (except security/abuse) and a complete export.
13. **Changes.** 90 days' notice for material changes.
14. **Governing law and disputes.** [Counsel.] 
15. **Law-enforcement requests.** Policy: we can only disclose what we have (ciphertexts, pseudonymous keys, manifests, aggregate metrics); we notify the affected organisation unless prohibited; we publish a transparency report [policy; counsel].

## 10. Compliance requirements
| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-25-REQ-001 | Every source file shall carry an SPDX licence header and the repo shall pass a REUSE lint in CI | Must | CI green | CI |
| QV-25-REQ-002 | Dependencies shall be licence-scanned; incompatible licences fail the build | Must | Scanner config; failing fixture | CI |
| QV-25-REQ-003 | Commits shall be DCO-signed; CI shall reject unsigned commits | Must | Test PR fails | CI |
| QV-25-REQ-004 | Every deployment shall expose `source_url` for AGPL §13 compliance | Should | Instance descriptor field exists | Integration |
| QV-25-REQ-005 | UI/README shall present disclaimers §4 and an "experimental" banner until audit gate passes | Must | Visual review/E2E snapshot | Review |
| QV-25-REQ-006 | A privacy notice, DPA template, DPIA template and ToU template shall be published, reviewed by counsel before hosted launch | Must | Counsel sign-off recorded | Review |
| QV-25-REQ-007 | The software shall contain no telemetry/phone-home by default (supports controller analysis) | Must | Network-capture test shows no outbound calls | Test |
| QV-25-REQ-008 | Export-control notice shall be in README and release notes | Should | Presence check | Review |
| QV-25-REQ-009 | The manifest UI shall show the bylaws/law notice before an election is published | Should | UI test | E2E |

## 11. Counsel-required checklist
1. Confirm AGPL-3.0-or-later fits project goals; evaluate §13 compliance for the hosted client; confirm compatibility of all dependencies (including MIT noble libs) and dual-licensing of snippets in CC BY-SA docs.
2. Review DCO text and handling of pseudonymous contributors; decide CLA/no CLA.
3. Entity choice and jurisdiction (nonprofit/association/cooperative/fiscal host); liability shielding for maintainers.
4. Trademark clearance for "QuietVote"; policy.
5. GDPR: confirm roles (§6) for each deployment, Art. 9 basis, DPIA, DPA, subprocessors, transfers, DPO/Art. 27 rep, erasure vs append-only log, retention defaults.
6. Non-EU privacy law applicability (UK, US states, Brazil LGPD, etc.).
7. Export control (EAR; EU dual-use; sanctions); decide whether to notify BIS; classification of ristretto255 composition.
8. Election/organisation law for target sectors: unions, cooperatives, associations, HOAs, student bodies — what is permitted and what notices are needed.
9. Terms, limitation of liability, indemnity enforceability; consumer-law constraints.
10. Law-enforcement request policy, canary statements, data-retention laws applicable to operators/ISPs (including whether hosting a Tor onion service triggers duties).
11. Security vulnerability disclosure safe-harbour language.
12. Insurance needs for hosted offering.
13. Accessibility legal requirements (EU Accessibility Act, ADA) if offering commercial service (QV-13).
14. Tax and payment processing; bounties/payments to contributors across jurisdictions.
15. Records for audits: retention of legal documents.

## 12. Data and privacy
This spec governs documents, not data; the privacy template reflects QV-06/QV-31. Retention defaults to be fixed with counsel.

## 13. Security and abuse cases
| Case | Cause | Impact | Mitigation | Residual |
|---|---|---|---|---|
| License violation by hosted fork | Competitor | Closed modifications | AGPL §13 enforcement, source_url | Enforcement cost |
| Unlawful use (sham/illegal elections) | Users | Reputation/legal | ToU, disclaimers, scope notices | Cannot police content |
| Compelled disclosure | Authority | Metadata exposure | Minimal data; policy | Residual |
| Contributor submits copied code | Contributor | License contamination | DCO, review | Residual |

## 14. Interfaces and dependencies
Feeds QV-12 (descriptor fields), QV-10 (notices), QV-14 (terms), QV-31 (telemetry compliance). Repo files: `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/LICENSE-NOTE.md`, `legal/` templates.

## 15. UX, accessibility, localization
Legal notices in plain language, localised, accessible, not buried; translations flagged "informational; English governs" unless counsel advises otherwise.

## 16. Operations
Track legal-template versions; log acceptance of ToU by org admins (organisation-level, no voter data); handle requests (access/erasure) via controller workflow; incident notifications per QV-12.

## 17. Testing and verification
CI checks (REUSE, DCO, licence scan); doc review; counsel review gate before hosted launch; periodic (annual) re-verification of citations.

## 18. Constraints and assumptions
Authors are not lawyers; sources partially retrieved; law varies and evolves.

## 19. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-25-1 Dual-licensing of code snippets in docs valid? | Counsel | Before 1.0 | AGPL OR CC BY-SA at reader's choice |
| QV-OQ-25-2 Pseudonymous contributors under DCO | Steward + counsel | Before accepting external PRs | Accept "known by name" pseudonyms with project policy; counsel to rule |
| QV-OQ-25-3 Is Art. 9(2)(d) applicable to typical groups? | Counsel | Hosted launch | Treat as special-category by default |
| QV-OQ-25-4 BIS notification needed? | Counsel | Before first release | Send precautionary notice if counsel advises |
| QV-OQ-25-5 Jurisdiction of hosted operator | Steward | Stage 3 (QV-14) | TBD |

## 20. Proposed ADRs
- **QV-ADR-P25-1 — DCO + no CLA; no proprietary dual-licensing.**
- **QV-ADR-P25-2 — Snippets in docs dual-licensed CC BY-SA 4.0 / AGPL-3.0-or-later.**
- **QV-ADR-P25-3 — Software has no phone-home; maintainers are not controllers for self-hosted deployments.**
- **QV-ADR-P25-4 — Experimental banner until audit gate passes.**

## 21. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Qualified counsel | Pending | — | Required before hosted launch |
| Project owner | Pending | — | — |

## References (accessed 2026-10-21)
- GNU AGPL-3.0 text: https://www.gnu.org/licenses/agpl-3.0.txt [not retrieved in this session; §13/§15/§16/§11 references from knowledge — UNVERIFIED].
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ [not retrieved; compat claims UNVERIFIED].
- Developer Certificate of Origin: https://developercertificate.org ; Linux Foundation DCO guidance: https://bestpractices.linuxfoundation.org/ip/contribution-mechanisms-dco.html (appeared in search).
- Jones Day, "Commerce Reduces Requirements Relating to Mass-Market Encryption Items and Publicly Available Software" (2021): https://www.jonesday.com/en/insights/2021/04/commerce-reduces-requirements-relating-to-massmarket-encryption-items-and-publicly-available-software (search result summary only).
- EDPB Guidelines 07/2020 summary: https://www.mayerbrown.com/en/insights/publications/2020/09/european-data-protection-board-publishes-guidelines-on-the-concepts-of-controller-joint-controller-and-processor
- Regulation (EU) 2016/679 (GDPR), EUR-Lex: https://eur-lex.europa.eu/eli/reg/2016/679/oj [article text not retrieved].
- REUSE specification: https://reuse.software [not retrieved].
- US LMRDA 29 U.S.C. §481; UK Trade Union and Labour Relations (Consolidation) Act 1992.
