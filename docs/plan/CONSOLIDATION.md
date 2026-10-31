# QuietVote consolidation — 2026-10-30

Status: in progress. This is an unaudited prototype, not for real elections.

## Scope and execution plan

The owner requested one tested integration branch from refreshed
`claude/sharp-archimedes-tu76rh` (`2a02bd3249f3c988ef5afd8e9559fa13a959bdef`).
The new branch is `integration/quietvote-consolidated-20261030`. The checkout
was newly cloned at `/workspace/quietvote`; no local edits needed preservation.
Main and all existing source branches remain unchanged.

- [x] Refresh all branch and PR head refs and all open/closed PR metadata.
- [ ] Account for ancestry, unique commits, patch equivalence and omissions.
- [ ] Integrate shared crypto/protocol fixes before server, board/CLI and trustee
  consumers; validate each coherent package slice.
- [ ] Integrate dependency/CI gates and useful newer ordinary checkpoint work.
- [ ] Reproduce surviving audit defects, add correct-behavior regressions and
  repair semantics that are clear. Preserve owner decisions as explicit blockers.
- [ ] Exercise real server/client contracts, supported cross-verifier cases and
  production browser/CSP journeys; add missing CI coverage.
- [ ] Reconcile documentation/status last, record all validation and remaining
  gates, scan outgoing source versions, publish only this branch and a draft PR.
- [ ] Create `docs/handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md`, link the restart entry,
  and explicitly assess milestone completion.

## Constraints and review focus

Use Node >=22.18, `npm ci` and Python 3. Preserve the license, software-artwork
label, KDF floors, negative vectors and required review gates. Never merge to
main, release, deploy, delete source branches, close existing PRs or enable
auto-merge. Historical task restrictions do not limit this new authorized
consolidation, but external review and unresolved policy decisions still do.

Regression focus: malformed anonymous requests must not crash/block the server;
registration must obey the permitted authority state; copied cast ciphertexts
must never receive spoil releases; proof/skipped-check headlines must reflect
actual verification; backup, key clearing and fork/path checks must fail safely.

## Environment evidence

The supported environment status reports running/connected, current observations,
and enforced restricted policy permitting GitHub and package registries. Ordinary
sandbox clone failed at `proxy:8080`. The supported executor network-permission
path succeeded with the inherited proxy and CA intact. No direct-network bypass,
proxy setting change, or security-setting change was used.

## Integration and findings ledger

Detailed live branch/PR accounting, conflict decisions, repair evidence and
validation receipts will be filled in as the plan executes. Original audit
reports and PoCs remain historical evidence; a green PoC asserting a defect is
not evidence of repair.
