# UI and security UX research for QuietVote (voters, trustees, organizers)

**Status:** Research draft. Not reviewed. English only.
**Date of research:** 2026-10-21 (all source access dates are 2026-10-21).
**Scope:** Safest UI patterns for ballot codes, cast-vs-audit, passphrase/key handling, phishing resistance, coercion, errors, accessibility, mobile and shared devices; concrete recommendations mapped to the current web client; gaps against `docs/10-user-experience.md` (QV-10), `docs/16-crypto-protocol.md` §5.13 (Benaloh cast-or-spoil) and the English catalog.
**Constraints honoured:** no git operations, no edits under `packages/**`, only this file and `docs/research/tooltips-en.md` were written.

---

## 0. Method and verification status

- Repo read: `docs/10-user-experience.md` (full), `docs/16-crypto-protocol.md` §5.13 (lines 603-642) and §5.14.4 context, `packages/web/src/ui/app.ts` (full, 660 lines), `packages/web/src/i18n/en.ts` (full), `packages/web/src/flow/ballot-controller.ts` (lines 140-170), `packages/web/src/flow/election.ts` (lines 53-142), `packages/web/src/api/errors.ts` (full). Line numbers below refer to these files.
- **Primary-source fetch failed.** Direct fetches of NIST, W3C, NN/g and USENIX pages failed in this session (DNS resolution failure from WebFetch; the sandbox proxy returned 403 on CONNECT for w3.org and nngroup.com). The proxy README says not to route around policy denials, so none was attempted. All external claims below therefore come from **WebSearch excerpts** and are labelled:
  - `[SNIPPET]`: stated in a search excerpt that names the primary source; full text not read.
  - `[UNVERIFIED]`: from memory or a secondary summary only; must be checked against the primary source before any use in a spec or release gate.
- Evidence strength is rated per claim: **Strong** (multiple studies or normative text), **Moderate** (one study or normative text excerpt), **Weak** (opinion or secondary).

---

## 1. Current implementation in brief

| Screen (QV-10 ID) | Implementation | File |
|---|---|---|
| Invitation / Election ID compare (V1) | Confirm, mismatch, "I don't have it" buttons | `app.ts:300-310` |
| Rules and privacy (V2) | Guarantee panel inside `<details>` | `app.ts:312`, panel at `app.ts:259-272` |
| Voting key (V3) | Create / import / CLI; passphrase generator; recovery code | `app.ts:320-383` |
| Ballot (V4/V5) | Radio/checkbox groups; `translate="no"` on review table | `app.ts:394-419` |
| Seal, cast, test (V6) | Code shown, Cast and Test buttons; test options in `<details>` | `app.ts:421-453` |
| Audit result (V8) | Auto checks, match radio, download | `app.ts:436-443` |
| Receipt (V7, V9) | Receipt outcome, standing, file check | `app.ts:444-518` |
| Results (V10) | Table + bar chart; verification disclosure | `app.ts:520-548` |
| Verifier (A1-A4) | Itemized list, anchor compare | `app.ts:550-571` |
| Organizer create/publish (O1-O6) | Single form; hard-coded template fields; publish with passphrase | `app.ts:573-649` |
| Shared i18n | ICU-style keys, `guarantee` vs `normal` sensitivity | `i18n/en.ts:3-11` |

Observed: **no tooltip or glossary component exists** in `packages/web/src/ui` (search for "tooltip" returned nothing), and the glossary keys in `en.ts:479-485` are not referenced from any view.

---

## 2. Findings: safest patterns

### 2.1 Ballot-code display and verification

- **Show the commitment before the choice, and make it visible to AT.** Benaloh cast-or-spoil requires the ballot code to be displayed before Cast or Test is chosen (QV-16 §5.13.1 step 1-2; QV-10 REQ-007). The current client does this correctly: buttons are enabled only after `ctl.codeRendered()` (`app.ts:434`), and the code is in the DOM. **Strong** (protocol design), code matches spec.
- **Chunk codes for reading.** Grouping in 4-character blocks with an accessible name per block is the established pattern for read-aloud and transcription. `codeEl` already splits on hyphens and sets `aria-label` per group (`app.ts:112`). **Moderate.** Caveat below on `aria-label` on generic elements.
- **Use the code as a lookup, not as proof.** Usability work on voter-verifiable systems finds that verification is harder than casting. Acemyan, Kortum, Byrne and Wallach (JETS 2014) report that only about 58% of ballots were cast successfully across Helios, Prêt à Voter and Scantegrity II, and that verification completion was lower than casting `[SNIPPET: https://www.usenix.org/jets/issues/0203/acemyan]`. A follow-up analysis attributes Helios failures mainly to the login step between encrypt and cast `[SNIPPET: same source family]`. A second summary reports 42% of participants could not cast in the mock election `[SNIPPET, figure conflicts with the 58% figure; treat as UNVERIFIED until the paper is read]`. **Moderate.** Implication: the receipt-check flow (V9) should be a single field or file input with one result sentence, and a failed check should give a next step.
- **Verification is an optional, separate action.** Marky et al. (CHI 2018) compared three Benaloh-challenge approaches with 95 participants and recommend which approaches suit real elections `[SNIPPET: DOI 10.1145/3173574.3174074 is UNVERIFIED]`. Their exact per-approach figures were not retrieved. A later Karlsruhe (KIT) study on the second-device approach used 133 participants `[UNVERIFIED]`. **Moderate** that verification approaches differ in usability; **Unverified** which wins.
- **Code-based beats challenge-based in one lab comparison** `[SNIPPET: INTERACT 2019 comparison, title only; UNVERIFIED]`.
- **Keep the verification result short and itemized.** The itemized checklist already in V8 and the verifier (`app.ts:438`, `app.ts:566-568`) follows QV-10 REQ-013. **Moderate** (design rule from QV-10, consistent with HAVA-style "opportunity to verify" language `[SNIPPET: EAC VVSG 2.0 summary]`).

### 2.2 Cast vs audit explanation

- **Equal prominence, neutral labels.** QV-10 REQ-007 requires equal prominence and a default focus on Cast. The current code uses equal-width buttons in `row equal` (`app.ts:428`) and focuses Cast (`app.ts:434`). **Strong** (spec + code consistent).
- **Explain the consequence of Test in the button hint, not only in a collapsed block.** Currently the hard fact that a tested ballot is public and never counted is in `qv.audit.public` (`en.ts:208`), which the view puts inside `more(...)` (`app.ts:430`). `more()` is a `<details>` element (`app.ts:96`). NN/g's progressive-disclosure guidance says secondary options belong behind a disclosure, but warns against hiding information the user needs to decide `[SNIPPET: https://www.nngroup.com/articles/progressive-disclosure/ and the accordion article https://www.nngroup.com/articles/accordions-on-desktop/ -- the accordion excerpt warns that essential requirements inside collapsed panels get overlooked]`. The consequence of Test is a decision input, so it belongs in the visible help text next to the Test button. **Moderate-Strong.**
- **Use "practice" wording only if the mechanics match.** The current Test label `Double-check this vote` (`en.ts:192`) and hint `This practice vote is thrown away` (`en.ts:193`) are accurate for the spoiled record, but the same hint does not say the record is posted publicly. The copy must say "posted" next to the button when posting is on by default (QV-ADR-P10-3; `app.ts:431` default checked). **Strong** (spec rule 2, QV-ADR-P10-3).
- **Do not claim a match before the voter confirms.** Automated checks cannot prove the voter's intent was captured; the voter's own "Do these match what you picked?" answer is the only evidence that the choices were the ones intended. The spec already requires this (`docs/10` §6.2 V8; §10.1 rule 4). **Strong.**

### 2.3 Passphrase and key handling

- **Paste and password-manager support.** NIST SP 800-63B-4 initial public draft: verifiers SHOULD permit paste into the memorized-secret field and SHALL allow password managers and autofill `[SNIPPET: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.ipd.pdf -- the search excerpt is from the IPD, not the final; re-check the final text]`. The current field allows paste (no `onpaste` block seen in `app.ts:324`) and disables autocorrect and autocapitalize (`app.ts:324`). **Moderate.**
- **Show-the-secret option.** Revision 3 text, as quoted in a search excerpt, recommends letting the user reveal the typed secret so they can check it `[SNIPPET, secondary; UNVERIFIED for Rev 4]`. The current code has a "Show passphrase" checkbox (`app.ts:325`, `app.ts:356`). **Moderate.**
- **Rate limiting belongs on the server.** The 2025 IPD places rate-limiting in §3.2.2 `[SNIPPET]`. Client backoff is in `LockTimer` and the key flow; that is a local convenience, not a control. The UX text at `en.ts:419` ("no attempt limit lock-out beyond local backoff") is honest and should stay.
- **Generated passphrases must not be announced.** A generated passphrase is shown in a `role="status"` element (`app.ts:322`) through `status.textContent = t('qv.key.generated', { words: pass.value })` (`app.ts:351`). Assistive technology announces live-region text, so the full secret is read aloud, and it is also shown in visible text. WCAG 4.1.3 requires status messages to be programmatically determinable, but it does not require the secret to be announced `[SNIPPET: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html]`. **Strong** (design rule: secrets never go into a live region).
- **Do not use `new-password` for unlock.** The same input uses `autocomplete="new-password"` for create and for unlock (`app.ts:324`, `app.ts:347`). On unlock, password managers should offer the saved credential (`current-password`). **Moderate** (standard HTML autofill semantics; not sourced).
- **Recovery code is shown once, with the warning.** `qv.key.recoveryHelp` ("Anyone who has it can vote as you") is correct (`en.ts:128`) but the recovery panel shows it inside the same region as the status line. Put the warning above the code. **Moderate.**
- **Backup is a gate, not an option, for trustees.** QV-10 REQ-023 requires a restore test for trustee shares. For voters, REQ-021 makes export optional, with a warning. The key-creation flow lets a voter proceed without any backup (`app.ts:378-379`); the copy `qv.key.mustBackup` (`en.ts:131`, catalogued in de/es) is not used. **Moderate** (spec-driven).
- **Clearing the device needs a confirmation that names the backup.** The "Clear this device" buttons run `clearAll()` at once (`app.ts:380`, `app.ts:452`). The copy for a confirmation exists (`en.ts:147-148`, `qv.key.forgetBody`) but is unused. Irreversible deletion of a key needs a confirmation dialog that states whether a key file or recovery code exists. **Strong** (QV-10 REQ-011 requires a confirmation screen; NN/g confirmation-dialog guidance `[SNIPPET: https://www.nngroup.com/articles/confirmation-dialog/ -- exists; content not read]`).

### 2.4 Phishing resistance and verifying the page itself

- **Use an out-of-band anchor, and make mismatch a stop.** The Election ID compare (V1, QV-10 §9) is the main control. Its weakness is the one the spec already names: a phisher who controls both the link and the ID defeats it (QV-10 §9, "Residual risk"). The current code does not implement the stop: "It doesn't match" only displays an error (`app.ts:308`), and an empty input confirms (see §3, G2). **Strong** (spec and code).
- **Persist the unconfirmed state.** QV-10 V1 requires a persistent amber "Not yet confirmed" chip and a single reminder at V6. Keys `qv.phish.unconfirmed` and `qv.ballot.unconfirmedReminder` exist (`en.ts`/catalogs) but no view references them. **Strong** (spec gap).
- **Warn that verifiers and clients can be altered.** The spec and the copy (`en.ts:289`, `qv.verify.verifierWarn`) say so. The verifier page shows the warning (`app.ts:554`). The footer shows a build id (`app.ts:654`). A dishonest server can serve altered client code, so the build hash helps only if the voter compares it with an independent source. **Strong** (ADR-010; Benaloh-style threat model in `docs/10` §11).
- **Phishing-resistant authentication for organizers and trustees is outside this design.** The publish step asks for an organizer passphrase (`app.ts:592`); that is an ordinary password. NIST's phishing-resistant authenticator guidance (FIDO2 or similar) is the stronger control for organizer roles `[UNVERIFIED for 800-63B-4 section numbers]`.
- **Usable-security baseline.** Whitten and Tygar (USENIX Security 1999) found most test participants could not sign and encrypt with PGP 5.0 in 90 minutes `[SNIPPET: https://www.usenix.org/conference/8th-usenix-security-symposium/why-johnny-cant-encrypt-usability-evaluation-pgp-50]`. Security steps must be part of the task, not a side panel. **Strong** (widely replicated).
- **Warnings get bypassed unless the design is clear.** Akhawe and Felt (USENIX Security 2013), using about 25 million browser warning impressions, found that warning design strongly affects click-through, and that some warnings work better than lab work suggested `[SNIPPET: https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe]`. Implication: a mismatch screen should default to stopping, with a single safe action, not a dismiss button. **Moderate.**

### 2.5 Coercion-aware UI

- **Coercion cannot be stopped by UI.** Juels, Catalano and Jakobsson define coercion resistance through fake credentials and show that a coerced voter's ability to comply or deceive must be indistinguishable to the adversary `[SNIPPET: https://eprint.iacr.org/2002/165 (ePrint 2002; WPES 2005 version cited)]`. The current design does not implement JCJ and says so (`en.ts:90`, nc3). **Strong** (the spec is honest).
- **Receipt-freeness is the UI's job.** The receipt must not contain selections (QV-10 REQ-005, REQ-009; `app.ts:447-453`). The current cast view does not show selections. **Strong.**
- **Do not present a receipt as proof.** `qv.receipt.doesnt` (`en.ts:234`) is shown on the cast screen (`app.ts:449`). Keep it adjacent to the ballot code. **Strong.**
- **Revote is the only offered protection, and it is time-limited.** The copy at `en.ts:90` and `qv.privacy.g4` (`en.ts:85`) says so. The UI should keep "vote again before close" next to the receipt, as it does at `app.ts:454`, but inside `more()`. Consider moving the revote note out of the disclosure for voters who are under pressure. **Moderate** (cognitive/coercion design, not measured).
- **Shoulder-surfing.** Selections are shown on the review screen (`app.ts:417`) by design, with `translate="no"`. The spec says review is private and the shared-device banner is planned (`docs/10` §14). Add a "hide choices" toggle or a blank-by-default review. **Weak-moderate** (design suggestion, not studied here).

### 2.6 Error states

- **Each error needs: what happened, what it means for the vote, what to do, and a reference.** The catalog format in `docs/10` §8.1 is good practice. `errorBox` prints title, body and reference (`app.ts:117-127`). **Strong** (spec).
- **Never map an uncertain outcome to "rejected."** The submit path sets `unknown` only for NETWORK, TIMEOUT, HTTP 503 and 429 (`ballot-controller.ts:149`). Any other HTTP error becomes `REJECTED` and the client discards the ballot randomness (`ballot-controller.ts:151-153`, `discardSecrets` at lines ~163-165). A 500, 502 or 504 can happen after the board has appended the entry. The voter then sees "Not accepted", loses the randomness needed to retry the same bytes, and may vote again. This is the most serious gap found. QV-10 §8.1 `E-NET-TIMEOUT` says "Check status first — it's safe to retry", which the code does not do for 500s. **Strong** (code reading; behaviour under 5xx depends on board semantics, which QV-09 must define).
- **Idempotent retry** is the right pattern for uncertain delivery (QV-10 REQ-020; QV-09 §4.4). The code has `isRetryable` (`api/errors.ts`) but the cast path does not use it for 500s.
- **Use plain verbs.** "Not accepted" is ambiguous for a voter. Use "We could not confirm your ballot" when the outcome is uncertain, and reserve "Not accepted" for an explicit board refusal (`app.ts:447`, `en.ts:245`).
- **Integrity alarms need a separate visual pattern.** `E-BOARD-FORK` and `E-BOARD-INCL-FAIL` are integrity failures and should not share styling with input errors. Currently they use the same `error` class (`app.ts:119`). **Moderate.**

### 2.7 Accessibility, cognitive load, low literacy, RTL

- **Screen readers: one polite and one urgent region.** The page has `#live-polite` and `#live-urgent` (`app.ts:66-67`). WCAG 4.1.3 requires status messages to be programmatically determinable without moving focus `[SNIPPET: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html]`. Use the urgent region only for "closing in under a minute" (QV-13-REQ-094; `en.ts:204`, not used). **Strong.**
- **`aria-label` on generic elements.** The stepper `<p class="step">` (`app.ts:95`) and code groups `<span>` (`app.ts:112`) carry `aria-label`. ARIA does not allow naming generic elements, so many screen readers may ignore the label or read the text oddly. **Moderate; needs AT testing with NVDA, JAWS, VoiceOver and TalkBack** (not verified here).
- **Accessible authentication.** WCAG 3.3.8 forbids cognitive-only tests for login unless an alternative, a mechanism, object recognition or personal content is available `[SNIPPET: https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication.html]`. The voter key flow is a passphrase, which is a cognitive test. Mitigations in the code: paste is allowed, password managers are not blocked, and a key file is an alternative (`app.ts:354`, import). Keep the key-file route as the alternative. **Moderate.**
- **Target size.** WCAG 2.5.8 requires 24x24 CSS px or a spacing exception `[SNIPPET: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html]`. The CSS was not read in this pass, so compliance is **UNVERIFIED**. QV-10 §6.2 asserts a 48 px minimum for ballot options (`docs/10` V4), which should be tested.
- **Drag is not the only way.** Reordering uses buttons and drag (QV-10 §6.1 O3). The code has no reorder UI (see §3), so there is nothing to fail yet. **Moderate.**
- **Low literacy and cognitive load.** The spec targets CEFR B1 / grade 8 (QV-10 REQ-025). Measured readability has not been run in this review. Long sentences exist in the guarantee copy (e.g., `en.ts:82`, `en.ts:90`; spec §7.1 lines 321-332). The normative guarantee strings are fixed by the protocol owner, so only the glossary and tooltip layer can be simplified without changing guarantee text. **Moderate** (requirement is clear; measurement is the gap).
- **Avoid reading the code in one long string.** Groups are read as 4-character units (`app.ts:112`). Keep this in the spoken form too (`spokenForm`, `app.ts:426`).
- **RTL.** The document sets `dir` from the locale (`app.ts:64`). Election IDs and codes are wrapped in `dir="ltr"` `<bdi>` (`app.ts:112`), which is correct. Charts take an `rtl` flag (`app.ts:539`, `ui/charts.ts:18`). The copy in tooltips must avoid left/right words. **Moderate.**
- **Zoom and reflow.** QV-10 requires 400 % zoom without horizontal scrolling (REQ-015 and §13 T15). Not tested in this review. **UNVERIFIED.**

### 2.8 Mobile and touch

- Single-column layout at 640 px (`docs/10` §6, preface). QV-10 targets low-end Android on throttled networks (§13.1). Confirmed in the spec; not measured here.
- Long codes and Election IDs wrap badly on phones. Use a fixed group size per line and a copy button with a `min-height` of 24 CSS px. **Moderate** (WCAG 2.5.8 applies).
- Avoid timeouts. The 20 s `E-NET-TIMEOUT` (`docs/10` Q-10-7) is short for patchy 4G. Show "still working" at 8 s (`en.ts:29` `qv.shell.loadingSlow`, unused in app.ts). **Moderate.**

### 2.9 Shared-device warnings

- The spec puts "shared or public device" on the key, receipt and review screens (QV-10 REQ-011, §7.3). The copy is present (`en.ts:101`) but shown only inside `more()` on the key screen (`app.ts:378`).
- Show a persistent banner once the voter has a key or receipt in storage and "shared device" is off, and offer "Clear this device" in the receipt screen as the primary secondary action (current code has it, `app.ts:452`, but without confirmation).
- Do not store receipts by default on shared devices (`docs/10` §10.2). The current settings default is not checked in this review (`env.storage.getSettings`).

### 2.10 Tooltips and disclosure design

- Tooltips are not the place for guarantees or required decisions. A tooltip is hidden until hover or focus, which fails for touch and some AT users. WCAG 1.4.13 (Content on Hover or Focus) requires dismissible, hoverable and persistent hover content `[UNVERIFIED: not retrieved; from memory]`.
- Use the glossary model in `docs/10` §7.6: a term, then one sentence, shown as a `<button aria-describedby>` with a visible "?" and a disclosure fallback for touch. Tooltip text is in `docs/research/tooltips-en.md`.
- Keep any tooltip that carries a guarantee in the visible page, not only in the tooltip (see §3, G6).

---

## 3. Gaps against the implementation

Severity: **C** = critical (can mislead a voter about whether a ballot counted, or leak a secret); **H** = high (false assurance, data loss, or a spec "Must" not met); **M** = medium; **L** = low.

| ID | Sev | Gap | Evidence (file:line) | Spec ref |
|---|---|---|---|---|
| G1 | C | 5xx and other non-503/429 errors become REJECTED and discard ballot randomness, although the board may have recorded the ballot. | `flow/ballot-controller.ts:149-153`, discard at ~163-165; mapping in `api/errors.ts` | QV-10 §8.1 E-NET-TIMEOUT; REQ-006, REQ-020 |
| G2 | H | Empty Election ID input passes the "matches" check and confirms the election. | `ui/app.ts:304-306` (`if (v !== '' && ...)` then `setC(true)`) | QV-10 V1, REQ-012; §9 |
| G3 | H | Registration failure is caught silently and the success line is shown anyway. | `ui/app.ts:335` (empty catch) and `338` (`qv.key.registered`) | QV-10 REQ-006 (never "success" without outcome) |
| G4 | H | Generated passphrase is placed in a polite live region and visible text. | `ui/app.ts:322` (role=status), `351` | QV-10 REQ-021; QV-19 key handling (not in this file) |
| G5 | H | Audited-ballot-public warning is inside a collapsed `<details>` on the cast screen. | `ui/app.ts:430` inside `more()` at `96`; copy `en.ts:208` | QV-10 REQ-007, §10.1 rule 2; QV-ADR-P10-3 |
| G6 | H | Audit result says the ballot "matched what you picked" before the voter answers the match question. | `ui/app.ts:440-441` (`qv.audit.ok` chosen by automated result only) | QV-10 V8; §10.1 rule 4; REQ-008 |
| G7 | H | The "No – something is wrong" answer has no escalation path, no evidence save, and no second-device route. The Save evidence key is unused. | `ui/app.ts:440`, `442`; `en.ts:230` unused (`qv.audit.evidence`); `qv.audit.mismatch` at `en.ts:211` shown only when automated checks fail | QV-10 REQ-008; §8.3 |
| G8 | H | Tally is taken from `tallies[0]` with no signature check visible in the excerpt read. | `flow/election.ts:100-103` (push), `133` (`tallies[0]`); signature checks visible only for markers/commitments (`74`, `82-97`, `128`) | QV-10 REQ-013; QV-16 §5.19 |
| G9 | H | Clear-device runs at once with no confirmation and no backup check; copy exists but is unused. | `ui/app.ts:380`, `452`; `en.ts:147-148` unused; `qv.key.mustBackup` (`en.ts:131`) unused | QV-10 REQ-011, REQ-021 |
| G10 | H | Organizer create form: threshold default 2 (spec suggests n=5, t=3), no time zone field, no method/pass rule/quorum/revoting controls, no read-back of rules. Timestamps are built from the browser zone. | `ui/app.ts:581` (`value: 2`), `641-642` (`quorumCount: 0`, `maxBallots: 8`, `new Date(...)` local) | QV-10 O1, O2, O5; REQ-001, REQ-016 |
| G11 | M | Glossary and tooltips do not exist. Glossary keys are unused. | No tooltip component in `ui/`; `en.ts:479-485` unused | QV-10 REQ-025; §7.6 |
| G12 | M | Unconfirmed-Election-ID state has no persistent chip and no reminder at V6. | `ui/app.ts:274-278` (header), `309` (no chip); `en.ts:194`, `476` unused | QV-10 V1; REQ-012 |
| G13 | M | The mismatch button only shows an error; the flow stays open. Spec says "stop screen". | `ui/app.ts:308` | QV-10 V1 ("stop screen"); §7.7 |
| G14 | M | Review status line is hard-coded to `other`, so it always reads "not yet independently reviewed", regardless of the signed manifest. | `ui/app.ts:270` | QV-10 REQ-002; QV-ADR-P10-5 |
| G15 | M | Unlock uses `autocomplete="new-password"`. | `ui/app.ts:324`, `347` | Password-manager support (NIST IPD; `[SNIPPET]`) |
| G16 | M | Hard-coded English in UI text: `404`, `Error`, `Admin`, `Election` titles; `Log public key (hex)`; `name, signing key hex`; `see Election ID after signing` (shown to the organizer as the ID). | `ui/app.ts:225`, `288`, `317`, `631`, `647` | QV-13 i18n; REQ-061 |
| G17 | M | Receipt "Logged" time uses the client clock, not the board time. | `ui/app.ts:448` (`new Date().toLocaleString`) | QV-10 REQ-009 ("timestamp as logged") |
| G18 | M | `aria-label` on a `<p>` stepper and `<span>` code groups; generic elements may not be announced. | `ui/app.ts:95`, `112` | WCAG 4.1.2 (name, role, value) — needs AT test |
| G19 | M | Translation banner not shown on review or seal screens; key unused. `translate="no"` alone does not stop browser translation. | `ui/app.ts:418` (attribute only); `en.ts:503` unused | QV-10 §14; QV-ADR-P10-4 |
| G20 | L | Election tabs have no `aria-current`; the active tab is not announced. | `ui/app.ts:285-286` | WCAG 4.1.2 / 2.4.8 (general) |
| G21 | L | Receipt "Save" and download use `URL.createObjectURL` without revoking. | `ui/app.ts:128-133` | Hygiene |
| G22 | L | The "Clear this device" action on the receipt screen resets all storage (including receipts) with no "receipts saved" warning. | `ui/app.ts:452` | QV-10 §7.3 (`qv.device.cleared` text) |

**Items already seen in the initial audit that this review confirms:** REJECTED on 5xx (G1); audited-ballot-public warning hidden in `<details>` (G5); registration failure shown as success (G3); tally not signature-checked (G8, pending confirmation of the upstream check).

---

## 4. Concrete recommendations

Each recommendation maps to a screen or component and a gap ID. Priorities: P0 = before any real vote; P1 = before the next voter-flow release; P2 = later.

**R1 (P0, G1).** In `flow/ballot-controller.ts`, classify submit failures as *unknown* for every 5xx, 429, network and timeout error. Do not discard randomness until the board has confirmed the ballot or refused it with an explicit reason code. Show `PENDING_UNCONFIRMED` with "Check status" (idempotent retry with the same bytes, QV-10 REQ-020). Test with fault injection for 500, 502, 503 and 504 (QV-11).

**R2 (P0, G2, G13).** In `ui/app.ts:304-310`, reject an empty input on "Yes, it matches" and show "Type the Election ID to confirm." On mismatch, replace the flow with the `qv.phish.mismatch` stop screen (no key or ballot controls). Keep "I don't have it" as the non-blocking path with the amber chip (G12).

**R3 (P0, G3).** In `ui/app.ts:335-338`, do not show `qv.key.registered` when registration fails. Show the not-on-roll state (`qv.key.notYetRoll`, `en.ts`) with a retry.

**R4 (P0, G4).** In `ui/app.ts:351`, never put the passphrase in a live region or in visible status text. Show generated words in a dedicated element with `aria-hidden` off, no live role, and a visible "Write these words down" instruction. Announce only "Passphrase generated. Write it down before continuing."

**R5 (P0, G5, G6, G7).** On the sealed screen (`ui/app.ts:421-453`):
- Move `qv.audit.public` out of `more()` and show it next to the Test button (in `en.ts:208` wording).
- Show `qv.audit.ok` only after the voter answers "Yes". Before that, show "Compare the choices above with what you picked."
- Make "No – something is wrong" open the `qv.audit.mismatch` panel with *Save evidence* (`qv.audit.evidence`, `en.ts:230`), a second-device step (QR and file) and an organizer contact step. Remove the claim of match in this path.

**R6 (P0, G8).** In `flow/election.ts`, verify the tally record signature (`verifyMultiSig` against the coordinator keys, as done for the election-open record at line 128) before `tallies[0]` is used. Show results only if verification passes; otherwise show `E-VER-FAIL`. Add a regression test with a forged tally.

**R7 (P0, G9).** Add a confirmation dialog on "Clear this device" in `ui/app.ts:380` and `452`, using the existing `qv.key.forgetBody` (`en.ts:148`) and `qv.key.forgetConfirm` (`en.ts:147`). If no key file or recovery code exists, say so and require typing "clear" or equivalent. Use `qv.key.mustBackup` (`en.ts:131`) to gate ballot sealing for voters who have not saved a backup, with an explicit "I will risk it" option only if the spec allows it (QV-10 REQ-021 says offer, not force; decide in QV-10 §20).

**R8 (P1, G10).** For the organizer form (`ui/app.ts:573-649`): default threshold to n=5, t=3 with the warning `qv.org.trustee.warning` (`en.ts:371`); add the time zone field (QV-10 O1); add method, pass rule, quorum, revoting controls (O2); replace `new Date(...)` with a zone-aware conversion (`i18n/datetime.ts` exists). Show the read-back preview (REQ-016).

**R9 (P1, G11).** Add the tooltip component described in `docs/research/tooltips-en.md`. Start with the six glossary terms (`en.ts:480-485`). Do not put guarantee copy only inside tooltips.

**R10 (P1, G14, G19).** Pass the signed manifest's review status into `qv.privacy.review` (`ui/app.ts:270`). Add the translation-detection banner (`qv.help.translating`, `en.ts:503`) on the review and seal screens.

**R11 (P1, G15).** Use `autocomplete="current-password"` on the unlock input (`ui/app.ts:347`). Keep `new-password` only for the create path (`ui/app.ts:324` split into two fields or set attribute by mode).

**R12 (P1, G16, G17).** Move the hard-coded English in `ui/app.ts:225, 288, 317, 631, 647` into `en.ts` keys. Replace the placeholder `see Election ID after signing` with the Election ID returned by the server, or with "Your Election ID appears after publishing." Use the board timestamp for "Logged" (`ui/app.ts:448`).

**R13 (P1, G18, G20).** Replace `aria-label` on the stepper and code spans with visible text or `aria-label` on a `role="group"` container. Add `aria-current="page"` to the active tab. Test with NVDA, VoiceOver and TalkBack.

**R14 (P2, G21, G22).** Revoke object URLs after click. Warn before clearing when receipts are stored.

---

## 5. Open questions and UNVERIFIED items

1. Read the final NIST SP 800-63B-4 (csrc.nist.gov) for paste, show, password-manager and rate-limit wording. Only the IPD excerpt was seen.
2. Read WCAG 2.2 Understanding pages for 1.4.13, 3.3.8, 4.1.3 and 2.5.8 directly; excerpts only.
3. Read Acemyan et al. (JETS 2014) and "From Error to Error" for exact completion rates; the two search summaries disagree (58% vs 42%).
4. Read Marky et al. (CHI 2018) for per-approach verification rates. DOI `10.1145/3173574.3174074` is UNVERIFIED.
5. Read the ElectionGuard spec v2.x challenged-ballot section and check whether the "instant verification" change affects the challenged-ballot UX.
6. Confirm G8 by reading the signature check that feeds `tallies` upstream of `election.ts:100`.
7. Measure reading level of the voter-flow strings (QV-10 REQ-025) with a documented method.
8. Confirm target sizes and 400 % zoom behaviour from the stylesheet and a real browser (not read here).
9. Juels, Catalano and Jakobsson: the 2005 WPES pagination is from a search summary; check the proceedings.
10. Benaloh and Tuinstra (1994) receipt-freeness: not retrieved in this pass. `[UNVERIFIED]`.
11. Culnane and Teague inspection-game analysis of Benaloh challenge voter strategies: title only, no URL retrieved. `[UNVERIFIED]`.
12. The 133-participant KIT study on second-device verification: `[UNVERIFIED]`.
13. The EAC VVSG 2.1 draft status and any paper-record rule that affects the ballot-code UX: `[SNIPPET: EAC; status not confirmed]`.

---

## 6. Sources (accessed 2026-10-21)

Status key: SNIPPET = seen in search excerpt, page not fetched; UNVERIFIED = not checked.

- NIST SP 800-63B-4 (initial public draft): https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.ipd.pdf. SNIPPET (paste SHOULD; password managers SHALL).
- NIST SP 800-63B-4 (final): https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf. Listed, not read. UNVERIFIED for section numbers.
- NIST SP 800-63B-4 authenticators page: https://pages.nist.gov/800-63-4/sp800-63b/authenticators/. Listed, not read.
- W3C WCAG 2.2, Understanding 3.3.8 Accessible Authentication (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication.html. SNIPPET (fetch failed).
- W3C WCAG 2.2, Understanding 4.1.3 Status Messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html. SNIPPET (fetch failed).
- W3C WCAG 2.2, Understanding 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html. SNIPPET (24x24 rule and spacing exception).
- W3C WCAG 2.2, Understanding 1.4.13 Content on Hover or Focus: not retrieved. UNVERIFIED.
- NN/g, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/. SNIPPET (two-level guidance; secondary-summary attribution).
- NN/g, Accordions on Desktop: https://www.nngroup.com/articles/accordions-on-desktop/. SNIPPET (essential content not in collapsed panels).
- NN/g, Confirmation Dialogs Can Prevent User Errors: https://www.nngroup.com/articles/confirmation-dialog/. Listed, not read.
- Acemyan, Kortum, Byrne, Wallach, "Usability of Voter Verifiable, End-to-end Voting Systems: Baseline Data for Helios, Prêt à Voter, and Scantegrity II," JETS 2(3), 2014: https://www.usenix.org/jets/issues/0203/acemyan. SNIPPET (58% cast success; verification lower; figures conflict across summaries).
- Acemyan et al., "From Error to Error" (follow-up analysis): listed, not read. UNVERIFIED.
- Marky, Kulyk, Renaud, Volkamer, "What did I really vote for? On the usability of verifiable e-voting schemes," CHI 2018: DOI 10.1145/3173574.3174074 (UNVERIFIED DOI). SNIPPET (95 participants; three Benaloh approaches).
- KIT (SECUSO) Benaloh challenge page: https://secuso.aifb.kit.edu/english/943.php. SNIPPET (verified votes must be discarded in Helios implementation).
- Karayumak et al., Helios usability (EVT/WOTE 2011): https://db.usenix.org/legacy/events/evtwote11/tech/slides/karayumak.pdf. Listed, not read.
- Whitten and Tygar, "Why Johnny Can't Encrypt," USENIX Security 1999: https://www.usenix.org/conference/8th-usenix-security-symposium/why-johnny-cant-encrypt-usability-evaluation-pgp-50. SNIPPET.
- Akhawe and Felt, "Alice in Warningland," USENIX Security 2013: https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe. SNIPPET (about 25M impressions; design-dependent click-through).
- Juels, Catalano, Jakobsson, "Coercion-Resistant Electronic Elections": https://eprint.iacr.org/2002/165 (ePrint 2002; WPES 2005 pp. 61-70 cited in summary). SNIPPET.
- Benaloh, "Simple Verifiable Elections," EVT 2006: cited in `docs/10` references; not retrieved. UNVERIFIED.
- Benaloh and Tuinstra, "Receipt-Free Secret-Ballot Elections," STOC 1994: not retrieved. UNVERIFIED.
- ElectionGuard verifiability concepts: https://electionguard.vote/concepts/Verifiability/. SNIPPET (verification code, challenge, publication).
- ElectionGuard precinct-scan use case: https://electionguard.vote/use_cases/Precinct_Scan/. SNIPPET (challenged ballots published decrypted; flag mismatch).
- ElectionGuard spec: https://electionguard.vote/spec/. SNIPPET (v2.0 instant verification; challenged ballot opening releases nonces). Not read in full.
- ElectionGuard Python cast-and-spoil docs: https://electionguard-python.readthedocs.io/en/latest/3_Cast_and_Spoil/. SNIPPET (spoiled = challenged, decrypted and published).
- EAC, Voluntary Voting System Guidelines 2.0 redlines (2021): https://www.eac.gov/sites/default/files/TestingCertification/Voluntary_Voting_System_Guidelines_Version_redlines_2_0_020921_v2.pdf. SNIPPET (usability and accessibility; HAVA verification language via secondary summary).
- EAC VVSG 2.1 draft (2025): status not confirmed. UNVERIFIED.
- Repository sources: `docs/10-user-experience.md`, `docs/16-crypto-protocol.md` §5.13, `packages/web/src/ui/app.ts`, `packages/web/src/i18n/en.ts`, `packages/web/src/flow/ballot-controller.ts`, `packages/web/src/flow/election.ts`, `packages/web/src/api/errors.ts`.
