# R25 — complete the remaining accepted CLI workflows

Date: November 27, 2026 (America/Vancouver).

This is AI-assisted implementation and independent engineering review. QuietVote
remains unaudited and not for real elections. Formal crypto/security approvals,
historical DCO provenance and release qualification are separate gates.

## Baseline and execution plan

Start from R24 commit `5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7`, tree
`60d1aed1c298d6e1bdc2b7bc8020e023b126e607`, in draft PR #75. Its source-specific
full-matrix CI remains independently observable while this next candidate is
assembled. The accepted task source is the
[trustee/CLI inventory](../reports/inventory-20261111/trustee-cli.tasks.md).

Work is split into independently testable parts, with a source review and
meaningful negative tests before integration:

1. Fix terminal refusal/EOF and keygen confirmation (task 3).
2. Complete exact-byte spoil-share posting against the existing endpoint (task 7).
3. Add optional independently pinned verification to existing export download
   (task 6), sharing the reviewed snapshot gate with ballot status.
4. Add optional supplemental dice input to keygen/commit under accepted N-28
   (task 9), preserving the required platform RNG and existing replay behavior.
5. Close the remaining command-level lifecycle acceptance gaps (task 2).
6. Probe state-save and ledger interruption boundaries using real persistence
   and verification, with test-only fault injection (task 10).

The source/test separation is intentional: new command adapters and focused
acceptance suites account for most of this candidate's change size. A large
cross-feature test cannot substitute for these distinguishing boundary cases.
No wire schema, protocol domain, KDF floor, dependency version or accepted
verifier capability is changed. The optional local entropy construction follows
N-28 and still requires formal crypto review before main promotion.

## Trustee terminal input and confirmation

The original shipped `status` command with closed stdin reproduced exit 13 and
an unsettled top-level await. The fix refuses non-TTY input with `NO_TTY`/exit 2,
settles EOF/closed/error paths with typed diagnostics, handles Ctrl-C as exit 10,
and routes readline echo into a discarded stream. New interactive keygen asks
twice, compares temporary UTF-8 buffers using the existing constant-time helper,
and refuses mismatches before randomness or any bundle write. File/environment
and generated-passphrase paths stay noninteractive; no piped-input path is added.
Temporary comparison bytes are wiped; existing JS string-lifetime limits remain.

Independent root source review found no blocking scoped issue. Author validation
passed 10 new prompt tests and 24 existing CLI/argument/transcript/KDF tests.
Root integration independently passed the combined **34 tests**, zero failures,
skips or cancellations, 4.121 seconds. Six actual Linux PTY cases passed with
production defaults: mismatch, confirmation EOF, first-prompt EOF, Ctrl-C,
matching keygen and status. They checked ECHO off while reading, terminal flags
restored on exit, expected exit codes and no input canaries in output. A real
non-TTY protected-passphrase-file unlock also passed. These observations do not
qualify native Windows or macOS terminals.

## Spoil-share posting

The existing offline collector produces signed records for an endpoint already
present in the server. The plan uses mandatory independent manifest/election
binding, validates all bounded input files before any POST, retains their exact
bytes and posts sequentially without automatic retry. Each result distinguishes
accepted, duplicate, rejected, unknown and not_attempted. Matching server
acknowledgments do not establish share-proof correctness, admission history or
tally inclusion. Private read capabilities are not sent to this write endpoint.

The shared transport receives a named raw-JSON entry point while the existing
JSON request API keeps its serialization and refusal behavior. The report and
package notes must retain partial-outcome and post-tally replay limitations.
The completed command validates a nonempty directory of at most 1,024 regular
JSON files (1 MiB each, 64 MiB combined) against the independently pinned context
before any network request. Same-handle reads retain exact bytes, reject unsafe
file aliases, and detect changed inputs. It preserves deterministic filename order,
reports partial outcomes, and normalizes untrusted diagnostics. Eleven focused
acceptance tests passed, including an actual private-link election: anonymous
reads refuse, signed spoil POST succeeds, replay is duplicate, tally includes the
shares, and post-tally replay refuses. The broad author CLI run passed 195 tests
with 11 existing platform skips before a final diagnostic-only correction; the
11 final focused tests then passed in 28.218 seconds. Root source review found no
blocking scoped issue. The combined-source CLI qualification is recorded below.

## Export verification

The existing export command retains its default download-only behavior. Explicit
`--verify` requires an independent manifest pin and binds the requested election
ID. The downloaded bytes are saved exactly and are the bytes verified; failures
and incomplete evidence remain available for inspection without overwrite.
Verification uses existing self-tests/verifier/archive parsing and the shared
R24 subordinate-check/final-checkpoint-witness/control gate. It reports the raw
verifier verdict separately from the stricter snapshot verdict. Neither result
claims freshness or finality. Independent JSON author pins remain explicit;
QVB retains the existing archive authority policy.

The real-server acceptance probe exposed a deliberate existing compatibility gap:
its final board carries `tally-aggregate` and `dec-shares`, which protocol NOTES
explicitly leaves undefined. The full verifier returns raw PASS with failed
canonical-encoding checks and local E_VERSION findings. The strict adapter and
ballot-status command refuse that result. This remains true with valid independent
JSON author pins. Complete-board binding forbids filtering the records; QVB
server metadata is not an independent authority grant. The adapter is testable,
but ordinary final-server verification remains an unfinished contract feature.
The real-server regression requires refusal and exact byte retention. Twenty
new export tests, all 23 existing ballot-status tests and two archive-preparation
tests passed, including pin/context mismatch, incomplete final witness evidence,
malformed input, occupied output, subordinate failures and actual server exports.
Root source review found no blocking scoped issue. The
[proposed derived-record contract](../rfcs/export-derived-record-contract.md)
makes the remaining owner/security decisions and independent TS/Python acceptance
criteria concrete; it adopts no new authority or record interpretation.

## Optional supplemental dice input

Accepted N-28 / QV-17 REQ-012 permits HKDF mixing without replacing the CSPRNG.
`--dice-file` is restricted to keygen and commit. The same protected-file reader
limits input to 64 KiB; the parser accepts 1–8,192 six-sided digits and ASCII
whitespace. No entropy estimate, file value, private path or RNG error text is
printed. Input errors preserve their typed exit classification.

Each at-most-8,160-byte HKDF-SHA256 expansion uses a fresh 32-byte platform RNG
draw as IKM, SHA-256 of normalized dice as salt, and a fixed local label plus
u64 counter as info. Requests are bounded to 1 MiB. Missing, throwing, malformed
and all-zero sources refuse; this zero check is not a general health guarantee.
The existing default RNG and all wire/bundle/KDF formats are unchanged. Source,
expansion and parser buffers are wiped best-effort; destruction wipes the retained
salt and refuses future draws. Saved commit packets replay without drawing fresh
randomness, even when dice input changes.

The first independent review found a terminal-control leak through inherited
file-error messages. The corrected local boundary replaces those messages with
fixed text and preserves error kind/code. A hostile-filename regression covers
that correction. The reviewer then found no blocking scoped source issue and
independently checked the composition against native Node HKDF for seven request
lengths (0, 1, 31, 32, 8,160, 8,161 and 1 MiB), covering 135 expansion blocks.
Every output matched, source buffers were wiped, caller input was unchanged,
destruction refused reuse, and a second-block source failure sanitized/refused.
A separate real command probe confirmed no path/control leak or prompt/RNG call
on the malformed input path. These are engineering checks, not formal approval.

The full crypto suite passed **108 tests** in 8.209 seconds. The full trustee
suite at the prompt/entropy/initial-lifecycle checkpoint passed **146 tests**, with
three existing platform skips and no failures or cancellations (471.270 seconds).
The final five crypto and six trustee entropy regressions and typecheck passed
after a test-only Windows-valid hostile-filename correction. Subsequent lifecycle
and interruption additions are qualified separately below.

## Trustee command and interruption coverage

The new lifecycle suite drives the nine previously missing success paths through
`main(argv)` on real 3-of-5 fixtures: drill, spoil release, abort, restart,
restore, destruction, transcript export, cosigning and verification. Independent
cryptographic checks inspect drill proofs, signatures, threshold spoil decryption,
tally output and the destruction attestation. It verifies authenticated release
history on backup restoration, exact replay, no overwrite on refusals, and private
canaries in output/files. Reachable exits 0/2/10/20/40/50/60 are exercised.

The initial three integration tests passed (37.862 seconds), with no failures,
skips or cancellations; root source review found no blocking scoped issue. A
separate full 3-of-5 test now performs every trustee operation through `main(argv)`,
exchanging only public packets and log slices. Trustee identities originate from
CLI keygen, not injected trustee secrets. Trustees 1/3/5 release the tally and
2/4 remain standby; independent recomputation yields four yes and two no.
Existing actual-process 2-of-3 coverage remains separate production-KDF evidence.

Ten interruption tests cover **59 application-level cut points** using genuine
sealed files, proofs and release ledgers. They discard failed objects and reopen
authenticated state after before/after-save cuts, complaints, missed deadlines,
disqualification, abort/restart, rejected-tally rollback, ledger publication and
destruction boundaries. Retried committed packets and new identities remain
exact; no secret canaries appear in public output or storage. The interrupted
same-object release refuses with `BUNDLE_REOPEN_REQUIRED`; reopening recovers
tally publication while existing one-shot spoil refusal stays intact. No further
production defect appeared in this scoped matrix.

Root final-source qualification passed the full ceremony, four primary
interruption tests and six entropy tests together (**11 tests**, 86.090 seconds).
The six additional branch-interruption tests passed separately (**6 tests**,
31.344 seconds). All had zero failures, skips or cancellations. These tests do
not claim power-loss durability, arbitrary hard-kill cleanup, native ACL coverage
or closure of the documented backup publication/registration window.

## Combined candidate checks

Root typecheck, dependency boundaries (the two recorded D-97 findings remain),
links, requirement references, claims lint and whitespace checks passed. The full
CLI run against this combined source passed **240 tests**, zero failures or
cancellations, with 11 existing platform skips (**251 total**, 730.352 seconds).
One overlapping final typecheck was terminated (exit 137); a staggered rerun
with a 768 MiB JavaScript heap passed. A claims-lint finding in review wording
was corrected to identify the separate reviewer as an AI agent.
It includes the unchanged real-clock all-executable election journey and Python
comparison. This is a local Linux/Node 24.22.3 receipt; native qualification remains
separate.

A separate AI agent checked the final transport/dispatch composition,
strict snapshot gate and prompt/entropy source. No blocking scoped issue was found.
The reviewer independently reran the 21 new crypto entropy, trustee entropy and
prompt tests against the combined tree: all passed with zero skips. This review
is engineering evidence, not appointed security or protocol-contract approval.

The 30 changed files were scanned with detect-secrets 1.5.0. One reviewed test-only
Basic Auth match comes from a reserved `example.test` origin used to reject URL
credentials. It is a synthetic negative fixture. There were no unreviewed
findings; an isolated synthetic private key-header positive control was detected. Vendor verification still checks the
same two pinned packages and 132 files; no dependency was added.

| Final source checked in the separate agent review | Git blob |
| --- | --- |
| CLI combined transport | `7dc783179b76de12b29cd3cf4e27c7d0f800d5b8` |
| CLI combined dispatch | `f62288f4c2883b0d6b447a661aa7ee2a3f0e5c46` |
| Spoil-share posting | `14c08ecddaf21ea45bdf49c0306f21d6fbb91534` |
| Shared snapshot evidence gate | `87524f40af216639eb2a6db7e5bd70ee5bc62eb3` |
| Export verification | `9b0f2a50865885ce2c80194a78aea48b6dfdded5` |
| Archive preparation | `b36ac5d60d6fa4dc8429c739e45e7b8a2e6fe9f8` |
| Ballot status using shared gate | `72da3874484f18439397873d3237014202955021` |
| Trustee CLI prompts/entropy | `e4ccf6e20bda1cb0f291071fd13622889070ffea` |
| Trustee dice reader/parser | `fe1082d62c273ccfa1341ee3443093321ca60913` |
| Crypto additive entropy | `19d07a1328617c151db9bbac8f175633a1777cfa` |

Publish this source as a draft stacked on #75. The subsequent continuation records
the resulting commit/tree and hosted jobs; no main merge or release is claimed.

## Remaining feature boundaries

The [unfinished-work ledger](UNFINISHED_WORK.md) remains authoritative for
unadopted governance/finality/freshness contracts, durable checkpoint custody,
native ACL support, worker integrity, external interoperability, release evidence
and human accessibility/translation review. Task 8's durable monitor/pin update
cannot bypass the later R18–R19 origin, locking and durability requirements.
Neither this continuation nor a passing CI run resolves those decisions.
