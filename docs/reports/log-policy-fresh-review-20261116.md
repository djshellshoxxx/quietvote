# P1 evidence-required verdict: independent review

Reviewed production source: `3ab2928761100e82a2cba3ad76b2095f0ffdc039`.
Reviewer: `/root/python_log_fresh_review`, isolated worktree
`qv-log-policy-fresh-review`. This commit changes tests and this receipt only.

The approved boundary requires authenticated append-only and witness checks for
default PASS. Only an explicit caller Boolean enables content-only scope, for
absent evidence or authenticated append-only evidence whose signed manifest
requires zero witnesses. Fatal findings prevail. Supplied malformed, partial,
unchecked or interrupted evidence cannot use the absent-evidence exception.
External anchor policy is unchanged.

## Findings and independent evidence

No unresolved blocker was found in the reviewed protocol, Node wrapper, Python,
CLI option forwarding or public web helper boundary. Before this milestone,
independent probes reproduced PASS after a thrown independent board layer and
PASS with a redacted/PARTIAL supplied board. The frozen source closes both
cases. The former exception also exposed raw exception text; the reviewed path
now emits a generic caveat.

The retained tests cover:

- Default INCOMPLETE with complete tally contents but absent board evidence;
  this does not incorrectly mark the tally check as unfinished.
- Payload option injection and truthy non-Boolean caller options cannot enable
  content-only scope. Explicit Boolean opt-out carries a visible caveat.
- Null, empty, malformed, redacted/PARTIAL and interrupted supplied evidence
  cannot return PASS through the opt-out.
- An unsigned export policy claiming zero witnesses cannot replace the signed
  manifest threshold. A real signed zero-witness election requires explicit
  content-only scope; interrupted witness verification still prevents PASS.
- Actual signed and witnessed positive controls pass. The Node wrapper's
  positive fixture supplies transport witness metadata matching the signed
  manifest; corpus files, signatures and checkpoints are unchanged.
- Established fatal evidence and invalid-manifest failures retain FAIL through
  fault handling. No raw injected exception text reaches reports.
- A genuine signed and witnessed prefix with no tally remains INCOMPLETE even
  with content-only scope.
- Both shipped TypeScript CLI entrypoints and the Python CLI preserve PASS,
  FAIL and INCOMPLETE exits. The TypeScript CLI probes use `--skip-selftest`
  solely to isolate public parsing, option forwarding and verdict exits; they
  do not qualify the canary.
- The public web helper has no content-only escape hatch, accepts actual board
  evidence and hides results for absent or malformed evidence.

## Validation

All checks ran against the exact production SHA above plus review tests.

| Check | Result |
| --- | --- |
| Fresh Node wrapper/protocol and public web boundary tests, before the additive CLI case | 8 passed, 0 failed/skipped; 13.374 s |
| Fresh Python boundary and actual CLI tests | 7 passed; 12.365 s |
| Additive actual TypeScript CLI entrypoint test | 1 passed; 5.696 s |
| `npm run typecheck` | Passed |

There are 16 retained independent tests across three files. The additive CLI
test exercises four verdict/flag combinations through each of two entrypoints.
CLI and typecheck receipts are recorded under
`/workspace/scratch/d66ff14a02a0/validation/p1-fresh-review-{cli,typecheck}*`.
The full Python suite was not duplicated because the author was running the
expanded suite; this receipt claims only the independent checks above.

## Handoff and remaining boundaries

Integrate this review commit after the P1 source and its PY-02 dependency.
No production repairs or corpus expectation changes are included here.

The later HTTP/export follow-up `29c122c` is outside this exact-source review.
Its full-record additive export correction, HTTP authorization fixtures and
offline DOM checks require their own receipt. Supplemental-author pin
forwarding is a separate lane. This review does not establish hosted CI,
browser matrix coverage, deployment readiness or professional security review.
