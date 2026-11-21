# QV-27 — Open-Source Project Governance and Release Management

**Module ID:** `project-governance`  
**Status:** Draft  
**Owner:** Project owner (initial steward)  
**Last reviewed:** 2026-10-21  
**Related specs:** QV-14 (business/sustainability), QV-19 (supply chain, release pipeline), QV-30 (engineering standards, versioning), QV-11 (assurance gates), QV-12 (operations), QV-07 (threat model); ADR-001, 011, 012

This spec governs the **project** (people, decisions, releases). Governance of a voting group that *uses* QuietVote is QV-03.

## 1. Objective

Run QuietVote as an open-source project that cannot be captured by a single person, vendor or funder, whose releases are predictable and verifiable, whose security problems are handled responsibly, and whose claims never outrun the evidence (ADR-001). Exit-friendliness applies to the project itself: anyone may fork, mirror, rebuild and verify.

## 2. Scope

### In scope
Roles and maintainers; decision process (RFC/ADR); release cadence and channels; security releases and disclosure; deprecation policy; trademark stance; code of conduct approach; funding transparency; succession; fork policy.

### Out of scope
Pricing and business model (QV-14); technical release mechanics (QV-19 §9–§13); coding rules (QV-30); legal entity formation (open question).

## 3. Actors

| Actor | Goal |
|---|---|
| Contributor | Propose and land changes |
| Maintainer | Review, merge, steward packages |
| Security reviewer | Review crypto/protocol and handle vulnerability reports |
| Release maintainer | Run the release and signing ceremony |
| Steward (initial: project owner) | Break deadlocks during bootstrap, then phase out |
| User/operator | Run releases, report issues |
| Funder/sponsor | Support project without gaining control |
| Independent builder/auditor | Rebuild, review, publish findings |

## 4. Principles

1. **Verify, don't trust the project either.** Releases are reproducible and signed by multiple people (QV-19); no single maintainer can ship.
2. **No privileged roadmap for money.** Funding does not buy features, protocol decisions, security-claim wording, or release timing.
3. **Plural by design.** Forking is a feature; the license (AGPL-3.0-or-later, ADR-011) and the data/export formats guarantee exit.
4. **Honest claims.** The project publishes limitations alongside capabilities; claims follow the register in QV-07/QV-30.
5. **Minimal necessary identity.** Contribution requires DCO sign-off with a real or consistently used name and a reachable email; no government ID, no KYC, no employer disclosure. Pseudonymous contributors are welcome; maintainers must be reachable under a persistent identity and hold keys (see §5.3).
6. **Transparency by default.** Decisions, finances and security advisories are public (embargoed exceptions in §8).

## 5. Roles and maintainers

### 5.1 Roles

| Role | How obtained | Rights | Responsibilities |
|---|---|---|---|
| Contributor | Anyone with a DCO-signed PR | Propose, comment, vote on RFC (non-binding) | Follow CoC, DCO, QV-30 |
| Reviewer | >= 5 merged non-trivial PRs and invitation by a maintainer | Approve PRs in assigned areas (counts toward 1-approval paths) | Timely reviews |
| Maintainer | Nomination by a maintainer, approved by lazy consensus of maintainers over 7 days with no objection (or 2/3 vote) after >= 6 months of sustained contribution | Merge rights (via merge queue), vote on governance, release signing eligibility | Package ownership, triage, upholding standards |
| Security reviewer | Maintainer or external expert, approved by 2/3 of maintainers | Required approver on crypto/protocol paths; access to private advisories | Confidentiality, review quality |
| Release maintainer (rotating) | Maintainer with a registered release key | Runs release checklist, signs manifest (2-of-N, QV-19) | Reproducibility checks |
| Steward | Initial project owner | Break ties during bootstrap; hold repository/org admin until transfer | Sunset per §5.4 |

### 5.2 Structure

- Minimum **3 maintainers** before 1.0 and **5** within 12 months of 1.0 (bus factor). No single employer may employ a majority of maintainers or of security reviewers; if it happens, new nominations from other affiliations are prioritised and, if unresolved in 90 days, the excess maintainers abstain from governance votes.
- Package ownership recorded in `.github/CODEOWNERS`; each package has >= 2 owners (crypto, protocol: >= 1 security reviewer).
- Maintainer list, affiliations (voluntarily declared; employer affiliations of maintainers are required to be disclosed publicly for conflict handling), and release-key fingerprints are in `MAINTAINERS.md` and `docs/RELEASE-KEYS.md`.

### 5.3 Maintainer security hygiene

Hardware-backed 2FA, hardware-backed release key kept offline, signed commits for release branches, no shared accounts, annual key-rotation drill. A maintainer who loses their key follows the key-loss runbook (revocation entry in the next signed manifest, QV-19 §12).

### 5.4 Steward sunset

The steward role expires at the earliest of 1.0 release or 24 months. At sunset: org ownership transfers to a neutral multi-owner arrangement (>= 3 org owners), the domain, package names, signing-key custody and release infrastructure are documented and held jointly (no single-person control of any registry, DNS or key). Until then the steward may only break ties, never override a 2/3 maintainer vote on technical matters, and may be removed by 2/3 of maintainers for cause (CoC violation, abandonment > 90 days, key compromise).

### 5.5 Removal and inactivity

Maintainers inactive for 6 months move to emeritus by notice and can return on request. Removal for cause requires a 2/3 vote of other maintainers, written reasons recorded privately, summary public; appeals to the maintainers as a whole after 30 days.

## 6. Decision process

| Decision class | Examples | Process | Approval |
|---|---|---|---|
| Routine change | bug fix, refactor, docs | PR | QV-30 review rules |
| Significant change | new feature, new CLI command, config format | Issue -> design note -> PR | 1 maintainer + lazy consensus 72 h |
| Architectural / dependency / protocol | New production dependency, cryptographic change, wire format, deployment model, data retention | **RFC** in `docs/rfcs/NNNN-title.md`, then **ADR** in decision log | 2/3 of maintainers incl. >= 1 security reviewer for crypto; 14-day comment period minimum; independent review (QV-11) for protocol |
| Governance change | This document, roles, license (license change needs unanimous maintainers and cannot remove copyleft for existing code) | RFC | 2/3 of maintainers + 30-day public comment |
| Security-embargoed | Vulnerabilities | Private advisory | Security reviewers + release maintainer |
| Emergency | Revoke release, rotate key | Any two maintainers | Retroactive public report within 7 days |

Rules:
- **Lazy consensus** is default; silence after the stated window is assent; any maintainer may call a vote ("+1/0/-1", 2/3 of votes cast with quorum of 50% of maintainers).
- Votes are public except those involving personnel; conflicts of interest must be declared and the conflicted maintainer abstains.
- Decisions are recorded as ADRs (`QV-ADR-NNN`) in `docs/decision-log.md` with context, alternatives, consequences, review trigger (template already in that file). Provisional baseline ADRs 001–013 stay provisional until an owner review is recorded; that review will be performed by the maintainers collectively once the maintainer body exists.
- No decision may reduce stated user protections (export, exit, no-KYC, no-token, no-telemetry) without superseding the relevant ADR via the RFC path *and* a major-version boundary.
- **Dogfooding (aspiration):** from 1.0, binding maintainer votes on governance changes should be conducted using QuietVote itself, with the results published and verified by the project's own verifier, as an operational test and a credibility signal. This is not a dependency: until QV passes independent review (QV-11) votes use a conventional public channel.

## 7. Release management

### 7.1 Versioning and axes
Per QV-30 §11: product semver (lockstep), protocol `qv-proto/<n>`, schema, API. This spec adds cadence and support windows.

### 7.2 Channels

| Channel | Content | Cadence | Audience | Signing |
|---|---|---|---|---|
| `nightly` | Build of `main`; unsigned by maintainers (CI provenance only) | Daily | Developers; never for real elections | Sigstore only; banner "not for elections" |
| `rc` (beta) | Release candidates `vX.Y.0-rc.N` | >= 2 weeks before each minor | Testers, operators doing staging | Full pipeline |
| `stable` | Latest supported minor | Minor every **8 weeks** (time-based, skipped if nothing qualified); patches as needed | Operators | Full pipeline: 2-of-N + Sigstore + two-builder rebuild |
| `lts` | Designated minor (first: 1.0), supported 18 months with security and critical fixes only | One per year after 1.0 | Groups holding annual elections | Full pipeline |
| `security` | Out-of-band patch releases | As needed | Everyone | Full pipeline, compressed RC window |

Pre-1.0 phase (current): only `nightly` and `rc`; no `stable`. **No release is labelled production-ready before independent cryptographic review and external audit pass (QV-11)**; releases before that carry the banner "Experimental — not for binding elections" in binary output, UI and docs (ADR-001 honest guarantees).

### 7.3 Release gates (must all pass for rc and stable)
1. All Must requirements of shipped modules have passing verification (traceability, QV-30-REQ-027).
2. Required CI checks green on the release commit; nightly fuzz and bench green for the last 7 days.
3. No open "release-blocker" labelled issues; no unfixed Critical/High advisories affecting the release.
4. Reproducible build confirmed by two builders (QV-19-REQ-023); signing ceremony complete (QV-19 §13).
5. Changelog with: user-facing changes, protocol/schema/API version effects, deprecations, upgrade notes, known issues, verification instructions and hashes.
6. For releases that touch crypto/protocol: independent review note linked (QV-11).
7. Documentation and spec status updated; claims register checked (QV-30-REQ-034).

### 7.4 Support policy
- `stable`: current minor and the previous minor receive fixes for 16 weeks after a new minor ships (two cadences). Security fixes backported to both and to the current `lts`.
- Protocol versions: **verification support is forever** for every protocol version released stable (QV-30 §11.2); creation of elections on a deprecated protocol version ends after the deprecation period.
- Operators are told in release notes whether an in-flight election may upgrade safely; the default rule is *do not upgrade the server mid-election except for security fixes*, and client changes mid-election require a board event (QV-19 §12).

### 7.5 Release roles and timeline (minor)
T-14 d: feature freeze, rc.1 build, reproducibility check. T-14..T-3: fixes only, rc.N. T-3: final review of gate list. T-0: ceremony, publish to GitHub Releases and mirrors, announce hashes via two independent channels. T+7 d: rebuild attestations review; if a mismatch is reported the release is pulled and revoked (QV-19 §13.6).

## 8. Security releases and vulnerability handling

- **Intake:** `SECURITY.md` with private vulnerability reporting (GitHub advisories) and an alternative PGP/age-encrypted email address; no bounty promise until funding allows (§11); public hall of fame (opt-in).
- **Scope:** vulnerabilities in code, protocol, build pipeline, release artifacts, documentation that misstates guarantees, and the project's infrastructure. Cryptographic soundness issues in QV-16 are in scope and treated as Critical when they allow undetected tally manipulation or loss of ballot secrecy.
- **Severity:** CVSS v4.0 base plus election-specific impact tiers: *Critical* (undetectable integrity loss, or secrecy loss without t-1 trustee collusion), *High* (detectable integrity attack with non-trivial impact, key extraction), *Medium*, *Low*.
- **Timelines (calendar days from acknowledged report):** acknowledge <= 3; triage and severity <= 7; Critical/High fix target <= 30 (<= 14 if actively exploited); Medium <= 90; coordinated disclosure deadline **90 days** by default, with earlier disclosure if exploited in the wild, and extension only by agreement with the reporter.
- **Process:** private advisory and temporary private fork; patches reviewed by security reviewers; reproducible build and signing as normal (shortened rc: 24–72 h where safe); pre-notification of known operators on an opt-in `security-announce` list 24–72 h before publication when it reduces harm and the list's confidentiality can be maintained (list membership is not a paid privilege and any operator may join by verifiable request); CVE requested through the GitHub CNA; advisory published with affected versions, fixed versions, workarounds, detection guidance (for example, how to check a past election bundle with the patched verifier), and credits.
- **Election impact:** for any vulnerability that could have affected completed elections, the advisory states how to re-verify exported bundles with a fixed verifier and what cannot be re-established (e.g. secrecy compromise is not retroactively fixable). The project does not hide impact to protect reputation.
- **Revocation:** compromised artifacts/keys are revoked via signed `revocations.json` (QV-19-REQ-037) and release notes.
- **Post-mortem:** public blameless post-mortem for Critical/High within 30 days of the fix.
- **Dependencies:** upstream vulnerabilities in `@noble/*` or Node are tracked via audit tooling; fixes follow the same pipeline; the project coordinates with upstream maintainers.

## 9. Deprecation policy

- Anything user-facing (CLI flags, config keys, HTTP endpoints, export formats, protocol versions for creating elections, supported platforms) is deprecated by: (1) RFC or release-note announcement; (2) runtime warning and `Deprecation`/`Sunset` headers or CLI warning; (3) documented migration path; (4) removal not earlier than **12 months** after announcement and not before the next MAJOR (post-1.0). Pre-1.0: >= 2 minor releases and >= 3 months.
- Security-driven removals (e.g. a broken primitive) may shorten the period, but verification support for old elections is kept in `verifier` regardless (QV-30 §11.2) behind an explicit "legacy, insecure" flag.
- Supported Node versions follow the two current LTS lines; dropping one is announced one minor release ahead.
- Deprecations are listed in `DEPRECATIONS.md`, generated from code annotations.

## 10. Trademark, naming, forks

- **License:** code AGPL-3.0-or-later; docs/specs CC BY-SA 4.0 (ADR-011). No CLA; copyright remains with contributors (DCO).
- **Trademark stance:** the name "QuietVote" and logo are used by the project only to identify authentic releases and project-endorsed channels. The project **does not seek to restrict forks, hosting, or commercial use of the code**. A permissive use policy applies: (1) anyone may accurately say their service "runs QuietVote" or is "based on QuietVote"; (2) unmodified, verifiable builds (hash matches a signed release) may use the name freely; (3) **modified distributions must not use the name or logo in a way that implies they are the official or independently reviewed build**, and must state "modified" and their differences; (4) names that suggest official security assurance (for example "QuietVote Certified") require written permission. The point of the restriction is user protection against counterfeit "secure" builds, not commercial exclusivity. Whether to file for registration, and in which jurisdictions, is an open question; no filing is made until a neutral holder exists (§5.4), and any mark is held by the neutral entity, never an individual maintainer or company, with a public license to the policy above. No claims of "certified" or "approved" status are made for any government or standards body unless true and cited.
- **Forks:** welcome. A fork that changes protocol constants or encodings must use a distinct protocol identifier prefix (not `qv-proto/`) so that elections and verifiers cannot confuse them. The project publishes a "known forks and mirrors" list on request, without endorsement.
- **Mirrors:** project infrastructure (repository, artifacts, release keys' public parts, documentation) is mirrored to at least one non-GitHub location by 1.0.

## 11. Code of conduct approach

- Adopt the **Contributor Covenant** (Contributor Covenant 3.0 was announced 28 July 2025 by the Organization for Ethical Source; the repository's `CODE_OF_CONDUCT.md` states which version is adopted; 2.1 is no longer the latest `[VERIFIED: ethicalsource.dev/blog/contributor-covenant-3, per part-2-standards-crypto.md O15]`) as `CODE_OF_CONDUCT.md`, adapted with a narrow scope: **conduct within project spaces** (repository, issues, PRs, chats, calls, events) and public conduct that directly targets project participants.
- Explicit neutrality clause: contributors' political, religious, economic, or ideological views — including the project's own libertarian/anti-gatekeeping stance and users' diverse uses within the voluntary-organization scope — are not conduct matters. Harassment, threats, doxxing, discrimination in participation, spam and bad-faith disruption are. No political test or identity disclosure is required to contribute.
- Enforcement by a **Conduct Panel** of 3 people (at least one non-maintainer), with recusal for conflicts; graduated responses (private note, warning, temporary restriction, removal); reports confidential and acknowledged within 3 days; decisions summarised publicly without identifying reporters; appeal to the maintainers' body other than the involved parties.
- Moderation transparency: aggregate counts of reports/outcomes published annually.
- Technical disagreement is not a conduct violation; blocking tactics (repeated re-litigation after an ADR) are addressed by the decision-process rules.

## 12. Funding transparency and independence

(Business model: QV-14. This section sets governance constraints.)

1. **Public ledger.** All income and expenses of the project (donations, grants, sponsorships, paid-hosting revenue allocated to the project, contractor payments) are published at least quarterly in a machine-readable file (`FINANCE/ledger.csv`) and summarised annually, held by a fiscal host or neutral entity (open question). Individual small donors may remain anonymous below a threshold (default < USD 500/yr aggregate); sponsors at or above it are listed by name unless legally prohibited.
2. **No token, no chain** (ADR-012): no fundraising tokens, no cryptocurrency-specific promises of return. Donations in cryptocurrency or fiat accepted via addresses/accounts documented in-repo and cross-signed; the project avoids dependence on any single payment processor.
3. **Independence rules.** No sponsor receives roadmap control, private features, advance disclosure of unfixed vulnerabilities (beyond the open `security-announce` list available to all operators), or influence over claims language. Sponsors may be recognised; recognition tiers are public. A single funder providing > 30% of annual income triggers public disclosure and a plan to reduce concentration within 12 months.
4. **Paid maintainers/contractors.** Allowed; their funding source and scope are disclosed; paid status does not alter voting weight; employer conflicts handled per §6.
5. **Grants and audits.** Audit funding (QV-11) must go to the auditor without editorial control by the project over findings; **full audit reports are published** unredacted except for undisclosed vulnerabilities (published after fix).
6. **Hosted offering** (if any, QV-14) is a service run on the same code with the same open release pipeline; its revenue is accounted in the ledger; the project's technical decisions are not conditioned on it.
7. **No data monetisation, ads, or telemetry** funding paths (ADR-009, QV-19-REQ-034).
8. **Financial emergency / wind-down:** if funding ends, the project publishes a final signed release, archives artifacts and keys' public parts in mirrors, and transfers repositories to whoever volunteers under §5.4 conditions.

## 13. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-27-REQ-001 | The repository shall contain `GOVERNANCE.md`, `MAINTAINERS.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, `DEPRECATIONS.md`, and `docs/RELEASE-KEYS.md` consistent with this spec. | Must | Files present; `docs-lint` checks cross-links. | CI, review |
| QV-27-REQ-002 | Before 1.0 the project shall have at least 3 maintainers and at least 2 owners per package in CODEOWNERS; by 12 months after 1.0, at least 5 maintainers. | Must (1.0) | Count check in release checklist. | Release gate |
| QV-27-REQ-003 | No single employer shall hold a majority of maintainer seats or security-reviewer seats. | Should | Annual affiliation audit published. | Review |
| QV-27-REQ-004 | Architectural, dependency, protocol and governance changes shall use the RFC then ADR process with the comment periods and approval thresholds in §6. | Must | Decision-log entry exists with RFC link for each such PR; CI blocks merge of protocol/dependency changes without ADR reference. | CI, review |
| QV-27-REQ-005 | The steward role shall sunset per §5.4 with joint custody of org, domain, registry names, release infrastructure, and a public handover record. | Must | Handover checklist completed and published by the deadline. | Review |
| QV-27-REQ-006 | Releases shall be offered only through the channels in §7.2; pre-review builds shall display "Experimental — not for binding elections". | Must | String present in CLI `--version`, server banner, UI, README until QV-11 external audit gate passes. | E2E |
| QV-27-REQ-007 | No release shall be labelled `stable` before independent cryptographic review and external audit (QV-11) are complete and findings of High/Critical are resolved. | Must | Release workflow refuses `stable` tag without recorded audit gate artifact. | Release gate |
| QV-27-REQ-008 | The minor-release cadence shall be 8 weeks, with rc publication >= 14 days before release, unless a documented exception is approved. | Should | Release calendar published; exceptions logged. | Review |
| QV-27-REQ-009 | Every release shall pass the gate list in §7.3, with evidence attached to the GitHub Release. | Must | Gate checklist artifact present. | Release gate |
| QV-27-REQ-010 | Stable minors shall be supported for 16 weeks after the next minor; LTS for 18 months; the support matrix shall be published in each release note. | Should | Support page lists dates. | Review |
| QV-27-REQ-011 | The verifier shall retain verification support for every protocol version ever released as stable. | Must | See QV-30-REQ-024. | CI |
| QV-27-REQ-012 | The project shall run private vulnerability intake and meet the acknowledgment, triage, fix and disclosure timelines in §8. | Must | Quarterly report of timelines met; exceptions justified. | Review |
| QV-27-REQ-013 | Security advisories shall state affected/fixed versions, workarounds, and election-impact and re-verification guidance; Critical/High incidents shall get a public post-mortem within 30 days. | Must | Advisory template includes mandatory fields; post-mortem links. | Review |
| QV-27-REQ-014 | An opt-in `security-announce` pre-notification list shall be open to any operator under identical terms; no sponsor shall receive earlier or additional disclosure. | Must | List terms published; membership process documented. | Review |
| QV-27-REQ-015 | Deprecations shall follow §9 (announcement, warnings, migration path, >= 12 months post-1.0) and be recorded in `DEPRECATIONS.md`. | Must | Generated file matches code annotations; CI drift check. | CI |
| QV-27-REQ-016 | The project shall publish a trademark and naming policy consistent with §10 and shall not impose restrictions on forking or commercial use of the code beyond name/logo use. | Must | Policy file `TRADEMARK.md` present; legal review recorded. | Review |
| QV-27-REQ-017 | Any mark registration shall be held by a neutral entity, not an individual or a for-profit sponsor. | Should | Ownership record published. | Review |
| QV-27-REQ-018 | Forks changing protocol-relevant constants shall be required by policy to use a distinct protocol identifier; the reference verifier shall reject unknown prefixes with an explicit message. | Should | Verifier test with foreign prefix. | Unit |
| QV-27-REQ-019 | The Code of Conduct shall be adopted with the neutrality clause, a three-person panel, confidential reporting, graduated enforcement, and an annual transparency summary. | Must | Documented; panel roster published. | Review |
| QV-27-REQ-020 | Project finances shall be published quarterly in machine-readable form with sponsor disclosure rules and concentration alert at 30% single-source income. | Must | Ledger file updated within 45 days of quarter end. | Review |
| QV-27-REQ-021 | Sponsors and funders shall have no veto, roadmap control, claims-language control, or non-public vulnerability access. | Must | Sponsorship terms reviewed; contributor survey item yearly. | Review |
| QV-27-REQ-022 | Audit reports shall be published in full (subject to coordinated disclosure delay for unfixed issues). | Must | Reports linked in repository `audits/`. | Review |
| QV-27-REQ-023 | The project shall not include telemetry, advertising, or data-monetisation in any distributed software or project site. | Must | Egress-deny tests (QV-19-REQ-034) and site audit. | CI, review |
| QV-27-REQ-024 | The project shall maintain mirrors of repository and release artifacts in at least one non-primary-host location by 1.0. | Should | Mirror sync job; verification of mirror hashes. | CI |
| QV-27-REQ-025 | Emergency actions (revocation, key rotation) shall be reported publicly within 7 days. | Must | Incident log entries. | Review |
| QV-27-REQ-026 | Maintainer onboarding and removal shall follow §5.1/§5.5 with public summaries; maintainers shall hold hardware-backed 2FA and registered release keys. | Must | Annual audit of maintainer security posture. | Review |
| QV-27-REQ-027 | Changes to any stated user protection (export, exit, no-KYC, no-token, no-telemetry) shall occur only through ADR supersession via RFC and at a major-version boundary. | Must | Decision log and changelog show the sequence. | Review |

## 14. Security and abuse cases (governance threats)

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Maintainer capture by one company | Sponsor/employer | Roadmap or claims bias | Seat caps, disclosure, recusal | Informal influence |
| Hostile takeover of org/registry | Social engineering of one admin | Malicious release | >= 3 org owners, 2-of-N release keys, independent rebuilders, key continuity in manifests | Collusion |
| Sponsor demands silence on a vuln | Funder | Harm to users | Funding terms forbid; open disclosure timelines | Pressure on small project |
| Counterfeit "QuietVote" builds | Fraudster | Users deceived | Trademark policy, signed hashes, verify-release tool | Users not verifying |
| Malicious contributor (long con) | Attacker | Backdoor | Two-person review on critical paths, vectors, reproducible builds | Sophisticated insider |
| Governance deadlock | Bootstrap | Stalls | Steward tiebreak (sunset), 2/3 rule, emergency path | Delay |
| Legal pressure on maintainers | State/litigant | Takedown | Mirrors, neutral entity, no-secret-keys-on-server design reduces compelled-disclosure value | Individual exposure |
| Harassment campaign | Outsiders | Burnout | CoC panel, moderation tools | Ongoing risk |

## 15. Open questions

| Question | Owner | Target review | Proposed default |
|---|---|---|---|
| Legal home: fiscal host (e.g. Open Collective Foundation successor, Software Freedom Conservancy, NLnet-style grant intermediary) vs. own non-profit | Steward | Before first funding | Use an existing fiscal host; no own entity until needed `[UNVERIFIED host availability]` |
| Bug bounty | Maintainers | After funding | Start with hall of fame; add bounties when funded |
| Release cadence vs. team size | Maintainers | 6 months after first rc | Keep 8 weeks; relax to 12 if team < 5 |
| Registration of trademark and jurisdiction | Neutral entity | After §5.4 | Defer |
| Contributor Covenant version / modifications | Conduct Panel | M1 | Current 2.1 with neutrality clause |
| LTS length (18 months) vs. group election cycles (annual) | Maintainers | At 1.0 | 18 months |
| Threshold for anonymous donors | Treasurer role | M1 | USD 500/yr |
| Dogfooded governance votes: when | Maintainers | After QV-11 audit | Optional after audit |

## 16. Proposed ADRs

- **QV-ADR-P27-1** Maintainer-seat and security-reviewer-seat employer cap; 2/3 decision rule; steward sunset.
- **QV-ADR-P27-2** Release channels: nightly / rc / stable / lts / security; no `stable` before external audit.
- **QV-ADR-P27-3** Coordinated disclosure with 90-day default, open `security-announce` list with no paid tier.
- **QV-ADR-P27-4** Permissive-code, protective-name trademark policy; neutral holder.
- **QV-ADR-P27-5** Funding independence rules and public ledger.
- **QV-ADR-P27-6** Verification support for released protocol versions is perpetual.

## 17. References (accessed 2026-10-21; external fetches were blocked in the authoring sandbox, so these are cited from general knowledge and flagged)

- Contributor Covenant — https://www.contributor-covenant.org (3.0 announced 28 July 2025: https://ethicalsource.dev/blog/contributor-covenant-3) `[VERIFIED: announcement; per part-2-standards-crypto.md O17]`.
- Developer Certificate of Origin — https://developercertificate.org `[UNVERIFIED access]`.
- Semantic Versioning 2.0.0 — https://semver.org; Conventional Commits — https://www.conventionalcommits.org.
- Google Project Zero disclosure policy (90-day norm) — https://googleprojectzero.blogspot.com/p/vulnerability-disclosure-policy.html `[UNVERIFIED access]`.
- FIRST CVSS v4.0 — https://www.first.org/cvss/v4-0/ `[UNVERIFIED access]`.
- GitHub Security Advisories / CNA — https://docs.github.com/en/code-security/security-advisories `[UNVERIFIED access]`.
- OpenSSF Best Practices Badge criteria — https://www.bestpractices.dev `[UNVERIFIED access]`.
- Node.js release schedule (LTS lines) — https://nodejs.org/en/about/previous-releases; index data checked 2026-10-21 via https://nodejs.org/dist/index.json.

## 18. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Draft authored 2026-10-21 |
