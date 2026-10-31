# QuietVote consolidation — 2026-10-30

Status: **consolidation checkpoint complete; review milestone BLOCKED**. This is an unaudited prototype, not for real elections.

## Scope and execution plan

The owner requested one tested integration branch from refreshed
`claude/sharp-archimedes-tu76rh` (`2a02bd3249f3c988ef5afd8e9559fa13a959bdef`).
The new branch is `integration/quietvote-consolidated-20261030`. The checkout
was newly cloned at `/workspace/quietvote`; no local edits needed preservation.
Main and all existing source branches remain unchanged.

- [x] Refresh all branch and PR head refs and all open/closed PR metadata.
- [x] Account for ancestry, unique commits, patch equivalence and omissions.
- [x] Integrate shared crypto/protocol fixes before server, board/CLI and trustee
  consumers; validate each coherent package slice.
- [x] Integrate dependency/CI gates and useful newer ordinary checkpoint work.
- [x] Reproduce surviving audit defects, add correct-behavior regressions and
  repair semantics that are clear. Preserve owner decisions as explicit blockers.
- [x] Exercise real server/client contracts, supported cross-verifier cases and
  production browser/CSP journeys; add missing CI coverage.
- [x] Reconcile documentation/status last, record all validation and remaining
  gates, scan outgoing source versions, publish only this branch and a draft PR.
- [x] Create `docs/handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md`, link the restart entry,
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

Source inventory was computed against the immutable starting integration
`2a02bd3249f3c988ef5afd8e9559fa13a959bdef` and main snapshot
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` after the coordinator refreshed all
origin branches, PR head refs and PR metadata. This section records source
provenance and integration; final validation and repair evidence are recorded
separately. Original audit reports and PoCs remain historical evidence. A green
PoC that asserts a defect is not evidence of repair.

### Completed source imports

All imports used `--no-ff` and preserve their source histories.

| Order | Integration merge | Source tip | Content |
|---:|---|---|---|
| 1 | `7812118` | #10 `55aff9a` | Crypto/protocol audit fixes, CP-05 and post-open roll-commit replay regression. |
| 2 | `1425480` | #14 `fe8b75e` | #9 server fixes, earlier crypto waves and trustee-mode spoil-share endpoint/storage/tally wiring. |
| 3 | `d32d2a1` | #16 `709729a` | #11 board/CLI audit fixes and offline CLI spoil collector. |
| 4 | `da8db99` | #17 `f042330` | #8 trustee fixes and release lock/change/fork checks. |
| 5 | `916cbe3` | #15 `57ba6cd` | Lockfile/audit CI gates and CLI verifier dependency declaration. |
| 6 | `25ac8be` | checkpoint `653bb03` | Current ordinary UI/i18n work, responsive QA, typed catalog decision, demo attribution, main and latest #3/#6 changes. |

The only merge conflict was append-only `packages/cli/NOTES.md`: retain both
audit/spoil-collector notes and dependency-gate notes. #14 contains older
crypto work but lacks `6e05596`/`55aff9a`; importing current #10 first preserves
those newer fixes. #16 subsumes #11, #17 subsumes #8 and #14 subsumes #9.
Checkpoint `653bb03` also contains the live #3 test-timeout fix `e56403b`,
latest #6 handoff `563eec8`, and the sole initially main-only commit `019f4e7`.
The starting integration already contains #1, #4, #5, #7, #12, #13, #18, #19
and the earlier work in #3/#6.

Against import merge `25ac8be`, every live source tip below is an ancestor
except the deliberately reconciled docs-only tips #2 `29313c3` and #21
`e671fd1`. The union of source history absent from the imports consists
exactly of those two documentation commits. There is no omitted source code.
This is an ancestry statement, not a test result.

### Every live origin branch

Full live SHAs are the fetched snapshot, not PR merge refs. `MB main` and
`MB start` are merge bases against the fixed snapshots above. `Unique` counts
commits absent from START, including merges. `+ / −` counts non-merge patches
from `git cherry -v START HEAD`; `git log --cherry START...HEAD` was also
inspected. No absent commit had an equivalent patch on START. Merge commits
can carry resolutions outside those patch checks, particularly `eb56c90`
which ports BC fixes onto the merged board/CLI implementation. Full merges
preserved those resolutions. `origin/HEAD` aliases `origin/main` and is not
an independent source. Affected areas use historical PR scope for already
contained heads and changes since MB start for newer heads.

| Live origin branch | Full live SHA | PR | MB main / start | Unique; + / − | Affected areas | Disposition |
|---|---|---|---|---|---|---|
| `checkpoint/quietvote-ordinary-ux-20261024` | `653bb039d8fb7774889a03194589ee6a13056c40` | — | `019f4e7 / 424110d` | 39; 36 / 0 | docs, docs/audit, docs/handoffs, docs/index + decisions, docs/plan, docs/specs, packages/web, project docs/policy | imported |
| `claude/dazzling-cerf-n8ha3g` | `d75d4a20c6b92c35ddfcbcdaeb4a1dbf1b7fba1d` | #1 | `69c03fb / d75d4a2` | 0; 0 / 0 | CI + repo policy, docs, docs/index + decisions, docs/plan, docs/research, docs/specs, packages/board, packages/cli, packages/crypto, packages/protocol, packages/server, packages/trustee, packages/verifier, packages/web, project docs/policy, test-vectors, wiki, workspace/build | already in START |
| `claude/docs-screenshots` | `e671fd1d9d19127ded0e0ea85e16d97d9d1bff2d` | #21 | `019f4e7 / 69c03fb` | 2; 2 / 0 | docs, docs/index + decisions, project docs/policy | selective docs reconciliation |
| `claude/quietvote-audit-board-cli-1` | `8770aae07e5bb3897e2e64c2bbe14bf01ecc200c` | #11 | `69c03fb / 7b4826a` | 4; 1 / 0 | docs/audit, packages/board, packages/cli | imported via #16 |
| `claude/quietvote-audit-crypto-protocol-1` | `55aff9ad1efab30c00eb145a46de3c2daabd6c26` | #10 | `69c03fb / 7b4826a` | 7; 4 / 0 | docs/audit, packages/crypto, packages/protocol, test-vectors | imported |
| `claude/quietvote-audit-qa-1` | `563eec8659184e32771244088d59acc5035fa798` | #6 | `69c03fb / 7b4826a` | 1; 1 / 0 | docs/audit | imported via checkpoint |
| `claude/quietvote-audit-server-1` | `6b3208551acdfa45313d85b67a9f4adf3e3f25a8` | #9 | `69c03fb / 7b4826a` | 7; 2 / 0 | docs/audit, packages/crypto, packages/protocol, packages/server | imported via #14 |
| `claude/quietvote-audit-trustee-1` | `f0973a12b7bcdb81918679079bc3726c66b14c4c` | #8 | `69c03fb / 7b4826a` | 6; 3 / 0 | docs/audit, packages/trustee | imported via #17 |
| `claude/quietvote-audit-web-verifier-1` | `e1421698626a4defd744a50ed2f9337066793d6e` | #7 | `69c03fb / e142169` | 0; 0 / 0 | docs/audit, packages/verifier, packages/web | already in START |
| `claude/quietvote-board-cli-1` | `c69473f242c9848847c3e899016c562e51a325e4` | #4 | `69c03fb / c69473f` | 0; 0 / 0 | docs/claims, docs/index + decisions, docs/plan, docs/research, docs/specs, packages/board, packages/cli, packages/trustee, project docs/policy, wiki, workspace/build | already in START |
| `claude/quietvote-ci-gates-1` | `57ba6cd779e7621603cd36179887379e942b5e63` | #15 | `69c03fb / 7b4826a` | 1; 1 / 0 | CI + repo policy, docs/audit, packages/cli, scripts, workspace/build | imported |
| `claude/quietvote-cli-spoil-collect-1` | `709729a5763c99940d075c3bc8e53b40b2fd95fb` | #16 | `69c03fb / 7b4826a` | 5; 2 / 0 | docs/audit, packages/board, packages/cli | imported |
| `claude/quietvote-complete-1` | `fdc552aa0fb769116b25223e7d6e75dd70adc913` | #12 | `69c03fb / fdc552a` | 0; 0 / 0 | docs/plan, packages/server, packages/verifier, project docs/policy, verifier-py | already in START |
| `claude/quietvote-docs-1` | `5341f6f66d237e0bba6a6d68efcc11ace5c8ac6c` | #5 | `69c03fb / 5341f6f` | 0; 0 / 0 | docs/errata, docs/index + decisions, docs/plan, docs/research, docs/specs, packages/trustee, project docs/policy, wiki | already in START |
| `claude/quietvote-finish-1` | `e56403b6b30f5d438b2f5f04e7fd5b76e8626c6b` | #3 | `69c03fb / 324020a` | 1; 1 / 0 | packages/server | imported via checkpoint |
| `claude/quietvote-spoil-wiring-1` | `fe8b75e8cf4c3fbdef92500bc80130074c980da2` | #14 | `69c03fb / 7b4826a` | 15; 4 / 0 | docs/audit, packages/crypto, packages/protocol, packages/server, test-vectors | imported |
| `claude/quietvote-trustee-hardening-1` | `f0423305cb4571b584a7b9454ed774d006663613` | #17 | `69c03fb / 7b4826a` | 7; 4 / 0 | docs/audit, packages/trustee | imported |
| `claude/quietvote-ui-locale-a11y-sltfb3` | `424110d90e23dc443aa4498a4340973d3c8cb8b6` | #18 | `69c03fb / 424110d` | 0; 0 / 0 | docs/handoffs, packages/web | already in START |
| `claude/quietvote-web-triage-1` | `e9d4cd3416371c2c825ee855c5f84f39c4a53b2d` | #13 | `69c03fb / e9d4cd3` | 0; 0 / 0 | docs/audit, packages/web | already in START |
| `claude/quirky-curie-n5pxf5` | `019f4e789be2ff38a5fb2d348c3b225cc87cf296` | — | `019f4e7 / 69c03fb` | 1; 1 / 0 | docs | same as imported main |
| `claude/sharp-archimedes-tu76rh` | `2a02bd3249f3c988ef5afd8e9559fa13a959bdef` | #19, #20 | `69c03fb / 2a02bd3` | 0; 0 / 0 | docs/audit, docs/handoffs, packages/web | already in START |
| `docs/readme-and-wiki` | `29313c369aeda4f1ab2503ca3437c5bd22025a09` | #2 | `69c03fb / 69c03fb` | 1; 1 / 0 | docs/wiki, project docs/policy | selective docs reconciliation |
| `main` | `019f4e789be2ff38a5fb2d348c3b225cc87cf296` | — | `019f4e7 / 69c03fb` | 1; 1 / 0 | docs | imported via checkpoint; reconcile docs |

### Every PR, including closed PRs

PR head means the fetched historical PR snapshot. The API-recorded base SHA
is retained because its branch can have advanced. `Base @ recorded → live`
shows both snapshots. Merge bases and unique/patch counts use the historical
PR head. All short SHAs below are unambiguous within this inventory; full
live branch SHAs are above. PR #19 historically ended at
`31f2a085348b37357f54b70d6de07d2466ed17ac`, while its reused live source
branch now ends at `2a02bd3249f3c988ef5afd8e9559fa13a959bdef` for PR #20.
PR #18 snapshot is `424110d`; do not infer a historical PR head from the
newer checkpoint base. No existing PR was closed or retargeted in this work.

| PR | State | PR head / live branch | Base @ recorded → live | MB main / start | Unique; + / − | Affected areas | Disposition |
|---|---|---|---|---|---|---|---|
| [#1](https://github.com/djshellshoxxx/quietvote/pull/1) | open draft | `d75d4a2 / d75d4a2` | `main` @ `69c03fb` → `019f4e7` | `69c03fb / d75d4a2` | 0; 0 / 0 | CI + repo policy, docs, docs/index + decisions, docs/plan, docs/research, docs/specs, packages/board, packages/cli, packages/crypto, packages/protocol, packages/server, packages/trustee, packages/verifier, packages/web, project docs/policy, test-vectors, wiki, workspace/build | already in START |
| [#2](https://github.com/djshellshoxxx/quietvote/pull/2) | open draft | `29313c3 / 29313c3` | `main` @ `69c03fb` → `019f4e7` | `69c03fb / 69c03fb` | 1; 1 / 0 | docs/wiki, project docs/policy | selective docs reconciliation |
| [#3](https://github.com/djshellshoxxx/quietvote/pull/3) | open draft | `e56403b / e56403b` | `claude/dazzling-cerf-n8ha3g` @ `d75d4a2` → `d75d4a2` | `69c03fb / 324020a` | 1; 1 / 0 | CI + repo policy, docs/claims, docs/errata, docs/index + decisions, docs/plan, docs/reports, docs/research, docs/specs, packages/board, packages/cli, packages/protocol, packages/server, packages/trustee, packages/verifier, packages/web, project docs/policy, scripts, test-vectors, verifier-py, wiki, workspace/build | imported via checkpoint |
| [#4](https://github.com/djshellshoxxx/quietvote/pull/4) | closed draft | `c69473f / c69473f` | `claude/quietvote-finish-1` @ `a5573a4` → `e56403b` | `69c03fb / c69473f` | 0; 0 / 0 | docs/claims, docs/index + decisions, docs/plan, docs/research, docs/specs, packages/board, packages/cli, packages/trustee, project docs/policy, wiki, workspace/build | already in START |
| [#5](https://github.com/djshellshoxxx/quietvote/pull/5) | closed draft | `5341f6f / 5341f6f` | `claude/quietvote-finish-1` @ `cc73db4` → `e56403b` | `69c03fb / 5341f6f` | 0; 0 / 0 | docs/errata, docs/index + decisions, docs/plan, docs/research, docs/specs, packages/trustee, project docs/policy, wiki | already in START |
| [#6](https://github.com/djshellshoxxx/quietvote/pull/6) | open draft | `563eec8 / 563eec8` | `claude/quietvote-board-cli-1` @ `c69473f` → `c69473f` | `69c03fb / 7b4826a` | 1; 1 / 0 | docs/audit, docs/plan, packages/cli, packages/protocol, packages/server, packages/trustee, packages/verifier, project docs/policy, test-vectors, verifier-py | imported via checkpoint |
| [#7](https://github.com/djshellshoxxx/quietvote/pull/7) | open draft | `e142169 / e142169` | `claude/quietvote-audit-qa-1` @ `7b4826a` → `563eec8` | `69c03fb / e142169` | 0; 0 / 0 | docs/audit, packages/verifier, packages/web | already in START |
| [#8](https://github.com/djshellshoxxx/quietvote/pull/8) | open draft | `f0973a1 / f0973a1` | `claude/quietvote-audit-qa-1` @ `7b4826a` → `563eec8` | `69c03fb / 7b4826a` | 6; 3 / 0 | docs/audit, packages/trustee | imported via #17 |
| [#9](https://github.com/djshellshoxxx/quietvote/pull/9) | open draft | `6b32085 / 6b32085` | `claude/quietvote-audit-qa-1` @ `7b4826a` → `563eec8` | `69c03fb / 7b4826a` | 7; 2 / 0 | docs/audit, packages/crypto, packages/protocol, packages/server | imported via #14 |
| [#10](https://github.com/djshellshoxxx/quietvote/pull/10) | open draft | `55aff9a / 55aff9a` | `claude/quietvote-audit-qa-1` @ `7b4826a` → `563eec8` | `69c03fb / 7b4826a` | 7; 4 / 0 | docs/audit, packages/crypto, packages/protocol, test-vectors | imported |
| [#11](https://github.com/djshellshoxxx/quietvote/pull/11) | open draft | `8770aae / 8770aae` | `claude/quietvote-audit-qa-1` @ `7b4826a` → `563eec8` | `69c03fb / 7b4826a` | 4; 1 / 0 | docs/audit, packages/board, packages/cli | imported via #16 |
| [#12](https://github.com/djshellshoxxx/quietvote/pull/12) | open draft | `fdc552a / fdc552a` | `claude/quietvote-board-cli-1` @ `c69473f` → `c69473f` | `69c03fb / fdc552a` | 0; 0 / 0 | docs/plan, packages/server, packages/verifier, project docs/policy, verifier-py | already in START |
| [#13](https://github.com/djshellshoxxx/quietvote/pull/13) | open draft | `e9d4cd3 / e9d4cd3` | `claude/quietvote-audit-web-verifier-1` @ `e142169` → `e142169` | `69c03fb / e9d4cd3` | 0; 0 / 0 | docs/audit, packages/web | already in START |
| [#14](https://github.com/djshellshoxxx/quietvote/pull/14) | open draft | `fe8b75e / fe8b75e` | `claude/quietvote-audit-server-1` @ `6b32085` → `6b32085` | `69c03fb / 7b4826a` | 15; 4 / 0 | docs/audit, packages/crypto, packages/protocol, packages/server, test-vectors | imported |
| [#15](https://github.com/djshellshoxxx/quietvote/pull/15) | open draft | `57ba6cd / 57ba6cd` | `claude/quietvote-audit-qa-1` @ `7b4826a` → `563eec8` | `69c03fb / 7b4826a` | 1; 1 / 0 | CI + repo policy, docs/audit, packages/cli, scripts, workspace/build | imported |
| [#16](https://github.com/djshellshoxxx/quietvote/pull/16) | open draft | `709729a / 709729a` | `claude/quietvote-audit-board-cli-1` @ `8770aae` → `8770aae` | `69c03fb / 7b4826a` | 5; 2 / 0 | packages/cli | imported |
| [#17](https://github.com/djshellshoxxx/quietvote/pull/17) | open draft | `f042330 / f042330` | `claude/quietvote-audit-trustee-1` @ `f0973a1` → `f0973a1` | `69c03fb / 7b4826a` | 7; 4 / 0 | docs/audit, packages/trustee | imported |
| [#18](https://github.com/djshellshoxxx/quietvote/pull/18) | closed draft | `424110d / 424110d` | `checkpoint/quietvote-ordinary-ux-20261024` @ `884f599` → `653bb03` | `69c03fb / 424110d` | 0; 0 / 0 | docs/handoffs, packages/web | already in START |
| [#19](https://github.com/djshellshoxxx/quietvote/pull/19) | closed | `31f2a08 / 2a02bd3` **moved** | `claude/quietvote-ui-locale-a11y-sltfb3` @ `3b73800` → `424110d` | `69c03fb / 31f2a08` | 0; 0 / 0 | docs/handoffs, packages/web | already in START |
| [#20](https://github.com/djshellshoxxx/quietvote/pull/20) | open draft | `2a02bd3 / 2a02bd3` | `claude/quietvote-ui-locale-a11y-sltfb3` @ `424110d` → `424110d` | `69c03fb / 2a02bd3` | 0; 0 / 0 | docs/audit | requested START |
| [#21](https://github.com/djshellshoxxx/quietvote/pull/21) | open draft | `e671fd1 / e671fd1` | `main` @ `019f4e7` → `019f4e7` | `019f4e7 / 69c03fb` | 2; 2 / 0 | docs/index + decisions, project docs/policy | selective docs reconciliation |

### Closed PR merge provenance

Closed #4/#5/#18/#19 were merged into non-main branches. Their recorded merge
commits are already ancestors of START and absent from main. GitHub records
the same `424110d` merge for #18 and #19; each historical head is accounted
for independently above.

| PR | Historical head | Recorded merge commit | Actual base | In START / main |
|---|---|---|---|---|
| #4 | `c69473f242c9848847c3e899016c562e51a325e4` | `1cbb224c0e333d08110aac9506085b964c212954` | `claude/quietvote-finish-1` | yes / no |
| #5 | `5341f6f66d237e0bba6a6d68efcc11ace5c8ac6c` | `89a033282432dc4a2a5c270efd794543046cb547` | `claude/quietvote-finish-1` | yes / no |
| #18 | `424110d90e23dc443aa4498a4340973d3c8cb8b6` | `424110d90e23dc443aa4498a4340973d3c8cb8b6` | `checkpoint/quietvote-ordinary-ux-20261024` | yes / no |
| #19 | `31f2a085348b37357f54b70d6de07d2466ed17ac` | `424110d90e23dc443aa4498a4340973d3c8cb8b6` | `claude/quietvote-ui-locale-a11y-sltfb3` | yes / no |

### Explicit omissions and documentation reconciliation

- **Already contained sources:** #1, #4, #5, #7, #12, #13, #18 and historical #19 require no replay; source histories remain intact. The start of #20 is the requested integration baseline. #3/#6 only lacked their latest single commit, both imported through checkpoint. #8/#9/#11 are imported through their later stacked tips #17/#14/#16. `claude/quirky-curie-n5pxf5` equals main and has no independent change.
- **PR #21 / `e671fd1`: deliberately omit the wholesale patch.** Its “spec-only/no runnable UI” claims and assertion that no `16-*` exists are false on integration. Preserve useful status-note caveats and valid navigation in current prose. Current CONTRIBUTING already provides the corrected link with DCO detail. Any screenshot statement must use actual captured UI evidence. This source is selectively reconciled/superseded, not merged by ancestry or patch equivalence.
- **PR #2 / `29313c3`: deliberately omit the wholesale patch.** Its five `docs/wiki` pages duplicate current canonical `wiki/`, claim no application code and use obsolete 15/17/18/19 numbering/licence status. Reconcile its useful wiki-navigation intent against canonical `wiki/` rather than creating a stale parallel status surface. This source is selectively reconciled/superseded, not merged by ancestry or patch equivalence.
- **Initial main-only work:** `019f4e7` adds extensionless `docs/HANDOFF` and is now imported through checkpoint. It duplicates `563eec8:docs/audit/HANDOFF.md` except for a missing title and accidental literal `EOF` plus shell transcript at its tail. Reconcile that path to a historical pointer to the titled audit handoff and current status; Git preserves the original record. The transcript is source text and must not be executed.
- **Specification authority:** preserve current `docs/SPEC-INDEX.md`: QV-16 is `16-crypto-protocol.md`; reconciliation ADR-014–024 and QV-18 log mechanics have the stated authority. Old pre-renumbering files remain non-authoritative source material tracked by N-19. Draft specification status is independent of code existence; do not overwrite implemented-package status with default-branch/spec-only wording or promote specs to Approved.
- **Historical evidence:** retain checkpoint receipts, original audit reports/PoCs, published test totals and dated completion/handoff records as history. Add current integration evidence with a concrete SHA. Recompute current tests and finding status; stale counts or earlier local integration results do not certify this branch. All code remains unaudited and not for real elections.
- **Contribution contract:** CONTRIBUTING calls for sign-off on new commits, Conventional Commit subjects, requirement references where relevant and honest verification claims; engineering standards require behavior notes. Existing imported commit history is preserved rather than rewritten. This inventory does not attest to historical authors' DCO sign-offs or independent review.

### Unique commits relative to START

Each list includes merges and therefore retains exact source provenance.
Lists overlap because stacked sources share commits. Full source tips are
above; these commit subjects are historical labels, not present-tense findings.

#### `checkpoint/quietvote-ordinary-ux-20261024`

- `e56403b` test(server): raise keep-alive timeout in the test world
- `563eec8` docs(audit): extensive handoff (status, landing order, remaining work and how, caveats)
- `019f4e7` Add extensive handoff documentation for audit process
- `78d3ecd` fix(web): remove duplicate global help link
- `04d4daa` docs: record Help navigation checkpoint and gates
- `c35ae44` docs: add verified Help checkpoint receipt
- `ed505f5` feat(web): resolve remaining dynamic i18n references
- `5fb97cb` docs: record current QuietVote restart status
- `ca5621b` fix(web): keep i18n reference resolution conservative
- `18d5753` fix(web): close second-review gaps in i18n reference resolution
- `0e14fda` fix(web): require primitive types and scanned callees for forwarders
- `d6e6a44` fix(web): accept translator hand-offs only to scanned implementations
- `b436012` fix(web): keep handed-on translator objects inside the scan
- `3fda6da` docs: record i18n reference resolution and review rounds
- `94ef35f` docs: point review table at rebased commits
- `6cc194d` fix(web): close sixth-review escapes for handed-on translator
- `efe9e4f` docs: record sixth review round
- `0076ca9` docs: record dynamic i18n publication receipt
- `fa00420` Merge main into ordinary checkpoint
- `c84c6ed` Merge claude/quietvote-audit-qa-1 into ordinary checkpoint
- `581c6f8` Merge claude/quietvote-finish-1 into ordinary checkpoint
- `3a7ecaa` docs: record branch merge pass
- `d967508` docs: record current QuietVote continuation status
- `ccea277` docs: record QuietVote checkpoint publication receipt
- `3c27f11` docs: record QuietVote owner merge decision
- `cb624cc` fix(web): space and wrap primary navigation
- `3e69071` docs: record ordinary UI QA and human review prep
- `46f7789` docs: align web notes with ICU precompile work
- `54f90be` test(web): check responsive layout breakpoints
- `1579144` docs: record responsive QA and Pages blockers
- `b5d9f1e` docs: record responsive QA checkpoint receipt
- `3dafe28` docs: record scoped requirements traceability
- `e33f094` docs: record traceability checkpoint receipt
- `7e85d9f` docs: accept typed catalogs and local ICU compiler
- `fe047fd` docs: add catalog decision publication receipt
- `2bb9890` docs: record locale negotiation gap
- `68f04ac` docs: record locale checkpoint receipt
- `aaa0fe4` feat: label demo client and credit CDL
- `653bb03` docs: record demo checkpoint receipt

#### `claude/docs-screenshots`

- `019f4e7` Add extensive handoff documentation for audit process
- `e671fd1` Docs: refresh README status, note no UI, clarify spec index

#### `claude/quietvote-audit-board-cli-1`

- `9eeeb8c` fix(board,cli): audit findings BC-01..10 with regression/fuzz tests; docs/audit reports
- `0f7b27b` merge audit-qa (base finish-1)
- `eb56c90` merge audit-qa (base complete-1); port BC-01/02/04 onto merged board/cli
- `8770aae` merge audit-qa (CI test fix)

#### `claude/quietvote-audit-crypto-protocol-1`

- `592adbb` fix(crypto,protocol): audit CP-01 (re-wrapped spoils), CP-03 (schema hasOwn), CP-04 (torsion-free); docs/audit/crypto-protocol.md
- `b235e54` merge audit-qa (base finish-1)
- `96aa3a5` merge audit-qa (base complete-1)
- `e4513db` fix(crypto,protocol): second-wave triage P2-P4,P6,P7,P9,P11,C1,C4-C8,C10 with regression tests; regenerate vectors
- `ac9ed0d` merge audit-qa (CI test fix)
- `6e05596` fix(protocol): reject conflicting and late roll commitments (CP-05)
- `55aff9a` test(protocol): cover post-open signed roll-commit replay

#### `claude/quietvote-audit-qa-1`

- `563eec8` docs(audit): extensive handoff (status, landing order, remaining work and how, caveats)

#### `claude/quietvote-audit-server-1`

- `0a80064` fix(server): audit findings SRV-001..007 with regression tests; docs/audit/server.md
- `592adbb` fix(crypto,protocol): audit CP-01 (re-wrapped spoils), CP-03 (schema hasOwn), CP-04 (torsion-free); docs/audit/crypto-protocol.md
- `b235e54` merge audit-qa (base finish-1)
- `3ea6afe` merge audit-qa (base finish-1)
- `45ab9ad` merge crypto-protocol audit fixes
- `a719f17` merge audit-qa (base complete-1)
- `6b32085` merge audit-qa (CI test fix)

#### `claude/quietvote-audit-trustee-1`

- `1e3cae4` fix(trustee): spoil relay refuses cast ciphertexts (TR-01), tally release state (TR-02); audit report
- `415b644` merge audit-qa (base finish-1)
- `ad73377` test(trustee): TR-02 test uses the ADR-015 bound election-open (harness openElection)
- `51108a0` merge audit-qa (base complete-1)
- `c53111c` fix(trustee): adapt TR-01/TR-02 tests to merged base (WRONG_STATE gate, CP-01 exclusion); drop dead TR-02 transition
- `f0973a1` merge audit-qa (CI test fix)

#### `claude/quietvote-ci-gates-1`

- `57ba6cd` ci: lockfile lint + npm audit (high) gates (DEP-02); declare cli dep on @quietvote/verifier (DEP-01)

#### `claude/quietvote-cli-spoil-collect-1`

- `9eeeb8c` fix(board,cli): audit findings BC-01..10 with regression/fuzz tests; docs/audit reports
- `0f7b27b` merge audit-qa (base finish-1)
- `eb56c90` merge audit-qa (base complete-1); port BC-01/02/04 onto merged board/cli
- `8770aae` merge audit-qa (CI test fix)
- `709729a` feat(cli): qv election spoil-collect (offline gather/verify/decode trustee spoil shares, POST bodies)

#### `claude/quietvote-finish-1`

- `e56403b` test(server): raise keep-alive timeout in the test world

#### `claude/quietvote-spoil-wiring-1`

- `0a80064` fix(server): audit findings SRV-001..007 with regression tests; docs/audit/server.md
- `592adbb` fix(crypto,protocol): audit CP-01 (re-wrapped spoils), CP-03 (schema hasOwn), CP-04 (torsion-free); docs/audit/crypto-protocol.md
- `3ea6afe` merge audit-qa (base finish-1)
- `b235e54` merge audit-qa (base finish-1)
- `45ab9ad` merge crypto-protocol audit fixes
- `30463af` feat(server): trustees-mode spoil shares endpoint, storage and tally inclusion (QV-ADR-020)
- `96aa3a5` merge audit-qa (base complete-1)
- `a719f17` merge audit-qa (base complete-1)
- `e4513db` fix(crypto,protocol): second-wave triage P2-P4,P6,P7,P9,P11,C1,C4-C8,C10 with regression tests; regenerate vectors
- `a3e5206` merge audit-server (base complete-1)
- `c4bcbdd` merge crypto-protocol second wave
- `6b32085` merge audit-qa (CI test fix)
- `ac9ed0d` merge audit-qa (CI test fix)
- `eca6af4` merge audit-server (CI test fix)
- `fe8b75e` merge crypto-protocol

#### `claude/quietvote-trustee-hardening-1`

- `1e3cae4` fix(trustee): spoil relay refuses cast ciphertexts (TR-01), tally release state (TR-02); audit report
- `415b644` merge audit-qa (base finish-1)
- `ad73377` test(trustee): TR-02 test uses the ADR-015 bound election-open (harness openElection)
- `51108a0` merge audit-qa (base complete-1)
- `c53111c` fix(trustee): adapt TR-01/TR-02 tests to merged base (WRONG_STATE gate, CP-01 exclusion); drop dead TR-02 transition
- `f0973a1` merge audit-qa (CI test fix)
- `f042330` fix(trustee): TR-03 bundle lock + change detection, TR-04 fork refusal at release; mark TR-05 fixed in base

#### `claude/quirky-curie-n5pxf5`

- `019f4e7` Add extensive handoff documentation for audit process

#### `docs/readme-and-wiki`

- `29313c3` Add wiki pages and README wiki section

#### `main`

- `019f4e7` Add extensive handoff documentation for audit process


## Frozen-source validation and milestone assessment

The final frozen validation snapshot is
`247df393ea1ace300fe5ed1f569a12090e1364dc`. Subsequent checkpoints add status,
evidence and publication receipts only. New repair provenance is crypto/protocol
`48a2b73`, server `f2fc966`, CLI `aaf35a7`, trustee `8cf2669`, web `88b376a`,
required CI `963c577`, final web seed/live follow-up `f58533b`, and status `247df39`.
The exact command/cwd/environment/exit-code receipt is
[consolidation-validation-2026-10-30.json](../reports/consolidation-validation-2026-10-30.json).

- `npm run check`: **810 passed, 0 failed/skipped**, including typecheck.
- Python: **50 unit tests passed**; vectors **229 PASS, 0 FAIL, 53 explicitly not
  implemented**. TypeScript vector runner: **412 checks pass**, one unsupported
  DKG vector file explicitly reported (package tests separately exercise DKG).
- Required production browser suites: app **12**, Help/Home **64**, automated
  accessibility **49**, standalone/SPA verifier **16**; all pass without silently
  skipping tools. This is automated evidence, not assistive-technology acceptance.
- Production build, scoped i18n, lockfile, dependency audit (0 vulnerabilities),
  action pins, declared licence snapshot (35 permissive; 0 flagged), and both
  current/repair-range whitespace checks pass.
- **Strict differential remains failed:** all 27 verdicts agree but 12 detailed
  reports disagree. [The exact failed comparison](../reports/consolidation-cross-verifiers-2026-10-30.json)
  preserves each difference. QV-ERR-PY-006/007/015 and other owner semantic gates
  are not resolved by matching corpus verdicts.
- Claims lint exits 1 with **20 findings in 9 files**. Historical/quoted source
  evidence is preserved; the existing non-blocking claims job was not weakened.

[The audit ledger](../audit/consolidation-2026-10-30.md) and companion JSON retain
all 72 extracted findings, 52 complete interim records, 20 historically pending
assessments and 0 original extra-lens results, with supplementary older overlaps.
Every repair or deferral has reproduction, fix provenance, regression and review
requirements. Original reports/PoCs remain intact. No new repair changes candidate
vectors; the imported crypto history includes its documented canary expectation
and manifest-hash corrections and still needs protocol/security review.

**The milestone remains blocked.** The owner explicitly retained B3-01's
conflicting real web/server registration contract pending protocol review.
Import CPU isolation, control freshness, rollback protection, verifier semantics
and capabilities, and the other partial/open findings remain explicit. External
security/protocol review, native translation review and assistive-technology
qualification are not supplied by this consolidation. No main merge, release,
deployment, source-branch deletion, existing PR closure or auto-merge occurs.

The [consolidated restart handoff](../handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md)
contains environment/bootstrap, all validation commands, remaining reproductions,
publication receipt and ordered next actions. A fresh remote-head read before
publication found all 23 source branch refs unchanged from the inventory.


## Publication receipt

Only `integration/quietvote-consolidated-20261030` was created/pushed. Remote
readback returned `1a751ab58aef41a1ae1a7beb433d853938549b3a`; main stayed at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. [Draft PR #22](https://github.com/djshellshoxxx/quietvote/pull/22)
is open, draft and unmerged against main. The preceding code validation snapshot
is unchanged by these documentation-only receipts. This receipt update is
separately secret-scanned and fast-forwarded only on the integration branch;
resolve its final tip from the remote before resuming. All 23 existing source
branches were unchanged at the pre-publication readback.
