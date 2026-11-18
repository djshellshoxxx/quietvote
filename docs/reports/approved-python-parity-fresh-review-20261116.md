# Fresh review of approved Python parity — 2026-11-16

Reviewed source: `81287168d1683e9fc4453727a9de3f7ca7c295e5`.
Repair and independent regressions: `e542f3b5473df0a8c719e609b80f651fd6fbbfa7`.
The reviewer used a separate worktree and read the accepted ADR-027 register's
B1-02, B1-07 and narrow, source-backed B1-08 decisions. The implementation lane's
181-test full-suite receipt is separate; this review does not add overlapping
counts or claim final integrated/release qualification.

## Finding and repair

**Fixed: identity DH statements in retained rejected share packages.** The new
complaint processing correctly retains actual shares from a dealer already
excluded in round 2. That made an older missing proof guard reachable: Python
accepted a mathematically satisfied DH-reveal proof with identity `R` and `S`.
A package containing identity `R` was already invalid, but its otherwise valid
encrypted share could make the verifier classify the accuser's complaint as
false and remove that accuser too. TypeScript's existing `dhVerify` explicitly
rejects identity `E`, `R` and `S`.

An independently generated four-trustee, threshold-two transcript used the
Python test fixture's known test-only scalars to create the actual share
ciphertext and DLEQ proof. Before repair, Python returned `Q=[3,4]`; unchanged
TypeScript returned `Q=[2,3,4]`. The repaired Python primitive rejects all three
identity statement points before checking the equations. Both programs now
return `Q=[2,3,4]` and the same independently recomputed context:

```
71f0fffee63350a02993a9a719d374811ec4587dcbad360870ae9e3253e98641
```

The new regression constructs the malformed package and proof at runtime; it
does not mock the cryptography or read an expected result file. It also compares
the resulting key/context with the same transcript without the rejected
complaint. A second computed primitive case covers a zero encryption secret.
The immutable vector corpus and TypeScript production source are unchanged.

## Other reviewed boundaries

- Nullable finding checks do not erase fatality. A distinct later tally body
  remains FAIL under both default and content-only callers while the first
  tally's decryption check can correctly remain passed.
- An identical tally with a bad convenience signature remains a visible
  duplicate without changing counts/results; default missing evidence still
  yields INCOMPLETE.
- A later correctly signed opening cannot replace the first authenticated
  opening's invalid roll binding. Missing authenticated closing evidence cannot
  hide an independent fatal log-order finding.
- Invalid complaints against an already excluded dealer remain ignored;
  ordinary false/valid complaints, phase cutoffs, timely equivocation, exact
  repeats and the earlier-vote/excluded-latest rule retain their existing
  regression coverage and paired-reference outcomes.
- Count quorum, strict threshold equality, non-equal thresholds and zero-base
  behavior were exercised with independent exact examples.

No further blocker was found within the reviewed delta. This is an automated
implementation review, not independent professional cryptographic review.
The implementation handoff's remaining B1-08 distinctions, trustee-mode spoil
cryptography, D-95 and newer control semantics remain separate work.

## Executed checks

| Check on repaired source | Result |
|---|---|
| Fresh Python review module | 8/8 passed, 3.674 seconds |
| Existing Python protocol/complaint module | 15/15 passed, 3.099 seconds |
| Implementation's Python semantic regressions | 12/12 passed, 10.416 seconds |
| Paired TypeScript reference regressions | 13/13 passed, 3.960 seconds |
| Existing Python corpus | 282 PASS, 0 FAIL, 0 unsupported; all 79 file hashes match |
| Generated identity-R cross-verifier probe | Exact qualified set and context agree after repair |

From `verifier-py/`, the Python commands use
`python3 -I -m unittest discover -s tests -t . -p <module.py>` with
`test_approved_parity_fresh_review.py`, `test_protocol.py` and
`test_approved_semantic_parity.py`. From the root:

```sh
node --test --test-reporter=spec packages/protocol/test/approved-semantic-parity.test.ts
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet
```

Retained local log SHA-256 receipts:

| Log | SHA-256 |
|---|---|
| Fresh Python review | `fdebcea1d4bccbc2098cb4e6976eead2823441301a923309193de05a011385b7` |
| Existing protocol | `c4d67fdbcfd74b5b3026fc65b0461f8222377e42a3fbe2bb3ab2be5a62774f03` |
| Paired TypeScript | `ca0ae38b34635232b318a6ff7d0bef2beacf88059d7296e29d422023e2c50576` |
| Python corpus | `6e8e8fae9c854caa792c2758aedaab409874cf71cf909c8313832dd12b3ea4ee` |

Integrator handoff: apply the repair after `8128716`, inspect the six-line proof
guard, and run final combined qualification at the eventual integrated source.
Do not present the earlier 181-test implementation pass as covering this repair.
