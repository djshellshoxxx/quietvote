# QuietVote public claims register (v0)

**Date:** 2026-10-21 · **Version:** v0 (working draft) · **Owner:** TBD (see each row)
**Scope:** public statements in `README.md`, `docs/**`, `wiki/**` and `packages/*/README.md`, plus the claims the project must not make.
**Derived from:** `docs/07-threat-model-security.md` section 11 (non-claims N-1 to N-14) and section 12 (claims C-1 to C-15 and the forbidden-language list), `docs/30-engineering-standards.md` QV-30-REQ-034, `docs/plan/RISK-REGISTER.md` R01.

> **Status of this register.** Not approved. Every row is provisional. Under `docs/07` section 12.1 rule 3, a claim may be made only once a security lead and the project owner approve its wording. Nothing here is a security guarantee. QuietVote is **unaudited software, not for real elections**. Do not use the rows below as marketing copy.

**Current integration note (2026-10-30):** the rows and test totals below are the
dated v0 snapshot. Current source/test status is recorded in
[the consolidation handoff](../handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md) and
[audit ledger](../audit/consolidation-2026-10-30.md). Eight implemented packages
and a limited separate Python verifier exist. S-03/S-04 old failing totals and
"no second verifier" notes are historical, not current claims. C-03 still needs
independent protocol/security review and capability qualification; C-12's
production CSP and static-import SRI behavior is checked by the new browser
regression suite. Dynamic chunks and workers do not gain full SRI from that test;
the remaining scope is recorded under B3-04.
Translations are draft catalogs, unreviewed and unoffered. No claim is promoted
to approved or independently reviewed by this update.

## How to read this register

- **Type:** `make` = a claim the project makes or may make. `must-not` = wording the project must not use.
- **Status** (for `make` rows):
  - `supported`: the claim matches code in this repository, and the cited tests or configuration exist. It is still unaudited, and it has not been shown to hold in a real deployment.
  - `aspirational`: a design target, specified but not implemented, or implemented without the conditions the claim needs.
  - `unsupported`: the public text claims more than the repository shows, or the claim rests on something that does not exist yet.
- **Status** (for `must-not` rows) is always `unsupported`: the project cannot back that wording today and must not use it.
- **Evidence:** file pointers relative to the repository root. "Tests" means the package test files under `packages/*/test/`. Those are unit and integration tests, not an independent review.
- **Owner:** `TBD` for every row until an owner is assigned.
- **Quoting:** banned wording appears here inside quotation marks or backticks on purpose. `scripts/lint-claims.mjs` ignores quoted text in this file only.

---

## A. Project status and scope

| ID | Type | Claim (public wording) | Status | Evidence | Source | Owner |
|---|---|---|---|---|---|---|
| S-01 | make | "unaudited software, not for real elections" | supported | No audit exists (`docs/07` section 14; `wiki/Testing-and-Conformance.md`). | `README.md` "Current status"; `wiki/Home.md` banner | TBD |
| S-02 | make | Initial implementations exist for `crypto`, `protocol` and `board`; other packages are incomplete | supported | `packages/crypto/src`, `packages/protocol/src`, `packages/board/src` and their `test/` folders; gaps listed in `packages/*/NOTES.md` | `README.md` "Current status" | TBD |
| S-03 | make | Typecheck passes on the current tree | **unsupported** (re-run on 2026-10-21 failed: `tsc` exit 2, errors in `packages/server/src/election.ts` and then in `packages/board/test/audit.test.ts`; the tree was changing) | Earlier note recorded exit 0 for the same date; not reproduced. See [TODO](../plan/TODO.md) N-01. Another editor's wiki note records a pass at commit `c8348f4` (one failing `packages/cli` test); confirm which state is current | `package.json` | TBD |
| S-04 | make | `npm test` passes in every workspace | unsupported | Run on 2026-10-21: 467 of 475 tests pass. `packages/server` has 5 failing webhook queue and outbox tests (65 of 70 pass); `packages/verifier` has 3 failing board-layer V4 tests (13 of 16 pass). See the note below. | `wiki/Getting-Started-Dev.md` | TBD |
| S-05 | make | No release has been made | supported | README "Release status: No release" | `README.md` | TBD |
| S-06 | make | Code is licensed AGPL-3.0-or-later | supported | `LICENSE` (GNU AGPL v3 text); `package.json` `"license"` | `README.md` says "To be decided" (conflict, see section E) | TBD |
| S-07 | make | QuietVote is not certified and does not claim compliance with any government e-voting standard | supported | No certification exists. Non-claim N-9. | `docs/07` section 12.2 C-12; `wiki/FAQ.md` | TBD |
| S-08 | make | Scope is internal decisions in voluntary groups, not public governmental or legally binding votes | supported | Scope statement in the project charter. Out-of-scope list. | `README.md` "Initial scope"; `docs/00-project-charter.md` section 7 | TBD |

**Test status note (S-04).** Per-workspace results on 2026-10-21: board 46/46, cli 17/17, crypto 49/49, protocol 163/163, server 65/70, trustee 40/40, verifier 13/16, web 74/74. The server failures are in `packages/server/test/webhooks-persist.test.ts` and the outbox-cap tests. The verifier failures are the board-layer V4 witness tests in `packages/verifier/test/verifier.test.ts`. The browser e2e suite is not part of `npm test`. Until S-04 is re-run clean, do not state that the test suite passes.

## B. Cryptography, ballots and tally

| ID | Type | Claim (public wording) | Status | Evidence | Source | Owner |
|---|---|---|---|---|---|---|
| C-01 | make | Ballots are encrypted on the voter's device, and the server never holds a key that can decrypt them | supported | Ballot build and encryption: `packages/protocol/src/ballot.ts`; tests `packages/protocol/test/ballot.test.ts`. Holds only outside degraded single-trustee mode. Not shown in a live deployment. | `docs/07` C-1; `wiki/How-It-Works-In-5-Minutes.md` | TBD |
| C-02 | make | Individual ballots can be decrypted only if at least *t* of *n* named trustees cooperate | supported | Threshold DKG and tally: `packages/protocol/src/dkg.ts`, `packages/protocol/src/tally.ts`; tests `packages/protocol/test/dkg.test.ts`, `tally.test.ts`; trustee ceremony tests `packages/trustee/test/`. All tests use simulated parties, not a real ceremony. | `docs/07` C-2 | TBD |
| C-03 | make | Anyone can verify, with independent software, that the published result is the correct count | supported (one implementation; 3 verifier tests failing) | Offline verifier: `packages/verifier/src/verify.ts`, `packages/protocol/src/verify.ts`; tests `packages/verifier/test/verifier.test.ts` (3 board-layer V4 tests fail on 2026-10-21), `packages/protocol/test/verify.test.ts` (passes). The plural "independent software" in C-03 is not met yet: there is one implementation (second verifier is backlog item P4). | `docs/07` C-3; `README.md` "What is QuietVote?" | TBD |
| C-04 | make | Voters can check their ballot was recorded (receipt), and can audit a ballot (cast-or-audit) | supported | Receipt and audit flows: `packages/web/src/flow/receipt.ts`, `packages/web/src/flow/audit.ts`, `packages/web/src/flow/ballot-machine.ts`; board inclusion checks `packages/board/src/receipt.ts`. The audit needs voter action and a second device. The browser e2e suite is not part of `npm test`. | `docs/07` C-4; `wiki/Voter-Guide.md` | TBD |
| C-05 | make | Only keys on the published roll can cast counted ballots, and each key counts once (latest valid ballot) | supported | Latest-ballot rule and ballot-log checks: `packages/protocol/src/ballotlog.ts`; tests `packages/protocol/test/attacks.test.ts`, `loglayer.test.ts`. Server admission checks signatures and authorization (`packages/server/NOTES.md`). | `docs/07` C-5; `wiki/FAQ.md` | TBD |
| C-06 | make | The record is an append-only, tamper-evident log, and changes to history are detectable | supported | Merkle tree, checkpoints and consistency checks: `packages/board/src/merkle.ts`, `checkpoint.ts`, `log.ts`, `equivocation.ts`; tests `packages/board/test/merkle.test.ts`, `log.test.ts`. Server integration is partial. Use the word "tamper-evident", never "tamper-proof". | `docs/07` C-6; `wiki/Bulletin-Board-Summary.md` | TBD |
| C-07 | make | Independent witnesses co-sign the log, so the operator cannot show different histories without detection | aspirational | Cosignature code exists (`packages/board/src/checkpoint.ts` `cosignLine`) and equivocation checks exist (`equivocation.ts`). No witness runs in any deployment, and no witness policy is enforced by default. | `docs/07` C-7 | TBD |
| C-08 | make | The rules of an election are fixed and public before voting opens; changes need a new election | supported (manifest level) | Signed manifest and roll commitment: `packages/protocol/src/manifest.ts`, `roll` in `records.ts`; tests `packages/protocol/test/manifest-rules.test.ts`. Roll amendments (`docs/04` section 6.4) are not implemented. | `docs/07` C-8; `wiki/Organizer-Guide.md` | TBD |
| C-09 | make | QuietVote does not log IP addresses by default | supported (code) | Closed log field set with no address field: `packages/server/src/logger.ts`. Rate-limit keys are HMACs of address prefixes: `packages/server/src/ratelimit.ts`. This applies to a deployment only if its operator attests to the logging policy. No project-run deployment exists. | `docs/07` C-9 | TBD |
| C-10 | make | Voting is anonymous from other voters' choices: nobody can see how you voted. Who voted is visible in version 1 | aspirational | Design claim that depends on C-01 and C-02 holding in a real deployment. Not shown end to end. | `docs/07` C-10; `wiki/Privacy-and-Guarantees.md` | TBD |
| C-11 | make | You can change your vote until the election closes, and only your latest ballot counts. This does not protect you from someone watching you vote | supported | Latest-ballot rule: `packages/protocol/src/ballotlog.ts`. The coercion limit is stated in `docs/07` N-1 and the wiki. | `docs/07` C-11; `wiki/Voter-Guide.md` | TBD |
| C-12 | make | The web client sends a strict Content Security Policy and uses subresource integrity | supported | CSP meta tag and `_headers` output, plus SRI hashes: `packages/web/src/build/site.ts`; tests `packages/web/test/build.test.ts`. | `docs/08` section on deployment; `wiki/Architecture-Overview.md` | TBD |
| C-13 | make | The code is open source under AGPL-3.0-or-later | supported | See S-06. | `docs/07` C-13 (first half) | TBD |
| C-14 | make | Builds are reproducible, with a published list of hashes | aspirational | No reproducibility check or hash list exists in the repository (`packages/web/src/build/` has no reproducibility test). The condition in `docs/07` C-13 (REQ-050) is not met. | `docs/07` C-13 (second half); `docs/19-client-supply-chain.md` | TBD |

## C. Verification, independent review and reporting

| ID | Type | Claim (public wording) | Status | Evidence | Source | Owner |
|---|---|---|---|---|---|---|
| V-01 | make | The software has been independently reviewed or audited | unsupported | No review has been performed. `docs/07` C-14 allows this wording only with a linked report. | `docs/07` C-14 | TBD |
| V-02 | make | Vulnerability reports are accepted at a published address, and response times are committed | unsupported | `SECURITY.md` lists `security@quietvote.example` marked `[PLACEHOLDER]`. The mailbox has not been tested (`docs/plan/NEXT-STEPS.md` day 9). | `docs/07` C-15; `SECURITY.md` | TBD |
| V-03 | make | CI runs the typecheck and tests on Linux, macOS and Windows, with Node 22 and 24 | supported (configuration only) | Matrix in `.github/workflows/ci.yml` (job `typecheck-test`). Results of recent runs are not checked in this register. | `docs/30-engineering-standards.md` | TBD |
| V-04 | make | Public claim wording is checked for banned phrases in CI (non-blocking) | supported (configuration only) | `scripts/lint-claims.mjs` and job `claims-lint` in `.github/workflows/ci.yml` (step has `continue-on-error: true`). The first CI run has not been observed. | `docs/30-engineering-standards.md` QV-30-REQ-034 | TBD |
| V-05 | make | Dependencies are listed with licences in a snapshot | supported | `docs/reports/dependency-licence-snapshot.md`, generated by `scripts/licence-snapshot.mjs`. A snapshot, not legal advice. | `docs/plan/NEXT-STEPS.md` day 12 | TBD |

## D. Planned features and deployment (not yet built)

| ID | Type | Claim (public wording) | Status | Evidence | Source | Owner |
|---|---|---|---|---|---|---|
| F-01 | make | Self-hosting as a single binary, Docker image or systemd service | aspirational | The server runs under Node (`packages/server`). The repository has no Dockerfile, unit file or packaged binary. | `README.md`; `wiki/Architecture-Overview.md` | TBD |
| F-02 | make | Tor onion service support as a first-class deployment option | aspirational | Specified in `docs/26-network-metadata-privacy.md` and `docs/08`. No onion configuration exists in the repository. | `wiki/Architecture-Overview.md` | TBD |
| F-03 | make | Accessible participation (assistive technology, low bandwidth, varied devices) | aspirational | Specified in `docs/13-accessibility-localization.md`. No accessibility audit has been run. | `README.md` "Guiding principles" | TBD |
| F-04 | make | The interface is available in several languages | supported (catalogs only) | Message catalogs: `packages/web/src/i18n/en.ts` and `packages/web/src/i18n/catalogs/{de,es,fr,pt-BR,ar}.ts`. Translation quality has not been reviewed. | `packages/web/NOTES.md` | TBD |
| F-05 | make | Unlinkable ballots through single-use blind tokens (version 2) | aspirational | Phase 2 design only (`docs/04` section 9). Not implemented. | `wiki/Cryptographic-Protocol-Summary.md` | TBD |
| F-06 | make | Anonymous membership with no central list-keeper (version 3) | aspirational | Research only (`docs/04` section 10). Not implemented. | `wiki/What-is-QuietVote.md` | TBD |
| F-07 | make | A trustee command-line tool runs the key ceremony | supported (tests only) | `packages/trustee/src/` (`qv-trustee`); simulated ceremonies in `packages/trustee/test/`. No live ceremony has been run. | `packages/trustee/NOTES.md` | TBD |
| F-08 | make | An offline checker page verifies a saved bundle in the browser | supported (build output only) | Offline verifier page in `packages/web/src/verifier/page.ts`, emitted by `packages/web/src/build/site.ts`. | `wiki/Auditor-and-Verifier-Guide.md` | TBD |

## E. Must-not wording

Each row below is forbidden or restricted public wording. The Status column is `unsupported` for every row because the repository cannot back the wording today. Source: `docs/07` section 11 (non-claims) and section 12.3 (forbidden language).

| ID | Type | Wording the project must not use | Status | Why | Replacement | Owner |
|---|---|---|---|---|---|---|
| MN-01 | must-not | "unhackable", "unbreakable", "100% secure", "bulletproof", "guaranteed secure" | unsupported | Absolute claims; no system is proven secure | "designed to resist ..." with the assumption stated | TBD |
| MN-02 | must-not | "military-grade", "bank-grade", "government-grade" encryption | unsupported | Marketing without meaning | Name the primitive (ristretto255, Ed25519, SHA-256) | TBD |
| MN-03 | must-not | "anonymous voting" without a qualifier; "guaranteed anonymity" | unsupported | Version 1 shows who voted (N-4) | C-10 wording | TBD |
| MN-04 | must-not | "coercion-proof", "coercion-resistant", "receipt-free", "vote-buying proof" | unsupported | Not provided (N-1); revoting is a partial mitigation only | C-11 wording | TBD |
| MN-05 | must-not | "tamper-proof", "immutable ledger" | unsupported | The log is tamper-evident, not tamper-proof (C-06) | "tamper-evident append-only log" | TBD |
| MN-06 | must-not | "trustless" | unsupported | Trustees, witnesses and maintainers are trusted parties | "minimal-trust", with the list of trusted parties | TBD |
| MN-07 | must-not | "blockchain-secured"; "decentralized" as a security property | unsupported | No chain (QV-ADR-012); decentralization is not security | Describe the actual trust base | TBD |
| MN-08 | must-not | "quantum-safe", "post-quantum secure" | unsupported | Long-term secrecy is not provided (N-6) | "classical security; post-quantum migration is researched" | TBD |
| MN-09 | must-not | "end-to-end verifiable" without a qualifier | unsupported | Needs voter action and an honest verifier (N-5) | C-03 and C-04 wording | TBD |
| MN-10 | must-not | "audited" or "independently reviewed" with no linked report | unsupported | No review or audit exists (N-12, C-14) | State that the software is unaudited | TBD |
| MN-11 | must-not | "certified", or "compliant with" Council of Europe, BSI, EAC, VVSG, ISO 27001 or SOC 2 | unsupported | No certification (N-9) | C-12 wording | TBD |
| MN-12 | must-not | "safe for government or legally binding elections"; "suitable for public elections" | unsupported | Out of scope (N-9; `docs/00` section 7) | State the intended scope | TBD |
| MN-13 | must-not | "no data collected" | unsupported | Roll keys, ballots and network metadata exist (`docs/07` section 12.3) | List the specific data (`docs/06`) | TBD |
| MN-14 | must-not | "your vote is secret even if we are hacked"; "the operator cannot see your vote" with no condition | unsupported | Depends on at least *t* trustees and on honest clients (N-2, N-3) | C-01 and C-02 wording | TBD |
| MN-15 | must-not | "bug-free"; "no known bugs means safe" | unsupported | Absence of known bugs is not proof of safety (N-12) | Say that bugs may remain | TBD |
| MN-16 | must-not | Protection from a hacked phone, browser or extension | unsupported | Not provided (N-3) | State the limit | TBD |
| MN-17 | must-not | Secrecy when at least *t* trustees collude or are compelled | unsupported | Not provided (N-2) | State the limit | TBD |
| MN-18 | must-not | Hidden network use, except through Tor and not against a global observer | unsupported | Not provided (N-7) | State the limit | TBD |
| MN-19 | must-not | Guaranteed availability or uncensorable voting | unsupported | The operator is trusted for availability only (N-8) | State the operator's role | TBD |
| MN-20 | must-not | That a voter is the real person claimed; that the roll matches the true membership | unsupported | Only a registered key is checked (N-10, N-11) | State that stewards must check the roll | TBD |
| MN-21 | must-not | That every voter verifies the result | unsupported | Verifiability is a capability, not a guarantee of use (N-5) | "anyone can verify" | TBD |
| MN-22 | must-not | Secrecy from a steward who is also the operator and holds trustee shares | unsupported | Trust composition is the group's responsibility (N-14) | State the limit | TBD |
| MN-23 | must-not | Secrecy of proposal texts, or of the existence of elections | unsupported | Both are public on the board by design (N-13) | State that proposals and elections are public | TBD |
| MN-24 | must-not | "production-ready", "ready for real elections" | unsupported | Unaudited; not for real elections (`README.md`) | "unaudited draft, not for real elections" | TBD |

## F. Known conflicts and open items

These are not claims. They are conflicts found while building this register. They are listed here so their owners can fix them.

1. `README.md` section "License" says "To be decided", which conflicts with the `LICENSE` file and `package.json` (S-06). The README is outside this register's ownership.
2. `SECURITY.md` contains a placeholder address (V-02).
3. Many spec files quote banned wording in running text and tables (for example `docs/07` section 12.3, `docs/06`, `docs/16`, `docs/research/*`). `scripts/lint-claims.mjs` reports those lines because the quotation exemption applies only inside `docs/claims/`. Owners can add `<!-- claims-lint-ignore -->` markers or reword the text.
4. The test suite fails in `packages/server` on 2026-10-21 (S-04).
5. `docs/07` section 12.1 rule 3 requires security-lead and project-owner approval for this register. That approval has not been recorded.

## G. Changing this register

Add or relax a `make` claim only through a pull request that cites the evidence (file and test). Change `must-not` rows only with security-reviewer approval. Keep `scripts/lint-claims.mjs` and `docs/claims/banned-phrases.txt` in step with this register.
