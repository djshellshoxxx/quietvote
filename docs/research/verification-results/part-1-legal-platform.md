# Verification results, part 1: legal/regulatory and runtime/platform

Date of check: 2026-10-21. Scope: the 117 table rows in `docs/plan/VERIFICATION-TODO.md` lines 8-133 ("Legal and regulatory" and "Runtime, platform and tooling").

Not legal advice. Legal rows record only whether a primary text was reached and what it says. Legal application, risk and sufficiency are for counsel.

Access limits: in this session the fetch tool could not resolve eur-lex.europa.eu, gnu.org, fsf.org, creativecommons.org, ietf.org / rfc-editor.org / datatracker.ietf.org, w3.org, sqlite.org, docs.github.com, developer.mozilla.org, slsa.dev, docs.sigstore.dev, spec.openapis.org, community.torproject.org, law.cornell.edu, ecfr.gov, csrc.nist.gov, nvd.nist.gov, disclose.io, eff.org, pnpm.io and eprint.iacr.org (DNS failure). Those rows are CANNOT-CHECK. Web search results were treated as secondary only and never as confirmation.

Edits: where a primary source confirmed the full tagged claim, the `[UNVERIFIED...]` tag was replaced with `[VERIFIED: <source>, 2026-10-21]` (the form already used in `docs/16-crypto-protocol.md:533`). Partial confirmations were not edited. The VERIFICATION-TODO entries were not changed (left for the orchestrator).

## Results

| Item (doc:line) | Claim | Verdict | Primary source URL | Note |
|---|---|---|---|---|
| 06-privacy-data-lifecycle.md:146 | GDPR Art. 17(3) exceptions | CANNOT-CHECK | https://eur-lex.europa.eu/eli/reg/2016/679/oj | eur-lex unreachable. Legal interpretation for counsel. |
| 06-privacy-data-lifecycle.md:274 | GDPR Art. 5(1)(e), 16, 18, 21, 22, 17(3) text | CANNOT-CHECK | https://eur-lex.europa.eu/eli/reg/2016/679/oj | eur-lex unreachable; text not read. |
| 07-threat-model-security.md:770 | Current availability of OSS security audit funds | CANNOT-CHECK | none | Funder availability is not in a primary text; a claim about current programmes. |
| 11-testing-assurance.md:215 | SAST availability (Semgrep, CodeQL) | CONFIRMED | https://github.com/semgrep/semgrep ; https://github.com/github/codeql-action | Semgrep README: open-source SAST, LGPL-2.1. CodeQL action README: "may be used on open source projects hosted on GitHub". Edited. |
| 12-operations-administration.md:161 | Legal value of warrant canary / counsel checklist | CANNOT-CHECK | none | Legal judgment; no primary source applies. |
| 14-business-sustainability.md:98 | Warrant-canary legal check | CANNOT-CHECK | none | Legal judgment. |
| 14-business-sustainability.md:142 | Competitor prices not researched; EU/US labour costs differ | CANNOT-CHECK | none | Business data; no primary source in scope. |
| 19-client-supply-chain.md:340 | EFF short wordlist licence CC BY 3.0 US | CANNOT-CHECK | https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases | eff.org unreachable; no other copy reached. |
| 25-legal-compliance-licensing.md:25 | @noble/curves and @noble/hashes are MIT | CONFIRMED | https://github.com/paulmillr/noble-curves ; https://github.com/paulmillr/noble-hashes | Both repo license sections read "The MIT License (MIT)" (checked 2026-10-21, default branch). Edited. Release-time check still needed. |
| 25-legal-compliance-licensing.md:29 | "Or later" grants future FSF versions | CANNOT-CHECK | https://www.gnu.org/licenses/agpl-3.0.txt | gnu.org and fsf.org unreachable. |
| 25-legal-compliance-licensing.md:33 | CC BY-SA 4.0 one-way compatibility with GPL-3.0 (AGPL unclear) | CANNOT-CHECK | https://creativecommons.org/licenses/by-sa/4.0/ | creativecommons.org unreachable. |
| 25-legal-compliance-licensing.md:45 | No patent clearance performed | CANNOT-CHECK | none | Statement about project status and legal review; not a source-checkable fact. |
| 25-legal-compliance-licensing.md:93 | 29 U.S.C. 481 secret-ballot provision | CANNOT-CHECK | https://www.law.cornell.edu/uscode/text/29/481 | law.cornell.edu unreachable. |
| 25-legal-compliance-licensing.md:99 | Novel protocol combination is not "non-standard cryptography" | CANNOT-CHECK | none | Legal characterization; counsel. |
| 25-legal-compliance-licensing.md:100 | EU Dual-Use Reg. 2021/821 Cat. 5 Pt 2, public-domain software out of scope | CANNOT-CHECK | https://eur-lex.europa.eu/eli/reg/2021/821/oj | eur-lex unreachable. |
| 25-legal-compliance-licensing.md:102 | Some jurisdictions restrict personal use of encryption/Tor | CANNOT-CHECK | none | Survey of national laws; no primary source fetched. |
| 25-legal-compliance-licensing.md:200 | AGPL-3.0 text and §11/§13/§15/§16 | CANNOT-CHECK | https://www.gnu.org/licenses/agpl-3.0.txt | gnu.org unreachable. Search copies of §13 found but secondary only. |
| 25-legal-compliance-licensing.md:201 | CC BY-SA 4.0 URL and compatibility | CANNOT-CHECK | https://creativecommons.org/licenses/by-sa/4.0/ | creativecommons.org unreachable. |
| 32-federation-decentralization.md:43 | Merkle/IBLT-style set-difference sync (design reference) | CANNOT-CHECK | none | Design reference; no specific source named. |
| 33-vulnerability-disclosure.md:88 | disclose.io core terms (wording) | CANNOT-CHECK | https://disclose.io | disclose.io unreachable. |
| 33-vulnerability-disclosure.md:224 | Comparative terms of platform vendors | CANNOT-CHECK | none | Commercial terms; no primary source in scope. |
| research/R-02:412 | OWASP ASVS V17 (WebRTC) and requirement counts | CANNOT-CHECK | https://github.com/OWASP/ASVS | Repo landing page has no chapter list; full ASVS not read. |
| research/R-02:512 | EAC certification / transition dates | CANNOT-CHECK | none | Not in a reachable primary source. |
| research/R-02:517 | NIST IR 7711 and SP 1500-100 | CANNOT-CHECK | https://csrc.nist.gov/pubs/sp/1500/100/final | csrc.nist.gov unreachable. |
| research/R-03:9 | Statement that some law summaries are partially verified | CANNOT-CHECK | none | Self-description of the doc's status; no claim to check. |
| research/R-03:253 | UK Data (Use and Access) Act 2025 changes | CANNOT-CHECK | none | Not fetched in this session. |
| research/R-03:259 | Art. 25(b) and CM/Rec(2017)5 citations | CANNOT-CHECK | none | Not fetched; coe.int not attempted. |
| research/R-03:268 | 15 CFR 740.13(e)(3) notification relaxation (2021) | CANNOT-CHECK | https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.13 | ecfr.gov unreachable. |
| research/R-03:269 | ristretto255 (RFC 9496) and FIPS 186-5 / Part 772 "standard cryptography" | CANNOT-CHECK | https://www.ietf.org/rfc/rfc9496.txt | ietf.org unreachable. Part 772 definition not read. |
| research/R-03:279 | EU intra-EU movement of Annex IV items | CANNOT-CHECK | https://eur-lex.europa.eu/eli/reg/2021/821/oj | eur-lex unreachable. |
| research/R-03:292 | UK Employment Rights Act 2025 e-balloting changes; ss.226-234A | CANNOT-CHECK | none | Not fetched in this session. |
| research/R-03:294 | Board secret-ballot requirements vary | CANNOT-CHECK | none | General statement; no primary source. |
| research/R-03:317 | CC BY-SA 4.0 one-way compatibility with GPLv3 | CANNOT-CHECK | https://creativecommons.org/licenses/by-sa/4.0/ | creativecommons.org unreachable. |
| research/R-03:318 | AGPL-3.0 §11 express patent grant; crypto patents expired | CANNOT-CHECK | https://www.gnu.org/licenses/agpl-3.0.txt | gnu.org unreachable. Patent-expiry claim is legal analysis. |
| research/R-03:340 | US SCA / CLOUD Act, EU e-Evidence, UK IPA reach | CANNOT-CHECK | none | Not fetched. |
| research/R-03:347 | Canaries may violate gag orders; citations not pulled | CANNOT-CHECK | none | Not fetched. |
| research/R-03:399 | Benaloh–Tuinstra 1994; Juels et al. (background) | CANNOT-CHECK | none | Not fetched. |
| research/R-04:35 | Decidim Votings / Bulletin Board with E2E-V (ElectionGuard-like) | NOT-FOUND | https://github.com/decidim/decidim | README does not mention Votings, Bulletin Board, E2E-V or ElectionGuard. Only a `decidim-elections` directory name appears. |
| research/R-04:43 | Cwtch MIT; Briar GPL/AGPL licences | CANNOT-CHECK | https://github.com/briar/briar | Briar README gives no licence text; Cwtch not reached. |
| research/R-04:73 | Verificatum licence | CANNOT-CHECK | https://www.verificatum.org | verificatum.org not reached. |
| research/R-04:107 | Semaphore: generic privacy layer, MIT | CONFIRMED | https://github.com/semaphore-protocol/semaphore | README: "Semaphore is a generic privacy layer"; MIT license. Partial: nullifier model and audits not checked, so not edited. |
| research/R-04:119 | Cwtch/Briar licences | CANNOT-CHECK | https://github.com/briar/briar | As for R-04:43. |
| research/R-04:242 | Retrieval statement for Verificatum, CIVS, Cwtch/Briar | CANNOT-CHECK | none | Meta statement about retrieval; no claim to check. |
| 05-ballot-protocol.md:309 | Adida, Helios, USENIX Security 2008 | CANNOT-CHECK | https://github.com/benadida/helios-server | Helios README describes "end-to-end verifiable voting system" and has no citation to the 2008 paper; the paper was not reached. |
| 07-threat-model-security.md:845 | @noble audits remain valid for pinned versions | CONFIRMED | https://github.com/paulmillr/noble-curves | Partial: README security section states an audit "at version 2.3.0, in Aug 2026, by Trail of Bits". Pinning and scope not checked; not edited. |
| 08-architecture-deployment.md:308 | Onion secure-context behaviour per browser | CANNOT-CHECK | none | MDN and Tor docs unreachable. Test-matrix item. |
| 08-architecture-deployment.md:326 | Browser floors: Chrome/Edge >= 137, Firefox >= 129, Safari >= 17 for WebCrypto Ed25519 | CANNOT-CHECK | none | developer.mozilla.org unreachable. |
| 08-architecture-deployment.md:389 | Per-ballot timing from noble throughput | CANNOT-CHECK | none | Benchmark estimate; no primary source. Doc itself says to replace with QV-11 results. |
| 08-architecture-deployment.md:432 | systemd-analyze availability in CI | CANNOT-CHECK | none | Not checked. |
| 08-architecture-deployment.md:483 | Node 22 EOL 2027-04 | CONFIRMED | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | Official schedule: v22 end "2027-04-30"; v24 end "2028-04-30". Edited. Secondary search results agreed but were not relied on. |
| 08-architecture-deployment.md:502 | Node SEA documentation URL access | CONFIRMED | https://nodejs.org/api/single-executable-applications.html | URL resolves; page is Node v26.12.1 docs, Stability 1.1 (active development). Access only. Edited. |
| 08-architecture-deployment.md:503 | Tor onion services URL access | CANNOT-CHECK | https://community.torproject.org/onion-services/ | community.torproject.org unreachable. |
| 09-api-data-contracts.md:174 | IETF RateLimit header fields (Internet-Draft) | CANNOT-CHECK | https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/ | datatracker.ietf.org unreachable. |
| 09-api-data-contracts.md:657 | OpenAPI lint tool (Spectral or equivalent) | CONFIRMED | https://github.com/stoplightio/spectral | README: Apache-2.0; built-in OpenAPI v3.1 support. Edited. The tool-choice decision itself is not a checkable claim. |
| 09-api-data-contracts.md:704 | JSON Schema 2020-12 URL | CONFIRMED | https://json-schema.org/draft/2020-12 | Page is the Draft 2020-12 specification; published 16 June 2022. Edited. |
| 09-api-data-contracts.md:705 | OpenAPI Specification 3.1 URL | CANNOT-CHECK | https://spec.openapis.org/oas/v3.1.0 | spec.openapis.org unreachable. |
| 11-testing-assurance.md:66 | Tool/version: jazzer.js, Stryker, k6/autocannon | CONFIRMED | https://github.com/CodeIntelligenceTesting/jazzer.js ; https://github.com/stryker-mutator/stryker-js | Partial: jazzer.js is Apache-2.0 coverage-guided Node fuzzer; Stryker Apache-2.0. No version confirmed; k6/autocannon not checked. Not edited. |
| 11-testing-assurance.md:96 | Ed25519 divergences (Wycheproof, Chalkias et al.) | CANNOT-CHECK | https://eprint.iacr.org/2020/1244 | eprint.iacr.org unreachable. |
| 11-testing-assurance.md:192 | StrykerJS node:test runner support | NOT-FOUND | https://github.com/stryker-mutator/stryker-js | README lists `npm test` as the test command and names no node:test integration. |
| 11-testing-assurance.md:206 | Browsers and Tor Browser smoke tooling | CANNOT-CHECK | none | Not checked (Playwright not fetched). |
| 11-testing-assurance.md:325 | SLSA provenance (in-toto/SLSA style) version | CONFIRMED | https://github.com/slsa-framework/slsa-github-generator | Partial: README claims SLSA Build L3 and links the v1.0 spec. Version not named in the README text; not edited. |
| 11-testing-assurance.md:458 | Tooling notes (fast-check, Stryker, jazzer.js, Playwright, axe-core) | CANNOT-CHECK | https://github.com/stryker-mutator/stryker-js | Partly confirmed (Stryker, jazzer.js); fast-check, Playwright, axe-core not fetched. |
| 13-accessibility-localization.md:378 | WCAG 2.2 criteria numbering | CANNOT-CHECK | https://www.w3.org/TR/WCAG22/ | w3.org unreachable. |
| 14-business-sustainability.md:164 | Competitor pricing and audit price ranges | CANNOT-CHECK | none | Business data; no primary source in scope. |
| 16-crypto-protocol.md:299 | GJKR 1999/2007 bias attack on Joint-Feldman | CANNOT-CHECK | none | Academic citation; not fetched. |
| 16-crypto-protocol.md:601 | noble-curves verify option `{ zip215: false }` | CONFIRMED | https://raw.githubusercontent.com/paulmillr/noble-curves/main/src/ed25519.ts | File defines a `zip215` option passed to verify (default true); doc example `{ zip215: false }` labelled RFC8032. Edited. |
| 17-key-ceremony-trustees.md:148 | age-plugin-yubikey and FIDO2 plugin names; maintenance status | CONFIRMED | https://github.com/str4d/age-plugin-yubikey ; https://github.com/FiloSottile/age | Partial: plugin exists and supports YubiKey 4/5 PIV (README). Repo shows no release or date, so maintenance status NOT-FOUND. Not edited. |
| 17-key-ceremony-trustees.md:507 | Ecosystem status of JS age/hardware plugin integration | CANNOT-CHECK | none | Not checked. |
| 18-bulletin-board-transparency.md:299 | Project-run default witness "not yet operated" | CANNOT-CHECK | none | Project operational status; not in a public primary source. |
| 19-client-supply-chain.md:69 | RFC 9106 §4 parameter values (m=64 MiB, t=3, p=1 vs RFC p=4) | CANNOT-CHECK | https://www.ietf.org/rfc/rfc9106.txt | ietf.org and rfc-editor.org unreachable. |
| 19-client-supply-chain.md:168 | Firefox lacks Trusted Types support | CANNOT-CHECK | https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API | developer.mozilla.org unreachable. |
| 19-client-supply-chain.md:169 | Import-map integrity support across browsers | CANNOT-CHECK | none | Browser compatibility not fetched. |
| 19-client-supply-chain.md:215 | cosign current major and bundle flags | CONFIRMED | https://github.com/sigstore/cosign | Partial: README uses `cosign sign-blob ... --bundle` and mentions `--new-bundle-format` and Cosign 2.x as stable. No latest release shown, so "current" not confirmed. Not edited. |
| 19-client-supply-chain.md:226 | SLSA Source-track spec version | CANNOT-CHECK | https://slsa.dev/spec/ | slsa.dev unreachable. |
| 19-client-supply-chain.md:232 | cyclonedx-npm 6.0.1 | NOT-FOUND | https://github.com/CycloneDX/cyclonedx-node-npm | Repo page shows no release version; npm registry not checked. |
| 19-client-supply-chain.md:241 | @noble/* published with provenance | CANNOT-CHECK | none | npm registry not fetched; not visible in repo README. |
| 19-client-supply-chain.md:252 | Signed bundles / Isolated Web Apps maturity | CANNOT-CHECK | none | Not checked. |
| 19-client-supply-chain.md:357 | RFC 9106 and OWASP password storage URLs (access) | CANNOT-CHECK | https://www.rfc-editor.org/rfc/rfc9106 | rfc-editor unreachable; OWASP not fetched. |
| 19-client-supply-chain.md:358 | W3C CSP3, Trusted Types, SRI URLs (access) | CANNOT-CHECK | https://www.w3.org/TR/CSP3/ | w3.org unreachable. |
| 19-client-supply-chain.md:359 | SLSA, Sigstore, in-toto URLs and versions | CANNOT-CHECK | https://slsa.dev/spec ; https://docs.sigstore.dev | Both unreachable. |
| 26-network-metadata-privacy.md:56 | Which Tor Browser versions treat .onion as secure context | CANNOT-CHECK | https://community.torproject.org/onion-services/ | community.torproject.org unreachable. |
| 26-network-metadata-privacy.md:208 | Dingledine, Mathewson, Syverson 2004 (USENIX) | CANNOT-CHECK | https://spec.torproject.org | Not fetched. |
| 26-network-metadata-privacy.md:210 | Tor onion services client authorization | CANNOT-CHECK | https://community.torproject.org/onion-services/ | Not fetched. |
| 27-project-governance-release.md:249 | GitHub Security Advisories / CNA (access) | CANNOT-CHECK | https://docs.github.com/en/code-security/security-advisories | docs.github.com unreachable. |
| 27-project-governance-release.md:250 | OpenSSF Best Practices Badge (access) | CANNOT-CHECK | https://www.bestpractices.dev/ | bestpractices.dev unreachable. |
| 28-data-model-storage.md:649 | Node 22.16 bundled SQLite version (STRICT needs >= 3.37) | CONFIRMED | https://raw.githubusercontent.com/nodejs/node/v22.16.0/deps/sqlite/sqlite3.h | Bundled SQLITE_VERSION "3.49.1" (3049001), above 3.37. The 3.37 STRICT threshold itself not checked (sqlite.org unreachable). Edited. |
| 28-data-model-storage.md:697 | SQLite documentation pages | CANNOT-CHECK | https://sqlite.org | www.sqlite.org unreachable. |
| 30-engineering-standards.md:113 | Current pinned action versions | CANNOT-CHECK | none | Doc says to resolve at implementation time; not checked. |
| 30-engineering-standards.md:317 | GitHub Actions security hardening docs (access) | CANNOT-CHECK | https://docs.github.com | docs.github.com unreachable. |
| 30-engineering-standards.md:318 | RFC 8032, 9496, 9106 (access) | CANNOT-CHECK | https://www.rfc-editor.org/ | rfc-editor unreachable. |
| 30-engineering-standards.md:319 | OpenSSF Scorecard URL (access) | CANNOT-CHECK | https://scorecard.dev | Tool confirmed via https://github.com/ossf/scorecard (Apache-2.0, links scorecard.dev), but scorecard.dev itself not fetched. |
| 31-telemetry-observability.md:126 | Prometheus text format and exposition library choice | CANNOT-CHECK | none | Design choice; not checked. |
| 32-federation-decentralization.md:34 | C2SP tlog-witness / tlog-cosignature specs, status | CONFIRMED | https://github.com/C2SP/C2SP | Partial: repo lists tlog-cosignature.md and tlog-witness.md. Status not stated; Sigsum and Go checksum DB not checked. Not edited. |
| 32-federation-decentralization.md:61 | Status of signed tree-head gossip (draft/RFC) | CANNOT-CHECK | https://www.rfc-editor.org/rfc/rfc9162 | rfc-editor and ietf unreachable. |
| 34-test-vectors-conformance.md:232 | RFC 9496 invalid encodings / App. A; Wycheproof | CANNOT-CHECK | https://www.rfc-editor.org/rfc/rfc9496 | rfc-editor unreachable; Wycheproof Ed25519 file not named in repo. |
| 34-test-vectors-conformance.md:234 | RFC 8032; Wycheproof Ed25519; Chalkias et al. | CANNOT-CHECK | https://eprint.iacr.org/2020/1244 | eprint.iacr.org unreachable. |
| 34-test-vectors-conformance.md:462 | Project Wycheproof (Google/C2SP) | CONFIRMED | https://github.com/C2SP/wycheproof | Repo: community-managed test vectors, "as a C2SP project". "Google" attribution not seen. Partial; not edited. |
| research/R-01:102 | ElGamal-based voting systems reported to have verifiability issues | CANNOT-CHECK | none | Secondary literature; details not fetched. |
| research/R-01:125 | @noble/curves ristretto255 API names differ (RistrettoPoint 1.x vs 2.x) | CANNOT-CHECK | https://github.com/paulmillr/noble-curves | API naming across major versions not checked. |
| research/R-01:384 | ML-DSA availability in @noble/post-quantum | CONFIRMED | https://github.com/paulmillr/noble-post-quantum | README lists "ML-DSA & CRYSTALS-Dilithium ... from FIPS-204" and an ML-DSA section; MIT. Edited. |
| research/R-02:9 | Meta statement on how [UNVERIFIED] is used | CANNOT-CHECK | none | Self-description; no claim to check. |
| research/R-02:81 | WEBCAT / Meta Code Verify lines of work | CANNOT-CHECK | none | Not fetched. |
| research/R-02:165 | Node permission model stability in 22/24 | CONFIRMED | https://nodejs.org/api/permissions.html | Page: "Stability: 2 - Stable"; no longer experimental as of v23.5.0 and v22.13.0. Edited. The doc text "was **not confirmed**" is now stale and was left unchanged (see Notes). |
| research/R-02:173 | node:sqlite NUL truncation; CVE-2026-58041 | CANNOT-CHECK | https://nvd.nist.gov/vuln/detail/CVE-2026-58041 | nvd.nist.gov unreachable; secondary sources only. |
| research/R-02:283 | Later npm token-bypass restriction dates | CANNOT-CHECK | none | Single secondary source; not reached. |
| research/R-02:285 | pnpm 10 "scripts disabled" default | NOT-FOUND | https://github.com/pnpm/pnpm | README has no such default. pnpm.io unreachable, so pnpm docs were not checked. |
| research/R-02:300 | Trail of Bits Aug-2026 audit of noble-curves | CONFIRMED | https://github.com/paulmillr/noble-curves | Partial: project README security section names the audit. The audit report PDF was not read, so the doc's "confirm against report PDF" note still applies. Not edited. |
| research/R-02:514 | ElectionGuard official implementation inconsistencies | CANNOT-CHECK | none | Third-party note; not fetched. |
| research/R-02:520 | Council of Europe principle numbering | CANNOT-CHECK | none | rm.coe.int unreachable. |
| research/R-02:745 | CVE-2026-58044 and CVE-2026-58041 links | CANNOT-CHECK | https://nvd.nist.gov/vuln/detail/CVE-2026-58041 | nvd.nist.gov unreachable; cvefeed and tuxcare not checked. |
| research/R-02:750 | npm token-management changes; Akeyless dates | CANNOT-CHECK | none | Secondary sources only. |
| research/R-03:50 | Background: Tor design paper and correlation work | CANNOT-CHECK | https://spec.torproject.org | Not fetched. |
| research/R-03:76 | Tor 0.4.8 PoW DoS defense for onion services | CANNOT-CHECK | none | Tor changelog not reached. |
| research/R-03:87 | Transport statuses change frequently | CANNOT-CHECK | none | Statement about external lists; not checked. |
| research/R-04:9 | Meta statement on [S], [B], [V] tags | CANNOT-CHECK | none | Self-description; no claim to check. |
| research/R-04:31 | Verificatum mixnet (page not retrievable) | CANNOT-CHECK | https://www.verificatum.org | verificatum.org not reached. |
| research/R-04:135 | Reproducible builds / client attestation (QuietVote status) | CANNOT-CHECK | none | Project design status; not an external claim. |

## Counts by verdict (117 rows)

| Verdict | Count |
|---|---|
| CONFIRMED (full claim; tag edited) | 10 |
| CONFIRMED (partial; tag kept) | 9 |
| CONTRADICTED | 0 |
| NOT-FOUND | 4 |
| CANNOT-CHECK | 94 |
| **Total** | **117** |

Tags edited (10): docs/11-testing-assurance.md:215; docs/25-legal-compliance-licensing.md:25; docs/08-architecture-deployment.md:483 and :502; docs/09-api-data-contracts.md:657 and :704; docs/16-crypto-protocol.md:601; docs/28-data-model-storage.md:649; docs/research/R-01-cryptographic-protocol-research.md:384; docs/research/R-02-application-platform-security-research.md:165.

## Notes

- The R-02:165 edit replaced only the tag. The surrounding text still says the stability status "was **not confirmed**", which the docs owner should reword.
- The marker count in the TODO table is per row. Some rows hold more than one marker (for example 11-testing-assurance.md:66 and 19-client-supply-chain.md:69), and each marker was assessed within its row.
- Secondary search results (Node 22 EOL from HeroDevs, AGPL §13 copies on code-hosting sites) were not used as confirmation.
