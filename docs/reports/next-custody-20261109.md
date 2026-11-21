# Trustee backup rollback reliability — 2026-11-09

Workstream C repairs a handled-failure recovery gap: an unsuccessful backup can
leave an encrypted copy that the live bundle does not know about. Cleanup refusal
or failure is now an explicit `BACKUP_NOT_REMOVED` safety error with recovery
instructions. This is a local custody repair, not protocol qualification or an
erasure guarantee. QuietVote remains an unaudited prototype, not for real elections.

## Source and scope

- Baseline: `35b5d4d6161c5ea0cd99ec4746cb9a4bb11a3f6e`.
- Author branch: `codex/qv-next-custody-20261109`, isolated worktree `qv-custody`.
- Exact final commit/tree are reported by the integration receipt; this document
  does not embed its own containing commit hash.
- Owned paths: `packages/trustee/**`, `packages/cli/**`, this report. The general
  CLI package required no source change; its complete suite was checked.
- Reference: QV-17 §6.4, §11.2, §12.2; QV-17-REQ-023/070/080. This does not claim
  complete satisfaction of those requirements or amend their normative semantics.
- Read current handoffs, trustee/CLI NOTES, custody audit ledger, decision register,
  engineering/security/contribution requirements, ownership/template and CI matrix.
  TR-09 re-serving and other held protocol choices remain unchanged.

## Reproduction and repair

The existing sequence seals and exclusively publishes the backup, then saves its
registration into the live bundle under the canonical lock and sealed-file CAS.
If that save fails, it rolls back in-memory bookkeeping and calls fingerprint-checked
`shred`. Both a `false` refusal and a thrown cleanup error were discarded.

A deterministic fixture holds the live bundle lock and injects an RNG failure only
for overwrite-sized requests. Backup sealing/publication succeeds; registration
fails with `BUNDLE_LOCKED`; cleanup fails before overwriting. The encrypted backup
remains readable, while the original live file and registry remain unchanged. On
the baseline the API reports only `BUNDLE_LOCKED` and CLI JSON exits 40, without
identifying the unregistered copy. Both new diagnostic assertions fail there.

The repair checks cleanup's result. Successful removal or confirmed `ENOENT` /
`ENOTDIR` preserves the original error. An existing or inaccessible destination
instead produces `BACKUP_NOT_REMOVED` (`REFUSED`, exit 60) and invalidates the
in-memory object. The message names the canonical destination, calls for manual
inspection/removal of the copy, resolution of any lock/write failure, and reopening
before retry. Arbitrary underlying exception text is not included. CLI JSON retains
its existing `{ok:false, code, kind, message}` shape and produces no success output.

No deletion bypass is introduced. Replaced bytes, symlinks, hardlinks, redirected
parents and nonregular files remain subject to the existing `shred` refusal. The
exclusive destination publication, live CAS/lock, release ledgers, tombstones,
one-shot spoil refusal and conflicting tally/transcript refusal are unchanged.

## Verification

Linux, Node `24.22.1`, npm `11.9.0`. Installed independently with
`npm ci --ignore-scripts --no-fund`; workspace links resolve inside `qv-custody`.
No dependency or lockfile change. Evidence logs are under the coordinator's
`evidence/` directory, named below.

| Command | Result | Evidence |
|---|---|---|
| `npm ci --ignore-scripts --no-fund` | Exit 0 | `custody-npm-ci.log` |
| `node --test --test-name-pattern='failed backup rollback\|backup cleanup failure' packages/trustee/test/custody.test.ts packages/trustee/test/cli.test.ts` on baseline source plus regressions | Exit 1; 2 fail, 0 skip | `custody-rollback-red.log` |
| `node --test packages/trustee/test/custody.test.ts packages/trustee/test/cli.test.ts` | Exit 0; 14 pass, 0 fail/skip | `custody-rollback-green.log` |
| `npm test -w @quietvote/trustee` | Exit 0; 87 pass, 0 fail/skip | `custody-trustee-tests.log` |
| `npm test -w @quietvote/cli` | Exit 0; 47 pass, 0 fail/skip | `custody-cli-tests.log` |
| `npm run typecheck` | Exit 0 | `custody-typecheck.log` |
| `git diff --check` | Exit 0 | Integration receipt |

Four added tests exercise failed overwrite cleanup with unchanged live state,
fingerprint refusal preserving unrelated replacement bytes, pre-publication failure
with an absent destination retaining `ENOENT`, and CLI JSON/secret-safe diagnostics
plus a successful retry after manual cleanup and reopening. Existing concurrency,
CAS, ledger conflict/restore, stale-copy tombstone and final-wipe restart regressions
remain passing. No tests or negative assertions were removed or skipped.

## Limits and platform coverage

- This handles caught failures; an abrupt kill between backup publication and live
  registration still bypasses rollback and can leave an unregistered copy. No
  transaction journal, automatic crash cleanup or new bundle format is introduced.
- Underlying I/O failure or unsafe file identity still requires operator recovery.
  The tool reports uncertainty and preserves an unrelated replacement file.
  It does not automatically retry or treat the copy as a successful backup.
- Local Linux tests exercise the existing 0600 and permissive-file refusal checks.
  New tests use `realpathSync.native` and add no platform skips. This author's run
  supplies no new macOS/Windows receipt. The integrated candidate needs the hosted
  Linux/macOS/Windows × Node 22/24 matrix; prior baseline passes are not candidate
  qualification. Windows ACL validation remains absent and is not established by
  passing filesystem behavior tests.
- Hostile filesystem rollback, arbitrary active filesystem tampering, JS immutable
  secret lifetime and physical flash/SSD erasure remain outside the guarantee.
  No secrets are added to arguments, public logs, snapshots or diagnostics.
- No protocol, crypto, registration, vector, dealer, high-water, key-format or
  re-serving policy changed. No remote mutation or publication was performed by
  this author. Independent review and integration qualification remain separate.
