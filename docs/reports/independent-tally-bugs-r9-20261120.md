# Independent unsigned tally comparison tests — R9

Date: November 20, 2026. Fresh worker: `bug_hunt_r9`.
This follows the [R8 functional preflight](continuation-bugs-r8-20261120.md).
No production source was edited. The contribution consists of the independent
[protocol regression file](../../packages/protocol/test/tally-draft.test.ts)
and this source-bound report.

## Exact source and result

- Reviewed implementation: `a88b44629a47909805adae524abe050a6a6debeb`.
- Implementation tree: `0bf68b94db29972adf7b81db8476d1efdb06cf87`.
- Test contribution: `149bebe599e808078a96c8f75f49f7a82db23bde`.
- Test tree: `d904c71251df4eade833d48a392ded4709bd9030`.
- Runtime: Linux, Node 24.22.3, npm 11.19.1.

**All 18 targeted tests passed**, with zero failures, skips or cancellations,
in 46.8 seconds. No new functional defect was confirmed within these scopes.
The tests exercise the new public entry point directly and retain ordinary
published-verifier comparisons where that distinguishes the new boundary.

The isolated checkout installed its own dependencies from the unchanged lockfile
with lifecycle scripts disabled, followed by the two pinned vendor packages.
Workspace imports resolve to this checkout, not the coordinator's changing tree.

## Distinguishing checks

| Group | Observation |
| --- | --- |
| Three existing public fixtures | Tiny yes/no, small approval and log-layer election content match their genuine tally bodies after taking the pre-tally content prefix. Counted counts are 4, 18 and 4; cast counts are 4, 21 and 5, preserving the existing revoting/counting semantics. |
| Scope and immutability | Reports say `tally-draft`, `MATCH`, `bodyMatchesSnapshot: true`, `published: false` and `freshnessVerified: false` in explicit content-only mode. Input snapshots and candidate bodies remain unchanged. |
| Absent evidence | Default checking of a correct body without a board remains `INCOMPLETE`; body arithmetic can match while append-only/witness checks remain `not_run`. |
| Prior publication | The new entry point refuses a snapshot containing a published tally. The original verifier still reports the pre-tally snapshot incomplete and the original complete content fixture passing. |
| Prerequisites | A wrong manifest pin fails before tally comparison. Missing election-close evidence leaves time/tally checks unrun and the result incomplete with the existing informational marker finding. |
| Candidate boundary | Undefined, null, empty and non-tally candidates fail the tally schema; none falls back to the ordinary published-verification path. |
| Independent arithmetic | A different counted count/root, context, option total or rule outcome fails the corresponding existing recomputation, without changing the snapshot. |
| Disclosed spoil | A different reveal selection fails the draft comparison and its spoil check while preserving the existing `ALARM` finding class. |
| Threshold and `T_valid` | Naming only the canonical threshold subset while four valid sets remain available fails. A different complete threshold subset yields the same results. Fewer than the required complete sets cannot produce a matching draft. |
| Cooperative execution | Cooperative and default execution produce identical complete reports; cancellation during the tally checkpoint rejects without returning a verdict. |

The three fixture files contain no board member. Their prefixes are used only
for the explicitly scoped content checks above. The tests never insert the
candidate into history, generate a convenience signature or construct synthetic
board evidence. These observations do not qualify a witnessed live snapshot,
server admission, publication, finality or currentness.

## Commands and compile boundary

Executed:

```sh
node --test --test-reporter=spec packages/protocol/test/tally-draft.test.ts
```

The attempted full root `npm run typecheck` was externally killed with exit 137
before diagnostics. That process is not a completed typecheck and is not evidence
of a TypeScript defect or exhausted credits. The coordinator was notified before
any further whole-repository compile was attempted.

A separate bounded compile succeeded for the added test and its imported graph.
It inherited the repository's unchanged compiler options, included only this
test through a temporary root-relative configuration, and used Node's 384 MiB
heap limit. It is narrower than the repository gate. An initial temporary config
outside the checkout could not resolve Node type definitions; locating that
config at the checkout root resolved the path issue without changing source or
compiler options. Both temporary configuration files were removed.

Documentation checks passed: 2,340 links across 375 files, none broken; claims
lint found zero findings across 354 files and 45 unchanged rules. Staged
whitespace checking passed before the signed-off commits.

No broad protocol/verifier suite was repeated. The diagnosing-bugs discipline
was used to construct distinguishing checks; no observed new failure required a
causal reproduction or production repair.

## Follow-up and limits

The coordinator separately identified and is correcting an explicit
closed-snapshot witness-completeness requirement. This content-only suite does
not qualify that later change. Source-only review, author execution and fresh
independent execution must remain separate. Integrate the tests into the final
composition, retain these exact source qualifications, and exercise the ordinary
witnessed pre-publication path and actual CLI flow in their separate receipts.

No vulnerability reproduction, intrusive probe, native/browser retry, stopped
investigation, old untracked test or publication was performed. Existing native
ACL, provenance, contract and formal appointed-review requirements remain
separate gates. The test commit has an author-matching DCO trailer.
