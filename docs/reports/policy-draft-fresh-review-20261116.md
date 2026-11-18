# Independent unsigned-policy draft review — 2026-11-16

Reviewed implementation `59bbb57`, integrated with the other continuation lanes
at `b8dc016d4b7b83fd5ae37b9959322dbfba4f04be`. The review used a separate worktree.
Repair and independent regression commit:
`5d0c067c81f452a00df74051bf493c24302bceb1`.

## Findings and repairs

1. **Missing entrenched-quorum floor.** The original validator accepted an
   entrenched quorum of zero while checking the separate 3/4 threshold.
   [QV-03 AC4](../03-governance-and-policy.md) requires both quorum at least 60%
   and the supermajority protection. The repair enforces `quorum_bp >= 6000`.
   Independent probes check 0/5999 rejection, 6000/10000 acceptance, and that a
   valid quorum cannot substitute for the independent threshold. The baseline
   was executed and returned `valid: true` for zero quorum.
2. **Terminal controls in diagnostics.** An unknown JSON property became a raw
   plaintext diagnostic pointer. A valid JSON file containing escaped ESC,
   newline and directional-format characters could alter terminal output. The
   baseline executable emitted the ESC and an injected new line. Plaintext
   rendering now makes control/format/line-separator characters visible, while
   the JSON report preserves the exact JSON pointer. The actual CLI regression
   verifies both representations.
3. **Unused offline schema in browser bundles.** The root integrator identified
   eager schema-construction side effects in the protocol barrel. The offline
   draft format appeared in the seal worker and pushed the integrated build
   above its unchanged 200 KiB total-JavaScript budget. Schema construction now
   occurs only inside draft validation. Public exports and validation behavior
   remain available. The built seal worker no longer contains the draft format.

No new election record, signature rule, database authority or governance policy
was introduced by these repairs. They correct this bounded unsigned tool.

## Independent checks and evidence

Four additional regressions cover the findings plus parsed prototype-named
properties, preservation of existing directory/symlink output targets and fatal
UTF-8 input decoding. Existing exact-rational and capped-diagnostic tests remain.

| Check | Result |
|---|---|
| Existing policy and real CLI tests plus four fresh review probes | 62 passed, 0 failed/skipped; 6.32 seconds |
| Root TypeScript typecheck | Passed |
| Production web build before repair | 200.3 KiB total JavaScript; 96.5 KiB entry; 188.8 KiB standalone verifier |
| Production web build after repair | 198.5 KiB total JavaScript; 95.6 KiB entry; 187.1 KiB standalone verifier |
| Seal-worker content inspection | No `qv-group-policy-draft` format string after repair |
| Diff whitespace check | Passed |

Commands:

```sh
node --test --test-concurrency=1 packages/protocol/test/group-policy-draft.test.ts packages/protocol/test/group-policy-draft-review.test.ts packages/cli/test/policy-draft-executable.test.ts packages/cli/test/policy-draft-review.test.ts
npm run typecheck
npm run build -w @quietvote/web
git diff --check
```

The build command historically warns rather than failing on its size budget;
the measured totals and worker inspection, not its exit code alone, establish
this repair. The final integrated candidate still needs its own build/CI receipt.

## Contract and scope review

The T1/T2 values match the inspected QV-03 template table. T3 intentionally
preserves the source's 48-hour suggestion against inherited 72-hour voting
minimum, and surfaces the 168-hour effective review minimum. The validator does
not silently redefine these policies to make the template pass.

The [governance RFC](../rfcs/governance-v1-contract.md) names concrete next
contracts: genesis authorization, new version/domain binding, membership snapshot
timing, authenticated elapsed-time evidence, recovery-cap accounting, late-addition
denominators/remedies, confidential evidence/finality and arbiter randomness.
Those are separate from the implemented unsigned policy tool. In particular,
`valid: true` does not authenticate steward keys, authorize an election or complete
the signed GroupRules/proposal/membership/dispute workflows.

Input parsing uses the existing strict QV-JSON decoder and bounded regular-file
reads. Output creation refuses existing destinations; this review does not claim
power-loss atomicity or mid-write filesystem-failure recovery for draft files.
No remote writes or live-election operations were performed by this reviewer.

The original author reviewed the source of exact repair `5d0c067` and found no
scoped blocker. All four fresh regressions passed again in a separate worktree.
The signed [cross-review receipt](policy-draft-repair-cross-review-20261116.md)
is `40620c1`; this closes the requested author review of these repairs.
