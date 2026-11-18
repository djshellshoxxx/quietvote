# Signed group rule history milestone — 2026-11-16

Implementation: `095c0fc5dc0d80493129b89687a4653e5d2e8a0d`, isolated branch
`codex/qv-governance-core`, based on integration source `e2a9d0b`.
The exact wire/API contract is [GOVERNANCE-CORE](../GOVERNANCE-CORE.md).

## Delivered

An opt-in experimental `qv-governance/1` signed GroupRules core now exists. It
validates closed bounded QV-JSON, strict Ed25519 keys/signatures, group identity,
the complete existing policy schema, pinned genesis identity and rules hash,
founding identity plus steward threshold, consecutive immutable history, and
amendments signed by the previous steward authority. It rejects replacement-key
self-authorization and competing bodies at an occupied version. Valid identical
body replays are idempotent. Protected amendments require the entrenched class.

Offline helpers validate/snapshot a body, compute the exact rule hash and
signature digest, derive group identity and sign a body. No existing suite-v1
hash, record type, acceptance path or vector is modified. The public module is
tree-shaken from the existing browser flows and adds no production dependency.

Ratification remains an explicit evidence boundary: an unsigned envelope pointer
to an election is insufficient. Only a trusted caller's exact synchronous
verification of a FINAL passed governed election can activate an amendment.
Missing evidence produces INCOMPLETE and preserves the last consecutively
ratified active version. Export metadata cannot supply the trusted callback or
pins. This module does not implement that governed-election verifier or claim
ordinary election results can ratify GroupRules.

## Findings repaired before freeze

Root inspection found that accidentally asynchronous ratification callbacks could
reject after the verifier returned. The synchronous gate now handles native
promise rejection without treating it as approval or assimilating arbitrary
thenables. An actual Node process with strict unhandled-rejection behavior covers
both returned rejected promises and throwing async functions.

Author review found a hash cycle in the first draft: a candidate body cannot bind
the ratifying manifest hash when that manifest must bind the candidate rule hash.
The frozen contract signs the decision class and candidate rule body; its optional
ratifying manifest pointer is outside the body hash. A signed candidate can be
prepared first, referenced by a governed election, and later accompanied by its
verified evidence. A replay may attach a missing pointer; conflicting pointers
are rejected explicitly. No initial flawed contract was committed or published.

## Validation

- Targeted governance tests: 71 passed, including 64 immutable shared cases
  (58 INVALID) and strict parser, promise, hash-cycle and snapshot regressions.
- Typecheck: passed with 512 MiB heap.
- Exact implementation web build: passed; 198.9 KiB all JavaScript gzip,
  96.0 KiB entry, 188.0 KiB standalone verifier. This lane predates the separate
  supplemental-author-pin UI; combined integration must measure its own budget.
- Dependency checker: no new violations; the two previously recorded D-97
  protocol-to-board deviations remain unchanged.

The initial full protocol run passed 346 of 348 tests. Its two failures were the
existing whole-corpus regeneration and MANIFEST coverage guards: placing the new
experimental vectors anywhere inside `test-vectors/` violated that locked corpus.
The correction moves the new fixture to `conformance/governance/v1/cases.json`
without changing any fixture byte, existing corpus byte, manifest or gate. The
targeted governance plus original conformance rerun passed 99/99 in 45.7 seconds;
both previously failing guards passed unchanged. The later integrated hosted run
must qualify the combined candidate; no full-suite rerun is claimed for the
documentation/path-only correction.

Fixture: `conformance/governance/v1/cases.json`, SHA-256
`739fccbe4e89116e31eb37d8738151d4a3aafb5063c9793068a431c4bad2d265`.
Fixture keys are public deterministic test keys. Ratification arrays are explicit
test-harness assertions, not proof that a governed election has been verified.
The source generator declares expectations independently of the verifier result.

## Fresh-team continuation

The independent Python team has the frozen contract and immutable shared fixture;
it must use its existing independent primitives and must not translate the TS
production module. The offline CLI team has the public body-validation/hash/sign
helpers and must validate every partial signature before adding a signature.
Neither CLI flags nor a server status field may fabricate ratification evidence.

Fresh review should independently probe authority replacement, foreign groups,
canonical bytes, untrusted pins/metadata, duplicate references, callback failure,
resource bounds and ambiguous histories. Then integrate both implementations and
the real CLI path and rerun the exact-candidate checks.

Next core dependencies remain implemented work, not blanket owner gates:
governed manifest binding, actual ratification evidence, immutable proposal
versions and review, membership aliases/recovery, and disputes/finality. Domain
labels and conservative isolated encodings are ordinary engineering choices
authorized by the continuation request. Time-sensitive activation must use an
explicit authenticated elapsed-time contract; a local/operator timestamp cannot
be promoted into proof of review expiry. Operational witness keys, independent
security review and platform/release evidence still need their real sources.

B1-02 anomaly classifications and B1-07 spec-silent TS-reference readings are
already approved by ADR-027 and should continue without repeating stale holds.
B1-08 approves only TS limits that are grounded in the source specification; its
remaining rows need individual source accounting. D-95 is separate from the
already implemented trustee-spoil false/unsupported-true manifest distinction.
