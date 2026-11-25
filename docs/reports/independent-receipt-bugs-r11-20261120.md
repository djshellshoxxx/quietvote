# Independent returned-receipt acceptance — R11

Date: November 20, 2026. Fresh functional reviewer: `/root/bug_hunt_r11`.
This worker owns the new [CLI acceptance tests](../../packages/cli/test/online-receipts.test.ts)
and this report. It follows the completed [R10 handoff](../audits/CONTINUATION_R9_R10_20261120.md)
and its [receipt acceptance preflight](continuation-bugs-r10-20261120.md).

## Outcome and exact source

**Four focused test groups passed, with zero failures, skips or cancellations.
No new functional defect was confirmed within this scope.** The cases exercise
the existing command with its new independent log-key option, including an
actual server response and executable invocation. Production source was not
changed by this worker.

| Identity | Value |
| --- | --- |
| Published starting checkpoint | `29cde9b1d8d774ee201c06f53386a556a2ad48d7` |
| Final executed implementation | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Implementation tree | `af59d1f37fe78851e23c4673ce02eeafb94a4674` |
| Independent test commit | `da54767099309cba388996be45868e6115e5a392` |
| Implementation plus test tree | `151f8128c59af800bd9df0a6d77a2f07d16b390a` |
| Isolated branch | `codex/qv-bugs-r11-20261120` |

External dependencies were shared without installation or version changes.
Every `@quietvote` workspace alias was created locally; `import.meta.resolve`
confirmed that CLI, protocol, board, crypto and server resolved inside the
isolated checkout. Root's changing workspace was not the implementation source
used by these runs.

## Independent acceptance

### Actual admitted packet, normalized receipt and replay

The first case starts a normal local server with the existing `World` harness,
creates an organization/election, registers voters and builds a valid manifest
packet with its coordinator signatures and organizer header. A child process
runs the shipped CLI with the fixture's separately supplied log-key pin.

The returned result is `included`, with verified promise and inclusion. Its
origin and leaf match the exact packet generated locally. The reported key
matches the supplied pin, while authority, witness, freshness and ballot-counting
verification flags remain false. Normalized receipt JSON uses the board
representation; the existing offline `verify-receipt` command also accepts it
with the same independent origin/key/leaf expectations.

An explicit identical-byte checked replay returns the same report. A separate
legacy invocation without `--log-key` retains the original REST response with
its nested promise and no new client verification member. These requests leave
one entry in the actual board, and the packet file remains byte-identical.
Both the explicit `--json` invocation and normal online output are JSON.

### Promise-only and additive transport metadata

A separate local HTTP fixture returns an ordinary correctly signed promise in
the actual QV-09 wire shape: nested promise fields and base64url leaf/signature.
It includes harmless unknown fields containing null, fractional values and
non-NFC text, plus a server advisory verification object. This is transport JSON,
not an altered protocol artifact.

The command exits 3 with verified promise and `INCOMPLETE` inclusion. Its
normalized receipt equals the board library's representation and remains
incomplete through the offline receipt command. Unknown transport fields do not
appear in the client-owned assurance. The fixture receives exactly one POST
with the selected election path and original packet; no poll or automatic retry
occurs. The packet file is unchanged.

This case qualifies the already corrected transport parser at the executed
source. It is not a runtime reproduction against the earlier implementation.

### Outcome ambiguity and local input checks

A valid response checked with a different, valid public-key pin exits 1 while
retaining possible-acceptance guidance. An incomplete HTTP-success response
does the same. Each explicitly invoked command performs one POST; neither
failure rewrites the original packet or automatically retries it.

Invalid key spelling and an invalid point are refused as usage errors. A packet
bound to another selected election, mismatched header/body, malformed JSON,
oversized file and directory input are refused locally. The local server
receives zero requests in those input-validation cases. These are normal
configuration/file-boundary checks, not intrusive probes or exploit workflows.

## Execution record and limits

Linux, Node 24.22.3:

```sh
node --test --test-reporter=spec packages/cli/test/online-receipts.test.ts
```

| Executed implementation | Result |
| --- | --- |
| `fe6c4bff5853759b97024ae1c66b86c8121cb6ec` | Four passed; zero failures/skips/cancellations; 1.484 seconds. |
| `918f27022ab0071b5b83418263c6a3cf9643f37f` | Four passed; zero failures/skips/cancellations; 1.239 seconds. |

The small targeted rerun qualifies the subsequent structured-result correction
and its command handling. These are the same four cases, not eight unique tests.
No broad CLI, protocol, server or browser suite was repeated. Full root TypeScript
remains a coordinator-owned gate after test integration; this worker did not
start a competing compiler. Test and report commits carry matching DCO and
applicable specification references.

Report validation passed: 2,420 Markdown links across 383 files, none broken;
public-claims lint found zero findings across 362 files and 45 unchanged rules.
The working diff passed whitespace checking. These checks add documentation
evidence rather than additional product-test coverage.

Receipt inclusion is scoped to the returned signed checkpoint and expected
entry bytes. This receipt does not establish entry authority, protocol validity,
witness quorum, consistency with another observation, freshness or final ballot
counting. The fixture assertions retain these exclusions.

The stopped background-runtime/gossip investigation and its old untracked test
were not inspected or resumed. No native browser retry, escalation, probe,
vulnerability reproduction, publication or message to an external party occurred.
Formal appointed review, native ACL, provenance and release gates remain separate.

## Fresh-worker handoff

Integrate the test commit and source-qualified report, then retain the final
implementation identity when recording broader compilation or hosted evidence.
A fresh reviewer should inspect the composed adapter and documentation, confirm
the wire/board boundary and selected assurance output, and review any later
change against these acceptance cases. Proof retrieval, persistent receipt
retention, observed-head consistency, witness qualification and freshness need
their own bounded workflows. Do not count this immediate-response check as
completion of those separate features.
