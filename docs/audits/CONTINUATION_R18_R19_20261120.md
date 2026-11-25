# R18–R19 checkpoint consolidation and fresh-worker handoff

Date: 2026-11-20. All three independent R18 workers completed before three fresh
R19 workers started; all six have now completed and their reports are integrated.
The [R18 independent handoff](CONTINUATION_R18_INDEPENDENT_20261120.md) records
the first set in detail. Scheduled [R15](CONTINUATION_R15_20261120.md),
[R16](CONTINUATION_R16_20261120.md), [R17](CONTINUATION_R17_20261120.md) and
[R18](CONTINUATION_R18_20261120.md) are separate earlier source checkpoints.

## Consolidated source and corrections

The exact published R17 and scheduled R18 sources were recovered through supported
GitHub reads. Their complete local trees matched remote trees `79f4fa63e9094b61b6c370de0f225455ff507fd4`
and `c3e04b91ff324addde7551a777f4a93c8906e817`, respectively, after every changed
blob was checked. Local R18 equivalent `c1f413ce14cf750199fea019d6c11948e1ed8f8b`
corresponds to published `5485deb10d24ca0e64628746e954676a60919c50`; publication
must preserve the remote ancestry rather than substituting the equivalent local graph.

| Change | Exact implementation and reviewed behavior |
| --- | --- |
| Retained byte ownership | `ba9f181b53ea2aa1fe7e12b1e2592e8065e44e90`: an unchanged pin proposal copies into a new Uint8Array even when its input is a Node Buffer. The original signed note remains byte-exact. |
| Empty and equal-size pin rules | The same repair enforces the specified empty root for every zero-size note and directly compares equal-size roots. Growth still requires exact old/new consistency verification. |
| Shared verifier equality | `561fb1ff4b625c2911b64e1d08dd1f9f2ed91c7b`: zero-to-zero requires an empty proof, the canonical empty old root and an equal new root. Zero-to-positive and positive-size algorithms and guards are unchanged. |
| Origin/key storage boundary | The storage draft now explicitly requires origin-level key association before treating an absent pair-specific path as first use. It does not adopt a provider or silently permit key changes. |
| Native diagnostics retained | Scheduled R18's identical CLI/trustee changes retain finite TIMEOUT and voter-key/invite fixture labels. Deadline, custody, process termination and no-retry behavior are unchanged. This does not establish a latency repair. |

The final reviewed pin-helper blob is `835d5e5b491dbcf902c0a513ba0089ccca2b1fe8`;
the shared Merkle verifier blob is `cf48bb436c5ee2b9ca01d65ed679858a591f2680`.
Both native TypeScript bridge copies remain blob `dbec7d6a4fa83008a66fce48c100ff12c14569f7`.
No checkpoint storage or CLI persistence integration was added.

## Completed independent workers

| Round | Code audit | Functional bug hunt | Defensive security review |
| --- | --- | --- | --- |
| R18 | [Report](../reports/independent-checkpoint-code-r18-20261120.md), original `df158839893eaf3fab817e7f88e4edbaf0dd2979`; reviewed the actual helper repair | [Report](../reports/independent-checkpoint-bugs-r18-20261120.md), original `f1a889d68e1aec62215ba9ad142bda1429c01fee`; four ordinary groups executed | [Report](../reports/independent-checkpoint-security-r18-20261120.md), original `dc1fff84851244e89ca6fe16a5e02f86362b4433`; initial helper findings and scheduled diagnostic source reviewed |
| R19 | [Report](../reports/continuation-checkpoint-code-r19-20261120.md), original `49a48017f4af9318deb5f426ed3fc4cb344763a9`; actual shared repair and permitted callers reviewed | [Report](../reports/continuation-checkpoint-bugs-r19-20261120.md), original `2a43b7bf4bf75c11124385a04da72b2476180297`; six selected groups executed | [Report](../reports/continuation-checkpoint-security-r19-20261120.md), original `b31691c4e88f6911793f1c4d178e89403e236efc`; both helper findings and shared verifier correction closed by source review |

Each worker used an isolated checkout with its own workspace package resolution.
Source-only reports do not claim runtime execution, native qualification or formal
appointed-reviewer approval. New commits carry matching-author DCO and Refs.

## Actual local verification

- R18 independent test commit `2ac3d6dc53794a6d3676391570b54646ff68aa7b`, root
  integration `47cecd7f0669a46b831e5de35c63b9cdd3c4d078`, has complete tree
  `e7db62be8310e383c85d7e7473df74f4fc63c6a0`. Four groups passed: Buffer copy
  ownership; valid empty/idempotent/0-to-2 pins; multi-hash 1-to-3-to-7 growth;
  exact retention of a note with a generated witness line.
- R19 production tree `fce62a6f6a008d78eb410c81848554bc4a989ff7` includes the
  shared verifier repair. Test commit `7e38b8cd0a33cbe3a273727d63c256a5fb88a625`
  and root integration `e736ccf38893266a334a2cae58f2215c1ec46012` have identical
  complete tree `ed54349fa4c63cfb16d9c08723723bb4e64dad81`. Six selected groups
  passed, zero failures/skips: the empty-root known answer, all 20,301 ordinary
  consistency pairs, and the four pin groups rerun against the changed verifier.
  The pairs are iterations in one test; all 20,100 prior positive-size pairs
  remain, with 201 canonical empty-prefix pairs added. The four pin groups overlap
  R18; these counts must not be summed as distinct new tests.
- Root's three selected existing ordinary helper groups passed. Full root TypeScript
  checking passed after the helper repair, after independent test integration and
  after the shared verifier/test composition. Latest compiler source is `e736ccf`.
- Requirement traceability validation passed on `e736ccf`. This checks references,
  not completeness of the historically authored coverage/status inventory.
- Final documentation composition: 2,666 links across 412 files, none broken;
  claims lint zero findings across 391 files and 45 rules. One ambiguous phrase
  about the future custody provider was clarified without adding a suppression.
  Whitespace validation passed. Commit trailers and exact publication identity
  are checked before the expected-head branch update and recorded in PR metadata.

These runs used Linux and Node 24.22.3. No native Windows run, browser launch,
vulnerability reproduction or stopped investigation was performed locally.

## Hosted Windows result remains a distinct gate

R17 CI [44815131888](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888)
failed with 25 of 27 jobs successful. The two Windows server jobs reached the
existing 15-second async native-helper deadline in enrollment fixture preparation.
Each server suite had 351 passes, one failure and seven skips; both web suites
passed 441 tests. Actual logs and Git-data bind them to synthetic merge
`44df7ddd7e616d1774e4a5586ec40415f6518b4e`, tree `79f4fa63e9094b61b6c370de0f225455ff507fd4`.
R17 claims and visual checks succeeded. Node 24 already limited concurrency to two;
reapplying that setting is not a supported root-cause repair.

Scheduled R18 CI [44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714)
is the first run with finite fixture/deadline attribution. Its synthetic merge
`c76c7665092f9e4287e2c44819d4f82a31ef59ce` has main/R18 parents and tree
`c3e04b91ff324addde7551a777f4a93c8906e817`. At R19 handoff preparation, Windows
Node 22 job `136629081428` was running workspace tests; Node 24 job `136629081415`
was starting. Visual run `44835016638` had succeeded; aggregate CI and claims
remained pending. Eventual runner logs must bind checkout and result before
qualification. This run does not contain the later pin/shared-verifier repairs.

## Concrete next handoff

Read the two actual Windows outcomes before changing deadlines or concurrency.
If a failure recurs, retain its finite fixture label and distinguish service
handshake from native write with bounded internal operation attribution only if
needed. Do not print paths, keys, input, raw child errors or native stderr; do not
retry a possibly published operation. Preserve native owner/DACL/identity checks.

For REQ-026, implement a separately reviewed supported custody provider only when
it establishes origin-level key association, native ACL/namespace custody, a stable
kernel-held cross-process lock, newest-state reread and exact consistency proof
under that lock, private atomic publication, mandatory file and directory durability,
and explicit ambiguous-commit/crash recovery. Existing pure proposals and private-file
helpers do not meet that complete contract. Actual supported-platform evidence is
still required. The [unfinished-work ledger](UNFINISHED_WORK.md) retains all other
protocol/governance, freshness, release and formal-review boundaries.

Publish with a fresh expected-head lease and exact complete-tree check; bind new
hosted results to that source. Preserve main and original branches. Credit balance
is unobservable; stop on an explicit exhausted-usage signal, not an invented balance.
No main merge, release, deployment or retrospective DCO attestation is supplied.

Refs: QV-18-REQ-002, QV-18-REQ-026, QV-30-REQ-018, QV-30-REQ-019.
