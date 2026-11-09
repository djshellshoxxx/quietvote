# QuietVote integration checkpoint — 2026-11-09

**Review milestone: BLOCKED.** This continuation publishes decision-free repairs
and reviewed decision packets. It does not clear registration, strict verifier
comparison, external review, or release gates. QuietVote remains an unaudited
prototype, not for real elections.

## Candidate and ancestry

- Draft integration PR: [#30](https://github.com/djshellshoxxx/quietvote/pull/30).
- Branch: `codex/quietvote-milestone-20261109`.
- Main/base: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Cumulative implementation base: #28 `51851c10c5ac33cd89f05f9e0af44fd43b41b930`.
- #29 audit was merged with both parents retained in publication commit
  `d45238dbeb7e98f07b9241cd1786d188c3b5cadf`.
- First repair publication: `7cd207cfd14d0f2c881686e6696fec3da28a778c`, tree
  `248035920c1923bebb96699aa778de2dcf801b3e`, equal to local integration `cc7a8f2`.
- The PR records the latest exact publication head and its checks. This document
  cannot embed the hash of its own containing commit.

Native Git push lacked authentication. The connected GitHub API publishes DCO
signed commits with the linked author's identity; publication trees are checked
against local integration trees. Local worker commits are provenance, not claims
that those exact commit objects were pushed. No shared branch was reset, rewritten,
deleted or force-pushed. Main was unchanged; no release or deployment was made.

[Branch disposition](../reports/branch-disposition-20261109.md) records every
observed source ref. #22 → #25 → #26 → #27 → #28 is cumulative; #24 is included.
All older implementation/security branches are included. #2 and #21's obsolete
documentation stays deferred; #23 has the same tree as the signed #24 equivalent.
#29's unique audit document is included. Source PRs remain open.

## Changes and independent AI review

- **Server:** release reserved SSE capacity and runtime references when a peer
  disconnects before stream attachment. Real-HTTP regression failed before and
  passes after; healthy reconnect is checked. Worker source `535875b6`.
- **Web:** catch unreadable share files, abandon delayed reads after navigation,
  restore upload form after transient roll failure, and use the shared announcer
  without duplicate live regions. Five regressions failed before and pass after;
  all 210 web tests passed. Worker source `d8e6c119`.
- **CI:** action-pin regression coverage and its CI wiring are qualified in the
  companion CI report. Strict verifier comparison and required-browser behavior
  remain intact; no dependency or protocol vector changed.
- **Protocol/verifier:** evidence-only packets reproduce the registration failure
  and narrow the current parity blocker. No normative choice was implemented.
- **Claims:** removed one unsupported claim that the offline surface was audited.
  Historical evidence and the claims checker were preserved.

[Server/web review](../reports/integration-review-20261109.md) inspects the actual
diff and independently reruns six focused regressions. Registration was reviewed
against exact byte-producing source; a mistaken assertion about label NFC was
corrected before publication. Verifier review independently reran both historical
and current differential checks plus raw report pairs. These are AI peer reviews,
not external cryptographic approval or assistive-technology qualification.

## Verification and limits

Environment: Linux, Node `24.22.1`, npm `11.9.0`, Python `3.12.14`; dependencies
installed with `npm ci --ignore-scripts --no-fund` using the unchanged lockfile.

The preliminary local `npm run check` sweep passed 873 tests with zero failures
or skips (board 74, CLI 47, crypto 75, protocol 209, server 150, trustee 83,
verifier 25, web 210). Integration commits were applied during that sweep; it is
preliminary coverage, not an exact-head receipt. The final frozen-source receipt
and exact-head hosted results are recorded on PR #30.

Other executed checks:

| Check | Result |
|---|---|
| Production web build and scoped i18n | Passed |
| Python unit tests | 58 passed |
| TypeScript vectors | 412 passed, 0 failed; one unsupported DKG file not run |
| Python vectors | 229 PASS, 0 FAIL, 53 NOT-IMPLEMENTED |
| Strict verifier comparison | Exit 1: 27/27 verdicts agree, 3 reports differ in 17 fields |
| Lockfile lint | Passed, 35 registry entries and 8 workspace links |
| Dependency audit | Zero vulnerabilities reported |
| Licence snapshot | Completed; declarations do not establish legal approval |
| Required local Chromium verifier journey | Failed before assertions: process singleton socket denied with EPERM |
| Claims lint | Remaining historical findings are not suppressed; non-blocking workflow success is not a clean lint |

Hosted baseline [41876093966](https://github.com/djshellshoxxx/quietvote/actions/runs/41876093966)
passed eight Linux Node 22/24 shards, typecheck/supply-chain and browser jobs;
conformance failed at strict comparison. Those are #28 results, not final-candidate
results. PR #30 carries `ci:full-matrix` to request Windows/macOS/Linux × Node 22/24.
Queued, cancelled, skipped or unavailable jobs are not passes. No local non-Linux
coverage is claimed. Browser failure does not authorize weakening the browser gate.

## Open gates and next action

1. **Registration B3-01:** [decision packet](../reports/registration-decision-20261109.md)
   pins raw bytes, hashing, signatures, labels, storage and migration consequences.
   Existing records simultaneously claim approval and retain a hold. The current
   execution instruction preserves the hold. The web request still fails against
   the server; changing only its signature exposes the separate invite mismatch.
2. **Verifier D-92–D-94:** [decision packet](../reports/verifier-milestone-20261109.md)
   and [machine evidence](../reports/verifier-milestone-20261109.json) identify the
   three remaining cases. Nine of the historical twelve had already been repaired.
   Continuing after a signature failure, downstream not-run status and failed-rule
   result emission need reconciled authority; strict comparison stays failing.
3. **Qualification:** exact-candidate full matrix and required reviewer approvals
   must be assessed before any merge. Inherited protocol changes also require the
   repository's security review; passing ordinary unit tests cannot replace it.
4. **Other scope remains open:** import parsing/log verification still has synchronous
   work; authority/replay/high-water policies, offline verifier responsiveness and
   worker integrity, external cryptographic review, translations, manual accessibility,
   hardware and release governance remain incomplete. No completion percentage is inferred.

**Highest-value next action:** reconcile the owner/protocol approval record for
B3-01 and D-92–D-94 using these two packets, recording exact accepted semantics,
storage/migration rules and required security reviewers. Until then, keep PR #30
draft and preserve the failing gate.
