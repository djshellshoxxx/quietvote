# crypto-protocol: feature inventory (snapshot the ab84f16 snapshot)

QuietVote is unaudited and not for real elections. Statuses reflect source plus named tests only. Spec refs: QV-05 = docs/05-ballot-protocol.md, QV-16 = docs/16-crypto-protocol.md, QV-20 = docs/20-voting-methods.md. Test paths are under packages/protocol/test (P:) or packages/crypto/test (C:). Effort "unknown" where it cannot be justified.

| # | Feature | Spec ref | Implementation status | Verified by | Remaining requirements | Known defects | Dependencies | Security implications | Est. remaining effort | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ristretto255 point/scalar strict codecs, non-zero sampling | QV-16-REQ-001,002,003 | Complete | C:ristretto.test.ts; vectors primitives/ristretto | none | none | @noble/curves | Malleability and identity-point attacks | 0 | Invalid RFC 9496 encodings and scalars >= l rejected |
| 2 | Framed hashing with closed label registry | QV-16-REQ-004 | Complete | C:transcript.test.ts; C:cp08-fiat-shamir.test.ts | no static call-site lint (runtime throw only) | CP-08 test gaps partly closed by cp08 tests | #1 | Domain separation, Frozen-Heart class | 2-4 (static check) | Mutating any statement field changes challenge |
| 3 | QV-JSON parse and RFC 8785 canonicalisation | QV-16-REQ-005 | Complete | C:misc.test.ts; vectors primitives/encoding (23) | independent-serializer parity only via verifier-py | none | none | Signature and hash input ambiguity | 0 | 20+ vectors identical across implementations |
| 4 | Manifest validation, hash, roll Merkle root | QV-16-REQ-006,007; QV-20-REQ-009 | Partial | P:manifest-rules.test.ts | reject roll < 3, warn < 10 (currently accepts 0-2, warns < 8) | defect D1 below; X-14 manifest additions | #3 | Tiny rolls break ballot confidentiality floor | 2-4 | validateManifest rejects roll < 3 with E_MANIFEST |
| 5 | Exponential ElGamal ballot encryption | QV-16-REQ-011,013 | Complete | P:ballot.test.ts; C:proofs.test.ts | none | PoK/DLEQ nonces not hedged (X-20, OQ-7) | #1,#2 | Ballot confidentiality; hedged nonces | 0 | Valid ballot verifies; constant-RNG gives identical ballot for same plaintext only |
| 6 | CDS 0/1 proofs and selection-limit proofs | QV-16-REQ-011,012; QV-20-REQ-002,003 | Complete | C:proofs.test.ts; C:cp08-fiat-shamir.test.ts | none | CP-02 (cp-dec nonce hedge omits A,B) open, spec decision | #5 | Ballot validity; ballot copy resistance | 0 | Selection of 2, -1 or overvote fails E_CDS/E_LIMIT_PROOF |
| 7 | Voter ballot signature (strict Ed25519) and binder | QV-16-REQ-012,016 | Complete | C:cp08-ed25519-zip215.test.ts; P:ballot.test.ts#ballot copy | none | CP-04 fixed (torsion check) | #1 | Eligibility, copy attack | 0 | Non-canonical S, small-order A rejected |
| 8 | Revote selection (latest valid via supersedes chain) | QV-16-REQ-017; QV-20-REQ-010; QV-05-REQ-007 | Complete | P:verify.test.ts#revote chain; P:attacks.test.ts | property-based revote tests (spec asks) | none | log layer | Duplicate-vote prevention; one voter one count | 4-8 (property test) | Reordered log cannot make older ballot win |
| 9 | Duplicate ballot-code and voter limits | QV-16-REQ-015 | Partial | P:verify.test.ts; P:loglayer.test.ts#clash | duplicate-alpha detection across ballots not implemented (NOTES) | NOTES: duplicate-alpha not implemented | #8 | Ballot clash; RNG failure | unknown | Two voters' identical ciphertext first components flagged |
| 10 | Benaloh cast-or-spoil, private audit, publish reveal | QV-16-REQ-014,015,025; QV-20-REQ-011 | Complete (crypto); Blocked-decision for trustee-enable semantics | P:ballot.test.ts; P:attacks.test.ts#R-01 #15; web flow.test.ts | D-95 enablement enforcement at ballot level | CP-01/TR-01 fixed; D-95 held | #5 | Spoil must not expose a cast ballot | held | Spoiled code never counted; reveal reproduces ballot |
| 11 | Trustee spoil decryption mode | QV-16-REQ-025 | Complete (Should) | P:tally.test.ts#trustee-mode spoil | none | C8 fixed | #10 | Opt-in privacy trade-off | 0 | Valid CP proofs and equals reveal result |
| 12 | DKG (Feldman, commit-reveal, PoK, complaints) | QV-16-REQ-008,009,010 | Complete | P:dkg.test.ts; P:property.test.ts | statistical share-distribution test (spec) | CP-06 selective-abort bias (info) | #1,#2 | Joint key honesty; rogue key | 4-8 (stat test) | Q recomputable; \|Q\| < t aborts |
| 13 | Tally aggregation, partial decryption, Lagrange combination, BSGS | QV-16-REQ-018,019 | Complete | P:tally.test.ts; C:misc.test.ts | none | CP-02 open | #12 | Tally integrity; decryption oracle | 0 | Any t-subset yields identical counts |
| 14 | Tally rules: quorum, threshold, ties (integer) | QV-16-REQ-024; QV-20-REQ-005,006 | Complete | P:manifest-rules.test.ts; vectors rules | eligible/cast bases not implemented (X-18) | none | #4 | Result correctness | 0 | Boundary cases exact |
| 15 | Privacy floor (min counted ballots) | QV-20-REQ-009 | Partial | P:attacks.test.ts#R-01 #18; P:tally.test.ts | see #4 | D1 | #4 | Small-group leakage | see #4 | Trustee refuses below floor |
| 16 | Voting methods yes-no, single, approval, k-of-n | QV-20-REQ-001 | Complete | P:e2e.test.ts; P:verify.test.ts; vectors elections | naming differs from spec (X-18) | none | #5,#14 | n/a | 0 | Each method builds, validates, tallies, verifies |
| 17 | Ranked (Schulze/Ranked Pairs), weighted, delegation, beacon tie-break | QV-20-REQ-020,021,030,040-042 | Missing (deferred Phase 2) | manifest-rules.test.ts rejects ranked, beacon, non-uniform weights | all | none | D-05, D-15, D-20 | Ranked needs crypto review | unknown | Not required for v1 |
| 18 | Election verification algorithm (Appendix C) | QV-16-REQ-020; QV-05-REQ-010 | Partial | P:verify.test.ts; P:vectors.test.ts | V13 control-entry effect; coverage of every C step by a mutant | V13 not implemented; D-92..D-96 held | #8,#13 | Final integrity check | unknown | Each Appendix C step has a failing artifact with its code |
| 19 | Log layer (receipts, tree heads, witnesses) | QV-05-REQ-004; QV-16 App C step 11 | Complete (protocol side) | P:loglayer.test.ts | mmd latency test | none | board | Split-view, drop/reorder | 4-8 | Receipt and head checks detect fork |
| 20 | Share cipher, bundle cipher, trustee key custody | QV-16-REQ-022 | Partial | C:bundle-cipher.test.ts; trustee custody tests | log-scrub test; secret scalar types | NOTES: no wipe/secret types | trustee | Key leakage | unknown | Secrets absent from logs under test |
| 21 | Test vectors v1 | QV-16 App B | Partial | P:vectors.test.ts | status candidate; unsigned; mutants from 3-voter election only; no scale/edge-ties sets | NOTES Known gaps | verifier-py | Conformance | unknown | Independent impl reproduces all vectors |
| 22 | AuthScheme abstraction | QV-16-REQ-023 | Missing | none | interface + mock scheme test | none | none | Future phases only | unknown | Mock second scheme passes ballot/tally tests |
| 23 | Error code contract (QV-05 section 9) | QV-05-REQ-012 | Partial | none | map or emit section 9 codes; contract test | none | server | API stability | 4-8 | Contract test pins mapping |
| 24 | Algorithm agility (proto versions) | QV-05-REQ-016 | Partial | P:manifest-rules.test.ts#unknown proto | multi-version path (only qv1 exists) | none | none | Version confusion | unknown | n/a until second proto exists |

## Voting methods actually implemented and tested

| Method | Implemented | Tested |
|---|---|---|
| yes/no | yes | yes (sim election, e2e, vectors) |
| single-choice | yes | yes |
| approval | yes | yes (small-approval-20v vector) |
| k-of-n | yes | yes |
| ranked (Schulze/Ranked Pairs) | no, specified Phase 2 | rejected by schema |
| weighted | no, roll weights pinned to uniform | rejected by schema |
| delegated | no | no |

Beacon tie-break is rejected by manifest validation in v1. Spec 20 shape: `eligible` threshold basis and `abstain` options are not implemented.
