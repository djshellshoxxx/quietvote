# S3 — Ballot confidentiality, vote-to-voter linkability, and secret custody

Independent adversarial review (AI-assisted; **not** an independent professional audit). QuietVote is unaudited and not for
real elections. Worktree: `the s3-confidentiality review worktree`. `npm ci --ignore-scripts --no-fund` run first (exit 0).
I wrote none of this code and modified no existing file; the only additions are two `*.repro.ts` PoCs.

Scope: ballot confidentiality, vote↔voter linkability, secret custody, decryption oracles, metadata, retention — judged
against QV-06, QV-07 §6/§11, QV-16 §5.11–5.16, QV-17, QV-19 §5–6, QV-26, claims-register-v0. Prior audits
(`docs/audit/**`, `packages/*/NOTES.md`) were grepped by topic before reporting.

## Findings by severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 1 (S3-01) |
| Info | 1 (S3-02) |

No new Medium+ confidentiality defect was found. The documented single-party decryption oracles (tally release, spoil
release, private audit, fire drill) each held against every bypass I attempted (see "Attacks correctly refused"). The
known CP-01/TR-01 re-wrapped-spoil break is **confirmed fixed** (PoC below, passes).

---

### S3-01 (Low) — Ballot entries carry second-precision voter timestamps on the public board; spec and privacy notice promise "to the minute"

- **file:line:** `packages/web/src/flow/ballot-controller.ts:73-74` (`now()` → `Math.floor(Date.now()/1000)`),
  `packages/web/src/flow/entries.ts:32` (`createdAt: i.now`), `packages/board/src/entry.ts:66-68` (createdAt is `u64` in
  the signed, published header). Spec: `docs/06-privacy-data-lifecycle.md:78` ("log entries for ballots carry timestamps
  rounded to the minute"), `:211` (privacy notice: "when you voted (**to the minute**)"), QV-06-REQ-009 (§11),
  QV-18 `created_at … clients may round to the minute (default)`.
- **Attacker position:** any member/observer who can read the election log or an export/mirror (QV-18-REQ-046: the board
  export is available to anyone without authentication; D13 log entries are permanent and non-erasable, QV-06 §5). No
  network position needed — this is broader than the "network observer sees timing" non-claim (N-7).
- **Reproduction:** `packages/web/test/s3-timestamp.repro.ts` →
  `node --test packages/web/test/s3-timestamp.repro.ts`. Observed:
  `controllerNow = 1794407849  entry.createdAt = 1794407849  createdAt % 60 = 29` (test passes: the published timestamp
  equals the raw second count and is not minute-aligned).
- **Expected:** per QV-06 §4.3/§10.3 and QV-18, a ballot entry's client timestamp is rounded to 60 s by default, so the
  log reveals casting time only to the minute (R2/M4 mitigation against "I just voted" correlation and timing
  fingerprints, QV-18 §453). Members are explicitly told they are visible only "to the minute".
- **Actual:** the client writes `createdAt` at 1-second precision; it is covered by the voter signature, hashed into the
  board leaf, and published verbatim. Every ballot on the permanent public board is pinned to the voter's public key with
  a 1-second casting time.
- **Root cause:** `BallotController.now()` and `publish.ts:128,219` default to `Math.floor(Date.now()/1000)` with no
  minute rounding; `prepareEntry` passes it straight into the header. Nothing downstream can round it (the server cannot
  change `createdAt` without breaking the voter signature; QV-18 §193 treats it as advisory and accepts it as-is).
- **Proposed correction:** round the ballot/`ballot_audit` entry clock to 60 s at the client, e.g. default
  `now()` to `Math.floor(Date.now()/60000)*60` for voter-path entries (the STH already carries the precise server time
  for close verification, so coarse voter-claimed time loses nothing). Keep organizer/ceremony entries as-is if finer
  time is wanted there.
- **Required regression test:** a web unit test asserting a cast/`ballot_audit` entry built through the controller path
  has `createdAt % 60 === 0`; and a verifier/board test that a non-minute-aligned ballot `createdAt` is flagged or that
  the client never emits one. (Mirror of `s3-timestamp.repro.ts`, asserting the rounded value.)
- **User-facing wording to flag (per brief):** the privacy-notice template text `docs/06-privacy-data-lifecycle.md:211`
  ("when you voted (to the minute)") and the design rule `:78` promise minute granularity that the client does not
  deliver. The web guarantee string `packages/web/src/i18n/en.ts:93` (`qv.privacy.public`) is vaguer ("that you voted,
  when, and your ballot code") and is not itself an over-claim, but the generated notice derived from §10.3 is.
- **Relation to known items (not re-reported as new):** the *server-assigned* sequencing time is a separate, already-noted
  spec gap — `docs/audit/2026-10-28/B2-quietvote-server-board.md` **G-16** (QV-26-REQ-044 / QV-06-REQ-009 vs
  `sequenced_at`). I confirm it at the code level: `packages/server/src/electiondb.ts:26,215,220` stores per-entry
  `received_at` at **millisecond** precision (`Math.round(e.sequencedAt*1000)`) and the receipt/STH carry it to the
  second (`packages/board/src/log.ts:127,141`), against QV-26-REQ-044 ("shall not store per-ballot arrival time beyond the
  epoch, in-memory only"). S3-01 is distinct: it is the **voter-claimed `created_at` in the public board header**, which
  G-16 (about `sequenced_at`) does not cover. Also distinct from B2-16 (server *request logs*, now minute-rounded).

---

### S3-02 (Info / unverified-hypothesis-adjacent) — `collectAlphas` omits placeholder ciphertexts in the re-wrap guard

- **file:line:** `packages/protocol/src/ballotlog.ts:192-203` (`collectAlphas` iterates `c.sel` only, not `c.ph`), used
  by the re-wrap exclusion at `ballotlog.ts:131,139-152`. Contrast `packages/trustee/src/trustee.ts:797-799`
  (`releaseSpoil`'s `addA` iterates `[...ct.sel, ...ct.ph]`).
- **Impact:** the protocol-level CP-01 re-wrap guard (`analyzeBallotLog` / `verifyElection`) only compares real-option
  `alpha`s, so a spoil that reuses **only a cast ballot's placeholder** ciphertexts (fresh real-option ciphertexts) would
  not trip `E_SPOILED_CODE_CAST` there. **Not exploitable end-to-end:** the only party holding a share is the trustee, and
  `releaseSpoil` independently checks placeholder `alpha`s (`CIPHERTEXT_WAS_CAST`) and refuses, so no real decryption
  shares are ever produced; a coordinator cannot forge shares (verifier `decryptSpoiled` checks the proofs). Placeholder
  plaintext is also low-signal (it reveals selection *count*, not choice). Reported as a defense-in-depth gap only.
- **Proposed correction:** make `collectAlphas` include `c.ph` so the protocol guard matches the trustee guard.
- **Required regression test:** an `analyzeBallotLog` test where a spoil reuses a cast's placeholder `alpha`s is excluded
  with `E_SPOILED_CODE_CAST`.

---

## Verification of the known CP-01 / TR-01 re-wrapped-spoil fix (brief: "verify the fix holds")

- **PoC:** `packages/protocol/test/s3-spoil-rewrap.repro.ts` →
  `node --test packages/protocol/test/s3-spoil-rewrap.repro.ts`. **Result: passes** (`pass 1 / fail 0`). Output:
  `cast counted: 4f97155c3a74  rewrap excluded: true  fresh spoil admitted: true`.
- It builds a counted cast ballot, re-wraps the identical ciphertexts + voter-bound proofs as a **trustees-mode** spoil
  changing only `supersedes` (→ different ballot code, as in the original CP-01), and confirms `analyzeBallotLog`:
  (a) keeps the cast counted, (b) **excludes** the re-wrapped spoil from `an.spoiled`, (c) raises ALARM
  `E_SPOILED_CODE_CAST` and fails `chk.benaloh.spoiled`, while (d) a freshly-encrypted trustees-mode spoil by the same
  voter is still admitted (the guard is ciphertext-specific, not a blanket refusal).
- Defence confirmed at two layers: `analyzeBallotLog` (`ballotlog.ts:131,139-152`, real-option `alpha` reuse → exclude)
  and the trustee relay (`trustee.ts:789-822`, `BALLOT_WAS_CAST` / `CIPHERTEXT_WAS_CAST`, incl. placeholders; plus the
  `verifiedElection` log-evidence gate so a dropped cast cannot hide the reuse — `hardening.test.ts` T1).

---

## "Who can learn what" — derived from the code

Secret = the voter's *choice*. Phase-1 participation (who voted, when, how many times) is public **by design** (N-4).

| Party | Can learn (code citation) | Cannot learn |
|---|---|---|
| **Voter** | Own choice; own `xi` (memory, zeroed after cast — `ballot-controller.ts:173,256-263`); own receipt. | Others' choices. |
| **Other voters / any board reader** | Every voter pk; each ballot's ciphertexts, proofs, code; **casting time to the second** (S3-01, `entry.ts:66-68`) and revote count; the tally. **Not** any individual choice (ciphertext hidden; `ballot.ts:73-106`, exp-ElGamal). | Any individual plaintext without ≥t trustees. |
| **Organizer / steward** | All public board data; labels (C1). "Organizers cannot see how anyone voted … by design" (`en.ts:383` `qv.org.nopeek`). No trustee shares (QV-07-REQ-010). | Any individual choice; partial results. |
| **Operator** | All stored ciphertext/public data; DB `log_entry.received_at` at **ms** precision (`electiondb.ts:26,215`, = G-16); encrypted invite label/contact under DEK (`kek.ts`), purged after retention (`retention.ts`). No IP/UA persisted (`logger.ts:30-33`, allowlist). | Plaintext ballots; trustee shares; voter keys; persisted IPs. |
| **Single trustee** | One partial-decryption *share* per aggregate/spoil (needs t to combine); the fire-drill decrypt of a known test ciphertext only (`trustee.ts:73-76,607-624`). | Any ballot plaintext alone (`decryptAggregates` needs `valid.length ≥ t`, `tally.ts:122`). |
| **Threshold (≥t) trustees** | The aggregate tally; and *could* decrypt individual ballots if they deviate from software — stated non-claim N-2 / QV-17 §3.3. | — (this is the trust assumption). |
| **Network observer** | That a device contacted the host, and timing/size (N-7; mitigated only via Tor). Ballot size is selection-independent (placeholders, `ballot.ts:44-45`). | The choice. |

## Attacks attempted and correctly refused (with the defending check)

1. **Re-wrap a cast ballot as a trustees-mode spoil to have trustees decrypt it (CP-01/TR-01).** Refused — `ballotlog.ts:139-152` + `trustee.ts:789-822`. PoC `s3-spoil-rewrap.repro.ts` (passes = refused).
2. **Copy voter A's ciphertext/proofs under voter B's key.** Refused — CDS/limit challenges bind `binder = H256("binder-roll"; ctx, voter_pk)` (`ballot.ts:32-34`, `proofs.ts:121-122,176`); B cannot forge A's binder and does not know `r`.
3. **Decrypt a 1-ballot / below-floor aggregate.** Refused — `trusteeDecryptTally` enforces `effectiveMinCounted` (default 5 if roll≥8 else 3; `tally.ts:45`, `manifest.ts:45-47`), `V=0` rejected (X-13); `releaseTally` → `PRIVACY_MIN` (`trustee.ts:754`).
4. **Pad the floor with copies of one ballot.** Refused — distinct-voter/distinct-code check (`tally.ts:42`, P2).
5. **Feed a coordinator-chosen ciphertext/aggregate to a trustee.** Refused — trustee recomputes aggregates from the verified log; `claimed` is only compared (`tally.ts:47-55`); no API accepts a ciphertext (`tally.test.ts` "no API accepts a ciphertext").
6. **Difference two aggregates over different counted sets from one trustee.** Refused — release-once with `RELEASE_CONFLICT` on a differing `counted_root` (`trustee.ts:741-744`), public release ledger adopted on open/restore (`ledger.ts`, `trustee.ts:169-254`), forked election log → `LOG_FORK` (`assertNoFork`, `trustee.ts:705-729`), log-evidence + witnessed-checkpoint gate (`verifiedElection`, `trustee.ts:634-699`). Documented residual (TR-03): an operator who deletes the ledger *and* the live bundle and restores an old backup — stated filesystem limit, needs a hardware counter.
7. **Operator/server decrypts.** Refused structurally — no trustee secret ever reaches the server (QV-07-REQ-010; server holds only a per-election DEK/KEK for stored *fields*, `kek.ts`, not ballot keys).
8. **Exfiltrate plaintext/randomness to the server.** Refused — cast body is ciphertext+proofs only; private/trustees spoil posts only `reveal_digest`; the reveal (xi+selections) is posted **only** on explicit opt-in publish-reveal (`ballot.ts:148-160`, `audit.ts:97-104`, `ui/app.ts:580`).
9. **Private-audit path as an oracle.** Refused — needs the voter's `xi`, held only on the voter's device (`audit.ts:24-29`, local package only).
10. **Fire drill as an oracle.** Refused — decrypts only `drillCiphertext(K, ctx)`, recomputed locally (`trustee.ts:73-76`).
11. **Retry/crash resend leaking correlated randomness.** Refused — retry resends the **same** signed bytes (idempotent, `ballot-machine.ts:207-209`, `ballot-controller.ts:145-151`); identical plaintext ⇒ identical ballot leaks nothing (QV-16 §5.11 P2); fresh `ρ`+`attempt` on a new seal.

## Unverified hypotheses (no PoC; stated as speculative)

- S3-02 placeholder-`alpha` omission (above): I reasoned it is not exploitable end-to-end (trustee covers `ph`); I did not
  build a multi-party trustee PoC to prove non-exploitability.
- CP-02/C2 decryption-nonce hedge not binding `(A,B)` (`proofs.ts:222`) is a **known** open item; I did not add a new
  repro (the existing crypto-protocol audit already carries one).

## What I did NOT review

- `packages/board` Merkle/checkpoint/witness-cosignature crypto internals beyond the entry header format; `verifier-py`.
- Server HTTP transport/SSRF/webhook internals (covered by the prior SRV audit); I did not re-run the server HTTP e2e.
- Live Tor/onion, TLS, reverse-proxy and OS/journald log configuration (QV-26 §5-§6) — operator-side, unverifiable here.
- Real browser / IndexedDB / Playwright behaviour, auto-lock timer suspension on mobile/Tor (B3-11, known-open).
- DKG mathematical correctness and `@noble/*` constant-time claims.
- Live backup/WAL restore drill and physical-media erasure (I read the retention/destroy code, not a disk drill).
- Whether CP-02 and S3-02 are exploitable beyond the reasoning given.

## Commands run

- `npm ci --ignore-scripts --no-fund` → exit 0.
- `node --test packages/protocol/test/s3-spoil-rewrap.repro.ts` → `pass 1 / fail 0` (CP-01 fix holds).
- `node --test packages/web/test/s3-timestamp.repro.ts` → `pass 1 / fail 0` (S3-01 confirmed).
