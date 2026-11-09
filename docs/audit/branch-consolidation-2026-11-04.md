# QuietVote consolidation audit — 2026-11-04

This ledger records GitHub commit comparisons, not merged source or executed tests.

| PR | Ahead of main | Behind main | Compared files |
|---|---:|---:|---:|
| #3 | 70 | 1 | 300+ |
| #10 | 90 | 1 | 300+ |
| #14 | 98 | 1 | 300+ |
| #17 | 90 | 1 | 300+ |
| #22 | 203 | 0 | 300+ |
| #24 | 157 | 0 | 300+ |
| #25 | 205 | 0 | 300+ |
| #26 | 214 | 0 | 300+ |
| #27 | 238 | 0 | 300+ |
| #28 | 240 | 0 | 300+ |

The GitHub compare endpoint capped large file lists at 300, so these are incomplete file inventories.

## Verified integration ancestry

- #22 → #25: 2 ahead / 0 behind; 3 changed files.
- #25 → #26: 9 ahead / 0 behind; 21 changed files.
- #26 → #27: 24 ahead / 0 behind; 60 changed files.
- #27 → #28: 2 ahead / 0 behind; 2 changed files.
- #24 → #27: 81 ahead / 0 behind; #24 is an ancestor of #27.

The chain #22 → #25 → #26 → #27 → #28 should be treated as cumulative history, not separate independent merges.

## Integration plan

1. Inspect #28's actual PR base, CI and security reviews; confirm that #22–#27 content is retained and not reverted.
2. Use #28 as the latest integration candidate, with #27's ordinary UX and CI work and #26's Windows trustee fixture work. Do not merge the chain separately.
3. Compare older open security/protocol PRs #6–#17 against #28 to identify unique changes or unresolved findings. Pay particular attention to trustee release, spoil shares, tally, protocol, board and verifier safety.
4. Reconcile #20–#21 documentation and audit evidence without losing open protocol decisions.
5. Run complete JS/TS build, typecheck, tests, trustee fixture tests, security/protocol vectors, lint, action-pin validation, and available cross-platform checks. Record actual results.
6. Do not claim cryptographic security or election readiness solely from passing CI. Preserve unresolved protocol review blockers and owner decisions.
7. Merge only after current required checks and reviews pass; keep contributor branches intact until confirmed integrated.

This audit does not claim any source code was consolidated or tested.
