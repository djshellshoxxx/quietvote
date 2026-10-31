# QuietVote — Next 14 Days

**Window:** 2026-10-22 → 2026-11-04 · **Goal:** get from "wide drafts, thin code" to a reviewable, testable foundation: owner decisions recorded, CI live, existing code tested, funding and review tracks started. Task IDs refer to [BACKLOG](BACKLOG.md); decision IDs to [OPEN-DECISIONS](OPEN-DECISIONS.md).

Work in this order; items on the same day can run in parallel.

| Day | Order | Work | Owner | Output / done when | Refs |
|---|---|---|---|---|---|
| 1 (Oct 22) | 1 | **Owner review session 1:** read ROADMAP + OPEN-DECISIONS section A; accept/override D-01…D-06 | PO | ADR-001…013 marked Accepted in decision log; D-01…D-06 recorded | T-004, D-01–06 |
| 1 | 2 | Commit planning docs; set up issue tracker labels (`phase`, `epic`, `priority`, `size`) and import BACKLOG top-priority items | Steward | Tracker mirrors P0 tasks | — |
| 2–3 | 3 | **CI skeleton:** GitHub Actions running `npm run check` on PR; exact-pin check; DCO check | Eng-R | Green CI badge; required check on `main` | T-223, T-224, T-227, T-233 |
| 2–3 | 4 | **Tests for existing board code:** Merkle (odd sizes, RFC 9162 known-answers, tamper), checkpoint round-trip, entry parsing, bytes helpers | QA / Eng-S | `packages/board/test/*` passing; gaps filed | T-080 |
| 3 | 5 | Expand crypto tests: RFC 8032 Ed25519 vectors, non-canonical/small-order rejection | QA | `packages/crypto/test` passing | T-024 |
| 4 | 6 | **Fiscal host and funding:** shortlist 3 hosts, send enquiries; draft one-page funding brief for R1/R2 ($130k–$280k package) | Steward | Enquiries sent; brief drafted | T-340, T-342, D-70, D-71 |
| 4–5 | 7 | **Protocol-freeze worklist:** list every unspecified byte-level item in QV-16 (encodings, labels, registry); resolve D-10…D-23 defaults in a single ADR batch | Proto | `ADR-P16` batch drafted; QV-16 delta list | T-008, D-10–D-23 |
| 5 | 8 | **Owner review session 2:** decide Sections B, C defaults (accept en bloc unless objection) | PO | Decisions recorded | T-005 |
| 5–6 | 9 | Start `crypto` package: ristretto255 wrapper with strict decode; transcript-hash module with label registry (behind tests) | Eng-C | PR open with unit tests + negative tests | T-025, T-026 |
| 6 | 10 | Spec consistency sweep (IDs, error codes, entry types vs `board/src/entry.ts`, size caps) — file mismatches | Docs / Eng-S | List of mismatches; fix PRs for board↔QV-18 drift | T-007, T-079 |
| 6–7 | 11 | **Recruit second-verifier author:** shortlist candidates (academic e-voting groups, independent cryptographers), send brief; confirm language default (Python) | PO | ≥3 outreach emails; D-50 decided | T-147, D-50 |
| 7 | 12 | **Counsel shortlist** (OSS/privacy/export); send engagement request | PO | Quote requested from ≥2 firms/clinics | T-281 |
| 7–8 | 13 | UX research plan and interview script; recruit 8–10 OSS-foundation organizers | UX | Plan signed off; ≥4 interviews scheduled | T-319, T-320 |
| 8 | 14 | Vector format + MANIFEST design (QV-34), create `test-vectors/` structure with first board Merkle vectors | QA | `test-vectors/` has format doc + first vectors passing in CI | T-211, T-215 |
| 8–9 | 15 | Claims register v0 + banned-phrase list; add check script for docs | Comms | `docs/claims-register` started; lint runs in CI (non-blocking) | T-010, T-237 |
| 9 | 16 | **SECURITY.md** check: working security contact, advisory template; confirm disclosure address mailbox tested | Sec | Test report sent and acknowledged | T-264, T-265 |
| 9–10 | 17 | Protocol: finalise `GroupRules` + manifest schema skeleton in `protocol` with canonical encoding; first round-trip tests | Eng-C | `protocol` exports types + encode/decode + tests | T-046, T-048, T-049 |
| 10 | 18 | **Spec approval pass 1:** move QV-00, QV-02, QV-03, QV-05 to Review; owner comments | PO | Review notes in decision log | T-006 |
| 11 | 19 | Pilot-group long list (≥15 OSS foundations/collectives) and contact plan; draft one-page pitch with non-claims | Comms | Long list in tracker; pitch reviewed by Sec for claims | T-345, T-341 |
| 11–12 | 20 | Draft R1 audit-prep outline + RFP skeleton (scope, publication terms, evaluation criteria) | Proto / Sec | RFP draft v0 | T-266, T-267 |
| 12 | 21 | Dependency and licence snapshot: list prod deps, confirm ≤12 budget plan, SBOM tooling trial | Eng-R | `deps` report committed; SBOM job spec'd | T-224, T-226 |
| 13 | 22 | Estimate recalibration: record actual velocity from days 1–12; re-baseline ROADMAP effort ranges and P0 duration | Program planner | ROADMAP "calibration" note and revised M0/M1 dates | ROADMAP |
| 14 (Nov 4) | 23 | **Review checkpoint:** demo (CI green, board+crypto tests, decisions ADR batch), top-5 risk review, set the next 14 days | All | Next-steps v2; risk register re-scored | R03, R04, R25 |

## Exit criteria for the 14 days

- [ ] ADR-001…013 owner decision recorded; Sections A–C of OPEN-DECISIONS closed or explicitly deferred.
- [ ] CI runs typecheck + tests on every PR; branch protection on.
- [ ] Existing `board` and `crypto` code covered by meaningful unit tests (including negative cases).
- [ ] Fiscal-host enquiries and funding brief out; counsel and second-verifier outreach started.
- [ ] QV-16 freeze worklist written; D-10…D-23 decided.
- [ ] First vectors committed under `test-vectors/`.
- [ ] At least 4 organizer interviews scheduled.

## Rules for these 14 days

1. No new feature packages (server/web) until CI and tests for existing code are green.
2. Anything that would make a public claim goes through the claims register first.
3. Do not start Phase 2 or federation work; park ideas in BACKLOG E20.
4. If a task slips more than 2 days, drop the lowest-ranked item, not the tests.
