# Completion status (v1 scope)

Status as of the completion branch `claude/quietvote-complete-1` (PR against `claude/quietvote-board-cli-1`).
Scope is the v1 specs in `docs/` as indexed by `docs/SPEC-INDEX.md`. Specs remain Draft; "complete" here means the
items below are either done and verified or listed with an owner and a real blocker.

**Not for real elections.** This software is unaudited. Nothing here is a security certification.

## Verified in this branch

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` (8 workspaces) | 530 passing, 0 failing |
| `npm audit` | 0 vulnerabilities (prod and full) |
| `.github/scripts/check-action-pins.mjs` | pass |
| `scripts/licence-snapshot.mjs` | 32 packages, 0 flagged |
| `verifier-py`: `python3 -m unittest discover -s tests` | 37 OK |
| `test-vectors/v1/mutations/*` against `verifier-py` | all match expected verdict and failing check |

## Remaining items

| # | Item | Owner | Blocker / next step |
|---|---|---|---|
| C1 | Claims lint: 108 findings in 26 files (`scripts/lint-claims.mjs`). CI runs it non-blocking. Mostly quoted or negated terms in `docs/07-threat-model-security.md` (43) and `docs/research/R-01..R-04` (30). | Comms + Sec | Each finding needs a judgement: rephrase, mark as quoted under `docs/claims/`, or add a scoped `claims-lint-ignore` block. Not mass-suppressed here, because that would hide real claim review. |
| C2 | Requirement traceability: 722 distinct `QV-xx-REQ-nnn` IDs across 35 docs. Not audited one by one against code and tests in this branch. | Proto + QA | Walk `docs/24-traceability-matrix.md` and mark each Must item implemented, tested, or deferred. |
| C3 | Python verifier does not reject `manifest_hash`, `joint_key_seq` or `roll_commit_seq` on non-`election-open` markers (TS does, `packages/protocol/src/verify.ts` ~L275). | Proto | Small port. Coordinate with audit session before touching verifier logic. |
| C4 | `verifier-py` has no `NOTES.md` (behaviour-change log required by repo rules). | Proto | Create when C3 lands. |
| C5 | `packages/server/NOTES.md` is stale: "webhook delivery state is not persisted" conflicts with webhook migration 3; "`/admin/*` not implemented" conflicts with the quarantine clear path. | Eng-S | Doc-only correction after code is re-read. |
| C6 | `verifier-py` tests are not in CI (`.github/workflows/ci.yml` runs only `npm run check`). | Eng-R | Add a Linux-only job step with `python3 -m unittest`; needs no new action pins. Not done here to avoid changing the cross-OS matrix without review. |
| C7 | Translations: not reviewed. Do not mark them reviewed. | Localisation reviewer | Human reviewer required. |
| C8 | Open owner decisions: D-01..D-06 and protocol-freeze defaults D-10..D-23 (`docs/plan/OPEN-DECISIONS.md`). | Product owner | Decisions not made. Protocol freeze depends on them. |
| C9 | Independent second verifier, audit (R1), counsel review, fiscal host, pilot groups, organiser interviews. | Product owner / Sec | External parties and funding; not code. |
| C10 | Repository file mode: `packages/trustee/src/cli.ts` is 644 in this working tree but 755 in some environments. Not committed. | Eng-R | Decide the intended mode and commit it once. |

## Notes

- Audit findings and security review belong to the audit/QA session (`claude/quietvote-audit-qa-1`). Items here do not duplicate them.
- Any item that changes protocol, crypto or verifier logic needs a crypto or protocol review before merge.
