# Independent Python adapter integration review — 2026-11-16

Root reviewed production source `c08ce6b` plus the two test additions in
`d106da2`, integrated as `df6125b` and `09427eb`. No production blocker found.

The shipped CLI delegates to existing independent Python operations, without
reading expected results or invoking TypeScript. An explicit selected directory
is held by descriptor. Every child directory and final regular file is opened
without following symlinks; traversal, absolute/drive paths, FIFOs and oversized
files are refused. Platforms missing the required descriptor operations return
an explicit unsupported result for file operations. Hash/proof operations remain
available. Framing and response bounds are distinct; malformed requests cannot
silently authorize content-only verification or claim a complete profile.

Inspection checked loops in the direct operation dispatcher: DKG participant
counts and ballot manifest limits are checked before streamed dispatch; proof
arithmetic consumes bounded scalars and input arrays remain request-bounded.
The expanded actual-process/interactive adapter suite passed 15/15 in 4.070
seconds on the integrated source after supplemental-author-pin integration.
The author's full Python and immutable-corpus receipts remain separately scoped
in the milestone handoff; this focused review is not a platform or crypto audit.

The same integration found a Node 22 test-only compatibility failure in P1's
independent exception probes: `mock.module` requires `namedExports` there.
Both probes now use that option, preserving all assertions; all seven fresh
P1 tests pass locally on Node 24. Hosted Node 22 rerun is required. Reference:
https://nodejs.org/download/release/v22.23.3/docs/api/test.html#mockmodulespecifier-options
