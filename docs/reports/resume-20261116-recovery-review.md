# Bounded independent receipt and backup review — 2026-11-16

A separate AI worker reviewed changes authored by other workers. This is source
review and focused execution, not an independent professional audit, protocol
approval, complete cross-platform qualification or release authorization.

Reviewed targets: receipt validation `fba0232` and correction `6b9b87d`; real-server
browser journey `ef29f40`; offline backup/restore `69607e1`. The reviewer authored
the crash/deletion fixes on a separate branch, including the unlink-boundary
defense `4cfc67e`. Thus this report is independent of the receipt/backup authors,
but is not independent review of the reviewer's crash-lane implementation.

## Findings and dispositions

| Finding | Evidence and correction |
|---|---|
| Receipt parser rejected genuine API IDs | Initial parser required base32-26 election IDs; BallotController serializes the route/API ID and the server generates hex-32 IDs. Initial synthetic receipt test used only base32. Corrected in `6b9b87d`: both existing base32 links and current hex API IDs are accepted, while exact selected-election/manifest binding remains. Regression covers hex receipt metadata and routing. |
| Deleted backup registry path bypassed validation | Initial backup verifier validated only live registry paths. Combined with resumable tombstone cleanup, a re-sealed backup could supply a traversal path for later unlink. Final `69607e1` validates every registry row, including DELETED tombstones. Its tombstone-only negative fixture removes the election member, so rejection exercises path validation rather than a member-count mismatch. Separate crash-lane defense `4cfc67e` rejects any noncanonical generated path immediately before unlink. |
| Failed DB initialization retained an open handle | Future-schema refusal threw after opening SQLite without closing that handle. Final `69607e1` closes on every initialization failure, preserving the original exception. This also improves preexisting checksum/self-test failure cleanup. |

No additional blocking correctness/security defect was identified in these
bounded final diffs. Optional-browser execution has a caveat: the shared
`browserTools()` helper calls process.exit(0) when tooling is absent and skips
are permitted. Calling it inside the second server test can mask an earlier
test failure in that optional invocation. Required CI explicitly sets
QV_REQUIRE_BROWSER=1, and the runner tests enforce this fail-closed setting.
The reviewer did not execute Chromium; final browser qualification is separate.

## Backup boundaries inspected

- Separate explicitly supplied KEK, length/permission checks, authenticated DEK,
  signing-key, invite and webhook envelopes, and sanitized CLI failures.
- Strict bounded snapshot members, hashes, regular files and canonical registry
  paths. Filesystem parents remain operator-controlled; hostile filesystem
  races are outside the documented contract.
- Verification and migrations on disposable copies, with source-byte preservation
  evidence; existing startup replay, author signatures and structural self-audit.
- Same-instance/key/origin/root-prefix minimum history; missing elections and
  smaller/conflicting history refuse before destination creation. The floor is
  an explicit lower bound, not discovery of the newest witness/receipt history.
- Atomic new-directory reservation, server ownership lock through copy and failure
  cleanup, no overwrite of existing/empty/live/symlink destinations, independently
  supplied key installation and restore audit.
- Real executable restore, same roots/checkpoints, actual server restart/read and
  append, and refusal to regenerate a missing restored KEK.

The recovery documentation correctly preserves remaining requirements: latest
independent witness/receipt checks and public-verifier activation, no complete
protocol proof validation, no global transaction across sequential snapshots,
separate offsite encryption/custody/retention and unqualified cross-platform
operation. A successful local restore does not satisfy those requirements.

## Executed focused evidence

Linux, Node v24.22.1. Test commands apply to their respective reviewed worktrees.

| Command | Result |
|---|---|
| `node --max-old-space-size=512 --test packages/web/test/receipt-file.test.ts .github/scripts/run-browser-journeys.test.mjs` | 6 pass, 0 fail on root after `6b9b87d`; parser/binding/wrong-origin negatives and required runner behavior |
| `node --max-old-space-size=512 --test packages/server/test/offline-backup.test.ts` | 12 pass before the tombstone/handle follow-ups; historical stage only |
| `node --max-old-space-size=512 --test packages/server/test/offline-backup.test.ts packages/server/test/admin.test.ts` | 20 pass, 0 fail on final source committed unchanged as `69607e1` |

Focused results do not replace the integrator's exact-candidate whole-workspace,
protocol-vector, cross-verifier, browser and tooling qualification.

## Tombstone-floor follow-up

Review of `a508d6f` confirmed immediate resurrection refusal (14 offline tests
passed), then found a second case: a structurally valid candidate could omit a
minimum-history tombstone entirely. Restoring it would forget that deletion for
future backup floors. The new direct omission regression failed before repair
with "Missing expected rejection". The reviewer then authored the bounded fix:
require every minimum deleted ID to exist as DELETED in the candidate. Both live
resurrection and omission now refuse before destination creation. This repair
needs review by another worker; it is not independently approved by its author.

`node --max-old-space-size=512 --test packages/server/test/offline-backup.test.ts
packages/server/test/admin.test.ts`: 22 pass, 0 fail after repair (one command;
line wrapped here). Recovery floors remain explicitly supplied independent
history; no local snapshot can discover unknown newer deletions or receipts.
