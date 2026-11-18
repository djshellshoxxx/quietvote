# QuietVote parallel continuation — 2026-11-16

Starting published source: PR #51, `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Integration branch: `codex/quietvote-teams-20261116`,
[draft PR #52](https://github.com/djshellshoxxx/quietvote/pull/52).

This is an implementation and verification checkpoint. QuietVote is not complete
or release-qualified. Main, releases and deployment remain unchanged. Scope and
genuinely missing core contracts are recorded in the
[feature ledger](../reports/quietvote-teams-feature-ledger-20261116.md).

## Milestone handoffs

Each lane used an isolated worktree. Fresh agents took over review or continued
the next milestone; their findings were reproduced and repaired before acceptance.
AI review does not replace the required independent protocol/security reviews.

- [Feature and branch inventory / rerandomization](QUIETVOTE-TEAMS-INVENTORY-20261116.md).
- [Coordinator lifecycle CLI](QUIETVOTE-TEAMS-CLI-20261116.md) and
  [fresh crypto/CLI review](QUIETVOTE-TEAMS-CRYPTO-CLI-REVIEW-20261116.md).
- [Organizer console](QUIETVOTE-TEAMS-ORGANIZER-20261116.md).
- [Server durability and management responses](QUIETVOTE-TEAMS-SERVER-20261116.md).
- [Streaming backup hashes](QUIETVOTE-TEAMS-BACKUP-HASH-20261116.md),
  [private recovery floors](QUIETVOTE-TEAMS-PRIVATE-RECOVERY-20261116.md), and
  [fresh recovery review](../reports/quietvote-teams-recovery-review-20261116.md).
- [Combined executable election acceptance](QUIETVOTE-TEAMS-ACCEPTANCE-20261116.md).
- [Stable Python log evidence](python-stable-log-20261116.md) and
  [fresh trust-boundary review](../reports/python-stable-log-fresh-review-20261116.md).
- [Approved Python report parity](QUIETVOTE-PYTHON-REPORT-PARITY-20261116.md).
- [Reconciled decision and contract inventory](QUIETVOTE-REMAINING-CONTRACTS-20261116.md).
- [Legacy Python control evidence](python-controls-20261116.md) and
  [fresh control/report review](../reports/python-controls-parity-fresh-review-20261116.md).
- [No-tally INCOMPLETE](QUIETVOTE-PYTHON-INCOMPLETE-20261116.md).
- [Key compatibility](QUIETVOTE-PASSPHRASE-COMPATIBILITY-20261116.md) and
  [fresh key review](../reports/key-compatibility-fresh-review-20261116.md).
- [Modern enrollment](QUIETVOTE-REGISTRATION-20261116.md) and
  [fresh enrollment review](../reports/registration-fresh-review-20261116.md).
- [Private invitation output and executable enrollment](QUIETVOTE-CLI-INVITATIONS-20261116.md).
- [Unsigned policy drafting](QUIETVOTE-POLICY-DRAFT-20261116.md),
  [fresh review](../reports/policy-draft-fresh-review-20261116.md), and
  [versioned governance contract proposal](../rfcs/governance-v1-contract.md).

## Source accounting

The 57 fetched origin branch tips were checked: 50 are ancestors of the starting
source; the seven divergent branches are recorded as documentation-only,
patch-equivalent or explicitly held work. No newly unaccounted implementation
was found. Earlier branches and PRs were retained.

The separate active PR51 repair checkout was left untouched. Its four-file
snapshot was reviewed and incorporated in local commit `962fcbf`: executable
restore paths now derive from module URLs and cover unrelated working directories;
organizer preflight/import races consistently expose the installed key for
read-only unlock. Focused recovery/organizer tests passed 33/33 at incorporation.
Browser assertions still require a browser-capable host.

## Decision reconciliation and remaining scope

Fresh review found that earlier continuation notes had carried old task-specific
holds forward despite explicit owner approval in ADR-027/028. Those older notes
are historical evidence, not the authority for this continuation. The approved
B3-25 passphrase policy and the three report-dependency choices are implemented;
the unchanged strict comparator now agrees on 27/27 detailed reports in its lane.
Existing log notice/control compatibility and modern registration are implemented
against their already accepted contracts. External review before
release is distinct from authorization to implement these decisions.

Missing signed GroupRules,
proposal/version/review, membership rotation/revocation and challenge/dispute
contracts are core scope gaps, not completed or silently deferred features.
Ranked/weighted/delegated voting, federation and stronger identity phases remain
the separately documented future scope.

Independent witness/WAL activation, offsite backup custody, Windows/macOS and
service deployment, native translations, manual assistive technology, independent
security/protocol review and release governance require separate evidence. A
local unit pass or matching shared verifier result does not establish those gates.

## Qualification in progress

Integrated qualification and publication receipts will be recorded here after
the active continuation milestones finish. Do not infer final-candidate acceptance
from an earlier lane pass. The local Chromium probe failed before assertions at
process-singleton socket creation (`EPERM`); browser qualification is pending.
The initial published checkpoint's CI reproduced the three report differences
before the approved parity fix was added. Expectations and comparator gates were
not changed. The new organizer browser fixture initially tried to send only one
signature under its 2-of-3 coordinator policy; the application correctly kept
Send disabled. The corrected journey prepares a partial signature on one device,
co-signs on a second device and then explicitly sends. Its hosted rerun passed at
`fb5934cc954796a0d5bb98fe1c5cb3a2729868d7` in
[run 43964742293](https://github.com/djshellshoxxx/quietvote/actions/runs/43964742293).
All workspace shards on Node 22 and 24, browser journeys, conformance/typecheck,
claims links and pseudo-locale jobs passed at that checkpoint. It predates modern
enrollment, policy drafting, no-tally verdicts and subsequent combined changes;
its success is not a final-candidate receipt.
