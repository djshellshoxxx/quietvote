# Shared module packaging for the sealing worker

## Source and purpose

Production/test commit: `0ae40d1ada4a9b2cac12a90ddca5d16858e86ede`.
Source tree: `be0386a62dc13ed5f9a3cf198273435a664b32d9`.
Parent session-storage checkpoint: `272f8097eeb8d904cf93a25fb28c209545b68b7e`.
This receipt qualifies that checkpoint plus the packaging change. Later
session-storage or integration changes require their own final build receipt.

The session-storage checkpoint exceeded the existing aggregate JavaScript gzip
budget by 2,133 bytes. The app and its existing ES-module sealing worker each
bundled overlapping protocol/cryptographic code. Both entries now use the same
esbuild splitting graph, so each shared asset is emitted once. Relative imports
remain valid beside the two hashed entry files. Every asset remains in the
content-digest manifest, and the application graph retains dependency-ordered
integrity preloads.

Each worker still has its own execution realm and module state. This changes
packaging only: cryptographic source, worker request/response semantics,
termination, CSP, dependencies, catalog messages, translation review gates, and
the independent single-file verifier implementation are unchanged. The worker
entry and its imports still have the existing W15 runtime integrity limitation;
listing digests in the asset manifest does not close that boundary.

## Measured build

The production CLI generated build `ecaf632ce7c4` from this source. All emitted
JavaScript files, including the worker and all five draft catalog chunks, are
included exactly once in the aggregate measurement.

| Measurement | Parent checkpoint | Shared graph | Existing limit |
| --- | ---: | ---: | ---: |
| All JavaScript assets, gzip bytes | 206,933 | 188,295 | below 204,800 |
| App entry alone, gzip bytes | 105,669 | 54,516 | below 112,640 |
| Standalone verifier, raw bytes | 198,737 | 198,737 | below 409,600 |

The aggregate decreases by 18,638 bytes and has 16,505 bytes of headroom. The
smaller entry does **not** represent the full initial download: its static
shared dependencies also load. CLI commentary and test descriptions make that
distinction explicit. The worker entry is 121 gzip bytes, with its algorithm in
the shared graph. No budget, assertion, or locale content was removed or relaxed.

## Validation

- 24/24 focused tests passed, with no skips or cancellations: production
  precompilation, complete catalog/formatter parity, deterministic builds,
  asset hashes/SRI, strict CSP output, lazy catalog/review behavior, unchanged
  size budgets, sealing-worker settlement, and the new emitted-worker test.
- The emitted-worker regression builds the actual production assets, checks
  its shared imports against SHA-256/SHA-384 manifest values, then loads that
  emitted entry in a separate Node worker realm. For identical valid inputs it
  reproduces the source's complete self-checked response, including encrypted
  ballot content, proofs, ballot code, secret randomness and attempt number.
  This is actual emitted-module execution, not a mocked call to the source.
- Strict scoped TypeScript checking of all web source and unit tests passed
  under a 384 MiB heap cap, without diagnostics.
- The ordinary production CLI build passed verified-vendor consumption and
  produced the measurements above. An initial invocation mistakenly supplied
  an unsupported `--out` flag; the corrected positional-output invocation is
  the successful receipt. No application change was needed for that error.
- `git diff --check` passed. The 24-test run preceded only test-description and
  CLI-comment wording cleanup; no tested assertion or runtime behavior changed.

Raw local receipts are `shared-worker-build-tests.log`,
`shared-worker-web-tsc.log`, and `shared-worker-build.log` in the task evidence
directory. The baseline is `session-storage-build-272f809.log`.

## Qualification boundaries

The hosted production browser journeys must still exercise worker loading under
the deployed CSP and real browser module implementation on the final candidate.
Node's separate realm is useful execution evidence but is not that browser
qualification. No local Chromium retry was made after the already established
container launch failure. This report also does not qualify native Windows ACL
behavior, formal security approval, release reproducibility, or later source.

Earlier English-catalog representation experiments remained over budget and
were preserved separately on `worker/quietvote-english-catalog-compaction`;
none of their changes is included in this packaging commit.
