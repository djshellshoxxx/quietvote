# Published-input source composition receipt

**Reproduction succeeded.** Starting from published #57 and replaying #60–66 in order produced the exact source tree of root's tested final composition.

| Binding | Value |
|---|---|
| Fresh detached worktree | `session-evidence/quietvote-public-composition` |
| Starting published #57 head | `fd23cb3a481328a2b6315ae34cc2ee589b31aead` |
| Replayed local final head | `1733e8bf3aaf1860b0c9f2680300310a70e3e2fd` |
| Final tree | `316c490b46a2062556360c3c0201f1a1c6ae105c` |
| Root's tested head | `cf53e694483ccb45466b19f27cf8c642800b6c85` |
| Tree read directly from tested commit | `316c490b46a2062556360c3c0201f1a1c6ae105c` |
| Result | **Exact tree identity; clean detached worktree; zero conflicts** |

Recorded **2026-11-18 09:04:27 UTC–09:06:08 UTC**. All eight inputs matched current remote branch heads through `git ls-remote`. Five missing commit objects were fetched by exact SHA using `--no-write-fetch-head --no-tags --no-recurse-submodules`.

## Applied sequence

| Published PR | Exact input commit | Applied local commit |
|---|---|---|
| #60 | `754c586aa65735d50514b543a62a5e3c96a4d138` | `02fb467f52ad8ee69f4cc21a55a6f24d1036ac31` |
| #61 | `04171611e8c8d836ede49c30f0c6f0acc9d0da05` | `c3bc1637b0cead1da99affe8f4d2d4819933caa6` |
| #62 | `6875cd36c65427dbc0b877b356727a396b7f9581` | `879baa87f62720479220ab3bf8ac473cf38f45d0` |
| #63 | `0042967a76ef871d01f3726d1ff9331293e9a255` | `607d81f8b412a176fb86d41b9178c417ba305be6` |
| #64 | `4b88209afb5a6c8fba1df06e0af8d1c1ac21d15f` | `8ea026ddd3a60b410e55fd317596642da53fefca` |
| #65 | `0653163a3cee2b230398a572723a028c0dda6d7d` | `b3bea9a4a43c6f363186ac0ae7a586c29394dba2` |
| #66 | `ae17bd0c2a33427a77b2d71673ed55787c463c6c` | `1733e8bf3aaf1860b0c9f2680300310a70e3e2fd` |

All seven cherry-picks exited 0 and contain the Codex DCO signoff. Git performed automatic merges in the protocol/errata documentation and Python verifier; there were **no conflicts, manual resolutions or manual product edits**.

The worktree remains detached. Per-command identity configuration was used; no global/shared Git configuration or remote refs were changed.

## Evidence boundary

This is a **source reproducibility receipt**. No tests were run. Root's separately executed final typecheck, i18n and 338-pass web suite remain bound to `cf53e694483ccb45466b19f27cf8c642800b6c85`; its tree was inspected directly and equals the replayed tree.

Local replay commit IDs differ because commit composition/metadata differ. The exact tree match binds the tracked files and modes. Every input is published, so reconstructing this source state does not depend on the detached tested/replayed commit being pushed.

Full input refs, intermediate trees, DCO checks and conflict accounting: `public-composition-receipt.json`. Command outputs: `public-composition-work-log.json`.


## Publication note

The complete structured source-replay receipt is embedded under `public_composition` in the [validation receipt](consolidation-current-validation-20261117.json). Local execution identifiers above are not repository download links. All input commits are public Git objects on the listed PR branches, and this source-only replay creates no second remote integration branch.
