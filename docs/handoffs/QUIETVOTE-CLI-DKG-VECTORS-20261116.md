# CLI DKG conformance completion — 2026-11-16

Signed implementation: `73d293c2c4e48d34316d9cb45368cdfe31fa09c4`, based on
`12565e6b9de976b439b140cb8f34845dcb72274f`. This closes the CLI runner's final
explicitly unsupported operation, `dkg.adjudicate`. It does not add a new DKG
algorithm or alter election admission, primitives, transcripts or corpus bytes.

## Behavior

`qv vectors check` adapts the QV-34 public DKG input layout to the production
`adjudicateDkg` function. Closed schema checks cover the manifest hash, bounded
numeric metadata, all six marker fields, sequenced record wrappers and existing
record-body schemas. The adapter does not sort, filter or silently discard
records. The existing adjudicator decides phase order, proof validity,
complaints, disqualification and quorum.

Successful outputs compare the complete `Q`, `qmask`, `K_hex`, `ctx_hex` and
`Y_hex` map, not a subset of the expected shares. Failed adjudication retains its
named error, including the shipped `E_DKG_QUORUM` abort. The runner now awaits
operation results and catches rejected operations as failed rows. Unknown
operations remain explicitly unsupported and still fail `--strict` mode.

No production import references test/generator modules. Input-layout sources
were the existing corpus and generator adapter; cryptographic computation uses
the production implementation already exercised by the protocol vector suite.

## Validation

| Command or check | Result at implementation source |
|---|---|
| `node --test --test-concurrency=1 packages/cli/test/dkg-vectors.test.ts` | 4 tests passed, 0 failed/skipped, 3.948 seconds |
| `NODE_OPTIONS=--max-old-space-size=512 npm run typecheck` | Exit 0 |
| `node packages/cli/bin/qv.ts vectors check --strict` | **420/420 passed, 0 failed, 0 files not run**, exit 0, 9.381 seconds |
| Corpus diff against the lane base | Empty |
| `git diff --check` | Passed |

The executable tests run all eight original DKG ceremonies/abort cases, reject
independently forged qualification/key/context/share expectations, reject
malformed metadata/markers/records, and retain strict refusal of an unknown
operation. Temporary test corpora recalculate their own hashes so a false
expected output must be detected by computation, not merely by manifest drift.
The existing full-corpus CLI test now expects strict success instead of one
unsupported DKG file. Its whole-file rerun is left to integrated CI because the
strict command above already exercised the full shipped corpus.

## Fresh integration

1. Integrate the implementation once and review the small input-adapter and
   asynchronous-runner change. The root integrator owns the independent review.
2. Preserve the parallel P1 worker's explicit content-only conformance options
   when merging `cmd-vectors.ts`; this lane did not change `verifyBundle` calls.
3. Re-run strict vectors and the affected CLI tests after P1 integration. Neither
   this lane nor an unchanged corpus pass qualifies the broader release.
