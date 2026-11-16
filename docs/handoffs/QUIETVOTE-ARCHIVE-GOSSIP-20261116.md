# QuietVote archive preparation and durable gossip health — 2026-11-16

Base: `codex/quietvote-continue-20261116` at
`86f85d52e195cf56d644c8a7af900133e8e9cc3e` (PR #49). That branch includes PRs #47
and #48. Continue from `codex/quietvote-finish-20261116`; do not remerge those
histories. The base head was checked again before publication.

## Delivered scope and design

- `qv election prepare` reads a bounded public `.qvb` archive, checks its strict
  framing and checksums, verifies an independently pinned manifest and board
  structure, and creates ceremony or release inputs using the existing trustee
  formats. Every board body is preserved. The same `verifyLogStructure` used by
  trustee release enforces author/origin/body/tree/checkpoint bindings. Protocol
  and witness-quorum checks are explicitly left to the consuming trustee.
- Strict tar framing and checksum parsing are shared portable board helpers.
  The server keeps its existing tar exports for compatibility and reuses the
  checksum helper without changing its full import verification or admission.
- The executable election test uses shipped preparation commands for ceremony
  and release inputs. The parent no longer manually unpacks archives. It still
  prepares coordinator records, registration and voter ballots.
- BT-13 contact health is durable in control schema migration 5. Peer rows use
  hashes rather than URLs, are bounded to configured peers, and retain last
  success/failure and consecutive-failure state through restart. Structured logs
  record static outcome/code transitions without peer addresses, election IDs
  or exception text. Admin status exposes healthy/stale/configured counts,
  scheduler state and the documented staleness threshold.
- `qv online admin-status` uses the existing signed GET helper and the server's
  instance-admin authorization, making these indicators available from the CLI.

The container move, consumer wiring and restart-compatible health storage span
multiple packages and exceed the small-PR guideline. This handoff is the design
note. No dependency, protocol encoding, crypto primitive, vector or comparator
change is included. Migration 5 is additive; it does not add election content to
the control database. Contact health is not an election-integrity verdict and
not proof that every public election was covered in a sweep.

## Reviews and negative coverage

A fresh-context code-review worker examined the changed and new files against
the base. It found that the existing 256-election budget return bypassed new
scheduler-success recording. The fix records successful bounded completion;
the restart/outage regression now also checks scheduler recovery at that limit.
The follow-up review reported no further findings. This is an AI code review,
not independent professional security or protocol qualification.

Archive tests refuse wrong pins, resealed forged headers/bodies/origins, missing
checkpoints, malformed/duplicate JSON, missing members, checksum damage,
existing/symlink outputs and oversized input. A separate organizer remains
refused under the existing trustee authority policy. Gossip tests cover real
SQLite reopen, outage, malformed response, DNS change, recovery, staleness,
unexpected scheduler error and absence of addresses/raw errors in logs. The
admin CLI test checks both authorized and refused signed requests.

## Validation

Published code snapshot: `ce6b177f32cf04dae0f520a25206c06514f8910c`, source tree
`65da724eeba6fa92d48f0981bab5f92ebf5b5ed2`, equal to local implementation
`04ff2bf5a454678453532dd723d5d0d85d7f3e80`. [PR #50](https://github.com/djshellshoxxx/quietvote/pull/50)
stacks on PR #49. Later evidence updates are documentation only.

Linux, Node 24.22.1 and Python 3.12.14: all eight package suites pass in a serial
run. The added admin CLI authorization test also passes separately; it was added
after the serial runner selected CLI files. There are **1027 distinct workspace
tests**, zero failing or skipped. Overlapping focused tests are not added to the
count. This was a serial package runner, not an invocation of `npm run check`.

| Package in serial run | Passed | Failed | Skipped |
|---|---:|---:|---:|
| board | 76 | 0 | 0 |
| cli | 57 | 0 | 0 |
| crypto | 89 | 0 | 0 |
| protocol | 215 | 0 | 0 |
| server | 206 | 0 | 0 |
| trustee | 113 | 0 | 0 |
| verifier | 25 | 0 | 0 |
| web | 245 | 0 | 0 |
| Additional admin CLI test | 1 | 0 | 0 |

The real trustee executable test passed both in the initial 18-test
archive/import/process run and in the full trustee suite. It uses shipped
preparation commands through the actual ceremony and tally, verifies exact
plaintext totals and runs the existing Python shared-report comparison.

Typecheck (512 MiB V8 heap cap), 55 tooling tests, 58 Python units, dependency
boundaries (existing D-97 retained), lockfile, links, trace, production build and
i18n pass. Dependency audit reports zero vulnerabilities. The production browser
bundle is 199.0 kB gzip, within its existing budget. An actual database created
by the base schema-4 code upgrades to schema 5, retains instance metadata, and
supports peer-state persistence/pruning in a separate smoke check.

TypeScript vectors: 412 pass, zero fail, one unsupported file. Python vectors:
229 pass, zero fail, 53 not implemented. Unsupported capabilities are not passes.
The strict comparison still exits 1: 27/27 verdicts agree, 24/27 detailed reports
agree and three disagree. Its gate was neither changed nor suppressed. Claims
lint still exits 1 with eight historical findings in two unchanged audit files.

On the published code, [hosted CI](https://github.com/djshellshoxxx/quietvote/actions/runs/43922590428)
completed with **10 successful jobs and one failed job**. All eight workspace
jobs pass on Ubuntu with Node 22 and Node 24. Typecheck/supply-chain and production
browser/CSP/automated-accessibility jobs pass. Python units, both vector sweeps,
production build, i18n and licence steps pass; the sole failed step is the retained
strict verifier comparison. Pseudo-locale visual checks pass. The claims workflow
returns success because it is nonblocking; that does not mean finding-free.
Windows/macOS and independent professional review remain unqualified.

Local browser journeys could not launch Chromium (`socket() failed: Operation
not permitted (1)`); the hosted browser job provides the successful browser
qualification. An earlier uncapped typecheck was killed by the host. An initial
Python discovery command from the repository root produced six import errors;
the corrected CI command from `verifier-py` supplies the 58 passing unit tests.
Neither failed setup attempt is counted as a pass.

Machine-readable results: `docs/reports/archive-gossip-20261116-validation.json`.

## Remaining project work

This is a continuation checkpoint, not completion of all features. Engineering
work remains independently of the protocol decisions:

1. Offline server backup verification/restore, independently provisioned KEK and
   restore/rollback drills. Backups must not silently replace missing keys.
2. Coordinator lifecycle packet generation, organization enrollment, voter
   packet generation/relay and complete acceptance using only shipped clients.
3. Web durable uncertain-send recovery across reload, connected organizer flow,
   and actual-server browser acceptance where Chromium can run.
4. Existing outbox/idempotency/crash and resumable-deletion residuals from the
   prior inventory. Gossip contact health does not fix the existing sweep
   enumeration coverage limit or create an external alert delivery system.
5. The recorded B3-01 registration contract, organizer/coordinator authority and
   verifier-report decisions require explicit protocol decisions before those
   behaviors change. The strict comparator remains a failing release gate.
6. External review, key/witness custody, monitored disclosure contact, native
   translation/accessibility review and deployment trials remain unqualified.

Read the earlier inventories and open-decision register before choosing the next
slice. Do not treat historical backlog percentages or this branch name as proof
of completion. No main merge, release or deployment is included.
