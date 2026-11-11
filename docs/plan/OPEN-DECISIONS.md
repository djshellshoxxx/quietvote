# QuietVote — Open Owner Decisions

**Date:** 2026-10-21 · **Parent:** [ROADMAP](ROADMAP.md) · **Source:** open-question tables in QV-02, 03, 04, 05, 07, 08, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 24, 25, 26, 27 and the decision log (ADR-001…013 are *provisional* until owner review).
**Deadline milestones** refer to ROADMAP §3 (M0 specs approved 2026-12, M1 protocol freeze 2027-03, M2 board/server alpha, M3 v0.5 alpha, M4 verifier/attacks, M5 audit-ready, M6 v0.9 pilot, M8 1.0). "Recommended default" is the spec author's proposal; the owner may accept with one word ("accept") or override. Record outcomes in the decision log as ADRs.

## A. Gate decisions (do first)

### Consolidation holds — 2026-10-30

- **Registration (B3-01): blocked pending protocol review, explicitly retained by
  the owner on 2026-10-30.** QV-09 §3.3 / schema sends raw `invite_code` and signs
  `(election_id, pk)`; QV-19 §6.1 hashes the token before sending and signs
  `(ID, SHA-256(TOKEN), pubkey)`, while QV-04-REQ-005 also mentions a label. No
  acceptance-set or authority-rule change is approved. Specify the exact wire
  bytes, storage hash, signature framing and label treatment before unblocking.
- **Passphrase portability (B3-25):** web generated-word normalization and CLI
  raw-NFKC behavior differ. No canonicalization change is adopted in this
  consolidation. The CLI documents exact-spelling requirements; review and
  version any eventual shared normalization policy with legacy key fixtures.
- Existing cryptographic/verifier errata, D-84/D-87 and review gates remain open;
  a passing subset of tests does not resolve them.

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-01 | Accept/modify baseline ADR-001…013 (stance, self-host, stack, ristretto255+ElGamal+CDS, phased identity, methods, board, non-claims, transport, client trust, AGPL, no token, PQ stance) | decision-log | Accept all as written; revisit ADR-004 after R1 | M0 |
| D-02 | Adopt numeric success gates S1–S14 (ADR-P00-2) | QV-00 | Accept | M0 |
| D-03 | First target group = OSS foundations / online collectives (ADR-P00-1); note QV-10 Q-10-1 suggests housing co-op | QV-00, QV-10 | OSS foundations; UX copy must remain readable for smartphone-only non-technical members; validate via interviews (T-320) | M0 |
| D-04 | Adopt assurance ladder L-0…L-3 and G1–G14 (ADR-P11-1…5) incl. second verifier before Beta | QV-11 | Accept | M0 |
| D-05 | MVP boundary: yes/no, single, approval, k-of-n; Phase 1 identity; no write-ins/ranked/weighted | QV-02 §6, ADR-005/006 | Accept | M0 |
| D-06 | Withdrawal unsupported; revoting + blank only (ADR-P02-1); pull-based notifications, no stored contact data (ADR-P02-2) | QV-02 | Accept | M0 |

## B. Protocol and cryptography (by M0/M1)

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-10 | DKG construction (Pedersen/Feldman + Schnorr PoK + complaints vs FROST-style/Gennaro) | QV-07 OQ-2, QV-16 OQ-1 | Feldman + commit-reveal with PoK (ADR-P16-2); revisit at R1 | M0 |
| D-11 | `enc_share` mechanism: own ECIES vs `age` | QV-17 Q1/Q2 | Own ECIES with domain separation; `age` only for local bundles | M0 |
| D-12 | Argon2id availability / fallback and parameters | QV-07 OQ-5, QV-19 | scrypt N=2^17 until confirmed; Argon2id m=64 MiB, t=3, p=1 (floor 19 MiB/t=2) | M1 |
| D-13 | Strict Ed25519 only (no ZIP-215) for voter keys | QV-16 OQ-5 | Strict only | M1 |
| D-14 | Tracking code length and display (20 base32 + 2 checksum vs 130-bit) | QV-10, QV-16 OQ-6 | 20 base32 + 2 check for display; full hash retained | M1 |
| D-15 | Weight in leaf now? Per-contest weights? | QV-04, QV-16 | Constant weight 1 carried; weights Phase 2 | M1 |
| D-16 | Aggregation performed by "anyone" vs trustees | QV-04/QV-16 | Anyone; trustees sign what they decrypt | M1 |
| D-17 | Minimum aggregated ballots for decryption (ATK-035) and `min_counted_ballots` | QV-11 Q-11-2, QV-06 | ≥2 for oracle control; default 5 for disclosure | M1 |
| D-18 | Spoiled-ballot authentication (unsigned with anti-spam token) | QV-10 Q-10-3 | Unsigned + eligibility-bound anti-spam token | M1 |
| D-19 | Hedged nonce labels for DKG PoK/complaint proofs | QV-17 OQ-7 | Add in next revision | M1 |
| D-20 | Tie-break beacon (drand quicknet vs fail) | QV-20 OQ-4 | Disabled in v1; `fail` | M1 |
| D-21 | `ballot` header exposes author KeyId in Phase 1 | QV-16 Q1 | Yes for Phase 1; token-based author in Phase 2 | M1 |
| D-22 | Per-election vs per-group voter keys | QV-19 OQ | Per-election default | M1 |
| D-23 | Roll key list published in log | QV-04 Q | Publish keys | M1 |
| D-24 | Phase 2 safe re-issuance; ring tag base; threshold-split registrar | QV-04 | Unsupported / prototype+review / out of scope | Phase 2 |

## C. Governance and policy (M0–M2)

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-30 | `maxExtension`, `stalledMax` bounds | QV-07 OQ-8 | 7 days, 30 days | M2 |
| D-31 | Steward key mandatory k-of-m for >500 voters | QV-07 OQ-6 | Recommend, don't require | M2 |
| D-32 | Challenge attribution to roll keys; anonymous challenges | QV-03 | Attributed in MVP; anonymous Phase 2 | M2 |
| D-33 | Sortition when roll <15 | QV-03 | Fall back to named arbiters + warning | M2 |
| D-34 | Real-name vs pseudonym display | QV-10 Q-10-4 | Per group, announced at join | M2 |
| D-35 | `audit_window_days` default | QV-17 Q7 | 30 | M2 |
| D-36 | Mandatory air-gap above size; organization-as-trustee allowed | QV-17 Q5/Q6 | Recommend only; allowed with disclosure | M2 |
| D-37 | Roll label visibility default | QV-02 §12 | Labels visible to members only; keys public | M1 |
| D-38 | Maximum supported group size (guarantee) | QV-02 §12 | 2,000 voters | M1 |
| D-39 | Attachments to proposals | QV-02 §12 | No; link out with hash | M1 |
| D-40 | Operator-side mapping of pseudonymous keys | QV-26-OQ-1 | Operator never holds mapping; group admins do | M1 |

## D. Architecture and operations (M1–M3)

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-45 | Primary Node line (22 vs 24) | QV-08 | Develop on 24 LTS, keep 22 supported | M1 |
| D-46 | Board as separate process vs same | QV-01/QV-08 | Same process in MVP; protocol allows separate mirrors | M1 |
| D-47 | Witness protocol (C2SP tlog-witness/checkpoint) and `mmd` | QV-08, QV-18 | Adopt C2SP signed-note if compatible; mmd 60 s | M2 |
| D-48 | Witness posture: hooks + volunteer witness; project-operated default witness | QV-07 OQ-4, QV-18 Q7 | Hooks + one volunteer; no operated default until funded | M3 |
| D-49 | CI platform and fuzz infra | QV-11 Q-11-3 | GitHub Actions + one self-hosted fuzz runner | M1 |
| D-50 | Independent verifier language | QV-07 OQ-9 | Python (readability), differential use | M1 |
| D-51 | Continuous replication tool | QV-12 OQ-4 | Evaluate Litestream-style vs `VACUUM INTO` cron | M2 |
| D-52 | Alternate submission path under operator censorship | QV-07 OQ-1 | Mirrors forward signed ballots | M3 |
| D-53 | `Idempotency-Key`, link read-key rotation, passkeys for organizers | QV-09 Q6–Q8 | Use as specified; rotation 24 h; client-side only | M2 |
| D-54 | Optional OpenTimestamps anchoring; ML-DSA cosignatures dependency | QV-07 OQ-7, QV-18 Q4 | Optional/off; verify-only build flag | M4 |
| D-55 | Time-zone display; browser matrix; Trusted Types gaps | QV-08, QV-19 | UTC + IANA label; matrix after tests; lint+CSP fallback | M2 |
| D-56 | Release key quorum | QV-12 OQ-1, QV-19 | 2-of-3 maintainers | Before 1.0 (decide M2) |
| D-57 | In-flight election migration | QV-18 Q5 | Not supported; export and restart | M2 |

## E. Process, UX, accessibility (M1–M3)

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-60 | Test-ID scheme, evidence location, YAML vs JSON links | QV-24 | `QV-TST-<AREA>-<nnn>`; `docs/reviews/`; JSON natively | M1 |
| D-61 | Do "Should" requirements gate releases | QV-24 | No gate; reported | M2 |
| D-62 | Mutation thresholds gate vs report | QV-24 | Report-only except crypto packages | M2 |
| D-63 | Benaloh "Test" visibility | QV-10 Q-10-2 | Always offered, equal prominence | M1 |
| D-64 | First community languages; formal/informal register | QV-13 | Ship Tier-1 set + first community language | M1 |
| D-65 | MF1 vs MF2; passphrase wordlist (EFF short) | QV-13, QV-19 | MF1; EFF short list with attribution | M2 |
| D-66 | Reference low-end device | QV-13 | Moto G-class + older iPhone SE | M2 |
| D-67 | Reminders by email (opt-in) | QV-10 Q-10-6 | Opt-in, minimal content | M2 |
| D-68 | Network timeout | QV-10 Q-10-7 | 20 s | M2 |

## F. Funding, legal, community (M0–M3, some earlier than code)

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-70 | Legal home / fiscal host | QV-14 OQ-14-1, QV-27 | Existing fiscal host; no own entity yet | **M0** |
| D-71 | Reviewers and funding for R1/R2 | QV-11 Q-11-1 | RFP + grants; see budget | **M0** (start) / M1 (select) |
| D-72 | Bug bounty timing and platform | QV-11 Q-11-6, QV-27 | Hall of fame first; self-run bounty when funded (Beta) | M5 |
| D-73 | Bounty/safe-harbor text | QV-33 | Counsel-reviewed | M5 |
| D-74 | Licence: dual-licensing doc snippets; pseudonymous DCO | QV-25 OQ-1/2 | AGPL OR CC BY-SA for snippets; accept known-by-name pseudonyms per counsel | M1 |
| D-75 | BIS export notification | QV-25 OQ-4 | Precautionary notice if counsel advises | Before first release |
| D-76 | Art. 9 treatment of voting data | QV-25 OQ-3 | Treat as special-category | M3 |
| D-77 | Trademark/fork policy | QV-14 OQ-5, QV-27 | Forks permitted under different name | M2 |
| D-78 | Hosted jurisdiction; crypto payments | QV-14 OQ-2/4, QV-25 OQ-5 | Privacy-protective jurisdiction; payment method only, no token | Pre-hosting (post-M8) |
| D-79 | Willingness to pay validation (10 orgs) | QV-14 OQ-3 | Interviews + LOIs during pilot | M6 |
| D-80 | Release cadence; LTS length; conduct covenant; donor threshold | QV-27 | 8 weeks; 18 months; Covenant 2.1 + neutrality; USD 500/yr | M2 / 1.0 |
| D-81 | Dogfood governance votes | QV-27 | Optional after audit | M7 |
| D-82 | Machine-checked verification | QV-11 Q-11-4 | Could; not blocking | 2027 |
| D-83 | Anonymity-set estimator, cover traffic, default D | QV-26 | Conservative counter only; no cover traffic; 10 min | Phase 2 |

## G. [Added 2026-10-21] Spec–implementation reconciliation

Entries added by the consistency pass in [CONSISTENCY-REPORT](CONSISTENCY-REPORT.md) (rows 19–20). QV-08 and QV-09 spec files were not edited.

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-84 | **Organizer/admin request authentication: QV-08 signed requests (`Authorization: QV-Sig`, implemented in `packages/server`) vs QV-09 challenge/session bearer (`/auth/challenge`, `/auth/session`, `Bearer qvs_…`, specified in QV-09 §3.2, REQ-006; still called by `packages/web`).** | QV-08 §7 (REQ-019, QV-ADR-P08-4) vs QV-09 §3.2 (REQ-005/006, QV-ADR-P09-2); CONSISTENCY-REPORT row 20 | **QV-08 signed requests.** Already implemented and negative-tested; no server session store, token rotation or revocation to get wrong; no bearer to leak; ±120 s window plus nonce cache bounds replay; audience binding is kept in the signed message. QV-09 §3.2 and REQ-006 to be rewritten to the signed-request form, and `packages/web` auth client moved to match, once accepted. **Decided 2026-11-04 (QV-ADR-027 N-20): QV-08 signed requests; QV-09 §3.2/REQ-005/006 rewritten, web bearer code removed.** | **M1** (before the QV-09 freeze); needed before any organizer UI is tested end to end |

## H. [Added 2026-10-21 by the docs pass] Conflicts found in NOTES, errata and specs

Each row is an owner decision that the TODO list ([TODO](TODO.md), N-items in brackets) cannot close. "Recommended default" is the proposal; the owner accepts or overrides as in sections A–G.

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-85 | Dependency rule D1: allow the single edge `cli -> verifier`, or extend `qv-verify` so `cli` does not import the verifier library [N-11] | CONSISTENCY-REPORT row 19; `packages/cli/NOTES.md` | Amend D1 to allow `cli -> verifier`; D5 (verifier never imports cli) still protects verifier independence | M1 |
| D-86 | Node engine floor: `package.json` says `>=22.18`, QV-ADR-014 says `>=22.16` [N-02] | `package.json`; decision-log QV-ADR-014 | Use `>=22.18` (the value enforced at install) and amend QV-ADR-014 to match, unless the owner objects | M1 |
| D-87 | Control-entry record shape and signature scope (`pause`, `resume`, `invalidate`, `security-notice`, witness waiver, extension); verifier and server disagree on scope [N-12] | protocol NOTES X-31, X-33; server NOTES; QV-ADR-022 | Keep the verifier's reading (closed schema `{body:{proto,type:"control",action,reason?}}`, co-signed under the manifest hash) and make the server match | M1 |
| D-88 | Trustee spoil mode (`spoil_trustee_decrypt`, QV-ADR-020) enabled in suite v1? [N-14] | decision-log QV-ADR-020; protocol X-14, X-19; QV-35-REQ-012 | Off in suite v1 (the ADR's own default); the trustee code stays behind the manifest flag | M1 |
| D-89 | Tracking-code alphabet (errata E-001): Crockford base32 for display, RFC 4648 lowercase for log origin, or one alphabet [N-15] | errata E-001; QV-16 §5.12.1 | Two named alphabets, one per use, both written into QV-16; owner to confirm | M1 |
| D-90 | Rate-limit header names (errata E-002): keep early draft names or move to the current IETF draft names when final [N-16] | errata E-002; QV-09 | Keep current names until the IETF draft is final; then move **Decided 2026-11-04 (QV-ADR-027 N-16): keep the early-draft names; when the draft is an RFC, emit old and new names for one release.** | M2 |
| D-91 | Automatic open and close scheduler on the server (no closer key in the manifest) [N-21] | `packages/server/NOTES.md` "Time" | Not in MVP; coordinator posts `election_open` and `election_close` manually **Decided 2026-11-04 (QV-ADR-027 N-21): not in MVP; coordinator posts open/close manually. Post-MVP: the `closer` key of docs/18-bulletin-board-transparency.md:222 (option B).** | M2 |

## I. [Added 2026-11-04] Verifier report semantics (strict differential)

Source: `node scripts/compare-verifiers.ts --json` (TS `verifyElection` vs `verifier-py`), the 2026-10-30 receipt
`docs/reports/consolidation-cross-verifiers-2026-10-30.json` (27/27 verdicts agree, 12 report differences) and
QV-ERR-PY-006/007/015. The handoff called all 12 owner-gated. Re-reading the specs settles 9 of them. The vectors
fix only `verdict`, `failed_checks` and `codes` for these mutants, so they settle none of the 12 by themselves.

**Settled and fixed, 2026-11-04 (for review, not owner-gated):**

* 8 `mutations/open-*` cases. Python reported `chk.manifest.sig` and `chk.keys.trustees` as `not_run` although both
  had run to completion before the C3 binding check (App. C C1/C2 come before C3). QV-35-REQ-005
  (docs/35-second-verifier.md:49) makes only "every *later* check `not_run`". QV-ERR-PY-015 records "a failed binding
  stops all later checks". Python's `_stop` now leaves completed checks alone. On the same path TS reported
  `chk.encoding.canonical: pass` without having examined any voter envelope. QV-34 §9.1 #13 (docs/34:318) defines that
  check as "All objects canonically encoded", and QV-35-REQ-003 (docs/35:47) says "no check reported as `pass` without
  its evidence". TS now sets the check to `pass` only after C4 has examined every envelope. A record that failed earlier
  still shows `fail`.
* `mutations/unknown-field-in-tally`. Python examined the rejected tally anyway and reported aggregate, decrypt and rules
  as `pass`. QV-16 §5.5 item 7 (docs/16:211) says "Schemas are **closed**: unknown fields are an error (`E_SCHEMA`),
  eliminating malleability through junk fields". App. C step 1 (docs/16:1111) says "reject on `E_PARSE/E_SCHEMA/E_VERSION`",
  and §5.20 (docs/16:780, 785) classes `E_SCHEMA` as R/L, "verifier does not count". Python now rejects the tally, so
  aggregate, decrypt and rules are `not_run`, which matches TS. The QV-ERR-PY-007 reading "the rest of the tally is still
  verified" is withdrawn. The vector never required it, because its `failed_checks` is satisfied either way.

Result: the differential has 3 differences (was 12). The three remaining cases need the owner decisions below.
`compare-verifiers.ts` is unchanged and still exits 1.

| ID | Decision | Source | Recommended default | Deadline |
|---|---|---|---|---|
| D-92 | **Does a failed coordinator manifest signature stop the pipeline when the anchor matches?** Case `mutations/manifest-signature-removed`. TS stops at `E_MANIFEST_SIG`: the 9 later checks are `not_run`, counts are 0, there is no `ctx_prefix` and no results. Python goes on: those checks are `pass`, counts are 4/1/4, and `ctx_prefix` and results are present. Options: (A) stop, as TS does; (B) continue, as Python does. | QV-35-REQ-005 (docs/35:49) names only the anchor mismatch as a stop; App. C Inputs (docs/16:1108) say the out-of-band `manifest_hash` is the trust root; C8 (docs/16:1146) says "Always list: number of cast, spoiled, counted … `ctx` prefix" | **(B) continue.** The anchor already authenticates the manifest body and the coordinator keys inside it. The signature failure stays fatal. Then change TS `verify.ts` (the `sigsOk` early return) and add a QV-35-REQ-005 sentence. | M1 freeze |
| D-93 | **Does `chk.result.rules` run when `chk.tally.decrypt` fails only because a published `T` differs from the recovered `T_o`?** Case `mutations/count-altered`. Shares and combination verify and every `T_o` is recovered. TS: rules `not_run`, because rules run only after decrypt `pass`. Python: rules evaluated on the recovered `T_o`, `pass`. Options: (A) `not_run`; (B) run on the recovered counts. | App. C step 21 (docs/16:1143) has no condition; QV-35-REQ-005 makes rules `not_run` only for an *unconfirmed aggregate*; QV-34 §9.3 (docs/34:345) "Result flipped … `chk.result.rules` or `chk.tally.decrypt`" leaves it open | **(B)** whenever every `T_o` was recovered with valid proofs; `not_run` when they could not be recovered (`E_TALLY_INSUFFICIENT`, BSGS failure, below floor). Write this into QV-35-REQ-005 and QV-16 App. C step 21. | M1 freeze |
| D-94 | **What does the report's `results` member contain after a failure?** Cases `result-flipped`, `count-altered`, `manifest-signature-removed`. TS emits `results` only when the published results equal the exact evaluation and rules `pass`. Python emits its own evaluation whenever it computed one, even when that evaluation contradicts the published record (`result-flipped`). Options: (A) only verified published results; (B) the verifier's recomputation; (C) (A) under `results`, plus a separately named `recomputed_results` that is not compared until it is specified. | QV-35-REQ-003 (docs/35:47) lists "results" without defining them; the canary `expected-report.json` (FAIL) has no `results`; no FAIL vector pins them | **(C).** A UI must never show a rejected record's outcome as "the result". An auditor still benefits from seeing the recomputation. Python then moves its value to `recomputed_results`. | M1 freeze |
| D-95 | **PY-01: zero-digest spoil when the manifest does not enable trustee mode.** QV-16 §5.12.2 (docs/16:599) says mode (c) is "valid only if the manifest enables it". Neither verifier enforces this at the ballot level: TS checks the flag only for `tally.spoiled` entries in `trustees` mode, and Python adds a note. Python rejects every manifest that carries `spoil_trustee_decrypt`, including `false`, with a generic `E_SCHEMA`. QV-35-REQ-012 asks for a *named* error. Not defined: the code, the check, the class, and whether the code still enters the spoiled set (REQ-015 covers "every authenticated spoil"). Options: (A) ALARM `E_SPOIL_MISMATCH` on `chk.benaloh.spoiled`, code still spoiled (like the P4 bad-reveal rule); (B) L `E_SCHEMA` on `chk.ballots.valid` + `chk.encoding.canonical`, code not spoiled; (C) treat it as a private audit (current behaviour). | QV-16 §5.12.2, QV-16-REQ-025, QV-ADR-020(4), QV-35-REQ-012, D-88 | **(A)** in both verifiers, plus a named manifest error for the unsupported flag in Python (accept `false`). Add a mutation vector. Not implemented: the code and class need this decision. | M1 |
| D-96 | **PY-02: INCOMPLETE verdict.** QV-16 App. C (docs/16:1108) says "Output: PASS or FAIL". TS also returns `INCOMPLETE` (protocol NOTES X-11): nothing fatal, but no tally was verified. Python returns FAIL (`E_SCHEMA`, 0 tally records). No case in the strict corpus reaches this (27/27 verdicts agree). Options: (A) add INCOMPLETE to QV-16 C8 and QV-34, then implement it in Python; (B) drop INCOMPLETE from TS. | QV-16 App. C/C8; P1/TSV-05 (docs/audit/HANDOFF.md:57, option (a) recommends INCOMPLETE) | **(A)**, decided together with P1/TSV-05. Python is not changed until the spec defines the state. | M1 |
