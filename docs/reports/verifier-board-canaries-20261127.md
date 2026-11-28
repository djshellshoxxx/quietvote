# Verifier board canary acceptance — 2026-11-27

## Accepted scope and source baseline

This increment completes task 1 in the [board/verifier inventory](inventory-20261111/board-verifiers.tasks.md): include a dropped
ballot entry, a reordered pair and a forked checkpoint in the distributed Node verifier self-test. It starts at PR79 commit
`f7e055d839a369f27a1be2c7a2653340a74a4862`. [QV-34](../34-test-vectors-conformance.md) REQ-007/009 and sections 9.3–9.4 require
explicit negative expectations and a full-election canary corpus; REQ-011 preserves old vector trees.

Before this change, all 29 corpus canaries lacked a board export, and `canary.ts` excluded every `chk.board.*` failure when comparing
named checks. Existing unit and integration tests already detected several board mutations. The missing acceptance was in the
shipped self-test, rather than an observed failure of those rejection mechanisms.

## Implementation and distinguishing evidence

[The generator helper](../../packages/verifier/scripts/board-canaries.ts) reads the frozen `log-layer-4v` bundle, board and signed
fork vector. The original export lists no witness keys because its protocol-layer runner obtains them from the manifest. The helper
fills only the export witness policy with that same signed manifest's keys and positive quorum. Every signed record, entry body,
header and original checkpoint stays unchanged. A positive-control test checks the full composed verifier: PASS, board VERIFIED,
V4 pass, no findings, and every named check passed except the absent receipt sample, which remains not_run.

The existing tiny-election positive control and all 29 legacy canaries remain unchanged. Three derived bundles are appended to the
same corpus format. Expected outcomes are fixed in source; the generator never runs the verifier to invent its own oracle.

| Added case | Mutation | Exact failing named checks | Required finding codes |
|---|---|---|---|
| `board-ballot-entry-dropped` | Remove ballot entry 17 from the export; keep the root, checkpoints and protocol view | `chk.board.append_only`, `chk.board.witness`, `chk.time.window` | `E_LOG_BINDING`, `E_LOG_FORK` |
| `board-ballot-entries-reordered` | Exchange entries 17 and 18; keep their signed bytes, root, checkpoints and protocol view | `chk.board.append_only`, `chk.board.witness`, `chk.time.window` | `E_LOG_ORDER`, `E_LOG_FORK` |
| `board-checkpoint-fork` | Append the frozen vector's validly log-signed conflicting head for an existing size | `chk.board.append_only`, `chk.board.witness` | `E_LOG_FORK`, `QV_BOARD_FORK` |

All three verdicts are FAIL. Witness/time failures reflect the existing composed evidence gates; no new interpretation is assigned
to them. Tests independently verify the fork's log signature, same origin/size and different root, and assert that unrelated content
checks still pass. A healthy board disguised as a canary, an omitted expected board failure, a wrong check, a wrong code and a wrong
verdict each make self-test fail.

[The self-test](../../packages/verifier/src/canary.ts) preserves the content-only cases' existing scope. For a case containing a board
member, the exact check comparison includes its named board failures. The rejection rule remains "verdict not PASS or a named
check fails"; L-class/alarm cases retain their existing outcomes. No protocol, verification verdict, witness threshold, freshness,
receipt or finality rule changes.

## Packaging and budget scope

The corpus now contains 32 stored canaries; the unchanged 12 synthetic cases produce 44 rejected cases in a complete self-test.
It grows from 749,086 to 927,442 bytes. The deterministic drift test also enforces a decimal 1 MB bound. No extra copy of the positive board fixture is stored in the corpus.
No frozen vector, package manifest, dependency, browser entry or build configuration changes.

The Node verifier package already distributes `src` and `canary`; its JSON corpus grows to include the three bundles. The browser
standalone page imports the protocol API through `packages/web/src/verifier/page.ts`, and app verification uses the web flow; neither
imports this Node self-test or corpus. Root performs the composed production build. This increment does not independently requalify
the existing 409,600-byte standalone or 204,800-byte aggregate JavaScript-gzip budgets, and does not change those limits.

## Inventory task 2 disposition

The six classes in the historical inventory are not six entirely missing rejection mechanisms. Source inspected at PR79:

| Class | Existing coverage | Remaining acceptance distinction |
|---|---|---|
| Trustee/joint-key replacement | `manifest-rules.test.ts` rejects duplicate/small-order trustee keys; `verify.ts` detects a claimed joint key differing from recomputed DKG output | A correctly signed altered `dkg-final` full-election test remains a separate slice; retain L-class `E_DKG_FINAL` semantics |
| Entry drop | Protocol `loglayer.test.ts` and verifier `logcheck.test.ts` detect a hidden entry against the board | Shipped board canary added here |
| Reordering | Protocol `loglayer.test.ts` reorders both views while retaining honest heads and detects `E_LOG_FORK` | Shipped board canary added here |
| Equivocation | Protocol/verifier tests and frozen `equivocation-two-roots-same-size` vector detect signed conflicting heads | Shipped board canary added here |
| Bidi label | `manifest-rules.test.ts` and generated manifest `bidi-label` vector reject it | Full-election canary coverage remains separate |
| Supplied anchor mismatch | `verifier.test.ts` and `b1-anchor.test.ts` exercise the caller's independent pin | Already covered; an in-bundle mutation is not a substitute for that caller-input test |

## Validation and limits

The new presence test first failed on PR79 because the three canary IDs were absent. The focused acceptance file then passed all
8 tests on Node 24.22.3 in 8.849 seconds. Strict verifier typechecking passed at a 384 MiB Node heap limit.

The complete verifier suite passed 46/46 tests, with zero failures, cancellations or skips, in 82.121 seconds, through
`npm test --workspace @quietvote/verifier -- --test-concurrency=1`. Corpus regeneration/drift, vendor integrity (two pinned packages,
132 verbatim files), documentation links, claims lint and `git diff --check` passed. A comparison against PR79 confirms the original
control and every legacy case remain equal, and `git diff` reports no changes anywhere under `test-vectors/`.

Separate fresh-process self-test observations were 5.975 seconds before (41 rejected cases) and 7.345 seconds after (44 rejected
cases), with the positive control accepted in both. These are individual local observations, not a statistical performance
qualification. The failing-first, focused/full test, typecheck, compatibility and timing receipts are retained with the frozen
source handoff. Node 22/native-platform execution and the composed browser build remain outside this scoped local validation.

This work extends deterministic regression/self-test coverage. It does not establish independent protocol conformance, a signed
release corpus, complete coverage of every mutation class, fresh evidence, final certification, or a security audit.
