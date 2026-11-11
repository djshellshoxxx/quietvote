# Review findings — 2026-11-11

**AI-assisted review. It is not an independent professional audit. QuietVote remains unaudited and not for real elections.**

Source reviewed: `ab84f16136184cb1fa0fa67b41e113424e134ba8` (the PR #30 milestone head). Nothing listed here is fixed.
The owner paused the project before any fix was started, so every finding below is **open**.

## Coverage, stated plainly

Three independent review lanes were started. Only one finished.

| Lane | Scope | Outcome |
|---|---|---|
| S1 | Eligibility, authorization, duplicate-vote prevention | **Incomplete.** The reviewer was terminated by a usage limit before writing its report. Two proof-of-concept files survived; the integration coordinator ran both and reproduced both (S1-01, S1-02 below). Its route and authorization table, the list of attacks it tried and refused, and any other finding are lost. Treat this scope as only partly reviewed. |
| S2 | Tally integrity and result verification | **Not reviewed.** The reviewer was terminated by the same limit before producing any output. No conclusion about tally integrity may be drawn from this cycle. |
| S3 | Ballot confidentiality, linkability, key custody | Complete. Report: [s3-confidentiality.md](s3-confidentiality.md). It includes a "who can learn what" table derived from the code and the list of attacks that were correctly refused. |

## Findings

Severities for S1-01 and S1-02 are proposed by the coordinator from the reproduced behaviour; the reviewer's own rating was never recorded.

| ID | Severity | Summary | Status |
|---|---|---|---|
| S1-01 | Medium (availability) | With the roll pinned in the manifest, one invite holder, or one absent member, makes `roll_commit` impossible; the election cannot open and there is no recovery route | Open; needs an owner decision |
| S1-02 | Medium (integrity signal, Benaloh rule) | A cast that reuses the ciphertexts of an already admitted, published test ballot is admitted and counted | Open; fixable at admission without changing verifier semantics |
| S3-01 | Low (privacy) | Ballot entries carry second-precision timestamps on the public board; the spec and the privacy notice promise minute precision | Open |
| S3-02 | Info | The re-wrap guard omits placeholder ciphertexts; not exploitable end to end | Open |

### S1-01: a pinned roll can be blocked by one invitee or one absent member

- **Where:** `packages/server/src/app.ts` (registration handler), `packages/server/src/election.ts` (`roll_commit` admission compares the commitment with both the manifest roll and the server's approved set). The web organizer flow builds exactly this kind of manifest (`roll.root` and `roll.size` set).
- **Attacker position:** any holder of one unredeemed invite code. A second variant needs no attacker at all.
- **Reproduction:** copy [poc/s1-static-roll-registration.repro.ts](poc/s1-static-roll-registration.repro.ts) to `packages/server/test/` and run `node --test packages/server/test/s1-static-roll-registration.repro.ts`. The file asserts the expected behaviour, so it fails while the defect exists. Observed on 2026-11-11:
  - Registration of a key outside the pinned roll, after the manifest was published: `201 approved`.
  - `roll_commit` over the pinned roll: `422 E_ROLL` ("does not match the registered roll").
  - `roll_commit` over the server's approved set: `422 E_ROLL` ("roll differs from manifest roll.root/size").
  - Registering the pinned key as well does not help; the approved set then has one key too many.
  - Removing the stray voter: `PATCH` and `DELETE` on the voter both return 405. The election stays in `SETUP_KEYED`.
  - Variant without an attacker: three of four pinned members register, the fourth never does, and `roll_commit` over the pinned roll is refused the same way.
- **Expected:** QV-04 section 5.4 and REQ-009 fix eligibility at manifest signing, and QV-ADR-015 makes a pinned `roll.root` the roll. A key outside the pinned roll should be refused, and the pinned roll should be committable.
- **Why it needs a decision:** the correction touches registration and roll semantics next to the held registration contract (B3-01). Options include refusing registrations for keys outside a pinned roll, checking `roll_commit` against the manifest only in pinned mode, or adding a signed voter-removal route. None is chosen here.
- **Required regression test:** the two cases in the proof of concept, turned green by the chosen rule, plus a control showing the unpinned mode is unchanged.

### S1-02: a published test ballot's ciphertexts can then be cast and counted

- **Where:** `packages/server/src/election.ts` (ballot admission). Admission already refuses a spoil that reuses the ciphertexts of an admitted cast (CP-01/TR-01). It does not refuse the reverse order.
- **Attacker position:** any registered voter, acting on their own ballot.
- **Reproduction:** copy [poc/s1-spoil-then-cast-rewrap.repro.ts](poc/s1-spoil-then-cast-rewrap.repro.ts) to `packages/server/test/` and run `node --test packages/server/test/s1-spoil-then-cast-rewrap.repro.ts`. Observed on 2026-11-11:
  - Spoil with a published reveal of ciphertexts C under one ballot code: `201`.
  - Cast of the same ciphertexts C under a different `supersedes`, hence a different code: `201`.
  - Control, cast first and then spoil the same ciphertexts: `422 E_SPOILED_CODE_CAST`.
  - The counted cast carries the ciphertexts whose opening is already public in the log.
  - `verifyElection`: verdict `PASS`, the voter is counted with that code, `chk.benaloh.spoiled = fail`, finding `E_SPOILED_CODE_CAST` of class ALARM.
- **Expected:** QV-16 sections 5.13.2 and 5.13.3 and QV-07-REQ-072: ciphertexts that were spoiled as a test ballot are never cast.
- **Impact:** the tally is still computed correctly and the verdict stays PASS. One voter can make every verification report for the election show a failed check and an alarm, and can publish a verifiable opening of their own counted ballot. Coercion resistance is a documented non-claim, so the second effect weakens a property the project does not promise; the first is a cheap way to cast doubt on a valid election.
- **Proposed correction:** at admission, refuse a cast whose ElGamal `a` values match those of an admitted spoil, mirroring the existing check for the other order. This changes no vector, label or verifier rule.
- **Required regression test:** the proof of concept, asserting `422` for the second submission, with the existing cast-then-spoil control unchanged.

### S3-01 and S3-02

See [s3-confidentiality.md](s3-confidentiality.md). Proofs of concept: [poc/s3-timestamp.repro.ts](poc/s3-timestamp.repro.ts) (copy to `packages/web/test/`) and [poc/s3-spoil-rewrap.repro.ts](poc/s3-spoil-rewrap.repro.ts) (copy to `packages/protocol/test/`; it passes, confirming the earlier CP-01/TR-01 fix holds).

One caution on S3-01: rounding the client timestamp down to the minute can place a ballot cast in the first minute after opening before `opens_at`. The fix needs the window check and the rounding direction considered together, with a boundary test.

## Defects reported by the inventory sweep

These came from read-only inventory work, not from the review lanes. Each is described with a location in the linked file. None was fixed in this cycle.

| ID | Summary | Source |
|---|---|---|
| D-A | `qv-trustee keygen` with stdin closed exits 13 ("unsettled top-level await"); keygen asks for a typed passphrase only once | [trustee-cli.tasks.md](../../reports/inventory-20261111/trustee-cli.tasks.md) |
| D-B, D-C | The `audit-close` and `tally-share` records the trustee tool handles do not match the shapes the server accepts; needs the protocol owner to say which is normative | same file |
| B2-12 | Imported and keyless archived elections sign duplicate-submission receipts with a zero-seed key; the approved interim fix is not implemented | [ledger.findings.md](../../reports/inventory-20261111/ledger.findings.md) |
| QV-20-REQ-009 | Manifest validation does not reject a roll smaller than 3 and warns below 8, not 10. The decryption floor of 3 still refuses to tally such an election, so this fails late, not open. The specs disagree on the threshold | [crypto-protocol.tasks.md](../../reports/inventory-20261111/crypto-protocol.tasks.md) |
| QV-12-REQ-003 | Instance-admin keys are reported to act across organizations; not reproduced | [server.tasks.md](../../reports/inventory-20261111/server.tasks.md) |

The full lists, including lower-priority items, are in the `*.tasks.md` and `ledger.findings.md` files under [docs/reports/inventory-20261111/](../../reports/inventory-20261111/).
