# R29 — board and archive verification, periodic integrity

Date: November 27, 2026 (America/Vancouver).

Baseline: [draft PR #79](https://github.com/djshellshoxxx/quietvote/pull/79),
commit `f7e055d839a369f27a1be2c7a2653340a74a4862`, tree
`bb8e8fb845fc53293137ab37fa74bf376ccb4921`. The preceding R28 source was fetched,
matched to the prepared local tree, and found clean. Its new commit passes the
actual DCO/subject check. Main remains unchanged.

This continuation uses `codex/quietvote-board-verifier-20261127`. It records
bounded engineering work, not independent cryptographic assurance or release
approval. QuietVote remains Experimental — not for binding elections.

## Plan

1. Complete the accepted larger-Merkle and serialized-append acceptance tasks,
   preserving the small-tree tests and the store's actual atomic contract.
2. Add strict offline reading of the existing checksummed `.qvb` container,
   using the board's existing tar/checksum reader. Preserve every board record
   and all existing manifest-pin, author-key and verdict rules. Test real-server
   output against the full JSON form and exercise the actual offline CLI.
3. Resolve the explicitly nullable outer redaction representation under QV-18,
   without permitting null in signed QV-JSON artifacts or discarding evidence.
4. Finish vector hygiene over the frozen corpus: exact manifest membership,
   byte bounds, encoding and schema-aware field checks, with narrowly recorded
   intentional malformed inputs rather than a blanket negative-vector waiver.
5. Complete board tamper canaries after checking what the existing mutation
   tests already cover. Keep expected failed checks explicit and preserve the
   self-test's positive control and corpus drift check.
6. Run only the composed checks needed by these changes, including the shared
   verifier's browser build and offline consumers; record remaining contract
   and native/human gates separately.

## Larger Merkle and append acceptance

The five-file [board acceptance handoff](../reports/board-append-merkle-acceptance-20261127.md)
was independently read and integrated after checking the receipt, patch digest,
every source blob and the unchanged production modules. The independent hash
reference uses native SHA-256 and immutable ranges. It is anchored to the
existing CT roots and uncached recursive checks.

The added cases compare every growing/historical root through 1,025, 11,083
larger-prefix inclusion paths and 11,908 larger-prefix consistency pairs. All
positions and old sizes are covered at nine power-of-two boundary prefixes;
other larger prefixes use the stated samples. The original tests through 200
remain unchanged.

The append case releases 1,000 pending callers in deterministic interleaved
batches into one synchronous sequencer. It checks 35 actual interleaved
duplicates, an atomic precommit exception at sequence 512, identical-byte retry,
all 1,005 resulting entries/receipts/roots, and replay. A separate failed-close
case proves that failed persistence does not advance grammar or consume a nonce.

Author validation passed 14 focused cases and all 82 board cases with zero skips;
the strict board typecheck passed. These results bind to unchanged source blobs.
No production correction was needed for the exercised contracts. This evidence
does not establish multiple writers, process-kill recovery, fsync/SQLite crash
durability, protocol-ballot proofs, witness quorum or finality.

## Offline archives and retained redactions

The verifier now reads the existing checksummed `.qvb` archive directly. It
reuses the strict board reader, bounds archive size, file count and descriptor
size, and checks gapless entry framing, numeric checkpoint names, entry digests,
key bindings and convenience-record equality. It retains all protocol records,
including the server's derived records. Archive metadata does not become an
independent author-key source. No extraction or network operation is introduced.
The [archive report](../reports/verifier-qvb-20261127.md) records a complete
witnessed positive fixture, JSON/archive report parity and ten actual offline
CLI child executions with an outbound-operation guard and positive controls.
That guard is not an operating-system network sandbox.

QV-18's nullable outer body representation required a separate parser entry
point. `parseJsonContainer` permits null only through a trusted, exact-path
predicate; its nullable return type is distinct. The signed-artifact
`parseQvJson` API, no-null type and canonicalizer retain their old restrictions.
The loader permits null only at the root JSONL `body_b64u` field or the full
JSON board entry's `body_b64u` field. Nested lookalikes, object-shaped indexes,
signed bodies and metadata do not acquire a general null exemption. Headers,
null rows and redaction evidence remain in the bundle, so missing bodies retain
the existing incomplete/partial verdicts.

Root review found that the initial sequence-zero binding call omitted its
explicit expected sequence. The final code uses `checkEntry` with sequence zero.
A validly coordinator-signed different manifest, even with a matching new pin,
cannot replace the redacted sequence-zero commitment. The generated positive
case remains INCOMPLETE with a PARTIAL board and V4 not run. Real-server archive
and full JSON representations agree before and after an explicit stored-body
redaction, with keyless archive reads retaining the same roots and headers.
This does not implement scheduled body retention or qualify cold redacted import.

The [redaction report](../reports/verifier-redacted-container-20261127.md)
records the final reviewed eleven-file handoff, baseline failures, 84 passing
author cases and 23 canonical-JSON vector checks. Root's final composed suites
are recorded below. Ordinary final-server derived aggregate/decryption records
still produce the existing strict compatibility refusal; this adapter does not
declare that separate contract complete.

## Framing, canaries and frozen-vector checks

Strict tar-name and checksum-list decoding now preserves a UTF-8 BOM so the
existing field grammars can reject it. Previously `TextDecoder` silently removed
it before those checks. Two normal controls and the distinguishing malformed
cases are covered; the permissive tar utility retains its existing behavior.
The same preserve-then-reject correction applies to archive JSONL/checkpoint
decoding. [Framing and policy evidence](../reports/board-archive-policy-acceptance-20261127.md)
includes retained baseline failures and ten adjacent archive/server passes.

Three [board canaries](../reports/verifier-board-canaries-20261127.md) exercise
a dropped entry, reordered entries and conflicting valid signed checkpoints.
Each starts from a healthy complete witnessed control and requires its exact
failed checks and finding codes. Board checks are included only for bundles
that actually contain the board representation. The 29 legacy stored canaries
and tiny positive control are byte-identical. There are 32 stored and 12
synthetic cases, for 44 self-test cases; this corpus is not bundled into the
browser verifier. No quorum, signature or verdict condition was relaxed.

The [vector-hygiene check](../reports/vector-hygiene-20261127.md) validates the
frozen 88-file, 2,843,552-byte corpus without changing it. It checks fatal UTF-8,
BOM/newline framing, integer JSON tokens, inclusive byte bounds, schema-aware
hex/time fields and exact MANIFEST membership/digests. Its two path-specific
exceptions identify already-intentional malformed inputs and must be consumed.
It does not exempt all negative vectors or claim a signed-corpus authenticity
proof. The thirteen focused hygiene cases also pass on Node 22.

An [authenticated joint-key regression](../reports/joint-key-claim-acceptance-20261127.md)
changes only the claimed DKG final key, preserves the qualification mask and
rebuilds valid coordinator/board authentication. The existing verifier derives
the correct key, reports precisely `E_DKG_FINAL` at its existing local severity,
and fails only `keys.trustees`; the existing overall PASS semantics remain.
An otherwise identical stale-signature control fails authentication instead.
This is acceptance of the implemented semantics, not an independent security
review or a new verdict policy.

## Periodic server integrity and policy acceptance

The server now schedules the existing full self-audit every six hours after
startup. One periodic job may be queued/running at a time on the existing
single-heavy-job runner. The sweep pages through non-deleted elections, yields
between work and honors shutdown cancellation. Existing integrity mismatches
continue through the existing quarantine/alert path. An unavailable election
does not prevent later elections from being checked; the job ends with a fixed
aggregate incomplete error that does not disclose the thrown exception.
Admission stops before jobs and storage close.

The [scheduler report](../reports/periodic-integrity-20261127.md) covers the
distinguishing missing-six-hour-tick baseline, overlap prevention, failures,
shutdown, pagination and actual archived/imported read-only databases. It does
not claim that a 101-identity pagination seam is a 101-database load benchmark.
Restore's existing pre-publication audit remains, and gossip still defaults to
disabled. The separate hourly SQLite quick-check/unclean-start requirement is
not closed by this scheduler. The scheduler/gossip subset passes all 23 cases
on Node 22 as well as in the complete Node 24 server run.

The [policy acceptance report](../reports/board-archive-policy-acceptance-20261127.md)
also records a real-server zero-witness state/export test. It proves that zero
witnesses are disclosed and cannot produce WITNESSED status, while documenting
that `noneAcknowledged` is currently derived rather than an explicit signed
manifest acknowledgement. That remaining contract is still open. Python adds
two strict Ed25519 R-policy regressions: an identity R satisfying the bare
equation, and noncanonical identity aliases. These, the existing mixed-subgroup
case and both primitive signature cases pass without changing crypto runtime.

## Composed validation

The following runs use the final integrated production/test sources on Linux
and Node 24.22.3 unless stated otherwise. Counts overlap author checks and are
not additive unique-test totals. A started or queued check is never a pass.

| Scope | Completed result |
| --- | --- |
| Root TypeScript and explicit CLI/server/e2e entrypoints | Both pass with a 768 MiB heap limit. |
| Complete board suite | 84/84 pass, zero skips; 37.542 seconds. |
| Complete crypto suite | 116/116 pass, zero skips; 4.417 seconds. |
| Complete protocol suite | 439/439 pass, zero skips; 133.187 seconds. |
| Complete verifier suite | 65/65 pass, zero skips; 69.769 seconds. |
| Complete server suite | 659 pass, one existing Windows-only case skipped, zero failures; 660 cases, 221.117 seconds. |
| Node 22 scheduler/gossip subset | 23/23 pass, zero skips; 9.173 seconds. |
| Node 22 vector hygiene | 13/13 pass, zero skips. |
| Workflow coverage and actual workspace launcher | 13/13 pass, zero skips; 4.129 seconds. |
| Shared web/CLI consumers | 50/50 pass, zero skips; 151.001 seconds, including the real-server export assertion. |
| Production verifier browser journey | 29/29 checks pass with required Chromium, actual serving policies and a real server. |
| Production web build | Build `543d895d73df`: aggregate JS 194,110 gzip bytes / 204,800; entry 57,220 gzip bytes (174,201 raw); standalone verifier 202,685 bytes / 409,600. |
| Repository structural gates | Dependency boundaries, 132-file vendor check, 35-registry-entry/eight-workspace lockfile check, five workflow action-pin checks, links, trace structure and claims lint pass. Existing D-97 dependency deviations remain explicit. |

The first current-tree secret scan found the new board-canary corpus's public
signature keys. Review traced each value to the unchanged frozen log-layer
fixture and to public signature-key locations. Only three path/rule/digest
allowlist tuples were added; no value-wide or file-wide exclusion was added.
The reviewed scan then passed 1,633 files with zero unexcepted findings and four
existing binary exclusions. The subsequent composed scan passed 1,636 files,
with 2,698 exact allowed occurrences, zero unexcepted findings and the same four
binary exclusions. This is the bounded scanner's result, not proof that source
contains no possible secret.

The first build command used an unsupported `--out` argument and refused before
building. The corrected existing positional-output form passed; no build code
was changed. The first claims scan found two ambiguous uses of the word
"audited" in the scheduler report. Those descriptions now say "checked";
the subsequent 446-file/45-rule scan has zero findings. These failed attempts
remain in the local evidence rather than being assigned successful results.

## Hosted observations and Windows follow-up

At November 27, 2026, 20:03 America/Vancouver (November 28, 04:03 UTC), the
source-specific full-matrix runs were:

| Draft source | Run | Observed jobs |
| --- | --- | --- |
| PR #76 | [46087969999](https://github.com/djshellshoxxx/quietvote/actions/runs/46087969999) | 25 success, one failure, one queued. Both Windows trustee/crypto Node versions passed. |
| PR #77 | [46091204879](https://github.com/djshellshoxxx/quietvote/actions/runs/46091204879) | 19 success, one failure, two running, five queued. Windows Node 22 trustee/crypto passed; Node 24 was queued. |
| PR #78 | [46098436998](https://github.com/djshellshoxxx/quietvote/actions/runs/46098436998) | Two success, 25 queued. |
| PR #79 | [46103941698](https://github.com/djshellshoxxx/quietvote/actions/runs/46103941698) | 27 queued, one intentionally skipped optional coverage job. |

PR #76's Windows Node 22 CLI/board job failed the real-server export test because
the expected retained file was absent. The assertion evaluated `readFileSync`
before displaying the CLI result, hiding the underlying exit/stderr. This
continuation first asserts the expected child status and file existence, with
child output in both messages. It does not weaken the file/content assertion
or establish the missing file's original cause. That job's board suite passed.

PR #77's Windows Node 22 server/web job had two registration-fixture failures
reported as native private-file `UNAVAILABLE/TIMEOUT`. One diagnostic recorded
15.089 seconds, 144 heartbeats and a 124 ms largest gap; this does not establish
the host-level cause. Its web suite passed all 465 cases. The existing
two-concurrent-file cap for Windows Node 24 CLI/server tests now applies to
Node 22 as well. The job timeout, native operation deadline, permission checks
and test assertions are unchanged. The distinguishing workflow check failed
before the edit and passes afterward. New source-specific Windows execution
is required before calling the native failures resolved.

## Next work and retained boundaries

The next continuation is preparing explicit minimum-roll/pre-roll lifecycle
validation, measured 10-by-10 ballot acceptance and the remaining named verifier
coverage/immutable-ballot tests. These are separate source changes and are not
included in the counts above. The [unfinished-work ledger](UNFINISHED_WORK.md)
retains the final-server derived-record contract, governed lifecycle, durable
checkpoint custody, native platforms, human accessibility/locale/crypto review,
release custody and approval requirements. No main merge or release approval
is asserted by this continuation.
