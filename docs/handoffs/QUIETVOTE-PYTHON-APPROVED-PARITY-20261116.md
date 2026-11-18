# Approved Python semantic parity — 2026-11-16

Production milestone: `81287168d1683e9fc4453727a9de3f7ca7c295e5`, based on
root integration `28d9e23`. Worktree `qv-python-approved-parity`; branch
`codex/qv-python-approved-parity`. Independent fresh review is still required;
this handoff records the implementation lane's own evidence.

## Implemented scope

The existing QV-ADR-027 approval supplies authority for B1-02 option A and the
individual B1-07 reference readings. This milestone does not invent an owner
approval or apply the reference blindly to contradictory source text.

- Non-tally encoding/schema noise and unsupported record versions cannot veto
  an otherwise valid content computation. Malformed current-suite tally bodies
  remain fatal and unexamined. The log layer separately authenticates evidence.
- Marker selection checks coordinator threshold signatures before occupying a
  phase. Later valid duplicates and rejected signatures remain visible. Required
  DKG markers still cannot be fabricated; missing authenticated voting markers
  leave the outcome incomplete.
- Identical canonical tally bodies are duplicates. Different later bodies yield
  fatal `E_RESULT` even when the first tally's computation passes.
- Count quorum uses the single canonical `value` field. Strict threshold equality
  controls yes/no ties; inclusive equality passes. Winners have deterministic
  count/ID ordering, including above-cutoff ties and all-options-win cases.
- DKG timely equivocation disqualifies the phase record independently of input
  order; identical repeats and late conflicting records cannot force a fork.
  Commit cutoff is `dkg-r1-open` as §5.7.3 specifies. Valid-proof complaints still
  adjudicate an actual published share from an already R2-excluded dealer.
- Only accepted non-spoiled casts advance the chain, count limit and code owner;
  an excluded later cast preserves the earlier eligible vote.
- The explicit QV-16 suite-v1 roll maximum of 2^20 is enforced on pinned and
  supplied sizes without constructing oversized rolls in tests.

The Python arithmetic remains independent; no TypeScript production code was
modified or imported. The corpus, expected reports and strict comparator are
unchanged. New paired tests use preserved public audit fixtures; they never read
the fixtures' recorded TS output. Specific decisions and remaining gaps are in
the [errata addendum](../errata/spec-errata-log.md#approved-non-ballot-and-outcome-reconciliation-2026-11-16).

`Finding.check` is `null` for a finding that does not fail a named check. Its
code, fatality and detail remain visible. Reports are ordinary JSON; this adds no
signed QV-JSON field or acceptance authority. Default missing-log/witness policy
still caps verification at INCOMPLETE, and fatal evidence always wins.

## Validation receipts

Before repairs, eight preserved audit elections falsely failed in Python while
the baseline passed. The distinguishing errors were `E_SIG`, `E_SCHEMA`,
`E_RESULT`, `E_COUNTED_ROOT` and `E_AGG_MISMATCH`; the repaired cases now compute
their published honest result. The separate conflicting-tally case still fails.

| Check | Lane result and scope |
|---|---|
| TypeScript paired cases | 13/13 passed, 4.883 seconds; unchanged production reference |
| Initial focused Python semantic cases | 10/10 passed, 9.476 seconds; before the two additional bound/repeat regressions |
| Python incomplete-verdict rerun | 6/6 passed, 4.090 seconds after updating two obsolete classification expectations to the approved, paired-reference behavior |
| Python full suite | 181/181 passed, 140.613 seconds; no failures/skips |
| Unchanged Python corpus | 282/282 PASS, 0 FAIL, 0 NOT-IMPLEMENTED; all 79 file hashes match |
| Existing strict comparison | 27/27 agree, 0 differences, exit 0; existing exclusions unchanged |
| Expanded audit comparison | 10/10 agree on verdict, all 14 checks, cast/spoiled/counted counts, results and code set. TS-only `counts.ignored` counters were excluded explicitly. This is not equality of implementation-specific finding text. |
| Typecheck | Passed with a 512 MiB Node heap |
| Documentation links | 1,328 links in 255 files; none broken |

The first full suite ran 179 tests and found two stale test expectations: it
expected every unsupported tally version to be fatal and every conflicting tally
to fail aggregate/schema. Both now have explicit assertions for the approved
semantics and independent TypeScript tests; no production behavior was weakened
to satisfy these old expectations. The final passing suite includes the roll-bound and exact
repeat regressions. Final integrated hosted CI remains the integrator's gate.

Commands from the repository root:

```sh
node --test packages/protocol/test/approved-semantic-parity.test.ts
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet
node scripts/compare-verifiers.ts
NODE_OPTIONS=--max-old-space-size=512 npm run typecheck
node scripts/check-links.mjs
```

From `verifier-py/`:

```sh
python3 -I -m unittest discover -s tests -t .
```

## Fresh-review and next-milestone boundary

Review the class-L rejection boundary, marker signature/phase selection,
conflicting tally fatality, all excluded-cast chain effects, DKG equivocation and
complaint provenance, exact outcome arithmetic, and the nullable finding check.
Exercise missing valid evidence and supplied hostile board evidence; a
content-only PASS must never become a default witnessed PASS.

B1-08 is not globally closed. Exact witness-name/schema rules, method restrictions
and numeric limits without a cited source still need individual reconciliation.
For example, QV-16/QV-20 explicitly permit threshold `basis:roll` while the TS
schema rejects it; this milestone preserves that documented difference rather
than silently deleting a specified capability. Trustee-mode spoil cryptography,
D-95 zero-digest handling and full newer control effects remain separate work.
Independent external crypto/security review and release qualification are not
provided by this implementation lane or by agreement between two programs.
