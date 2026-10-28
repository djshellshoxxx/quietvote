# Code audit evidence, 2026-10-28 (in progress)

Scope: `djshellshoxxx/quietvote` at `424110d90e23dc443aa4498a4340973d3c8cb8b6`, the head of
`claude/quietvote-ui-locale-a11y-sltfb3` after PR #19. This is an AI-assisted review, not an
independent audit. QuietVote remains unaudited and is not for real elections.

## Status

| Report | Scope | State |
|---|---|---|
| [B2](B2-quietvote-server-board.md) | Server, bulletin board, trustee tooling, CLI | Complete: 17 new findings (1 High, 8 Medium, 8 Low) and known items whose fixes are on unmerged PRs |
| [B1](B1-quietvote-crypto-protocol.md) | Cryptography, protocol, verifiers, test vectors | Complete: 14 new findings (5 Medium, 6 Low, 3 Info), all confirmed. The TS crypto core matched QV-16; findings concern TS/Python verifier divergence, spoil handling and verifier caveats |
| [B3](B3-quietvote-web.md) | Web client | Complete: 33 findings (2 High, 12 Medium, 13 Low, 6 Info). No XSS, eval/Function, storage or request-privacy finding |

None of these findings has been through the second pass yet. Still to come:
- independent verification of every finding (own reproduction plus a refutation attempt; a
  three-way vote for Medium and above);
- coverage-gap rounds;
- a consolidated report.

## Proof-of-concept tests

The PoC tests are under `poc/B2/<original path>.txt`. The `.txt` suffix keeps the package test
globs and the TypeScript build from picking them up. To run one, copy it back to its original
path without the suffix at the SHA above and run that package's tests.

Each PoC set asserts the current defect: it passes now and fails once the defect is fixed.

| PoC | Location | How to run |
|---|---|---|
| B2 | `poc/B2/<original path>.txt` | Copy back without `.txt`, then run that package's tests |
| B3 | `poc/B3/packages/web/audit-b3/*.ts.txt` | Copy back to `packages/web/audit-b3/` without `.txt`; the report (Appendix B) gives each command |
| B1 | `poc/B1/audit-b1-poc/` | Restore `.txt` code files to the same layout under the repository root, then run `node --test audit-b1-poc/b1-poc.test.ts` and `python3 audit-b1-poc/test_b1_py_poc.py`; `out/` holds the generated synthetic bundles, `mutation/` the mutation sweep |

Paths in the report such as `/home/user/audit/quietvote-b2/...` refer to the repository root.
