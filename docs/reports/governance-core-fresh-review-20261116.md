# Independent signed-governance core review — 2026-11-16

Reviewed production source `095c0fc5dc0d80493129b89687a4653e5d2e8a0d` and
the fixture-placement/docs follow-up `24c5d26e6883ffd3dcd1677122e4446301224a63`.
The latter is locally `5113531`; production governance code is unchanged.
The shared fixture bytes have SHA-256
`739fccbe4e89116e31eb37d8738151d4a3aafb5063c9793068a431c4bad2d265` at
`conformance/governance/v1/cases.json`. This review does not regenerate or alter
that fixture or the suite-v1 corpus.

No unresolved blocker was found within the isolated signed-rule-history scope.
The reviewer retained nine independent regression groups in
`packages/protocol/test/governance-fresh-review.test.ts`:

- Node's Ed25519 implementation signs manually framed governance digests from
  separate deterministic fixture keys; independent SHA-256 and canonical JSON
  construction agree with the production group identity, rules hash and signature
  digest. Signing the rules hash directly instead of the framed signature digest
  is rejected.
- Genesis requires identity plus steward quorum. An identity outside the steward
  set supplies no steward vote; an overlapping identity counts once.
- A rotation that lowers the new threshold still requires the old steward
  quorum. Subsequent candidates use the new authority; former keys and an
  otherwise valid extra identity signature cannot authorize amendments.
- A four-version history cannot activate later candidates across an unratified
  predecessor. Invalid later signatures prevent every ratification callback.
  Invalid reports expose no active authority fields.
- Replays cannot combine insufficient signatures, ignore a poisoned extra
  signature or resolve a fork by arrival order. Valid exact-body replay remains
  idempotent.
- A ratifying manifest can be calculated from the candidate hash and attached
  after signing, without changing candidate bytes. The unsigned pointer is
  ineffective without exact independent callback approval; conflicting pointers
  are rejected.
- Callback requests are frozen snapshots. Truthy values, thrown exceptions,
  async rejection and cross-realm native-promise rejection cannot activate rules
  or expose private exception text. A strict child process remains alive;
  arbitrary thenable getters are not invoked.
- Duplicate nested authorization fields, negative zero, invalid UTF-8 and an
  input one byte above the wire limit are rejected. Exactly the maximum wire
  size remains accepted when it contains a valid document plus whitespace.

Executed command:

```
node --test --test-reporter=spec packages/protocol/test/governance-fresh-review.test.ts
```

Result: **9 passed, 0 failed, 0 skipped**, 2.104 seconds, Node 24.22.1.
`NODE_OPTIONS=--max-old-space-size=512 npm run typecheck` also passed.
The dependency-only fixture relocation was applied afterward and changes none
of this independent test's inputs, imports or production code. No production
edit was made by this review.

This is source-specific agent review. It does not establish an audited governance
protocol, governed-election binding, valid ratifying election/finality evidence,
proposal scheduling, membership transitions, dispute handling or elapsed time.
`verifyRatification` remains a trusted caller-supplied verification boundary;
the new public CLI must not expose a flag that fabricates its approval.
