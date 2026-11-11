# Unfinished work preserved on 2026-11-11

**Nothing in this directory was reviewed, completed or run to a result. It is kept only so the work is not lost when the session's machine is reclaimed. QuietVote is unaudited and not for real elections.**

Three test-writing agents were still working when the session's machine restarted, after the owner had already paused the project. They were not resumed. What they had written so far is here, unchanged apart from replacing machine-specific scratch paths.

| File | What it is | State |
|---|---|---|
| `t1-random-elections.patch` | Two helper modules for a randomized election harness (backlog T-244): an independent plaintext oracle and a random election plan generator, for `packages/protocol/test/helpers/` | Helpers only. No test file was written. Not typechecked by the coordinator. |
| `t3-privacy-canary.patch` | Two helper modules for privacy canary tests (backlog T-245): a scanner for log, database and export artifacts and a server fixture, for `packages/server/test/helpers/` | Helpers only. No test file was written. Not typechecked by the coordinator. |
| `probes/t1`, `probes/t2`, `probes/t3`, `probes/t5`, `probes/s2` | Exploration scripts the agents wrote while learning the code: randomized elections, server concurrency and close races, privacy scanning, verifier fuzzing, tally review | Scratch. They may be wrong, may not run, and prove nothing. Stored with a `.txt` suffix so no tool picks them up. |

Apply a patch from the repository root with `git apply docs/handoffs/wip-20261111/<name>.patch`, then typecheck before building on it.

The briefs for these tasks are summarized in [the 2026-11-11 handoff](../QUIETVOTE-COMPLETION-20261111.md), section 8, and the acceptance checks are in the task files under [docs/reports/inventory-20261111/](../../reports/inventory-20261111/).
