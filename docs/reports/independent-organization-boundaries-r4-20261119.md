# Organization workflow boundary review — November 19, 2026

Fresh bug-hunt worker: `/root/bug_hunt_r4`.

Reviewed candidate: `c9d59e3175bb876176de1a5edef76aadeed8fbd6`.
Complete candidate tree: `68a449a95a9118477429c8d0e25b64dc41ab1f56`.

This supplements the [organization CLI implementation](cli-organization-enrollment-20261119.md).
It is separate from the earlier [private-file/browser follow-up](independent-bug-hunt-r4-20261119.md).
No production change was needed in this review.

## Source review

The creation adapter derives the owner public key and expected returned key ID
from the same unlocked key used for the signed request. Its name length matches
the server's JavaScript-string length limit. The private token reader preserves
token spelling, including spaces and a UTF-8 BOM, while allowing one trailing LF
or CRLF in the documented single-line file format. Its byte limit accommodates
the accepted string-length ceiling.

Creation retains the required explicit idempotency key and the existing signed
request framing. The success response must bind the requested name and owner
key; only those public fields and a validated organization ID are printed.
Inspection constructs its path from the validated organization ID and delegates
authorization to the unchanged signed API. No concrete blocker was found in
these selected workflow boundaries.

The implementation's normal bootstrap, protected stdin, token/closed modes,
explicit replay and malformed-input tests were being exercised independently
by the code/security review workers. This lane selected an additional ordinary
edge instead of repeating their whole batch.

## Independent integration case

`packages/cli/test/organization-boundaries.test.ts` uses a real local server in
token registration mode and the actual CLI dispatcher. It verifies:

- A 120-character multibyte organization name and 200-character multibyte token
  survive file decoding, signed JSON transport and server validation exactly.
- An owner already registered with an organization cannot create another one
  merely by choosing a fresh idempotency key.
- Explicit replay with the original key returns the original organization, and
  the original organization remains inspectable with its unchanged name.
- The supplied token is absent from the captured command output.

Observed result: **1 passed, 0 failed, 0 skipped, 0 cancelled; exit 0;
0.750 seconds**, Node 24.22.3 on Linux, serial execution with a 256 MiB heap.
This is additional positive/boundary coverage, not a newly reproduced defect.
Test source blob: `8baa3a99d9ac646912ba32a6a9ca10cdc5ef97d3`.

A strict TypeScript check rooted at this new test and all transitive imports
passed with no diagnostics using the unchanged compiler options and a 384 MiB
heap. Whitespace checking passed. The full repository gate was not repeated.

## Hosted observation and next handoff

At `2026-11-20T02:45:49Z` (November 19 in America/Los_Angeles), the
[published-base matrix](https://github.com/djshellshoxxx/quietvote/actions/runs/44660024709)
had seven successes, one browser failure, four jobs in progress and fifteen
queued. Windows Node 24 trustee/crypto completed successfully. Windows Node 24
server/web and CLI/board were still running; Windows Node 22 server/web remained
queued. These results belong to published `8b7aa031`, not this new CLI source.

The next worker should inspect actual current-published-source results, including
the unchanged native browser journeys after the inline-icon and route fixes.
Do not treat earlier successes or running/queued jobs as qualification for a
newer tree. The previously undiagnosed first native private-file write remains
unresolved until relevant native evidence is available.

This worker did not repeat blocked local Chromium execution, resume the stopped
background-gossip investigation, modify assertions/timeouts, publish changes,
merge main, or provide formal sensitive-change approval. Native ACL custody and
release-evidence boundaries remain as recorded in the main continuation ledger.
