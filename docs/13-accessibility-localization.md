# QV-13 — Accessibility and Localization

**Module ID:** `experience-accessibility`  
**Status:** Framework  
**Objective:** Set measurable accessibility, language, and device-support requirements for members and administrators.  
**Owner:** Project owner (to be recorded in the decision log)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-02, QV-03, QV-04, QV-06, QV-08, QV-09, QV-10, QV-11, QV-16

## 1. Objective

Set measurable accessibility, language, and device-support requirements for members and administrators, so every flow in QV-10 can be used with assistive technology, in the member's language, on the devices and connections the project supports.

Accessibility is a requirement on the product, not a finishing task. No accessibility claim may be published without a verification record (QV-11).

## 2. Scope

### In scope
- Accessibility of every QV-10 flow (member, organizer, observer, recovery) and the results and audit views.
- Keyboard, screen-reader, contrast, zoom, text size, and motion behavior.
- Plain-language member text and glossary terms.
- Language selection, translation, and translation review for member-facing text.
- Date, time, number, and time-zone display.
- Supported devices, browsers, and network conditions.
- Accessible sign-in and recovery methods.

### Out of scope
- Cryptographic choices in QV-16, except where they change what the interface must show.
- Governance rule content (QV-03) and the authority of its text, which is decided in OD-13-07.
- Visual branding (QV-10 §2).

### Explicit non-goals
- Claiming conformance to any standard before verification. No standard is cited in this repository yet; see OD-13-01.
- Collecting disability or accessibility-need data about members.
- Accepting a weaker sign-in or recovery method because it is more accessible (see QV-13-REQ-016).

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Member using a screen reader | Complete a ballot | Eligible; assistive technology on own device | Ballot submitted and status understood |
| Member using keyboard only | Complete any QV-10 flow | Eligible | Same outcome as any other member |
| Member with a non-default language | Read rules and vote in own language | Language shipped (OD-13-02) | Rules understood; accepted rules version identified |
| Member on a low-bandwidth or older device | Join and vote | Device in support matrix (OD-13-04) | Core flow completes or fails clearly |
| Member recovering access with assistive technology | Regain access | Recovery path (QV-04) | Access restored by an equally strong method |
| Organizer or observer | Configure or check results with assistive technology | Role granted (QV-03) | Preview and results usable without vision |
| Translator or reviewer | Translate and check terms | Access to glossary and strings | Complete, consistent translation |

### Accessibility journeys and failure behavior

- **K1 Keyboard-only ballot.** Member moves through rules, ballot, review, and submit by keyboard. Failure: focus lost or trapped; the flow fails the test and is blocked from release.
- **K2 Screen-reader ballot.** Member hears each option's name and selected state, then the submission state. Failure: state announced incorrectly; treated as a Must failure (QV-13-REQ-005).
- **K3 Change language mid-flow.** Member switches language during the ballot. Failure: selections are lost. Required behavior: selections are kept, and the rules version shown stays the one the member is reviewing.
- **K4 Low-bandwidth join.** Member joins on a slow connection. Failure: notice fails to load. Required behavior: a text-only mode still shows the full rules and privacy notice.
- **K5 Recovery with assistive technology.** Member recovers access by keyboard and screen reader. Failure: only a memory or puzzle step is offered. Required behavior: an accessible alternative of equal assurance is available (REQ-016).

## 4. Requirements

Priorities use Must, Should, Could. Accessibility criteria refer to the adopted standard (OD-13-01), not a named standard, until that decision closes.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-13-REQ-001 | The project shall adopt one published accessibility standard, version, and conformance level, recorded in this spec. | Must | This spec names all three. No accessibility claim is published without a verification record. | Review; decision log entry |
| QV-13-REQ-002 | Every function in the QV-10 flows shall be operable by keyboard alone, with no keyboard trap. | Must | K1 passes in full. Focus order follows reading order. | Manual test; automated focus check where available |
| QV-13-REQ-003 | Every focusable element shall show a visible focus indicator in every state. | Must | Focus indicator visible in each state of each control in each supported theme. | Manual visual test; automated check |
| QV-13-REQ-004 | Every control shall expose an accessible name, role, and state (selected, disabled, invalid, expanded). | Must | Automated check reports no unnamed control. Screen-reader test confirms each ballot option announces name and selected state. | Automated check; manual assistive-technology test |
| QV-13-REQ-005 | Submission and decision state changes shall be announced once, in text, without the selected choice. | Must | Each state in QV-10 section 3 is announced with its text. The "Accepted" announcement contains no choice. | Manual assistive-technology test; privacy test |
| QV-13-REQ-006 | Text and essential graphics shall meet the contrast minimum of the adopted standard [UNVERIFIED numeric value; set when OD-13-01 closes]. Color alone shall not convey status. | Must | Automated contrast check passes in every state. Each status has text or an icon in addition to color. | Automated check; design review |
| QV-13-REQ-007 | Content and function shall remain complete at the zoom and text sizes required by the adopted standard [UNVERIFIED values]. | Must | No content or function is lost or clipped at those sizes in the ballot form, notices, or results. | Manual test |
| QV-13-REQ-008 | Non-essential motion shall stop when the device's reduced-motion setting is on. No information shall be conveyed by motion alone. | Must | With the setting on, no non-essential animation runs. Each state has text. | Manual test; code review |
| QV-13-REQ-009 | Rules, privacy limits, and error text shall be plain language and use the glossary (QV-10-REQ-018). | Must | Comprehension test (OD-10-08) passes in each shipped language. | Comprehension test |
| QV-13-REQ-010 | Members shall choose the interface language from the shipped languages, and change it at any time. | Must | Change applies to all on-screen text at once. Selections are kept (K3). Preference is stored in browser only. | E2E test |
| QV-13-REQ-011 | For each shipped language, no member-facing string shall be missing. Any fallback to another language shall display a visible notice. | Must | Automated missing-string check reports none. Fallback shows the notice. | Automated check; reviewer sign-off |
| QV-13-REQ-012 | Translated rule text shall show its source version identifier and be marked as a translation. The source version governs (OD-13-07). | Must | Each translation displays the source version. A mismatched version shows a warning. | Integration test; review |
| QV-13-REQ-013 | Dates, times, and numbers shall use the member's locale. Every deadline shall show the time zone name and the absolute time. | Must | Each shipped locale renders expected formats in fixtures. Every deadline shows a zone name. | Automated locale tests |
| QV-13-REQ-014 | The core ballot flow shall work on small touch screens and older browsers within the support matrix (OD-13-04). Content shall not depend on hover. | Must | Scripted journeys pass on each device class in the matrix. | Device test |
| QV-13-REQ-015 | The core flow shall submit without large assets. A text-only mode shall show the full rules and privacy notice (QV-10-REQ-001, -002). | Must | Core pages stay within the size budget set by OD-13-08 [UNVERIFIED budget]. Text-only mode shows all required notice text. | Throttled-network test |
| QV-13-REQ-016 | Sign-in and recovery shall not require only a memory or puzzle step. Any alternative method shall meet the assurance level of QV-04. | Must | Each method in QV-04 passes keyboard and screen-reader tests. No accessible alternative has lower assurance. | Security review; assistive-technology test |
| QV-13-REQ-017 | Results, charts, and audit evidence shall have a text or table equivalent with the same values. | Must | Each chart has a table with identical values. The screen reader reads the table. | Manual assistive-technology test |
| QV-13-REQ-018 | Errors shall name the field or step and the fix, in text, and keep entered data on the page. | Must | Each error state in QV-10 has such a message. No entered data is lost on error. | E2E test |

## 5. Data and privacy

- **Data inputs:** interface language; reduced-motion and text-size settings (read from device or browser); time-zone preference; assistive-technology type is not collected.
- **Data outputs:** none beyond QV-10 outputs. Accessibility settings are not sent with a ballot.
- **Data controller/operator:** Not set; depends on QV-08 and hosted or self-hosted operation.
- **Retention and deletion:** Preferences stored in browser only, cleared by the member. No disability or accessibility-need records are kept by the service.
- **Linkability risks:** Language, time zone, and device-class fields can narrow identity in a small group. Telemetry on device class is proposed as aggregate only (QV-12).
- **Visibility by member, organizer, operator, and observer:** Settings are visible only to the member's own browser. Operators see aggregate device-class counts if at all (QV-12). Observers see no member settings.
- **Privacy properties claimed:** Accessibility settings are not sent to the service with ballots, and the service does not collect disability status.
- **Privacy properties explicitly not claimed:** Accessibility features do not make a ballot private from people nearby. Spoken output can be heard in a shared room (see §6).

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Choice spoken aloud in shared space | Screen reader in a shared room | Disclosure of choice | Choice is read only on the member's own device. Audio output is described as a risk in the notice. Confirmation never speaks the choice unless the member opens that view. | Member's device speaks in a shared space |
| Weaker accessible sign-in | Attacker targeting an accessibility fallback | Account takeover or impersonation | Any alternative must meet QV-04 assurance (REQ-016) | Alternatives may be less convenient |
| Accessibility settings used for profiling | Operator or analytics | Discloses need for accommodation | Settings stay in browser; no settings in ballot or logs | Device-class telemetry (QV-12) |
| Mistranslated rules | Translation error or machine translation | Members accept rules they did not understand | Source version governs; translations marked (REQ-012); reviewer sign-off (REQ-011) | Reviewers miss errors |
| Low-bandwidth mode hides rules | Lite mode design error | Members vote without the rules | Full rules and privacy notice in text-only mode (REQ-015) | Members may skip reading |
| Excluding assistive-technology users with rate limits or challenges | Anti-abuse controls | Members cannot vote | Anti-abuse controls tested with assistive technology; limits defined in QV-07 | Trade-off between abuse and access |

## 7. Interfaces and dependencies

- **Upstream dependencies:** QV-10 (screens, states, glossary); QV-04 (sign-in and recovery methods); QV-03 (rule text authority, language policy); QV-08 (client type, device and browser support); QV-09 (localized error keys).
- **Downstream consumers:** QV-11 (accessibility and localization test layers); QV-12 (translation updates and support).
- **API/event/schema contracts:** Member text is keyed by codes from QV-09, not by English strings. Rule text carries a version identifier and hash.
- **Versioning and compatibility:** Translation files are versioned with the source text. A change to source text marks translations as stale until reviewed.
- **Failure and retry behavior:** If a translation is missing, the source language shows with a notice (REQ-011). If assistive-technology support fails for a control, the flow is not released until fixed; no alternate path is added silently.

## 8. UX, accessibility, and localization

- **Key screens or interactions:** all QV-10 screens (see QV-10 §8), plus language selector and accessibility settings.
- **Plain-language explanations:** Owned by QV-10 (glossary and REQ-018). Translators provide the same terms in each language (OD-13-06).
- **Keyboard/screen-reader requirements:** QV-13-REQ-002 to -005. Ballot options announce name and selected state.
- **Low-bandwidth and device constraints:** Design for small touch screens first; text-only mode available (REQ-014, -015). Device and network profile set by OD-13-04 and OD-13-08.
- **Localization requirements:** REQ-009 to -013. Locale formats per OD-13-05.

## 9. Operations

- **Configuration:** Languages, translation files, and the support matrix are versioned configuration.
- **Monitoring and audit:** Missing-string reports per release; assistive-technology defect counts per release. No per-member data.
- **Backup, recovery, and deletion:** Translation files are versioned in the repository with the source. Member preferences are browser-only and not backed up.
- **Incident response:** A mistranslated rule or accessibility defect that blocks voting is handled as a QV-12 incident, with a notice to members.
- **Support and escalation:** Each screen links to an accessibility feedback path. Self-hosted groups provide their own contact (QV-08).

## 10. Testing and verification

| Check | Scope | When | Release-blocking? |
|---|---|---|---|
| Automated accessibility scan | All QV-10 screens in each supported browser | Every change | New violations block |
| Keyboard-only run (K1) | All flows | Every release | Yes |
| Screen-reader run with supported assistive technology | All flows, incl. K2 and K5 | Every release | Yes |
| Zoom, text size, reduced-motion check | All screens | Every release | Yes |
| Missing-string and locale check | All shipped languages | Every change to strings | Yes |
| Throttled-network and device run | Core flow and text-only mode | Every release | Yes, for the support matrix |
| User testing with disabled participants | Core flow, K1 to K5 | Before first release; recruitment and consent process [UNVERIFIED] | Yes, for first release |
| Comprehension test | Rules and privacy notice in each language | Before first release and after material changes | Yes |

- **Supported browsers and devices:** per OD-13-04. Tests must cover each supported combination.
- **Independent review:** Accessibility audit by a reviewer outside the build team [UNVERIFIED role and frequency].
- **Release-blocking criteria:** Any Must requirement failing; any missing string in a shipped language; any accessibility claim without a verification record; any choice spoken or announced by default.

## 11. Constraints and assumptions

- **Constraint:** No accessibility standard is cited in this repository. Criteria stay generic until OD-13-01 closes.
- **Constraint:** Client platform is open (QV-08, QV-16 §9). Assistive-technology support depends on it.
- **Constraint:** Shipped languages and first target community are open (QV-00, OD-13-02).
- **Assumption to validate:** Members may need assistive technology, a non-default language, or a low-bandwidth connection (README principle 6). Not yet validated with research.
- **Assumption to validate:** Members use their own device for voting (basis for REQ-005 and §6).

## 12. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 13. Open decisions

Each decision lists the original question, options, a recommendation, and an owner.

### OD-13-01 — Accessibility standard and conformance target
- **Question:** What accessibility standard and conformance target will be adopted?
- **Options:** (a) Adopt a published, named web accessibility standard at a stated conformance level. Candidates are not verified here [UNVERIFIED]. (b) Project-written checklist only.
- **Recommendation:** Proposed: (a), with name, version, and level fixed before this spec is Approved. Alternative: (b) only with independent review.
- **Owner:** Project owner

### OD-13-02 — Required languages for the first target community
- **Question:** Which languages are required for the first target community?
- **Options:** (a) One language at first release; (b) the group's working languages; (c) several languages at launch.
- **Recommendation:** Proposed: (a), the language of the first target group (QV-00). Structure all strings for later additions. Alternatives: (b) or (c) with translation review capacity confirmed.
- **Owner:** Project owner, after QV-00 target group is chosen

### OD-13-03 — Non-visual equivalents for ballot visualizations
- **Question:** Which ballot visualizations need a non-visual equivalent?
- **Options:** (a) Every visual result and audit chart has a table equivalent; (b) only specific charts.
- **Recommendation:** Proposed: (a). Ballot options are text-first.
- **Owner:** Project owner, with accessibility reviewer

### OD-13-04 — Supported assistive technology, browsers, and devices
- **Question:** What assistive technology, browsers, and devices are supported?
- **Options:** (a) Fix a matrix before build; (b) defer to the QV-08 client decision and fix the matrix then.
- **Recommendation:** Proposed: (b) with at least one screen reader and one keyboard-only test per release as a minimum. Alternative: (a) if QV-08 is delayed.
- **Owner:** Project owner, with QV-08 owner

### OD-13-05 — Date, time, and time-zone display
- **Question:** How are date and time boundaries displayed across time zones (QV-08 open question)?
- **Options:** (a) Member's local time with zone name and absolute time; (b) organizer's time zone; (c) UTC only.
- **Recommendation:** Proposed: (a). Alternative: (b) for organizer views only.
- **Owner:** Project owner, with QV-12 owner

### OD-13-06 — Translation of cryptographic and governance terms
- **Question:** How are cryptographic and governance terms translated?
- **Options:** (a) Translated term with English source term in glossary; (b) English term only; (c) translated term only.
- **Recommendation:** Proposed: (a), so members can match terms to documentation.
- **Owner:** Project owner, with translators

### OD-13-07 — Authority of translated rule text
- **Question:** Which text governs when translations differ?
- **Options:** (a) Source-language rule text governs; translations carry the source version and are marked; (b) each translation is accepted separately.
- **Recommendation:** Proposed: (a), so there is one rules version per decision. Alternative: (b) if QV-03 requires per-language acceptance.
- **Owner:** Project owner, with QV-03 owner

### OD-13-08 — Low-bandwidth and older-device profile
- **Question:** What page-size and device profile is required (QV-08 hardware targets are open)?
- **Options:** (a) Set profile from research and QV-08 targets; (b) set a fixed size budget now.
- **Recommendation:** Proposed: (a). No numeric budget until QV-08 minimum hardware and OS are known.
- **Owner:** Project owner, with QV-08 owner

### OD-13-09 — Accessible sign-in and recovery method
- **Question:** Which sign-in and recovery methods are used (QV-04 open)?
- **Options:** (a) Passkey or equivalent device-bound method with accessible fallback; (b) email or SMS code; (c) member-chosen method set by group.
- **Recommendation:** Proposed: a method chosen in QV-04 that passes REQ-016. Alternative choices are acceptable only if they meet QV-04 assurance.
- **Owner:** Project owner, with QV-04 and QV-16 reviewers
