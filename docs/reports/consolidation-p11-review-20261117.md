# P11 Python verifier candidate — independent review

Reviewed exact commit `19983c6c28e421fcf7050bde2e0c578ab1df397f`, tree `2aeae6b60d62534418ff249464736648fe12aa5f`, parent `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`, in `session-evidence/quietvote-py-decrypters` on 2026-11-18 UTC. The worktree was clean before and after review. This receipt is an independent AI source review with focused execution, not a formal approving review or security-reviewer-group approval.

## Result

No blocking issue was found in this narrow candidate. Its only production change replaces a diagnostic note about an inconsistent published decrypter list with a fatal `E_DEC_PROOF` finding on `chk.tally.decrypt`. The independently reconstructed decrypter set, proof equations, aggregate calculations, scalar/point validation, tally schema, corpus bytes, and result evaluation remain unchanged. The new test file is the only other changed file. The commit has an author-matching local DCO trailer and `git diff --check HEAD^ HEAD` passes.

The canonical parent still has the historical P11 Python acceptance discrepancy. This candidate-only conclusion does not say that canonical integration or main has been repaired.

## Contract and control-flow evidence

- `docs/16-crypto-protocol.md:75`, QV-16-REQ-019, requires the verifier to recompute every tally-record field. Section 5.19.1 at line 765 says the published decrypter list contains all `T_valid` members, not merely the canonical threshold subset `S`. Section 5.17 at line 718 defines `T_valid` by valid shares for every contest/option and derives `S` deterministically.
- `verifier-py/qv_verifier/election.py:696–716` still constructs `T_valid` from the qualified trustee set and independently verified share proofs. The published list does not choose the decryption set. The change at lines 720–722 makes inconsistency a fatal finding rather than a note.
- The existing failure gate at `election.py:753–754` stops rule evaluation after any failed tally-decryption check. The only result assignment is later at line 763. Thus the mismatch cannot publish a result merely because the underlying share equations and totals remain valid.
- `election.py:239–261` reports the affected named check as failed and gives any fatal finding precedence over `INCOMPLETE` and content-only acceptance. The trusted caller's `allow_no_log` option does not suppress the new finding. Log verification does not clear existing findings.
- `verifier-py/qv_verifier/recordfields.py:12–13,60–62` still requires actual integer list elements in the existing range. Python's equality of booleans and integers cannot create a bypass through the accepted record schema.
- The existing TypeScript implementation already treats a different published list as fatal `E_DEC_PROOF`: `packages/protocol/src/verify.ts:605–607`. Its result gate at lines 621–626 also withholds results. The existing P11 regression is in `packages/protocol/test/second-wave.test.ts:124–135`.

The Python change continues computing bounded public tally counts after recording this mismatch and stops before rules/results at the existing gate. It does not introduce a new early-exit dependency or change which shares are verified. This is consistent with the existing handling of published count mismatches.

## Independently executed focused checks

From the candidate's `verifier-py` directory, Python 3.12.14:

```sh
python -m unittest discover -s tests -p test_tally_decrypters.py -v
```

Result: **2 tests passed**, zero failures, in 2.730 seconds. The first test retains the existing honest content-only PASS and result with decrypters `[1,3]`. The second has six subcases: three well-formed membership mismatches, each in default and content-only mode. Every subcase confirms that schema validation and aggregate verification succeed, the decrypt check fails with a fatal `E_DEC_PROOF`, rules are `not_run`, and no results are returned. The ordinary fixture's share proofs are unchanged, so rejection is not attributable to malformed proof inputs. The tally signature is already a convenience diagnostic in this verifier; the test intentionally checks recomputation rather than signature dependence.

Execution log: `p11-focused-final.log`. SHA-256: `3d2c146c5d78fe2ea3d82174a10d52773ab6db2abc30c736581de8363a9b041b`. Exact command, source/tree/parent, interpreter, timestamp and clean-worktree observation are in `p11-review-receipt.json`.

## Limits

I did not independently rerun the full Python suite, all vectors, or the TypeScript suite for this delta; those broader execution receipts belong to their running workstream. I also did not rerun the reported baseline failing subcases. The focused test uses the existing standard election fixture and covers membership discrepancies, not every ordering/duplicate/threshold combination or board-evidence mode. The existing direct equality and fatal-verdict/result gates were inspected for the broader behavior. No assertion, timeout, test budget, expected corpus result, or production source was modified by this review.

This review does not satisfy the required human/security review gates for a verifier behavior change and does not establish election or production qualification.

## Final documentation follow-up binding

The review now also covers exact final commit `20a1932c109a773bf2944f6c58e621c73cb9e856`, tree `311b4a68e8c41957470cfa43a7cd37f835ddce69`, whose parent is the independently executed `19983c6` candidate. The entire intervening diff changes only `docs/16-crypto-protocol.md:765`: one sentence states that a published-list mismatch is fatal `E_DEC_PROOF`, fails `chk.tally.decrypt`, and withholds outcome results. That sentence accurately describes the reviewed implementation and existing TypeScript P11 behavior; it does not change how `T_valid` is computed, the published format, or the treatment of individual invalid shares.

No blocking issue was found in this documentation delta. All runtime and test files are byte-identical to the executed parent, verified from the exact Git diff. The worktree remains clean and the diff check passes. The original focused 2/2 execution receipt remains attached to its actual executed parent rather than being relabeled as a new final-head run. No broad retest was needed or performed. The parent workstream separately reports full Python 223/223 passing on `19983c6`; this is attributed evidence, not a duplicate execution by this reviewer. The final binding and source-equivalence observation are appended to `p11-review-receipt.json`.

All earlier coverage limits and outstanding human/security review requirements remain in force for this final tree.

## Publication note

Session-evidence paths and bare execution-log names identify intermediate evidence outside this repository. This report preserves their exact source, commands, results and available hashes; they are not repository download links. New candidate PRs and current hosted-CI status are recorded in the [current reconciliation](consolidation-current-recheck-20261117.md). Original canonical statuses remain bound to their stated SHA.
