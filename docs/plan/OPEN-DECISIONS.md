# QuietVote — Open Owner Decisions

**Date:** 2026-10-21 · **Parent:** [ROADMAP](ROADMAP.md) · **Source:** open-question tables in QV-02, 03, 04, 05, 07, 08, 09, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 24, 25, 26, 27 and the decision log (ADR-001…013 are *provisional* until owner review).
**Deadline milestones** refer to ROADMAP §3 (M0 specs approved 2026-12, M1 protocol freeze 2027-03, M2 board/server alpha, M3 v0.5 alpha, M4 verifier/attacks, M5 audit-ready, M6 v0.9 pilot, M8 1.0). "Recommended default" is the spec author's proposal; the owner may accept with one word ("accept") or override. Record outcomes in the decision log as ADRs.

## A. Gate decisions (do first)

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
