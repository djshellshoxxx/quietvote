# Vector format and manifest hygiene — 2026-11-27

## Scope and source

This completes the bounded mechanical checks in board/verifier inventory task 10,
against PR #78 commit `c110e06bc584e642e9130a82f7a16493ad8b12e3`.
The accepted requirements are [QV-34-REQ-012 and QV-34-REQ-014](../34-test-vectors-conformance.md):
portable encodings and committed corpus size limits. The original
[`vectors.test.ts`](../../packages/protocol/test/vectors.test.ts) named lowercase
hex and no floats in its title but only checked JSON parsing, envelope version,
unique IDs, carriage returns and a per-file character count. Its MANIFEST check
proved membership and digest equality, but accepted duplicate rows and path aliases.

The change is test-only. It adds a
[format helper](../../packages/protocol/test/helpers/vector-hygiene.ts),
[distinguishing fixtures](../../packages/protocol/test/vector-hygiene.test.ts), and
integrates them into the existing conformance harness. No generator, vector,
production schema, verifier or protocol policy changed.

## Checks and boundaries

| Check | Implemented boundary |
| --- | --- |
| File size | At most **1,000,000 actual bytes**, inclusive. This preserves the former decimal MB interpretation and fixes both the character/byte distinction and the excluded exact boundary. |
| Corpus size | At most **25,000,000 actual bytes**, inclusive, across all files, including README, schema metadata and MANIFEST. |
| Encoding | Fatal UTF-8 decoding, without silently replacing malformed bytes; literal carriage returns are rejected in every file. Escaped `\r` inside JSON strings remains data. A JSON BOM is not silently removed. |
| JSON number spelling | After syntax parsing, examine tokens outside quoted strings and reject decimal points or exponent notation, including `1.0` and `1e0` that parse to integers in JavaScript. This does not introduce a new numeric-range, signed-zero or JSON precision policy. |
| Hex | Existing wire schemas identify typed hex fields. Named `*_hex` strings and container leaves, plus explicitly identified operation inputs/outputs, receive the same lowercase, even-length check. No semantic fixed-width, point, scalar, signature or proof validation is added. Wrong-type and missing-field rejection stays with conformance tests. |
| Timestamps | The existing manifest schema identifies `created`, `voting_open` and `voting_close`. String values must encode a real UTC calendar date in `YYYY-MM-DDTHH:MM:SSZ`, consistent with [QV-16 §5.5](../16-crypto-protocol.md) and the existing `validTs` contract. This does not enforce time ordering. |
| MANIFEST | Exactly one canonical relative path per corpus file, excluding MANIFEST itself. No duplicate, absent, missing, traversing, absolute, backslash or self path; SHA-256 values must be lowercase 32-byte hex and equal the actual file bytes. The declared Merkle digest encoding is checked, without claiming a new Merkle/signature verification gate. |

Field identification uses [`schema.ts`](../../packages/protocol/src/schema.ts),
the bundle/receipt types and the current generator's operation contracts. It does
not classify arbitrary hex-looking or date-looking human text. In particular,
`source.retrieved` is date-only metadata, the existing `source_sha256` values can
explicitly say `not-computed`, and canonical-JSON rejection cases are quoted
`input.text` values. Those strings remain opaque. New operation or record families
must extend the explicit format mapping when they add differently named encodings.

### Intentional malformed fields

The corpus itself contains two deliberately uppercase hex inputs. The helper pins
their exact file, vector ID, field location, value and expected rejection outcome;
the exception must be consumed. Changing/removing a fixture or changing its outcome
fails the check. Other fields in the same negative case are still checked.

| Fixture | Sole excepted field | Existing generator evidence and outcome |
| --- | --- | --- |
| `v1/protocol/manifest/manifest.json`, `manifest-uppercase-hex` | `input.manifest.election_id` of that vector ID | `generate.ts` deliberately uppercases the election ID; expected `ok: false`, `E_SCHEMA`. |
| `v1/mutations/non-canonical-hex.json`, `non-canonical-hex` | `/bundle/log/21/entry/body/contests/0/sel/0/a` | `generate.ts` deliberately uppercases a cast ciphertext component; expected `FAIL`, named encoding/ballot/aggregate failures, `E_SCHEMA` and `E_COUNTED_ROOT`. |

The generator definitions are in
[`test/vecgen/generate.ts`](../../packages/protocol/test/vecgen/generate.ts).
There is no blanket exception for vectors tagged negative or expecting failure.
Malformed cryptographic lengths that remain valid byte strings also remain intact.

The manifest contains **87 distinct paths and 86 distinct digest values**.
`v1/elections/log-layer-4v/notices/waiver-before-open.bundle.json` and
`v1/elections/log-layer-4v/notices/waiver-in-anchor-entry.bundle.json` intentionally
contain identical bytes. Digest values therefore need not be globally unique;
the checked bijection is between paths and files.

## Validation

On Linux with Node **24.22.3**:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/protocol/test/vector-hygiene.test.ts \
  packages/protocol/test/vectors.test.ts
```

**41/41 passed**, comprising 13 new fixture tests and all 28 existing vector tests.
This includes exact regeneration, primitive/protocol vectors, full elections,
every named mutation, the canary, the strengthened corpus checks and the manifest
bijection. The initial real-corpus format run identified the deliberate ciphertext
uppercase mutation; its generator and exact rejection outcome were reviewed before
adding the second field-local exception.

The scoped protocol TypeScript check also passed with a 768 MiB heap:

```sh
node --max-old-space-size=768 node_modules/typescript/bin/tsc \
  -p packages/protocol/tsconfig.json --noEmit
```

The fixtures distinguish malformed UTF-8 hidden by replacement decoding; literal
CR versus escaped CR; exponent/fraction spellings versus opaque quoted inputs;
the inclusive 1 MB boundary and a multibyte overflow accepted by the old character
count; the inclusive 25 MB boundary including metadata; duplicate/aliased/missing
manifest paths, bad encodings and wrong hashes; typed hex/timestamp errors; and
exception value, path, ID, outcome, deletion and unrelated-field changes.

The frozen corpus remains **88 files / 2,843,552 bytes**, with Git tree
`afc502f89b04efd9ed9d29f8d7e3d8b71542a506`. There is no diff under `test-vectors`,
the generator or protocol production source. Existing envelope/version/unique-ID
assertions and all existing conformance assertions remain in place.

The isolated offline install could not fetch an uncached `playwright-core` tarball.
The existing installed dependency tree was copied only after its lockfile matched
byte-for-byte; `npm run vendor:check` passed for both pinned Noble packages and
132 verbatim files. No dependency, package manifest or lockfile was changed.
Hosted Node 22 and native platform CI remain integration qualifications; this local
evidence does not claim those runs occurred.
