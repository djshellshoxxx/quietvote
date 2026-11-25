# Policy draft repair cross-review — 2026-11-16

Reviewed exact repair `5d0c067c81f452a00df74051bf493c24302bceb1` against
its parent. The original policy-draft author reviewed the independently authored
repair in a separate worktree. No scoped blocker found.

- The new `entrenched.quorum_bp >= 6000` condition directly implements QV-03 §11
  AC4 and remains independent of the existing ≥3/4 outcome threshold. It changes
  the unsigned draft validator only. The regression checks 0/5999 refusal,
  6000/10000 acceptance and the independent threshold requirement.
- Lazy schema construction preserves the same schema and diagnostics while
  removing module-level function calls that prevented unused worker code from
  being removed. The repair's production build receipt is separate evidence;
  this cross-review did not rerun or independently measure that bundle.
- Plain diagnostics escape control/format/line-separator characters in the
  attacker-controlled JSON pointer. JSON reports retain the exact pointer. The
  remaining warning and required-configuration text uses fixed program strings;
  strict parser errors do not interpolate JSON key content.

Fresh command executed at the reviewed repair:

```sh
node --test --test-concurrency=1 packages/protocol/test/group-policy-draft-review.test.ts packages/cli/test/policy-draft-review.test.ts
```

Result: **4 passed, 0 failed/skipped**. These include actual CLI output escaping,
malformed-byte refusal and existing-target preservation. No production source was
modified by this cross-review. This receipt does not qualify signed governance,
live election policy, external security review or the full integrated candidate.
