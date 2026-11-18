# QuietVote PR #55 security and standards review

> Follow-up: keyless receipt repair `8d77883` was separately reviewed and integrated as `4b93752`; the original #55 review below remains pinned to its stated source.

Reviewed exact delta `c6a4df56351f560656377729df3a33192fe940b9..66dcfafa885bdbd82cae808c33cebe0d7f8a21ab` in a detached worktree. Read the contribution rules, QV-30, signed-governance contract, author-pin trust boundaries, Python adapter and approved-parity handoffs, and their production code and regressions.

## Security outcome

No new runtime blocker found within this delta. Recommend integrating it into the prototype integration branch once the separately diagnosed generated-copy CI mismatch is repaired and the combined candidate is verified.

- **Supplemental keys:** trusted caller input is bounded and never discovered from export metadata. Record-specific author resolution prevents an extra signer gaining coordinator, trustee, voter, control, or witness authority. Missing witness evidence remains INCOMPLETE. Input, route and live-snapshot changes invalidate stale UI results.
- **Governance:** exact external identity/genesis pins, old-steward quorum, strict signed bodies, consecutive history and entrenched-amendment classification are enforced. Unsigned ratification pointers cannot activate amendments. Only literal synchronous `true` from the trusted evidence callback can advance active history; later ratification cannot bridge a missing predecessor. The CLI has no approval-fabrication flag.
- **Python adapter/parity:** directory-descriptor traversal rejects symlinks, parent paths and special files; request/response limits and hostile framing recover or terminate explicitly. Caller-only content scope is preserved. Marker signatures precede selection, conflicting tallies remain fatal, excluded ballots cannot displace earlier eligible votes, and identity DH statements are rejected.
- **SQLite:** three anonymous placeholders receive the same cutoff; retention predicates and timing semantics are preserved.

## Standards

One contribution-provenance finding affecting two inherited commits: `42263c4` and `66dcfaf` are authored by `sheldon <127660907+djshellshoxxx@users.noreply.github.com>` but carry only `Signed-off-by: Codex <codex@openai.com>`. This does not satisfy CONTRIBUTING's matching-author DCO rule or QV-30 §10. Preserve the actual history and record the mismatch; do not fabricate retrospective attestation. No additional heuristic refactor is justified for this consolidation.

## Executed verification

On the reviewed source: 18 Node tests passed across governance fresh review, supplemental-author fresh review and author-pin UI races; 15 Python adapter tests passed; 26 Python approved-parity tests passed. Zero failures/skips in those completed runs. Initial Python dotted-module invocation failed because isolated mode omitted the checkout from the module search path; the documented discovery invocations above succeeded. Shared installed dependencies were used; production files matched the frozen source.

This is source-specific agent review. It does not supply governed-election ratification/finality, independent professional protocol approval, Windows/macOS qualification or release acceptance. A separate inherited keyless-receipt defect, outside this PR delta, is being recovered from historical commit `13b86c2` for the parent consolidation review.
