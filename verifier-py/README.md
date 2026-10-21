# py-qv-verify — independent second verifier (Python)

> **Status: SKELETON. Unaudited. NOT for real elections.**
> A passing run means "agrees with the v1 test vectors on the cases they cover". It is not a
> security claim (QV-34-REQ-015). Nobody has reviewed this code, and its arithmetic is not
> constant-time.

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

## Running

From the repository root:

```sh
python3 -I verifier-py/qv_verifier vectors test-vectors/v1            # one line per vector
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet    # only non-PASS lines
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --report out.json
```

Each vector is reported `PASS`, `FAIL` or `NOT-IMPLEMENTED`. The exit status is **1 only if a
vector FAILs**, 0 otherwise (NOT-IMPLEMENTED does not fail the run), and 2 on usage errors.

About `python -I -m qv_verifier`: from Python 3.11 on, `-I` implies `-P` (safe path), so the
current directory is **not** put on `sys.path`. `python -I -m qv_verifier …` therefore works only
when the package is importable, for example after installation. From a checkout, use the directory
form above: it runs `qv_verifier/__main__.py`, which puts the package's parent directory on
`sys.path`. The `-m` form was tested and fails from `verifier-py/` with "No module named qv_verifier".

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
| Framed hash, label registry | `framed_hash.py` | QV-16 §5.3/§5.4: H256, H512, hs, hs_nz (counter field), 27 labels |
| QV-JSON / JCS | `qvjson.py` | strict parse (duplicate keys, floats, null, -0, unsafe ints, lone surrogates, non-NFC, control chars, trailing data, BOM); RFC 8785 serialisation |
| RFC 9162 Merkle, voter roll | `merkle.py` | roll leaves `pk ‖ u32(1)`, sorted, unique, valid non-small-order keys |
| Sigma proofs | `proofs.py` | Schnorr PoK, DH-reveal DLEQ, CDS 0/1, selection limit, partial decryption |
| HKDF, AES-256-GCM | `aead.py` | for public adjudication of DKG complaints |
| DKG adjudication | `dkg.py` | R1, R2, complaints → Q, K, Y_j, transcript hash, ctx |
| Manifest | `manifest.py` | closed schema + semantic rules + privacy floor; manifest hash |
| Ballots | `ballot.py` | deterministic encryption from ξ, §5.14.4 checks 1–9, Benaloh reveal reproduction |
| Rules | `rules.py` | quorum, threshold, tie-breaks, multi-winner (exact integers) |
| Full election (Appendix C) | `election.py` | the 14 QV-34 §9.1 checks (board/witness/receipts → `not_run`), counts, ctx prefix, results |
| Runner / CLI | `runner.py`, `cli.py`, `__main__.py` | QV-34 §10.3 comparison, applied strictly |

Not implemented: the QV-18 log layer (`log.verify_election`, i.e. checkpoints, consistency and
inclusion proofs, witness cosignatures, receipts, notices), so `chk.board.*` and
`chk.receipts.sample` are always `not_run`. Also not implemented: trustee-decryption spoil mode
(§5.13.4), the ristretto255 one-way map / hash-to-group, the QV-34 §10.2 stdin/stdout adapter
protocol, scale vectors, and anything from Phase 2 or 3.

## Results (only runs actually performed)

Run on 2026-10-21 at 11:33 UTC with Python 3.13.16 (the only interpreter available; 3.11/3.12 were
not tested). Command: `python3 -I verifier-py/qv_verifier vectors test-vectors/v1`.
Tree state: `test-vectors/MANIFEST.json` listing 73 files with root `924f376e…864e`. All 70 listed
files under `v1/` matched their SHA-256. **The vector tree and the specs were changing during
development** (the `elections/log-layer-4v/` set appeared at about 11:23 and gained an
`expected-report.json` at about 11:30), so re-run before relying on these numbers.

**Summary: 269 vectors: 220 PASS, 1 FAIL, 48 NOT-IMPLEMENTED (exit status 1).** 25 non-vector
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
| `mutations/*.json` (15 mutants) | full election vs `expect` | 15 | 0 | 0 |
| `canary/canary-election.json` | full election vs `expected-report.json` | 0 | **1** | 0 |
| `elections/log-layer-4v/vectors.json` | `log.verify_election` (QV-18 log layer) | 0 | 0 | 48 |

All 202 per-operation vectors pass, as do all 15 mutants (each named individually in the run
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
2. The QV-18 log layer: checkpoints, consistency and inclusion proofs, witnesses and receipts,
   which are the 48 `log.verify_election` vectors.
3. The QV-34 §10.2 adapter protocol, so the shared runner can drive this verifier.
4. Constant-time review, if any secret-handling op is ever used outside the test vectors.
5. Resolving the errata with the spec owner, then regenerating the vectors.
