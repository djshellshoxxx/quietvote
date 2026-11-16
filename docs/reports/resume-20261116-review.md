# QuietVote continuation: bounded independent agent review

Date: 2026-11-16. Review target: `codex/quietvote-resume-20261116` through
`182cb508503c1ee5f6e6410a7beed6abcd02423c`. Discovery started at
`5382d5f89226a7464025480c3a6be606da79859a`.

This is a separate AI worker's source and focused-test review, not an exhaustive
audit, independent professional security audit, external cryptographic approval,
or release authorization. The reviewer did not author the production fixes. The
reviewer authored the S1-02 regression-fixture repair at `438e2ba` after finding
that the inherited test did not reach its final assertions. Production changes
and that test repair also require the lead's review and final qualification.

The review worktree's source tree matched the target at the recorded review tip.
Tests ran locally on Linux, Node v24.22.1, Python 3.12.14; Python execution is not
part of the focused results below. Later commits need their own qualification.

## Seven review lenses

| Lens | Source and checks inspected | Conclusion and boundary |
|---|---|---|
| Cryptographic correctness | `crypto/src/bundle-cipher.ts`, sealing/opening cleanup tests, deterministic ciphertext assertion | The cleanup changes preserve the container construction and existing error classes. Allocated byte-buffer cleanup now covers derivation/import/AEAD exceptions. Proof constructions, nonce registry, DKG correctness, timing behavior and physical memory erasure were not established by this review. |
| Election integrity | PR44 tally recovery/delete-state changes, S1-02 ciphertext projection/admission, real-server regression and restart | Spoil exclusion is rebuilt after restart; both cast/spoil orderings are rejected. Three legitimate casts complete the regression election and protocol verification. Aggregate recovery and no-double-aggregate tests pass. This is not acceptance of every client, every import path or both verifiers. |
| Privacy | Static-file boundary, secret cleanup, trustee argument diagnostics, retention logs/audit fields | Static symlinks/special files fail startup; CLI positional canaries are withheld; retention failure records avoid exception text and personal fields. Best-effort buffer wiping cannot erase JS strings, library copies, CryptoKey internals or physical memory. The local filesystem must remain operator-controlled. |
| Server and infrastructure | Data-directory acquisition, build/start/stop cleanup, jobs/webhooks/gossip/HTTP/pool drain, retention failures | Directory ownership is acquired before persistent-state access and retained while accepted work drains. Multiprocess/alias, failed-start and shutdown tests cover the repaired paths. Stale-lock recovery deliberately requires operator intervention; host compromise and hostile/shared filesystem semantics are outside the tested guarantee. |
| Bulletin board and verification | S1-02 log export/protocol verdict, retained audit findings, board/static/verifier boundary | The regression's refused cast is absent from the public log and its Benaloh check passes. Full-election PASS without board evidence, unanchored result semantics and Python board capability remain unresolved. No board/protocol verdict policy was silently changed. |
| Architecture and completeness | Consolidation ancestry, isolated production diffs, launcher/config boundary and service reuse | The launcher reuses the server instead of duplicating election rules. Source changes are confined to cleanup, input/filesystem boundaries and lifecycle ownership. Historical branch consolidation recovered real fixes. Online organizer CLI, real client election acceptance, backup restore and several security/feature tasks remain incomplete. |
| Release readiness | Launcher process tests, strict configuration, deployment examples, existing decision/handoff records | Explicit data directory/public origin/registration mode and strict bounded config are tested. Docker/Compose build/runtime, systemd execution, hosted OS matrix, assistive technology, external protocol review and release governance are not qualified here. Main/release/deployment approval is not given. |

## Review findings and dispositions

| ID | Finding and reproduction | Disposition |
|---|---|---|
| RV-01 | Original S1-02 regression rejected the reused cast correctly but later failed `E_BELOW_FLOOR`: only two legitimate casts remained under a floor of three. It had no restart coverage. | Fixed in test-only `438e2ba82bad9ff0046fbfa89c7a520547060782`: four eligible voters, three legitimate casts, unchanged privacy policy; restart after accepted spoil; immediate rejection/reason and absent-log assertions. Focused test passes with final protocol PASS and count three. |
| RV-02 | Opener derived its wrapping key before entering cleanup and derived the payload key outside its cleanup boundary. Injecting a KDF-entry exception left the captured passphrase buffer nonzero. | Fixed in `eccf7e3af5aaf77a176dca8f37bc3c5d73968668`. Independent opening-failure tests pass. No container-format or proof-policy change. |
| RV-03 | Retention summary audit write preceded its structured log event. An injected audit-store failure produced no event and left success status set. | Fixed in `ebb045a633d48ba2ad9ce7ac08620a6f62a69fe1`: `RETENTION_AUDIT_FAILED`, failed health status, rejected operation and secret-free diagnostic. Independent regression passes. Audit durability cannot be promised while its store is unavailable. |
| RV-04 | Initial lock lifecycle relied on `JobRunner.stop()`'s five-second timeout for non-import work and did not await in-flight webhooks/gossip. A paused real JobRunner backup remained active after stop returned and a second server acquired the directory. | Fixed in `182cb508503c1ee5f6e6410a7beed6abcd02423c`: all jobs, current gossip, webhook outcomes, accepted HTTP handlers and opening runtimes drain before storage closes/lock releases. Independent focused drain tests pass. |

No additional blocking defect was identified in the reviewed static-boundary,
secret-cleanup, retention, trustee-option, launcher or final drain diffs. This is
a bounded finding statement, not a claim that those components have no defects.

## Executed evidence

Commands are relative to the repository root. Results apply to the stated review
stage; overlapping suites are not added into an inflated total.

| Stage | Command | Result |
|---|---|---|
| `9200218`, initial review | `node --test packages/crypto/test/bundle-cipher.test.ts packages/server/test/static-boundary.test.ts packages/server/test/s1-spoil-then-cast-rewrap.test.ts` | 18 pass, 1 fail. Failure was RV-01; BT-11 and sealing cleanup cases passed. |
| Test repair on `9200218` | `node --test packages/server/test/s1-spoil-then-cast-rewrap.test.ts` | 1 pass; restart, reverse-order control and completed protocol verification exercised. |
| Initial lock/retention | `node --test packages/server/test/data-lock.test.ts packages/server/test/retention-health.test.ts` | 8 pass before the later audit-write regression was added. RV-03/RV-04 were found by separate injected-failure reproductions. |
| Through trustee `e37528e` | `node --test packages/server/test/retention-health.test.ts packages/crypto/test/bundle-open-cleanup.test.ts packages/trustee/test/cli-argument-safety.test.ts packages/trustee/test/cli-unknown-options.test.ts` | 23 pass; includes corrected audit-store failure and opener derivation-error cases. |
| Through trustee `55609c2` | `node --test packages/server/test/launcher.test.ts packages/trustee/test/cli-transcript-options.test.ts` | 9 pass; real process/config/start/readiness/SIGTERM and transcript options. |
| Final reviewed code `182cb50` | `node --test packages/server/test/shutdown-drain.test.ts packages/server/test/tally-crash-window.test.ts` | 7 pass; pending runtime, accepted HTTP handler, long-running backup, webhook, gossip, crash recovery and aggregate idempotence. |
| Final reviewed code `182cb50` | `npm run typecheck` | Pass. |
| Review document | `git diff --check`; `node scripts/check-links.mjs` | Pass; 1,209 links in 206 files, none broken. |

The lead's final qualification record must supply whole-workspace, vector,
cross-verifier, browser/build, tooling and supply-chain results on the final
integration SHA. Historical successful runs do not substitute for those results.

## Consolidation conclusions

- PR44 (`8d6e096`) held the trustee unknown-option, missing-KEK, authoritative
  deletion-state, tally-recovery and receipt-preservation fixes absent from the
  initial integration target. Its duplicate twin branch had the same tip.
- PR46 (`03f2f0c`) held S1-02 ciphertext-reuse admission work absent from the
  initial target. Its source hunks did not collide with PR44's recovery changes.
- Original implementation/audit branches and the ten zero-codex fix branches
  were already ancestors. PR42 was subsumed by PR44. The visual-CI repair was
  patch-equivalent to the already integrated signed repair.
- Obsolete README/wiki branches would regress current status descriptions.
  Historical receipts and future lane directives are evidence, not fresh
  implementation qualification. Disputed PR27 authority changes remain held.

## Remaining gates and work

Owner-held protocol/authority questions remain explicit: B3-01 registration,
disputed QV-ADR-027/028 authority, D-92 through D-96 report/verdict semantics,
P1/TSV-05 full PASS without adequate board evidence, nonce-label/hedging changes,
control-sequence replay/rollback and zero-seed policy changes, and W15 preload
authority. Missing external manifest-anchor verdict semantics are part of the
unresolved assurance contract. Do not silently choose these through a test edit.

External/owner operational requirements include monitored security contact and
keys, release branch protections/reviews, independently operated witness/monitor
topology, separate KEK custody policy, external cryptographic/application review,
native translation and assistive-technology qualification. Local test passes do
not satisfy these requirements.

Actionable engineering work also remains; it is not all owner-blocked:

- BT-13 durable gossip outage/health history and alertable stale-peer state.
- BT-14 trustee bundle opens still omit caller `maxLogN` in `trustee/src/bundle.ts`,
  permitting the library's unauthenticated maximum work factor. A measured
  operational resource policy and pre-KDF rejection coverage remain needed.
- Web high-cost KDF confirmation remains optional in the embedding dependency
  interface (handoff B-2); interactive wiring alone does not enforce every caller.
- Offline server backup verification/restore and a complete restore drill with
  independently retained KEK material are unfinished.
- Online organizer/voter CLI parity, complete supported-client election
  acceptance with both verifiers, remaining verifier capability gaps, additional
  adversarial/concurrency coverage and documentation/traceability work remain.

The final reviewed changes are suitable for further integration qualification
and owner review. QuietVote remains an incomplete, unaudited prototype; this
review does not establish beta completion or real-election readiness.
