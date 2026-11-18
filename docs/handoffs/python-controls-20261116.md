# Independent Python legacy controls — 2026-11-16

This continuation starts after stable log milestone `1260edb`, incorporates the
separate approved report-parity dependency `4efcc58` as local cherry-pick `1b0d67c`,
and implements the remaining 13 control/notice evidence cases. Dependency and
control commits must not both be replayed twice when integrating. The stable
milestone's historical 35/13 hold is superseded in this continuation.

## Authority and implemented contract

QV-ADR-027 accepts the decision register's N-12 / D-87 legacy record and B1-02
option A. No new user approval is needed for those choices. This milestone
implements the unknown-string-type row of B1-02: the core emits nonfatal
`E_VERSION` for an unrecognised non-ballot type and excludes that record from
protocol computation. It still fails `chk.encoding.canonical`. This gives no
control authority and does not permit the record to modify protocol state.

When log evidence is supplied, the independent log layer enforces the complete
existing legacy control contract:

- Closed envelope `{body,sigs}`, body `{proto,type:"control",action,reason?}`,
  proto `qv1-r255-sha2`, action at most 32 and reason at most 256 UTF-16 units,
  1..8 closed strict `{key,sig}` objects, and QV-JSON strings.
- At least manifest `coordinator.m` distinct valid coordinator signatures over
  the existing `sig-record` message with **manifest hash** scope. Replays under
  another manifest, action/reason tampering, outsider signatures and repeated
  signer entries do not satisfy quorum.
- Independently authenticated QV-18 header, exact canonical body/digest/length,
  correct action-to-header mapping, and a **coordinator header author**. Caller
  extra keys and trustee keys cannot replace that authority.
- `pause`, `resume`, `invalidate`, `security-notice`, `witness-waiver`, `extension`
  map to `notice`; `audit-close` to `audit_close`, `cancel` to `election_cancel`,
  `abort` to `ceremony_abort`. Unknown spellings, underscore variants and an
  unrecognised notice body fail binding. Schema extensions fail format checks.
- Authenticated notices appear in report notes. Waivers, extensions, pauses and
  resumes cannot change the pinned witness policy or manifest schedule. A
  sequenced extension after `election-close` is fatal `E_TIME_WINDOW`, even at
  witness quorum zero. The original exact failing-check/caveat expectations hold.

The production verifier uses only existing Python cryptography. Format limits
come from the adopted legacy schemas; no TypeScript verification algorithm was
translated or invoked. The fresh reviewer independently checked those data-shape
bounds. Per-type body limits and schema bounds are checked before control
signature arithmetic.

## Actual interfaces

```sh
python3 -I verifier-py/qv_verifier verify election.json --board board.json
python3 -I verifier-py/qv_verifier verify election.json --board board.json --receipts receipts.json --observed observed.json
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet
```

The API remains `verify_bundle(bundle, log={"board": board, ...})`. The 13 legacy
notice inputs no longer raise `NotImplementedOp` or use a vector skip. The CLI
returns the normal full report and exit 0/1 for PASS/FAIL. Core-only invocation
continues to make no board/witness/receipt evidence claim.

## Scope that is deliberately separate

This is evidence verification, not a claim to implement full V13 election state
transitions. Invalidate/cancel/abort terminal verdict effects, pause/resume halt
credit and moved closing times, steward governance, known-malformed-record
classification, first-valid-marker selection and duplicate-tally rules need their
own approved conformance milestones. These are implementation boundaries rather
than assertions that the prior approvals are absent.

B2-05's approved next wire design is a **signed monotone `control_seq` field**,
accepted only when it equals the previously accepted control counter plus one,
with server and both verifiers checking it. It must be introduced through an
explicit version/profile transition with coordinated initialization, signing and
verification rules, producers, stored/exported bodies and additional counter/replay
vectors. This milestone does not silently permit `control_seq` in the legacy
closed schema, derive missing counters for existing signed records, or invalidate
the unchanged legacy corpus. New counter tests should include duplicates,
regressions, gaps, wrong-election replay and concurrent state advancement.

## Validation

The untouched full vector tree reports **282 total, 282 PASS, 0 FAIL,
0 NOT-IMPLEMENTED**, exit 0, with **79 file hashes matching** and no mismatch/missing
file. All 48 log cases are compared on exact checks/verdict and negative code,
`verdict:` and `surfaces:` assertions. No expected vector, corpus manifest or shared
comparator was edited or suppressed.

The unchanged strict shared comparator, after the separate parity dependency,
reports **27 cases, 27 verdict agreements, 0 report differences, exit 0**. It retains
its existing core-only scope; the log corpus independently qualifies this optional
log path. Focused controls: **9 tests, OK**, including independently generated
2-of-3 authority/signature/replay/threshold/schema tests and forged header evidence.
The complete Python suite result and source freeze are appended once finished.

The prior stable log review separately passed 119 tests including six new fresh
review probes in its own branch (`fb9ba9f`). Those review commits are integrated by
the parent, not duplicated into this control branch. No remote write was performed.

Final full Python run: `python3 -I -m unittest` from `verifier-py` completed
**128 tests, OK**, in 106.29 seconds. `git diff --check` passed. The entire test-vector
tree and `scripts/compare-verifiers.ts` remain byte-identical to the preceding
stable milestone. The code/spec/test changes are one signed-off control milestone
commit after the parity dependency; a separate fresh reviewer receives that exact
source for independent qualification.
