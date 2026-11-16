# QuietVote implementation checkpoint — 2026-11-16

Status: continued implementation and consolidation; **assignment remains incomplete**.
This is an experimental prototype, not a beta acceptance, release authorization,
external cryptographic approval or independent professional audit. No workers
remain persistent after this session.

## Source and publication

- Starting remote integration head: `5382d5f89226a7464025480c3a6be606da79859a`.
- Review branch: `codex/quietvote-resume-20261116`.
- Main stays at `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Consolidated PR44 `8d6e0961be8f57bf3c124e7b979afbb5ed904582` and PR46
  `03f2f0c` source histories; source branches/PRs were retained.
- The shell could fetch but could not authenticate Git pushes. Connected GitHub
  Git-data writes publish identical trees with reconstructed commit metadata;
  `Original-local-commit` trailers and the publication map preserve local review
  provenance. Local commit IDs in reports are local evidence IDs; resolve their
  published equivalents through that map. Each published tree was compared with
  its exact local tree before advancing the new branch. No force-push was used.
- Published code snapshot: `1c3845d193285c9ab2b19bbb7898b0de430d83c3`, identical tree to local `c79d8760eb46be51c161e44a4ff46ce6157faa4e` (`9af86333339b2d9fb396f825603f98f34cb623ee`).
- Draft review: [PR47](https://github.com/djshellshoxxx/quietvote/pull/47).
- [Publication map](../reports/resume-20261116/commit-publication-map.json) resolves the recorded local history. Later checkpoint commits change documentation/evidence only.

## Implemented and reviewed

1. Recovered PR44 missing-KEK refusal, tally crash recovery, authoritative delete
   guard, trustee unknown-option validation and accepted-receipt retention.
2. Integrated S1-02 spoiled-ciphertext reuse refusal. Repaired the inherited test
   fixture without lowering its privacy floor; restart now proves replay-derived
   spoil tracking and the final protocol-verification assertions execute.
3. BT-11: reject static root/file/directory/nested symlinks and special files;
   canonical containment, no-follow opening where supported and file identity
   checks. Operator-owned non-writable build trees remain required.
4. BT-15 and RV-02: best-effort cleanup on bundle sealing **and opening** derivation,
   key-import and AEAD exceptions; deterministic ciphertext stays unchanged.
5. OPS-B: exclusive canonical data-directory lock before DB/KEK access, failed
   startup cleanup and idempotent shutdown. HTTP handlers, runtime opens, every
   running job, webhook outcomes, gossip and retention drain before DB closure
   and ownership transfer. Forced termination leaves a manual-recovery lock.
6. BT-12: missing/corrupt storage failures produce count-only durable sweep audit
   records and privacy-filtered operational alarms. An audit-store failure itself
   alarms and cannot mark the sweep successful. Shutdown awaits the active sweep.
7. Trustee CLI rejects unexpected/unused/duplicate options without echoing
   positional values; validates transcript modes and witness-key syntax before
   opening sensitive files.
8. OPS-A: strict `qv-server` executable/config boundary, explicit public origin,
   data directory and registration choice, bounded config reads, `--check-config`,
   actual startup/readiness/SIGTERM checks, API-only deployment scaffolding.
9. `qv online` management/packet-relay/export slice, timeout/response bounds,
   no redirect or automatic mutation retries, honest ambiguous-delivery errors,
   private no-overwrite exports. Pure request-signing moved to board with fixed
   known-answer compatibility; no package dependency or policy exception added.

Actual online acceptance exercises the real server, qv command runner, real
crypto and board, 2-of-3 ceremony packets, three casts, close, shares, tally and
export. TypeScript and Python shared supported reports agree for that fixture.
Trustee operations still come from the World helper, not the qv-trustee
executable. Python does not independently check board/witness/receipt evidence
or offer the same manifest-pin CLI. This is a useful integration slice, not the
mandatory all-shipped-client acceptance test.

## Independent agent review and remediation

The [bounded seven-lens report](../reports/resume-20261116-review.md) records
separate worker review, reproductions and limitations. Review found and the
implementation corrected the S1-02 fixture failure, opener cleanup holes,
retention audit-failure invisibility and premature directory ownership transfer.
The final full run additionally found that changing `pool.closeAll()` into a
permanent shutdown broke existing runtime-replay callers. The correction keeps
reusable eviction separate from permanent shutdown; existing assertions remain.
The online adapter and shared signer received a separate source review and
independent known-answer/no-retry test run (2/2 passed).

## Qualification

`npm run check` completed with exit 0: typecheck and **1013 workspace tests
passed, 0 failed, 0 skipped** on the source snapshot above. Package counts:
board 76, CLI 54, crypto 88, protocol 215, server 205, trustee 105,
verifier 25, web 245. Repository/workflow tooling tests: 74 passing.
Lockfile, dependency boundaries (known D-97 deviations retained), links,
trace-link check, range whitespace and high-level dependency audit passed;
the dependency audit reported zero vulnerabilities. The corrected election,
gossip and import suites also passed 27/27 without changing existing assertions.
[Qualification record](../reports/resume-20261116/qualification.json) includes
commands, source/tree identifiers, supported/unsupported counts and the rejected
pre-correction attempt. Documentation-only updates do not change tested code.

Known gates already reproduced:

- Strict TS/Python comparison: exit 1; 27/27 verdict agreements, three detailed
  report mismatches (17 fields) for count-altered, manifest-signature-removed and
  result-flipped. Comparator unchanged. Exact output:
  [verifier-comparison.json](../reports/resume-20261116/verifier-comparison.json).
- Python vectors: 229 PASS, 0 FAIL, 53 explicitly not implemented (282 total).
- TS vectors: 412/412 passing, one unsupported DKG vector file not run.
- Python unit tests: 58 passing.
- Browser runner attempted all five journeys with Chromium: launch blocked by
  `socket() failed: Operation not permitted` in process_singleton_posix.cc.
  Hosted CI run 43837340020 subsequently passed the production browser journeys,
  CSP and automated accessibility job on the exact published code snapshot. Its
  pseudo-locale visual workflow also passed. Manual/assistive-technology acceptance
  is still not established.
- Claims lint: exit 1, eight findings in two historical audit documents; no rule
  or gate suppressed. Historical statements were preserved, with current repair
  status recorded here and in the inventory.
- Docker/Compose/systemd runtime and Windows/macOS qualification were not executed.
- Hosted code-snapshot CI: all ten other jobs passed, including the complete
  Ubuntu Node22/24 workspace matrix, typecheck/supply-chain, production browser
  journeys/CSP/automated accessibility. The vectors/Python/build job passed its
  earlier steps and failed at the preserved strict verifier comparator.
  [CI evidence](../reports/resume-20261116/hosted-ci.json) records the exact code
  SHA, run and jobs. No all-green CI claim.

## Remaining owner decisions

- **B3-01 / ADR-028 registration:** raw invite code + `(election_id,pk)` server
  contract vs hashed invite + different web signature framing, and label policy.
  Decide exact bytes, storage/signature binding and migration before implementation.
- **QV-ADR-027/028 authority:** the disputed lane contains nonce/control/replay,
  rollback/keyless signing, schema and policy changes; do not merge it wholesale.
- **P1/TSV-05, external manifest anchor and D-92..D-96:** decide missing-evidence
  verdicts, pipeline stopping, result fields and unsupported Python modes before
  changing vectors or comparison expectations. See OPEN-DECISIONS for alternatives.

These decisions block complete real-client registration and verifier acceptance.
They do **not** imply the remaining engineering backlog is exhausted.

## Next actionable work

1. Complete offline backup verification/restore and a real restore drill with
   separately provisioned KEK; do not silently replace lost keys.
2. Complete actual qv-trustee executable ceremony/tally acceptance, packet
   generation and remaining CLI parity/independent receipt checks.
3. BT-13 durable gossip health; BT-14 caller work-factor policy/cap for hostile
   bundles; unresolved outbox/idempotency/crash and resumable-deletion cases.
4. Web durable uncertain-send recovery across reload, connected organizer journey
   and real-server browser acceptance on a host that can launch Chromium.
5. Obtain decisions above, then implement authorized verifier/registration changes
   with shared negative vectors and independent review. No comparator weakening.
6. Separate KEK custody, witness independence, monitored disclosure contact,
   external crypto/security review, native translation and assistive-technology
   review, deployment trials and release governance remain external/owner work.

The [inventory](../reports/resume-20261116-inventory.md) contains scoped feature,
security and all-51-remote-branch dispositions. Trace links are presence evidence;
no assertion that all 730 requirements were manually assessed or satisfied.

## Resume

```sh
git fetch origin codex/quietvote-resume-20261116
git switch -c codex/quietvote-next origin/codex/quietvote-resume-20261116
npm ci --ignore-scripts --no-fund
npm run check
npm run vectors:check
(cd verifier-py && python3 -I -m unittest)
python3 -I verifier-py/qv_verifier vectors test-vectors/v1
npm run verifiers:compare   # retained held failure; inspect, never suppress
npm run lockfile:lint
npm run deps:check
npm run links:check
npm run trace:check
```

Start from the published branch, read this checkpoint and the decision register,
then assign the next independent tasks in isolated worktrees. Main/release/public
hosting remains unapproved. A passing internal test is not a real-election safety
claim or a replacement for external review.
