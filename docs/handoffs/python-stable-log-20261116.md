# Independent Python stable log milestone — 2026-11-16

Base: `71970b6` (private audit milestone). Worktree: `qv-python-log`; branch:
`codex/qv-python-log`. This continues the earlier Python capability handoff without
altering the policy hold in protocol NOTES X31. No remote write was performed.

## Implemented and reachable

`verify_bundle(bundle, log={"board": board, ...})` now composes independently written
QV-18 evidence checks with the existing Python election report. The actual CLI is:

```sh
python3 -I verifier-py/qv_verifier verify election.json --board board.json
python3 -I verifier-py/qv_verifier verify election.json --board board.json --receipts receipts.json --observed observed.json
```

Optional `witnesses` / `--witnesses` supplies caller-trusted `{name,pk}` keys only if
absent from the hash-pinned manifest. `extraAuthorKeys` / repeated `--extra-author-key`
authorizes only otherwise unrecognised non-control records; it cannot replace the
coordinator, trustee index or voter identity required by known records. The existing
core still rejects unknown record semantics. Authenticating an extra author does
not turn that record into a valid election record.

`verify` exits 0/1 for report PASS/FAIL, 2 for malformed input/usage, and **3 for
NOT-IMPLEMENTED**. The optional-log API raises `NotImplementedOp` for held input.
With no log argument the existing core behavior and finding classes are unchanged.
Board evidence is only processed after the manifest hash/signatures and roll have
passed their existing checks. The JSON CLI accepts bounded files, rejects duplicate
keys, unsafe numbers and non-integer encodings, and permits null only as transport
content (the core still enforces QV-JSON). Vector file references cannot escape the
chosen tree via absolute paths, traversal or symlinks.

The implemented checks cover strict entry framing and canonical transports; exact
protocol/body/header/type/author binding; nonce/reference/phase checks; recomputed
Merkle prefixes; every exported log signature and the full-size head; observed
forks/rollback; manifest-first witness policy; distinct-key quorum, setup/close gates,
monotone witness observations and manifest time bounds; signed receipt promises,
inclusion and prefix membership; voter/code clashes and extra author restrictions.
Explicit RFC9162 inclusion and consistency proof APIs are also available. Full-board
verification recomputes prefix consistency because the corpus supplies all leaves,
not separate consistency paths. Complete aligned subtrees are hashed once, avoiding
repeated full-prefix rehashing for dense checkpoint exports.

Receipts preserve evidence classes: invalid unsigned sampling material cannot alone
make an election FAIL; an authenticated promise contradicted by the export can.
Malformed auxiliary inclusion data does not erase an authentic broken promise.
Receipt claim clashes remain nonfatal ALARMs. Redacted board bodies require an
inventory entry and an exact digest/length match to the supplied canonical protocol
record; the report explicitly says that the protocol view supplied the body.

## Independence, formats and review findings

No TypeScript implementation was imported, translated or used for arithmetic.
The implementation uses existing Python Ed25519, QV-JSON and SHA-256/Merkle helpers.
Sources were QV-18, board NOTES 1-9/13, protocol NOTES X21-X30, public fixture bytes,
[RFC9162](https://www.rfc-editor.org/rfc/rfc9162.html), and the primary C2SP
[signed-note](https://c2sp.org/signed-note@v1.0.0),
[checkpoint](https://c2sp.org/tlog-checkpoint@v1.0.0) and
[Ed25519 cosignature](https://c2sp.org/tlog-cosignature@v1.0.0) specifications.
Wire widths, base32 origin and flattened receipt fields are the documented existing
board/fixture choices, not new normative protocol decisions. D-89 remains open.

The independent primitive workers implemented the bounded RFC9162 verifiers and
wire authentication separately. A fresh internal integration review found two issues
before this milestone: duplicate signed head variants could select witness timestamps
by input order, and `inclusion: null` could be treated as no inclusion sample. Both
are repaired with independent regression tests. All authenticated timestamps are
retained per key and signed head; minimum timestamps determine earliest observations,
and maxima at smaller sizes are compared with minima at larger sizes for monotonicity.
Duplicate aliases or lines never add quorum votes. No checkpoint list permutation can
hide earlier authenticated evidence. Unsigned malformed inclusion is now a sample
failure, while an authentic contradiction is still fatal.

This remains an unaudited reference implementation. The vector corpus is unsigned;
external audit, scale qualification and constant-time review are not completed.
No C2SP algorithms beyond the existing Ed25519 0x01/0x04 profile were introduced.
No live witness network, archive import, adapter protocol, control verdict policy,
trustee-spoil enablement or INCOMPLETE verdict was invented.

## Exact capability inventory

There are **35 supported** and **13 held** `log.verify_election` inputs. The hold is
detected from actual record/header/body content, never vector IDs or expected output.
DKG round markers transported as `notice` remain supported. A missing/malformed
protocol counterpart is an ordinary verification failure, not a policy hold.

| Supported case | Area |
|---|---|
| `log-honest-witnessed` | checkpoint, witness, receipt |
| `log-heads-any-order` | checkpoint |
| `log-observed-older-head-consistent` | checkpoint, split-view |
| `log-observed-unsigned-ignored` | checkpoint |
| `log-head-wrong-log-key` | checkpoint |
| `log-head-root-edited` | checkpoint |
| `log-head-missing-full-size` | checkpoint |
| `log-export-other-log-key` | checkpoint, binding |
| `log-export-other-origin` | binding |
| `equivocation-two-roots-same-size` | equivocation, attack:split-view |
| `split-view-observed-fork` | equivocation, attack:split-view |
| `split-view-adversarial-view-alone` | split-view, limitation |
| `split-view-observed-rollback` | equivocation, rollback |
| `split-view-observed-honest-head` | equivocation, attack:split-view |
| `witness-all-three` | witness |
| `witness-below-quorum-setup` | witness, threshold |
| `witness-impostor-key` | witness, threshold |
| `witness-duplicate-cosigner` | witness, threshold |
| `witness-unknown-cosigner` | witness, threshold |
| `witness-cosig-from-other-head` | witness, threshold |
| `witness-cosig-tampered` | witness, threshold |
| `witness-non-monotone-excluded` | witness, witness-conflict |
| `witness-close-to-tally-unwitnessed` | witness, gate |
| `time-late-cutoff` | time |
| `time-early-close` | time |
| `time-early-open` | time |
| `receipt-inclusion-older-head` | receipt |
| `receipt-forged-promise` | receipt |
| `receipt-other-log-key` | receipt |
| `receipt-malformed` | receipt |
| `receipt-broken-promise-dropped-revote` | receipt, attack:drop, split-view |
| `receipt-tail-dropped` | receipt, attack:drop |
| `receipt-clash-other-voter` | receipt, attack:clash |
| `receipt-two-claimants` | receipt, attack:clash |
| `receipt-code-mismatch` | receipt, attack:clash |

| Held case | Reason |
|---|---|
| `notice-waiver-reported` | X31 record shape/authority and unknown-record class |
| `notice-waiver-does-not-unblock-open-gate` | X31 record shape/authority and unknown-record class |
| `notice-waiver-does-not-unblock-tally-gate` | X31 record shape/authority and unknown-record class |
| `notice-waiver-carries-quorum` | X31 record shape/authority and unknown-record class |
| `notice-waiver-by-trustee` | X31 record shape/authority and unknown-record class |
| `notice-waiver-record-not-coordinator-signed` | X31 record shape/authority and unknown-record class |
| `notice-waiver-wrong-entry-type` | X31 record shape/authority and unknown-record class |
| `notice-extension-reported` | X31 record shape/authority and unknown-record class |
| `notice-extension-does-not-move-close` | X31 record shape/authority and unknown-record class |
| `notice-extension-retroactive` | X31 record shape/authority and unknown-record class |
| `notice-pause-resume-do-not-move-close` | X31 record shape/authority and unknown-record class |
| `notice-unknown-kind` | X31 record shape/authority and unknown-record class |
| `notice-unrecognised-body` | X31 record shape/authority and unknown-record class |

The Python core continues to produce fatal `E_SCHEMA` for unknown/control records;
the TypeScript core uses class-L `E_VERSION`. No failures were suppressed, changed
into passes, or reclassified to match these 13 cases. D-92 through D-96 and the
existing B3-01/authority holds are unchanged. Notices/waivers/extensions cannot be
used through this API to lower quorum, change keys or move a closing time.

## Validation and handoff

The shipped corpus, its manifest, `scripts/compare-verifiers.ts`, and owner-decision
documents are byte-identical to the milestone base. Log vector positives compare the
exact verdict and 14-check map. Negatives require the specified code among findings,
the exact failing-check set, every `verdict:` tag and every `surfaces:` caveat; the
existing generic operation comparator is unchanged.

The unchanged strict shared comparator still executes its original core-only inputs
and does not attach log evidence. Its historical labels saying Python board checks
are not implemented therefore do not describe this new optional capability; the
script is intentionally unchanged. It reports **27/27 verdict agreements, 3 report
differences, exit 1**: manifest-signature-removed, count-altered, result-flipped
(D-92/D-93/D-94). This milestone makes no cross-verifier conformance claim.

Final measured Python/unit and full-vector results are recorded below after their
complete runs. Focused hostile integration tests cover signature tampering, body
substitution, nonce replay, extra-author impersonation, redaction supplementation,
malformed receipts/exports, transport bounds, file traversal and actual CLI behavior.

Measured runs: the full Python suite completed **113 tests, OK**; the whole shipped
vector tree completed **282 total, 269 PASS, 0 FAIL, 13 NOT-IMPLEMENTED**, exit 0,
with **79 matching hashes, no mismatch or missing files**. The strict comparator
reported the unchanged three differences described above and exited 1. `git diff
--check` passed. After these runs a separate fresh reviewer identified transport
schema gaps and non-ballot receipt ownership claims; these were tightened before
freezing, with the focused integration rerun recorded in the final completion note.
The new metadata validation parses the self-attested policy copy's data shape only;
it never trusts its quorum, keys or algorithm for cryptographic authorization.
