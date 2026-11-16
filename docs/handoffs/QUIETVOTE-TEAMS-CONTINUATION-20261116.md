# QuietVote parallel continuation — 2026-11-16

Starting published source: PR #51, `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Integration branch: `codex/quietvote-teams-20261116`.

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

## Retained boundaries

B3-01/D-99 registration, authority/control decisions, D-92–D-96 verifier semantics,
and passphrase-normalization compatibility remain held. Missing signed GroupRules,
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
The preserved strict comparator still has 27/27 verdict agreement and three
detailed-report differences. Expectations and comparator gates were not changed.
