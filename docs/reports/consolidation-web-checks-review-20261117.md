# Focused web QA candidate review

**No blocking findings.** Reviewed commit `26e06edddbd953a1ebd86a927372a232d54a572b`, tree `ac3735480e347226e2d4a9dda228d2e3cf10868e`, against published W15 `754c586aa65735d50514b543a62a5e3c96a4d138`. Worktree was clean before and after. Review timestamp: 2026-11-18 08:56:41 UTC.

Exactly two test files differ, with two added lines and one removed line:

- `packages/web/test/no-bearer.test.ts:11` returns a URL object directly to both `readFileSync` consumers. Node's local type declarations accept URL as a filesystem path. This removes the pathname-string conversion implicated in the Windows `D:\\D:\\…` failure; test assertions remain unchanged.
- `packages/web/test/app-precompile.test.ts:30` adds `charset: 'utf8' as const` only to the app graph. It matches unchanged production `packages/web/src/build/site.ts:150`. Common/worker options, deterministic byte comparison, catalog/review-gate parity and strict gzip limits remain unchanged.

## Independent execution

Ran on Linux, Node **v24.22.1**, at the reviewed head:

```text
node --test --test-reporter=spec packages/web/test/no-bearer.test.ts packages/web/test/app-precompile.test.ts
```

**4 tests passed; 0 failed; 0 skipped; exit 0.** This covers both no-bearer tests, deterministic precompile output within existing gzip limits, and complete indexed-catalog/review metadata parity.

Log: `qa-web-checks-focused.log`. Exact source SHA-256 bindings and full scope are in `qa-web-checks-review.json`.

## Qualification limits

This is focused Linux validation, not a Windows run or a full 338-test web qualification. Root's planned final-combined-tree suite remains separate. No production build was independently rerun in this review; implementer-reported build ID `32fdc00ba3c1` and total gzip **200263 bytes** remain implementer evidence.

The earlier combined `6f7` receipt—**337 pass / 1 ASCII-budget failure at 204903 bytes**—is preserved. It is not rewritten by this focused candidate's success. The test log verifies the existing caps but does not print exact candidate gzip sizes. No repair is claimed for the separate Windows server recovery/process failures.

No product edits, remote actions or formal GitHub review were made. This agent review does not supply human/security-group approval.


## Publication note

Bare log/receipt names and session-evidence paths identify intermediate records outside this repository. Source identities, commands, results and hashes are retained in the [validation receipt](consolidation-current-validation-20261117.json). The [current reconciliation](consolidation-current-recheck-20261117.md) and timestamped [remote snapshot](consolidation-remote-snapshot-20261117.md) record later published heads and CI observations. This source review does not supply a formal approval.
