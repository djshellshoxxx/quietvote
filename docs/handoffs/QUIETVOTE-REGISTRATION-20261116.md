# Registration milestone handoff — 2026-11-16

Author lane: `codex/qv-registration-completion`, starting at `bf6c36d`.
Exact design, compatibility and remaining contracts are in the
[implementation report](../reports/registration-implementation-20261116.md).

Implementation includes persisted schema selection, secure hashed enrollment,
the pre-ceremony browser path, actual CLI enrollment, legacy migration preview,
private restore floor, approved default invitation TTL/error policy and a required
real-browser journey. Fresh review runs in a separate worktree.

The first 53-test focused run passed before final review refinements. An initial
web sweep exposed three stale fixtures: generated copy, a noncanonical fake API
ID, and a metadata-free fake enrollment response. Fixtures are updated to the
real contract without weakening the post-roll refusal or no-Bearer-header checks.
Final source-specific rerun results follow in a separate signed receipt commit.

Do not claim hosted browser or release qualification from local typecheck/unit
results. D99 pinned membership, B2-10 private retry linkage and group/label
enrollment are explicitly outside the implemented narrow contract.

## Final lane receipts

Signed implementation: `be730e996bf1b312768fc9b9b08c704005f06af8`.
Signed refusal/expiry follow-up: `894a94d`.
Independent review: `86d6e60` (retained in this lane as `1fc77e9`; integrate once).

| Check on implementation source | Result |
|---|---|
| Full server suite | 277 passed, 0 failed/skipped; 203.6 seconds |
| Full web suite | 312 passed, 0 failed/skipped; 87.2 seconds |
| Actual CLI enrollment and online adapter suite | 6 passed, 0 failed/skipped |
| Typecheck, production build, i18n, links and diff checks | Passed |
| Required browser runner unit checks | 3 passed; seven journeys required |
| Production build budget | 198.3 KiB total JS gzip / 95.6 KiB entry; unchanged 200/110 limits |
| Independent registration trust-boundary probes | 8 passed on isolated reviewed implementation |

Author reread then found distinguishable unknown/used error-detail strings and
acceptance at the exact expiry deadline. Both new regression tests failed on
`be730e9`. Follow-up `894a94d` unifies problem bodies and lookup shape, and refuses
at `now >= expires_at`. Registration, prior HTTP negatives and B2 regressions
then passed **31/31** in 30.2 seconds. The author also reran all eight independently authored review probes on the fixed source: **8/8** passed in 5.8 seconds. This is not a constant-time guarantee.
The full earlier-suite receipt is retained as earlier evidence, not relabeled as
an exact follow-up candidate run. The integrator owns final combined validation.

The [machine-readable receipt](../reports/registration-validation-20261116.json)
records exact source/tree, commands and counts. The
[fresh review report](../reports/registration-fresh-review-20261116.md) records
its independently written probes and incorporated findings. Local tooling could
not reawaken the reviewer after the final tiny fix (`agent thread limit reached`);
the parent integrator must independently inspect that delta before acceptance.

Integrate `be730e9`, `894a94d`, `86d6e60` and this receipt commit once each.
Resolve additive shared-protocol export/CLI-help conflicts by retaining both the
registration and passphrase work. Include the seventh browser journey and record
its hosted result. No GitHub branch, PR, deployment or real user data was changed
by this lane.
