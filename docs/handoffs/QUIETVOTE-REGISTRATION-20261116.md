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
