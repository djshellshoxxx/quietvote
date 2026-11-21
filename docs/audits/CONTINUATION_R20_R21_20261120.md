# R20–R21 native diagnostic composition and continuation

Date: 2026-11-20. All three R20 workers completed before a fresh R21 set began;
all six have now completed and their reports are integrated. Together with the
[completed R18/R19 sets](CONTINUATION_R18_R19_20261120.md), this continuation
completed four fresh rounds and twelve actual workers. Scheduled earlier source
checkpoints are not counted as independent worker sets.

## Actual Windows evidence that motivated the change

The [R20 handoff](CONTINUATION_R20_20261120.md) records the independently
retrieved R18 CI [44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714)
logs and Git-data binding. Both Windows jobs checked out synthetic merge
`c76c7665092f9e4287e2c44819d4f82a31ef59ce`, complete tree
`c3e04b91ff324addde7551a777f4a93c8906e817`, with main and scheduled R18
`5485deb10d24ca0e64628746e954676a60919c50` as parents.

| Windows job | Server result | Web result | Enrollment outcome |
| --- | --- | --- | --- |
| Node 22, `136629081428` | 352 passed, zero failed, seven skipped | 441 passed | Passed in 6,998.9224 ms |
| Node 24, `136629081415` | 351 passed, one failed, seven skipped | 441 passed | First voter-key fixture reached UNAVAILABLE/TIMEOUT in 16,410.7866 ms |

The first fixture is now identified, but those logs cannot distinguish the
service handshake from its subsequent native write. The timeout's cause remains
unproven; the successful Node 22 run does not establish a root-cause repair.
Both jobs finished before publication superseded their diagnostic source. R18
claims and visual checks passed. At the later R21 observation, aggregate R18 CI
had 20 successful jobs, one failed job and six running; that snapshot is not an
aggregate pass. Older results do not qualify the new diagnostic.

## Implemented scope and reviewed identities

Root production patch `696ad8851a697a0e3f50c78d0df2f9c2f49c723c` has tree
`e692d9072a09f215960d0fa32687658f27604e5a`. It narrows private message operations
to the existing seven literals and adds a runtime-allowlisted optional operation
to the sanitized error. The deadline uses only the scalar operation selected
when the request reaches the serial queue head. The existing enrollment fixture
prints that finite field alongside its code/diagnostic.

Both TypeScript bridges are blob `27334887c532dafe01f4b9820ea057619751d60d`.
Both unchanged PowerShell helpers are blob `12e703315de1fd0a5d7c8459f2ea18cc9fc55599`.
The existing error message, 15-second deadline, first-failure guard, queues,
native refusal precedence, response bounds, custody, termination, cleanup and
no-retry behavior remain unchanged. No request object, pathname, private bytes,
argv, stdout, stderr or raw process exception is added to diagnostic state.

A service label names the awaited handshake before the ordinary write request
is sent. A write label names a pending acknowledgement and does not establish
whether publication already occurred. Neither label proves why a delay happened.
The change supplies attribution; it is not a native latency fix, a storage
provider or completed latest-checkpoint persistence.

## Completed source-bound workers

| Round | Code audit | Functional bug hunt | Defensive security source review |
| --- | --- | --- | --- |
| R20 | [Report](../reports/independent-native-stage-code-r20-20261120.md), original `fc13be85d3405b790aa9cfc4b4949b86277659eb` | [Report](../reports/independent-native-stage-bugs-r20-20261120.md), original `248b44b31339ffc8147f8114fa519d4c43614ce1` | [Report](../reports/independent-native-stage-security-r20-20261120.md), original `cbcec06733417315a3084bc18f1083e588f952d4` |
| R21 | [Report](../reports/continuation-native-stage-code-r21-20261120.md), original `38e7b510d7b74cd01da3a19b01096f9e8c912c89` | [Report](../reports/continuation-native-stage-bugs-r21-20261120.md), original `5bb8f0ce97ebe0277f6f7f60515a8b052be991a1` | [Report](../reports/continuation-native-stage-security-r21-20261120.md), original `fc5e0b99a4f9b6c6a3d3404ab45f51b3c48d020b` |

R20 code and security workers reviewed the actual patch. Fresh R21 code/security
workers reviewed its final composition, the test bytes, mirror identities and
prepared publication ancestry; no additional scoped correction was found.
They did not claim runtime execution or formal appointed-reviewer approval.

## Actual functional and compiler verification

R20 test commit `5f8b0b4f33a99910f092d4b842524392152a00ad` and root integration
`8cdc6edf17724f0b215f780f3b60f04cfa38d341` share complete tree
`c56e6894dbef0f77a5c454ffce30434ad454930b`. Four outer wrappers passed, zero
failures/skips, in 488.517842 ms on Linux/Node 24.22.3. They contain 17 simulated
child cases: three new service/write-deadline/success cases and 14 retained
synchronous-diagnostic, lifecycle and transport cases. Nested and outer counts
must not be added. The two deadline cases remain pending at 14,999 ms and refuse
at 15,000 ms, preserving single attempt, no write replay, first timeout, pipe
cleanup and omission of fixture input/path data from errors.

Fresh R21 independently compiled exact composition
`0484cc929d8c7d19b24f8e68da2589ca001f7802`, tree
`ed271d29ce2369cbadaf9ee1b01634553662cb88`. All eight workspace aliases resolved
inside its isolated checkout. The first and only attempt used Node 24.22.3,
TypeScript 5.9.3, a 768 MiB heap and full-root `--noEmit --extendedDiagnostics`:

- Exit status zero, no compiler errors; 678 files checked.
- Wrapper elapsed time 8.578314 seconds; compiler total time 8.22 seconds.
- Compiler-reported memory 502788K; child peak resident memory 716884 KiB.
- No timeout, dependency installation or configuration change.

This closes the compilation gate left open in the R20 handoff. Root's earlier
four exit-137 attempts remain interrupted checks with empty diagnostics; the
cause is not established by the later memory observation. R21 did not rerun the
unchanged mock suite merely to duplicate R20's result. Final report composition
does not change the compiled production or test blobs.

Final documentation checks found no broken links among 2,748 links in 420 files.
Claims lint found zero findings across 399 files and 45 rules. Whitespace checks
passed, and every new local commit has an author-matching DCO signoff and a Refs
trailer. Complete-tree and publication identity verification remains mandatory
before the branch update described below. Mock execution and compiler acceptance
are not native Windows latency, ACL or crash-durability qualification.

## Publication and next concrete action

Preserve prepared R19 commit `7df51f39449c04771eff336d0a39bb16651bd9eb`, tree
`a9978c1f482dddfc8fbe5609784898b7f009d1e6`, as the next publication's parent. It
already preserves actual scheduled R18 ancestry and exactly matches reviewed
local R19 composition `5b40432285694aa004976943180fa04176eddd16`. Verify the final
complete tree, changed blobs, actual author/DCO and fresh expected branch head
before a non-force update. The PR metadata records the resulting head and new
workflow identities; a prepared object alone is not branch publication.

Next fresh workers must inspect the new actual Windows Node 22/24 results and
bind the runner checkout/merge tree before qualification. If the deadline recurs,
record the finite pending operation and choose a supported focused next diagnostic
from that evidence. Do not replay a possibly published write, increase deadlines
speculatively, weaken native custody or claim a delay's cause from the label alone.

The [unfinished-work ledger](UNFINISHED_WORK.md) retains REQ-026's origin-level
key association, native ACL/namespace custody, stable cross-process lock,
newest-state reread/proof under that lock, private atomic publication, mandatory
file and directory durability, explicit ambiguous-commit recovery and actual
supported-platform qualification. Formal promotion, historical DCO, governance,
freshness and release decisions remain separate. No main merge, release,
deployment, force push, original-branch deletion or stopped investigation occurred.
Remaining credits are unobservable; continuation must use actual platform signals
and concrete unfinished work rather than an invented balance or empty audit loops.

Refs: QV-18-REQ-026, QV-30 section 6 S9, QV-30 section 7.
