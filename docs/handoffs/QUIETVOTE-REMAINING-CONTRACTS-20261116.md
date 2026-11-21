# QuietVote remaining contracts and executable decisions — 2026-11-16

Reviewed source: local `bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912`, published
with the identical tree at `00646a2ca8e6895abc0b62ab958caa7ae96d7ab2` in
[PR #52](https://github.com/djshellshoxxx/quietvote/pull/52).
This is a decision-readiness review, not a new protocol decision or a claim that
the proposed implementations below have passed tests. Later lane handoffs record
their implementation and validation status.

## Approval records must be read together

[ADR-027](../decision-log.md#qv-adr-027--owner-approval-of-the-2026-11-04-decision-register-categories-ad)
explicitly records acceptance of the recommended defaults in categories A–D of
the [2026-11-04 decision register](../plan/DECISIONS-2026-11-04.md).
It permits implementation and the corresponding specification/errata changes;
independent review remains a requirement before the relevant release claims.
An older sentence saying “owner decision needed” is not, by itself, a reason to
stop work on a subsequently approved default.

There are genuine contradictory records. The register header and ADR-028 record
registration approval, while the register's final B3-01 section and
[OPEN-DECISIONS](../plan/OPEN-DECISIONS.md) lines 10–15 still retain the older
hold. The [November 9 registration brief](../reports/registration-decision-20261109.md)
lines 3–26 explicitly preserved that hold **for its then-current task** and
identified the contradiction. It is not a new owner rejection of ADR-028.
Today's request to complete features authorizes further implementation; historical
task-specific stopping instructions must not be silently promoted into new gates.

## Concrete implementation directions already recorded

Line references below are to the reviewed source, not assurances about future
line numbers. The approved register is more specific than unaccepted recommended
defaults in the open-decisions list.

| Work | Existing accepted instruction | Next executable action and limit |
|---|---|---|
| CLI/web QVKEY1 passphrase portability, B3-25 | Decision register lines 350–357, option A, adopted by ADR-027: shared canonicalization; canonical wrapping; canonical then legacy unlock. | Share the existing web word-list canonical form; try the legacy NFKC-only form only when different and the first authenticated decryption fails. At most two KDF attempts; retain format/parameter checks and legacy fixtures. Test both directions, variant spelling, non-word passwords and wrong-password behavior. No format bump or new normalization policy is needed. |
| Three strict comparator differences | Register lines 40–67 adopts A for `count-altered`, `manifest-signature-removed`, and `result-flipped`. | Python stops downstream checks after manifest signature failure; rules stay `not_run` after failed tally decryption; `results` is emitted only for verified published outcomes. Amend QV-35 and the corresponding errata as directed. Keep the comparator and existing vectors unchanged. D-92–94's conflicting B/B/C entries are proposals, not later accepted decisions. |
| Existing log-layer notice cases in Python | Register B1-02, lines 104–114, adopts TS non-ballot classifications; N-12/D-87, lines 196–203, ratifies the current closed control schema and manifest-hash signature scope. | Assess and implement existing TS log-layer behavior and unchanged notice vectors in Python. Matching existing authentication/classification does not require inventing V13 terminal effects, steward delegation or moving time windows. Report those separate limits explicitly. |
| Python unsupported trustee-spoil manifest flag | Register PY-01, lines 138–145, chooses off in v1: accept `false`, reject `true` with a named unsupported error. | Implement that bounded capability distinction with tests and an error-registry note. The newer D-95 question about how a zero-digest spoil affects ballot membership and report class is a different decision. |
| `INCOMPLETE` report state, PY-02 | Register lines 31–38 adopts the state, exit 3 and specification amendments. P1 lines 11–19 also changes the no-log default, with an explicit library opt-out. | Implement in its own compatibility lane. First specify the caller/report modes and add fixtures; test no-tally, absent/failed log and fatal-error precedence. Do not slip this into the three-case comparator repair: P1 explicitly affects existing PASS expectations and the complete API/CLI/UI contract. |

## Registration: approved wire direction, unfinished storage transition

ADR-028 specifies the current browser's hashed-invite request and invite-bound
proof of possession. A real registration repair is executable work; it should
not be left forever at the intentionally failing browser regression merely
because an older handoff retained the hold. However, the approved prose does not
complete its storage and migration contract:

- The raw 16-byte token is `T`, the on-wire bearer is `H = SHA-256(T)`, and the
  browser signs `UTF8("QV-REG-v1") || 00 || UTF8(apiElectionId) || 00 || H || pk`
  using ordinary Ed25519. `H` and `pk` are fixed-width raw bytes. The token hash
  is itself a redeemable bearer; storing `H` directly would remove the existing
  database-theft barrier. The statement that the server “never receives a usable
  credential” is false for that construction.
- Existing stored invitation verifiers are
  `SHA-256(UTF8("QV-INVITE-v1") || 00 || UTF8(base64url(T)))`. They cannot be
  converted to `H` from stored data alone. Calling the change a deterministic
  database migration would be incorrect.
- Recommended refinement: store a separately domain-separated digest of the new
  wire bearer and persist an explicit scheme discriminator. Document this as a
  security implementation detail; do not claim ADR-028 already fixed its bytes.
  Prefer a new-election modern scheme plus an explicit, previewable legacy
  reissue/cutover path. Do not opportunistically try both signature preimages or
  infer the scheme from attacker-controlled input length.
- Preserve already registered voters, pinned/committed rolls, used/revoked/expired
  invitations, retention deadlines, read-only mirrors, private backup floors and
  lost-response idempotency. A migration preview must not consume or invalidate
  existing invitations. A cutover must account for every outstanding legacy row.
- This repairs **election** registration. Group identity, human labels, membership
  approval/vouches and recovery aliases remain the distinct QV-04 application
  contract. An unsigned label field cannot satisfy its signed enrollment proof.

The earlier brief's sections 2–5 contain exact current bytes, alternative storage
constructions, and acceptance requirements. The implementation needs a successful
actual `registrationBody` → HTTP server journey, cross-invite/key/election replay
negatives, concurrent redemption tests, migration/restore tests, and the existing
post-commit refusal. External protocol review is separate from permission to
write and test the repair.

## Missing core contracts are implementation gaps, not blanket holds

The [feature ledger](../reports/quietvote-teams-feature-ledger-20261116.md)
correctly identifies the following missing MVP capabilities. No newly discovered
owner instruction explicitly prohibits drafting their canonical schema and state
model. They must not be called optional future features or completed by a UI-only
store. The drafts contain enough intent to prepare a reviewable contract, but
contradict the currently strict election schema in specific places.

| Dependency | Concrete contract preparation | Acceptance boundary |
|---|---|---|
| Signed GroupRules and templates first | QV-03 lines 20–118 defines `qv/1`, `QV-rules/1`, steward thresholds, rule chain and a different manifest hash/shape. Specify a versioned governance envelope, trusted founding steward set, chain/fork handling, amendment activation and how the current `qv1-r255-sha2` manifest binds `rules_hash` without altering old signed bytes. Reconcile field bounds, error names and unsupported eligible/drand rules before enabling templates. | Shared positive/negative canonical bytes; threshold/duplicate signer/chain/fork tests; immutable election binding in TS and Python; ≥40 invalid-rule cases required by QV-03-REQ-001. |
| Proposal versions and review | QV-03 lines 206–218 and QV-02-REQ-020–024 define author/sponsor permission, version chain, substantive/disputed-change review restart and freeze. Define record framing, bounded text, attachment time, withdrawal and exact immutable `proposal_hash`; derive authority from the selected rules version. | Real CLI/API/web version/review/freeze journey and exported independently checked hashes. Editing after attachment cannot alter a signed election. |
| Membership rotation/revocation | QV-04 lines 125–143 provides two-key rotation, delayed/vetoable recovery, alias identity, and unchanged quorum denominator for revocation. Reconcile snapshot-at-manifest prose with ADR-015's later roll commitment; fix canonical group/key/nonce framing, activation index/time, replay and aliases in both verifiers. | Pre/post-rotation ballot ordering, cross-group replay, cycles, duplicate aliases, old-key veto, recovery caps and unchanged `N`; group enrollment first. Admin-key revocation is not this feature. |
| Challenges and finality | QV-03 lines 263–277 defines member-signed filings and arbiter resolution, while QV-02-REQ-063 names stands/annulled/rerun and QV-03 names STANDS/CORRECT/ANNUL. Specify effects, evidence storage/export, signed authority, time source and finality. D-32/33 still propose attribution and small-group arbiter fallback; ADR-022 places RESOLVED/FINAL inside AUDIT but does not supply record bodies. | Cross-election authority/replay negatives, evidence integrity, late/duplicate filing, threshold resolution, timeout and irreversible finality tests through both verifiers and shipped clients. |

Full V13 also remains unfinished: the accepted register selects authorization
plus terminal effects, yet its rationale explicitly leaves the terminal verdict
class and steward-versus-coordinator authority unresolved (lines 177–186).
The approved `control_seq` freshness recommendation (lines 205–213) can be
developed as a versioned contract; it must not silently reinterpret existing
signed controls. Python log compatibility alone does not finish this module.

## Next team handoff

1. Implement the specifically approved compatibility/report slices above and
   retain fresh independent regression reviews. Record source SHAs and actual
   receipts; do not count proposals or an old lane pass as final integration.
2. Prepare registration's exact storage/migration artifact and implement the
   selected modern path with non-destructive transition behavior and real-client
   tests. Keep its scope separate from full group enrollment.
3. Freeze the GroupRules/envelope/manifest-binding design, then build proposal,
   membership and dispute lanes in dependency order with both verifier contracts.
4. Continue independent protocol/security review and supported-platform,
   browser/manual-accessibility, native-language and operational activation
   qualification. These external evidence gaps are not a substitute for the
   remaining missing core code.

This review changed documentation only. It did not modify wire formats, outcomes,
vector expectations, credentials, deployed data, main, releases or deployments.
