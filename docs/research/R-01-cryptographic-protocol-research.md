# R-01 — Cryptographic Protocol Research for QuietVote

**Module ID:** `research-crypto-protocol`
**Status:** Draft
**Owner:** Cryptography lead (research)
**Last reviewed:** 2026-10-21
**Related specs:** QV-05 (Ballot Protocol), QV-07 (Threat Model), QV-11 (Testing/Assurance), QV-16 (byte-level protocol), QV-21 (post-quantum / everlasting privacy track); ADR-004/005/006/007/008/013 (`docs/decision-log.md`)

**Source legend.** Every URL has an access date of 2026-10-21 unless noted. `[F]` = fetched or surfaced by a search in this session. `[M]` = URL or detail given from the author's memory and not re-fetched in this session; confirm before citing externally. `[UNVERIFIED]` = a factual claim I could not confirm. This document is research input, not a normative spec. It does not invent cryptography. Where it composes standard building blocks in a way I could not find published in that exact form (ranked pairwise proofs, §6), it says so and requires review.

---

## 0. Executive summary

1. **ADR-004 is a sound lineage choice** (Helios → ElectionGuard / Belenios). The historic failures of this family are almost all implementation and specification errors, not breaks of ElGamal or sigma protocols. The recurring ones are:
   - Fiat–Shamir hashes that omit part of the statement ("weak Fiat–Shamir" / "Frozen Heart").
   - Ballots not bound to a voter or context, which allows replay and copy attacks.
   - Missing or unchecked proofs.
   - Trapdoor or unverifiable parameters.
   - Trustees that decrypt whatever the server hands them.
   - Key-ceremony and key-loss failures.
   - Clients and servers controlling the randomness.
2. **The hard-to-get-right parts for QuietVote are not the ElGamal and CDS proofs.** They are: (a) the DKG transcript and complaint rules, (b) the strict statement-binding rules for every Fiat–Shamir hash, (c) trustees independently recomputing the tally input, (d) the revoting and inclusion-receipt semantics against a malicious bulletin board, and (e) the client-delivery problem (ADR-010).
3. **Phase 2 (RFC 9474 blind-signed tokens) is a good fit** if the signer's public key is bound to the manifest (anti-tagging) and issuance is logged. **Phase 3 (Semaphore-style SNARK membership) has a poor fit** with ADR-003/004: a trusted setup, BN254, and under-constrained-circuit risk. If registrar-free anonymity is wanted without a trusted setup, prefer a **ristretto255 one-out-of-many (Groth–Kohlweiss-style) membership proof with a DLEQ-based scope nullifier**. That is a published family but needs its own review (§7.5). **Linkable ring signatures** are workable for small rolls (N ≲ 1,000) but are linear in size.
4. **MACI is unsuitable** as the core, because its coordinator sees every vote. This conflicts with ADR-001 and ADR-008.
5. **Ranked-choice by homomorphic pairwise matrix is feasible** for n ≲ 10 candidates (O(n²) ciphertexts and O(n³) small proofs per ballot). A strict-ranking proof via forbidden 3-cycles is the proposed composition (§8). Keep it Phase 2 (ADR-006) and review it before building.
6. **Coercion resistance is not achievable at reasonable cost** in this architecture. ADR-008 non-claims are right. Revoting helps only partially, and it interacts badly with Phase 1 participation visibility (§9). Post-quantum ballot privacy is a research track, and the interim plan is short-lived keys (§9.4).

---

## 1. Systems survey: design lessons and published failures

### 1.1 Helios (Adida 2008; Helios v3/v4 deployed at heliosvoting.org, used by IACR, universities)
**What it is.** Browser-based voting with exponential or additive ElGamal, CDS 0/1 proofs, homomorphic tally for approval/ single-choice, threshold decryption, and the Benaloh cast-or-audit challenge. Adida, "Helios: Web-based Open-Audit Voting", USENIX Security 2008. https://www.usenix.org/legacy/event/sec08/tech/full_papers/adida/adida.pdf [M]. Code: https://github.com/benadida/helios-server [M].

**Published attacks and failures:**

| Issue | Source | Lesson for QuietVote |
|---|---|---|
| **Ballot replay / copy breaks privacy.** Helios 2.0 ballots were not independent. A voter could re-submit (replay) another voter's ciphertext and proofs. In a small election the duplicated option becomes visible in the tally and reveals the victim's vote. The authors demonstrated it on the live code and proposed weeding duplicates plus voter-identity binding. | Cortier & Smyth, "Attacking and fixing Helios: an analysis of ballot secrecy", CSF 2011 / JCS 2013. https://eprint.iacr.org/2010/625 [F]; https://hal.archives-ouvertes.fr/hal-00732899 [F] | Bind every proof to the voter or token context. Reject duplicate ciphertext tuples. Sign ballots with the voter or token key (QV-REQ rules in §12). |
| **Weak Fiat–Shamir in Helios.** The hash did not cover the full statement (ciphertext, in particular). That allowed proofs for ciphertexts the adversary could not open, and so related-ciphertext (mauling) attacks on privacy and validity. Fix: "strong" FS and labelled ciphertexts. | Bernhard, Pereira & Warinschi, "How not to prove yourself: pitfalls of the Fiat–Shamir heuristic and applications to Helios", ASIACRYPT 2012. https://eprint.iacr.org/2012/185 [F, ID surfaced by search]. Also Bernhard, Cortier, Pereira, Smyth, Warinschi, "Adapting Helios for provable ballot privacy", ESORICS 2011 [M] | Hash everything: group, generator, key, ciphertext, commitments, context, proof type. §4.1. |
| **Clash attacks.** A malicious server or client can give two voters the same ballot, so one ballot is recorded for two receipts and both voters "verify". This breaks end-to-end verifiability although individual and universal verifiability each hold. | Küsters, Truderung & Vogt, "Clash attacks on the verifiability of e-voting systems", IEEE S&P 2012 (dblp lists it; paper text not fetched). Same authors' 2011 observation that individual + universal verifiability does not imply overall verifiability [F, via search] | Voter-key or token-key signatures and per-voter sequence numbers make two receipts for one stored ballot impossible. Receipt = hash of the signed ballot, including the voter or token public key (§5.4). |
| **Verifiability and corruption scenarios.** Automated analysis (Tamarin) found further attacks and gaps in Helios and Belenios under particular corruption patterns (for example, a corrupt registrar or server plus a dishonest voter device). | Baloglu, Bursuc, Mauw, Pang, "Election verifiability revisited: automated security proofs and attacks on Helios and Belenios", CSF 2021 [F, via search] | Write verification procedures explicitly per corruption scenario (QV-05 guarantee table). Do not claim "verifiable" without naming which party must be honest. |
| **Client-delivery trust.** Helios's JavaScript comes from the server, so a malicious server can serve a ballot-encryption client that cheats. | Known design limitation, discussed in Adida 2008 [M] | ADR-010. Independent CLI verifier, reproducible builds, Benaloh audit with a second device. |
| **Trustee key loss ends the election.** [UNVERIFIED — recalled from an IACR announcement in late 2025 that an IACR Helios election was annulled and rerun because a trustee lost a private key; confirm against the IACR announcement.] | — | Use t-of-n, not n-of-n, with documented share backup; rehearse the trustee ceremony (§5.2). |

### 1.2 ElectionGuard (Microsoft, MIT-licensed SDK; Benaloh et al.)
**What it does.**
- Exponential ElGamal over a Schnorr (finite-field) subgroup, with CDS/Chaum–Pedersen range proofs.
- Homomorphic tally.
- Threshold decryption by "guardians" via a Pedersen/Feldman-style key ceremony.
- Spoiled-ballot (Benaloh) challenges.
- A published verifier specification so independent verifiers can be written.
- Designed as an add-on to vote-capture devices (in-person or hybrid) rather than a complete election system.

**Spec versions.** The official specification page lists **2.1 as the newest**, above 2.0, 1.1, 1.0, 0.95, 0.85. https://electionguard.vote/spec/ [F via search; page not directly fetchable here, release date not confirmed]. Per the release notes surfaced by search: 2.0 cut proof sizes in the election record by more than 90% and removed "placeholder selections"; 2.1 revised hash computation steps in many places. Go verifiers for 1.1 and 2.0 report ~2x overall verification speed-up and ~24x faster decryption for 2.0 (Jensen et al., E-Vote-ID 2024) [F, via search; title only]. The College Park (MD) 2023 pilot used a hybrid of 2.0 / 1.53 / 1.1 and a pilot-only 1.91 build [F].
- **Parameters (from memory, confirm against the spec).** 4096-bit prime p, 256-bit subgroup order q, SHA-256-based hashing. [UNVERIFIED for 2.1.] QuietVote deliberately differs: ristretto255 instead of a finite-field group (smaller, faster, built-in canonical encoding).

**Reviewer findings and issues.**
- Haines, Goré & Stodart, "Machine-checking the universal verifiability of ElectionGuard" (the paper reports that parts of the system had been verified for software bugs but not for cryptographic security). https://eprint.iacr.org/2020/1477 [F, via search]. I could not confirm the detailed list of specification discrepancies; read the paper before relying on it.
- "Verifying ElectionGuard — a theoretical and empirical analysis" (GI proceedings). https://dl.gi.de/items/3bd629bb-cf25-48c9-988d-a9461ce060ef/full [F, title/URL via search].
- Benaloh & Naehrig et al., ElectionGuard design paper, eprint 2024/955 [F as an ID in results; authorship/title not confirmed — `[UNVERIFIED]`].
- **Design lesson that is not a bug, but matters to QuietVote:** ElectionGuard decrypts and publishes spoiled (challenged) ballots. That reveals the spoiled selections to everyone. QuietVote's Benaloh flow should reveal the audit opening only to the voter's own verifier (§5.5).
- I did **not** find a public "Frozen Heart"-class break of ElectionGuard. Treat any statement beyond the above as `[UNVERIFIED]`.

### 1.3 Belenios (Cortier, Gaudry, Glondu; Inria Nancy)
- Helios-like (ElGamal, homomorphic or mixnet-ish for complex rules), plus voter credentials: a registrar generates one signing keypair per voter, and each ballot is signed with that credential key, so ballot stuffing by the server is detectable.
- The credential authority is trusted for eligibility, not for secrecy.
- Verifiability holds if the registrar and the server are not both dishonest.
- Spec and code: https://www.belenios.org/ [M]. Paper: Cortier, Gaudry, Glondu, "Belenios: a simple private and verifiable electronic voting system" (2019) [M].
- BeleniosRF (receipt-free variant using randomizable signatures): Chaidos, Cortier, Fuchsbauer, Galindo, CCS 2016 [M]. <!-- claims-lint-ignore -->
- **Lessons:** signed ballots with per-election voter keys (this is exactly QuietVote Phase 1); published credential commitments; the CSF 2021 corruption-scenario analysis above.

### 1.4 Civitas and JCJ (coercion resistance)
- JCJ: Juels, Catalano & Jakobsson, "Coercion-resistant electronic elections", WPES 2005. https://eprint.iacr.org/2002/165 [M]. Civitas implementation: Clarkson, Chong & Myers, IEEE S&P 2008 [M]. <!-- claims-lint-ignore -->
- **Idea:** voters hold a secret credential and can submit fake credentials that are indistinguishable from real ones. Tally eliminates duplicates and invalid credentials with plaintext-equivalence tests (PETs) after a mix.
- **Costs and issues:** quadratic tally cost in the number of submitted ballots (JCJ's original design), an anonymous channel assumption, a trusted untappable registration channel, and a coercer who can demand the credential at registration. Linear-time variants exist (Araújo, Foulle & Traoré 2010 [M]; Spycher, Koenig, Haenni & Schläpfer 2011 [M]). Later work reports weaknesses in ballot-cleansing that can leak information to a coercer [F; Cortier, Gaudry and Yang, "Is the JCJ voting system really coercion-resistant?", CSF 2024, long version https://eprint.iacr.org/2022/430; `[VERIFIED: eprint 2022/430, per part-2-standards-crypto.md C39]`]. <!-- claims-lint-ignore -->
- **Verdict for QuietVote:** out of scope for MVP and Phase 2. Do not build on JCJ without a dedicated project.

### 1.5 Prêt à Voter and Scantegrity (paper-based E2E)
- Prêt à Voter (Ryan, Bismark, Heather, Schneider, Xia, IEEE TIFS 2009 [M]): candidate order randomised per ballot; the receipt is the ballot's marked half; mixnet tally. Scantegrity II (Chaum et al., 2008 [M]): invisible-ink confirmation codes; used in binding municipal elections in Takoma Park, MD (2009, 2011) [M].
- **Lessons:** the receipt/randomisation and printing-authority issues. For example, a printer or authority that sees ballot permutations learns the voter's choice. Paper E2E systems need trusted ballot-printing and chain-of-custody. Neither is reproducible in a remote web system.
- **Relevance:** background for the verification vocabulary (cast-as-intended, recorded-as-cast, tallied-as-recorded). No direct reuse.

### 1.6 Scytl / Swiss Post (and CHVote)
- **2019 trapdoor finding.** Lewis, Pereira & Teague, "Ceci n'est pas une preuve: the use of trapdoor commitments in Bayer–Groth proofs and the implications for the verifiability of the Scytl–SwissPost Internet voting system" (12 March 2019). The commitment parameters were generated so that an authority knowing the trapdoor could produce a shuffle proof that verifies while altering votes. The first mix could substitute votes whose randomness it knows, and the last mix could do so without that. https://sarahjamielewis.com/evoting/UniversalVerifiabilitySwissPost.pdf [F]; summary https://sarahjamielewis.com/log/2019/swiss-post-1.html [F]. Proposed fix: parameter generation that provides evidence no trapdoor is known.
- **Fiat–Shamir and cast-as-intended failures.** Haines, Lewis, Pereira & Teague, "How not to prove your election outcome", IEEE S&P 2020. Flawed Fiat–Shamir implementations let a cheating decryption service make false decryption proofs that verify but decrypt to a different plaintext ("valid votes into nonsense"). A follow-up shows a cheating client can fake the return-code proof in the individual-verifiability path. Swiss authorities suspended the system. https://openprivacy.ca/research/HowNotToProveYourElectionOutcome-IEEESP2020/ [F]; https://sarahjamielewis.com/evoting/HowNotToProveElectionOutcome.pdf [F]; addendum https://sarahjamielewis.com/log/2019/swisspost-addendum.html [F].
- **Process lesson.** The researchers criticised the bug bounty's restrictive disclosure terms [F, via search]. Plan an open vulnerability-reporting policy (QV-07).
- **Related.** NSW iVote 2015: Halderman & Teague, "The New South Wales iVote system: security failures and verification flaws in a live online election", VoteID 2015 (TLS FREAK downgrade, and a verification service that could be bypassed) [M]. CHVote (Geneva): Haenni, Koenig, Locher & Dubuis, "CHVote system specification", eprint 2017/325 [M]. A rigorous public specification worth imitating for QV-16.
- **Lessons:**
  - Never ship a "verifier" that skips any proof.
  - Check that parameters have no trapdoor (we use hash-derived generators with no setup, §4.4).
  - Verifiability claims are void if an individual proof can be forged.

### 1.7 Estonia i-voting
- Double-envelope RSA design: an outer signed envelope (identity via national ID card, Mobile-ID, Smart-ID) and an inner encrypted ballot; revoting allowed; in-person vote overrides; a verification app (QR) added in 2013 [M].
- Independent review: Springall, Finkenauer, Durumeric, Kitcat, Hursti, MacAlpine & Halderman, "Security analysis of the Estonian Internet voting system", ACM CCS 2014. Authors observed the 2013 elections, reviewed source and reverse-engineered, and demonstrated lab attacks on servers and voter clients. They concluded that the architecture and procedures posed serious risks, even under an insider / state-actor threat model, and recommended discontinuing the system. https://estoniaevoting.org/findings/paper/ [F]; summary https://estoniaevoting.org/findings/summary/ [F]. Government disputed some framing [F].
- **Lessons:** the client trust problem and weak operational security (procedural controls, logging, key handling) dominate; verification apps that cover only a small share of voters give weak detection; revoting is the practical coercion mitigation they chose (§9.2). Details of attack classes beyond those above: `[UNVERIFIED]`, read the paper.

### 1.8 Moscow DEG (2019 and later)
- Gaudry & Golovnev, "Breaking the encryption scheme of the Moscow internet voting system" (Aug 2019). The system used ElGamal with 256-bit keys (three ElGamal encryptions of 256-bit keys, per Golovnev's note), so private keys could be recovered from public keys in minutes (~20 minutes on a PC per press coverage). After the fix, a second attack showed the scheme was not semantically secure and could be used to count the votes for a candidate. Gaudry also noted that the implementation worked in groups of even order, which leaks one bit of the message. https://arxiv.org/pdf/1908.05127 [F]; https://arxiv.org/pdf/1908.09170 [F].
- Later Moscow deployments (2020–2021, Ethereum-based storage with ElGamal and a trusted decryption key holder) were reported to offer little verifiability and to have further issues in independent reviews. Details `[UNVERIFIED]`.
- **Lessons:** (a) use a prime-order group, and where encodings are canonical (ristretto255 gives this) there is no cofactor leak; (b) use parameters sized for ≥128-bit security (ristretto255 ≈ 126-bit); (c) a key held by one authority is not "threshold".

### 1.9 Cross-system pattern table

| Failure class | Seen in | QuietVote control |
|---|---|---|
| Weak Fiat–Shamir (statement not hashed) | Helios, Swiss Post/Scytl, Bulletproofs/PlonK libs | §4.1 transcript rules; KATs; negative tests |
| Replay / copy / clash | Helios, KTV targets | Signed, context-bound ballots; per-voter sequence; receipt includes voter/token key |
| Setup trapdoor | Scytl shuffle commitments | No structured setup; hash-derived generators with public derivation |
| Unverified / skippable proofs | Swiss Post cast-as-intended | Verifier must reject on any missing proof (negative test per proof type) |
| Small keys, even-order groups | Moscow DEG | ristretto255; canonical decoding |
| Client / server delivers cheating client | Helios, Estonia, iVote | ADR-010, Benaloh audits, independent verifier |
| Trustee loses key / refuses | IACR Helios (`[UNVERIFIED]`) | t-of-n; ceremony rehearsal; share backup |
| Server asks trustees to decrypt individual ballots or arbitrary subsets | Generic threshold-decryption risk | §5.3 trustees recompute the tally input; sign it |
| Operational / TLS errors | iVote 2015, Estonia | ADR-009; modern TLS only; no downgrade |

---

## 2. Group and encoding: ristretto255

- **Standard:** RFC 9496, "The ristretto255 and decaf448 Groups" (Dec 2023) https://www.rfc-editor.org/rfc/rfc9496 [M]. Prime order ℓ = 2²⁵² + 27742317777372353535851937790883648493 (same as the Ed25519 base-point order); cofactor is abstracted away; 32-byte canonical encodings; decoding rejects non-canonical or invalid encodings.
- **Hash to group/scalar:** RFC 9380 (hash-to-curve; `expand_message_xmd` with SHA-512) https://www.rfc-editor.org/rfc/rfc9380 [M]; the ristretto255 hash-to-group suite `ristretto255_XMD:SHA-512_R255MAP_RO_` is defined in RFC 9497 (OPRF) https://www.rfc-editor.org/rfc/rfc9497 [M]. Scalars from 64 uniform bytes reduced mod ℓ (bias ≈ 2⁻²⁵⁰).
- **Library (ADR-003):** `@noble/curves` provides ristretto255. API names differ between major versions (`RistrettoPoint` in 1.x; a renamed export in 2.x `[UNVERIFIED]`); pin an exact version and cover the API with known-answer tests (the RFC 9496 test vectors).
- **Why this avoids Moscow/Monero-class bugs:** no small-order components. CryptoNote-family key-image bugs exploited cofactor-8 Ed25519 points (2017 CryptoNote disclosure and 2018 Monero fix) `[M, URLs not verified]`. Moscow's even-order group leaked a bit (§1.8).
- **Rules:**
  - Decode all points with the library's strict decoder; reject failure.
  - Reject the identity point where it is cryptographically meaningless (c₁, public keys, DKG commitments A_{i0}, Y_i).
  - Scalars must be canonical (< ℓ) when parsed from the wire.
  - Never use Ed25519 `Point` APIs for group-element protocol data.

---

## 3. Exponential ElGamal on ristretto255

### 3.1 Scheme
- Key: x ← Z_ℓ, Y = xG.
- Encrypt m ∈ Z_ℓ (small): (C₁, C₂) = (rG, mG + rY), r ← Z_ℓ uniform.
- Homomorphic add: component-wise point addition.
- Decrypt: mG = C₂ − xC₁; recover m by discrete log in a known range (§5.6).
- **Security.** IND-CPA under DDH in ristretto255. The scheme is malleable by design, so non-malleability must come from the surrounding proofs and signatures (§4, §5.4).
- **Randomness.** r from a CSPRNG (`crypto.getRandomValues`), independent per selection. Never derive r deterministically from the vote. For proof nonces use hedged derivation (hash of secret ‖ statement ‖ 32 fresh random bytes) so an RNG failure does not leak r. Nonce reuse across two proofs reveals the secret (standard Schnorr/CP fact).

### 3.2 CDS disjunctive proof that a selection encrypts 0 or 1
Cramer, Damgård & Schoenmakers, "Proofs of partial knowledge and simplified design of witness hiding protocols", CRYPTO 1994 [M]; used in Helios/ElectionGuard. Statement: (G, Y, C₁, C₂); branch 0 proves log_G C₁ = log_Y C₂ (=r); branch 1 proves log_G C₁ = log_Y (C₂ − G).
- Prover knows r and the real bit b. For the simulated branch (1−b): choose c_{1−b}, z_{1−b} at random; compute commitments (A,B)_{1−b} = (z·G − c·C₁, z·Y − c·(C₂ − (1−b)G)). For the real branch: nonce w, (A,B)_b = (wG, wY). Challenge c = H(transcript including **both** branches' commitments); c_b = c − c_{1−b}; z_b = w + c_b·r.
- Verifier recomputes all four commitments, recomputes c, and checks c₀ + c₁ = c.
- **Soundness depends on the hash covering the entire statement and both commitments (§4.1).**

### 3.3 Contest-limit proof (selection-count constraint)
- Aggregate C_sum = Σ selections (point addition). Prove the plaintext is in an allowed set S_L (for "exactly k": S = {k}; for "at most L": S = {0..L}).
- For {k} use a Chaum–Pedersen equality proof on (C₁, C₂ − kG). For ranges {0..L} use a CDS OR with L+1 branches (cost O(L)). Approval voting (L = n) needs no sum proof, because each bit is already 0/1.
- ElectionGuard 1.x used placeholder selections to turn "at most L" into "exactly L"; 2.0 removed them (§1.2). QuietVote should use the OR over {0..L} directly.
- Empty ballot / abstention: explicit; decide in QV-05 whether undervotes count toward quorum.

### 3.4 Chaum–Pedersen
Chaum & Pedersen, "Wallet databases with observers", CRYPTO 1992 [M]. Equality of discrete logs: log_G P = log_H Q. Used for decryption proofs (§5.3) and the DKG share-reveal (§5.2). Same FS-binding rules.

---

## 4. Fiat–Shamir: domain separation and statement binding

### 4.1 Why this is the top-priority rule
- "Frozen Heart" (Trail of Bits, April 2022): FS implementations that hash only part of the statement or proof allow forged proofs for false statements in Bulletproofs, PlonK and Girault implementations (Dusk, SnarkJS, gnark affected). https://blog.trailofbits.com/2022/04/13/part-1-coordinated-disclosure-of-vulnerabilities-affecting-girault-bulletproofs-and-plonk/ [F]; https://blog.trailofbits.com/2022/04/15/the-frozen-heart-vulnerability-in-bulletproofs/ [F]; https://blog.trailofbits.com/2022/04/18/the-frozen-heart-vulnerability-in-plonk/ [F]; CVE-2022-29566 [F]. Academic treatment: Dao, Miller, Wright, Grubbs, "Weak Fiat-Shamir attacks on modern proof systems", IEEE S&P 2023 / eprint 2023/691 [F — eprint ID surfaced; author list from memory]. The paper notes incorrectly applying FS can even break classic protocols such as Schnorr's.
- Bernhard–Pereira–Warinschi (Helios) and Haines et al. (Swiss Post) are the voting-specific instances (§1.1, §1.6).

### 4.2 Normative transcript rules (proposed for QV-16)
1. **One hash function, one encoding.** `challenge = hash_to_scalar(DST, encode(fields))`, using `expand_message_xmd(SHA-512)` (RFC 9380) to 64 bytes, reduced mod ℓ.
2. **DST** (domain-separation tag) is a fixed ASCII string unique per proof type and version, for example `QV-v1-FS-CDS01`, `QV-v1-FS-CP-DEC`, `QV-v1-FS-SCHNORR-POP`, `QV-v1-FS-DLEQ-SHARE`, `QV-v1-FS-SUMRANGE`. No two proof types share a DST.
3. **Encoding is injective:** every field is prefixed by a 4-byte big-endian length (and a 1-byte type tag for structured items). Concatenating unprefixed values is forbidden (ambiguity attacks: (ab, c) vs (a, bc)).
4. **The hashed transcript must include, in this order:** protocol/version id; **election id = hash of the signed manifest**; contest id and selection index; the proof's role (for a multi-part proof); generators (G and any other base) as encoded points; the election public key Y (or trustee public share Y_i); **every public input** (the ciphertext components, aggregates, claimed plaintext); **all prover commitments** (every A, B, in every branch); **the ballot context label** (voter public key or token public key, ballot sequence number) — Bernhard et al.'s "labelled ciphertext".
5. **The verifier recomputes the challenge from the received statement and commitments.** It never trusts a challenge supplied in the proof except as a value to compare.
6. **Strict decoding** of every element and scalar before hashing (non-canonical = reject).
7. **Negative tests mandatory:** for each proof type, mutate each statement field and each commitment independently; verification must fail. This catches an omitted field because the test would pass if the field were omitted from the hash (§12 checklist).
8. **No cross-protocol reuse:** a Schnorr PoP from the DKG must not verify as a signature in any other context.

### 4.3 Test vectors and independent verification
- Publish known-answer tests with the protocol spec. Require that an independently written verifier (CLI, ADR-010) passes all vectors and rejects all negative vectors.
- Consider a machine-checked or at least second-implementation check for the verifier (Haines–Goré–Stodart is precedent for ElectionGuard [F]).

### 4.4 Generators
- ElGamal and Feldman-DKG need only G (the ristretto255 base point). If a second generator H is needed (Pedersen commitments, §9.3 everlasting privacy), derive H = hash_to_group("QV-v1-H", election_id) by the RFC 9380/9497 suite, so nobody knows log_G H and there is no setup trapdoor (the Scytl lesson, §1.6).

---

## 5. Threshold key generation, trustees, and decryption

### 5.1 Options considered

| Option | Pros | Cons |
|---|---|---|
| n-of-n additive (Helios style) | Simplest; no complaint logic | Any lost key kills the election (IACR `[UNVERIFIED]`) |
| Trusted-dealer Shamir | Simple; robust | Dealer sees the key; violates ADR-008 |
| **Feldman/Pedersen-style DKG with PoP (PedPop/SimplPedPop lineage)** | No dealer; t-of-n; verifiable shares; published security proof for the signature use-case | Needs a broadcast channel (our bulletin board), complaint rules, authenticated trustees |
| Gennaro et al. "New-DKG" | Uniform key distribution | Extra round and complexity |

**Recommendation:** Feldman-based DKG with Schnorr proofs of possession, transcript certification, and board-based complaint resolution (below). The structure follows Pedersen (EUROCRYPT 1991 [M]), Gennaro–Jarecki–Krawczyk–Rabin (JoC 2007), FROST's DKG (Komlo & Goldberg, SAC 2020 [M]), SimplPedPop / ChillDKG (Chu, Gerhart, Ruffing & Schröder, "Practical Schnorr threshold signatures without the algebraic group model", CRYPTO 2023 [F, via search]; ChillDKG BIP draft, Blockstream write-up https://blog.blockstream.com/the-key-to-frost-what-is-distributed-key-generation/ [F]). RFC 9591 standardises FROST signing but not the DKG [F]. https://www.rfc-editor.org/rfc/rfc9591 [M].

### 5.2 Protocol sketch (all messages signed by the trustee's long-term Ed25519 key and appended to the log)
**Round 0 (setup).** Manifest lists trustees' signing keys and encryption keys, n, t, election id.

**Round 1 (commit).** Trustee i picks a degree t−1 polynomial f_i with secret coefficients a_{i,0..t−1}. It publishes commitments A_{i,k} = a_{i,k}G and a Schnorr proof of possession (PoP) for A_{i,0}, with the challenge bound to (election id, i, hash of the full commitment vector). *Binding the index and vector prevents another trustee from replaying i's A_{i,0} + proof.*

**Round 2 (shares).** Trustee i sends s_{i,j} = f_i(j) to each j, encrypted with ECDH + AEAD (key = H(DH point ‖ context)). Ciphertext is posted on the log (public transport; no private channels needed). Trustee j verifies s_{i,j}·G = Σ_k jᵏ A_{i,k}.

**Round 3 (complaints).** If a share fails, or never arrives, j posts a complaint. **Public adjudication:** the accused posts the ECDH shared point and a DLEQ proof (Chaum–Pedersen) that it is the correct shared secret. Anyone derives the AEAD key, decrypts, and checks the Feldman equation. This makes the verdict a deterministic function of the transcript:
- Share decrypts and verifies: complaint is false, and the complainer is flagged (policy: removed from QUAL for the next ceremony, or simply logged).
- Share is bad, missing, or the accused refuses by the deadline: the accused is disqualified.

Only the single shared point is revealed, which exposes just that one share; it does not reveal i's polynomial.

**Round 4 (qualification and finalisation).**
- QUAL = non-disqualified trustees, with |QUAL| ≥ t, else abort (fail closed).
- y = Σ_{i∈QUAL} A_{i,0}; Y_j = Σ_{i∈QUAL} Σ_k jᵏ A_{i,k} (anyone can compute all public shares); x_j = Σ_{i∈QUAL} s_{i,j}.
- **Certification:** each trustee signs the hash of the final transcript (y, QUAL, all commitment vectors, complaint outcomes). The signed hash is bound into the manifest before voting opens (ChillDKG's equality-check idea [F]).
- **Key-liveness check:** each trustee publishes a partial decryption with a Chaum–Pedersen proof on a public test ciphertext under y, proving it can decrypt, before the election opens. This catches wrong-share and lost-share problems before ballots exist.

### 5.3 Threshold decryption
- Partial decryption of aggregate ciphertext (C₁, C₂): D_j = x_j·C₁ with a Chaum–Pedersen proof that log_G Y_j = log_{C₁} D_j, bound per §4.2 to (election id, contest, selection, C₁, C₂, j, Y_j).
- Combine over any set S ⊆ QUAL, |S| ≥ t: mG = C₂ − Σ_{j∈S} λ_j D_j, with Lagrange coefficients λ_j (index j nonzero scalar, computed mod ℓ). Verify each partial proof before combining; discard bad contributors.
- Anyone verifies the published tally m by checking mG = C₂ − Σ λ_j D_j; they do not need to solve a discrete log.
- **Decryption-oracle attack (mandatory defence).** A malicious server could ask trustees to decrypt a single voter's ballot, or the aggregate of a chosen subset, disguised as "the tally". Trustee software shall:
  1. Fetch the log, verify the signed tree head and the election-close event, and verify all ballot signatures and proofs itself.
  2. Itself compute the final ballot set (latest valid ballot per voter or token, per the manifest's rule) and its aggregate.
  3. Sign a "tally input hash" (set hash + aggregate) and decrypt **only** that aggregate; refuse any other ciphertext (individual ballots, sub-aggregates, or any aggregate not matching the closed election's input).
  4. Enforce a minimum aggregate size or small-electorate warning from the manifest (see non-claims on small groups, QV-07).
  ElectionGuard decrypts spoiled ballots by design; QuietVote does not (§5.5).
- Trustees should compare tally-input hashes with each other (via the log) so one trustee given a forged view is detected.

### 5.4 Malfeasance and failure matrix

| Event | Effect | Control |
|---|---|---|
| Rogue key: last trustee publishes A_{n,0} = target − Σ others, so it controls y | Full key compromise | PoP on every A_{i,0}, bound to index and vector; secure only if the hash binds the statement (§4.2). Gennaro-style hash-commit round optional |
| Replay of another trustee's commitment and PoP | Duplicate contribution without knowing the secret | PoP includes index i and full vector hash |
| Bad share sent privately | Trustee j has an inconsistent share; could abort or mis-decrypt | Round 3 public adjudication |
| False accusation | Griefing / delay | Accuser's evidence is publicly checkable; false accuser flagged; deadlines |
| Trustee withholds or disappears mid-DKG | Fewer than t in QUAL | Deadlines; abort and restart with replacement, before voting opens |
| Trustee unavailable at tally | If fewer than t available, no tally | t-of-n with n−t spare; backups; rehearsal |
| t trustees collude | Decrypt any ballot individually | Trust assumption (ADR-008); choose trustees from distinct organisations; publish who they are |
| Key bias (Gennaro et al., "Secure distributed key generation for discrete-log based cryptosystems", EUROCRYPT 1999; JoC 2007 [M]): a rushing adversary can bias the distribution of y by choosing disqualification after seeing honest commitments | y not uniform | For ElGamal ballot privacy and Schnorr-type uses the bias is not known to be exploitable (Gennaro et al., "Secure applications of Pedersen's distributed key generation", CT-RSA 2003 `[M]`, `[UNVERIFIED]` for exact statement). The SimplPedPop security proof covers the signature use-case. Document in review scope; optional commit-then-reveal of hash(A_i vector) before reveal narrows the window |
| Equivocation (trustee posts two different Round-1 messages) | Split-view attack on the group | Append-only signed log; second message is proof of misbehaviour and disqualifies |
| Trustee's ceremony machine compromised | Share leak | Air-gapped or hardware ceremony guidance; destroy after audit (ADR-013) |
| Lost key | Loss of availability | t-of-n; split backup (e.g. encrypted offline share escrow per trustee) |

### 5.5 Benaloh challenge (cast-or-audit)
Benaloh, "Simple verifiable elections", EVT 2006. https://www.usenix.org/legacy/event/evt06/tech/full_papers/benaloh/benaloh.pdf [M].
- **Flow:** device encrypts; **commits** to the ciphertext (shows a hash/tracking code) **before** the voter decides; voter chooses *cast* or *audit*. Audit: device reveals plaintext and randomness; an independent verifier re-encrypts and compares to the committed ciphertext. An audited ballot is **spoiled** and never counted; the voter then starts a fresh encryption.
- **Pitfalls and rules:**
  - The commitment must be visible to the voter (and recorded) before the choice, otherwise a cheating device could re-encrypt after learning the decision.
  - Audit decisions must be unpredictable to the device. Detection probability for a device that alters k ballots is 1−(1−p)^k with audit fraction p, so single-digit audit rates imply small but nonzero per-ballot detection; publish p-based assurance honestly (ADR-008 / QV-05).
  - Spoiled-ballot openings go to the voter's verifier (second device), not to the public board and not to trustees. Publish only the spoiled ciphertext hash so the operator cannot drop it unnoticed. Leaking spoiled plaintexts publicly gives vote-buyers a way to see plaintexts of challenged ballots.
  - The voting client shall delete the randomness of the cast ballot after submission (no receipt via retained r; limits but does not prevent the voter proving a vote if the client is hostile, §9).
  - Audit tool shall be independent code, ideally offline (ADR-010).

### 5.6 Discrete-log range for tallies (baby-step giant-step)
After decryption we have M = mG with 0 ≤ m ≤ B, where B = (max ballots) × (max weight per selection). BSGS (Shanks) needs ⌈√B⌉ table entries and ≤ √B giant steps.

| Bound B | Table size ⌈√B⌉ | Memory (32 B/entry, keyed by 8-byte prefix ≈ 16 B) | Giant steps |
|---|---|---|---|
| 10⁴ | 100 | negligible | ≤100 |
| 10⁶ | 1,000 | ~32 KB | ≤1,000 |
| 10⁸ | 10,000 | ~320 KB | ≤10,000 |
| 10¹⁰ | 100,000 | ~3.2 MB | ≤100,000 |
| 2⁴⁰ (≈1.1×10¹²) | 1,048,576 | ~33.5 MB | ≤1,048,576 |
| 2⁴⁸ | 16,777,216 | ~537 MB (too big for a browser; use time/memory trade-off or kangaroo) | ≤16.8 M |

- **Rule:** the manifest declares B; the verifier refuses a tally outside [0, B]; if no solution in [0, B] is found, treat as a decryption failure (investigate), not as "zero".
- **Ordinary elections:** B = number of eligible voters (unweighted) is ≤ 10⁶ and trivial. Weighted voting (ADR-006 Phase 2) with large weights requires a bound analysis in QV-05; prefer small integer weights.
- **Weight overflow:** keep B ≪ ℓ (no modular wrap; trivially true).
- **The CLI verifier does not need DLog**; it checks mG = C₂ − Σλ_jD_j.
- The tally table is public data, so constant-time lookup is unnecessary.

---

## 6. Ballot validity, replay, clash, revoting

### 6.1 Ballot structure (Phase 1)
Ballot = {election id, voter public key (or Merkle path to roll), sequence number s, previous-ballot hash, per-selection ciphertexts, CDS proofs, contest-limit proof, optional PoK of randomness, Ed25519 signature over the canonical encoding of everything before it}. All proofs include the ballot context label (voter key, s) in their FS hash.

### 6.2 Replay and copy
- Cortier–Smyth style copy is prevented by (a) context-bound proofs (a copied ballot's proofs do not verify under another voter's label), (b) the voter signature, and (c) rejecting duplicate ciphertext tuples across voters.
- A re-randomised copy (new r' with the same plaintext) is a *different valid ballot of the attacker's own*, but it cannot carry the attacker's label without a proof. The attacker cannot produce the CDS proof without knowing r (or the plaintext), so adding a PoK of randomness (Schnorr on C₁ bound to the label) makes this explicit. **SHOULD** include.

### 6.3 Clash and inclusion receipts
- Receipt = hash(signed ballot), including voter/token public key and sequence number, plus a log inclusion proof (RFC 9162-style) against a signed tree head (ADR-007). Because the voter key is inside the hash, two different voters cannot hold the same receipt.
- **Per-voter hash chain.** Each ballot includes the previous ballot's hash; this prevents silent reordering. The server can still drop the latest ballot, so: voters (or their client) shall fetch an inclusion proof for their latest ballot **and** check at election close that the closing snapshot contains it as the latest (the "revote dropped" attack). Monitors/witnesses detect split views via signed tree heads and consistency proofs.

### 6.4 Revoting semantics
- Latest valid ballot per voter (or token) counts; superseded ballots remain on the log (needed for audit), marked superseded by sequence number.
- Race at close: the manifest defines closing as a signed log position; ballots sequenced after it are invalid.
- Revoting interacts with coercion (§9.2) and with participation visibility in Phase 1: the public log reveals who voted and how many times.

---

## 7. Anonymous eligibility (Phases 2 and 3)

### 7.1 RFC 9474 blind RSA signatures (Phase 2)
- **Standard:** RFC 9474, "RSA Blind Signatures", Oct 2023, Informational, CFRG; authors Denis, Jacobs, Wood. Suite RSABSSA (RSA-PSS verifiable; variants include SHA-384/PSS, randomized or deterministic). https://www.rfc-editor.org/rfc/rfc9474 [F]. It is not on the Standards Track [F].
- **Proposed use:** token = a fresh Ed25519 (or ristretto-Schnorr) public key T. Voter (authenticated by the Phase 1 roll key) obtains a blind signature from the registrar over T. Ballots are signed with the secret key for T; the tally counts the latest valid ballot per T. Revoting keeps working and unlinkability to the voter holds against a registrar who does not see T.
- **Pitfalls:**
  1. **Key tagging / partitioning.** A signer can use a different RSA key per voter, so tokens identify voters. The manifest shall commit to exactly one signing key (and its modulus size), and clients shall refuse any other. RFC 9474 discusses the key-consistency issue in its privacy considerations `[M]`.
  2. **Issuance stuffing.** A malicious registrar can issue tokens for eligible abstainers. Mitigate with a public issuance log (voter id, request hash, voter signature on the request), so each voter can check that exactly one token was issued to them (or none, if they did not request). Cast ballots ≤ tokens issued ≤ roll size is a public check.
  3. **Metadata linkage.** Token request time/IP and ballot-cast time/IP are linkable by a network observer or the server if done from the same session. Separate the channels (Tor, delay), per ADR-009.
  4. **RSA is not post-quantum** and not on ristretto255; key size ≥ 3072 bits recommended for new deployments `[UNVERIFIED]` against current NIST/ENISA guidance at implementation time.
  5. **No blind Schnorr:** concurrent-session blind Schnorr is broken by the ROS/Wagner attack (Benhamouda, Lepoint, Loss, Orrù & Raykova, "On the (in)security of ROS", EUROCRYPT 2021 [M]). Do not substitute it for RSA-BSSA to stay "on ristretto".
  6. **Library:** `node:crypto` lacks a vetted blind-RSA API `[UNVERIFIED]`; ADR-003 forbids hand-rolling. Either use an audited implementation (for example Cloudflare's or Fastly's reference implementations, `[UNVERIFIED]` for current status) or defer Phase 2 until one is audited. <!-- claims-lint-ignore -->
  7. **VOPRF / Privacy Pass (RFC 9497, RFC 9578)** are not publicly verifiable, so a third party cannot verify tokens without the issuer's key. Not suitable for universal verification [F, RFC 9474 introduction].

### 7.2 Semaphore-style ZK membership with nullifiers (Phase 3)
- **Semaphore** (Privacy & Scaling Explorations): identity commitment in a Merkle tree; Groth16 proof of membership plus nullifier = hash(scope, secret); a message is bound to the proof. https://semaphore.pse.dev/ [M].
- **Pitfalls:**
  - **Trusted setup** (Groth16 ceremony) conflicts with ADR-001 (no structured setup).
  - **BN254** pairing curve: security is estimated around 100 bits after the Kim–Barbulescu NFS advances `[M]`, and it does not match ristretto255.
  - **Circuit bugs:** under-constrained Circom circuits are a recurring class of ZK failure `[M]`; every circuit requires an independent audit.
  - Nullifier scope must be bound to the election id; reused scope links participation across elections.
  - Anonymity set = all members in the tree; a small group reveals little.
  - Verifying a SNARK in the browser is workable, but the toolchain (Node, WASM) enlarges the trusted dependency base, against the ADR-003 minimal-dependency rule.
- **Alternative that keeps ristretto255 and needs no trusted setup (proposed for evaluation):** one-out-of-many membership proof (Groth & Kohlweiss, "How to leak a secret and spend a coin", EUROCRYPT 2015 [M]) over a Merkle-less list of Pedersen-style key commitments, O(log N) proof size, with a **nullifier N = x·H(election_id)** and a DLEQ proof tying N to the same x as the committed key. This family is used in Monero-adjacent protocols such as Triptych and Lelantus `[M]`. I did not find a ready-made, audited, ristretto255 election-specific implementation, so this is a **research item with a mandatory cryptographic review** (Proposed ADR QV-ADR-P-R01-3).

### 7.3 Linkable ring signatures
- LSAG (Liu, Wei & Wong, ACISP 2004 [M]), CLSAG (Goodell, Noether & RandomRun, 2019/2020 [M]). The signer signs with one of N keys and publishes a **key image** I = x·H(P). The same key always yields the same I, so double use is detected.
- **Pitfalls:**
  - **Cofactor / small-order key images:** the 2017 CryptoNote and 2018 Monero bugs came from images with small-order components. ristretto255 removes this, but still check the image is a valid non-identity element.
  - **Scope:** I must be H(P ‖ election_id)-scoped, or participation is linkable across elections. (Monero's image is election-independent by design.)
  - **Size and cost are O(N):** ~N×32 B of response scalars; at N = 1,000 about 32 KB per ballot plus linear verification. Acceptable only for small rolls (≲ 1,000).
  - **Ring = full roll** (no decoys by choice), so ring-selection side channels are moot.
  - Revoting under ring signatures reveals "same signer" (link), which is fine for latest-wins but leaks who revoted.
  - No receipt-freeness: the voter can prove authorship by revealing the signing key and ciphertext randomness.

### 7.4 MACI (Minimal Anti-Collusion Infrastructure)
- Buterin, "Minimal anti-collusion infrastructure", ethresear.ch 2019 [M]; PSE implementation. Voters send encrypted messages to a coordinator, who decrypts, processes in order, and publishes a zk-SNARK of correct processing. Voters can change their key to invalidate earlier votes, which makes bribes unverifiable **provided the coordinator is honest**.
- **Why it is not suited:** the coordinator sees every plaintext vote (a single point of secrecy trust, against ADR-001/008); it can censor (not forge) by dropping messages; it needs a SNARK trusted setup; it is built around chains. A threshold coordinator is conceivable, but that is a new protocol.
- **What to borrow:** the key-change message idea for revoting (a revote under a changed key makes the earlier vote unprovable), but note it adds no coercion protection against an adversary who sees the voter's device.

### 7.5 Summary table

| Mechanism | Anonymity of participation | Setup | Ballot size | Fit |
|---|---|---|---|---|
| Phase 1 signed roll | none (by design) | none | O(1) | Chosen (ADR-005) |
| RFC 9474 tokens | against server, if key is consistent | RSA key in manifest | O(1) | Good (Phase 2) |
| Linkable ring sigs | within roll | none | O(N) | Small rolls only |
| One-out-of-many + DLEQ nullifier | within roll | none | O(log N) | Promising; needs review |
| Semaphore (Groth16) | within tree | trusted setup, BN254 | O(1) | Poor fit |
| MACI | none vs coordinator | trusted setup | O(1) | Poor fit |

---

## 8. Ranked-choice by homomorphic pairwise matrix (Phase 2)

- **Why pairwise:** Schulze (Schulze, "A new monotonic, clone-independent, reversal symmetric, and Condorcet-consistent single-winner election method", Social Choice and Welfare 36, 2011 [M]) and Ranked Pairs (Tideman 1987 [M]) need only the aggregate matrix P[i][j] = number of voters preferring i over j. A homomorphic tally then reveals the matrix and nothing else. No individual ranking is ever decrypted, which avoids the "Italian attack" (pattern-marking of ranked ballots in a shuffle-decrypt tally) `[M]`.
- **Ballot encoding.** For n candidates, include one ciphertext b_{ij} ∈ {0,1} for each ordered pair i≠j, meaning "i is ranked above j". Constraints for a **strict total** ranking:
  1. Each b_{ij} ∈ {0,1}: CDS (§3.2).
  2. Antisymmetry: b_{ij} + b_{ji} = 1: a Chaum–Pedersen equality proof on the sum ciphertext (or send only b_{ij} for i<j and derive b_{ji} = 1 − b_{ij}, which removes this proof).
  3. Transitivity: for every triple (i,j,k), the cyclic sum b_{ij} + b_{jk} + b_{ki} ∈ {1,2}. A tournament has no 3-cycle iff it is transitive, and both cyclic orientations give sums 0 or 3, so a 2-way CDS OR on the sum ciphertext suffices.
- **Cost.** n(n−1)/2 independent bit ciphertexts; C(n,3) transitivity proofs (each a 2-branch OR) → O(n³). n = 8: 28 bits, 56 triples; n = 12: 66 bits, 220 triples. Recommend cap n ≤ 12 in the manifest, with a hard maximum validated by QV-05.
- **Ties and truncated ballots (partial rankings).** Use a ternary entry (prefer i, prefer j, no preference) as two bits with a one-hot constraint, and relax the transitivity check accordingly (weak order). The relaxation changes the soundness argument, so define it in QV-16 with a review before building.
- **Provenance.** I did not find this exact proof composition published as a complete scheme, so **it is a composition of standard CDS/CP building blocks that requires cryptographer review** (`[UNVERIFIED]` for prior publication). Do not ship until reviewed.
- **Tally.** Sum the ciphertexts per (i,j); threshold-decrypt n(n−1) small integers (≤ N each, BSGS trivial); compute Schulze/Ranked Pairs in a deterministic, specified tie-break procedure (declared in manifest, ADR-006). The matrix is public, so anyone reruns the algorithm.
- **Privacy caveats.** The aggregate matrix leaks information in small electorates (for example N = 2), and unanimity is visible. Declare minimum N for ranked contests.

---

## 9. Coercion resistance, receipt-freeness, everlasting privacy, post-quantum <!-- claims-lint-ignore -->

### 9.1 Definitions and literature
- Receipt-freeness: Benaloh & Tuinstra, STOC 1994 [M]; Hirt & Sako, EUROCRYPT 2000 [M]; Delaune, Kremer & Ryan, "Coercion-resistance and receipt-freeness in electronic voting", CSFW 2006 [M]. <!-- claims-lint-ignore -->
- Coercion-resistance: JCJ 2005 (§1.4). <!-- claims-lint-ignore -->
- BeleniosRF (§1.3) is a non-interactive receipt-free construction that depends on randomisable ballots and special signatures; it needs a trusted device for cast-as-intended `[M]`.
- **What Helios-family ballots allow:** a voter who keeps r can prove her vote, so this family is **not receipt-free**. If her device is controlled by the coercer, no software design helps.

### 9.2 Revoting
- Estonia (§1.7) uses revoting plus in-person override as the coercion mitigation. Concerns: the coercer can watch for revoting (public participation, vote counts), a coerced voter may not be able to revote after the coercer departs if devices are taken, and the coercer could demand the final submission at the deadline.
- QuietVote Phase 1 has visible participation and (on the log) visible revote counts, which are *worse* for coercion than anonymous schemes. Options (to decide in QV-05/QV-07): publish only a final aggregate set count, keep superseded ballots on the log but not tied to a voter pre-close, or accept and document. **Recommendation:** document the limitation; offer a policy "revoting disabled" or "revoting allowed" in the manifest, and do not claim coercion resistance (ADR-008).

### 9.3 Everlasting privacy
- Idea: public records contain only information-theoretically hiding commitments (so that no future computational break reveals votes), with the openings transported secretly to the tallier. Moran & Naor, "Receipt-free universally-verifiable voting with everlasting privacy", CRYPTO 2006 [M]; Arapinis, Cortier, Kremer & Ryan, "Practical everlasting privacy", POST 2013 [M]; Cuvelier, Pereira & Peters, "Election verifiability or ballot privacy: do we need to choose?", ESORICS 2013 [M]; Locher, Haenni & Koenig on coercion-resistant internet voting with everlasting privacy, 2016 [M]. <!-- claims-lint-ignore -->
- Typical construction on our group: Pedersen commitments com = vG + rH (H per §4.4) are perfectly hiding. Openings travel to the trustees under threshold encryption; verifiability comes from proofs on the commitments. Cost: the secret channel for openings is still computationally protected, so it protects the *public record* long-term, not the private channel. Perfect hiding also means *computational binding only*, which is acceptable for a one-off election record but weakens "verifiability against unbounded adversaries."
- Treat as research item QV-21; do not claim in MVP.

### 9.4 Post-quantum
- Shor's algorithm breaks ristretto255 ElGamal and Ed25519. Harvest-now-decrypt-later risk applies to ballots on the public log (ADR-013). Interim mitigations: short-lived election keys; trustee share destruction after the audit window; never reuse keys across elections; Tor/TLS metadata already visible.
- Standards: NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA), Aug 2024 [M] https://csrc.nist.gov/projects/post-quantum-cryptography. Hybrid signatures (Ed25519 + ML-DSA) are plausible for the log and manifest to protect long-term *integrity evidence*. ML-DSA availability in `@noble/post-quantum` `[VERIFIED: noble-post-quantum README (ML-DSA), 2026-10-21]`; ADR-003 requires audited libraries. <!-- claims-lint-ignore -->
- Lattice-based voting research: Costa, Martínez & Morillo, "Lattice-based proof of a shuffle", 2019 [M]; Aranha, Baum, Gjøsteen, Silde & Thunberg, "Lattice-based proof of shuffle and applications to electronic voting", CT-RSA 2021 [M]; Boyen, Haines & Müller, "A verifiable and practical lattice-based decryption mix net with external auditing", ESORICS 2020 [M]. All are research-grade; none is a drop-in replacement for exponential ElGamal + CDS.
- **Note:** PQ confidentiality and PQ soundness are different needs. Elections need computational soundness only during the election (a quantum break afterwards cannot change the already-published outcome, though it can undermine long-term audit evidence), whereas confidentiality has to last decades. This favours the everlasting-privacy design (§9.3) over a full PQ migration.

---

## 10. Requirements derived from this research

IDs are `QV-R01-REQ-nnn` for traceability; they are proposed inputs for QV-05/07/11/16 and carry no force until adopted.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-R01-REQ-001 | Every Fiat–Shamir challenge shall hash a length-prefixed, injective encoding of the full statement per §4.2 with a unique DST per proof type. | Must | Mutating any statement field or commitment makes verification fail, for every proof type | Negative-vector tests; code review |
| QV-R01-REQ-002 | Ballot proofs shall be bound to election id and ballot context (voter or token key and sequence number). | Must | Copying a ballot under another context fails verification | Test |
| QV-R01-REQ-003 | The verifier shall reject any ballot with a missing, malformed, or non-verifying proof; no "skip proof" path. | Must | Fuzzed/missing-proof ballots rejected | Test; independent verifier |
| QV-R01-REQ-004 | All group elements and scalars shall be decoded strictly (canonical, on-curve/valid ristretto255); identity rejected where meaningless. | Must | RFC 9496 negative vectors rejected | Test |
| QV-R01-REQ-005 | The DKG shall require a PoP for each A_{i,0} bound to index and commitment vector, public complaint adjudication, signed transcript certification, and a key-liveness test before the election opens. | Must | A simulated rogue-key, bad-share, and withholding trustee are each excluded or abort | Test; review |
| QV-R01-REQ-006 | Trustees shall recompute the final ballot set and aggregate and shall decrypt only that aggregate. | Must | Request to decrypt an individual ballot or sub-aggregate is refused | Test |
| QV-R01-REQ-007 | The manifest shall declare the tally bound B; the verifier shall reject tallies outside [0,B]. | Must | Out-of-range tally rejected | Test |
| QV-R01-REQ-008 | Benaloh audit data shall go to the voter's verifier only; the commitment shall be recorded before the cast/audit choice. | Must | Spoiled openings never appear on the public log | Test; review |
| QV-R01-REQ-009 | The client shall delete encryption randomness after the cast. | Should | No randomness persisted in storage | Inspection |
| QV-R01-REQ-010 | The signed manifest shall commit to a single blind-signing public key (Phase 2) and the issuance log shall be public. | Must (Phase 2) | Clients refuse other keys; issuance count ≤ roll size is checkable | Test |
| QV-R01-REQ-011 | Ranked ballots shall not ship before independent review of the transitivity-proof composition. | Must (Phase 2) | Review report on file | Review |
| QV-R01-REQ-012 | The protocol spec shall publish known-answer vectors and require a second, independently written verifier to pass them. | Must | CI cross-check passes | CI |
| QV-R01-REQ-013 | The spec shall state explicitly: no coercion-resistance or receipt-freeness; participation visible in Phase 1. | Must | Present in user-facing and spec text | Review |

---

## 11. Required security properties and attacks-to-test checklist

### 11.1 Properties (each needs a named adversary and assumption in QV-05)
- [ ] **Ballot secrecy** vs observers and operator, with up to t−1 colluding trustees.
- [ ] **Eligibility:** only roll keys (Phase 1) / valid tokens (Phase 2) produce counted ballots.
- [ ] **One counted ballot per voter/token:** latest wins, deterministic ordering.
- [ ] **Ballot validity:** every counted ballot encrypts a permitted selection (0/1 per option, count constraint).
- [ ] **Cast-as-intended:** Benaloh audit, voter-verifiable on an independent device.
- [ ] **Recorded-as-cast:** inclusion proof against a signed tree head; revote tail check at close.
- [ ] **Tallied-as-recorded:** any observer recomputes the aggregate and checks decryption proofs.
- [ ] **Decryption correctness:** each partial decryption has a verified CP proof.
- [ ] **Robustness:** election completes with ≥ t honest, available trustees; fail-closed otherwise.
- [ ] **Non-claims stated:** coercion, device compromise, quantum, Phase 1 participation privacy, network metadata.

### 11.2 Attacks to test (each must have an automated test or documented manual review)
| # | Attack | Test |
|---|---|---|
| 1 | Weak Fiat–Shamir on every proof type (CDS, sum, CP decryption, PoP, DLEQ) | Per-field mutation negative vectors; try forging with a chosen ciphertext |
| 2 | Cross-protocol/DST confusion | Feed a proof of type X to verifier Y |
| 3 | Ballot replay/copy to another voter; re-randomised copy | Submit; expect rejection or non-effect |
| 4 | Clash: two receipts for one stored ballot | Server serves same ballot to two voters; receipts must differ |
| 5 | Revote dropped or reordered by server | Drop tail; voter check and monitor must detect |
| 6 | Server shows split views of the log | Consistency-proof test with two views |
| 7 | Invalid ballot: plaintext 2, −1, multiple selections over limit | Verifier rejects |
| 8 | Non-canonical or small-order encodings; identity element in C₁, Y, A_{i,0} | Strict decode rejects |
| 9 | Rogue-key DKG | Last trustee publishes complement key; PoP must fail |
| 10 | Replayed DKG commitment/PoP from another trustee | Rejected (index/vector binding) |
| 11 | Bad share, false complaint, withholding | Adjudication yields correct disqualification |
| 12 | Trustee asked to decrypt individual ballot or sub-aggregate | Refused |
| 13 | Wrong/forged partial decryption | CP verification fails; other trustees' set used |
| 14 | Tally outside [0,B] or BSGS miss | Rejected as failure, not zero |
| 15 | Benaloh: device equivocates after cast/audit choice; audit data leaked to board | Commitment check; no public leak |
| 16 | RNG failure: repeated r or proof nonce | Hedged-nonce test; detect duplicate C₁ across ballots |
| 17 | Phase 2: key tagging by signer; token double-issue; token reuse | Client rejects other key; issuance log check |
| 18 | Small electorate: aggregate over 1–2 ballots reveals votes | Manifest minimum / warning enforced |
| 19 | Timing/metadata linkage between token request and cast | Documented; Tor path tested |
| 20 | Ranked: cyclic or inconsistent pairwise matrix accepted | Verifier rejects all 3-cycle ballots |

---

## 12. Must-follow rules (implementer summary)

1. Never hand-roll primitives (ADR-003); pin library versions; test against RFC 9496 / 9380 vectors.
2. One strict encoding; every challenge hashes the whole statement, all commitments, election id, and ballot context, under a unique DST. Recompute challenges in the verifier.
3. Strict decoding; reject identity and non-canonical inputs.
4. Every proof, ballot, and trustee message is signed or bound, then logged; the verifier has no skip path.
5. No structured setup. Generators are hash-derived with a published derivation (no Scytl-style trapdoors).
6. DKG: PoP bound to index and vector, public complaint adjudication, certified transcript, liveness check, fail closed below t. <!-- claims-lint-ignore -->
7. Trustees recompute the tally input and decrypt only that aggregate; no individual-ballot or sub-aggregate decryption, ever.
8. Benaloh: commit before choice; audit openings only to the voter's verifier; delete randomness after cast.
9. Receipts include the voter/token key and sequence number; voters check inclusion and the revote tail at close; monitors check consistency.
10. Phase 2: one signing key in the manifest, public issuance log, separate channels for token request and cast.
11. Declare B and N bounds in the manifest; reject out-of-range tallies; set a minimum electorate for tally-revealing contests.
12. Publish known-answer vectors and require an independent verifier to pass them; keep the CLI verifier independent of the server code.
13. Claim only what §0 and ADR-008 support. Do not claim coercion resistance, anonymity of participation (Phase 1), or PQ confidentiality.
14. External cryptographic review before any non-experimental claim (ADR-004 review trigger). In particular, the ranked proof composition, the DKG, and the Phase 3 membership proof need review before build.
15. Run a public, non-restrictive vulnerability-disclosure policy (Swiss Post bug-bounty lesson).

---

## 13. Proposed ADRs

| ID | Proposal | Rationale |
|---|---|---|
| QV-ADR-P-R01-1 | Adopt the transcript rules of §4.2 as normative for QV-16, including per-proof DSTs, injective length-prefix encoding, and mandatory negative vectors | Frozen Heart / Helios / Swiss Post |
| QV-ADR-P-R01-2 | DKG = Feldman-style with PoP, public complaint adjudication via DLEQ-revealed ECDH secret, transcript certification, liveness check (SimplPedPop/ChillDKG lineage); default t-of-n with t ≥ 2 and n−t ≥ 1 spare; n-of-n only on explicit opt-in | Availability and rogue-key |
| QV-ADR-P-R01-3 | Phase 3 candidate = ristretto255 one-out-of-many membership + scope-bound DLEQ nullifier, not Semaphore/Groth16; gated on a funded review | No trusted setup; fits ADR-001/003 |
| QV-ADR-P-R01-4 | Trustees shall independently recompute and sign the tally-input hash and decrypt only that aggregate | Decryption-oracle defence |
| QV-ADR-P-R01-5 | Benaloh spoiled-ballot openings are not published or decrypted by trustees; only the voter's verifier sees them | Avoids ElectionGuard-style plaintext leak |
| QV-ADR-P-R01-6 | Ranked method = pairwise bits + forbidden-3-cycle proofs, capped at n ≤ 12, gated on external review | §8 |
| QV-ADR-P-R01-7 | Long-term privacy plan = short-lived keys now; Pedersen-commitment everlasting-privacy design in QV-21; hybrid Ed25519 + ML-DSA signing for the log as a later option | §9 |

## 14. Open questions

| Question | Owner | Proposed default |
|---|---|---|
| Confirm ElectionGuard 2.1 date, parameters, and any published reviewer findings (page not directly fetchable here) | Crypto lead | Re-fetch https://electionguard.vote/spec/ and the GitHub issue tracker |
| Confirm the IACR Helios trustee-key-loss incident details | Crypto lead | Cite the IACR announcement or drop the claim |
| Which audited blind-RSA implementation can run under ADR-003? | Eng lead | Defer Phase 2 until one is identified | <!-- claims-lint-ignore -->
| Revote visibility policy in Phase 1 | QV-05/07 owners | Allow revoting; document coercion exposure |
| Whether to include the hash-commit round in the DKG | Crypto lead / reviewer | Optional; decide at review |
| Weighted voting bound B and weight limits | QV-05 owner | Small integers; B ≤ 2⁴⁰ |
| Ternary/truncated ranked ballots proof | Reviewer | Strict total rankings only for first release |

## 15. References (accessed 2026-10-21; see legend at the top)

**Voting systems and attacks**
- Adida, "Helios: Web-based open-audit voting", USENIX Security 2008. https://www.usenix.org/legacy/event/sec08/tech/full_papers/adida/adida.pdf [M]
- Cortier & Smyth, "Attacking and fixing Helios". https://eprint.iacr.org/2010/625 [F]; https://hal.archives-ouvertes.fr/hal-00732899 [F]
- Bernhard, Pereira, Warinschi, "How not to prove yourself". https://eprint.iacr.org/2012/185 [F]
- Küsters, Truderung, Vogt, "Clash attacks on the verifiability of e-voting systems", IEEE S&P 2012 [dblp via search; URL not verified]
- Baloglu et al., "Election verifiability revisited…Helios and Belenios", CSF 2021 [F via search; URL not verified]
- Lewis, Pereira, Teague, "Ceci n'est pas une preuve". https://sarahjamielewis.com/evoting/UniversalVerifiabilitySwissPost.pdf [F]
- Haines, Lewis, Pereira, Teague, "How not to prove your election outcome", S&P 2020. https://openprivacy.ca/research/HowNotToProveYourElectionOutcome-IEEESP2020/ [F]; https://sarahjamielewis.com/evoting/HowNotToProveElectionOutcome.pdf [F]; addendum https://sarahjamielewis.com/log/2019/swisspost-addendum.html [F]
- Springall et al., "Security analysis of the Estonian Internet voting system", CCS 2014. https://estoniaevoting.org/findings/paper/ [F]
- Gaudry & Golovnev, Moscow. https://arxiv.org/pdf/1908.05127 [F]; https://arxiv.org/pdf/1908.09170 [F]
- Halderman & Teague, "The New South Wales iVote system", VoteID 2015 [M]
- ElectionGuard specifications. https://electionguard.vote/spec/ [F via search]; Haines, Goré, Stodart. https://eprint.iacr.org/2020/1477 [F via search]; https://dl.gi.de/items/3bd629bb-cf25-48c9-988d-a9461ce060ef/full [F via search]
- Belenios. https://www.belenios.org/ [M]; Chaidos et al., BeleniosRF, CCS 2016 [M]
- Juels, Catalano, Jakobsson (JCJ). https://eprint.iacr.org/2002/165 [M]; Clarkson, Chong, Myers (Civitas), S&P 2008 [M]
- Ryan et al., Prêt à Voter, IEEE TIFS 2009 [M]; Chaum et al., Scantegrity II, 2008 [M]
- Haenni, Koenig, Locher, Dubuis, "CHVote system specification", eprint 2017/325 [M]

**Primitives, standards, proofs**
- RFC 9496 ristretto255 and decaf448 https://www.rfc-editor.org/rfc/rfc9496 [M]; RFC 9380 hash-to-curve https://www.rfc-editor.org/rfc/rfc9380 [M]; RFC 9497 OPRF https://www.rfc-editor.org/rfc/rfc9497 [M]; RFC 9591 FROST https://www.rfc-editor.org/rfc/rfc9591 [M]; RFC 9162 Certificate Transparency 2.0 https://www.rfc-editor.org/rfc/rfc9162 [M]
- RFC 9474 RSA Blind Signatures. https://www.rfc-editor.org/rfc/rfc9474 [F]
- Trail of Bits Frozen Heart: https://blog.trailofbits.com/2022/04/13/part-1-coordinated-disclosure-of-vulnerabilities-affecting-girault-bulletproofs-and-plonk/ [F]; https://blog.trailofbits.com/2022/04/15/the-frozen-heart-vulnerability-in-bulletproofs/ [F]; https://blog.trailofbits.com/2022/04/18/the-frozen-heart-vulnerability-in-plonk/ [F]; https://eprint.iacr.org/2023/691 [F]
- Cramer, Damgård, Schoenmakers, CRYPTO 1994 [M]; Chaum & Pedersen, CRYPTO 1992 [M]; Benaloh, "Simple verifiable elections", EVT 2006. https://www.usenix.org/legacy/event/evt06/tech/full_papers/benaloh/benaloh.pdf [M]
- Pedersen, EUROCRYPT 1991 [M]; Gennaro, Jarecki, Krawczyk, Rabin (EUROCRYPT 1999; JoC 2007) [M]; Komlo & Goldberg, FROST, SAC 2020 [M]; Chu, Gerhart, Ruffing, Schröder, CRYPTO 2023 [F via search]; ChillDKG / Blockstream https://blog.blockstream.com/the-key-to-frost-what-is-distributed-key-generation/ [F]
- Benhamouda et al., "On the (in)security of ROS", EUROCRYPT 2021 [M]; Groth & Kohlweiss, EUROCRYPT 2015 [M]; Liu, Wei, Wong (LSAG) 2004 [M]; Goodell, Noether, RandomRun (CLSAG) [M]; Semaphore https://semaphore.pse.dev/ [M]; Buterin, MACI, ethresear.ch 2019 [M]
- Schulze 2011 (Soc. Choice Welf. 36) [M]; Tideman 1987 [M]
- Moran & Naor 2006 [M]; Arapinis et al. 2013 [M]; Cuvelier, Pereira, Peters 2013 [M]; Benaloh & Tuinstra 1994 [M]; Hirt & Sako 2000 [M]; Delaune, Kremer, Ryan 2006 [M]; Araújo, Foulle, Traoré 2010 [M]; Spycher et al. 2011 [M]
- NIST PQC FIPS 203/204/205. https://csrc.nist.gov/projects/post-quantum-cryptography [M]; Aranha et al. CT-RSA 2021 [M]; Boyen, Haines, Müller ESORICS 2020 [M]; Costa, Martínez, Morillo 2019 [M]
