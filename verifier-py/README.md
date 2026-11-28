# py-qv-verify — independent second verifier (Python)

> **Status: experimental. External audit and release qualification remain incomplete.**
> A passing run means "agrees with the v1 test vectors on the cases they cover". It is not a
> security claim (QV-34-REQ-015). Engineering review evidence is recorded in
> [the consolidation audits](../docs/audits/SECURITY_REVIEW.md); the arithmetic is not constant-time.

This is the second, independently written verifier that decision **D-50** (`docs/plan/OPEN-DECISIONS.md`:
"Independent verifier language: Python") and QV-34-REQ-005 / gate G4 call for. It was written from the
specifications and RFCs only:

* QV-16 `docs/16-crypto-protocol.md` (byte formats, label registry, proofs, DKG, ballots, tally, Appendix C),
* QV-34 `docs/34-test-vectors-conformance.md` (vector format, check ids, comparison rules),
* RFC 8032 (Ed25519), RFC 9496 (ristretto255), RFC 8785 (JCS), RFC 9162 (Merkle tree hash),
  RFC 5869 (HKDF), FIPS 197 / NIST SP 800-38D (AES-256-GCM),
* the vector files under `test-vectors/v1` (inputs and expected outputs).

It does not import, call or translate the TypeScript implementation in `packages/`. Where the
specifications are silent and the behaviour was taken from a vector, that is recorded in
`docs/errata/spec-errata-log.md` (entries `QV-ERR-PY-*`).

## Requirements

Python ≥ 3.11 and the standard library only. `requirements.txt` lists no packages, deliberately.

### Static import and dependency check

```sh
python3 -I verifier-py/check_imports.py
python3 -I -m unittest discover -s verifier-py -p test_import_boundary.py -v
```

The checker parses every runtime `.py` file under `qv_verifier/` without importing
or executing it. It checks stdlib/internal imports, local import targets, the
empty dependency declaration, visible execution/loader references and import-state
mutations. The existing guarded directory-launcher repair is recognized by its
exact AST shape; other path mutations receive a finding. Ordinary stdlib file
operations, constants, types, wildcard imports and import-state reads remain
allowed. Missing, unparseable, oversized or symlinked source receives a finding;
stdlib shadowing beside the package and native runtime artifacts are also reported.

Output is deterministic JSON; exit 0 means no finding in these static checks,
exit 1 means findings, and exit 2 is command usage failure. CI runs this check
before executing the Python unit tests. The interpreter's `sys.stdlib_module_names`
defines stdlib roots, so the inventory is tied to the Python version used.

This does **not** establish authorship, absence of translated/copied logic,
arbitrary dynamic behavior, or semantic independence. The human review and
decision-log evidence required by QV-35-REQ-014 remain separate. The existing
`Mirrors packages/protocol/src/verify.ts` comment is retained; it is not an
import, and a static scan cannot decide its provenance. See the
[scope and focused results](../docs/reports/python-import-boundary-20261127.md).
The verifier remains unaudited and not for real elections.

## Running

From the repository root:

```sh
python3 -I verifier-py/qv_verifier vectors test-vectors/v1            # one line per vector
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet    # only non-PASS lines
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --report out.json
python3 -I verifier-py/qv_verifier verify election.json --board board.json
python3 -I verifier-py/qv_verifier verify election.json --board board.json --receipts receipts.json --observed observed.json
python3 -I verifier-py/qv_verifier adapter --tree test-vectors/v1
```

Each vector is reported `PASS`, `FAIL` or `NOT-IMPLEMENTED`. The exit status is **1 only if a
vector FAILs**, 0 otherwise (NOT-IMPLEMENTED does not fail the run), and 2 on usage errors.

`verify` writes the full JSON report to stdout: exit 0 for verdict PASS, 1 for FAIL,
2 for input/usage errors, and 3 for INCOMPLETE (no fatal finding but tally
decryption or required log evidence has not completed). A missing tally produces no result; a rejected or
conflicting tally retains its failure. Exit 3 also denotes an explicitly unsupported capability;
the shipped 48 log-evidence cases, including legacy controls, are implemented.
Receipt samples are an array of `{receipt, voter?, code?}`; observed checkpoints are
an array of signed-note strings. The API is `verify_bundle(bundle, log={"board": board,
"receipts": samples, "observed": notes})`; omitting log runs the core election
verifier without board/witness/receipt evidence checks and cannot produce default PASS.
The CLI also accepts an embedded `board` export; `--board` explicitly selects a separate file. Optional `witnesses` (CLI `--witnesses`) supplies trusted `{name,pk}`
keys only when the manifest has no witness list. `extraAuthorKeys` (`--extra-author-key`)
never overrides coordinator, trustee or voter authorization for recognised records.

Default verification requires both `chk.board.append_only` and
`chk.board.witness` to pass. Missing or unverified log evidence yields
`INCOMPLETE` (CLI exit 3); fatal evidence still yields `FAIL` (exit 1).
A completed tally alone does not establish a witnessed election result.

For an explicitly scoped cryptographic content check, trusted callers may set
`allowNoLog: true` (Python: `allow_no_log=True`), or invoke `--content-only` on
`qv verify`, `qv-verify`, or Python `verify`. Only the actual Boolean true enables
this option. A bundle field cannot enable it. The report prominently states that
content-only PASS does not establish witnessed log integrity. The exception
allows absent evidence, or a verified append-only log whose signed manifest
explicitly requires zero witnesses. Supplied malformed, failed, skipped,
interrupted or otherwise unverified append evidence never qualifies; required
witnesses cannot be bypassed. Missing tallies remain incomplete in either mode.

About `python -I -m qv_verifier`: from Python 3.11 on, `-I` implies `-P` (safe path), so the
current directory is **not** put on `sys.path`. `python -I -m qv_verifier …` therefore works only
when the package is importable, for example after installation. From a checkout, use the directory
form above: it runs `qv_verifier/__main__.py`, which puts the package's parent directory on
`sys.path`. The `-m` form was tested and fails from `verifier-py/` with "No module named qv_verifier".

### JSON Lines conformance adapter

`adapter --tree DIR` implements QV-34 §10.2. Send the handshake first:

```json
{"hello":"qv-conformance","format_version":1,"protocol_version":"qv1"}
{"id":"abc","op":"hash.sha256","input":{"msg_hex":"616263"}}
{"id":"election","op":"verify.election","input":{"path":"elections/tiny-yesno-3v/bundle.json"}}
```

There is one flushed JSON response per input line; diagnostics use stderr. The
handshake identifies the implementation and version but advertises `profiles: []`:
transport support is not a claim that all operations in a P0/P1 profile exist.
All operations in `qv_verifier.ops.OPS`, plus `verify.election` and
`log.verify_election`, use the independent Python implementation. Unknown operations
return `ERR_UNSUPPORTED_OP` with the request ID. Known protocol rejections retain
their `E_*` code; malformed transport/envelopes return `E_PARSE`/`E_SCHEMA`.

`verify.election` reads exactly `{path}` and returns the report's verdict, exact
check map, counts, context prefix and available results in `output`; the complete
report is in informational `details`. A fatal report returns `ok:false`, its first
emitted code, `failed_checks`, and `details`. `log.verify_election` uses the corpus's
`{bundle:{path},board:{path,replace?},receipts?,observed?,witnesses?,extraAuthorKeys?}`
input; positive output is exactly `{verdict,checks}`. Any emitted log finding uses
`ok:false` and its first code; `details` retains **all** codes and the independent
verdict, including nonfatal receipt findings. No expected-output file is consulted.

`ok:true` means the operation completed; inspect `output.verdict`, which can still
be `INCOMPLETE`. Default election verification requires log evidence. To compare
the corpus's explicitly content-only election reports, launch with
`--content-only`; requests and artifact fields cannot enable that option.
Supplied bad evidence and required witness policy still cannot be bypassed.

Input lines are limited to 1 MiB including newline, artifact files to 64 MiB, and
responses to 4 MiB. Oversized framing returns `ERR_REQUEST_TOO_LARGE` and ends the
session with exit 2; oversized responses return `ERR_RESPONSE_TOO_LARGE`. A bad
handshake also ends with exit 2. Validly framed request errors do not desynchronize
the next request; clean EOF after handshake exits 0 regardless of individual
operation outcomes. IDs are nonempty strings up to 256 characters.

File reads use a pinned directory descriptor, require regular files, reject
absolute/parent paths and symlinks, and never use the process working directory.
On platforms without directory-relative `open` and no-follow directory handles,
file operations explicitly return `ERR_UNSUPPORTED_OP`; primitive operations
remain available. This protects confinement without claiming untested Windows
file support. Inputs must be local; the adapter never fetches network resources.

Unit tests (unittest discovery adds the start directory to `sys.path` itself, so `-I` works):

```sh
cd verifier-py && python3 -I -m unittest
```

## What is implemented

| Area | Module | Notes |
|---|---|---|
| edwards25519 field/group | `edwards.py` | extended coordinates, RFC 8032 §5.1 |
| ristretto255 | `ristretto.py` | RFC 9496 §4.3 decode / encode / equality; strict scalars (< ℓ, never reduced) |
| Ed25519 | `ed25519.py` | RFC 8032 sign/verify. Strict policy: S < ℓ, canonical and non-small-order A and R, cofactorless equation |
| Framed hash, label registry | `framed_hash.py` | QV-16 §5.3/§5.4: H256, H512, hs, hs_nz (counter field), 30 labels (registry revision 2026-11-04) |
| QV-JSON / JCS | `qvjson.py` | strict parse (duplicate keys, floats, null, -0, unsafe ints, lone surrogates, non-NFC, control chars, trailing data, BOM); RFC 8785 serialisation |
| RFC 9162 Merkle, voter roll | `merkle.py` | roll leaves `pk ‖ u32(1)`; bounded inclusion and consistency proof verification |
| Sigma proofs | `proofs.py` | Schnorr PoK, DH-reveal DLEQ, CDS 0/1, selection limit, partial decryption |
| HKDF, AES-256-GCM | `aead.py` | for public adjudication of DKG complaints |
| DKG adjudication | `dkg.py` | R1, R2, complaints → Q, K, Y_j, transcript hash, ctx |
| Manifest | `manifest.py` | closed schema + semantic rules + privacy floor; manifest hash |
| Ballots | `ballot.py` | deterministic encryption from ξ, §5.14.4 checks 1–9, public and private Benaloh audits with signed reveal-digest binding and exact body reproduction |
| Rules | `rules.py` | quorum, threshold, tie-breaks, multi-winner (exact integers) |
| Full election (Appendix C) | `election.py` | the 14 QV-34 §9.1 checks, optional log evidence, counts, ctx prefix, results |
| Stable QV-18 log evidence | `logwire.py`, `logcheck.py`, `logio.py` | authenticated entry/record binding, checkpoints/prefix consistency, witness gates/times, fork/rollback and receipt samples |
| Runner / CLI / JSONL adapter | `runner.py`, `cli.py`, `adapter.py`, `__main__.py` | QV-34 §10.2 bounded adapter and §10.3 comparison, applied strictly |

All 48 shipped `log.verify_election` cases are implemented. With no log evidence,
`chk.board.*` and `chk.receipts.sample` remain `not_run`. The **13 notice/control vectors are
supported under QV-ADR-027's approved legacy schema and coordinator authority**. The core rejects
unknown non-ballot types as class-L `E_VERSION`; the independent log path checks control signatures,
header authority and body binding. Notices never waive manifest witness or time requirements.
See [the control milestone handoff](../docs/handoffs/python-controls-20261116.md) for the precise
scope and validation. Full V13 control effects and the future signed `control_seq` wire transition
are separate work. Also not implemented: trustee-decryption spoil mode
(§5.13.4), the ristretto255 one-way map / hash-to-group, scale vectors, and anything
from Phase 2 or 3. The QV-34 §10.2 stdin/stdout adapter is implemented above.

## Experimental signed governance history

The independent Python verifier also implements the isolated
[`qv-governance/1` contract](../docs/GOVERNANCE-CORE.md). It verifies strict policy
bounds, the group-identity digest, founding identity and steward signatures,
old-authority amendments, consecutive hashes, replay/fork behavior and externally
pinned identity/genesis hashes. This is a separate format from a suite-v1 election.

```sh
python3 -I verifier-py/qv_verifier governance verify rules.json \
  --identity-key <64-lowercase-hex-public-key> \
  --genesis-hash <64-lowercase-hex-founding-rules-hash>
```

The JSON report has scope `signed-group-rules`: exit 0 `VERIFIED`, exit 3
`INCOMPLETE`, exit 1 `INVALID`; usage or unreadable input exits 2. A valid genesis
can verify. Signed amendments remain incomplete in the CLI because an unsigned
ratification-manifest reference is not evidence of a passed, final election.
There is no CLI override for this requirement. Public-file input is limited to
4 MiB and a regular, non-symlink file; platforms without nonblocking/no-follow
file primitives refuse the file operation. The pure Python APIs remain usable.

Library callers use `verify_group_rules_export(document, identity_key=...,
genesis_rules_hash=..., verify_ratification=...)` or the bounded wire parser
`verify_group_rules_json`. The optional callback is trusted application code
that independently verifies the exact referenced final governed election. It
receives a read-only request and must return literal `True`; asynchronous or
truthy answers do not grant authority. All signatures and links are checked
before any callback. Unratified predecessors prevent later activation. The
governed-election profile itself, proposals, membership transitions, review time
and disputes are not implemented by this rule-history verifier.

The new conformance cases live in `conformance/governance/v1`, separately from
the unchanged suite-v1 corpus. Focused tests include independent Python signing,
published digest constants and actual CLI failure/success paths.

## Results (only runs actually performed)

The results below are historical (2026-10-21). See [NOTES.md](NOTES.md) for consolidation repairs and remaining parity gates;
the integration validation report records current measurements. In particular, the imported protocol fix corrects the canary's
expected decrypt status without weakening the mutation expectations.

Run on 2026-10-21 at 11:33 UTC with Python 3.13.16 (the only interpreter available; 3.11/3.12 were
not tested). Command: `python3 -I verifier-py/qv_verifier vectors test-vectors/v1`.
Tree state: `test-vectors/MANIFEST.json` listing 73 files with root `924f376e…864e`. All 70 listed
files under `v1/` matched their SHA-256. **The vector tree and the specs were changing during
development** (the `elections/log-layer-4v/` set appeared at about 11:23 and gained an
`expected-report.json` at about 11:30), so re-run before relying on these numbers.

**Summary: 277 vectors: 228 PASS, 1 FAIL, 48 NOT-IMPLEMENTED (exit status 1).** 25 non-vector
input files (log exports, `adv-bundle.json`, `notices/*`) were skipped.

| Vector file | Operation | PASS | FAIL | NOT-IMPL |
|---|---|---|---|---|
| `primitives/hash/sha256.json` | `hash.sha256` | 3 | 0 | 0 |
| `primitives/hash/sha512.json` | `hash.sha512` | 2 | 0 | 0 |
| `primitives/hash/tagged-hash.json` | `hash.tagged` | 31 | 0 | 0 |
| `primitives/encoding/canonical-json.json` | `enc.canon_json` | 23 | 0 | 0 |
| `primitives/ed25519/sign.json` | `ed25519.sign` | 2 | 0 | 0 |
| `primitives/ed25519/verify.json` | `ed25519.verify` | 5 | 0 | 0 |
| `primitives/ristretto/base-multiples.json` | `ristretto.encode_base_mul` | 17 | 0 | 0 |
| `primitives/ristretto/decode.json` | `ristretto.decode` | 26 | 0 | 0 |
| `primitives/ristretto/scalars.json` | `scalar.decode` | 6 | 0 | 0 |
| `protocol/manifest/manifest.json` | `manifest.validate_hash` | 12 | 0 | 0 |
| `protocol/board/roll-merkle.json` | `roll.merkle_root` | 8 | 0 | 0 |
| `protocol/dkg/dkg.json` | `dkg.adjudicate` | 8 | 0 | 0 |
| `protocol/proofs/schnorr-pok/pok.json` | `pok.verify` | 6 | 0 | 0 |
| `protocol/proofs/cp-dleq/dh-reveal.json` | `cp.verify_dh` | 3 | 0 | 0 |
| `protocol/proofs/cds-disjunctive/cds.json` | `cds.verify` | 12 | 0 | 0 |
| `protocol/proofs/contest-limit/limit.json` | `limit.verify` | 5 | 0 | 0 |
| `protocol/ballot/ballot-encrypt.json` | `ballot.encrypt` | 2 | 0 | 0 |
| `protocol/ballot/ballot-verify.json` | `ballot.verify` | 13 | 0 | 0 |
| `protocol/benaloh/spoil-reveal.json` | `benaloh.verify_spoiled` | 3 | 0 | 0 |
| `protocol/rules/rules.json` | `rules.evaluate` | 11 | 0 | 0 |
| `protocol/tally/partial-decrypt/dec.json` | `tally.partial_verify` | 4 | 0 | 0 |
| `elections/tiny-yesno-3v/bundle.json` | full election vs `expected-report.json` | 1 | 0 | 0 |
| `elections/small-approval-20v/bundle.json` | full election vs `expected-report.json` | 1 | 0 | 0 |
| `elections/log-layer-4v/bundle.json` | full election vs `expected-report.json` | 1 | 0 | 0 |
| `mutations/*.json` (23 mutants, incl. 8 `open-*`) | full election vs `expect` | 23 | 0 | 0 |
| `canary/canary-election.json` | full election vs `expected-report.json` | 0 | **1** | 0 |
| `elections/log-layer-4v/vectors.json` | `log.verify_election` (QV-18 log layer) | 0 | 0 | 48 |

All 202 per-operation vectors pass, as do all 23 mutants (15 original + 8 `open-*` for QV-ADR-015) (each named individually in the run
output). For elections, the verdict, the full 14-check map, the counts, the ctx prefix and the
results are compared exactly. For mutants, the verdict and the set of failing checks are compared
exactly, and every expected code must be among the codes emitted (QV-ERR-PY-004).

**The one FAIL is the canary, and it is a disagreement with the vector, not a crash.** The
expected report says `chk.tally.decrypt: pass`. This verifier reports `not_run`, because the
published aggregate for `budget/yes` was tampered with: both trustees' `cp-dec` proofs for that
option are invalid against the published `(A, B)`, so the "≥ t valid proofs" condition cannot
hold. Everything else in the canary report matches (`chk.ballots.valid` fail,
`chk.tally.aggregate` fail, `chk.result.rules` not_run, counts 4/1/3, ctx prefix). See
QV-ERR-PY-005.

Unit tests: `python3 -I -m unittest` ran 37 tests, OK (Python 3.13.16). They use known answers from
RFC 8032 §7.1 (tests 1–3), RFC 9496 A.1, FIPS 197 C.3, GCM test cases 13/14, RFC 5869 case 1, the
QV-03 §7.4 rules table and QV-16 Appendix A.4/A.7. They also build DKG, ballot and decryption
transcripts locally from the QV-16 formulas (honest, bad share, false complaint, invalid DLEQ,
quorum abort, ballot tampering and copying, Benaloh, threshold combination with every 2-subset),
plus integration tests against the repository vectors and the CLI exit codes.

## Choices made where the spec is open

Each is recorded in `docs/errata/spec-errata-log.md`:

* Upper-case hex → `E_SCHEMA` (vectors), not `E_PARSE` (QV-16 §5.20). (QV-ERR-PY-001)
* The rules `outcome` shape follows the vectors. (QV-ERR-PY-003)
* After an anchor mismatch every other check is `not_run`. An unconfirmed aggregate makes
  `chk.tally.decrypt` and `chk.result.rules` `not_run`. (QV-ERR-PY-006/007)
* Record signatures: DKG records and `dkg-*` markers use scope `manifest_hash`, later records use
  `ctx`, and `record_type = body.type`. The tally signature is reported as a note only.
  (QV-ERR-PY-008)
* DKG edge cases (colliding `A_0`, timeliness bounds, duplicates) and counted-ballot selection when
  the latest admissible cast is excluded. (QV-ERR-PY-009/010)
* `bb.witnesses` is accepted in the manifest. (QV-ERR-PY-014)

## Next steps

Remaining work for a real second verifier, in priority order:

1. Review by someone other than the author.
2. Qualify the separately approved B2-05 versioned control-counter transition and full V13
   effects, and independently review the complete 48-case legacy log-evidence implementation.
3. The QV-34 §10.2 adapter protocol, so the shared runner can drive this verifier.
4. Constant-time review, if any secret-handling op is ever used outside the test vectors.
5. Resolving the errata with the spec owner, then regenerating the vectors.
