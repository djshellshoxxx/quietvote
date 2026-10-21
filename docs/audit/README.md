# QuietVote audit and QA index (2026-10-21)

**These are AI-assisted reviews. They are NOT an independent professional audit and give no assurance of security. QuietVote is unaudited and not for real elections.**

Per-scope reports live on the stacked audit PRs (ID, severity, evidence, remediation and verification status are inside each):
`dependencies.md` and `board-cli.md` (PR board-cli), `crypto-protocol.md` (CP + second-wave P/C), `server.md` (SRV), `trustee.md` (TR), `web-verifier.md` (WV) and `web-second-wave.md` (W). Severities from sub-agent haiku audits (P/C/W/TSV) were re-verified by a failing test or PoC before any fix; items that did not reproduce are said so in the reports.

## Totals (from the reports; info items are approximate)

| Severity | Fixed (with regression test unless noted) | Open / partial |
|---|---|---|
| critical | 0 | 0 |
| high | 4 (SRV-001 unauthenticated crash; W1 post-send 5xx treated as rejected; W2 receipt head not checked against pin; W5 unsigned tally accepted by web) | 0 |
| medium | 18 | 4: P1/TSV-05 PASS without board log evidence (spec-owner decision), DEP-02 no CI supply-chain gates, BC-02 witness policy default still the bundle's own (`--witness-policy` added), W7 partly (UI-only) |
| low | 32 | 7: DEP-01, TR-03/04/05, CP-02 (dec-nonce hedge vs QV-16 registry, spec deviation), CP-05, W15 (SRI on lazy chunks needs an import map vs hash-pinned CSP) |
| info | several | about 30 noted (see reports) |

## Gap list (v1 completeness)

Closed in this wave: `spoil-share` record + `collectSpoilShares` (protocol); `auditSpoil` + QV-10/QV-34 private-audit vectors; server endpoint/storage/tally inclusion for trustees-mode spoils (the verifier already checked `tally.spoiled[].shares`); re-wrapped-spoil rule (CP-01/TR-01) in the log analysis and the trustee relay.

Still open (precisely): no coordinator CLI/web command that gathers trustee `spoil-release` packets and POSTs them to `/spoil-shares` (server endpoint and trustee CLI exist); web UI for trustees-mode spoil results; P1 verdict semantics without `opts.log`; V13 control entries (`pause/resume/invalidate`) not interpreted; CP-02/C2 nonce binding needs a QV-16 decision; TR-03 (one-shot release re-arm via backup restore, no lock), TR-04, TR-05; DEP-02 CI gates (`npm audit`, lockfile lint); Playwright e2e and browser a11y runs not executed here; translations remain unreviewed (none marked reviewed).

## Test state

Integration of all audit PRs on top of base `claude/quietvote-complete-1` (fdc552a): typecheck clean; board 74, cli 38, crypto 57, protocol 187, server 136, trustee 69, verifier 23, web 128 = 712 tests, 0 failing (run locally, node 22). The same base without the audit PRs: 622 tests (board 61, cli 29, crypto 49, protocol 172, server 121, trustee 65, verifier 20, web 105). The 22-voter server HTTP e2e failed once under CPU load (ECONNRESET class) and passed alone; not proven a flake against a baseline. CI matrix (node 22/24 x ubuntu/macos/windows) was red on stacked PRs because of failures inherited from the pre-complete-1 base; see each PR.

## Honest limits

No independent second implementation of the vectors; no external cryptographer review; constant-time claims are those of `@noble/*`; JS cannot reliably wipe secrets; `bundle-cipher` is custom AES-GCM/scrypt, not age (QV-17 REQ-021 unmet).
