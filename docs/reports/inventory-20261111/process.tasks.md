# Bounded decision-free repository tasks (process/assurance/release/legal)

All tasks use Node built-ins and `run:` steps in existing workflows; none needs a third-party GitHub Action (only first-party `actions/checkout` and `actions/setup-node`, SHA-pinned like the existing jobs). None adds a dependency, weakens a gate, or touches vectors/wire formats. Every task ships a node:test file and keeps `check-action-pins` green.

## T1. DCO and commit-format check
- Files: `scripts/check-dco.mjs`, `scripts/check-dco.test.mjs`, job in new `.github/workflows/dco.yml` (PR only, `fetch-depth: 0`, `contents: read`).
- Acceptance: script lists PR commits via `git log base..head`, fails on a missing or non-matching `Signed-off-by:` and on non-Conventional subjects; fixture tests for pass, missing, mismatched author, merge commits.
- Hours: 4.
- No decision needed: CONTRIBUTING.md and docs/30 REQ-019 already mandate it; bot-author exemption is listed as a noted assumption, not a policy change.
- Third-party action: no.
- Closes: QV-25-REQ-003, QV-30-REQ-019.

## T2. Honest empty-state governance files
- Files: `MAINTAINERS.md`, `docs/RELEASE-KEYS.md`, optionally `DEPRECATIONS.md` (same empty-state pattern; DEPRECATIONS.md is not itself named in N-08b, so mention that in the PR).
- Acceptance: each says no maintainers/keys published, unaudited, not for real elections; no fingerprints or names invented; linked from GOVERNANCE.md; `lint-claims.mjs` stays clean. `docs/LICENSE-NOTE.md` is excluded (needs legal review).
- Hours: 2.
- No decision needed: N-08b is approved with the "create honest empty-state files" option.
- Third-party action: no.
- Closes (partly): QV-27-REQ-001; supports QV-27-REQ-015.

## T3. In-repo secret scanner
- Files: `scripts/secret-scan.mjs`, `scripts/secret-scan.test.mjs`, step in ci.yml `typecheck` job plus the existing nightly `schedule` trigger (history scan via `git log -p`).
- Acceptance: regexes for private-key blocks, common token formats, 64-hex key-like literals outside an explicit test-fixture allowlist; seeded fake secret in a fixture fails; repository currently passes without loosening anything.
- Hours: 6.
- No decision needed: spec requires scanning (docs/30 REQ-022); tool choice is "no third-party action", leaving gitleaks as an owner-side addition.
- Third-party action: no.
- Closes: QV-30-REQ-022, part of G2.

## T4. SBOM generator
- Files: `scripts/sbom.mjs`, `scripts/sbom.test.mjs`, CI step printing to `--stdout`.
- Acceptance: CycloneDX JSON from `package-lock.json`; deterministic (run twice, diff empty); includes 8 workspace components and integrity hashes; fails if the lockfile is missing integrity.
- Hours: 4.
- No decision needed: G2 requires an SBOM; no format-of-record decision is implied by emitting an open standard.
- Third-party action: no.
- Closes: G2 part; QV-24-REQ-009 pattern.

## T5. Dependency and import boundary check
- Files: `scripts/check-boundaries.mjs`, test file, ci.yml step in `typecheck`.
- Acceptance: fails if non-crypto src imports `@noble/*`; crypto imports a workspace package; verifier imports server/cli; protocol imports server/web; adds a production-dependency count gate (<=12, S13). The `cli -> verifier` edge (D-85) is reported as informational only. Existing `packages/protocol/bench/tally-bench.ts` `@noble` import is listed in the report as a known violation to fix via a crypto re-export (separate small PR) rather than allowlisted silently.
- Hours: 6.
- No decision needed: only rules already stated in docs/01 section 4 and docs/30 REQ-004 are enforced; D-85 is deliberately excluded.
- Third-party action: no.
- Closes: QV-01-REQ-001/002, QV-30-REQ-004, S13 gate.

## T6. Markdown link and anchor checker
- Files: `scripts/check-links.mjs`, test file, workflow `.github/workflows/links.yml` (runs on docs changes too, since ci.yml skips docs).
- Acceptance: all relative links and `#anchors` in README, root *.md, docs, wiki resolve; no network calls; current breakages listed and fixed or reported.
- Hours: 5.
- No decision needed: purely mechanical; supports QV-33-REQ-001 "CI link-check" and QV-27-REQ-001 "docs-lint cross-links".
- Third-party action: no.
- Closes (partly): QV-33-REQ-001, QV-27-REQ-001, QV-30-REQ-026.

## T7. Coverage report (report-only)
- Files: `scripts/coverage-report.mjs` using `node --test --experimental-test-coverage`, ci.yml step (non-gating) writing a summary to the job log.
- Acceptance: prints per-workspace line/branch percentages and crypto package shortfall against the 100% target; exits 0; no threshold enforced yet.
- Hours: 4.
- No decision needed: report-only adds evidence without setting or loosening thresholds; making it blocking is a later owner step.
- Third-party action: no.
- Closes: groundwork for QV-11-REQ-003, QV-30-REQ-013.

## T8. Requirement ID lint and traceability report (report-only matrix)
- Files: `scripts/trace.mjs`, test file, `docs/reports/traceability.md` and `.json`/`.csv` outputs, ci.yml step.
- Acceptance: parses requirement tables in docs/*.md; fails only on duplicate or malformed `QV-NN-REQ-nnn` definitions (QV-24-REQ-001); otherwise reports Must requirements with and without test references found by scanning tests for IDs; offline; second run is byte-identical.
- Hours: 8.
- No decision needed: follows N-23c's recommended report-only scope (confirm it is approved; blocking Must gate stays out). Docs numbering collisions (two docs each for 17, 18, 19) are reported, not renamed.
- Third-party action: no.
- Closes (partly): QV-24-REQ-001/002/009/012, QV-11-REQ-002 groundwork, QV-30-REQ-027.

## T9. Release checklist/dossier generator and release-notes lint
- Files: `scripts/release-dossier.mjs`, `scripts/lint-release-notes.mjs`, tests, `CHANGES.md` skeleton ("Unreleased", assurance banner stating Experimental, no claims).
- Acceptance: emits docs/11 G1-G14 and docs/27 section 7.3 items as a checklist with status "not evidenced" unless an evidence path exists; refuses to emit label `stable` without an audit-gate artifact path; lints release notes for banned phrases and the required assurance-level banner; exits non-zero on violations; no signing performed.
- Hours: 8.
- No decision needed: gate lists and ladder are specified (D-04 accepted); generator records state, it does not decide any gate.
- Third-party action: no.
- Closes (partly): QV-27-REQ-007/009, QV-11-REQ-013, QV-24-REQ-010 groundwork.

## T10. security.txt template and validator
- Files: `security/security.txt.template` (no invented contact; fields marked as owner-supplied), `scripts/check-security-txt.mjs`, test file, ci.yml step.
- Acceptance: validates RFC 9116 syntax (Contact, Expires, Canonical, Preferred-Languages), rejects Expires < 30 days out, and rejects unreplaced placeholders only in a `--release` mode; template mode passes.
- Hours: 4.
- No decision needed: only syntax and expiry mechanics; the contact address, key and hosting stay with the owner (SECURITY.md open items untouched).
- Third-party action: no.
- Closes (partly): QV-33-REQ-003.

Total about 51 hours. Not included on purpose: SPDX header rollout and REUSE lint (touches every source file; QV-25-REQ-001/QV-30-REQ-023, mechanical but large diff, do as its own reviewed PR), CLI/server Experimental banner (package code outside process files), ESLint (new dependency).
