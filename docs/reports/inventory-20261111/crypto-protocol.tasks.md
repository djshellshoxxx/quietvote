# crypto-protocol: bounded decision-free tasks (most important first)

1. Reject rolls below 3 in validateManifest (voting correctness, confidentiality). Files: packages/protocol/src/manifest.ts, test/manifest-rules.test.ts. Check: validateManifest(m, 0..2) returns E_MANIFEST; roll 3 still ok. 1-2 h. No decision needed: QV-20-REQ-009 states the rule. Warning threshold (spec 10 vs code 8) needs care: add W-SMALL-ROLL at < 10 only if existing vectors do not change; otherwise report.
2. Property tests for revote chain (duplicate-vote prevention). Files: test/property.test.ts. Check: random sequences with shuffles never count an older ballot or two ballots for one voter. 4-6 h. Test-only.
3. Cross-voter duplicate-alpha detection test (tally integrity). Add a failing-first test documenting NOTES gap in test/attacks.test.ts or a .repro.ts; implement only if no schema change. 3-5 h. Reporting-only if it alters verdict semantics.
4. Appendix C coverage matrix test: for each chk.* id, assert a mutant vector fails it. Files: test/vectors.test.ts (read-only use of vectors). Check: list of unreached check ids is empty or explicitly allow-listed. 4-8 h. Test-only; adds no vector.
5. QV-05 section 9 error-code mapping contract test. Files: new test in packages/server/test. Check: every section 9 code maps to a QV-16 reason. 3-5 h. Test-only (does not change codes).
6. Ballot size and validation timing benchmark for 10x10 selection (QV-05-REQ-015). Files: packages/protocol/bench, test/bench-smoke.test.ts. Check: reports bytes and p95 ms; no threshold change. 3-4 h. Measurement only.
7. Trustee-side t-1 statistical share-distribution test for DKG (QV-16-REQ-008). Files: test/dkg.test.ts. 4-8 h. Test-only.
8. Static lint test that no non-crypto package imports @noble or hand-rolls hashes besides allowlist (QV-16-REQ-021). Files: new test under packages/crypto/test. 3-4 h. Allowlist records current node:crypto use rather than changing it.
9. Log-scrub test: run a DKG/tally sim with a log sink and assert no secret hex appears (QV-16-REQ-022). Files: packages/trustee/test. 4-6 h. Test-only, synthetic keys.
10. Ballot-object immutability test after code display (QV-16-REQ-014). Files: packages/web/test/flow.test.ts. 2-3 h. Test-only.

## Suspected defects (not fixed)

* D1 packages/protocol/src/manifest.ts:139-141 (and 54): validateManifest accepts roll size 0, 1, 2 when privacy_ack is true (probe run: all four sizes ok). Repro: validateManifest(buildManifest(...voters 10), 1) with privacy_ack=true. Violates QV-20-REQ-009.
* D2 packages/protocol/src/manifest.ts:136: small-roll warning fires below 8; spec says warn below 10. Repro: roll size 9 returns no W-SMALL-ROLL.
* D3 NOTES: duplicate-alpha detection across ballots not implemented (only identical codes by different voters flagged at packages/protocol/src/ballotlog.ts:175).
* D4 packages/protocol/src/verify.ts: verifier uses BSGS (tally.ts:125-137) rather than checking M*G as QV-20-REQ-007 describes; fine for V <= 2^20 uniform weights, wrong cost model for weights.
* D5 packages/protocol/package.json does not declare @quietvote/crypto (NOTES Mismatches); works only via workspace symlink.
