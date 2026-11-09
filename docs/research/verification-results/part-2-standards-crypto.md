# Verification results, part 2: standards, cryptography, election practice, advisories, other

Scope: `docs/plan/VERIFICATION-TODO.md` lines 135-278 (sections Standards, Cryptography literature, Election practice, Security advisories, Other): 117 rows. Lines 1-134 belong to part 1 and were not checked.
Checked on 2026-10-21.

## Method and access limits

- The egress proxy returned 403 (policy denial) for `www.rfc-editor.org`. Per the proxy README, policy denials are not retried or routed around, so no RFC full text was read.
- `WebFetch` failed DNS resolution for `datatracker.ietf.org`, `c2sp.org`, `eprint.iacr.org`, `csrc.nist.gov`, `arxiv.org`, `www.usenix.org`, `www.w3.org` and others. `github.com` resolved.
- Most CONFIRMED verdicts for RFCs, NIST and W3C therefore rest on **search-result metadata** (title, number, status, date) returned for the primary domain, not on a full-page read. Technical content (byte prefixes, encodings, constants) was not confirmed and is marked NOT-FOUND or CANNOT-CHECK.
- Verdict meanings: **CONFIRMED** = a primary-domain source (standards body, publisher, government, spec repo, IACR eprint) matches the claim. **CONTRADICTED** = a source says otherwise. **NOT-FOUND** = searched, no matching source. **CANNOT-CHECK** = the primary source was unreachable, or only secondary sources were available, or the item is a design choice or process note.
- Tags were removed only where the verdict is CONFIRMED and the cited source was a primary one. Where a row also contains an unverified sub-claim, the tag was kept. Tags stay on all CONTRADICTED, NOT-FOUND and CANNOT-CHECK rows.

## Results

### Standards and specifications (39 rows)

| # | Item (doc:line) | Claim | Verdict | Primary source URL | Note |
|---|---|---|---|---|---|
| S1 | 03-governance-and-policy.md:411 | RFC 8785 JCS | CONFIRMED | https://rfc-editor.org/info/rfc8785 | Informational, June 2020. Tag removed. |
| S2 | 04-identity-eligibility.md:298 | RFC 8032 EdDSA | CONFIRMED | https://rfc-editor.org/info/rfc8032 | Informational (IRTF), Jan 2017. Tag removed. |
| S3 | 04-identity-eligibility.md:299 | RFC 9162 Merkle tree; leaf/node prefixes 0x00/0x01 | NOT-FOUND | https://rfc-editor.org/rfc/rfc9162 | Identity, Experimental and obsoletes RFC 6962 confirmed. Prefix bytes not in retrieved text. Tag kept. |
| S4 | 07-threat-model-security.md:50 | NIST IR 8363 "could not be located" | NOT-FOUND | (search, csrc.nist.gov) | Agrees with the document: no IR 8363 result. Tag kept. |
| S5 | 07-threat-model-security.md:889 | NIST IR 8363 "no matching publication" | NOT-FOUND | (search) | Same as S4. Tag kept. |
| S6 | 08-architecture-deployment.md:487 | Adopt C2SP checkpoint format "if compatible with RFC 9162" | CANNOT-CHECK | https://github.com/C2SP/C2SP/ | C2SP tlog-checkpoint/witness specs exist. Compatibility with RFC 9162 not analysed. Tag kept. |
| S7 | 08-architecture-deployment.md:499 | RFC 9162 CT v2.0 | CONFIRMED | https://rfc-editor.org/rfc/rfc9162 | Experimental, Dec 2021. Tag removed; "fetch blocked" wording left for author. |
| S8 | 08-architecture-deployment.md:504 | C2SP tlog-witness / tlog-checkpoint at https://c2sp.org | CANNOT-CHECK | https://github.com/C2SP/C2SP/ | c2sp.org not reached. tlog-witness appears in the C2SP index only via secondary results. Tag kept. |
| S9 | 09-api-data-contracts.md:682 | Idempotency-Key is still an IETF draft | CONFIRMED | https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ | Draft-07 expired; no RFC found. A newer revision may exist. Tag removed. |
| S10 | 09-api-data-contracts.md:702 | RFC 9457 supersedes RFC 7807 | CONFIRMED | https://rfc-editor.org/rfc/rfc9457 | Standards Track, July 2023, obsoletes 7807. Tag removed. |
| S11 | 09-api-data-contracts.md:703 | RFC 3339, 4648, 6585, 8594, 9110 | CONFIRMED | https://datatracker.ietf.org/doc/rfc3339 ; https://rfc-editor.org/info/rfc4648 ; https://rfc-editor.org/rfc/rfc6585 ; https://rfc-editor.org/rfc/rfc8594 ; https://rfc-editor.org/rfc/rfc9110.html | Titles and status found for all five. Tag removed. |
| S12 | 09-api-data-contracts.md:707 | IETF httpapi RateLimit fields (Internet-Draft; names may change) | CONTRADICTED | https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/ | Still a draft (-11, May 2026), so the draft status is right. But the doc's names (`RateLimit-Limit`, `-Remaining`, `-Reset`) are early-draft names. The current draft uses `RateLimit-Policy` and `RateLimit`. Affects 09-api-data-contracts.md:174 (implementation). Tag kept. |
| S13 | 11-testing-assurance.md:457 | RFC 9162, 6962, 9496, 8032, 9474 exist | CONFIRMED | https://rfc-editor.org/rfc/rfc9162 ; https://rfc-editor.org/rfc/rfc9496 ; https://rfc-editor.org/rfc/rfc9474 ; https://rfc-editor.org/rfc/rfc8032 | Titles and status confirmed. RFC 6962 is obsoleted by 9162. Tag removed. |
| S14 | 13-accessibility-localization.md:328 | VPAT 2.5 WCAG template version | CANNOT-CHECK | — | ITI primary page not returned. Third-party VPAT 2.5Rev (Feb 2025) copies found. Tag kept. |
| S15 | 13-accessibility-localization.md:347 | ICU MF2 is "a newer standard that is stabilizing" | CONTRADICTED | https://blog.unicode.org/2025/03/ ; https://cldr.unicode.org/downloads/cldr-47 | Unicode blog and CLDR 47 (13 Mar 2025) report MF2 as Stable. The doc's rationale for MF1 (see D-65, Q-13-5) is outdated. Tag kept. |
| S16 | 13-accessibility-localization.md:379 | ICU MessageFormat userguide URL; CLDR plural rules URL | CANNOT-CHECK | https://cldr.unicode.org/ | CLDR domain confirmed. ICU page not returned; only its source path appears (docs/userguide/format_parse/messages). Tag kept. |
| S17 | 13-accessibility-localization.md:381 | UAX #9; UTR #36/#39; Trojan Source (Boucher & Anderson, 2021) | NOT-FOUND | — | arXiv 2111.00169 and UAX #9 not returned. Only a secondary glossary was found. Tag kept. |
| S18 | 13-accessibility-localization.md:382 | W3C COGA "Making Content Usable..." | CONFIRMED | https://www.w3.org/TR/coga-usable/ | W3C Working Group Note, April 2021. Tag removed. |
| S19 | 16-crypto-protocol.md:12 | Meta: other citations marked UNVERIFIED-OFFLINE | CANNOT-CHECK | — | Meta statement. Each cited item is checked in its own row. Tag kept. |
| S20 | 16-crypto-protocol.md:582 | Crockford base32 described as an "RFC 4648 alphabet variant" | CONTRADICTED | https://datatracker.ietf.org/doc/draft-crockford-davis-base32-for-humans/ ; https://rfc-editor.org/info/rfc4648 | Crockford's alphabet (0-9 and A-Z without I, L, O, U) is a separate alphabet from RFC 4648 base32 (A-Z, 2-7). RFC 4648 text was not retrieved, so the RFC 4648 side comes from knowledge. Encoder must follow Crockford's alphabet. Tag kept. |
| S21 | 16-crypto-protocol.md:978 | "FROST-style two-round DKG (RFC 9591)" as an alternative | CONTRADICTED | https://www.rfc-editor.org/rfc/rfc9591.html | RFC 9591 title: "The FROST Protocol for Two-Round Schnorr Signatures". It is a signing protocol. R-01:198 already says RFC 9591 does not standardise DKG. Affects §5.7 alternatives text. Tag kept. |
| S22 | 16-crypto-protocol.md:1033 | RFC 9162 (Merkle tree hash definition) | CONFIRMED | https://rfc-editor.org/rfc/rfc9162 | Tag removed; the "(not returned by search)" note is now stale. |
| S23 | 16-crypto-protocol.md:1034 | RFC 9474 RSA Blind Signatures | CONFIRMED | https://rfc-editor.org/rfc/rfc9474 | Informational, Oct 2023. Tag removed. |
| S24 | 16-crypto-protocol.md:1035 | RFC 5869 HKDF | CONFIRMED | https://rfc-editor.org/rfc/rfc5869 | Informational, May 2010. Tag removed. |
| S25 | 16-crypto-protocol.md:1036 | SP 800-38D; FIPS 180-4 | CONFIRMED | https://csrc.nist.gov/pubs/sp/800/38/d/final ; https://csrc.nist.gov/Projects/Cryptographic-Algorithm-Validation-Program/Secure-Hashing | NIST announced a revision of SP 800-38D in 2024 (pre-draft call 2025). The doc should note this. Tag removed. |
| S26 | 16-crypto-protocol.md:1038 | RFC 9591 FROST | CONFIRMED | https://www.rfc-editor.org/rfc/rfc9591.html | Title and date confirmed (see S21 for the DKG claim). Tag removed. |
| S27 | 17-key-ceremony-trustees.md:165 | SLIP-0039 details (2-of-3 mnemonic shares) | CONFIRMED | https://github.com/satoshilabs/slips/blob/master/slip-0039.md | Status Final; shares encoded with a 1024-word list. Tag removed. |
| S28 | 17-key-ceremony-trustees.md:532 | Shamir, "How to share a secret", CACM 1979; SLIP-0039 URL | CONFIRMED | https://cs.tau.ac.il/~bchor/Shamir.html ; https://github.com/satoshilabs/slips/blob/master/slip-0039.md | CACM 22(11), Nov 1979, pp. 612-613 per search summaries and a copy showing the issue header. Tags removed. |
| S29 | 18-bulletin-board-transparency.md:527 | RFC 9162, Experimental, obsoletes RFC 6962 | CONFIRMED | https://rfc-editor.org/rfc/rfc9162 | Tag removed. The host-unreachable note is now stale. |
| S30 | 18-bulletin-board-transparency.md:531 | C2SP signed-note | CONFIRMED | https://github.com/C2SP/C2SP/blob/main/signed-note.md | Spec file fetched from the C2SP repo; it refers to tlog-checkpoint for timestamped cosignatures. Tag removed. |
| S31 | 28-data-model-storage.md:698 | RFC 8439 ChaCha20-Poly1305 | CONFIRMED | https://www.rfc-editor.org/rfc/rfc8439 | Informational, June 2018. Tag removed. |
| S32 | 30-engineering-standards.md:316 | Conventional Commits 1.0.0; SemVer 2.0.0 | CONFIRMED | https://github.com/conventional-commits/conventionalcommits.org ; https://semver.org/ | CC repo badge shows 1.0.0 (MIT). semver.org titled "Semantic Versioning 2.0.0". Tag removed. |
| S33 | 32-federation-decentralization.md:161 | Sigsum and C2SP transparency-log specs; names and status | CONFIRMED | https://git.sigsum.org/sigsum/tree/doc/design.md ; https://github.com/C2SP/C2SP/ | Both exist. Sigsum is a work-in-progress prototype with no uptime promise. Tag removed. |
| S34 | 34-test-vectors-conformance.md:167 | RFC 9496: scalars are little-endian | NOT-FOUND | https://rfc-editor.org/rfc/rfc9496 | RFC 9496 metadata confirmed (Informational, Dec 2023). Encoding rule not in retrieved text. Tag kept. |
| S35 | 34-test-vectors-conformance.md:401 | curve25519-dalek version pin | CANNOT-CHECK | https://crates.io/crates/curve25519-dalek | crates.io not returned. Latest version seen only in secondary results (4.1.2, 2024). Tag kept. |
| S36 | 34-test-vectors-conformance.md:460 | RFCs 8032, 9496, 9474, 9162, 6962, 5869, 3339, 8785 | CONFIRMED | (see S1, S2, S13, S23, S24, S11) | Titles and status confirmed for all cited RFCs. Tag removed. |
| S37 | 34-test-vectors-conformance.md:461 | NIST FIPS 180-4 and CAVP SHA vectors | CONFIRMED | https://csrc.nist.gov/Projects/Cryptographic-Algorithm-Validation-Program/Secure-Hashing | CAVP Secure Hashing page lists FIPS 180-4 vectors. Tag removed. |
| S38 | research/R-01-cryptographic-protocol-research.md:306 | RSA not post-quantum; >= 3072 bits per NIST/ENISA | CANNOT-CHECK | — | 3072-bit RSA = 128-bit strength per SP 800-57 is reported only by secondary sites. NIST and ENISA primaries not reached. Tag kept. |
| S39 | research/R-03-metadata-coercion-privacy-legal-research.md:57 | ECH standardised as IETF work | CONFIRMED | https://rfc-editor.org/rfc/rfc9849.html | RFC 9849 "TLS Encrypted Client Hello", Standards Track, March 2026. Tag removed. |

### Cryptography literature and protocol claims (47 rows)

| # | Item (doc:line) | Claim | Verdict | Primary source URL | Note |
|---|---|---|---|---|---|
| C1 | 04-identity-eligibility.md:305 | Chaum, Blind Signatures, CRYPTO '82 (1983) | CANNOT-CHECK | — | Venue and pages (199-203) only via an EPO patent-family record. Tag kept. |
| C2 | 05-ballot-protocol.md:310 | Benaloh, Simple Verifiable Elections, EVT 2006 | CONFIRMED | https://usenix.org/conference/evt-06/simple-verifiable-elections | Tag removed. |
| C3 | 05-ballot-protocol.md:312 | ElectionGuard spec at github.com/microsoft/electionguard | CONFIRMED | https://github.com/microsoft/electionguard | Repo exists; spec at electionguard.vote/spec. Version pin still open. Tag kept. |
| C4 | 10-user-experience.md:628 | Benaloh 2006 PDF at /legacy/event/evt06/... | NOT-FOUND | https://usenix.org/conference/evt-06/simple-verifiable-elections | Paper confirmed. The legacy PDF URL was not returned; the canonical page is the conference page. Tag kept; replace the URL. |
| C5 | 10-user-experience.md:632 | ElectionGuard v2.1 opens challenged ballots by releasing encryption nonces | CONFIRMED | https://electionguard.vote/spec/ | Release notes (search snippet) state this change. Other 2.1 details not retrieved. Tag kept. |
| C6 | 11-testing-assurance.md:121 | GJKR 1999 (ATK-031): Pedersen DKG output can be biased | CANNOT-CHECK | DOI 10.1007/3-540-48910-X_21 (not fetched) | Bibliographic indexes consistent. Bias result not verified from the paper. Tag kept. |
| C7 | 11-testing-assurance.md:454 | GJKR, EUROCRYPT 1999 | CANNOT-CHECK | DOI 10.1007/3-540-48910-X_21 (not fetched) | LNCS 1592, p. 295 per bibliographic index. Tag kept. |
| C8 | 11-testing-assurance.md:455 | Benaloh 2006; CDS 1994; Chaum-Pedersen 1992 | CONFIRMED | https://usenix.org/conference/evt-06/simple-verifiable-elections ; https://ir.cwi.nl/pub/1456 ; https://www.springerprofessional.de/en/wallet-databases-with-observers/13572840 | Tags removed. The Chaum-Pedersen record is dated 1993 (LNCS 740 proceedings of CRYPTO '92). |
| C9 | 16-crypto-protocol.md:627 | Benaloh 2006 and Adida 2008 analyse detection probability >= audit rate | CANNOT-CHECK | — | Citations exist. The claimed analysis was not checked. Tag kept. |
| C10 | 16-crypto-protocol.md:728 | ElectionGuard compensated decryption, per-guardian backups | CANNOT-CHECK | https://electionguard.vote/spec/ | Spec not retrieved. Tag kept. |
| C11 | 16-crypto-protocol.md:1021 | Adida, Helios, USENIX Security 2008 | CONFIRMED | https://www.usenix.org/conference/17th-usenix-security-symposium/helios-web-based-open-audit-voting | Tag removed. |
| C12 | 16-crypto-protocol.md:1022 | Benaloh, Simple Verifiable Elections, EVT 2006 | CONFIRMED | https://usenix.org/conference/evt-06/simple-verifiable-elections | Tag removed. |
| C13 | 16-crypto-protocol.md:1023 | Cramer, Gennaro, Schoenmakers, EUROCRYPT 1997 | CONFIRMED | https://api.crossref.org/works/10.1007%2F3-540-36504-4_1 | Crossref record shows EUROCRYPT '97, pp. 103-118. Tag removed. |
| C14 | 16-crypto-protocol.md:1024 | Cramer, Damgard, Schoenmakers, CRYPTO 1994 | CONFIRMED | https://ir.cwi.nl/pub/1456 | LNCS 839, pp. 174-187. Tag removed. |
| C15 | 16-crypto-protocol.md:1025 | Chaum, Pedersen, Wallet Databases with Observers, CRYPTO 1992 | CONFIRMED | https://www.springerprofessional.de/en/wallet-databases-with-observers/13572840 | Tag removed. Springer lists the chapter as 1993 (LNCS 740). |
| C16 | 16-crypto-protocol.md:1026 | Feldman, FOCS 1987 | CONFIRMED | https://ieeexplore.ieee.org/abstract/document/4568297 | IEEE Xplore record, FOCS 1987, pp. 427-437. Tag removed. |
| C17 | 16-crypto-protocol.md:1027 | Pedersen, EUROCRYPT 1991 | CONFIRMED | https://unpaywall.org/10.1007%2F3-540-57220-1_47 | DOI record; LNCS 547, pp. 522-526 per Springer reference list. Tag removed. |
| C18 | 16-crypto-protocol.md:1028 | GJKR, EUROCRYPT 1999; J. Cryptology 2007 | CANNOT-CHECK | DOI 10.1007/3-540-48910-X_21 (not fetched) | Publisher page not reached. Tag kept. |
| C19 | 16-crypto-protocol.md:1029 | Shamir, How to Share a Secret, CACM 1979 | CONFIRMED | https://cs.tau.ac.il/~bchor/Shamir.html | Tag removed. |
| C20 | 16-crypto-protocol.md:1030 | Schnorr, Efficient Signature Generation by Smart Cards, J. Cryptology 1991 | CONFIRMED | https://publikationen.ub.uni-frankfurt.de/frontdoor/index/index/docId/4280 | J. Cryptology 4(3), pp. 161-174, 1991 (author repository copy). Tag removed. |
| C21 | 16-crypto-protocol.md:1037 | Semaphore: ZK group membership with nullifiers | CONFIRMED | https://docs.semaphore.pse.dev/ | Official docs. v4 spec not read. Tag removed. |
| C22 | 17-key-ceremony-trustees.md:531 | Pedersen 1991; Feldman 1987; GJKR J. Cryptology 2007 | CONFIRMED (Pedersen, Feldman) | https://unpaywall.org/10.1007%2F3-540-57220-1_47 ; https://ieeexplore.ieee.org/abstract/document/4568297 | Tags removed for Pedersen and Feldman. The GJKR 2007 tag is kept (not verified). |
| C23 | 17-key-ceremony-trustees.md:533 | Adida 2008; ElectionGuard key-ceremony spec URL | CONFIRMED | https://www.usenix.org/conference/17th-usenix-security-symposium/helios-web-based-open-audit-voting ; https://github.com/microsoft/electionguard | Tags removed. |
| C24 | 19-client-supply-chain.md:356 | Benaloh 2006 and Adida 2008 (access) | CONFIRMED | https://usenix.org/conference/evt-06/simple-verifiable-elections ; https://www.usenix.org/conference/17th-usenix-security-symposium/helios-web-based-open-audit-voting | Tags removed. |
| C25 | 20-voting-methods.md:351 | [R1] Chaum-Pedersen, CRYPTO '92 | CONFIRMED | https://www.springerprofessional.de/en/wallet-databases-with-observers/13572840 | Tag removed. |
| C26 | 20-voting-methods.md:352 | [R2] CDS, CRYPTO '94 | CONFIRMED | https://ir.cwi.nl/pub/1456 | Tag removed. |
| C27 | 20-voting-methods.md:353 | [R3] Schulze arXiv:1804.02973; SCW 36 (2011) 267-303 | CANNOT-CHECK | https://arxiv.org/pdf/1804.02973 | arXiv ID and title confirmed ("The Schulze Method of Voting"). "v18, Oct 2025" not checked. SCW pages only via RePEc index. Tag kept on pages. |
| C28 | 20-voting-methods.md:354 | [R4] Tideman, SCW 4 (1987) 185-206 | NOT-FOUND | — | Springer record not returned. Secondary papers cite Tideman 1987 without these pages. Tag kept. |
| C29 | 20-voting-methods.md:355 | [R5] Bernhard, Pereira, Warinschi, ASIACRYPT 2012 | CONFIRMED | https://eprint.iacr.org/2016/771 | IACR eprint for the full version (major revision of the 2012 paper). Tag removed. |
| C30 | 20-voting-methods.md:360 | [R10] Adida, Helios, USENIX 2008 | CONFIRMED | https://www.usenix.org/conference/17th-usenix-security-symposium/helios-web-based-open-audit-voting | Tag removed. |
| C31 | 20-voting-methods.md:361 | [R11] Benaloh, Simple verifiable elections, EVT 2006 | CONFIRMED | https://usenix.org/conference/evt-06/simple-verifiable-elections | Tag removed. |
| C32 | 32-federation-decentralization.md:54 | Relays often cap events at ~64-512 KB | NOT-FOUND | https://nips.4rs.nl/nips/11 (NIP-11 mirror) | NIP-11 defines a per-relay `max_message_length`. No typical 64-512 KB range found. Tag kept. |
| C33 | 32-federation-decentralization.md:73 | Threshold blind signatures are "research; not standard" | CANNOT-CHECK | https://rfc-editor.org/rfc/rfc9474 | RFC 9474 standardises single-signer RSA blind signatures. Threshold variants not searched. Tag kept. |
| C34 | 34-test-vectors-conformance.md:296 | ElectionGuard 2.1 nonce release (details) | CONFIRMED | https://electionguard.vote/spec/ | Main change confirmed (see C5). Tag kept for the remaining details. |
| C35 | research/R-01-cryptographic-protocol-research.md:45 | IACR Helios election annulled after a trustee lost a key (late 2025) | NOT-FOUND | https://www.theregister.com/2025/11/24/cryptologic_research_election_rerun/ (secondary) | Press (The Register, Schneier) reports the annulment and 2-of-3 rerun. No IACR primary announcement found. Tag kept. |
| C36 | research/R-01-cryptographic-protocol-research.md:57 | ElectionGuard parameters: 4096-bit p, 256-bit q | NOT-FOUND | https://electionguard.vote/spec/ | Constants not retrieved. Release notes say p and cofactor changed in a later version, so check per version. Tag kept. |
| C37 | research/R-01-cryptographic-protocol-research.md:62 | Benaloh, Naehrig et al., eprint 2024/955 | CONFIRMED | https://eprint.iacr.org/2024/955 | Authors Benaloh, Naehrig, Pereira, Wallach; USENIX Security 2024. Tag NOT removed: the marker sits inside a note that also says "authorship/title not confirmed". Author to reword. |
| C38 | research/R-01-cryptographic-protocol-research.md:64 | No public Frozen Heart-class break of ElectionGuard | NOT-FOUND | https://blog.trailofbits.com/2022/04/14/the-frozen-heart-vulnerability-in-giraults-proof-of-knowledge/ | Frozen Heart results cover other schemes. None for ElectionGuard. Negative claim not contradicted. Tag kept. |
| C39 | research/R-01-cryptographic-protocol-research.md:77 | CSF-2023 paper by Cortier, Gaudry, Yang on ballot cleansing | CONTRADICTED | https://eprint.iacr.org/2022/430 | The eprint says it is the long version of a CSF 2024 paper ("Is the JCJ voting system really coercion-resistant?"). No CSF 2023 version found. Tag kept. | <!-- claims-lint-ignore -->
| C40 | research/R-01-cryptographic-protocol-research.md:98 | Attack classes beyond those listed | CANNOT-CHECK | — | Requires the paper. Tag kept. |
| C41 | research/R-01-cryptographic-protocol-research.md:115 | IACR Helios trustee key loss (trustee-loss row) | NOT-FOUND | (see C35) | No IACR primary found. Tag kept. |
| C42 | research/R-01-cryptographic-protocol-research.md:193 | IACR Helios (n-of-n row) | NOT-FOUND | (see C35) | No IACR primary found. Tag kept. |
| C43 | research/R-01-cryptographic-protocol-research.md:242 | Gennaro et al., CT-RSA 2003: bias not known to be exploitable in Schnorr uses | NOT-FOUND | https://unpaywall.org/10.1007%2F3-540-36563-X_26 | Bibliographic record confirmed (LNCS 2612, pp. 373-390, 2003). Statement not verified. Tag kept. |
| C44 | research/R-01-cryptographic-protocol-research.md:308 | node:crypto lacks a vetted blind-RSA API | NOT-FOUND | — | No blind-signature API found in search results. Node docs not retrieved. Tag kept. |
| C45 | research/R-01-cryptographic-protocol-research.md:359 | Composition not published elsewhere | CANNOT-CHECK | — | Absence claim needs a literature review by a cryptographer. Tag kept. |
| C46 | research/R-02-application-platform-security-research.md:111 | Coron CHES'99 as source for scalar blinding | CANNOT-CHECK | — | Springer reference to Coron CHES 1999 (ECC DPA countermeasures, LNCS 1717) returned. The scalar-blinding link is not verified. The library-behaviour tag is out of scope. Tag kept. |
| C47 | research/R-04-landscape-prior-art.md:32 | CIVS: server sees ballots; no cryptography | CANNOT-CHECK | https://civs.cs.cornell.edu | Site reached through search. Its security page describes email handling and anonymity, but ballot visibility and the absence of cryptography are not verified. Tag kept. |

### Election practice, deployments and landscape (2 rows)

| # | Item (doc:line) | Claim | Verdict | Primary source URL | Note |
|---|---|---|---|---|---|
| E1 | 18-bulletin-board-transparency.md:532 | OpenTimestamps at https://opentimestamps.org | NOT-FOUND | (project via https://petertodd.org/2016/opentimestamps-announcement) | Project confirmed through secondary sources. opentimestamps.org not returned. Tag kept. |
| E2 | 29-abuse-dos-prevention.md:288 | Appeals panel selected by manifest-committed randomness (drand-style optional) | CANNOT-CHECK | — | Design choice, not a checkable fact. Tag kept. |

### Security advisories, CVEs and attack reports (2 rows)

| # | Item (doc:line) | Claim | Verdict | Primary source URL | Note |
|---|---|---|---|---|---|
| A1 | 12-operations-administration.md:119 | 90-day coordinated disclosure default | CANNOT-CHECK | — | Project Zero policy confirmed only through 2020 news and later secondary coverage (90 days plus 30-day fix window). Tag kept. |
| A2 | 27-project-governance-release.md:247 | Google Project Zero disclosure policy URL | CANNOT-CHECK | — | The Project Zero blog URL was not returned. Tag kept. |

### Other / uncategorised (27 rows)

| # | Item (doc:line) | Claim | Verdict | Primary source URL | Note |
|---|---|---|---|---|---|
| O1 | 03-governance-and-policy.md:198 | Result label "UNVERIFIED — see report" | CANNOT-CHECK | — | Literal UI string, not a factual claim. The tag looks like a false positive; the author should drop it. Tag kept. |
| O2 | 07-threat-model-security.md:886 | CoE Recommendation CM/Rec(2017)5 adopted 14 June 2017 | CONFIRMED | https://www.coe.int/en/web/portal/-/council-of-europe-adopts-new-recommendation-on-standards-for-e-voting | Adoption date and existence confirmed. The PDF URL (rm.coe.int/1680726f6f) was not confirmed as the 2017 text. Tag kept. |
| O3 | 09-api-data-contracts.md:706 | WHATWG HTML Living Standard, Server-sent events | CONFIRMED | https://html.spec.whatwg.org/multipage/server-sent-events.html | Tag removed. |
| O4 | 10-user-experience.md:631 | Crockford Base32 at https://www.crockford.com/base32.html | NOT-FOUND | — | crockford.com not returned. Alphabet confirmed via IETF draft (see S20). Tag kept. |
| O5 | 11-testing-assurance.md:306 | Specific university groups and audit firms | CANNOT-CHECK | — | Selection is by RFP. Tag kept. |
| O6 | 11-testing-assurance.md:420 | Tools need validation before commit | CANNOT-CHECK | — | Process note. Tag kept. |
| O7 | 11-testing-assurance.md:449 | References header (author-knowledge caveat) | CANNOT-CHECK | — | Process note. Tag kept. |
| O8 | 12-operations-administration.md:80 | Litestream-style continuous WAL shipping | CONFIRMED | https://litestream.io/how-it-works/ | Mechanism and tool confirmed. Tool choice remains a design decision. Tag kept. |
| O9 | 14-business-sustainability.md:44 | Competitor prices not collected | CANNOT-CHECK | — | Self-declared gap. Tag kept. |
| O10 | 17-key-ceremony-trustees.md:266 | Fingerprint as 6 words from a "PGP-style / BIP39-sized" 2048-word list | CONTRADICTED | https://en.wikipedia.org/wiki/PGP_word_list (secondary) | The PGP word list is two 256-word lists (one word per byte), not 2048 words. 66 bits in 6 words requires a 2048-word list (BIP39-style). Affects the wordlist choice. Tag kept. |
| O11 | 18-bulletin-board-transparency.md:533 | Crosby & Wallach, USENIX Security 2009 | CONFIRMED | https://www.usenix.org/conference/usenixsecurity09/technical-sessions/presentation/efficient-data-structures-tamper-evident | Tag removed. |
| O12 | 19-client-supply-chain.md:246 | harden-runner-style egress control during build | CONFIRMED | https://github.com/marketplace/actions/harden-runner | Tool exists and does egress control. Tool choice is open. Tag kept. |
| O13 | 25-legal-compliance-licensing.md:207 | US LMRDA 29 U.S.C. §481; UK TULRCA 1992 | CONFIRMED | https://uniondemocracy.org/legal-rights-and-organizing/the-complete-text-of-the-lmrda/title-iv-elections/ ; https://www.legislation.gov.uk/ukpga/1992/52/contents/data.html | §481 text (secondary reproduction plus DOL statements) includes the secret-ballot rule. TULRCA 1992 c. 52 confirmed. Tag removed. |
| O14 | 26-network-metadata-privacy.md:33 | ECH server-stack support status | CANNOT-CHECK | https://rfc-editor.org/rfc/rfc9849.html | ECH standard confirmed (RFC 9849). Per-server support not checked. Tag kept. |
| O15 | 27-project-governance-release.md:156 | Contributor Covenant 2.1 is current | CONTRADICTED | https://ethicalsource.dev/blog/contributor-covenant-3 | Contributor Covenant 3.0 announced 28 July 2025 by the Organization for Ethical Source. Tag kept. |
| O16 | 27-project-governance-release.md:224 | Fiscal host availability | CANNOT-CHECK | — | Not checked. Tag kept. |
| O17 | 27-project-governance-release.md:244 | Contributor Covenant URL and "current version" | CONTRADICTED | https://ethicalsource.dev/blog/contributor-covenant-3 | Same as O15. Tag kept. |
| O18 | 27-project-governance-release.md:245 | DCO 1.1 at developercertificate.org | CANNOT-CHECK | https://www.eclipse.org/legal/dco/dco.html (mirror) | DCO 1.1 text confirmed through mirrors. developercertificate.org not returned. Tag kept. |
| O19 | 27-project-governance-release.md:248 | FIRST CVSS v4.0 at first.org | CANNOT-CHECK | — | first.org not returned. Secondary coverage gives release 1 Nov 2023. Tag kept. |
| O20 | 30-engineering-standards.md:263 | actionlint available as the workflow linter | CANNOT-CHECK | https://pkg.go.dev/github.com/rhysd/actionlint | MIT-licensed Go tool per index pages. Project repo not returned. Tag kept. |
| O21 | 30-engineering-standards.md:315 | DCO 1.1 at developercertificate.org | CANNOT-CHECK | https://www.eclipse.org/legal/dco/dco.html (mirror) | Same as O18. Tag kept. |
| O22 | research/R-01-cryptographic-protocol-research.md:9 | Definition of the [UNVERIFIED] marker | CANNOT-CHECK | — | Meta statement. Tag kept. |
| O23 | research/R-02-application-platform-security-research.md:435 | OWASP Top 10 2025 positions | CANNOT-CHECK | — | owasp.org not returned. A01, A03 (Software Supply Chain Failures) and A10 (Mishandling of Exceptional Conditions) match secondary summaries. A02 moved up. Other positions unconfirmed. Tag kept. |
| O24 | research/R-03-metadata-coercion-privacy-legal-research.md:124 | Small-electorate thresholds (10 and 5) | NOT-FOUND | — | No authoritative threshold found. The document itself calls them heuristics. Tag kept. |
| O25 | research/R-03-metadata-coercion-privacy-legal-research.md:278 | Public-domain exclusion holds in each member state | CANNOT-CHECK | — | Per-state law not checked. Tag kept. |
| O26 | research/R-04-landscape-prior-art.md:85 | Landscape tool includes voting and bulletin-board modules | CANNOT-CHECK | — | Not checked. Tag kept. |
| O27 | research/R-04-landscape-prior-art.md:151 | Negative claim: no surveyed tool applies result-disclosure policy | CANNOT-CHECK | — | Requires a survey. Tag kept. |

## Counts

| Section | Rows | CONFIRMED | CONTRADICTED | NOT-FOUND | CANNOT-CHECK |
|---|---|---|---|---|---|
| Standards | 39 | 23 | 4 | 5 | 7 |
| Cryptography literature | 47 | 24 | 1 | 10 | 12 |
| Election practice | 2 | 0 | 0 | 1 | 1 |
| Security advisories | 2 | 0 | 0 | 0 | 2 |
| Other | 27 | 6 | 3 | 2 | 16 |
| **Total** | **117** | **53** | **8** | **18** | **38** |

Tags removed: 52 marker occurrences in 46 Edit calls, all on CONFIRMED rows (listed in the edit log below).

## CONTRADICTED items that affect the spec or implementation

1. **RateLimit header names (09-api-data-contracts.md:174 and :707).** The doc specifies `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. The current draft (draft-ietf-httpapi-ratelimit-headers-11, May 2026) defines `RateLimit-Policy` and `RateLimit`. Implementation-affecting. Source: datatracker search result (not fetched in full).
2. **Crockford base32 labelled as an RFC 4648 variant (16-crypto-protocol.md:582).** The alphabet is different (no I, L, O, U; digits 0-9). The encoder and test vectors must use Crockford's alphabet. Doc label should be corrected.
3. **FROST as "two-round DKG (RFC 9591)" (16-crypto-protocol.md:978).** RFC 9591 is a two-round signing protocol. Alternatives text in §5.7 should be corrected.
4. **PGP-style 2048-word list (17-key-ceremony-trustees.md:266).** PGP word lists are 256 words each. The wordlist choice must name the 2048-word list (BIP39-style) explicitly.
5. **MF2 "stabilizing" (13-accessibility-localization.md:347).** MF2 has been Stable since CLDR 47 (March 2025). The MF1 choice (D-65, Q-13-5) can stay, but its stated reason is outdated.

Lower-impact CONTRADICTED items: CSF year for Cortier-Gaudry-Yang (R-01:77, CSF 2024 not 2023); Contributor Covenant version (27-project-governance-release.md:156 and :244, now 3.0).

## Items the author should resolve

- IACR Helios trustee-loss announcement (R-01:45, :115, :193): only press coverage found; the IACR primary was not located.
- ElectionGuard constants (R-01:57) and the v2.1 details (10:632, 34:296): the spec must be read, and the parameters checked per version (release notes say p changed).
- RFC 9162 prefix bytes (04-identity-eligibility.md:299) and RFC 9496 scalar encoding (34-test-vectors-conformance.md:167): need the RFC text.
- Benaloh 2006 legacy PDF URL (10-user-experience.md:628): replace with the USENIX conference page.
- Chaum (04:305), GJKR (11:121, 11:454, 16:1028, 17:531 GJKR 2007) and Schulze pages (20:353): bibliographic details consistent in indexes but publisher pages not reached.
- Stale wording left after tag removal (author to tidy): 08:499 "fetch blocked", 16:1033 "(not returned by search)", 18:527 "host unreachable", R-03:57 "RFC status at time of writing", 34:460 "searches did not return RFC text".

## Outside range, observed incidentally

- research/R-02-application-platform-security-research.md:517 "NIST IR 7711-style security best practices for the EAC" is CONTRADICTED: NIST IR 7711 covers electronic transmission of blank ballots and registration materials to overseas and military voters, not EAC security practice. This row lies in part 1's range and was not edited.
- research/R-02-application-platform-security-research.md:412: ASVS 5.0 has 17 chapters and V17 is WebRTC (secondary: OWASP cheat sheet index). Not edited.
- research/R-03-metadata-coercion-privacy-legal-research.md:253: Data (Use and Access) Act 2025 received Royal Assent on 19 June 2025. Not edited.

## Edit log

Tag removals were made with exact-match Edit calls, one file group at a time. Files and lines edited (line numbers as in the source docs):

- docs/03-governance-and-policy.md:411; docs/04-identity-eligibility.md:298; docs/05-ballot-protocol.md:310; docs/08-architecture-deployment.md:499
- docs/09-api-data-contracts.md:682, 702, 703, 706
- docs/11-testing-assurance.md:455, 457
- docs/13-accessibility-localization.md:382
- docs/16-crypto-protocol.md:1021-1027, 1029, 1030, 1033-1038 (1028 kept)
- docs/17-key-ceremony-trustees.md:165, 531 (Pedersen and Feldman only), 532, 533
- docs/18-bulletin-board-transparency.md:527, 531, 533
- docs/19-client-supply-chain.md:356
- docs/20-voting-methods.md:351, 352, 355, 360, 361 (353 and 354 kept)
- docs/25-legal-compliance-licensing.md:207
- docs/28-data-model-storage.md:698
- docs/30-engineering-standards.md:316
- docs/32-federation-decentralization.md:161
- docs/34-test-vectors-conformance.md:460, 461
- docs/research/R-03-metadata-coercion-privacy-legal-research.md:57

Not edited (verdict CONTRADICTED, NOT-FOUND, CANNOT-CHECK, or a mixed row): 09:707, 16:582, 16:978, 13:347, 17:266, 27:156, 27:244, 20:353, 16:1028, 11:121, 11:454, 17:531 (GJKR 2007 part), 05:312, 10:632, 34:296, research R-01:62 (tag inside a note that also says "not confirmed"), R-02:111, and all others in the tables.
