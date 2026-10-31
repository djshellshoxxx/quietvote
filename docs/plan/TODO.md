# QuietVote consolidated TODO

## Current integration delta — 2026-10-30

This older backlog remains a requirement inventory, not proof of current source
status. [CONSOLIDATION](CONSOLIDATION.md) accounts for every source branch/PR;
[the audit ledger](../audit/consolidation-2026-10-30.md) accounts for all 72 extracted
audit findings and older duplicates; [the handoff](../handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md)
records exact fresh validation and open failures. Those receipts supersede old
test totals and stale missing-implementation notes below.

- B3-01 registration: owner explicitly retained protocol-review block, no contract
  or authority-rule relaxation. See OPEN-DECISIONS consolidation holds.
- Shared CP-01/04/05, SRV-001..007, BC/TR, spoil collection and dependency/CI fixes
  are now integrated, with surviving regressions and limits in the audit ledger.
- Python remains capability-limited (log, private/trustee spoil modes and some
  verdict/errata semantics); unsupported cases are reported, not counted as passes.
- Native translation review, assistive-technology qualification and independent
  security/protocol review remain external work. Main merge/release/deploy is not
  authorized by this milestone.

**Date:** 2026-10-21 · **Owner of this list:** Docs (PO for decisions) · **Status key:** Done · Partial · Open · Decision needed · Conflict · Stale · Errata open · TBD

This list consolidates three sources into one table per section: (1) every task in [BACKLOG](BACKLOG.md) (QV-23) with its status refreshed against `packages/*/NOTES.md` and the repository tree; (2) gaps, conflicts and errata found in those NOTES files, in the decision log, in the errata log and in the specs; (3) cross-references the specs themselves mark TBD. Nothing here is a verified test result. Where a status depends on a run, the run and its date are named. The second verifier is in [QV-35](../35-second-verifier.md).

Counts: BACKLOG tasks 293 (Done 52, Partial 79, Open 162); new items 52 (N-01 to N-52); owner decisions: D-84 (existing) and D-85 to D-91 (new, in [OPEN-DECISIONS](OPEN-DECISIONS.md) section H).

Priority: P0 blocks the critical path or a gate; P1 needed for the named phase exit; P2 should; P3 could. Decision deadlines are in OPEN-DECISIONS.

Column key: **Item** (ID and text) · **Package** · **Priority** · **Status** · **Source ref** (spec, ADR, NOTES or file that supports the status).

## 1. Conflicts, stale statements and blockers

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|

| N-01 Historical 2026-10-21 typecheck failures are repaired. Fresh integrated typecheck and all eight workspace suites pass; see exact source/commands in the handoff. | server, board, repo | P0 | Repaired; validated 2026-10-30 | consolidation handoff; final npm run check at 247df39 |
| N-02 Node engine floor conflict: `package.json` `engines.node` is `>=22.18`; QV-ADR-014 says `>=22.16`. Pick one and amend the other (owner: PO, Eng-R). | repo, docs | P1 | Decision needed (D-86) | package.json; decision-log QV-ADR-014 |
| N-03 Legacy board-grammar mismatch on tallied logs is repaired; verifier NOTES corrected. Supported log-layer contracts are tested; unsupported/owner-gated verifier capabilities remain separate. | verifier, board | P1 | Repaired within supported scope | packages/verifier/NOTES.md; consolidation audit ledger |
| N-04 Trustee spoil relay exists: server endpoint/storage/tally inclusion, trustee release and offline CLI spoil collector are integrated. Auto-POST orchestration and web trustee-spoil presentation remain gaps. | server, trustee, cli, web | P1 | Integrated; remaining UI/orchestration gaps | QV-ADR-020; current package NOTES; consolidation ledger |
| N-05 Election-open binding is implemented across the integrated packages and the eight open-* mutation expectations pass in both vector runners. Exact short-circuit/check-class reports still differ and require protocol review. | protocol, verifier-py, board, cli | P1 | Implemented; report semantics blocked | QV-ADR-015; QV-ERR-PY-015; strict differential receipt |
| N-06 MMD and STH cadence conflict: CONSISTENCY-REPORT row 5 sets receipts and QV-07 REQ-041 to 30 s; QV-ADR-P05-1 says `mmd` = 60 s; BACKLOG T-084 says 60 s; QV-07 cadence 60 s exceeds a 30 s MMD. Pick one value (owner: Proto). | board, docs (QV-05, QV-07, QV-18) | P1 | Conflict | CONSISTENCY-REPORT row 5; decision-log QV-ADR-P05-1; BACKLOG T-084 |
| N-07 Claims register historical test totals are explicitly marked historical and link current validation. Wording remains provisional and owner approval is still required; claims lint findings are retained visibly. | docs/claims | P0 | Status corrected; approval/lint open | docs/claims/claims-register-v0.md; consolidation handoff |
| N-08 Repo-level files required by the specs do not exist yet: `MAINTAINERS.md`, `DEPRECATIONS.md`, `docs/RELEASE-KEYS.md`, `CHANGES.md`, `docs/LICENSE-NOTE.md`, `docs/reviews/`, `docs/rfcs/`, `i18n/CHANGELOG.md`, `advisories/`, `SOURCE.md` (for vector sets). Create or remove the references (owner: Steward, Docs). Outside this docs pass. | repo root, docs | P1 | Open | QV-27-REQ-001; QV-34-REQ-016; QV-34 §3; docs/25 §; docs/27 §7 |
| N-09 Claims register: owner is TBD on every row (owner: PO, Comms). | docs/claims | P1 | Open | docs/claims/claims-register-v0.md "Owner" |
| N-10 Wiki pages, README and BACKLOG statuses were stale (license, CI, test counts, packages, typecheck). Corrected in the 2026-10-21 docs pass; see the changed-files list in the pass report. | docs, wiki, README | — | Done (2026-10-21) | README.md; wiki/*.md; docs/plan/BACKLOG.md |

## 2. Owner decisions, errata and spec conflicts

Decisions are recorded in [OPEN-DECISIONS](OPEN-DECISIONS.md) (section H, D-85 to D-91; D-84 in section G). Errata are in [spec-errata-log](../errata/spec-errata-log.md). Neither log is changed by this list.

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| N-11 D1 dependency rule: `packages/cli` imports `@quietvote/verifier` (QV-08 D1 says L3 packages never import each other). Decide: allow the single edge `cli -> verifier` or extend `qv-verify` (owner: PO). Decision D-85. | cli, verifier | P1 | Decision needed (D-85) | CONSISTENCY-REPORT row 19; packages/cli/NOTES.md |
| N-12 Control-entry record shape and signature scope are undefined in QV-16/QV-18: the verifier reads `{body:{proto,type:"control",action,reason?}}` co-signed under the manifest hash; the server signs differently (ctx). Owner decision needed (owner: Proto, PO). Decision D-87. | protocol, verifier, server (docs/16, docs/18) | P1 | Decision needed (D-87) | protocol NOTES X-31, X-33; server NOTES "Event stream"; QV-ADR-022 |
| N-13 QV-05 check V13 (steward and operator authorisation, control entries) is always `not_run`; control entries are authenticated but not applied (pause, resume, invalidate effects). Implement after N-12 (owner: Eng-C). | verifier, protocol | P1 | Open | packages/verifier/NOTES.md item 2; protocol NOTES X-34 |
| N-14 Trustee spoil mode (`spoil_trustee_decrypt`, QV-ADR-020): default off in suite v1 needs an owner confirmation, because verifier-py and QV-35-REQ-012 depend on it. Decision D-88. | protocol, server, trustee, verifier-py | P1 | Decision needed (D-88) | decision-log QV-ADR-020; protocol X-14, X-19; QV-35 |
| N-15 Tracking-code alphabet mismatch (errata E-001): QV-16 §5.12.1 says Crockford base32; `board` and `protocol` log origin use RFC 4648 lowercase. Decide per use (display vs origin). Decision D-89. | protocol, board, web (docs/16) | P1 | Errata open (E-001) | docs/errata/spec-errata-log.md E-001 |
| N-16 Rate-limit header names (errata E-002): spec uses `RateLimit-*` names from an early draft; server emits them; the IETF draft has changed. Decision D-90. | server (docs/09) | P2 | Errata open (E-002) | docs/errata/spec-errata-log.md E-002 |
| N-17 Open second-verifier errata QV-ERR-PY-001 to -015: error-code families (E_PARSE vs E_SCHEMA, unregistered E_* codes), `outcome` shape, canary `chk.tally.decrypt` expectation, record signature scope, DKG edge cases, Merkle root reproduction, manifest closed-schema, `bb.witnesses`, `election-open` rejection. Resolve with the QV-16 owner, then regenerate vectors if the spec changes (owner: Proto). | docs/16, docs/34, test-vectors | P1 | Errata open (15) | docs/errata/spec-errata-log.md QV-ERR-PY-001 to -015 |
| N-18 Shipped vectors `test-vectors/v1` use a placeholder `bb.log_id`, not SHA-256 of `logOrigin(manifest)`, so any board export built for them fails `E_LOG_BINDING`. Regenerate after N-17 and the origin decision (owner: QA, Proto). | test-vectors, protocol | P1 | Open | packages/verifier/NOTES.md "Known gaps"; protocol X-21 |
| N-19 Retained pre-renumbering drafts (`15-cryptography-and-technical-design.md`, `17-portable-membership-credentials.md`, `18-federated-governance.md`, `19-delegation-exit-fork.md`) still need clause-by-clause reconciliation into the current specs or IDEAS.md. Topic coverage at idea level exists in IDEAS.md §1, §6–§8 (owner: Docs). | docs, IDEAS.md | P2 | Open | docs/SPEC-INDEX.md "Retained pre-renumbering drafts" |
| N-20 Organizer and admin authentication mismatch (D-84): the web client calls QV-09 `/auth/challenge` and `/auth/session` with Bearer tokens; the server implements QV-08 `QV-Sig` signed requests. Rewrite QV-09 §3.2 and move the web client (owner: Eng-W, Proto). | web, server, docs/09 | P1 | Decision needed (D-84) | docs/plan/OPEN-DECISIONS.md D-84; CONSISTENCY-REPORT row 20 |
| N-21 Server does not run the advisory open and close scheduler (no closer key in manifest); windows close only when the coordinator posts the event. Decide whether a scheduler is in scope (owner: PO, Eng-S). Decision D-91. | server | P2 | Decision needed (D-91) | packages/server/NOTES.md "Time" |
| N-22 Manifest witness list: protocol and verifier accept `bb.witnesses: [{name, pk}]`, which QV-16 §5.6.1 does not define; QV-18-REQ-020 calls it `witness_policy` with more fields. Align the spec or the code (owner: Proto). | protocol, board (docs/16, docs/18) | P1 | Errata open (QV-ERR-PY-014) | protocol NOTES X-23; errata QV-ERR-PY-014 |
| N-44 Python unit/vector and strict shared-capability differential CI is added. Adapter/log/private-trustee spoil support, exact report parity and external independent review remain incomplete. | verifier-py, CI | P1 | Partial; G4 remains blocked | docs/35-second-verifier.md; .github/workflows/ci.yml; audit ledger |
| N-45 QV-16 has no definition of `KeyId(pk)`, which QV-18 and QV-09 use; suggested label `key-id` (owner: Proto). | protocol (docs/16, docs/18) | P1 | Open | CONSISTENCY-REPORT row 8; packages/protocol/NOTES.md "Mismatches" |

## 3. Implementation gaps by package (from NOTES files and the tree)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| N-23 CI gaps: no `deps-boundaries` job (`scripts/check-deps.mjs` absent); no lint, link-check or traceability step; claims lint is non-blocking; first claims-lint run not observed (owner: Eng-R). | repo CI | P1 | Open | packages/cli/NOTES.md; .github/workflows/ci.yml; BACKLOG T-235 |
| N-24 `@noble/curves` and `@noble/hashes` are pinned by lockfile only; QV-ADR-024 requires vendoring under `vendor/` with `VENDOR.lock` (owner: Eng-R, Sec). | crypto, protocol | P1 | Open | packages/protocol/NOTES.md "Mismatches"; decision-log QV-ADR-024 |
| N-25 Secret types (`SecretScalar`, QV-30 S2), zeroization and QV-30 §5.2 lint rules are not implemented; scalars are plain `bigint` (owner: Sec, Eng-C). | protocol, crypto | P1 | Open | packages/protocol/NOTES.md "Known gaps"; BACKLOG T-039 |
| N-26 Duplicate-alpha detection is implemented for cast/spoil rewrapping refusal (CP-01/TR-01) in TS, Python, server and trustee consumers. General cross-ballot reuse/linkability policy remains separate. | protocol, server, trustee, verifier-py | P2 | Partial; rewrap invariant repaired | CP-01/TR-01; audit ledger; correct-behavior regressions |
| N-27 Eligible basis and `abstain` options are not implemented (X-18); QV-20 and QV-16 disagree (owner: Proto). | protocol (docs/20) | P2 | Decision needed | packages/protocol/NOTES.md X-18; CONSISTENCY-REPORT row 10 |
| N-28 Trustee bundle does not meet REQ-021 (age-compatible), SLIP-0039 (REQ-024), dice entropy (REQ-012) or hardware-token recipients. D-11 (own ECIES vs age) still open (owner: Eng-C, Proto). | trustee, crypto | P2 | Open | packages/trustee/NOTES.md "Deviations"; decision D-11 |
| N-29 Trustee localhost UI, network outbox, `qv-ceremony` air-gapped image, dealer mode and `trustee_accept` are not built. QV-ADR-024 requires the guided UI to be served by the offline `qv-trustee` binary (owner: Eng-C). | trustee | P1 | Open | packages/trustee/NOTES.md "Not done"; decision-log QV-ADR-024 |
| N-30 Windows: POSIX mode checks are skipped; no NTFS ACL verification (owner: Sec, Eng-C). | trustee | P2 | Open | packages/trustee/NOTES.md "Windows file permissions" |
| N-31 Server imports/jobs/admin/gossip and ranged cached exports exist and are exercised. OpenAPI/schema generation, rebuild-projections, encrypted backups and TLS termination remain gaps; import CPU isolation and rollback protections are confirmed findings. | server | P2 | Partial | packages/server/NOTES.md; B2 ledger |
| N-32 Server state and parameter gaps: `CHALLENGED` never produced; `max_total_hours` and RESUME with a new close time missing; IPv6 bucket is /64 where spec says /56; archive deletes do not require an acknowledged export (owner: Eng-S, Proto). | server (docs/03, docs/29) | P2 | Open | packages/server/NOTES.md "Time", "Roll", "Known gaps" |
| N-33 Board: witness HTTP flow, gossip transport, `witness_conflict` and `missing_consistency` evidence not implemented (owner: Eng-S). | board | P2 | Open | packages/board/NOTES.md item 12 |
| N-34 Web: es, fr, de, pt-BR and ar catalogs are machine drafts with no native review. They stay unoffered until review records exist. Never mark them reviewed (owner: A11y, UX). | web (docs/13) | P1 | Open (do not mark reviewed) | packages/web/NOTES.md "Gaps"; QV-ADR-P13-3 |
| N-35 Production automated checks cover forced colors, contrast/reflow and pseudo-RTL. Native Arabic visual review, real assistive technology and screen-reader qualification remain external acceptance work. | web | P1 | Automated evidence only; human gates open | e2e/a11y.ts; exact consolidation browser receipt |
| N-36 Web: `/verify-client` not done; no QR codes; `witness` events ignored; checkpoint events are hints only (owner: Eng-W). | web | P2 | Open | packages/web/NOTES.md |
| N-37 Web organizer publish has not run against a live server or e2e; `commitRoll` not wired; trustee flows are CLI-only (owner: Eng-W, Eng-S). | web, server | P1 | Open | packages/web/NOTES.md "Organizer publish" |
| N-38 Verifier: no signed canary corpus (QV-34 says the canary is signed each build); no board-level canary in the corpus (owner: QA). | verifier, test-vectors | P2 | Open | packages/verifier/NOTES.md "Canary" |
| N-39 CLI commands not built: groups, enrollment, election create, open, close, tally, receipt check, trustee subcommands, export, import, monitor (owner: Eng-C). | cli | P1 | Open | packages/cli/NOTES.md "Commands"; BACKLOG T-162 to T-169 |
| N-40 Protocol, trustee and server manifests now declare crypto/protocol workspace edges; CLI verifier edge is declared and lockfile checked. Layering-policy decision D-85 remains open. | protocol, trustee, server, cli | P2 | Declaration repaired; policy gate retained | package manifests; lockfile lint; D-85 |
| N-41 Protocol: ML-DSA-44 cosignatures not supported (board treats them as non-counting); PoK and DLEQ nonces are not hedged (OQ-7) (owner: Proto). | protocol, board (docs/16, docs/18) | P2 | Open | protocol X-20; board NOTES item 6 |
| N-42 Board header encoding is board-local, not QV-16 `enc`; leaf hashes change when swapped (owner: Eng-S, Proto). | board (docs/16, docs/18) | P1 | Open | packages/board/NOTES.md item 1 |
| N-43 `[UNVERIFIED]` markers remain (`docs/plan/VERIFICATION-TODO.md`); including the MF2 status (Q-13-5) and the Contributor Covenant version (docs/27) (owner: Docs, Legal). | docs | P2 | Open | docs/plan/VERIFICATION-TODO.md |

## 4. Spec-level TBD and open questions (marked in the specs)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| N-46 Alternate submission path under operator censorship: design marked "TBD in QV-09" in the threat model (owner: Sec, Proto). Default proposed in D-52: mirrors forward signed ballots. | docs/07, docs/09 | P2 | TBD | docs/07-threat-model-security.md R-08 |
| N-47 Appeals panel selection mechanism: marked "TBD in QV-03" in the abuse spec (owner: Steward, Proto). | docs/29, docs/03 | P2 | TBD | docs/29-abuse-dos-prevention.md line 197 |
| N-48 Delegation or proxy token: marked "TBD in QV-20" for Phase 2 (owner: Proto). | docs/05, docs/20 | P3 | TBD | docs/05-ballot-protocol.md line 214 |
| N-49 Hosted-operator jurisdiction: QV-OQ-25-5 is TBD (owner: Legal, Steward). | docs/25 | P2 | TBD | docs/25-legal-compliance-licensing.md line 185 |
| N-50 Conformance runner (`tools/conformance`) static binary is TBD (owner: QA). | docs/34 | P3 | TBD | docs/34-test-vectors-conformance.md line 385 |
| N-51 ElectionGuard 2.0 placeholder elimination: stated as an unverified search snippet; open question OQ-3 (owner: Proto). | docs/16 | P2 | Open question | docs/16-crypto-protocol.md line 533 |
| N-52 BSI-CC-PP-0121 SFR mapping: open question OQ-3 (owner: Sec). | docs/07 | P3 | Open question | docs/07-threat-model-security.md line 46 |

## 5. Backlog tasks (BACKLOG QV-23, statuses refreshed 2026-10-21)

Checkboxes in BACKLOG are updated to match. Priority and owner role are as in BACKLOG. Source ref gives the BACKLOG spec column; a changed status also carries its evidence.


### E01 — Spec closure, decisions and governance (P0)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-001 Draft specs QV-00…QV-34 and SPEC-INDEX | docs | P0 | Done | SPEC-INDEX (owner role: —). |
| T-002 Record baseline ADR-000…013 (provisional) | docs | P0 | Done | decision-log (owner role: —). |
| T-003 Research notes R-01…R-04 | docs | P1 | Done | QV-21 (owner role: —). |
| T-004 Owner review of ADR-001…013; record Accepted/Superseded in decision log | docs | P0 | Open | decision-log (owner role: T-002). |
| T-005 Resolve "by M0" items in OPEN-DECISIONS.md and record as ADRs | docs | P0 | Open | OPEN-DECISIONS (owner role: T-004). |
| T-006 Move MVP-critical specs Draft→Review→Approved (QV-00,02,03,04,05,07,08,09,16,18,20) | docs | P0 | Open | SPEC-INDEX "implementation-ready" (owner role: T-005). |
| T-007 Spec consistency pass: cross-spec ID/field/error-code reconciliation, close dangling refs | docs | P0 | Partial | QV-24 (owner role: T-006). Evidence (2026-10-21): CONSISTENCY-REPORT pass done 2026-10-21; errata log entries still open. |
| T-008 Freeze QV-16 wire formats v0 (encodings, domain-separation labels, registry) | docs | P0 | Open | QV-16, ADR-004 (owner role: T-005). |
| T-009 Populate traceability matrix (requirement → design → test → evidence) and script to check coverage | docs | P1 | Open | QV-24, QV-30-REQ-027 (owner role: T-006). |
| T-010 Spec status/claims register (claims vs assurance level) and banned-phrase list | docs | P1 | Partial | QV-11 G13, QV-30-REQ-034 (owner role: T-006). Evidence (2026-10-21): docs/claims/claims-register-v0.md and banned-phrases.txt exist (v0; owners TBD). |
| T-011 Governance docs live: maintainers, decision process, DCO, CoC (Contributor Covenant 2.1 + neutrality clause) | docs | P1 | Partial | QV-27 §5,6,11 (owner role: T-004). |
| T-012 Release-key policy decision (2-of-3 maintainer sigs) and key-custody plan | docs | P1 | Open | QV-27, QV-19, QV-OQ-12-1 (owner role: T-005). |
| T-013 Name/trademark/fork policy | docs | P2 | Open | QV-27 §10, QV-OQ-14-5 (owner role: T-011). |
| T-014 Contributor onboarding: good-first-issues, architecture tour, ADR process | docs | P2 | Partial | QV-27, CONTRIBUTING (owner role: T-011). |
| T-015 Public call for protocol review (academic e-voting groups), publish specs under CC BY-SA | docs | P1 | Open | QV-11 §9.1 (owner role: T-006). |

### E02 — `packages/crypto` (P1)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-021 SHA-256 wrapper (`hash.ts`) | crypto | P0 | Done | ADR-003 (owner role: —). |
| T-022 Ed25519 sign/verify wrapper (strict, no ZIP-215) | crypto | P0 | Done | QV-16, QV-16-OQ-5 (owner role: —). |
| T-023 Smoke test for hash/ed25519 | crypto | P1 | Done | QV-11 L0 (owner role: T-021). |
| T-024 Expand Ed25519 tests: RFC 8032 vectors, malleability, small-order, non-canonical encodings | crypto | P0 | Partial | QV-11 §6.1 (owner role: T-022). Evidence (2026-10-21): crypto tests exist; RFC 8032 known-answer coverage not confirmed. |
| T-025 ristretto255 group wrapper (encode/decode strict, identity rejection, scalar canonical checks) | crypto | P0 | Done | ADR-004, QV-16 (owner role: T-008). Evidence (2026-10-21): protocol NOTES "What exists": ristretto255 strict decoding and identity checks. |
| T-026 Domain-separated, length-prefixed transcript hashing (Fiat–Shamir) + label registry | crypto | P0 | Done | QV-16, QV-11 §6.1 (owner role: T-008). Evidence (2026-10-21): crypto framed hashing with closed label registry (protocol NOTES). |
| T-027 Hash-to-scalar / hash-to-group (RFC 9380 or spec'd), second generator H derivation (nothing-up-my-sleeve) | crypto | P0 | Open | QV-16 (owner role: T-025). |
| T-028 Exponential ElGamal encrypt/decrypt-to-point, rerandomize | crypto | P0 | Partial | Encrypt/decrypt-to-point exists; no rerandomize function (B1-10). Original 2026-10-21 Done status overstated the implementation. ADR-004 (owner role: T-025). |
| T-029 Schnorr proof of knowledge / possession | crypto | P0 | Done | QV-16 (owner role: T-026). Evidence (2026-10-21): Schnorr PoK (protocol NOTES). |
| T-030 Chaum–Pedersen (equality of DL) proof + verify | crypto | P0 | Done | ADR-004 (owner role: T-026). Evidence (2026-10-21): DLEQ / Chaum-Pedersen (protocol NOTES). |
| T-031 CDS disjunctive 0/1 proof + verify | crypto | P0 | Done | ADR-004, QV-16 (owner role: T-030). Evidence (2026-10-21): CDS 0/1 proofs (protocol NOTES). |
| T-032 Contest-limit (sum) proof, incl. slack/placeholder design | crypto | P0 | Done | QV-16, QV-20 (owner role: T-031). Evidence (2026-10-21): selection-limit proof (protocol NOTES). |
| T-033 Feldman VSS / Pedersen-with-PoK DKG primitives, share verification | crypto | P0 | Done | QV-17, QV-16 (owner role: T-029). Evidence (2026-10-21): Feldman VSS and DKG adjudication (protocol NOTES). |
| T-034 Threshold decryption share + decryption proof + Lagrange combine | crypto | P0 | Done | ADR-004 (owner role: T-030,T-033). Evidence (2026-10-21): partial-decryption proofs and combination (protocol NOTES). |
| T-035 ECIES-style `enc_share` (ristretto/X25519, domain separated) | crypto | P0 | Done | QV-17 Q1 (owner role: T-025). Evidence (2026-10-21): share cipher is ristretto DH + HKDF-SHA-256 + AES-256-GCM (QV-ADR-P16-6); D-11 still open. |
| T-036 Merkle-leaf/commitment helpers shared with board (single source) | crypto | P1 | Open | QV-18 (owner role: T-021). |
| T-037 KDF: Argon2id (or scrypt fallback) wrapper for key files / trustee backups | crypto | P1 | Done | QV-19 OQ, QV-16-OQ-5 (owner role: —). Evidence (2026-10-21): argon2idKdf in crypto, used by cli and web (cli, web NOTES). |
| T-038 CSPRNG interface with injectable deterministic mode for vectors only | crypto | P0 | Done | QV-11 §5.2 (owner role: —). Evidence (2026-10-21): injectable CSPRNG; deterministic vector generator (protocol NOTES). |
| T-039 Constant-time discipline review + secret-zeroization policy; branded secret types | crypto | P1 | Open | QV-30, QV-19-REQ-009 (owner role: T-025). |
| T-040 Property tests INV-* for proofs (completeness, soundness smoke, binding to statement) | crypto | P0 | Open | QV-11 §7.1 (owner role: T-031). |
| T-041 Negative tests ATK §6.1 (proof malleability, wrong transcript, identity points) | crypto | P0 | Partial | QV-11 §6.1 (owner role: T-031). Evidence (2026-10-21): protocol attacks.test.ts covers proof-type pairs; not every ATK row. |
| T-042 Benaloh challenge primitives (commit, spoil reveal of randomness) | crypto | P0 | Done | ADR-004 (owner role: T-028). Evidence (2026-10-21): Benaloh spoil in three modes (protocol X-19). |
| T-043 Hedged nonce labels for DKG PoK/complaint proofs | crypto | P2 | Open | QV-17-OQ-7 (owner role: T-033). |
| T-044 Optional ML-DSA-44 cosignature verify (build flag, dependency exception) | crypto | P3 | Open | QV-18 Q4 (owner role: —). |
| T-045 Benchmarks: cast→receipt, proof gen/verify, tally 5,000×10 | crypto | P1 | Partial | S12 (owner role: T-032). Evidence (2026-10-21): timings in protocol NOTES only (about 35 ms per ciphertext); no benchmark suite. |

### E03 — `packages/protocol` (P1)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-046 Canonical encoding (deterministic bytes, strict parse, reject trailing/dup/unknown fields) | protocol | P0 | Done | QV-16, QV-09 (owner role: T-008). Evidence (2026-10-21): strict QV-JSON parser and RFC 8785 serialiser (crypto, protocol NOTES). |
| T-047 Protocol/version identifiers and algorithm agility registry | protocol | P0 | Partial | ADR-013, QV-16 (owner role: T-008). Evidence (2026-10-21): suite id hashed into frames (QV-ADR-P16-5); no algorithm registry. |
| T-048 `GroupRules` schema, validator, templates (≥3), plain-language summary | protocol | P0 | Partial | QV-03 §3,§10, QV-02-REQ-002/003 (owner role: T-046). Evidence (2026-10-21): manifest validation and exact-integer rules exist; GroupRules templates and summary not evidenced. |
| T-049 Election manifest schema + signing + hash; roll Merkle root commitment | protocol | P0 | Done | QV-03, QV-04, ADR-005 (owner role: T-046). Evidence (2026-10-21): manifest validation, hash and roll Merkle root (protocol NOTES). |
| T-050 Voter roll model: key enrollment, proof-of-possession, label hash with per-group salt | protocol | P0 | Partial | QV-04, QV-02-REQ-011 (owner role: T-049). Evidence (2026-10-21): roll Merkle in protocol; registration PoP in server; salted label hash not evidenced. |
| T-051 Invitation token generation/redeem logic (≥128-bit, expiry, single use) | protocol | P1 | Partial | QV-02-REQ-010 (owner role: T-050). Evidence (2026-10-21): invites in server (server NOTES); token entropy and expiry not checked here. |
| T-052 Election lifecycle state machine (DRAFT→READY→OPEN→CLOSED→TALLIED→FINAL, extension/stall rules) | protocol | P0 | Partial | QV-03 §6, OQ-8 (owner role: T-049). Evidence (2026-10-21): lifecycle projection in server; QV-ADR-022 states only partly (server NOTES). |
| T-053 Ballot construction per method (yes/no, single, approval, k-of-n) | protocol | P0 | Partial | QV-20, QV-05 (owner role: T-032). Evidence (2026-10-21): ballot build for yes/no and limit methods; approval and k-of-n coverage not confirmed. |
| T-054 Ballot validation (proofs, roll membership, signature, author key, size caps) | protocol | P0 | Done | QV-05, QV-16 (owner role: T-053). Evidence (2026-10-21): ballot build, encrypt, sign, verify and section 5.14.4 checks (protocol NOTES). |
| T-055 Latest-valid-ballot-per-voter (revote) selection rule with deterministic ordering | protocol | P0 | Done | QV-05, ADR-005 (owner role: T-054). Evidence (2026-10-21): ballot-log analysis: window, chain, limit, duplicate code (protocol NOTES). |
| T-056 Homomorphic aggregation + aggregate hash binding | protocol | P0 | Done | QV-16, QV-17 Q (owner role: T-055). Evidence (2026-10-21): homomorphic aggregation (protocol NOTES). |
| T-057 Tally computation and result object per method; quorum and simple/supermajority thresholds | protocol | P0 | Done | QV-03 §7, QV-20 (owner role: T-056). Evidence (2026-10-21): tally record, exact-integer rules, quorum and thresholds (protocol NOTES). |
| T-058 Tie-break rules declared in manifest (deterministic; beacon disabled v1) | protocol | P1 | Done | ADR-006, QV-20-OQ-4 (owner role: T-057). Evidence (2026-10-21): tie-break kinds declared; beacon not in v1 (D-20 default). |
| T-059 Receipt/tracking-code derivation (20 base32 + checksum; full hash retained) | protocol | P1 | Partial | QV-10 OQ, QV-16 (owner role: T-054). Evidence (2026-10-21): receipt and tracking code exist; display alphabet open (errata E-001). |
| T-060 Benaloh cast-or-audit protocol messages (spoiled ballot entries) | protocol | P0 | Done | ADR-004, QV-16 (owner role: T-042,T-054). Evidence (2026-10-21): Benaloh spoiled-ballot messages (protocol NOTES). |
| T-061 Decryption-oracle control (min aggregated ballots, ATK-035) | protocol | P0 | Done | Q-11-2 (owner role: T-057). Evidence (2026-10-21): E_BELOW_FLOOR and trustee refusal (protocol X-13; trustee NOTES). |
| T-062 Trustee protocol messages: DKG round 1/2/complaints/justification | protocol | P0 | Done | QV-17, QV-16 (owner role: T-033). Evidence (2026-10-21): DKG round records (protocol, trustee NOTES). |
| T-063 Trustee decryption share entry + combination + result entry | protocol | P0 | Done | QV-16, QV-17 (owner role: T-034). Evidence (2026-10-21): partial decryption, combination, server dec-shares record (protocol, server NOTES). |
| T-064 Challenge/dispute entries and rule path (log-based) | protocol | P1 | Open | QV-03 §8, QV-02 (owner role: T-052). |
| T-065 Steward actions: roll amendment, extension, pause with visible log entries | protocol | P1 | Partial | QV-04 §6, QV-03 (owner role: T-052). Evidence (2026-10-21): server control records pause, resume, invalidate, security-notice; extension not applied (server NOTES). |
| T-066 Proposal history hash chain (amendments, review period) | protocol | P1 | Open | QV-02 §4 (owner role: T-048). |
| T-067 Error-code catalog (E_*) shared with API | protocol | P1 | Partial | QV-09 (owner role: T-046). Evidence (2026-10-21): error codes in protocol and test-vectors/schema/error-codes.json; QV-ERR-PY-002 open. |
| T-068 Export/import bundle format (public bundle, operator bundle) | protocol | P0 | Partial | QV-18 §12, QV-09 Q4 (owner role: T-046). Evidence (2026-10-21): ElectionBundle and server .qvb export exist; import not implemented (server NOTES). |
| T-069 Property/invariant tests INV-* for lifecycle, tally, revote, eligibility (S2 10,000 randomized elections) | protocol | P0 | Open | QV-11 §7, S2 (owner role: T-057). |
| T-070 Adversarial tests §6.2–6.3 (ballot, voter, trustees, DKG) | protocol | P0 | Partial | QV-11 §6 (owner role: T-063). Evidence (2026-10-21): attacks.test.ts; scripted malicious trustees (trustee NOTES). |
| T-071 Phase 2 extension points (token author field) designed, not built | protocol | P3 | Open | ADR-005 (owner role: T-049). |

### E04 — `packages/board` (bulletin board library; P2)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-076 Byte helpers and error types | board | P0 | Done | QV-18 (owner role: —). |
| T-077 Merkle tree: append-only, root, inclusion and consistency verification (RFC 9162 style) | board | P0 | Done | QV-18, ADR-007 (owner role: —). |
| T-078 Signed-note checkpoint (STH), cosignature lines, witness policy evaluation | board | P0 | Done | QV-18, ADR-007 (owner role: T-077). |
| T-079 Entry header model, type list, size caps, origin validation, author KeyId | board | P0 | Done | QV-18, QV-16 (owner role: T-076). |
| T-080 Unit tests for Merkle (RFC 9162/known-answer, odd sizes, tamper), checkpoint, entry parsing | board | P0 | Partial | QV-11 §6.4, L1 (owner role: T-077,T-078,T-079). Evidence (2026-10-21): board/test has 4 files (2026-10-21); coverage against the item list not confirmed. |
| T-081 Cross-check Merkle against independent reference (Go `sumdb`/`tlog` vectors) | board | P1 | Open | QV-34 (owner role: T-080). |
| T-082 `BoardStore` interface + SQLite adapter (`node:sqlite`), WAL, durability-before-ack | board | P0 | Done | QV-28, ADR-003, QV-11 ADR-P11-4 (owner role: T-079). Evidence (2026-10-21): SqliteBoardStore implements BoardStore (server NOTES). |
| T-083 Append pipeline: validate → assign index → persist → STH; idempotent re-submission | board | P0 | Done | QV-18, QV-09 (owner role: T-082,T-054). Evidence (2026-10-21): server admission pipeline with single-transaction append (server NOTES). |
| T-084 STH issuance, maximum merge delay `mmd` (60 s), signing-key-loss behaviour (stop issuing) | board | P0 | Partial | QV-18, ADR-P11-4 (owner role: T-083). Evidence (2026-10-21): checkpoint after every append; mmd value conflicts (N-06). |
| T-085 Inclusion/consistency proof serving; tiles optional | board | P1 | Partial | QV-18, QV-18-Q6 (owner role: T-083). Evidence (2026-10-21): inclusion proofs in board; public serving partly (server NOTES). |
| T-086 Witness cosign request/response hooks; policy file; one volunteer witness | board | P1 | Partial | QV-18, QV-32 (owner role: T-084). Evidence (2026-10-21): cosignature lines stored; witness HTTP flow not implemented (board NOTES item 12). |
| T-087 Mirror/monitor client (fetch, verify consistency, gossip checkpoint) | board | P1 | Open | QV-18, QV-32 (owner role: T-085). |
| T-088 Equivocation detection tests (split-view, rollback, reorder) | board | P0 | Partial | QV-11 §6.4 (owner role: T-087). Evidence (2026-10-21): equivocation.ts and log-layer tests exist (protocol NOTES). |
| T-089 Retention/deletion schedule for non-public data; log is permanent for public entries | board | P1 | Partial | QV-06, QV-28 (owner role: T-082). Evidence (2026-10-21): archive erases DEK; retention scheduler not implemented (server NOTES). |
| T-090 Chaos tests CH-xx for board (crash mid-append, disk full, clock skew) | board | P1 | Open | QV-11 §8.6 (owner role: T-083). |
| T-091 Optional OpenTimestamps anchoring witness | board | P3 | Open | ADR-012, QV-OQ-7 (owner role: T-084). |
| T-092 Fuzz harnesses: entry parser, checkpoint parser, proof verifiers | board | P1 | Open | QV-11 §7.2 (owner role: T-080). |

### E05 — `packages/server` (P2)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-096 HTTP server skeleton (no third-party framework or minimal), routing, TLS-behind-proxy config | server | P0 | Done | ADR-003, ADR-009, QV-08 (owner role: —). Evidence (2026-10-21): node:http server with limits and security headers (server NOTES). |
| T-097 OpenAPI 3.1 + JSON Schema 2020-12 generation; contract tests | server | P0 | Open | QV-09 Q2 (owner role: T-046). |
| T-098 Group create/rules endpoints; server never receives group secret | server | P0 | Partial | QV-02-REQ-001/002 (owner role: T-048,T-096). Evidence (2026-10-21): organization registration is signed; group rules endpoint not evidenced. |
| T-099 Invitation + enrollment endpoints; no PII | server | P0 | Done | QV-02-REQ-010/011, QV-04 (owner role: T-051,T-096). Evidence (2026-10-21): invite, registration and PoP (server NOTES). |
| T-100 Election create / manifest publish / state transitions with authZ (steward signatures) | server | P0 | Done | QV-03, QV-09 (owner role: T-052,T-083). Evidence (2026-10-21): election create, manifest publish, open and close with lifecycle (server NOTES). |
| T-101 Ballot submission endpoint: validation, rate limit, receipt (signed inclusion promise) | server | P0 | Done | QV-05, QV-29 (owner role: T-083,T-054). Evidence (2026-10-21): ballot admission with validation and receipt (server NOTES). |
| T-102 Spoiled-ballot / Benaloh endpoints | server | P0 | Done | ADR-004 (owner role: T-060,T-101). Evidence (2026-10-21): ballot_audit admission with verifySpoilReveal (server NOTES). |
| T-103 Trustee coordination endpoints (post messages, fetch, status) | server | P0 | Partial | QV-17, QV-09 (owner role: T-062,T-096). Evidence (2026-10-21): trustee coordinator views (server NOTES); trustee invites not implemented. |
| T-104 Tally orchestration: close → aggregate → collect shares → publish result | server | P0 | Partial | QV-05, QV-17 (owner role: T-063,T-100). Evidence (2026-10-21): tally draft, server aggregate and relay (server NOTES); no scheduler. |
| T-105 Public read API: log, entries, proofs, STH, roll, results, bundles | server | P0 | Partial | QV-09, QV-18 (owner role: T-085). Evidence (2026-10-21): SSE and read API (server NOTES); full public read list not confirmed. |
| T-106 Challenge/dispute and steward-action endpoints | server | P1 | Open | QV-03 §8 (owner role: T-064,T-065). |
| T-107 Export bundle endpoint and import for restart elsewhere (no live migration of OPEN) | server | P0 | Partial | QV-18 §12, ADR-001(4) (owner role: T-068). Evidence (2026-10-21): export (.qvb, export.json) exists; /imports not implemented. |
| T-108 Idempotency-Key support | server | P1 | Done | QV-09 Q7 (owner role: T-096). Evidence (2026-10-21): Idempotency-Key on webhook POST; idempotent replay (server NOTES). |
| T-109 Abuse controls: PoW/anti-spam token, per-IP-less rate limiting, body caps, slow-loris limits | server | P0 | Partial | QV-29, QV-26 (owner role: T-101). Evidence (2026-10-21): rate limits, body caps, timeouts; PoW or anti-spam token not implemented. |
| T-110 Privacy-by-default logging: no IP/UA persisted; redaction; canary test | server | P0 | Partial | S10, QV-06, QV-31, QV-19-REQ-009 (owner role: T-096). Evidence (2026-10-21): closed logger field set (server NOTES); canary test not evidenced. |
| T-111 Privacy-preserving metrics (aggregate counters only) | server | P2 | Open | QV-31 (owner role: T-110). |
| T-112 Scheduler: window close, retention deletion, STH heartbeat | server | P1 | Open | QV-03, QV-06 (owner role: T-100). |
| T-113 Optional webhooks (steward-supplied URL only, P0/P1 data) | server | P2 | Done | QV-02-REQ-075, QV-09 (owner role: T-100). Evidence (2026-10-21): webhooks with SSRF policy (server NOTES). |
| T-114 Mirror-forward submission path (censorship fallback) | server | P2 | Open | QV-07 R-08, OQ-1 (owner role: T-101). |
| T-115 Security headers, strict CSP, no third-party resources, SRI, Trusted Types serving | server | P0 | Partial | ADR-009, QV-19 (owner role: T-096). Evidence (2026-10-21): server security headers; CSP and SRI in web build. |
| T-116 Link read-key rotation | server | P3 | Open | QV-09 Q8 (owner role: T-105). |
| T-117 API integration tests (L4), authZ matrix, idempotency, replay | server | P0 | Partial | QV-11 §8.1 (owner role: T-101). Evidence (2026-10-21): server test suite exists (7 files). |
| T-118 Load tests: 2,000 voters, burst at close, 5,000 ballots tally | server | P1 | Open | QV-11 §8.5, S12 (owner role: T-104). |
| T-119 Server storage migrations framework + upgrade/downgrade drill | server | P1 | Partial | QV-28, G10 (owner role: T-082). Evidence (2026-10-21): election DB migration 2 exists (server NOTES). |
| T-120 Tor onion-service profile (listen config, no external fetch) | server | P1 | Open | ADR-009, QV-26 (owner role: T-096). |
| T-121 `node:sqlite` stability watch and contingency memo | server | P2 | Open | QV-08 OQ, ADR-003 (owner role: T-082). |

### E06 — `packages/trustee` (P3)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-126 Trustee CLI: key generation, encrypted share store, SAS word list | trustee | P0 | Partial | QV-17, QV-17 Q4 (owner role: T-035,T-037). Evidence (2026-10-21): trustee CLI with sealed bundle, passphrase, transcript (trustee NOTES); SAS and word list placeholder. |
| T-127 DKG client (rounds, complaint handling, abort/restart) | trustee | P0 | Done | QV-17, T-062 (owner role: T-062,T-103). Evidence (2026-10-21): DKG client rounds, complaints, restart (trustee NOTES). |
| T-128 Ceremony transcript verifier and public attestations | trustee | P0 | Done | QV-17 (owner role: T-127). Evidence (2026-10-21): transcript build, sign, verify (trustee NOTES). |
| T-129 Decryption-share production with proof after verifying aggregate and policy | trustee | P0 | Done | QV-17, T-061 (owner role: T-063). Evidence (2026-10-21): releaseTally with REQ-040 checks (trustee NOTES). |
| T-130 Air-gapped mode: offline bundle in/out (file/QR), recovery sheet (plain-text) | trustee | P1 | Partial | QV-17, Q-13-7 (owner role: T-127). Evidence (2026-10-21): file exchange .qvl/.qvp (trustee NOTES); QR and recovery sheet not built. |
| T-131 Share backup, key destruction after audit window (default 30 d) | trustee | P1 | Partial | QV-17 Q7, ADR-013 (owner role: T-127). Evidence (2026-10-21): destroy implemented; Shamir passphrase backup not (trustee NOTES). |
| T-132 Organization-trustee (HSM/service) disclosure support | trustee | P3 | Open | QV-17 Q6 (owner role: T-129). |
| T-133 Trustee recruitment & training guide; dry-run ceremony script | trustee | P1 | Open | QV-17, QV-12 (owner role: T-127). |
| T-134 Ceremony chaos tests (trustee dropout, malicious dealer, replay) | trustee | P0 | Partial | QV-11 §6.3, §8.6 (owner role: T-127). Evidence (2026-10-21): scripted malicious-trustee harness; chaos suite not built. |
| T-135 Browser trustee UI (deferred Phase 2) | trustee | P3 | Open | QV-01 OQ (owner role: T-127). |

### E07 — `packages/verifier` (P4; reference verifier P3)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-141 Verifier core: bundle parse (strict), log consistency/inclusion/STH/witness check | verifier | P0 | Partial | QV-05, QV-18 (owner role: T-068,T-080). Evidence (2026-10-21): verifier composes board.verifyLog and protocol.verifyElection; V4 gap (verifier NOTES; N-03). |
| T-142 Election verification: manifest, roll, ballot proofs, latest-ballot rule, aggregate, decryption proofs, tally | verifier | P0 | Done | QV-05, QV-16 (owner role: T-141,T-057). Evidence (2026-10-21): protocol.verifyElection (protocol NOTES). |
| T-143 Verifier output report (deterministic hash, machine+human readable) | verifier | P0 | Done | S1 (owner role: T-142). Evidence (2026-10-21): reportHash; text and JSON report (verifier NOTES). |
| T-144 Verifier performance: 5,000×10 in ≤ 60 s | verifier | P1 | Open | S12 (owner role: T-142). |
| T-145 Standalone offline "verifier page" (single file, no network) | verifier | P0 | Done | ADR-010, QV-19 (owner role: T-142). Evidence (2026-10-21): offline verifier.html built by web (web NOTES). |
| T-146 Verifier minimal-dependency policy (reads spec only; shares no code with `protocol` where feasible) | verifier | P1 | Partial | QV-11 R7, G4 (owner role: T-142). Evidence (2026-10-21): verifier imports only crypto, protocol and board; not independent of protocol. |
| T-147 Recruit independent second-verifier author/team (non-core, different language, e.g. Python/Rust) | verifier | P0 | Partial | S1, R7, QV-11-OQ-9 (owner role: T-008). Evidence (2026-10-21): verifier-py skeleton exists; reviewer recruitment not evidenced (QV-35). |
| T-148 Second verifier implementation passing QV-34 profile vectors + reference bundles | verifier | P0 | Partial | G4, S1, R7 (owner role: T-147,T-212). Evidence (2026-10-21): verifier-py: 228 of 277 vectors pass on 2026-10-21 run; log layer and adapter missing (QV-35). |
| T-149 Differential testing harness: both verifiers vs mutated bundles | verifier | P0 | Open | G4, QV-11 (owner role: T-148). |
| T-150 Reference election bundles (valid, tampered, equivocating, malformed) | verifier | P0 | Partial | QV-34 (owner role: T-141). Evidence (2026-10-21): election bundles and 23 mutants in test-vectors/v1. |
| T-151 Monitor mode: continuous log audit and alerting | verifier | P2 | Open | QV-18, QV-32 (owner role: T-141). |
| T-152 Verifier fuzzing | verifier | P1 | Open | QV-11 §7.2 (owner role: T-141). |

### E08 — `packages/cli` (P3)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-161 CLI framework (no heavy deps), config, key file handling, exit codes | cli | P1 | Done | QV-30, S13 (owner role: T-037). Evidence (2026-10-21): argument parser and exit codes (cli NOTES). |
| T-162 `qv group/create`, `qv rules`, steward signing (group key client-side) | cli | P0 | Open | QV-02-REQ-001/002 (owner role: T-098,T-161). |
| T-163 `qv enroll` (invite → keypair → PoP) + key backup confirm | cli | P0 | Open | QV-02-REQ-011 (owner role: T-099). |
| T-164 `qv election create/open/close/tally` for organizers | cli | P0 | Open | QV-03, QV-09 (owner role: T-100). |
| T-165 `qv vote` (encrypt, prove, sign, submit, receipt) | cli | P0 | Partial | QV-05 (owner role: T-101). Evidence (2026-10-21): ballot encrypt and audit exist; submit and receipt do not (cli NOTES). |
| T-166 `qv audit` — Benaloh challenge from CLI | cli | P0 | Partial | QV-16 OQ (v0.5) (owner role: T-102). Evidence (2026-10-21): ballot audit exists under that name; qv audit not. |
| T-167 `qv verify` wrapping reference verifier; `qv receipt check` | cli | P0 | Partial | S1, QV-18 (owner role: T-143). Evidence (2026-10-21): qv verify exists; receipt check does not (cli NOTES). |
| T-168 `qv trustee …` subcommands delegating to trustee package | cli | P1 | Open | QV-17 (owner role: T-126). |
| T-169 `qv export/import`, `qv monitor` | cli | P1 | Open | QV-18 §12 (owner role: T-107). |
| T-170 CLI e2e tests (scripted whole election incl. trustees) | cli | P0 | Open | QV-11 L5 (owner role: T-165,T-168). |
| T-171 CLI packaging: signed single-file builds, reproducible | cli | P1 | Open | QV-19, G8 (owner role: T-170). |

### E09 — `packages/web` (P3)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-176 Web architecture: no-framework or minimal, esbuild, strict CSP, Trusted Types, i18n hooks | web | P0 | Done | QV-19, ADR-003/009/010 (owner role: T-115). Evidence (2026-10-21): framework-free SPA, esbuild, CSP meta, SRI (web NOTES). |
| T-177 Browser crypto bundle (shared `crypto`/`protocol`), WebCrypto policy, worker for proofs | web | P0 | Partial | QV-19, S12 (owner role: T-053). Evidence (2026-10-21): crypto shared with web; Worker used for sealing only (web NOTES). |
| T-178 Key management: generate, passphrase-encrypt (Argon2id), backup/export, import, WebAuthn option | web | P0 | Partial | QV-02-REQ-011, QV-19, QV-09 Q6 (owner role: T-037,T-176). Evidence (2026-10-21): QVKEY1 passphrase keystore; WebAuthn not. |
| T-179 Enrollment flow (invite→key→PoP) with backup confirmation | web | P0 | Partial | QV-02, QV-10 (owner role: T-178,T-099). Evidence (2026-10-21): registration with PoP (web NOTES). |
| T-180 Voter flow: read election, ballot UI per method, review, cast, receipt | web | P0 | Partial | QV-10, QV-05 (owner role: T-177,T-101). Evidence (2026-10-21): vote view and receipts; live updates (web NOTES). |
| T-181 Benaloh audit UX ("Test" always offered, equal prominence) incl. Election-ID compare | web | P0 | Open | QV-10 Q-10-2/5, ADR-004 (owner role: T-180,T-102). |
| T-182 Receipt check & inclusion proof UI; checkpoint pin file | web | P0 | Partial | QV-10, QV-18 Q2 (owner role: T-180). Evidence (2026-10-21): receipt standing (web NOTES); inclusion-proof UI not evidenced. |
| T-183 Organizer UI: group, rules templates, roster, election setup, manifest review | web | P0 | Partial | QV-10, QV-02 (owner role: T-176,T-100). Evidence (2026-10-21): organizer create view and publish section (web NOTES). |
| T-184 Trustee-facing status pages (browser trustee deferred) | web | P1 | Open | QV-10, QV-17 (owner role: T-183). |
| T-185 Observer/auditor UI: log browser, results, verify-in-browser | web | P1 | Partial | QV-10 (owner role: T-145). Evidence (2026-10-21): verifier page and live updates (web NOTES). |
| T-186 Results and challenge UI with accessible table equivalents | web | P1 | Partial | QV-13 Q-13-2 (owner role: T-185). Evidence (2026-10-21): results chart with table alternative (web NOTES); challenge UI not. |
| T-187 Guarantee strings & privacy notices from claims register; banner by assurance level | web | P0 | Partial | QV-10 `qv.privacy.review`, G13 (owner role: T-010). Evidence (2026-10-21): guarantee strings in catalog; banner by assurance level not built. |
| T-188 Persistent single-steward warning | web | P1 | Open | QV-02-REQ-004 (owner role: T-183). |
| T-189 Client reproducible build + SRI + signed release manifest + import-map integrity fallback | web | P0 | Partial | ADR-010, QV-19, G8 (owner role: T-176). Evidence (2026-10-21): SRI yes; reproducible build and signed manifest not (web NOTES; claims C-14). |
| T-190 Lint rules: ban innerHTML/eval/localStorage secrets/postMessage * etc. | web | P0 | Open | QV-30, QV-19 (owner role: T-176). |
| T-191 Service-worker/pinned-client option (installable) | web | P2 | Open | ADR-010 (owner role: T-189). |
| T-192 Browser matrix + low-end device performance tests | web | P1 | Open | QV-13 Q-13-3, S12 (owner role: T-180). |
| T-193 Playwright e2e: enroll→vote→audit→verify | web | P0 | Partial | QV-11 §8.2 (owner role: T-182). Evidence (2026-10-21): Playwright e2e suite exists, not part of npm test (web NOTES). |
| T-194 Offline/poor-network behaviour, timeouts (E-NET-TIMEOUT 20 s), retries without double-cast | web | P1 | Open | QV-10 Q-10-7 (owner role: T-180). |
| T-195 Proposal drafting & review UI (link-out discussion, hash-chained history) | web | P2 | Open | QV-02 §4, T-066 (owner role: T-183). |

### E10 — Test vectors and conformance (QV-34) (P1)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-211 Vector file format, MANIFEST, signing, naming (`QV-TST-*`) | test-vectors | P0 | Partial | QV-34, QV-30 OQ (owner role: T-008). Evidence (2026-10-21): test-vectors README, MANIFEST and schema exist; MANIFEST unsigned. |
| T-212 Vector profile P1 (crypto, proofs, DKG, encodings, tally) generated from reference + hand-checked | test-vectors | P0 | Partial | QV-34, G3 (owner role: T-211,T-034). Evidence (2026-10-21): v1 primitives, protocol and elections generated (status candidate). |
| T-213 Independent derivation of selected vectors (Python script / other lib) to avoid self-confirmation | test-vectors | P0 | Partial | QV-34, QV-11 (owner role: T-212). Evidence (2026-10-21): verifier-py independent derivation: 228 of 277 PASS (2026-10-21 run). |
| T-214 Negative vectors (invalid proofs, bad encodings, malicious DKG) | test-vectors | P0 | Partial | QV-34, §6 (owner role: T-212). Evidence (2026-10-21): 23 mutants and negative vectors exist. |
| T-215 Log/board vectors (Merkle, STH, consistency, witness policy) | test-vectors | P0 | Partial | QV-34, QV-18 (owner role: T-080). Evidence (2026-10-21): log-layer-4v set (48 vectors) exists; board-only Merkle vectors not. |
| T-216 Conformance runner CLI for third-party implementers | test-vectors | P1 | Partial | QV-34 (owner role: T-212). Evidence (2026-10-21): vectors check in cli; verifier-py runner; QV-34 section 10.2 adapter missing. |
| T-217 Vector regression CI job + vector change governance | test-vectors | P1 | Partial | G3 (owner role: T-212,T-223). Evidence (2026-10-21): vectors.test.ts zero-diff regeneration test; no separate CI job. |
| T-218 Reference election bundles (small/medium/10k) | test-vectors | P1 | Partial | QV-34, T-150 (owner role: T-150). Evidence (2026-10-21): small-approval-20v exists; 10k set missing. |

### E11 — CI/CD and supply chain (P1)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-223 CI pipeline: typecheck, test, lint on PR (GitHub Actions) | repo / CI | P0 | Partial | QV-30, Q-11-3, G1 (owner role: —). Evidence (2026-10-21): ci.yml: typecheck and test matrix plus non-blocking claims lint; no lint step. |
| T-224 Lockfile pinning, exact versions, direct-dependency budget check (≤ 12 prod deps) | repo / CI | P0 | Partial | S13, QV-30, ADR-003 (owner role: T-223). |
| T-225 SAST + secret scanning + dependency audit; no High/Critical gate | repo / CI | P0 | Open | G2 (owner role: T-223). |
| T-226 Licence check (AGPL compat) + SBOM (CycloneDX/SPDX) | repo / CI | P1 | Partial | G2, QV-25 (owner role: T-223). Evidence (2026-10-21): docs/reports/dependency-licence-snapshot.md exists; SBOM not. |
| T-227 DCO bot / sign-off check | repo / CI | P1 | Open | ADR-011, QV-27 (owner role: T-223). |
| T-228 Coverage floors + mutation testing job (≥90% crypto/protocol/verifier) | repo / CI | P1 | Open | G1, G6, ADR-P11-5 (owner role: T-223). |
| T-229 Fuzz infra (nightly; self-hosted runner), weekly hour target | repo / CI | P1 | Open | G6, Q-11-3 (owner role: T-092). |
| T-230 Reproducible build scripts (client and CLI) + 2-builder verification job | repo / CI | P0 | Open | G8, QV-19-REQ-023 (owner role: T-189). |
| T-231 Release signing (Sigstore/cosign or minisign; 2-of-3), signed release manifest with client hash | repo / CI | P0 | Open | QV-19 §13, QV-27 §7 (owner role: T-012,T-230). |
| T-232 Release process: channels (nightly/rc/stable), changelog template, version axes | repo / CI | P1 | Open | QV-27 §7 (owner role: T-231). |
| T-233 Branch protection, required reviews, signed commits for maintainers | repo / CI | P1 | Open | QV-27 §5.3 (owner role: T-011). |
| T-234 Dependency update policy + vendor audit for `@noble/*` versions | repo / CI | P1 | Open | QV-30, ADR-003 (owner role: T-224). |
| T-235 Spec/doc link checker, traceability checker in CI | repo / CI | P1 | Open | QV-30-REQ-027 (owner role: T-009,T-223). |
| T-236 Release dossier generator (evidence artifacts) | repo / CI | P1 | Open | QV-11 §10 (owner role: T-232). |
| T-237 Banned-phrase / claims lint on UI strings and docs | repo / CI | P1 | Partial | G13, QV-11 G7 (owner role: T-010). Evidence (2026-10-21): scripts/lint-claims.mjs runs in CI, non-blocking. |
| T-238 Provenance/SLSA-style attestations | repo / CI | P2 | Open | QV-19 (owner role: T-231). |

### E12 — Testing and assurance (cross-cutting) (P1–P5)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-241 Test-ID scheme and traceability links format | all | P1 | Open | QV-24, QV-30 OQ (owner role: T-009). |
| T-242 Attack matrix ATK-xxx implementation tracker (§6) with exemptions | all | P0 | Open | G5 (owner role: T-241). |
| T-243 Property-based testing library choice (no/low deps) and INV catalog | all | P1 | Open | QV-11 §7.1 (owner role: T-223). |
| T-244 Randomized 10,000-election S2 harness | all | P0 | Open | S2 (owner role: T-069). |
| T-245 Privacy tests: canary scans for secrets/IPs in logs, DB, exports | all | P0 | Open | G11, S10, QV-11 §8.4 (owner role: T-110). |
| T-246 Chaos suite CH-01…CH-31 | all | P1 | Open | G10, QV-11 §8.6 (owner role: T-090,T-134). |
| T-247 Security test suite: authZ, injection, CSRF/CSP, rate limit | all | P1 | Open | QV-11 §8.3 (owner role: T-117). |
| T-248 Backup/restore/upgrade drills (RTO 1 h, RPO 15 min) | all | P1 | Open | S9, G10 (owner role: T-119,T-250). |
| T-249 Evidence dossier for each milestone | all | P1 | Open | QV-11 §10 (owner role: T-236). |
| T-250 Backup tooling (`VACUUM INTO` or replication) decision and implementation | all | P1 | Open | QV-OQ-12-4 (owner role: T-082). |
| T-251 Literature attack triage process (30 days) | all | P2 | Open | ADR-P11-3 (owner role: T-242). |

### E13 — Security work (P1–P6)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-263 Threat-model review and refresh against frozen QV-16 | all (security) | P0 | Open | QV-07, R5 (owner role: T-008). |
| T-264 SECURITY.md and disclosure policy live; security contact tested | all (security) | P0 | Partial | QV-33, G14 (owner role: —). Evidence (2026-10-21): SECURITY.md has a [PLACEHOLDER] mailbox (claims V-02). |
| T-265 Security advisory template + embargo process | all (security) | P1 | Open | QV-33, G14 (owner role: T-264). |
| T-266 Audit-prep pack for R1 (spec, threat model, ATK list, vectors, questions) | all (security) | P0 | Open | R1, QV-11 §9.3 (owner role: T-008,T-263). |
| T-267 Issue R1 RFP (published criteria, publication terms), select reviewers | all (security) | P0 | Open | R1, Q-11-1 (owner role: T-266, T-342). |
| T-268 R1 review engagement; triage findings into ATK rows and vectors | all (security) | P0 | Open | R1 (owner role: T-267). |
| T-269 Audit-prep pack for R2 (code freeze, build, docs, known issues) | all (security) | P0 | Open | R2 (owner role: M4). |
| T-270 R2 implementation audit; fix, R8 re-test | all (security) | P0 | Open | R2, R8, G9 (owner role: T-269). |
| T-271 R3 web/server pentest + annual repeat | all (security) | P1 | Open | R3 (owner role: T-269). |
| T-272 R4 reproducible build/supply-chain review | all (security) | P1 | Open | R4 (owner role: T-230). |
| T-273 Bug bounty: scope, safe-harbor text, fund, platform (self-run) | all (security) | P1 | Open | R9, Q-11-6, QV-33 (owner role: T-264, T-343). |
| T-274 Election-pause/emergency criteria and runbook | all (security) | P1 | Partial | QV-11 §12, QV-12 (owner role: T-263). Evidence (2026-10-21): pause criteria in QV-11 section 12; runbook not written. |
| T-275 Key-handling review: trustee shares, voter keys, release keys | all (security) | P1 | Open | QV-17, QV-19 (owner role: T-127). |
| T-276 Coercion/receipt-freeness non-claim review of UI and docs | all (security) | P1 | Open | ADR-008, QV-R-03 (owner role: T-187). |
| T-277 Metadata privacy review (timing, IPs, Tor profile, anonymity sets) | all (security) | P1 | Open | QV-26 (owner role: T-120). |
| T-278 Public disclosure of audit reports in full; coverage statement | all (security) | P1 | Open | QV-11 §9.1/9.3 (owner role: T-270). |
| T-279 Machine-checked verifier exploration (EasyCrypt/Coq) | all (security) | P3 | Open | Q-11-4 (owner role: T-142). |

### E14 — Legal, compliance and licensing counsel (P0–P7)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-281 Retain counsel (OSS/privacy/export) | docs (legal) | P0 | Open | QV-25 (owner role: T-340). |
| T-282 AGPL-3.0-or-later + CC BY-SA licence headers/files, doc-snippet dual licence ruling | docs (legal) | P1 | Open | ADR-011, QV-OQ-25-1 (owner role: T-281). |
| T-283 DCO and pseudonymous-contributor policy ruling | docs (legal) | P1 | Open | QV-OQ-25-2 (owner role: T-281). |
| T-284 Export-control (BIS/EAR) assessment and precautionary notice decision | docs (legal) | P1 | Open | QV-OQ-25-4 (owner role: T-281). |
| T-285 GDPR role mapping (group = controller; operator processor), DPIA template for EU groups | docs (legal) | P1 | Open | QV-25, QV-06 §8 (owner role: T-281). |
| T-286 Art. 9 (special category) stance for voting data; privacy notice texts | docs (legal) | P1 | Open | QV-OQ-25-3 (owner role: T-285). |
| T-287 Terms of use / disclaimer (no statutory elections), generic bylaw clause | docs (legal) | P1 | Open | QV-03 §10, QV-02 §9 (owner role: T-281). |
| T-288 Safe-harbor language for bounty and researchers | docs (legal) | P1 | Open | QV-33, Q-11-6 (owner role: T-281). |
| T-289 Fiscal host agreement / legal home selection | docs (legal) | P0 | Open | QV-27 §15, QV-OQ-14-1 (owner role: T-281). |
| T-290 Trademark and name clearance | docs (legal) | P2 | Open | QV-OQ-14-5 (owner role: T-013). |
| T-291 Hosted-operator exposure/jurisdiction legal review (precondition to hosting) | docs (legal) | P2 | Open | QV-14 §7, QV-OQ-14-2, QV-OQ-25-5 (owner role: T-281). |
| T-292 Third-party licence audit (word lists e.g. EFF, noble) | docs (legal) | P2 | Open | QV-25, QV-19 (owner role: T-226). |

### E15 — Operations and self-host packaging (P2–P7)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-293 Self-host package: container image + systemd unit, ≤10 commands, ≤30 min (S8) | server, cli (ops) | P0 | Open | S8, QV-08, QV-12 (owner role: T-100). |
| T-294 Config reference, secure defaults, TLS reverse-proxy guide (Caddy/nginx) | server, cli (ops) | P1 | Open | QV-12 (owner role: T-293). |
| T-295 Onion-service deployment guide and test | server, cli (ops) | P1 | Open | ADR-009, QV-26 (owner role: T-120). |
| T-296 Self-host sysadmin trials n≥5 | server, cli (ops) | P1 | Open | S8 (owner role: T-293). |
| T-297 Operator runbooks: upgrade, backup, restore, incident, key loss | server, cli (ops) | P1 | Open | QV-12, G10 (owner role: T-248). |
| T-298 Observability stack docs (privacy-preserving) | server, cli (ops) | P2 | Open | QV-31 (owner role: T-111). |
| T-299 Operator-exit/export drill by external group | server, cli (ops) | P2 | Open | QV-14 §7 rule (b) (owner role: T-107). |
| T-300 On-call capacity plan (precondition for hosting) | server, cli (ops) | P3 | Open | QV-12 §11 (owner role: —). |
| T-301 Hosted-instance architecture & capped beta (post-1.0) | server, cli (ops) | L | Open | QV-14 stage 3 (owner role: M8). |
| T-302 Upgrade policy & LTS (18 months) | server, cli (ops) | P2 | Open | QV-27 §7.4 (owner role: T-232). |
| T-303 Public witness operator arrangement (project-run + volunteer) | server, cli (ops) | P2 | Open | QV-OQ-4 (QV-07), QV-18 Q7 (owner role: T-086). |

### E16 — Accessibility and localization (P3–P7)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-309 i18n framework (MF1, extraction, pluralization, RTL layout) | web (a11y, i18n) | P0 | Open | QV-13, QV-02 §8 (owner role: T-176). |
| T-310 WCAG 2.2 AA component checklist/lint + axe in CI | web (a11y, i18n) | P0 | Open | QV-13, G12 (owner role: T-176). |
| T-311 Keyboard + screen-reader pass on core voter flow (self-audit) | web (a11y, i18n) | P1 | Open | S11, R8 v0.9 (owner role: T-180). |
| T-312 RTL layout test, Tier-1 locale set, first-community language | web (a11y, i18n) | P1 | Open | QV-13, Q-13-1 (owner role: T-309). |
| T-313 Plain-language copy review & reading-level pass | web (a11y, i18n) | P1 | Open | QV-10, QV-13 (owner role: T-187). |
| T-314 Translation workflow & style guides per locale | web (a11y, i18n) | P2 | Open | QV-13 Q-13-4 (owner role: T-309). |
| T-315 Low-end device + poor network profile tests | web (a11y, i18n) | P1 | Open | Q-13-3 (owner role: T-192). |
| T-316 R5 external WCAG audit + AT user testing | web (a11y, i18n) | P1 | Open | R5, S11 (owner role: T-311). |
| T-317 Accessible trustee recovery sheet formats | web (a11y, i18n) | P2 | Open | Q-13-7 (owner role: T-130). |

### E17 — UX research (P0–P6)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-319 Research plan, consent protocol, no-PII data handling | docs (UX) | P0 | Open | QV-10 §13, QV-00 A1/A2 (owner role: —). |
| T-320 Interview 8–10 OSS foundation/collective organizers (validate A1 target group, pricing hypotheses) | docs (UX) | P0 | Open | QV-00, QV-OQ-14-3 (owner role: T-319). |
| T-321 Paper/clickable prototype tests of voter flow incl. audit step | docs (UX) | P1 | Open | QV-10, S5 (owner role: T-320). |
| T-322 Usability round 1 (n≥10) on v0.5 | docs (UX) | P1 | Open | S5 (owner role: M3). |
| T-323 Comprehension quiz ("who sees my vote", "can I change it") n≥20 | docs (UX) | P1 | Open | S6 (owner role: T-187). |
| T-324 Key-backup comprehension and recovery study (A2) | docs (UX) | P1 | Open | QV-00 A2, QV-04 §6 (owner role: T-178). |
| T-325 Trustee ceremony usability | docs (UX) | P1 | Open | QV-17 (owner role: T-127). |
| T-326 R6 independent usability/privacy-comprehension study | docs (UX) | P2 | Open | R6 (owner role: T-323). |
| T-327 Voter reminder/notification design (no stored contact data) | docs (UX) | P2 | Open | QV-02 §7, Q-10-6 (owner role: T-320). |

### E18 — Documentation (P2–P7)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-329 README, CONTRIBUTING, SECURITY basics | docs | P1 | Done | QV-27 (owner role: —). |
| T-330 Protocol explainer for non-cryptographers + non-claims page | docs | P1 | Partial | ADR-008, QV-00 §5 (owner role: T-010). Evidence (2026-10-21): wiki What-is and Privacy pages exist. |
| T-331 Organizer guide (run an election end to end) | docs | P1 | Partial | QV-10, QV-12 (owner role: M3). Evidence (2026-10-21): wiki/Organizer-Guide.md exists (35 lines). |
| T-332 Voter help content and FAQ (in-app) | docs | P1 | Partial | QV-10 (owner role: T-180). Evidence (2026-10-21): wiki/Voter-Guide.md exists. |
| T-333 Trustee guide + ceremony script | docs | P1 | Partial | T-133 (owner role: T-127). Evidence (2026-10-21): wiki/Trustee-Guide.md exists; ceremony script not. |
| T-334 Auditor/observer guide: independently verify an election | docs | P1 | Partial | S1 (owner role: T-145). Evidence (2026-10-21): wiki/Auditor-and-Verifier-Guide.md exists. |
| T-335 API reference (generated) + implementer guide for third-party clients/verifiers | docs | P1 | Open | QV-09, QV-34 (owner role: T-097). |
| T-336 Architecture docs for contributors | docs | P2 | Partial | QV-08, QV-30 (owner role: M2). Evidence (2026-10-21): wiki/Architecture-Overview.md exists. |
| T-337 Package READMEs per workspace kept current | docs | P2 | Partial | QV-30 (owner role: —). |
| T-338 Policy templates documentation (QV-03 §10) | docs | P2 | Open | QV-02-REQ-003 (owner role: T-048). |
| T-339 Residual-risk disclosures (client delivery problem, compromised devices) | docs | P1 | Partial | ADR-010 (owner role: T-187). Evidence (2026-10-21): wiki Security-Model and Privacy pages; full residual-risk section not. |

### E19 — Funding, community and launch (P0–P7)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-340 Choose fiscal host; open donation channel; transparency ledger | docs (community) | P0 | Open | QV-14 §8, QV-27 §12 (owner role: T-005). |
| T-341 Project site/landing: mission, non-claims, status (L-0 banner) | docs (community) | P1 | Open | QV-00, G13 (owner role: T-010). |
| T-342 Grant strategy & applications for R1/R2 (NLnet-style, civic-tech/privacy funders) | docs (community) | P0 | Open | QV-14 §4, Q-11-1 (owner role: T-340). |
| T-343 Fund bounty pool ($10–25k/yr target) | docs (community) | P2 | Open | R9, QV-14 (owner role: T-342). |
| T-344 Funder-independence rules (cap single funder 40%), disclosure page | docs (community) | P1 | Open | QV-14 §3/§8, QV-27 §12 (owner role: T-340). |
| T-345 Pilot pipeline: recruit friendly dry-run group + 5 pilot groups (≥3 with ≥100 voters) | docs (community) | P1 | Open | S4, QV-02 R10 (owner role: T-320). |
| T-346 Pilot agreement template (experimental software, non-claims, support) | docs (community) | P1 | Open | QV-25, T-287 (owner role: T-287). |
| T-347 Pilot support playbook and feedback loop | docs (community) | P1 | Open | QV-12 (owner role: T-345). |
| T-348 Willingness-to-pay validation with 10 pilot orgs; LOIs | docs (community) | P2 | Open | QV-OQ-14-3 (owner role: T-345). |
| T-349 Support-contract offering definition (stage 3) | docs (community) | P3 | Open | QV-14 §4 (owner role: T-348). |
| T-350 Community channels, code of conduct panel, contributor recognition | docs (community) | P2 | Open | QV-27 §11 (owner role: T-011). |
| T-351 Launch plan v0.9 and 1.0 (announcement, reproducible-build call-out, review report publication) | docs (community) | P2 | Open | QV-27, QV-11 (owner role: M6). |
| T-352 Transparency report format | docs (community) | P3 | Open | QV-14 stage 3 (owner role: —). |
| T-353 Recruit ≥3 external contributors; maintainers beyond founder (steward sunset plan) | docs (community) | P1 | Open | S14, QV-27 §5.4 (owner role: T-014). |

### E20 — Later tracks (post-1.0; research spikes may start earlier)

| Item | Package | Priority | Status | Source ref |
|---|---|---|---|---|
| T-356 Phase 2: blind-token issuance (RFC 9474) design + spec update | later tracks | L | Open | ADR-005, QV-04 §10 (owner role: M8). |
| T-357 Phase 2: unlinkable ballot protocol, nullifier/token redemption, anonymity-set guidance | later tracks | L | Open | QV-16, QV-26 (owner role: T-356). |
| T-358 Phase 2 review (R1-class) and audit | later tracks | L | Open | QV-11 §9.1 (owner role: T-357). |
| T-359 Phase 3 spike: ZK Merkle membership + nullifiers prototype | later tracks | L | Open | ADR-005, QV-21 (owner role: —). |
| T-360 Ranked choice: pairwise matrix tally + Schulze/Ranked Pairs proofs | later tracks | L | Open | ADR-006, QV-20 (owner role: M8). |
| T-361 Weighted votes / delegation | later tracks | L | Open | ADR-006 (owner role: T-360). |
| T-362 Verifiable mixnet for write-ins (research) | later tracks | L | Open | ADR-004, QV-20 (owner role: —). |
| T-363 Federation: witness network, mirror directory, gossip protocol | later tracks | L | Open | QV-32, QV-18 (owner role: T-086). |
| T-364 P2P operation research | later tracks | L | Open | QV-32 (owner role: —). |
| T-365 SSO/OIDC adapter (optional identity mode D) | later tracks | L | Open | QV-04, QV-02 §6 (owner role: M8). |
| T-366 Post-quantum/everlasting privacy research | later tracks | L | Open | ADR-013 (owner role: —). |
| T-367 Mobile app wrappers | later tracks | L | Open | QV-02 §6 (owner role: M8). |
| T-368 Dogfood governance votes with QuietVote | later tracks | L | Open | QV-27 §15 (owner role: M7). |

## 6. Next actions in order

1. N-01 (typecheck), then N-07 (claims register) and N-03 (verifier NOTES) before any release-facing claim.
2. Owner decisions D-84 (section G) and D-85 to D-91 (section H) before the QV-16 freeze (T-008).
3. QV-35 gaps (N-44) once N-17 is decided.
4. Regenerate this list when BACKLOG changes; keep T-IDs stable.

