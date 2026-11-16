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

Validation results are recorded below after command completion. No all-green
CI or project-completion claim is made by this handoff.

Known fresh evidence before broad-suite completion:

- Typecheck passes with a 512 MiB V8 heap cap. An earlier uncapped typecheck was
  killed by the host; it is not counted as a pass.
- The archive/real-process/import run passes 18 tests, zero failures/skips. This
  includes the actual trustee ceremony/tally, exact plaintext totals and the
  existing Python shared-report comparison (241.7 seconds for the live test).
- Focused server gossip/admin suites pass 19 tests. The later scheduler-budget
  assertion passes in its own targeted run; overlapping runs are not added.
- Tooling tests pass 55 tests. Lockfile, dependency boundaries (existing D-97
  retained), links, trace links, production web build and i18n pass. The browser
  bundle is 199.0 kB gzip, within its existing budget.
- Python units pass 58 tests using the CI command from `verifier-py`. An initial
  discovery command from the repository root produced six import errors; the
  corrected command, not that attempt, supplies the passing evidence.
- TypeScript vectors: 412 pass, zero fail, one unsupported file. Python vectors:
  229 pass, zero fail, 53 not implemented. Unsupported capabilities are not passes.
- Strict TS/Python comparison still fails: 27/27 verdicts agree, 24/27 detailed
  reports agree, three disagree. Its gate was neither changed nor suppressed.
- Claims lint still exits 1 with eight historical findings in two unchanged
  audit files. No new finding was introduced.
- Browser journeys could not launch Chromium on this host: `socket() failed:
  Operation not permitted (1)`. No browser-journey pass is claimed.

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
