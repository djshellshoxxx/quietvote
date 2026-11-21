# Fresh crypto/CLI review — 2026-11-16

Reviewed crypto implementation `2a685f5` from the `793d4f4` inventory handoff,
and CLI implementation `9413026` against base `5566c88`. The CLI lane advanced
to `4ba569f` during review; that follow-up changes tests and README only, so the
reviewed implementation is unchanged. This review's retained test is based on
`4ba569f` in an isolated worktree. No implementation worktree was edited.

## Disposition

No blocking correctness or security defect was identified in this bounded AI
source review. This is not independent external cryptographic approval, a full
workspace qualification, or approval of any held policy decision.

`packages/crypto/src/elgamal.ts:35` composes existing ciphertext addition and
encryption of zero. Canonical nonzero randomness is checked by the existing
encryptor; identity keys and cancelling A components are rejected before
return. The returned ciphertext is separate from the input. Tests cover
plaintext preservation, scalar wraparound, input preservation, malformed
randomness, cancellation, identity keys, the neutral ciphertext and failure of
an old CDS proof after transformation. No production caller or wire format is
changed. Caller randomness quality and matching the supplied key to the
ciphertext remain caller responsibilities.

The CLI uses the shared bounded archive reader and pinned manifest/board
authentication before deriving records (`cmd-lifecycle.ts:31`). It separately
checks inner trustee/coordinator signatures (:38, :47, :56), terminal controls
(:66), ceremony ordering (:74), roll commitments (:83), DKG and distinct timely
key confirmations (:96), and context signatures/open history references
(:112). Output creation is exclusive mode 0600 (:135); the summary explicitly
does not claim freshness, witness quorum, signing or admission (:137).

The first review found that several newly implemented guards lacked dedicated
committed negative fixtures. They passed independent temporary probes and are
now retained in `packages/cli/test/lifecycle-security.test.ts`. The `.test.ts`
extension matches the CLI package's existing test glob; no runner change is
needed. Every hostile fixture first passes `prepareElectionArchive`, proving
that rejection comes from lifecycle validation rather than broken outer archive
authentication. Each refusal also asserts that no output file was created.

## Evidence

Environment: Linux, Node 24.22.1. Only focused suites were rerun.

| Command / scope | Result |
|---|---|
| `node --test --test-concurrency=1 packages/crypto/test/elgamal-rerandomize.test.ts` at `793d4f4` | 4 passed, 0 failed/skipped |
| `node --test --test-concurrency=1 packages/cli/test/lifecycle.test.ts` at `4ba569f` | 3 passed, 0 failed/skipped |
| `node --test --test-concurrency=1 packages/cli/test/lifecycle-security.test.ts` in this isolated review worktree | 15 passed: one parent test and 14 subtests, 0 failed/skipped |
| `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` in this isolated review worktree | exit 0 |
| `git diff --check` before this handoff | exit 0 |

The retained 14 cases are one valid dkg-final proposal and 13 refusals:
forged coordinator signature, forged roll signature, manifest-scoped open
signature, wrong open reference, missing/reversed/duplicate DKG markers,
incorrect final key, repeated confirmation from one trustee failing to satisfy
threshold, and each of abort/cancel/invalidate/audit-close controls.
The earlier lifecycle suite independently covers all nine proposal kinds,
existing output preservation, pin/archive corruption, basic progression,
forged trustee inner signatures and invalid key-confirmation proofs.
The first typecheck of the retained test caught an unannotated `unknown` return
from `bundleToJson`; an explicit fixture JSON shape fixed that test-only typing
issue. No implementation or behavioral assertion changed.

## Remaining boundaries

Keep B3-01/D-99, D-92–D-96 and authority holds explicit. Existing separate
organizer refusal is unchanged. An unpinned roll remains a proposal from the
snapshot, not independently authenticated membership; stale/forked views and
witness quorum require their existing separate checks. The generator does not
replace server admission, verifier acceptance or scheduled-time rules.

Integrate this test with the candidate and rerun appropriate combined checks.
No full workspace, hosted CI, browser, native platform, release, push, main
merge or deployment result is claimed by this review.
