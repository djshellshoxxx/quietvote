# Licence note

**Status:** draft, empty state (QV-ADR-027 N-08b, 2026-11-04). **Not legal advice. This wording has not had legal review.** [docs/25 §3.2](25-legal-compliance-licensing.md) asks counsel to confirm the dual-licensing text below, and that review is still outstanding. QuietVote is unaudited and not for real elections.

This file is referenced by [docs/25](25-legal-compliance-licensing.md) (§3.2 and the repository-files list). It records how the licensing decision in [QV-ADR-011](decision-log.md) is meant to apply. It adds no licence terms of its own.

## What applies today

- **Code:** GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). The full text is in [`LICENSE`](../LICENSE). QV-ADR-011 applies it to all code.
- **Specifications and documentation:** QV-ADR-011 records the decision to publish them under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. The CC BY-SA 4.0 text is not yet in this repository, and individual documents do not yet carry a licence notice.
- **Code inside documentation** (snippets, pseudocode, schemas): docs/25 §3.2 proposes dual licensing under CC BY-SA 4.0 and AGPL-3.0-or-later, at the reader's choice. **This is a proposal pending counsel review.** Until counsel confirms it, do not treat it as settled.
- **Attribution:** "QuietVote contributors", with a link to the repository (docs/25 §3.2).
- **Third-party material:** dependency licences are recorded by `scripts/licence-snapshot.mjs` and the dependency policy (docs/25 §3.1). This note does not change them.

## Open items

| Item | Owner | State |
|---|---|---|
| Counsel confirms the dual-licensing text for code in docs (docs/25 §3.2) | Project owner, external counsel | Open |
| Add the CC BY-SA 4.0 licence text or a licence notice for `docs/` | Project owner | Open (pending the item above) |
| Decide the policy for pseudonymous contributors under the DCO (docs/25 §3.3, QV-OQ-25-2) | Project owner, counsel | Open |
