# Code audit evidence, 2026-10-28 (in progress)

Scope: `djshellshoxxx/quietvote` at `424110d90e23dc443aa4498a4340973d3c8cb8b6`, the head of
`claude/quietvote-ui-locale-a11y-sltfb3` after PR #19. This is an AI-assisted review, not an
independent audit. QuietVote remains unaudited and is not for real elections.

## Status

| Report | Scope | State |
|---|---|---|
| [B2](B2-quietvote-server-board.md) | Server, bulletin board, trustee tooling, CLI | Complete: 17 new findings (1 High, 8 Medium, 8 Low) and known items whose fixes are on unmerged PRs |
| B1 | Cryptography, protocol, verifiers, test vectors | In progress |
| B3 | Web client | In progress |

None of these findings has been through the second pass yet. Still to come:
- independent verification of every finding (own reproduction plus a refutation attempt; a
  three-way vote for Medium and above);
- coverage-gap rounds;
- a consolidated report.

## Proof-of-concept tests

The PoC tests are under `poc/B2/<original path>.txt`. The `.txt` suffix keeps the package test
globs and the TypeScript build from picking them up. To run one, copy it back to its original
path without the suffix at the SHA above and run that package's tests.

The B2 tests assert the current defect: they pass now and fail once it is fixed.

Paths in the report such as `/home/user/audit/quietvote-b2/...` refer to the repository root.
