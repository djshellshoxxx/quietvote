# QuietVote CLI lifecycle milestone — 2026-11-16

Base: published PR #51, `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Implementation: `9413026`; follow-up hostile-input regression: `4ba569f`.
Branch: `codex/qv-teams-cli`. This is an implementation and review handoff;
no merge, deployment, release or complete-project qualification is claimed.

## Completed slice

`qv election draft-record <archive.qvb> --manifest-hash HEX --kind PHASE --out body.json`
now generates all existing ceremony and open/close coordinator bodies:

| Phase | Outer entry type |
|---|---|
| `dkg-open` | `ceremony_start` |
| `dkg-r1-open`, `dkg-r1-close`, `dkg-r2-close`, `dkg-r3-close` | `notice` |
| `dkg-final` | `joint_key` |
| `roll-commit` | `roll_commit` |
| `election-open` | `election_open` |
| `election-close` | `election_close` |

The unsigned body is reviewed and passed to the existing `sign-record`,
`export-entry`, and `online election-submit` commands. Each invocation needs
an independently supplied manifest pin and authentic public archive. The shared
archive preparer validates bounded files, checksums, manifest, outer authors,
board bodies and log checkpoints before any proposal is written.

The adapter checks record signatures and phase order; recomputes DKG outcome
using existing protocol functions; checks timely trustee confirmation proofs;
checks roll commitments; derives the open marker's authenticated sequence
references; and verifies the context-signed open before drafting close.
Terminal controls, skipped/repeated phases, failed proofs, changed pins,
malformed inputs and overwrite attempts are refused. It neither signs nor
submits anything and cannot bypass server time/admission checks.

## Validation

- Root typecheck passes with `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`.
- Initial focused run of lifecycle plus unchanged prepare tests: 4/4 pass.
- Final focused `node --test --test-concurrency=1 packages/cli/test/lifecycle.test.ts`: 3/3 pass, 0 failures/skips.
- All nine lifecycle bodies match the existing protocol/server acceptance path
  through the real qv executable and actual HTTP server. Archive preparation
  continues to refuse separate-organizer authority as before.
- Negative inner-record test re-signs every outer header and checkpoint with
  authorized fixture keys. Shared archive authentication succeeds, then the
  lifecycle adapter refuses a forged trustee signature and invalid timely
  confirmation proof. The latter is refused even with enough other confirmations.
- Full CLI package run: `node --test --test-concurrency=1 packages/cli/test/*.test.ts`
  passed **65/65 tests, 0 failures/skips**, exit 0 in 503.9 seconds on Node
  24.22.1. This includes the existing real coordinator/voter executable election
  (281.6 seconds under shared load), all packet/receipt/spoil tests, and the
  three lifecycle tests. Overlapping focused runs are not added to this count.
- Fresh-context AI review found no blocking implementation defect and passed
  14 independently designed authenticated-archive probes. That reviewer
  retained the cases and review handoff in review commit
  `1a44391b9e7ca81cdcb5d2018cda91ea88c4a9b8` (15/15 Node test entries, including
  the parent test). Those separate test entries are not included in the 65 above.
- [Machine-readable local receipt](../reports/teams-cli-20261116-validation.json).

The separate combined-client team consumes this command in
`all-clients-executable.test.ts`; that test and its evidence belong to that
team's later commit, not the counts above.

## Remaining boundaries and fresh-agent review

- `roll_source: uncommitted-proposal` identifies membership not pinned by the
  manifest. The coordinator must review that proposed roll before signing.
- `witness_quorum_verified`, `freshness_verified`, `signed` and `admitted` remain
  false. Archive integrity is not independent latest-view or witness acceptance.
- B3-01/D-99 registration, separate organizer authority, D-92–D-96 verifier
  decisions, and external review remain unchanged.
- Existing `sign-record --election` accepts the content JSON export for its
  context check; the lifecycle body references come from `.qvb`. Trustee
  `prepare --format election` output has `log_evidence` and is not accepted as
  the CLI verifier/context bundle. Do not interchange these file formats.
- Tally proposal still uses the shipped server draft and existing sign/relay
  commands. The new offline command intentionally does not invent tally policy.
- Review `cmd-lifecycle.ts` for archive/record/phase boundaries; run lifecycle,
  prepare and packet regressions, then the combined-client acceptance once its
  team supplies the final test. Do not weaken independent gates to make a
  lifecycle proposal appear to be a verification verdict.
