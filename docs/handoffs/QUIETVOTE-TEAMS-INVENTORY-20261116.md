# Inventory and T-028 milestone handoff — 2026-11-16

Starting candidate: PR #51 at `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Worktree: `codex/qv-teams-review`. Code milestone: `2a685f5`.
This lane adds a narrow missing crypto-library capability and a source-based
feature/branch inventory. It does not complete QuietVote or qualify a release.

## Completed implementation

`packages/crypto/src/elgamal.ts` exports
`elgamalRerandomize(K, ciphertext, r)` through the existing wildcard export.
It uses the existing encryption and ciphertext addition operations, preserving
the message while adding caller-supplied randomness. Canonical nonzero bigint
randomness is enforced by `elgamalEncrypt`; this helper also rejects an identity
key and a result whose A component is identity. The latter is the cancelling
randomness case, which would expose the plaintext point. No implicit RNG or
retry is added. The neutral ciphertext is accepted as an encryption of zero.

No current ballot/server/trustee/verifier caller uses this helper. Existing
ciphertext-bound proofs and signatures do not survive this transformation;
the new regression proves a valid old CDS proof fails after rerandomization.
Input ciphertext objects are unchanged. No dependency, wire format, transcript,
vector expectation or acceptance policy changes.

## Exact local checks

Environment: Linux, Node 24.22.1. Commands run against the code milestone's
source content; subsequent changes in this lane concern documentation only.

| Command | Result |
|---|---|
| `node --test --test-concurrency=1 packages/crypto/test/elgamal-rerandomize.test.ts` | 4 passed, 0 failed/skipped |
| `node --test --test-concurrency=1 packages/crypto/test/*.test.ts` | 93 passed, 0 failed/skipped |
| `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | exit 0 |
| `git diff --check` before code commit | exit 0 after removing an extra documentation EOF blank line |

The new regression initially failed because the export did not exist. An early
test draft incorrectly passed an RNG object where `cdsProve` requires xi bytes;
that fixture was corrected to a fixed 64-byte test nonce before the passing
focused/full runs. No production proof behavior or assertion was weakened.
The 4 new tests are included in the 93 crypto tests, not additional to them.
No full workspace, hosted CI, browser or supported-platform pass is claimed.

## Inventory milestone

[Feature ledger](../reports/quietvote-teams-feature-ledger-20261116.md) records
implemented slices, actionable gaps, held decisions and external qualification.
The scan found no application implementation of GroupRules chains, proposal
history/review/freeze, membership aliases/rotation or challenges/disputes.
The ledger gives the cross-package contract changes needed; these remain
missing MVP features rather than being relabelled as future optional work.

[Branch inventory](../reports/quietvote-teams-branches-20261116.json) records
all 57 origin tips: 50 contained, seven divergent. Divergent changes are the
same earlier-accounted docs-only, patch-equivalent and held #27 work. No new
unaccounted feature code was recovered and no remote ref was changed.

## Fresh-agent next steps

1. Review `2a685f5` independently, especially cancellation refusal, caller
   randomness/key expectations, ctZero behavior and proof-invalidity evidence.
   Run the focused test. Code/crypto/protocol review required before merge is
   still pending; an AI peer review is not the required independent approval.
2. Integrate this additive commit with the server/UI/CLI/acceptance lanes; verify
   the whole candidate rather than transferring this lane's test receipt.
3. Update the feature ledger with actual integrated lane commits and evidence.
   Keep B3-01/D-99, D-92–D-96 and authority holds explicit.
4. The next sizeable feature work is contract definition for signed GroupRules
   and proposals, followed by membership and disputes. Follow the dependency
   order in the ledger; no private UI-only state can substitute for shared
   signed/exported/verifier-visible records.

No push, main merge, deployment, release or persistent worker was performed or
created by this lane. Fresh workers should resume from the integrated candidate
and this checkpoint, not restart from main or an older inventory.
