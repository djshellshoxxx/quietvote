# Supplemental author public keys: independent review

Reviewed production source: `d3046beb15324164fbdc909f93530a682253f16f`.
Reviewer: `/root/python_log_fresh_review`, isolated worktree
`qv-author-pins-fresh-review`. This review commit changes tests and this receipt
only. The author worktree was not modified.

## Conclusion and trust boundary

No unresolved blocker was found in this milestone's CLI parsing, self-test
wrapper forwarding, public upload helper or SPA verification/results lifecycle.
The implementation exposes the existing supplemental-author mechanism through
explicit caller and user inputs. It does not change protocol author roles or
the P1 witnessed-log requirement.

Source inspection confirmed that keys are read from the explicit CLI argument
or visible user field, not from unsigned bundle/board/server metadata. UI text
asks for keys obtained separately from a trusted source. The standalone page
snapshots parsed keys before reading a file and invalidates its active run on
key edits. SPA upload and result checks bind their completion to route and run
generations. A live result refresh creates a fresh field with no saved pins.

## Independent regressions

Six API/CLI groups use a newly generated election with real signatures,
independent witness cosignatures and a supplemental server-evidence record
carried as `tally_aggregate` before the final result. Tests do not change the
committed vector corpus or expected reports.

- Missing trust fails; the caller's correct key passes both verification layers
  and reaches the public helper and `verifyWithSelfTest`.
- The wrapper also passes with its actual canary enabled. An unreadable canary
  corpus still forces FAIL after valid election verification, and the final
  report hash matches the report.
- Bundle, board, options, server and log-evidence shaped metadata cannot grant
  supplemental author trust.
- Re-signing manifest, coordinator marker, trustee key-confirmation, voter
  ballot or coordinator-control headers with the supplemental key still fails
  fatal role binding.
- A signed zero-witness election with a valid supplemental author remains
  INCOMPLETE by default. Only the existing explicit content-only mode permits
  its scoped PASS.
- Both actual CLI entrypoints reject missing, empty, short, long, nonhex,
  uppercase, trailing-newline and mixed valid/invalid keys before file I/O.
  Thirty-three supplied keys are rejected. Repeated valid keys and the equals
  argument form work, with witnessed PASS and no content-only caveat.

Three additional groups run the actual SPA controller with a minimal DOM and
real cryptographic verification. They cover previous-verdict removal on key
edits, delayed file success and rejection after a newer result, route changes
and empty trust on return. Live-result probes hold the board export pending,
then edit keys, navigate away or refresh the actual signed record snapshot.
Obsolete evidence cannot restore PASS or result tables. Unsigned API metadata
does not prefill the key field. API transport methods and the SSE start hook
are test doubles; protocol verification, record-context derivation, controller
generation guards and live record refresh are production code.

## Validation and limits

On the exact production source above plus retained review tests:

| Check | Result |
| --- | --- |
| Fresh API/CLI and SPA-controller tests | 9 passed, 0 failed/skipped; 25.899 s |
| `npm run typecheck` | Passed |

Durable command logs and source/exit receipts are under
`/workspace/scratch/d66ff14a02a0/validation/author-pins-fresh-review*`.

One ordinary repository Chromium launch was attempted. The host rejected its
socket creation with `Operation not permitted`; no escalation or alternate
launch bypass was attempted. This receipt does not claim actual-browser
coverage. The author's added browser journeys require hosted CI. Standalone
key invalidation was source-reviewed here; the author's standalone DOM tests
are separate evidence. No full-project sweep, deployment or professional
security-review claim is made.

## Handoff

Cherry-pick this review commit after `d3046be`; it contains no production fix.
The author's later docs/real-HTTP test commit `4d7209e` is separate from this
exact-source receipt. Preserve P1's default evidence requirement and keep
supplemental keys distinct from manifest, coordinator, trustee and witness
trust in subsequent work.
