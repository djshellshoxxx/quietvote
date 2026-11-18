# QV-14 — Business and Sustainability

**Module ID:** `sustainability`
**Status:** Draft
**Owner:** Project steward
**Last reviewed:** 2026-10-21
**Related specs:** QV-00, QV-08, QV-12 (ops costs), QV-25 (legal/licensing), QV-11 (audit costs), QV-26, QV-31; ADR-001, ADR-002, ADR-011, ADR-012.

## 1. Objective
Identify how QuietVote can remain maintained and open to independent audit without compromising its stance: no operator in the trust base, no mandatory identity, full export, no token/chain (ADR-012), AGPL code (ADR-011). Revenue models are evaluated against one test: **can the revenue stream be turned against the user?** (e.g., by data monetisation, lock-in, or a single funder gaining control). All numbers are *hypotheses to validate*, not forecasts.

## 2. Scope
### In scope
Funding options; pricing hypotheses; cost model; risk register; governance-of-money rules; a "build first, then monetise" roadmap.
### Out of scope
Legal entity formation and tax advice (QV-25 covers counsel checklist); investor fundraising; any token sale (excluded by ADR-012).

## 3. Principles (binding on any model)
1. **Funding never buys access to secrecy or integrity.** No funder, customer or maintainer gets backdoors, escrow keys, or special log access. (ADR-001/008)
2. **No data monetisation.** No ads, analytics resale, member-list sales, or telemetry beyond QV-31.
3. **Exit is free.** Export and migration remain free for every customer at all times (QV-12 REQ-002).
4. **Open core is rejected:** all security- and verification-relevant functionality is AGPL (ADR-011); paid offerings are services, not withheld features. Trademark ("QuietVote" name/logo) policy distinguishes official vs fork builds (QV-25).
5. **Transparent finances:** annual public ledger of income/expenses; sources above a threshold disclosed (default 10 % of income or €5,000).
6. **Single-funder cap:** no source > 40 % of annual budget after year 2 (target).
7. **Security audits are funded before claims are made** (ADR-008, QV-11): money is ring-fenced for independent review.

## 4. Options evaluated

| # | Model | Revenue mechanism | Fit with ADRs | Main risks | Verdict |
|---|---|---|---|---|---|
| A | Grants (public-interest tech, digital rights, democracy, open-source funds) | Project grants for audits, development, accessibility | Excellent: no customer leverage | Lumpy, application overhead, funder priorities | **Primary early funding** |
| B | Individual/org donations, sponsorship (GitHub Sponsors, Open Collective-style fiscal host) | Recurring small donations | Good if no preferential treatment | Small, volatile; sponsor influence | **Baseline floor** |
| C | Free self-host + paid support contracts | Annual support/onboarding for orgs | Good; supports self-hosters, no data held | Support burden; incentives to keep software hard to run | **Core sustainable service** |
| D | Maintainer-hosted convenience instance (subscription per election or per org-year) | Subscription | Acceptable under ADR-002 if operator remains untrusted for secrecy/integrity; concentrates availability and legal exposure | Operator becomes a target; subpoenas; moral hazard of collecting more data; SLA pressures | **Later, small, capped** |
| E | Bounties and paid contributor tasks | Fund specific issues (audit findings, a11y, translations) | Excellent, aligned with open dev | Quality control, tax/legal for bounty payouts | **Supplement** |
| F | Paid audits/integrations/managed deployment (consulting) | Fees from third parties running QuietVote | Good, but conflict of interest if the project's own consulting audits its own code → audits must be independent | Revenue distraction | **Limited** |
| G | Cooperative/member ownership of the steward entity | Membership dues; governance of roadmap | Strong values fit (users are cooperatives) | Slow decisions, governance overhead | **Evaluate at Year 2–3** |
| H | Token / chain-based funding | — | Rejected by ADR-012 | — | **Rejected** |
| I | Data/analytics monetisation, ads | — | Rejected by principle 2 | — | **Rejected** |
| J | Open core / paid features | — | Rejected by principle 4 | — | **Rejected** |

## 5. Pricing hypotheses (for later validation; no hosted service exists)
Anchoring: organization sizes from 20–5,000 members; typical election counts 2–12 per year per org.
| Offering | Hypothesis | Rationale / comparators [UNVERIFIED: competitor prices not collected] |
|---|---|---|
| Self-host | Free (AGPL) | ADR-011 |
| Community hosted tier | Free for ≤ 50 voters per election and ≤ 3 elections/yr, funded by B/A | Supports small collectives; strict abuse limits |
| Hosted per-election | €15–€40 per election ≤ 500 voters; €0.03–0.05 per voter above | Covers ~3–5× marginal infra |
| Hosted org-year | €240–€900/yr by tier (≤ 250, ≤ 1,000, ≤ 5,000 voters) | Predictable for cooperatives |
| Support contract (self-host) | €1,500–€6,000/yr: onboarding, ceremony facilitation, 2-business-day SLA | Includes DKG ceremony support |
| Audit-ready package | €3,000–€10,000 one-off: dry-run, trustee training, independent-verifier run | Services only |
| Sliding scale | Unions/co-ops/mutual-aid discount ≥ 50 %; no questions asked for sub-€1,000 budgets | Mission fit |
Pricing is by **election/voter count, never by data** and is published in a stable price list; price changes require 90 days' notice and cannot affect exporting.

## 6. Cost model (annual, Year 1–2, steward + 1 hosted instance)
| Item | Low (volunteer) | Mid | Notes |
|---|---|---|---|
| Infrastructure (VPS ×2, backups, domains, monitoring) | €600 | €2,400 | QV-12: single-node |
| Independent cryptographic/protocol review (QV-11) | €25,000 | €60,000 | One-time before any non-experimental claim; re-audits on protocol changes |
| Penetration test / code audit (web + server) | €10,000 | €25,000 | Annual after first |
| Reproducible build / release infrastructure | €0 | €1,000 | CI minutes |
| Maintainer time (0.5–1.5 FTE) | €0 (volunteer) | €60,000–€150,000 | Dominant cost; underfunding is the key sustainability risk |
| Legal counsel (entity, privacy policy, DPA, export check) | €3,000 | €12,000 | QV-25 checklist |
| Accessibility testing/translation | €2,000 | €10,000 | QV-13 |
| Insurance (D&O / cyber) | €0 | €3,000 | When hosted |
| Bounties | €2,000 | €10,000 | |
| **Total** | **≈ €43k** | **≈ €180k–€275k** | [estimates]|
**Break-even sketches (illustrative):** to fund mid-case at €210k from services only: ~35 support contracts at €4k + 50 hosted org-years at €600 + €40k grants. The project should therefore remain **grant- and donation-funded through the audit gate**; services contribute after.

## 7. "Build first, then monetise" roadmap
| Stage | Time (indicative) | Goal | Funding | Gate |
|---|---|---|---|---|
| 0 Spec & prototype | Now – M6 | Specs, reference verifier, Phase 1 MVP self-host | Volunteer + seed grant/donations | Public specs; dry-run with a friendly group |
| 1 Pilot | M6 – M12 | 3–5 pilot groups self-host; Phase 1 elections; collect UX feedback | Grants (A), donations (B), small bounties (E) | No security claims; clearly "experimental" |
| 2 Audit | M12 – M18 | Independent crypto + app audit; fix; publish report | Grant earmarked for audit (A), sponsorships | Audit published; findings fixed |
| 3 Supported release | M18 – M24 | 1.0 with support contracts; hosted convenience beta (capped to N orgs) | C, then D | SLA only on paid contracts; transparency report |
| 4 Phase 2 features | M24+ | Unlinkable tokens, ranked ballots after review | Grants + C/D revenue | Review sign-off for each feature (QV-20 REQ-040) |
| 5 Governance maturity | M30+ | Move steward to foundation or cooperative; escrow release keys with multi-party control | Mixed; cap single funder 40 % | Succession plan live |
Rule: do not start hosting (D) until (a) audit published, (b) export/exit tested by an external group, (c) legal review of operator exposure complete (QV-25), (d) on-call capacity exists (QV-12 §11).

## 8. Governance of money and roadmap (closes open questions)
- **Roadmap control:** decided in public via RFC-style issues; maintainers decide; paying customers have a voice (advisory board) but no veto; funders may restrict funds to a work item but not dictate security decisions.
- **Release keys:** multi-signature (≥ 2-of-3 maintainers from ≥ 2 organisations once available), held on hardware tokens; no single-person control after Stage 3.
- **Pricing/terms/privacy changes:** require public RFC and 90 days' notice; privacy-policy changes that expand data collection are prohibited without an ADR and community vote [policy statement].
- **Hosted customers can export and move providers:** binding commitment (REQ-001).
- **Free/community groups:** community tier + sliding scale; donors may sponsor groups ("sponsor a vote").
- **Continuity/succession:** project assets (repo, domain, trademark, release keys) held by a legal steward; a documented bus-factor plan; if the steward dissolves, assets pass to a named successor (e.g., a digital-rights nonprofit or cooperative) under AGPL; hosted instances give 12 months' notice and fully exportable data.
- **Commercial incentives toward data collection:** prevented structurally — operator holds no useful data (ciphertexts, pseudonymous keys), and the policy forbids collecting more. Telemetry restricted by QV-31. Any new field needs privacy review.
- **Is hosting revenue acceptable?** Yes under principles 1–4 because the hosted operator is untrusted for secrecy/integrity (ADR-002), and the code is open so competitors/self-hosters can replace it; hosting is a convenience business, not a data business.
- **Should software governance be member-owned?** Preferred long-term (G), not required for MVP.

## 9. Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Underfunded audit → unaudited high-stakes use | High | Severe | Hold public "experimental" status; ring-fence audit grant; refuse security claims |
| Maintainer burnout (bus factor 1) | High | Severe | Co-maintainers, docs, bounties, fiscal host |
| Funder capture | Medium | High | 40 % cap; no-strings policy for security |
| Hosted operator subpoena/targeting | Medium | High | Untrusted-operator design; minimal data; jurisdiction choice; transparency report; warrant-canary legal check [UNVERIFIED] |
| Fork by a hostile hosted competitor | Medium | Medium | AGPL §13 source obligations (ADR-011); trademark |
| Support load exceeds capacity | Medium | Medium | Cap contracts; paid-first SLAs |
| Pricing exclusion of poor groups | Medium | Medium | Sliding scale, sponsor-a-vote |
| Legal exposure for misuse (e.g., sham elections) | Low–Med | Medium | Terms of use, disclaimers, not-for-governmental-elections scoping (QV-25) |
| Payment processor deplatforming | Medium | Medium | Multiple processors; crypto-payment acceptance as payment *method* only (not a token/dependency; ADR-012 unaffected) |
| Revenue concentration in hosted → centralisation | Medium | Medium | Cap hosted capacity; promote self-host and community operators (QV-32) |

## 10. Requirements
| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-14-REQ-001 | Any paid or hosted offering shall allow full export and shall never charge for export | Must | Terms of use contain commitment; export test on hosted instance | Review, E2E |
| QV-14-REQ-002 | No offering shall include features that reduce secrecy/integrity or give any party special decrypt/log access | Must | Architecture review checklist signed per release | Review |
| QV-14-REQ-003 | The project shall publish annual finances and funder disclosures above threshold | Should | Ledger published | Review |
| QV-14-REQ-004 | Hosting shall not launch before audit publication and legal review gates in §7 | Must | Gate checklist recorded in decision log | Review |
| QV-14-REQ-005 | A funding source shall not exceed 40 % of annual income after year 2 | Should | Ledger check | Review |
| QV-14-REQ-006 | Pricing changes shall be announced ≥ 90 days ahead | Should | Policy text | Review |
| QV-14-REQ-007 | Telemetry/data-collection changes require ADR + privacy review | Must | PR template check | Review |
| QV-14-REQ-008 | Release signing keys shall require ≥ 2-of-3 signatures from Stage 3 | Should | Release process test | Review |
| QV-14-REQ-009 | No token, equity-like voting rights sale, or chain dependency in funding | Must | ADR-012 review | Review |

## 11. Data and privacy
Billing data (orgs): minimal, held by payment processor; no voter data in billing systems; no link between invoices and election content. Hosted operator holds no plaintext choices (ADR-001). Retention per QV-25 templates.

## 12. Security and abuse cases
| Case | Cause | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Customer coerces vendor to add backdoor | Contract/legal | Loss of trust | Policy + open source + reproducible builds + warrant policy | Residual in a hosted client delivery path (ADR-010) |
| Donor-driven feature creep | Funder | Roadmap capture | Governance rules | Low |
| Fraudulent chargebacks/fake orgs | Abuse | Cost | Prepay, limits | Low |

## 13. Interfaces and dependencies
Depends on QV-12 (costs, support), QV-25 (entity, terms), QV-11 (audit budget), QV-08 (hosted tenancy). Feeds QV-00 success measures.

## 14. UX, accessibility, localization
Pricing and terms are plain-language, available in the main supported languages, accessible; no dark patterns; donation prompts never appear in voting flows.

## 15. Operations
Finance ops: ledger, invoicing via fiscal host, audit fund tracking. Monitoring: cost per election and per voter (aggregate), support hours.

## 16. Testing and verification
Quarterly review of principles compliance; pre-launch hosted checklist; mock exit drill with an external group (export → self-host).

## 17. Constraints and assumptions
Estimates are unvalidated; costs for EU/US labour differ; competitor prices not researched [UNVERIFIED]; audit prices vary widely.

## 18. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-14-1 Choose fiscal host/legal entity (nonprofit, association, cooperative) | Steward + counsel | Stage 1 | Fiscal host first |
| QV-OQ-14-2 Jurisdiction for hosted operation | Counsel | Pre-Stage 3 | Privacy-protective jurisdiction with no mandatory data retention |
| QV-OQ-14-3 Validate willingness to pay with 10 pilot orgs | Steward | Stage 1 | Interview + LOIs |
| QV-OQ-14-4 Accept crypto payments? | Steward | Stage 3 | Yes as payment method, via processor; no token |
| QV-OQ-14-5 Trademark policy | Counsel | Stage 1 | Permit fork use with different name |

## 19. Proposed ADRs
- **QV-ADR-P14-1 — Rejected: open core, data monetisation, token funding.**
- **QV-ADR-P14-2 — Hosting gate: audit published + exit tested + legal review + on-call.**
- **QV-ADR-P14-3 — Governance of funds: 40 % cap, annual ledger, ring-fenced audit fund.**

## 20. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## References
No external sources were retrieved for pricing or cost; figures are internal hypotheses marked as such. Competitor pricing, grant programs and audit price ranges must be researched before Stage 1 [UNVERIFIED].
