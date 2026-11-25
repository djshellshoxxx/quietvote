# Independent saved-receipt proof acceptance — R13

Date: November 20, 2026. Functional reviewer: `/root/bug_hunt_r13`.
This fresh worker follows the completed
[R11–R12 handoff](../audits/CONTINUATION_R11_R12_20261120.md). Its owned change is
the new [receipt-proof acceptance file](../../packages/cli/test/online-receipt-proof.test.ts)
and this report. Production source was not edited by this worker.

## Outcome and exact source

**Four acceptance groups passed, with zero failures, skips or cancellations.
No new functional defect was established within the assigned scope.** The cases
exercise the actual command against a normal server and a small HTTP fixture
for the API's permitted absence of a checkpoint note.

| Identity | Value |
| --- | --- |
| Published starting checkpoint | `46ede0a4aedb39a0ff648441a9fab6774af17097` |
| Locally available equivalent starting source | `7a2fa27d37cfb5d5bdc2f8f9d266e2baa5a290a0` |
| Shared complete starting tree | `2cd074b563c6b11cb2ccb74a680721bea2748d9a` |
| Coordinator implementation under test | `febb956cdc61e892b7577c8b9c6f33882a6d7498` |
| Worker implementation equivalent | `2e2d28ddc5313f6c93a00bf4857dc4a7d5cb1d41` |
| Shared complete implementation tree | `d0b95e5974b57264f67e123e96bb64fcdf5984e0` |
| Independent acceptance commit | `38acf8e64a3c042faa7a35a92e7987cb3fff4f1b` |
| Executed implementation plus test tree | `86753b527d02075d5285914ae0e4a932f6c839df` |
| Subsequent type-only test correction | `b24ed760d919db644f3578404b2e8cc12bb5c4b1` |
| Implementation plus typed test tree | `be682d0f28b73d4ece6dc6301126174273656139` |
| Isolated branch | `codex/qv-bugs-r13-20261120` |

Local `@quietvote` aliases resolve to the isolated checkout's CLI, board, crypto,
protocol, server and verifier. Only external dependencies are shared; no package
installation, dependency update or network-fetch retry was performed. Thus the
changing coordinator checkout was not the executable implementation source for
this run. The starting publication/tree binding is the coordinator's receipt;
the worker independently verified the local tree and implementation equality.

## Normal executable and server workflow

The first group creates an organization and election using the existing `World`
harness, registers voters and submits a normal signed manifest packet. The
fixture supplies its expected key, election origin and exact local header leaf
separately to the command. This tests caller-supplied anchors; it does not
simulate real-world acquisition from an independent channel.

The test saves both the actual normalized receipt and its valid promise-only
form. A real child process invokes `online receipt-check` for explicit tree
size one. The result verifies inclusion, reports no earlier consistency anchor,
and returns the same normalized included receipt the server originally issued.
The server receives exactly one GET with the expected sequence and tree size.

A legitimate ceremony-start record then creates a later signed checkpoint at
size two. Checking the saved size-one receipt against that explicit size makes
exactly one inclusion GET and one consistency GET, with the old/new sizes
bound in the request. The result verifies both checks while preserving the
original sequence, leaf and promise signature. Saving only the contained
receipt permits successful verification by the existing offline command.

An equal-size check of the returned size-two receipt makes one inclusion GET,
verifies consistency locally, and returns the same receipt. All three saved
files remain byte-identical during command execution. The actual board retains
only the two fixture entries, and the election phase is unchanged by proof
checking. The group is a receipt workflow, not a full voting/tally lifecycle.

Request observation uses the normal server's request event. It records method,
path, query and only the presence of a read-key header; it does not intercept
responses, change handlers or capture credential values.

## Link-access and incomplete-evidence workflows

A second actual-server group creates a legitimate link election and saves its
read key using the existing native private-fixture helper. The checked command
uses that private file for an equal-size inclusion read. The request carries
read-key access, inclusion and consistency verify, both receipt/key files remain
unchanged, and the access key is absent from output. This is ordinary credentialed
access, not a bypass test or native ACL qualification.

QV-09 §11.1 permits an inclusion response without `checkpoint_note` when a signed
note is unavailable for the requested size. The third group uses an ordinary
HTTP fixture with the expected two-leaf proof shape and omits only that optional
note. It includes harmless unknown transport metadata containing null,
fractional values and non-NFC text, plus an advisory verification object.

Both supported saved-evidence forms are checked:

| Saved evidence | Observed requested-snapshot result |
| --- | --- |
| An already included size-one receipt | Exit 3; requested inclusion and consistency remain `INCOMPLETE`; the original included receipt is retained and `receipt_tree_size` remains one. |
| A valid promise without inclusion | Exit 3; requested inclusion remains `INCOMPLETE`, consistency is `NOT_CHECKED`, and the promise remains unchanged with null retained receipt size. |

Each invocation performs one GET, with no consistency read, polling or retry.
Unknown metadata is not copied into output, and client-owned assurance cannot
be replaced by the fixture's advisory object. Input files remain byte-identical.
These are normal supported response states, not vulnerability reproductions.

## Local preflight and assurance scope

The fourth group verifies local refusal before any HTTP request. Missing or
malformed log-key options and out-of-range requested sizes are usage errors.
Well-formed mismatched election, key or leaf expectations, oversized/nonregular
receipt files, and a requested snapshot earlier than a saved included checkpoint
are input errors. The local server sees zero requests, and the valid saved
promise is unchanged. No failed verification is promoted to an incomplete or
successful result through these cases.

Across normal outputs, assertions retain `scope: "receipt-proof"`, expected
origin/key/leaf, requested and previous tree sizes, and false authority, witness,
freshness and ballot-counting flags. `receipt_tree_size` distinguishes evidence
actually retained from the newly requested snapshot. A successful consistency
check relates only the supplied earlier receipt to the requested checkpoint;
the tests do not establish that either is the newest observation.

## Execution and validation

Linux, Node 24.22.3, local workspace aliases verified:

```sh
node --test --test-reporter=spec packages/cli/test/online-receipt-proof.test.ts
```

The final run passed all four groups, zero failures/skips/cancellations, in
**1.481629932 seconds**. The normal executable/server workflow took 939.133 ms;
the link-access group took 124.154 ms. An earlier four-group run passed in
1.368149678 seconds before tightening exit-code assertions and adding the
promise-only form of the ordinary missing-note case. These runs overlap and
are not eight unique tests.

The new file passed syntax and whitespace checks. Full root TypeScript after
test integration remains the coordinator's gate; this worker did not run a
competing full compiler or repeat unchanged broad suites. Earlier R11/R12 and
hosted passes do not qualify the new command's implementation.

The independent code reviewer identified two new explicit `any` helper
annotations under QV-30. Follow-up `b24ed76` replaces them with the known REST
fixture shape and `ReceiptProofReport`, plus literal assurance keys. Every
runtime assertion remains unchanged. The executed test identity above is
retained; this type-only follow-up is qualified by source review and the
coordinator's final integrated compiler gate, not a claimed additional runtime
run. Review closure belongs to the separate code audit.

Report validation found 2,504 Markdown links across 392 files, none broken.
Claims lint found zero findings across 371 files and 45 unchanged rules. All
owned commits include matching Codex DCO and applicable specification references.

## Fresh-worker handoff

Integrate the test-only commit and this separately attributed report. The R13
code and defensive security workers received the exact test commit and final
execution receipt for their source review. A fresh composition round should
confirm the implementation, output guide and acceptance survive integration,
and bind any hosted results to the actual tested source/tree.

Persistent checkpoint custody, selection of the latest independently observed
head, witness qualification and authenticated freshness remain distinct work.
No original assertion, platform cell, native deadline or existing test was
weakened. The stopped background-runtime/gossip investigation and its old
untracked test were not inspected or resumed. No native browser retry, network
bypass, runtime probe, exploit reproduction, publication or external comment
was performed. Appointed security review, native ACL and other promotion gates
remain separate from this ordinary functional receipt.
