# @quietvote/trustee (`qv-trustee`): implementation notes

Implements QV-17 (normative) on top of QV-16 DKG/threshold decryption as built in `packages/protocol`; ADR-014..024 win over specs.

## Native Windows fixture timing observations (2026-11-27)

Six fixtures in `audit.test.ts`, `board-export.test.ts` and `ceremony.test.ts`
observe their first honest trustee keygen on Windows. Test diagnostics contain
only a fixed fixture label, elapsed milliseconds, heartbeat count and largest
callback gap; no paths, seeds, passphrases, payloads or exception text are read
by the observer. The heartbeat stops on success or failure, and unavailable
diagnostic output preserves the original result or error.

This collects evidence for the six native Node 22 service-startup timeouts
observed in PR75; it does not repair or establish their cause. The interval
covers the whole first keygen, so it cannot identify PowerShell startup or
`Add-Type` timing. Production helper code, its 15-second deadline, retry policy,
file-protection checks and CI concurrency are unchanged. Native observations
must come from the Windows matrix; Linux checks only qualify the wrapper and
existing fixture behavior.

## Terminal passphrase prompts (2026-11-27)

The executable refuses hidden input without a TTY (`NO_TTY`, exit 2). EOF, closed
input and read errors settle with named usage errors; Ctrl-C returns
`INPUT_CANCELLED`, exit 10. Readline sends echo to a discarded writable stream,
keeps no input history, and closes the prompt to restore terminal mode on every
handled outcome. Interactive `keygen` asks twice and rejects a mismatch before
randomness or bundle creation. Protected passphrase files (including the existing
environment-variable source) and generated passphrases remain noninteractive.
Confirmation uses the existing byte comparator and wipes its temporary UTF-8
buffers; JavaScript passphrase strings still have the existing lifetime limits.

`test/cli-prompts.test.ts` covers confirmation, file precedence, prompt lifecycle,
redaction, terminal-mode cleanup and actual executable no-TTY refusals. Manual
Linux PTY checks additionally exercised matching keygen with production KDF,
status, mismatches, EOF at both prompts and Ctrl-C: no typed secret was echoed,
and terminal flags were restored. Native macOS/Windows PTY checks remain unrun.

## CLI lifecycle and interrupted persistence acceptance (2026-11-27)

Fourteen new integration tests cover every trustee command through `main(argv)`,
a full 3-of-5 ceremony using public exchanges, and 59 simulated interruptions
around genuine sealed-state, ledger and destruction persistence. Negative paths
verify typed exits, exact replay, authenticated reopen, one-shot spoil refusal,
complaints, disqualification, abort/restart and rejected-tally rollback. Proofs,
signatures and tally results are independently checked; output/files are scanned
for private canaries. No additional production defect was found by these tests.

Fault injection is at application persistence boundaries. It does not qualify
power loss, arbitrary process termination, stale hard-kill locks, native ACLs or
the backup publication/registration window. The actual-process 2-of-3 test with
production KDF remains distinct from the faster injected-dependency fixtures.

## Layout
`bundle.ts` encrypted vault + data model; `machine.ts` state machine; `ceremonylog.ts` log-slice validation, R1 recomputation;
`trustee.ts` all operations; `transcript.ts` build/sign/verify; `passphrase.ts`; `fingerprint.ts`; `cli.ts`. Tests: `test/*.test.ts`
(simulated n-party ceremonies with scripted malicious trustees in `test/helpers/harness.ts`).

## Air-gapped exchange (files only)
`.qvl` = public log slice `{format:"qv-ceremony-log/v1", manifest_hash, entries:[{seq,entry}]}` (bridge -> trustee, `import`);
`.qvp` = packet `{format:"qv-ceremony-packet/v1", round, from, records:[signed records]}` (trustee -> bridge). Rounds:
`commit` (r1-commit), `reveal` (r1-dealing), `shares`, `verify` (complaints), `finalize` (local), `confirm` (keyconf), `drill`, `tally-release`.
Every imported entry is validated (schema, trustee signature against the manifest key, m coordinator sigs on markers); a different
entry at a known seq is `LOG_FORK`. Each command persists to the sealed bundle BEFORE emitting output and re-emits identical bytes
when re-run, so a crash at any point is resumable (tests reopen the bundle for every command).

## Deviations / decisions
* **Bundle is age-STYLE, not age-compatible** (REQ-021 not met): new `packages/crypto/src/bundle-cipher.ts` (scrypt N=2^18 floor via
  `@noble/hashes`, random file key wrapped under the scrypt key, AES-256-GCM payload, header bound as AAD, fresh key/salt/nonces per
  seal). age proper needs ChaCha20-Poly1305/X25519 (not in the ADR-024 allowlist). Hardware-token/X25519 recipients, layering, SLIP-0039
  (REQ-024) are NOT implemented. Optional dice input (REQ-012) is implemented as described below. Tests lower the KDF via `VaultDeps.logN` + `allowWeak` (test-only; also skips
  the passphrase estimator); production code never sets them.
* Generated passphrase = 20 Crockford-base32 symbols (100 bits); user-chosen < 60 estimated bits refused. 2048-word list (Q4) undecided,
  so check words are a placeholder pronounceable encoding of the first 66 bits of SHA-256(label, K, ctx, mh); hex is authoritative.
* One file holds keys AND ceremony state (QV-17 §8.1 step 2), not a separate state file. The polynomial is stored (not re-derived from a seed).
* `sk_xport` (the DKG `e`) is deleted at `confirm`; coefficients after the shares package is persisted; received shares at `finalize`.
* **REQ-040**: `releaseTally` takes only the election bundle (+ optional claimed aggregates for comparison). It runs `verifyElection`
  (tally records stripped so a bogus one cannot block trustees), re-adjudicates the DKG and checks K/ctx/Y_j equal its own, recomputes
  the counted set and aggregates, and calls `trusteeDecryptTally` (floor + claimed-mismatch refusals -> `PRIVACY_MIN` / `AGGREGATE_MISMATCH`, exit 60).
  The fire drill decrypts only a ciphertext recomputed from (K, ctx) (`drillCiphertext`), so it is not a decryption oracle either.
* **Witness gating (REQ-041)**: computed, never asserted by the caller (the old `witnessed` boolean is gone). If `bb.witness_quorum > 0`
  release needs a log-signed tree head of size > seq(election-close) with >= quorum valid cosignatures from the manifest's `bb.witnesses`
  (`witnessAnchors`/`witnessStatus`), taken from the bundle's `log_evidence`; otherwise `NOT_WITNESSED`, or the typed override
  `RELEASE-WITHOUT-WITNESSED-CHECKPOINT`, which is logged in `overrides`. Not re-checked here (the full verifier does): witnessed
  open/close *times* (voting_close +/- skew), per-witness timestamp monotonicity, `observed` heads beyond what `verifyLogStructure` does.
* Record types defined here, not in QV-16 (verifier ignores them as unknown): `keycheck`, `tally-share` (signed by trustee, scope ctx),
  `key-destruction`, `trustee-compromise-report`, `ceremony-transcript` signature body, and the `audit-close` body
  `{ctx, closed_at}` (coordinator m-of-k, scope ctx) consumed by `destroy`. `collectTallyShares` is the coordinator-side helper.
* State machine adds COMMITTED (QV-16 splits R1) and folds SEALED into CONFIRMED. `observe()` on import moves a trustee to DISQUALIFIED when
  a window closed without its record (log is truth). `restart` makes a fresh Ed25519 key (REQ-052).
* Destroy: audit-close verified, typed election title required, attestation signed with `sk_sign`, known backups + bundle overwritten
  and unlinked, public tombstone `<bundle>.destroyed` keeps it terminal. Flash erasure is NOT guaranteed; passphrase destruction is on the user.
* Transcript core is a pure function of manifest + public DKG log (so all trustees sign the same hash); environment/SAS/events are per-signer
  fields inside each signature. `verify-transcript` re-derives Q/K/fingerprint from the embedded log.
* `@quietvote/crypto`/`protocol` are not listed in `package.json` deps (same as protocol; avoids a lockfile refresh). I added a `bin`
  entry; refresh `package-lock.json` when convenient.
* JS limits (R-02): secrets are bigint/hex strings in memory; wiping is best effort only. The CLI prompt hides input via readline muting.

## Not done
Network/outbox, localhost UI, `qv-ceremony` image, dealer mode, `trustee_accept` PoP entry, reminders, Shamir backup of passphrase.

## Windows private-file protection (2026-11-19)

The client now includes native Windows ACL enforcement for encrypted bundles, passphrase files, backups and sealed-file comparison reads. The fixed `src/windows-private-files.ps1` helper runs through Windows PowerShell **5.1** and .NET Framework, using a fixed executable/script and data-only stdin. Missing PowerShell, blocked execution, an uninspectable filesystem/security descriptor or a refused native operation fails closed; there is no fallback to an unchecked Node read. Native private I/O accepts ordinary local drive paths; UNC shares, device paths and alternate data streams are refused.

The same open `FileStream` supplies both its ACL and secret bytes. A private file must belong to the current user and have a protected, recognized, non-null DACL that grants access only to that user. Broad/inherited grants, wrong ownership, unsupported ACLs and unsafe file aliases are refused. Private creation supplies the owner-only DACL to `CreateNew` before writing, flushes file bytes, and publishes or cleans up the held file by handle. Existing trustee canonical bundle aliases still map to one bundle, release ledger and lock. DOS short names and relative caller paths are supported by the native path handling.

POSIX files still use mode `0600`; secret reads also check the ownership, bounds and identity of the descriptor supplying bytes. Existing Windows files with broad permissions must be made private before use; the client does not silently repair their ACLs. Encryption and the existing backup/destruction rules remain in place.

POSIX atomic writes, including public `0644` artifacts, pin the canonical parent and check trusted current-user/root ownership along its entire ancestry. Group/other-writable directories require sticky protection and trusted descendant owners. Writes stage in a same-filesystem `0700` directory; cleanup only removes its file and the empty stage, never recursively. Unsafe ancestry is refused as `UNSAFE_DIRECTORY` before writing. The protection assumes effective namespace rights are represented by POSIX owner/mode/sticky permissions and excludes same-effective-user/root compromise. ACL grants overriding those bits, including macOS native deletion rights, remain an unresolved custody implementation/qualification boundary; the checks do not inspect those ACLs. The existing held-file checks remain additional refusal checks, not an atomic conditional-unlink mechanism.

**Qualification boundary:** Linux filesystem/caller checks do not qualify Windows APIs. The new native fixtures must pass the final published head's hosted Windows Node 22 and Node 24 jobs. See [the implementation and validation report](../../docs/reports/windows-private-files-20261119.md) for the current exact evidence; native hosted qualification is pending at this checkpoint.

## Log origin in the ceremony transcript (X-21)
* `transcript.ts` sets `origin = logOrigin(manifest)` (`quietvote/v1/` + base32(election_id), from `@quietvote/protocol`). It was
  `quietvote/v1/<bb.log_id>`, which is the wrong field and the wrong encoding. QV-18 REQ-001 and QV-28 name `election_id` as the origin
  source, and the protocol log check requires `bb.log_id = SHA-256(origin)`.
* Open spec point (not decided here): QV-18 REQ-001 and QV-28 literally write `<election_id>` as 32 lowercase hex. The board, server
  and protocol all use the 26-char base32 form, and the board rejects hex. Changing the encoding is a spec-owner decision.
* `test/origin.test.ts` pins the origin derivation. The harness sets `bb.log_id = expectedLogId(logOrigin(manifest))`.

## Spoil-decryption relay (QV-ADR-020 "trustees" mode)
* `Trustee.releaseSpoil(electionBundle, codes)` / CLI `spoil-release --codes HEX[,HEX]` returns a `spoil-share` packet: per code one signed
  `SpoilShareBody` (`cp-dec-spoil` proofs, `spoil_seq`). Verify and combine with `decryptSpoiled` from `@quietvote/protocol`
  (`spoilShareRecordSchema` validates records). The requester supplies ballot codes only; ciphertexts come from the trustee's own analysis.
* Same gate as the tally (full log verification, key binding, election-close present, log evidence, witnessed checkpoint or typed override). Also refused:
  manifest without `spoil_trustee_decrypt` (`SPOIL_MODE_OFF`); code without a verified spoil record (`NOT_SPOILED`); spoil that is not in
  trustee mode (`reveal_digest` != 0, `NOT_TRUSTEE_MODE`); any code that appears in a cast envelope anywhere in the log, valid or not, or in
  the counted set (`BALLOT_WAS_CAST`; a cast ballot is never decryptable); a spoiled ballot that shares any ciphertext A component
  with any cast envelope in the log (`CIPHERTEXT_WAS_CAST`, audit TR-01: a partial decryption depends only on A, and a voter-key holder
  can re-wrap a cast ballot's ciphertexts and voter-bound proofs under a new code by changing `supersedes`); malformed/duplicate/oversize
  (>`MAX_SPOIL_REQUEST` = 64) requests.
  A request is all-or-nothing.
* Replay: each code is released at most once per share (`SPOIL_REPLAY`); the signed record is kept in the sealed bundle (`out.spoil`).
  Trade-off: a lost response cannot be re-fetched from the trustee; the requester must keep the packet. Re-serving the stored record would be a
  safe alternative if operators prefer idempotence.
* Works in states CONFIRMED/DRILLED/STANDBY/TALLYING/RELEASED; does not change state. Tally log gate was factored into `verifiedElection`.
* Needs from protocol (not done here): none blocking. Nice to have: a `spoil-share` record type + `collectSpoilShares` in protocol so the
  coordinator/verifier need not use trustee-local types, and publishing into the tally record's `spoiled[].shares` (types exist).
* Unaudited; not for real elections.

## Audit 2026-10-21 (AI-assisted, see docs/audit/trustee.md)
* TR-01 fixed: `CIPHERTEXT_WAS_CAST` refusal in `releaseSpoil` (above). Protocol/verifier should add the same rule (not done here).
* TR-02 fixed: `releaseTally` from CONFIRMED/DRILLED (election-open never imported) passes through STANDBY instead of failing
  `ILLEGAL_TRANSITION`; the full log gate still runs first.
* TR-03 fixed (concurrency part; the backup-restore part was already closed by the T2 release ledger): every bundle write
  (`Trustee.save`) is a compare-and-write under an exclusive lock file `<bundle>.lock` (created with O_EXCL, holds the pid, removed in
  `finally`). Inside the lock the sealed file on disk must hash to what this object opened or last wrote, else `BUNDLE_CHANGED`
  (STATE, 40) and nothing is written; a lock already held is `BUNDLE_LOCKED` (40, no waiting). The release ledger sync runs inside the
  same lock, so a second process/Trustee object with a stale copy can neither persist nor emit a second tally/spoil share. Behaviour
  change: two processes on one bundle now fail fast instead of last-writer-wins; re-run the command. A hard kill inside the write
  section leaves `<bundle>.lock` behind: delete it after checking no qv-trustee process runs. `--out`/backup may not target the lock path.
* TR-04 fixed: `verifiedElection` first compares the presented log with the trustee's imported log (`assertNoFork`): a different entry
  at a known seq, a known seq missing while later seqs are present, or a duplicated seq -> `LOG_FORK` (VERIFY, 20) before any other
  work (applies to `releaseTally` and `releaseSpoil`; refusal does not consume the release). Only entries the trustee validated on
  import (DKG records, markers) are known, so ballots are covered by the log evidence check, not by this one.
* TR-05 was already fixed by T8 (passphrase files are read via `readSecretFile`, group/other bits refused on POSIX, skipped on win32).
* Tests: `test/audit.test.ts` (TR-03/TR-04 tests failed before the fix: a second share over a different counted set was released, and
  a forked bundle was released against), `test/hardening.test.ts` T2 (restore) and T8 (passphrase file mode).
## QV-ADR-015 election-open binding
Test harness now posts a `roll-commit` and an `election-open` built with `electionOpenBody()` (binds manifest hash, `dkg-final` seq, roll-commit seq).
Trustee code needed no change: it ignores `roll-commit` entries and relies on the full-log `verifyElection` gate.

## Audit hardening (T1..T12)
* **T1 log evidence (API change)**: the election bundle passed to `releaseTally`/`releaseSpoil` must be `{manifest, manifest_hash, roll, log,
  log_evidence: {board, witnesses?, observed?}}` where `board` is the QV-18 log export (`bundleToJson`). Without it: `LOG_EVIDENCE_REQUIRED`
  (REFUSED, 60). The gate runs protocol `verifyLogStructure` over the supplied log: every log entry must correspond 1:1 to a board entry
  (author-authorised, signed header, body digest), the Merkle tree must match a log-signed (manifest `bb.log_pk`) head covering the whole
  log; any F finding -> `LOG_EVIDENCE_INVALID` (VERIFY, 20). So a cast envelope cannot be dropped from the supplied log to let `releaseSpoil`
  decrypt a cast ballot (castCodes come from the proven log). Order: content verification, key binding, election window, then evidence.
  The tally records stay stripped for the content verdict but are part of the evidence check (so a bogus tally must exist on the board too).
  Residual risk: the evidence is only as good as `bb.log_pk` and the log's own honesty; an entry the log never sequenced is invisible.
  Witness-quorum 0 manifests still need the evidence (head log-signed) but no cosignatures. No override exists for missing evidence.
  Requires `@quietvote/board` at run time (via protocol); not added to `package.json`.
* **T2 release ledger**: every released `tally-share`/`spoil-share` record is also written (before it is returned) to the public sidecar
  `<bundle>.releases` (`ledger.ts`, JCS, 0644). `Trustee.open` merges it (bundle file rolled back by copying an old backup over it ->
  guards come back, state forced to RELEASED if a tally share is found). `Trustee.restore(..., opts)` reads the ledger of the backup's
  recorded original path (`home`) or `opts.ledger` (CLI `--ledger`), adopts own valid same-ctx records, writes a ledger for the new
  path. No ledger found and the backup holds a key -> `NO_RELEASE_LEDGER` unless `OVERRIDE_NO_LEDGER` is typed (logged in `overrides`,
  CLI `--override-no-ledger`). `releaseTally` is idempotent only for the same counted set: the full gate runs even for the cached share
  and a different counted_root is `RELEASE_CONFLICT`. LIMIT: an operator controlling the filesystem can delete the ledger and the live
  bundle and restore any older backup with the typed override; this stops mistakes and stale restores, not a hostile operator. A
  hardware-backed monotonic counter would be needed for that. `keygen` refuses a path with an existing ledger.
* **T3**: see Witness gating above. **T4** `destroy`: `closed_at` must match `YYYY-MM-DDThh:mm:ss[.f]Z` and parse; election-close must be on
  the imported log (`NO_ELECTION_CLOSE`); closed_at >= voting_close - clock_skew_s (`AUDIT_BEFORE_CLOSE`). A minimum audit window
  (`audit_window_days`) is not in the protocol: TBD, deliberately not added.
* **T5/T9 backup**: refuses an existing destination (`BUNDLE_EXISTS`) and any destination whose real path (symlinks and `..` resolved, also
  for not-yet-existing files) is the bundle, tombstone, attestation, ledger or a registered backup (`BACKUP_SAME_FILE`). If the live save
  fails after the backup was written, the backup is shredded and the in-memory bookkeeping rolled back.
* **T6/T8/T11 CLI**: `--out` goes through `atomicWrite` and is refused if it resolves to the bundle/backups/tombstone/attestation/ledger
  (`OUT_PATH_PROTECTED`) or exists (`OUT_EXISTS`), checked right after the bundle opens, before any state change (so re-running a
  command with the same `--out` after a crash needs the file removed first). Passphrase files use `readSecretFile` (0600). Bad JSON ->
  `BAD_JSON` (20), missing file -> `NO_SUCH_FILE` (2), malformed `--claimed` -> `BAD_CLAIMED` (20), manifest without `roll` ->
  `MANIFEST_INVALID` (20), malformed transcript -> `TRANSCRIPT_FORMAT`.
* **T7**: repeat credit is capped at the number of distinct characters (`'a'x50` now ~4 bits).
* **T10**: cached round outputs are re-served only in the states at/after that step (`AT_OR_AFTER`); `abort` clears commit/dealing/shares/
  complaints/keyconf/keycheck and `derived`. **T12**: `releaseTally` needs STANDBY/TALLYING/RELEASED, checked before any log work.

## Dependency note
`@quietvote/board` added to package.json dependencies (workspace-internal; used by the log-evidence gate). package-lock.json gains the one workspace line; no external dependency added.

## B2 custody follow-up (integration review, 2026-10-30)

* **B2-08 / TR-08:** new backups record their canonical absolute destination and SHA-256 of the exact sealed bytes in the live
  bundle. Changing cwd or retargeting the original parent symlink does not change that destination. `destroy` checks the fingerprint
  on the same open descriptor it overwrites. Symlinks, paths with redirected parents, nonregular files, hardlinks and replaced files
  are preserved. Unsafe, missing or legacy backups without a fingerprint are returned in `backups_missing` with a manual-removal
  reminder; they are never reported removed. Legacy relative paths have no recoverable original cwd and are never resolved for
  deletion. A restored backup receives its own sealed fingerprint from the authenticated source bytes. An unremovable live bundle
  returns `BUNDLE_NOT_REMOVED` instead of claiming success. Flash/SSD erasure and arbitrary concurrent filesystem tampering remain
  outside the guarantee; the passphrase and any manually retained copies still need destruction.
* **TR-03 follow-up:** imported exclusive-lock/compare-before-write hardening now uses the canonical bundle path, including its
  ledger and lock sidecars. A failed save invalidates that `Trustee` object (`BUNDLE_REOPEN_REQUIRED`); reopen to continue. Before
  this fix, retrying a stale object three times could return an unpersisted second tally share for a different counted set after
  two `BUNDLE_CHANGED` failures. The release ledger still guards accidental rollback, subject to its documented filesystem limit.
* **TR-07:** removed the unused public `debugPlaintext()` diagnostic. JS string lifetime and the trusted embedding API's access to
  bundle data remain documented limitations; no memory-erasure guarantee is claimed.
* Regressions: `test/custody.test.ts` (cwd/symlink retargeting, replaced/legacy backups, unsafe shred, canonical locks) and
  `test/audit.test.ts` (`TR-03: a failed persistence invalidates cached outputs on the same Trustee object`). The focused five tests
  failed before these fixes and pass afterwards. Existing TR-01/03/04 adversarial tests remain in the imported audit suite.
* Unresolved choices are unchanged: TR-09 lost spoil-packet replay/idempotence, missing manifest audit-window fields, witness
  checkpoint size wording and base32-vs-hex log origin. This follow-up adds no protocol or authority-policy semantics.
* Relocated key-holding bundles opened directly also consult the recorded original home's ledger and tombstone. Missing original
  ledger returns `NO_RELEASE_LEDGER` and directs operators to the existing restore flow (explicit ledger or typed no-ledger override).
  This prevents opening a pre-release backup under a new name from silently bypassing its original release history. The invariant
  still assumes the operator does not deliberately delete/roll back every copy of the public ledger.
* Backup publication is exclusive even when separate share bundles race to the same destination; only one succeeds and the other
  returns `BUNDLE_EXISTS`. Sealing/fingerprinting precedes filesystem writes so late write failures can be cleaned up by exact hash;
  failed atomic writes remove their own temporary file. Restore registers the actual source path when a backup was moved/copied.
  Added regressions cover direct backup open, original tombstone, failed atomic-write cleanup, moved restore source and destination races.
* Restore adopts valid own records from an existing target-path release ledger before persisting or returning the restored object.
  Conflicting authenticated tally records (different counted roots/counts) from any recovery source fail closed with
  `RELEASE_CONFLICT`. The regression covers a deleted target bundle with its ledger retained, plus inconsistent signed source/target
  ledgers; forged/foreign records still do not count. The original source-ledger/typed-override requirements remain unchanged.
* A tombstone at the live bundle's own canonical path also blocks an older sealed copy written back there. Only an authenticated
  bundle already in `DESTROYING` may reopen beside that tombstone, solely to resume cleanup after a crash between tombstone write
  and final overwrite; release-state gates exclude it. Regressions cover both stale-copy refusal and an induced final-wipe crash
  followed by successful destruction resume. Final custody test run: 9/9 pass.

## Backup rollback diagnostics (2026-11-09)

* A failed live save after backup publication already attempted fingerprint-checked cleanup, but discarded both a refused
  cleanup and a thrown cleanup error. A remaining encrypted copy could therefore be absent from the live backup registry while
  the caller received only the original save failure. Fault injection reproduced `BUNDLE_LOCKED`/exit 40 with that copy still present.
* `backup` now returns `BACKUP_NOT_REMOVED` (REFUSED, exit 60) if rollback cannot remove the destination and cannot confirm it is
  absent. Its diagnostic identifies the canonical destination and instructs manual inspection/removal, resolving lock/write
  failures and reopening before retrying. The in-memory object is invalidated. Inaccessible paths are treated as unknown, not absent.
* The new diagnostic never includes the underlying arbitrary exception text or secret material. CLI `--json` retains the existing
  `{ok:false, code, kind, message}` shape. Successful cleanup preserves the original failure, as does an absent destination.
* Four regressions cover a cleanup RNG fault, safe refusal of replaced backup bytes, a pre-publication failure with no remaining
  destination, and CLI JSON/error/recovery behavior. Existing destination-race, CAS, release-ledger, alias and destruction-resume
  regressions are preserved. No re-serving, high-water, dealer, key format or protocol policy changed.
* This adds actionable recovery evidence for handled failures. A hard kill between backup publication and live registration can
  still leave an unregistered copy without running rollback; no transactional crash journal or physical erasure guarantee is added.
  That rollback audit was validated on Linux/POSIX. Native Windows ACL enforcement was subsequently added as described above; final-head hosted Windows qualification remains required.

## CLI unknown options (L1)

* `parseArgs` used to accept any `--name value` pair and ignore names no command reads, so a typo'd option (for example
  `--passphrase-fil`) let the command run as if the option were absent. Options are now checked against one allowlist of every
  option the commands read; an unknown option is a USAGE error (exit 2) before any value is consumed and before any state changes.
* The error names the option only when it is a plain lowercase word (at most 40 characters); otherwise it prints
  `(name withheld)`. The option's value is never echoed. Known options and their behaviour are unchanged.
* Follow-up: each command now accepts only the options it consumes. For example, `status --out F` and `status --generate-passphrase`
  fail before any passphrase prompt or file access. Duplicate value options and flags are refused instead of silently using the
  last value. `--witness-key` remains a single option; repeated keys are refused rather than dropping earlier values.
* Unexpected positional arguments are rejected without echoing their contents. A following `--option` cannot be consumed as a
  missing value. `finalize` does not emit a packet and therefore rejects `--out`; help now lists it separately.
* Regression tests: `test/cli-unknown-options.test.ts`, `test/cli-argument-safety.test.ts` (including spawned CLI secret canaries).

## Transcript option validation

* `--mode` accepts the three existing transcript modes (`online-dkg`, `airgap-dkg`, `airgap-dealer`); unknown values are usage errors
  before a secret bundle is opened. This validates existing modes without changing their semantics or the default (`airgap-dkg`).
* `--witness-key NAME=HEX` requires a nonempty single-line name and exactly 32 bytes of lowercase hex. Missing separators, truncated
  keys and extra fields fail before the transcript is read; diagnostics withhold the value. A name such as `__proto__` is stored as
  an own data property rather than interpreted as a prototype setter. The CLI still accepts one witness key per invocation.
* Regression tests: `test/cli-transcript-options.test.ts`.

## Offline board-entry export (2026-11-16)

* Added `export-entry` to bridge persisted trustee outputs to the existing `qv online election-submit` transport.
  The command wraps saved DKG outputs in signed board envelopes with the manifest-derived origin. A saved, gated
  tally release is re-signed in the server's existing `dec-shares` format with exactly the saved proof fields.
  It accepts no arbitrary payload, origin, private key or ciphertext and never invokes decryption itself.
* A bundle lock and sealed-file comparison reject stale instances. Failed-save invalidation, destruction and
  abort gates remain effective. Output publication is exclusive; protected paths and existing files are refused.
* Review found that `commit` also persists unreleased dealing data for crash recovery. A new regression failed
  on the initial exporter because it could export that dealing before `reveal`. Each export now enforces the
  existing command's permitted release states, in addition to requiring saved output. The regression passes.
* `test/board-export.test.ts` covers envelope signatures/origin, canonical record/proof preservation, missing
  outputs, missing tally evidence, stale/aborted bundles, unchanged release ledgers and CLI argument/path checks.
  `test/online-executable.test.ts` exercises actual trustee executables with production RNG/default KDF against
  the real server, then verifies the final export with the TypeScript and Python tools.
* This does not finish all-client acceptance: registration, coordinator/voter setup and public-file conversion
  remain test-harness operations. No protocol vectors, primitives, admission rules or verifier policies change.

## BT-14 opening budget — 2026-11-16

All vault opens, including restore, now pass a caller budget to the crypto
container opener: default `maxLogN=18`, matching production sealing. The CLI
accepts `--max-kdf-logn 18|19|20` on bundle commands. Use a higher limit only
when intentionally opening an existing higher-cost bundle; 19 and 20 permit
roughly 512 MiB and 1 GiB of scrypt working memory per open. The option never
reduces sealing strength or authenticates a header. API callers can set
`VaultDeps.maxLogN`; test-only weak KDF support remains explicit.

The crypto opener rejects noninteger, nonfinite and out-of-range caps with
`E_ARG` before reading the header. This prevents NaN from disabling the cap.
The production library maximum remains 20; the container format is unchanged.
This bounds one open; concurrent processes still require an operator memory
budget. No host memory benchmark or global process admission limit is claimed.
Regression coverage is in `test/kdf-budget.test.ts` and crypto second-wave tests.
Refs: QV-17-REQ-021.

## Shipped public-input preparation — 2026-11-16

The executable acceptance test now calls `qv election prepare` for ceremony `.qvl` inputs and release
JSON with complete board evidence. It no longer unpacks `.qvb` files in the test harness. Trustee release
checks, KDF defaults, key custody, protocol rules and the organizer/coordinator authority boundary are
unchanged. Coordinator setup and voter actions remain harness operations.

## Optional supplemental dice entropy (2026-11-27)

Accepted N-28 / QV-17 REQ-012 is implemented by `--dice-file` on `keygen` and
`commit`. The existing protected-file reader bounds and authenticates the input
handle; a byte parser accepts only six-sided digits and ASCII whitespace, with
8,192 digits / 64 KiB limits. File errors retain their typed exit classification
but omit the filename and underlying error text. No dice field is serialized.

The crypto wrapper hashes the normalized dice bytes for the HKDF-SHA256 salt and
requests fresh 32-byte platform RNG input for each expansion block. Its fixed
local info plus counter separates draws. All-zero, malformed or unavailable
platform output refuses without falling back to dice. This is optional local
randomness mixing, with unchanged wire records, bundle formats, KDF floors and
default RNG path. Raw input, normalized digits, source/expansion buffers and the
retained salt are wiped best-effort; existing JS/runtime lifetime limitations
remain. Replay of a saved commit never redraws randomness.

Acceptance includes independent Node HKDF composition, source failure despite
valid dice, input/permission/filename refusals, different dice and source inputs,
keygen opening, and exact persisted commit replay. Formal crypto review remains
a merge gate; these tests are engineering evidence.
