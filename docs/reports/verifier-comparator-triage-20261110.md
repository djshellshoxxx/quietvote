# Strict verifier mismatch triage — 2026-11-10

**Status:** draft implementation on an isolated branch stacked on draft PR #30. Diagnostic only; **not** a fix for D-92–D-94. No protocol or cryptographic decisions, verifier result changes, expected-vector updates, or test exclusions.

## Reproducible use

From the PR #30-based source tree with its normal Node/Python prerequisites installed:

```sh
node scripts/compare-verifiers.ts --json > /tmp/quietvote-comparator.json
comparator_status=$?
node scripts/triage-verifier-report.mjs --input /tmp/quietvote-comparator.json
triage_status=$?
printf 'strict=%s diagnostic=%s\n' "$comparator_status" "$triage_status"
```

The original strict comparator **must still fail** on the unresolved semantic disagreements. The triage process exits **0** only on a consistent comparator result with zero mismatching cases, **1** on any difference, and **2** on malformed/inconsistent comparator JSON or invocation errors. If the comparator itself aborts before emitting JSON, the triage tool reports an input error, not a passing result. For machine-readable output, add `--json` to the triage command; with no `--input` it reads stdin.

The tool groups the comparator's existing difference strings by field, lists mismatching case IDs, counts verdict agreement separately from whole-report agreement, and explicitly labels skipped Python board/receipt capabilities as **not agreement**. Case IDs and check results are taken from existing comparator JSON; no silent normalization of differences.

## Coverage and limitations

`node --test scripts/triage-verifier-report.test.mjs` covers mismatch grouping, green comparison, malicious/contradictory counters, invalid or duplicated rows, excluded-capability wording, CLI exit codes and bad input. Node built-ins only. No extra dependencies or workflow permission changes.

This tool does **not** validate the cryptographic implementation or resolve which side of any TS/Python disagreement is correct. The actual strict corpus, Python/vector qualification and full workspace CI still require execution against the PR candidate. The current PR #30 hosted CI records one failed strict verifier matrix job and other checks succeeding. The owner/protocol holds remain B3-01 and D-92–D-94. Do not waive any of these gates.

## Traceability

- D-92–D-94: **held**, not changed by diagnostic tooling.
- `scripts/compare-verifiers.ts`: read-only upstream data format; unchanged.
- `scripts/triage-verifier-report.mjs`: new diagnostic CLI.
- `scripts/triage-verifier-report.test.mjs`: seven Node regression tests.
- Reference: [PR #30](https://github.com/djshellshoxxx/quietvote/pull/30) and [protocol handoff](../handoffs/QUIETVOTE-NEXT-PHASE-20261109.md).
