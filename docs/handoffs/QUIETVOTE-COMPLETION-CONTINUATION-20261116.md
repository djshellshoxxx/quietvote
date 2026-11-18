# QuietVote recovery and client continuation — 2026-11-16

Continuation of [PR #50](https://github.com/djshellshoxxx/quietvote/pull/50),
published for review in [PR #51](https://github.com/djshellshoxxx/quietvote/pull/51).
This checkpoint does not complete the project or qualify it for real elections.
Main, release and deployment are unchanged. Six parallel workers implemented
separate domains in isolated worktrees; the integrator reviewed and combined
their changes. AI reviews do not replace external security or protocol review.

## Integrated behavior

| Area | New behavior and evidence location |
|---|---|
| Operator recovery | `qv-backup verify/restore` checks private snapshot copies, paths, exact members, checksums, database integrity, replay, board authors and authenticated envelopes using a separately retained KEK. Restore requires a new destination and an explicit minimum-history snapshot; independent provenance remains an operator requirement. Known deletion tombstones cannot be omitted or resurrected. `server/test/offline-backup.test.ts` includes real executable restore/restart/append and hostile snapshots. [Runbook](../OFFLINE-BACKUP-RESTORE.md) |
| Coordinator/voter CLI | `election sign-record` adds authorized coordinator signatures using the pinned manifest or verified context; `election export-entry` frames existing signed records with a separate outer author. `online election-tally-draft` downloads the existing proposal. A real executable HTTP election covers these paths in `cli/test/packet-executable.test.ts`; trustee fixture setup is explicitly separate from existing trustee-executable coverage. Public contexts are bounded regular files, including FIFO/oversize refusal. |
| Organizer setup | `/new` creates/imports/unlocks an organizer key, downloads its encrypted backup, explicitly enrolls an organization and exposes k, ballot-limit and quorum settings. Installation is atomic across tabs. Clearing the active page invalidates that page's stale KDF/import work; fingerprint and signing unlocks are read-only. `web/test/organizer-setup.test.ts` and `publish-ui.test.ts` cover these behaviors. Connected ceremony/open/close/tally administration is still incomplete. |
| Cast reload recovery | Public-only pending markers commit before a single explicit CAST POST. Reload blocks a new ballot until verified GET-only inclusion recovery. Unknown delivery, bad proofs and not-found retain the marker. Device clearing is one committed transaction. `web/test/cast-alarm-delivery.test.ts` and the browser reload journey cover the path. |
| Receipts | Bounded receipt-file metadata binds the election, manifest, code, exact voter-signed header/body and leaf. Typed full or displayed short ballot codes require unique signature-checked matches and signed inclusion/consistency proofs. Receipt checks serialize and discard stale UI results. Current hex API identifiers work in routes and receipt files. See `web/test/receipt-{file,code,check-gate}.test.ts` and `server-id-route.test.ts`. |
| Crash behavior | Additive control schema 6 records resumable deletion cleanup; canonical paths are checked again immediately before unlink. Uncertain idempotent management outcomes retain their request binding instead of repeating committed work. Supplemental events publish only after their transaction commits. See deletion, idempotency and outbox regression files. |
| Build and browser acceptance | Production catalog chunks share the source key dictionary, preserving every message and review gate within the unchanged budget. The required browser runner adds a production-build actual-server cast/receipt journey; signed HTTP and code-lookup acceptance also run without a browser. Optional missing-browser skips cannot erase earlier failures. |

The online snapshot producer now derives membership from the copied control
registry and finalizes standalone database files. Sequential snapshots are not
a global transaction; inconsistent membership fails verification rather than
being silently accepted. The offline tool does not implement complete public
protocol verification or discover the newest witness/receipt history. The
runbook keeps those activation requirements explicit, along with separate
offsite encryption, KEK custody and operator-owned filesystem assumptions.

## Review and corrections

Cross-domain reviews and integration checks found and corrected:

- Synthetic base32-only receipt validation and the existing route mismatch with
  current server hex identifiers.
- Restored tombstone path traversal; defense exists both on backup input and
  immediately before deletion. History floors retain tombstones monotonically.
- Device-clear request success mistaken for commit, late organizer key writes,
  simultaneous organizer installation and weak-key transparent rewrap after
  clearing. Organizer signing preserves the key and signature formats.
- Imported receipt code/leaf substitution and stale/concurrent receipt UI checks.
- Unbounded/FIFO context inputs in the new coordinator command.
- A diagnostic-only deletion fixture missing the new cleanup dependency; the
  refusal and no-side-effect assertions were retained.

The [independent recovery review](../reports/resume-20261116-recovery-review.md)
and [crash handoff](QUIETVOTE-CRASH-RECOVERY-20261116.md) record scoped evidence and
remaining architecture limits. No crypto primitive, protocol encoding, vector,
registration contract or verifier comparison expectation was changed.

## Validation and source provenance

On Linux with Node 24.22.1, all eight package suites pass: **1086 distinct tests,
zero failures or skips**. Board 76; crypto 89; protocol 215; verifier 25;
trustee 113; CLI 62; server 228; web 278. The package tests ran serially within
each runner; complete CLI/server/web reruns supersede initial interrupted file
processes. Root typecheck passes with a 512 MiB heap cap. This was a custom serial
runner plus typecheck, not an invocation of `npm run check`.

Additional checks pass: 55 tooling tests, 19 workflow tests, 58 Python units,
lockfile, trace, dependency boundaries (two retained D-97 deviations), links and
i18n. Dependency audit reports zero vulnerabilities. Two separate real-server
HTTP tests pass for signed management requests and context/log-bound receipt
lookup; they are not added to the 1086 workspace count. The production build
passes at 190.9 KiB gzip for all JavaScript, 91.1 KiB entry, within unchanged
200/110 KiB limits. The offline verifier page is 184.2 KiB.

TS vectors: 412 pass, zero fail, one unsupported file. Python vectors: 229 pass,
zero fail, 53 not implemented. Unsupported capabilities are not passes. The
unchanged strict comparison exits 1: 27/27 verdicts agree, 24/27 detailed reports
agree. Claims lint still exits 1 with eight findings in two unchanged historical
files. No gate was weakened or suppressed.

Published code `e7267b60dd301f4a6890670f02261ae8aafdb070` has source tree
`14a7e1f467d547d5f553f6bc8d2796f7dd1a05c8`, exactly matching local code commit
`8b1cb565518ad035da4254f4d6bdb9225151553b`. Later evidence changes are documentation
only. [Hosted CI](https://github.com/djshellshoxxx/quietvote/actions/runs/43931043700)
is queued at inspection; no hosted matrix/browser pass is claimed. Local
Chromium launch is blocked by `socket() failed: Operation not permitted`.
Windows/macOS, manual accessibility and native translations remain unqualified.

[Machine-readable evidence](../reports/completion-20261116-validation.json)
records package counts, source identifiers, unsupported checks and superseded
attempts. Initial typechecks exited 137 under host pressure; the first broad
CLI/web/server attempt also had generic failed file processes and the concrete
outdated deletion mock. The final full serial suites pass without removing any
assertion. Clearing cancels pending organizer key work in the active page;
independent active tabs are not globally canceled.

Shell Git pushes cannot authenticate in this environment. The connected GitHub
Git-data API publishes exact local source trees; commit identities differ.
`Original-local-commit` trailers preserve the local source reference. Tree hashes
are compared before each branch update. No force push is used.

## Remaining work and decisions

1. B3-01/D-99 registration bytes, label policy and pinned-roll acceptance remain
   held. Browser voter enrollment is not interoperable with the reference server until
   that contract is approved and implemented.
2. D-92–D-96 verifier report/incomplete/spoil semantics and authority/control
   decisions remain held. Strict comparison continues to fail on three report
   differences. No test or CI gate has been relaxed.
3. Connected organizer ceremony/open/close/tally UI, complete operator-generated
   lifecycle bodies and an acceptance journey using every shipped client in one
   flow remain incomplete. Existing coordinator/voter and trustee executable
   tests are complementary coverage, not one combined acceptance.
4. Crash recovery still lacks durable cross-database webhook bridging, complete
   reconstruction of lost management responses and guaranteed supplemental-event
   repair. Deletion/export-ack and backup-purge policy remain distinct work.
5. Draft core specifications also describe GroupRules chains, proposal/version/
   review lifecycle, membership rotation/revocation and challenge/dispute flows.
   These are absent or incomplete; this continuation has not defined and
   implemented their entire application contracts. Future ranked/weighted,
   delegation, federation and stronger identity/anonymity phases remain deferred.
6. Latest independent witness/WAL restore checks, offsite backup encryption and
   operations, independent security/protocol review, native translation and
   assistive-technology review, supported-platform trials and release governance
   remain unqualified. Local Chromium launch is host-restricted; hosted evidence
   must be inspected explicitly.

Continue from the published PR #51 branch, not main or the earlier handoff base.
Read the open-decision register before changing held behavior. Trace links are
presence evidence; no assertion is made that all traced requirements have been
individually assessed or completed.
