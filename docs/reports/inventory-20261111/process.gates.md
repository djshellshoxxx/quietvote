# Process and assurance gates (snapshot the ab84f16 snapshot, inspected 2026-11-11)

Status vocabulary: met (evidence path) / partly / not met / external. "Engineering alone" = closable by repository changes without third parties or owner decisions.

| Gate | What it requires (citation) | Status today | What would close it | Eng alone? |
|---|---|---|---|---|
| G1 Green CI | L0-L5 pass, no quarantine >14 d, coverage floors (docs/11:350) | partly: `.github/workflows/ci.yml` green-gated tests; no lint/fuzz/coverage/quarantine list | Add lint, coverage report+floors, quarantine tracking | yes (floors need care) |
| G2 Security hygiene | SAST/DAST/dep/secret scans, SBOM, licence check, dep budget (docs/11:351) | partly: `npm audit` and `scripts/lockfile-lint.mjs` in ci.yml; `scripts/licence-snapshot.mjs` report-only; no secret scan, SBOM, SAST | Secret scan, SBOM, licence fail-on-incompatible, boundary check | yes |
| G3 Vector conformance | 100% QV-34 profile vectors; MANIFEST signature valid (docs/11:352) | partly: `npm run vectors:check` in ci.yml; `test-vectors/MANIFEST.json` says "unsigned (release job signs)" | Signature needs release key | no (signing external) |
| G4 Independent implementation | Independent verifier passes 100% and verifies reference bundles (docs/11:353) | partly: `verifier-py/` runs in ci.yml; strict comparator `scripts/compare-verifiers.ts` exits 1 (held D-92..D-96); not written by non-core party | Resolve D-92..D-96; independent author | no |
| G5 Attack matrix | docs/11 section 6 matrix 100% implemented or exempted (docs/11:354) | partly: `packages/protocol/test/attacks.test.ts`; no matrix tracking | Matrix-to-test map; owner-signed exemptions | partly |
| G6 Mutation and fuzz | Mutation thresholds, 0 open fuzz crashes, weekly hours (docs/11:355) | not met: no Stryker, no fuzz harness | Build harnesses and runner (self-hosted runner per D-49) | partly |
| G7 UX and copy | Usability thresholds, guarantee strings approved, banned-phrase lint (docs/11:356) | partly: `scripts/lint-claims.mjs` non-blocking; usability tests not done | Make lint blocking; usability study | no |
| G8 Reproducible build and signing | Two builders agree, signatures verify, hash in manifest (docs/11:357) | not met: no repro job, no signing | Repro-check job (eng); two builders and keys external | partly |
| G9 Independent review | R1+R2 complete, High/Critical fixed (docs/11:358) | external: only AI-assisted `docs/reports/security-review-2026-10-21.md` (not independent) | Funded external reviewers | no |
| G10 Operational readiness | Backup/restore and upgrade drills, chaos CH-01..31, runbooks (docs/11:359) | not met: no chaos suite or drill records | Chaos suite and drill scripts; runbooks | partly |
| G11 Privacy | Canary scans clean, data inventory matches QV-06, logging tested (docs/11:360) | partly: canary tests in `packages/server/test/b2-fixes.test.ts`; not systematic | Systematic log/metric/backup canary scan | yes |
| G12 Accessibility and i18n | QV-13 release blockers zero; Tier-1 locale gates (docs/11:361) | partly: browser a11y checks in ci.yml; translations unreviewed and unoffered (README.md:73) | Native review and assistive-tech audit | no |
| G13 Claims review | Claims match assurance level; non-claims present (docs/11:362) | partly: `docs/claims/`, `scripts/lint-claims.mjs` (continue-on-error) | Make lint blocking after historical findings resolved (CLAIMS-LINT-HISTORICAL decision) | partly |
| G14 Vulnerability readiness | Policy published, contact tested, advisory template (docs/11:363) | not met: `SECURITY.md` has placeholder contact, key, security.txt; no advisory template | Real contact, PVR enabled and tested (owner) | no (template/validator yes) |
| L-0 Experimental | G1-G3, G8, G11-G14 (docs/11:369) | not met (G3 unsigned, G8, G14 unmet; G1/G2/G11-G13 partly) | See rows above | no |
| L-1 Beta | L-0 + G4, G5, G6, G10 (docs/11:370) | not met | G4-G6, G10 | no |
| L-2 Reviewed | L-1 + G9 (docs/11:371) | not met | External review | no |
| L-3 Hardened | R3-R5, 1 year bounty, 3 real elections (docs/11:372) | not met | Years of external activity | no |
| S1 Independent verification | 100% pilot tallies reproduced; 2 verifier impls, one non-core (docs/00:112) | partly: TS and Python verifiers exist; no pilots; comparator red | Pilots; independent author; D-92..D-96 | no |
| S2 Eligibility/duplicates | 0 counted ineligible/duplicate in 10,000 property elections (docs/00:113) | partly: `packages/protocol/test/property.test.ts`; count not evidenced | Property run at 10,000 elections with logged result | partly |
| S3 Cryptographic review | Independent review, 0 open critical/high (docs/00:114) | external | Reviewers | no |
| S4 Pilot adoption | 5 external groups, 3 with 100+ voters (docs/00:115) | external: none | Pilot groups | no |
| S5 Voter completion | 90% completion, enroll-to-cast times, n>=20 (docs/00:116) | external: no moderated tests | Usability study | no |
| S6 Comprehension | 85% quiz, n>=20 (docs/00:117) | external | Usability study | no |
| S7 Cast-as-intended uptake | 5% pilot ballots audited (docs/00:118) | external (monitor only) | Pilot data | no | <!-- claims-lint-ignore -->
| S8 Self-host effort | Median 30 min, 10 commands, n>=5 trials (docs/00:119) | external: no trials | Sysadmin trials | no |
| S9 Recovery | RTO 1 h, RPO 15 min, export re-verifies (docs/00:120) | not met: no drill record | Drill script plus run (eng); time targets measured | partly |
| S10 Privacy minimisation | 0 IPs/user agents persisted; retention deletion audited (docs/00:121) | partly: design only; no automated audit test found | Automated persistence audit test | yes | <!-- claims-lint-ignore -->
| S11 Accessibility | 0 WCAG 2.2 AA blockers; screen-reader completion (docs/00:122) | external: automated checks are not acceptance (README.md:73) | QV-13 audit | no |
| S12 Performance | Cast to receipt p95 3 s on phone; 5,000-ballot tally in 60 s (docs/00:123) | partly: `docs/reports/performance-baseline-2026-11-04.md`, `packages/protocol/bench`; no phone run, no gate | Bench gate (eng); device run external | partly |
| S13 Dependency hygiene | <=12 direct prod deps, 0 unpinned (docs/00:124) | met today (measured, not gated): 2 third-party prod deps (`@noble/curves`, `@noble/hashes`), `.npmrc` save-exact, `scripts/lockfile-lint.mjs` | Add count gate to boundary/deps check | yes |
| S14 Sustainability | 3 external contributors, funded maintainer-month per quarter (docs/00:125) | external | Community and funding | no |
| QV-27 R-006 Experimental banner | String in CLI, server, UI, README (docs/27:183) | partly: README.md and web UI only | Add to CLI `--version` and server banner (package edits) | yes |
| QV-27 R-007 No stable without audit | Release workflow refuses `stable` without audit artifact (docs/27:184) | not met: no release workflow | Guard script plus workflow | yes (audit itself external) |
| QV-27 R-009 Section 7.3 gate list | 7 gates with evidence on the release (docs/27:111-118, 187) | not met: no checklist generator | Dossier generator | yes |
| QV-27 R-001 Governance files | Seven files present (docs/27:179) | partly: 4 of 7 exist | MAINTAINERS.md, docs/RELEASE-KEYS.md (N-08b), DEPRECATIONS.md | yes |
| QV-27 R-002 Maintainers | 3 maintainers, 2 owners per package (docs/27:180) | not met: one placeholder owner in `.github/CODEOWNERS` | People | no |
| QV-30 R-013 Coverage | Thresholds enforced (docs/30:261) | not met | Coverage report then thresholds | yes |
| QV-30 R-015 Workflow hygiene | Minimal perms, SHA pins, no pull_request_target, ignore-scripts (docs/30:263) | met (`.github/scripts/check-action-pins.mjs` run in ci.yml; `.npmrc`) except no actionlint/pull_request_target check | Add small pull_request_target check | yes |
| QV-30 R-016/017/018 Branch protection | Required checks, reviews, CODEOWNERS, two approvals (docs/30:264-266) | not met/external: admin settings, one CODEOWNER | Owner settings; people | no |
| QV-30 R-019 DCO and Conventional Commits | Sign-off on every commit (docs/30:267) | not met: documented only | DCO/commit-format script and job | yes |
| QV-30 R-022 Secret scanning | PR and nightly, blocks merge (docs/30:270) | not met | In-repo scanner script and job | yes |
| QV-30 R-031 Node/OS matrix | Node 22/24 on Linux, macOS, Windows (docs/30:279) | met (`.github/workflows/ci.yml`; full matrix only main/nightly/label) | none | yes |
| QV-33 R-001 SECURITY.md | Present, placeholders replaced, link-check (docs/33:230) | partly: `SECURITY.md` full of placeholders | Link checker (eng); real contact (owner) | partly |
| QV-33 R-002 PVR | Enabled and tested (docs/33:231) | external | Owner enables and tests | no |
| QV-33 R-003 security.txt | RFC 9116, CI validator, Expires >= 30 days (docs/33:232) | not met | Template and validator (eng); real contact (owner) | partly |
| QV-33 R-004 PGP/age key | Fingerprint in three places (docs/33:233) | external | Key generation by humans | no |
| QV-33 R-007 Advisory template | Format validated by script, signed (docs/33:236) | not met | Template and validator; signing external | partly |

## Honest assurance level today (10 lines)

1. By docs/11:369 L-0 ("Experimental") needs G1-G3, G8 and G11-G14 all met; none of that set is fully met.
2. G3 fails on its own text: `test-vectors/MANIFEST.json` carries signature "unsigned (release job signs)".
3. G8 fails: no reproducible-build job, no signing, no release workflow, no release (README.md:69 "No release").
4. G14 fails: `SECURITY.md` still holds placeholder contact, key, security.txt and staging entries.
5. G1, G2, G11, G12, G13 are only partly met (no lint, coverage, fuzz, secret scan, SBOM; claims lint is non-blocking; translations unreviewed).
6. G4 is not met: the second verifier exists but the strict comparison fails by design (held D-92..D-96) and it was not written by an outside party.
7. G9 and all of L-1..L-3 are unreachable now; the only security review on file is AI-assisted, which is not an independent audit.
8. Defensible claim today: pre-L-0 prototype, "Experimental, unaudited, not for real elections", with no assurance level yet attained.
9. Strong evidence that does exist: 8-package suite on a Node 22/24 matrix, frozen vectors checked in CI, a Python verifier, SHA-pinned workflows, lockfile lint, `npm audit`, 2 third-party production dependencies.
10. Most numeric success gates (S1, S3-S9, S11, S14) need pilots, reviewers or users and cannot be closed by engineering alone.
