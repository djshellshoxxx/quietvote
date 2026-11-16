# P1 / TSV-05 / TSV-04 final author receipt

Completed 2026-11-16 on Node v24.22.1 and Python 3.12.14.

Production source is `3ab2928761100e82a2cba3ad76b2095f0ffdc039` plus
`29c122cc424e03f0cec2a82454e63d438c266845`. The final test-only migration is
`796992ea8d4a920acd977273f98a0fc140479373`; it corrects the online CLI fixture to
assert default INCOMPLETE before explicitly requesting content-only scope for
its independent comparison. No production source changed after `29c122c`.
The local PY-02 dependency `cb33bb0` is equivalent to the parent's `0a73091` and
must not be integrated twice.

The full TypeScript and executable runs began at `29c122c`; only the separate
`online.test.ts` fixture changed during those runs. That file is outside their
selected inputs and was run independently after the change. The final Python
suite also used the unchanged production source. These are local author
receipts, not evidence for later integrated source or hosted browser runs.

| Check | Completed outcome |
| --- | --- |
| Protocol, outer verifier and web unit suites (`node --test --test-concurrency=1 packages/protocol/test/*.test.ts packages/verifier/test/*.test.ts packages/web/test/*.test.ts`) | 562 passed, 0 failed/skipped; exit 0; 364.469 s |
| Python (`python3 -m unittest discover -s tests`, from `verifier-py`) | 145 passed; 113.638 s |
| Packet executable, trustee executable, ceremony and tally suites | 30 passed, 0 failed/skipped; exit 0; 396.907 s |
| Combined all-client executable election (`packages/cli/test/all-clients-executable.test.ts`) | 1 passed; exit 0; 674.304 s, including the real voting-close deadline |
| Online CLI fixture (`packages/cli/test/online.test.ts`) | 5 passed; exit 0; 18.581 s |
| CLI, audit regressions and web verification targeted run | 30 passed; 101.545 s |
| HTTP consolidation/import/negative/spoil suites plus corrected full-election evidence-export test | 39 passed in the multi-file run, then the corrected full-election test passed separately (28.019 s); all 40 selected tests have passing outcomes |
| Strict cross-verifier comparator | 27/27 shared-capability reports agree; existing append-only/witness/receipt capability exclusions unchanged and explicitly excluded from the agreement claim |
| Tooling tests | 55 passed; 2.595 s |
| TypeScript typecheck | Passed with `NODE_OPTIONS=--max-old-space-size=512` |
| Web production build | Passed unchanged budgets: total gzip JavaScript 198.3 KiB, entry 95.6 KiB, standalone verifier 187.8 KiB |
| i18n extraction/check | Passed; locale review gates unchanged |
| Corpus preservation | Deterministic generator/read tests passed; no diff from `ac08d6d` in committed `test-vectors` or embedded verifier corpus |

The combined executable test asserts that default bare-export verification
returns exit 3 / INCOMPLETE. Its explicitly content-only comparison returns
PASS with exact totals and matches Python's content-only vector evaluation.
This does not claim witnessed assurance for that deliberately zero-witness,
content-only export.

The HTTP evidence test preserves default export shape/cache behavior, validates
the additive complete public-record representation and no-store response,
retains read-key guards, and checks the existing supplemental-author boundary.
Without a trusted pin the server-authored aggregate is refused; with the
fixture's independently known `srvPk` in `extraAuthorKeys`, append verification
passes. Signed quorum zero still yields default INCOMPLETE. No transport field
was promoted into authority.

## Independent review and handoff

Fresh review `661aea1600d0fcbbbc0629cec9d8475231b94a74` retained 16 new boundary
tests against exact `3ab2928`, with typecheck passing. Its separate receipt
explicitly excludes the later `29c122c` export correction and supplemental-pin
forwarding. Root owns the subsequent Node 22 test-mocking compatibility repair;
this author receipt uses Node 24 and does not duplicate or qualify that repair.

The [implementation handoff](../handoffs/P1-LOG-REQUIRED-20261116.md) inventories
runtime/conformance callers and identifies the exact supplemental signer fields.
A fresh supplemental-author-pin lane is implementing the remaining explicit
caller-input paths; that lane's code, tests and review are not covered here.
The parent should use its newer receipt when that work completes.

The local browser attempt failed before launch with Chromium
`socket() failed: Operation not permitted`. No local browser assertion was
executed. Earlier hosted checkpoints that predate P1 do not qualify this source;
the parent must attach the appropriate integrated hosted browser result.

The first combined sweep's session `31325` became unavailable while its log
remained empty. It has no outcome and is not counted as a pass. The separate
restarted runs above completed with persisted exit-0 files. Earlier five unit
fixture/copy failures and the HTTP representation/authority assertion failures
are superseded by the clean final unit run and corrected explicit-author test;
no production trust check was relaxed to make them pass.

Local final logs and SHA-256 (for integration reconciliation):

| Log | SHA-256 |
| --- | --- |
| `/tmp/qv-p1-combined-final.log` | `6c1819674cfc6741502bbedfa0ed9629fb4fc2ac446188d8a58a44e30c8f42fe` |
| `/tmp/qv-p1-clients-final.log` | `976568c32aa896fa2f2623238729cc3315d348325c713f13250a110f8913960f` |
| `/tmp/qv-p1-full-ts-final.log` | `c816d5bde2c398b606d4f0c017db0e5bb4570210999bdaf0bd216014bedda12d` |
| `/tmp/qv-p1-python-final.log` | `2937484768fb926a86d6679dba58e3f66863225decb8b657a36a3d7ed329dc5a` |
| `/tmp/qv-p1-online-final.log` | `adb26cf46127d4f5987ddf64cf59f15809b9eb4ee707b97ce8a8bf762a19ccc0` |
