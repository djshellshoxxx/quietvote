# R-03 — Metadata, Coercion, Insider, Usability and Legal Research

**Module ID:** `research-r03`
**Status:** Draft
**Owner:** Research (to be assigned by project owner)
**Last reviewed:** 2026-10-21
**Related specs:** QV-06 (privacy/data lifecycle), QV-07 (threat model), QV-08 (architecture), QV-12 (operations), QV-14 (sustainability); baseline ADRs 001, 002, 005, 008, 009, 010, 011, 012, 013; companion research R-04.

> **Not legal advice.** Every section marked `[COUNSEL]` needs review by qualified counsel in each relevant jurisdiction before any public claim, release, hosted service or contractual commitment. Statements of law are a research summary of public sources as of the access date, several only partially verified (see References and `[UNVERIFIED]` tags).

---

## 0. Executive summary

1. **Metadata is the dominant residual privacy risk.** The ristretto255/ElGamal ballot (ADR-004) hides vote *content* from the server; it does nothing about *who connected when from where*. In Phase 1 (ADR-005) participation is public by design, so network metadata matters mostly for (a) linking pseudonymous voter keys to real people and (b) the Phase 2/3 anonymity claims. Tor onion-service deployment (ADR-009) is the only mitigation worth claiming; everything else is hygiene.
2. **Small electorates are fundamentally leaky.** With n<~20 voters, a unanimous or near-unanimous result reveals everyone's vote, and per-ballot-box or per-subgroup tallies and incremental result publication reveal more. The right controls are *policy and UI defaults*, not cryptography: minimum-electorate warnings, no interim tallies, coarse results for tiny groups, no per-subgroup breakdowns below a threshold.
3. **Coercion/vote-buying cannot be solved; it can only be raised in cost.** Consistent with ADR-008 we claim no receipt-freeness. Recommended mitigations: revoting (already ADR-005), no voter-visible transferable receipts for the ballot's *content* (receipt of *inclusion* only; see §3.3 tension with Benaloh), an in-person/kiosk-style "secure mode" documented as out of v1, and honest messaging.
4. **Insider/organizer attacks** concentrate on: the roll (adding sybil keys), credential issuance, the trustee set, manifest manipulation, and the served client code. Each has a detection-oriented mitigation (public roll commitment, trustee ceremony transcripts, reproducible builds).
5. **Legal posture.** A self-hostable AGPL tool with no funds, no KYC and no hosted default has a small regulatory surface: the main exposures are (i) GDPR/UK GDPR for whoever runs an instance (operator/organization is controller; project is generally not, unless it hosts), (ii) US EAR/EU dual-use cryptography export rules (open-source notification under EAR 740.13(e) is cheap and should be done), (iii) liability for misleading security claims, and (iv) *legally binding* union/cooperative/corporate ballots where statute prescribes methods. For (iv) QuietVote should stay out of scope (matches charter) and say so prominently.
6. **Operator risk is mitigated chiefly by data minimization**: what is not logged cannot be subpoenaed. Warrant canaries are weak/untested; we recommend a *transparency report and architecture-based defence* rather than a canary as a core control.

---

## 1. Network and metadata deanonymization

### 1.1 What metadata exists

| Source | Observer | What it reveals | Phase relevance |
|---|---|---|---|
| Client IP at TCP/TLS | Server operator, network path, ISP | Location, ISP, often household; links voter-key to person across sessions | P1 pseudonym-to-person; P2/3 anonymity |
| Request timing (ballot submission instant) | Server, passive network observer | Correlates ballot with a session/IP; with blind-token issuance (P2), the *issuance* time vs *spend* time correlation | P2/P3 |
| TLS SNI / DNS | ISP, DNS resolver | That the user visited the QuietVote instance | All |
| Browser fingerprint (UA, canvas, fonts, screen, language, timezone) | Server | Cross-session linking even through Tor Browser-less VPN use | P2/P3 |
| Cookies / local storage | Server | Linking token-issuance session and ballot-cast session | P2/P3 |
| Message sizes / traffic shape | Network observer | Ballot vs read-only page; number of selections (padding) | All |
| Server-side logs (access, error, DB timestamps, reverse-proxy) | Operator/hosting provider/subpoena | All of the above, retained | All |
| Email delivery (invites, credential mail) | Mail provider | Who was invited and when credentials were opened | P1 credential delivery |
| Bulletin-board ordering | Anyone | Cast order; reveals time but not content | All |

### 1.2 Timing and linkage attacks specific to token-based (Phase 2) anonymity

Blind-signed tokens (RFC 9474; ADR-005) unlink *identity* from *token*, but **issuance and redemption occur on the same server**. If a voter authenticates, obtains a token, and immediately casts a ballot over the same connection/IP, the operator links them trivially. Controls (to be specified in QV-05/QV-07):

- **Decoupled endpoints and times**: token issuance and ballot casting use different origins/paths; client enforces a randomized delay (e.g., uniformly random 0–N minutes, N configurable, default tied to election window) between issuance and cast, and the UI explains why.
- **Batch/epoch issuance**: issue tokens at fixed epochs; cast window opens later.
- **Different network identity per phase**: recommend (and, for onion deployment, default to) a fresh Tor circuit/"new identity" between steps; in the browser use separate contexts.
- **Cover traffic is not practical** for a low-volume web app; do not claim it.
- **Anonymity set accounting**: publish the number of tokens issued vs. ballots cast so observers see the anonymity set; an unbalanced issuance (e.g., 1 token issued) is itself a signal.

Literature anchor: timing/intersection attacks against anonymity systems are well studied (e.g., Tor design paper, Dingledine et al. 2004; end-to-end correlation work). We rely on these as general background, not specific to voting `[UNVERIFIED: no specific paper pulled for this document]`.

### 1.3 IP address, hosting and logs

- **Default**: no IP logging (ADR-009). Specify *how*: reverse-proxy configuration shipped with the reference deployment must set `access_log off` (or anonymize), no `X-Forwarded-For` persistence, no IP in application DB, no IP in error reports. Provide a test (QV-11) that greps logs from a scripted election for client addresses.
- **Rate limiting without IPs**: use proof-of-work challenges or per-credential rate limits rather than per-IP counters persisted to disk; in-memory short-lived counters acceptable (document volatility).
- **Hosting provider** sees all traffic metadata regardless of app logs (netflow, hypervisor). Only onion service or client-side VPN/Tor removes this from the *operator's* view.
- **TLS**: Encrypted ClientHello (ECH) is standardized as IETF work (RFC status at time of writing); do not depend on it.

### 1.4 Browser fingerprinting

The no-third-party-resource rule (ADR-009) removes the largest cross-site tracking surface. Remaining first-party risks: the server can fingerprint by passive headers and by JS the server itself serves. Recommendations:

- Ship **no fingerprinting APIs** in client code (no canvas/WebGL/audio probing, no font enumeration); lint rule in CI.
- Keep the client **JS-light and ideally functional for core voting flows with a `<noscript>`-compatible path** is *not* feasible with client-side encryption; instead recommend **Tor Browser** (which standardizes fingerprint) as the high-privacy path, and offer a **CLI voter** and a **downloadable offline voter page** (ADR-010) for users who do not want to run the operator's JS.
- Document that for P1 (public participation) fingerprinting is low-stakes; for P2/P3 it is a primary risk absent Tor Browser.

### 1.5 Tor onion services (first-class target per ADR-009)

Benefits: hides server location and client IP from each other; no TLS cert/CA dependency (onion address is key-authenticated); NAT traversal; resilience to some network-level censorship.

Risks and required hardening:

| Risk | Detail | Mitigation |
|---|---|---|
| Guard discovery | An adversary who can force a service to build many circuits can try to identify its entry guard; the Vanguards design addresses this. The Tor Vanguards spec says Vanguards-Lite MUST be default for onion services and clients, with Full Vanguards optional for long-lived services; a 2022 PoPETs study found Vanguards-lite prevents a majority of attempts but over 18% of users remained vulnerable (sources in References) | Recommend **full vanguards** (the `vanguards` addon or equivalent in C-tor/Arti) for any long-lived instance; accept latency cost; document Arti vanguards security fixes in 1.2.x (Arti blog notes issues found in 1.2.2–1.2.4; keep Arti/C-tor patched) |
| Onion service DoS | Rendezvous/introduction-point flooding | Tor's PoW-based DoS defense for onion services (introduced in Tor 0.4.8 `[UNVERIFIED]` — confirm version); client puzzle UX; availability is explicitly an operator concern (ADR-008) |
| Client-authorization (v3) | Optional per-client keys restrict who can even reach the service | Offer as an *optional* hardening for closed electorates; note it makes the descriptor non-public and shrinks the anonymity set to key-holders |
| Onion-location / mixed access | Clearnet and onion mirror of same instance let observers correlate by timing | Prefer onion-only for P2/P3 elections; if both, document the weaker guarantee |
| Single point of seizure | Server host still physically seizable | Data minimization (§7); multiple mirrors for read-only verification |
| Bulletin-board mirrors | Public mirrors for verifiability reveal reader IPs to mirror operators | Mirror over onion; SIGNED tree heads allow clearnet mirrors to be untrusted |
| User error | Using Tor and normal browser simultaneously, logging in with real-name email | UX guard-rails (QV-10); separate credential delivery out-of-band |

Operational baseline for the onion profile (QV-08/12): dedicated Tor instance as a separate OS user; `HiddenServiceVersion 3`; no clearnet reverse DNS; ephemeral logs; vanguards enabled; monitoring of Tor release advisories; documented upgrade SLO.

### 1.6 Pluggable transports and censorship circumvention

For electorates in censored networks, Tor reachability depends on **pluggable transports** (obfs4, Snowflake, meek, WebTunnel) and bridges. QuietVote should not implement transports; it should **document** that users in such regions use Tor Browser with their usual bridge configuration, and that the onion profile inherits whatever Tor offers. Note that transports obscure *that Tor is used*; they do not make voting itself deniable, and a censor can still block by SNI for clearnet mirrors. Specific transport statuses and maintained lists change frequently `[UNVERIFIED]` — link to Tor Project's current documentation rather than copying lists.

### 1.7 Network-layer requirements (candidate)

| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-R03-N-001 | Reference deployment shall retain no client IP addresses in any log or database by default | Must | Scripted election leaves zero IPv4/IPv6 client addresses in logs/DB/error reports | Automated log scan (QV-11) |
| QV-R03-N-002 | Client shall use no third-party origins and no fingerprinting APIs | Must | CSP `default-src 'self'`; CI lint rejects listed APIs | CI |
| QV-R03-N-003 | P2/P3 issuance and casting shall be separated by a client-enforced randomized delay and distinct request paths | Must (for P2+) | Delay distribution test; no shared session identifier | Test/review |
| QV-R03-N-004 | Onion profile shall document and default to vanguards for long-lived instances | Should | Config template includes vanguards; runbook | Review |
| QV-R03-N-005 | Product shall publish an anonymity-set counter (tokens issued vs ballots cast) | Should | Visible in election record | Test |
| QV-R03-N-006 | Documentation shall state P1 participation is non-anonymous and that IP/TLS metadata is outside the ballot-secrecy claim | Must | Docs lint on claim text | Review |

---

## 2. Small-electorate re-identification and result-granularity attacks

### 2.1 Problem statement

Ballot secrecy in any tallying system is conditional on the *result* not revealing individual choices. This is a property of the outcome function, not the cryptography ("the tally leaks" is known as the *unanimity / extreme-outcome problem*).

| Attack | Mechanism | Example |
|---|---|---|
| Unanimity | Result = all-yes or all-no | 7 voters, 7 yes: everyone knows how everyone voted |
| Near-unanimity + side info | 1 dissent in small n; a participant who knows who is likely to dissent | 9 voters, 8–1 |
| Subtraction / coalition | Colluding voters subtract their own votes from total | 2 colluders, 5 voters: remaining 3 are exposed in aggregate |
| Interim tallies / incremental disclosure | Differencing between successive published counts reveals individual ballots | Live-updating results |
| Differencing over revoting | Counts after each revote | Same |
| Participation-based inference | P1 public participation + abstention + result | Quorum/threshold rule makes "who must have voted yes" inferable |
| Subgroup breakdown | Tallies per caucus/department/ballot-box | Subgroup of size 2 |
| Write-ins | Unique strings act as signatures (identified in ADR-006: excluded from MVP) | |
| Ranked-ballot Italian attack | Long rankings act as pattern signatures | Phase 2 ranked ballots; publish only aggregated pairwise matrix (already in ADR-006) |
| Timing of ballot in public log | In P1 with public participation and a log with timestamps, ordering can link to external events | |

### 2.2 Mitigations

1. **No interim tallies.** Homomorphic design already gives this for free: decrypt only after close (ADR-004); trustees must not decrypt partial aggregates. Make "early decryption" a hard protocol error and a verifier check.
2. **Minimum electorate warning.** At election creation: if eligible voters < 10 (configurable) show a blocking-but-overridable warning describing unanimity risk; < 5 show a stronger warning. Thresholds are heuristics, not guarantees `[UNVERIFIED: no authoritative threshold; cf. statistical disclosure control practice using minimum cell sizes of 5–10]`.
3. **Result granularity policy** in the manifest: `reveal: {winner_only | counts | counts_with_turnout}`; default for n<10 is `winner_only` plus pass/fail. Note that any published count is still verifiable via the proofs; granularity policy limits *what is decrypted*. Threshold decryption of aggregates only (never per-ballot) is already required.
4. **Subgroup floors.** Block per-subgroup tallies below a minimum cell size.
5. **Manifest-declared, frozen before opening** (so organizers cannot change disclosure post-hoc); trustees refuse to decrypt outside the declared policy.
6. **Unanimity disclosure notice.** If the result is all-one-way the UI states that, by arithmetic, all votes are revealed, *before* the member votes (during ballot instructions, when n is small).
7. **Quorum visible but not per-person.** In P2/P3 publish count of ballots only.
8. **Option padding is not a fix** (adding "abstain" does not change the leak).
9. **Differential privacy (noise)** is inappropriate: it undermines verifiability of exact results. Do not adopt for MVP.

### 2.3 Requirements (candidate)

| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-R03-S-001 | Election setup shall warn when eligible voters < configurable minimum (default 10) | Must | Warning shown, override logged in manifest | UI test |
| QV-R03-S-002 | Trustee tooling shall refuse to decrypt any aggregate before the election close time or outside the manifest `reveal` policy | Must | Negative tests | Unit/integration |
| QV-R03-S-003 | Verifier shall flag any decrypted value not matching the declared reveal policy | Must | Test vector | Test |
| QV-R03-S-004 | UI shall disclose unanimity/near-unanimity risk to voters when n < threshold | Should | Copy present; test | UX review |
| QV-R03-S-005 | Subgroup tallies shall not be produced for cells under the minimum size | Must | Negative test | Unit |

---

## 3. Coercion, vote-buying and revoting

### 3.1 Definitions

- **Receipt-freeness:** voter cannot construct a proof of how they voted (Benaloh–Tuinstra 1994).
- **Coercion-resistance:** stronger; a coercer who can interact with the voter during voting (demand a key, demand abstention, demand a specific vote) learns nothing useful (Juels–Catalano–Jakobsson, "Coercion-Resistant Electronic Elections", 2005; JCJ).
- **Vote-buying** is the voluntary variant. Both are bounded by what the voter can prove.

QuietVote's stated position (ADR-008): **neither is claimed.** This section catalogues why and what is feasible.

### 3.2 Why QuietVote's design is not receipt-free

- A voter who holds their Ed25519 key can sign ballots; a coercer who obtains the key can vote for them (key-handover).
- Benaloh challenge (ADR-004) — an *audit* option — can produce a decryption of a *spoiled* ballot; the cast ballot's randomness is discarded. A voter who retains the randomness for a ballot they cast could prove its content. Implementations must **not retain or export the randomness of cast ballots**, and the audit transcript for spoiled ballots must be clearly unlinkable to the cast one. Without this, Helios-style systems are not receipt-free.
- **Tension to be recorded:** Benaloh auditing improves cast-as-intended (integrity) but a malicious voter can "pre-commit" in front of a coercer by showing the audit of a ballot they then *spoil* and re-encrypt (coercer sees a decryption to the demanded choice but not the cast ballot). The coercer cannot distinguish this from a real cast; this is the standard argument that cast-or-audit provides no receipt, while the *encrypted ballot tracking number* is itself a receipt of inclusion only. Document this explicitly.
- With P1 (public participation) the coercer can verify that the person voted at all (abstention attack). With revoting, the coercer must also control the voter until close (otherwise the voter revotes).

### 3.3 Mitigations ranked by value/cost

| Mitigation | Effect | Cost / caveat | Recommendation |
|---|---|---|---|
| **Revoting (latest ballot wins)** until close | Voter can secretly override a coerced vote (Estonian i-voting approach) | Coercer can demand credentials / sit with voter until close; need ballot-count anonymity for P2/3 so "this key voted again" is not visible, else the revote itself is observable. In P1 key-signed ballots reveal *that* a revote occurred, not its content | Keep (ADR-005). Hide revote *count* per voter from the public record in P2+; in P1, publish only the final-ballot hash at close, not the history, if the log design allows (conflict with append-only log — see Open Questions) |
| **Voting in person / supervised kiosk mode** | Removes remote coercion | Needs trusted physical setup; out of v1 scope | Document as deployment pattern for high-stakes ballots |
| **Deniable/fake credentials (JCJ)** | Real coercion resistance | Heavy crypto (O(n²) in basic JCJ; improved variants exist), complex UX; "don't invent crypto" (brief rule 5) | Defer to research track; do not claim |
| **Panic/duress credentials** | Voter casts an invalid or decoy ballot that is counted as nothing | Needs P2/P3 design; adds user burden | Research track |
| **Do not allow the voter to export their ballot randomness** | Prevents proof of content | Reduces voter's ability to verify own ballot content later | Required (see 3.2) |
| **Anonymous-by-default credential delivery, one-time** | Hinders buying (buyer cannot easily ensure exclusivity) | Not a cryptographic defence | Recommended |
| **Education and disclosure** | Sets expectations; organizers can adopt internal rules (e.g., ban on vote-selling in the group's bylaws) | Social | Required |
| **Short election window with in-person verification of identity** | Decreases coercion time | Not suited to async | Optional |

### 3.4 Group-specific coercion realities

- **Unions and workplaces:** employer or supervisor may demand to see votes; workplace devices are monitored. Recommend "vote from a personal device on a personal network" messaging and **onion access** to reduce network visibility, with the caveat that endpoint compromise is out of scope (ADR-008).
- **DAOs/online communities:** vote-buying is explicit and market-based (e.g., bribe platforms in token governance). QuietVote's non-transferable keys and revoting reduce but do not eliminate it; MACI-style anti-collusion (key change + coordinator) is the nearest published design (see R-04) but depends on a trusted coordinator.
- **Mutual-aid groups:** state or hostile actors compelling members; local-device seizure and compelled password disclosure are likelier than classic vote-buying. Recommend device-local key encryption and a "ballot-key wipe after cast" option.

### 3.5 Requirements (candidate)

| ID | Requirement | Priority | Acceptance | Verification |
|---|---|---|---|---|
| QV-R03-C-001 | Client shall discard encryption randomness of cast ballots and shall never offer export of it | Must | Code review + test: no code path serializes it | Review/test |
| QV-R03-C-002 | Documentation shall state that QuietVote is not receipt-free and not coercion-resistant | Must | Present in README/UX/threat model | Docs lint |
| QV-R03-C-003 | Revoting shall be supported until close; the final ballot per voter counts | Must | E2E test | Test |
| QV-R03-C-004 | In P2+ the public record shall not reveal how many times any given voter cast | Should | Record inspection | Review |
| QV-R03-C-005 | Benaloh audit UX shall explain that a spoiled ballot is discarded and a fresh ballot is made | Must | UX copy review | Usability test |

---

## 4. Insider and organizer attacks

| # | Attack | Actor | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| I1 | **Roll stuffing:** organizer adds sybil voter keys | Organizer | Outcome manipulation (integrity) | Roll Merkle root committed in the signed manifest and published *before* open; each voter can verify own key present; public roll size checks vs. independent membership count; for Phase 2 registrar-signed tokens: issuance count vs roll audit | Sybils are indistinguishable if organizer controls credential delivery; social verification needed |
| I2 | **Roll suppression:** eligible voter omitted | Organizer | Disenfranchisement | Voters check inclusion; dispute workflow (QV-03); manifest signed; log shows roll | Detection only |
| I3 | **Credential phishing by organizer / interception of credential emails** | Organizer, mail provider | Voting on behalf of others | Out-of-band delivery, one-time claim links; voter key generated *client-side* so organizer never holds the private key (P1) | Account takeover of email |
| I4 | **Registrar misbehaviour (P2, blind tokens):** issue extra tokens | Registrar | Ballot stuffing, anonymously | Publish issued-token count; ballots ≤ tokens; compare to roll; separate registrar from organizer where possible (this is the known Belenios lesson: registrar/credential authority is a trust point, see R-04) | Registrar can still stuff up to the unaudited margin |
| I5 | **Trustee collusion (t of n)** | Trustees | Secret ballots decrypted individually only if the system exposes individual ciphertexts decrypted *as ballots* — homomorphic design means colluding trustees *can* decrypt any single ballot ciphertext | Trustees need to be independent (different orgs, jurisdictions), threshold ≥ ⌈n/2⌉+1 recommended, key ceremony transcript; ballot shuffling is not part of MVP so ciphertext→voter linkage in P1 is public — **P1 secrecy is therefore only as strong as trustee honesty** | Documented, ADR-008 |
| I6 | **Trustee unavailability** (sabotage) | Trustee | No result | t-of-n; DKG with backup; documented recovery; abort rules | Availability |
| I7 | **Manifest manipulation after publication** | Organizer/operator | Rule changes | Manifest hash in log; signed; verifier rejects mutated manifest | None if verifiers run |
| I8 | **Malicious client delivery** (JS swapped for some users) | Operator | Selective vote flipping/leak | ADR-010: reproducible builds, SRI, CLI verifier, Benaloh audit on second device; per-user targeted attack remains the weakest point | Residual; Section 5 |
| I9 | **Bulletin-board equivocation** (split view) | Operator | Different voters see different logs | Signed tree heads, witness cosigning, gossip between mirrors/voters (ADR-007) | Needs active monitors |
| I10 | **Selective denial of service** targeting demographic | Operator/network | Lower turnout in a subgroup | Public ballot counts, extension rules, availability monitors; this is detectable by turnout statistics but not provable | Residual |
| I11 | **Observer/auditor misuse of metadata** | Auditor | Participation inference | Auditors get only public record | None extra |
| I12 | **Dispute process abuse** (demanding de-anonymization to resolve a dispute) | Organizer | Coerced reveal | Policy default: no mechanism to reveal individual ballots; document that "dispute resolution" cannot reveal votes | Social pressure |

---

## 5. Usability attack surface (phishing, fake verifier pages)

QuietVote's honesty about "verify, don't trust" shifts risk to the human verifier, and the cryptographic guarantee is only as strong as what the typical voter actually checks.

| Attack | Description | Mitigation |
|---|---|---|
| **Lookalike instance** | Attacker hosts clone at typosquatted domain/onion; collects credentials or substitutes ballots | Pin the canonical election URL/onion address in invitation; invitation contains a **signed election manifest hash** and short human-checkable fingerprint; installable pinned client verifies manifest hash before voting |
| **Fake verifier page** | Attacker shows "Your vote was counted ✔" without checking proofs | Verifier must **compute locally and display raw checks** (hashes, inclusion proof indices); verification available as independently-sourced CLI and offline HTML page distributed through multiple channels (ADR-010); do not use a green-check-only UX; give users a *checklist of what was verified* and a "how to check this independently" link; project publishes verifier hashes through ≥2 channels (git tag signatures, release mirrors) |
| **Credential phishing** | "Your ballot link expired, log in again" | Credentials are one-time and never typed into password forms; no passwords at all in P1 (key-based); email invitations never contain re-login prompts; documented anti-phishing guidance |
| **Receipt confusion** | Voter thinks tracking code proves their vote content | Distinct names: "inclusion receipt" vs "vote content"; UX copy tested |
| **Benaloh challenge misuse** | Voter audits, then casts the audited ballot (impossible by design) or never audits | Make audit a guided optional step; default flows should make audit a one-click on a second device, with a clear explanation; track audit rates in aggregate only |
| **Homograph/QR-code attacks** | QR codes for ballot/verifier links | Show full origin text next to QR |
| **Social-engineering by organizer** ("send me your key to be sure") | Coercion path | Education; keys never need to be shared; UI says so |
| **Malicious browser extension** | Reads DOM | Out of scope (ADR-008); advise clean profile |
| **Accessibility-induced weakness** | Screen-reader users forced to alternative flows with weaker checks | Parity requirement with QV-13 |

Candidate requirement: `QV-R03-U-001` — the verifier shall print/display which checks passed individually, including the manifest hash and tree-head hash, and shall not show a single aggregated success indicator without detail (Must; UX review). `QV-R03-U-002` — project shall publish a signed list of canonical verifier artifacts via at least two independent channels (Should). `QV-R03-U-003` — invitation messages shall carry the manifest fingerprint in a form checkable out of band (Must).

---

## 6. Jurisdiction and legal analysis `[COUNSEL]`

### 6.0 Framing

QuietVote is open-source software for *internal decisions in voluntary organizations* (README; charter excludes government elections and "legally certified corporate elections"). Legal exposure depends mainly on **who operates an instance**, **what data they hold**, and **how the project describes its guarantees**. The project itself (maintainers/foundation) is a software publisher unless and until it runs a hosted service.

### 6.1 GDPR and UK GDPR: roles

Key concepts: *controller* determines purposes and means (GDPR Art. 4(7)); *processor* acts on the controller's behalf (Art. 4(8), Art. 28 contract required); *joint controllers* (Art. 26) jointly determine; EDPB Guidelines 07/2020 on the concepts of controller and processor are the primary interpretive source (commentary found: a provider is not joint controller if processing is separable and the provider has no own purpose — see References; final-version text should be checked on the EDPB site).

| Scenario | Likely role of project | Likely role of organization | Likely role of infrastructure host | Notes |
|---|---|---|---|---|
| **Self-hosted by the organization** | None as to the instance (publisher of software). Not a controller or processor merely by supplying open-source code `[COUNSEL]` | Controller (it decides to run elections and which personal data, e.g. voter roll) | Processor if it merely supplies VM/storage under contract | Org needs lawful basis (Art. 6; typically legitimate interests or contract/membership), transparency (Art. 13/14), records of processing (Art. 30, with small-organization exemptions limited), DPIA likely where large-scale or systematic monitoring is not at issue but secret ballots of special category data (trade union membership, political opinions are special-category data under Art. 9) are involved |
| **Hosted by a third party (maintainer or a community host) for an organization** | Host = processor (Art. 28 DPA) | Controller | Sub-processors | Host needs a DPA, sub-processor list, breach notification path (Art. 33), international transfer mechanism if outside EEA/UK |
| **Hosted instance where host decides purposes/means** (e.g., free public instance where anyone creates elections; host sets retention, analytics) | Potentially (joint) controller for account/metadata data | Controller for election data it uploads | | Avoid by minimization and by tying the public instance to processor-only role with clear terms `[COUNSEL]` |
| **Maintainer telemetry** | Controller if any telemetry exists | | | **Recommendation: ship zero telemetry** |

Special-category data: voter-roll membership of a trade union, or political opinion expressed in a vote, can constitute Art. 9 data. In P1 a *public participation record* of a union election is a union-membership indicator; this strengthens the need for an organization-level lawful basis (Art. 9(2)(d): processing by not-for-profit bodies for members, with safeguards) `[COUNSEL]`.

Data protection by design/default (Art. 25) and security (Art. 32) are directly supported by the architecture (minimization, no IP logs). Right to erasure (Art. 17) conflicts with an append-only public log: mitigate by **never placing personal identifiers in the log** — only public keys/commitments/ciphertexts; erasure then acts on off-log mapping data (roll with real names), with crypto-shredding option. Whether a long-lived pseudonymous public key is still personal data is likely yes while linkable `[COUNSEL]`.

UK GDPR and the Data Protection Act 2018 largely mirror the above; the UK's changes under the Data (Use and Access) Act 2025 should be checked `[UNVERIFIED: not researched here]`. Representative/establishment questions (EU/UK representative under Art. 27) arise only for a *hosting* project without an establishment.

**Recommendations:** (1) Publish a "roles" explainer; (2) ship a template DPA and a template organization-level privacy notice, clearly marked non-legal-advice; (3) ship zero telemetry; (4) never put names/emails in any exportable artifact that is meant to be public; (5) retention defaults and deletion (QV-06).

### 6.2 Ballot-secrecy law norms

Secret ballot is a recognized norm in public elections (e.g., ICCPR Art. 25(b) "genuine periodic elections ... by secret ballot"; Council of Europe Recommendation CM/Rec(2017)5 on standards for e-voting; ECtHR case law touching secrecy) `[UNVERIFIED: citations given from background knowledge, not fetched]`. Private associations are governed by their own bylaws and by statute only where a statute prescribes a ballot form (unions, some co-op types, listed companies). Consequences for QuietVote:

- For voluntary groups with bylaws allowing e-voting, no statutory secrecy standard applies, but members may sue for breach of constitution if the tool contradicts what the bylaws promise (e.g., "secret ballot").
- Bylaws should *reference QuietVote's published guarantees and non-claims*; project docs should provide model bylaw language and caveats (P1 = secret ballot with public participation; P2+ different).
- Product copy must use "secret ballot" only for properties actually held (P1: *content* private from the operator against < t colluding trustees; not private from t trustees).

### 6.3 US encryption export controls `[COUNSEL]`

- Software with encryption functionality is generally ECCN 5D002 under the Export Administration Regulations (EAR) (15 CFR Parts 730–774).
- **Publicly available open-source encryption source code** can be exported under License Exception TSU (§740.13(e)); paragraph (e) covers publicly available source code classified under 5D002. **Notification** by email to BIS (crypt@bis.doc.gov) and the NSA ENC Encryption Request Coordinator (enc@nsa.gov) is required for *"non-standard cryptography"* code, giving the Internet location (or copy of the code); a new notification is needed when the location changes, and updates to code at the already-notified location do not require new notice (summary of the 2011 rule; see References). Since a 2021 rule, notification requirements were relaxed for some cases `[UNVERIFIED]`: **confirm the current text of §740.13(e)(3) and the definition of "non-standard cryptography" in Part 772 on eCFR** (the BIS pages could not be fetched from the research environment).
- QuietVote uses ristretto255/Ed25519/SHA-2/3 and standard published constructions through @noble libraries. Whether use of *standard* algorithms avoids the notification is a counsel/ BIS-guidance question: BIS treats "standard cryptography" differently (e.g., Ed25519 standardized in FIPS 186-5 and RFC 8032) and ristretto255 is an IETF RFC (RFC 9496) — which may or may not fit the definition of "standard cryptography" in Part 772 `[UNVERIFIED]`.
- **Cautious recommendation:** send the §740.13(e) notification (cheap, no fee, one email) once the repo is public, and re-notify if the repository location changes (e.g., move from GitHub to another host). Keep a record of the email.
- Related: the mass-market route (740.17(b)) is not appropriate for a general crypto toolkit; open-source publication route is the correct one. BIS guidance reportedly notes cryptographic libraries are generally not treated as mass market (secondary source; see References).
- **Hosted service:** providing a service is not the same as exporting software; but distributing client JS to foreign users from a US-hosted server may be an export of publicly available code (covered by publicly available treatment). Embargoed/sanctioned destinations: even publicly available code is generally not subject to the EAR (EAR §734.3(b)(3) publicly available exclusion) except specified encryption source code items before 2010; post-2010, 740.13(e) applies and sanctions law (OFAC) is separate `[COUNSEL]`.
- **Contributor and distribution guidance:** do not include US-origin-controlled non-public components; keep builds reproducible from public source.

### 6.4 EU dual-use controls, Wassenaar `[COUNSEL]`

- EU Regulation (EU) 2021/821 (recast dual-use regulation) with Annex I, Category 5 Part 2 "Information Security" (5A002/5D002) implements Wassenaar Arrangement controls in EU law. The **General Software Note** and **Cryptography Note (Note 3 to Cat. 5 Part 2)** exempt, respectively, "in the public domain" software and mass-market items meeting conditions (see References for the retail conditions as stated under the predecessor regulation; the research could not retrieve Annex I text, so verify against EUR-Lex).
- Wassenaar Arrangement: exports of 5D002 encryption items are controlled by participating states, with the Cryptography Note and the public-domain exclusion. Publicly available source code published online is widely treated as "in the public domain" `[UNVERIFIED for each member state]`; some national authorities (e.g., Germany, France historically) differ in practice `[UNVERIFIED]`.
- EU internal movement of dual-use items is generally free for most items (intra-EU transfers of Annex IV items need authorization — Category 5 Part 2 isn't in Annex IV `[UNVERIFIED]`).
- **Recommendation:** publish the source publicly (public domain exclusion), keep a short "export compliance statement" in the repo, and let counsel confirm per-country (project foundation's seat, hosting provider's seat, maintainers' residences).

### 6.5 Anti-money-laundering (AML) non-applicability

QuietVote has no custody or transfer of funds (charter), no token, no chain (ADR-012). It therefore is not a money transmitter, VASP/CASP or payment service. **Boundaries that would change this:** (a) integrating payments/dues collection; (b) token-gated voting or on-chain weighting; (c) holding funds in escrow for ballot deposits. Each must be refused in scope or re-assessed `[COUNSEL]`. KYC is not performed by default (ADR-001); AML obligations are not triggered by the voting function. If an *organization* using the tool handles funds, those obligations are the organization's. Sanctions screening obligations apply to persons not software per se; hosted operators should consider sanctions exposure of their paying customers.

### 6.6 Union-election law and cooperative law (where binding ballots are required) `[COUNSEL]`

QuietVote's charter excludes legally certified elections. This section documents *why* and *what to say* when unions or co-ops ask.

**US — LMRDA (Labor-Management Reporting and Disclosure Act of 1959), Title IV, 29 U.S.C. §481:** requires local unions to elect officers by secret ballot; national/intermediate bodies by secret ballot of members or delegates. "Secret ballot" is defined in 29 U.S.C. §402(k) as voting by ballot, machine or otherwise, such that the voter cannot be identified with the choice. OLMS (DOL) guidance says the Act doesn't mandate a specific method but expects safeguards (candidate observers at the polls and count, record retention one year) and has litigated an electronic-voting case (APFA, 2016) alleging that the system allowed voters to be linked to votes and that observers could not verify recording and tally (see References). **Implication:** a union using QuietVote for *officer elections* risks non-compliance unless the implementation provides observer rights and demonstrable secrecy; P1 "public participation" is acceptable for secrecy of *content*, but the trustee-collusion model and the "operator untrusted" posture are not what the statute tests; the safest posture is: QuietVote may be used for *non-officer* advisory/ratification votes, and union counsel must decide for officer elections or contract ratification under the union's constitution/bylaws and NLRA/LMRDA rules `[COUNSEL]`. Note also NLRB representation elections are run by the NLRB, not by a union tool.

**UK — Trade Union and Labour Relations (Consolidation) Act 1992 (TULRCA):** elections for principal executive committee members, president and general secretary must be conducted by **postal ballot** (s.51, voting by marking a paper) and supervised by a qualified **independent scrutineer** (s.49) with independent storage/distribution/counting (s.51A) (sources in References). Statutory industrial-action ballots are also prescribed (ss.226–234A, with the Employment Rights Act 2025 changes to ballot methods `[UNVERIFIED: potential e-balloting reform; check current status]`). **Implication:** QuietVote cannot currently satisfy TULRCA for statutory elections because the statute demands postal papers; do not market it for those. Union internal consultative/rule-change votes governed only by union rules are different `[COUNSEL]`.

**Cooperatives:** co-op societies and companies are governed by national statutes (e.g., UK Co-operative and Community Benefit Societies Act 2014; US state co-op statutes; EU SCE Regulation 1435/2003) and the organization's rules; many permit electronic voting if the rules allow, but some require specific notice, quorum, proxy and minuting forms. Secret-ballot requirements for board elections vary `[UNVERIFIED]`. **Product posture:** provide a "legal-validity checklist" for groups: confirm bylaws authorize e-voting, confirm the vote type is not statutory, retain the election record per bylaws.

**General guidance in docs:** a prominent statement "QuietVote results are not legally certified; check your statute and constitution."

### 6.7 Liability, ToS and disclaimer approaches `[COUNSEL]`

| Risk | Approach |
|---|---|
| Overclaiming security ("unhackable", "anonymous") — misrepresentation or consumer-protection exposure | Claims discipline (README principle 7; ADR-008 non-claims); canonical claims table; docs lint; avoid "anonymous" in P1 |
| Software defect causing wrong result | AGPL-3.0 §§15–16 disclaim warranty and limit liability **"to the extent permitted by applicable law"**; add independent verifier so wrong results are detectable; publish known-issue register |
| Hosted-service liability (if ever) | ToS: no warranty of fitness for legally binding elections; cap on liability; indemnity from organization for its use; acceptable use (no use for unlawful elections); data processing terms; open-source "as is" language doesn't automatically protect a service provider in all jurisdictions (consumer law, gross negligence cannot be disclaimed in many EU states) |
| Defamation/harassment by users | Operator has no access to ballots; limited content (proposal text) — moderate; notice-and-takedown only where hosting content |
| Security vulnerability disclosure | SECURITY.md, coordinated disclosure, safe-harbor statement |
| Contributors | DCO; no CLA by default; entity formation (foundation, UK CIC/Swiss association/US 501(c)(3)/(c)(6)) to hold trademarks and shield individuals `[COUNSEL]` |
| Trademark | Register "QuietVote" mark only after clearance; trademark policy allowing forks but not confusing hosted services (relevant to QV-14) |

### 6.8 Licensing: AGPL-3.0-or-later and DCO (ADR-011)

- **AGPL-3.0 §13** requires that if you modify the program and let users interact with it remotely over a network, you must offer them the corresponding source. Effect: hosted forks must publish modifications. That serves the "verify, don't trust" ethos: a hosted operator cannot run a secret modified tally server. It does **not** prevent a hosted fork from changing behavior if it publishes the changes; the verifier remains the actual defence.
- **Dependencies:** @noble (MIT), Node.js (MIT) — compatible. Any GPL-2-only dependency would conflict; keep an SBOM and licence scan in CI.
- **Browser client under AGPL:** serving the client to users constitutes conveying; ensure the client bundle includes a "Source" link and the license notice (the "appropriate legal notices" requirement of §5(d)/§7). Minified bundles need corresponding source: reproducible builds (ADR-010) fit.
- **Commercial adopters** (some enterprises prohibit AGPL): dual licensing is possible only with copyright aggregation (CLA) — **DCO alone does not give the project relicensing rights**. This is consistent with a no-relicensing, values-aligned stance, but must be a conscious decision recorded for QV-14 (ADR-proposal below).
- **DCO:** Developer Certificate of Origin v1.1 sign-off (`Signed-off-by:`) certifies the contributor's right to submit under the project's licence; it is a lightweight alternative to CLAs, used by the Linux kernel; enforcement via a CI check.
- **Docs CC BY-SA 4.0:** ShareAlike is compatible with the intent; note CC BY-SA 4.0 is one-way compatible with GPLv3 (CC allows adaptations to be licensed under GPLv3 for BY-SA 4.0 material `[UNVERIFIED — confirm CC's compatibility statement]`), but not relevant unless code snippets in docs are reused.
- **Patent clause:** AGPL-3.0 includes an express patent grant from contributors (§11). Cryptography patents are mostly expired for the chosen primitives `[UNVERIFIED]`.
- **README currently says licence "to be decided"** — ADR-011 resolves it; add LICENSE, DCO file, SPDX headers.

### 6.9 Operator risk: subpoenas, seizure, and data minimization

Threat: an operator (organizer running a self-hosted instance, or hosted maintainer) receives a subpoena, warrant, national-security letter, or has hardware seized, or is compelled by a private litigant (e.g., union dispute) or employer.

**Principle:** you cannot disclose what you do not have. Data minimization is the primary legal defence and also a security control.

| Data | Held by default? | Exposure on compulsion | Posture |
|---|---|---|---|
| Ballot ciphertexts | Yes (public record) | Already public | n/a |
| Decryption key shares | Held by trustees, not operator | Trustees compelled | Trustees in different jurisdictions; destroy shares after audit window (ADR-013) |
| Voter private keys | Client side only (P1) | Not held | Good |
| IP addresses | No (ADR-009) | None | Enforce by test |
| Real-name ↔ public key mapping | Possibly in organizer's roll | Exposure to organizer's legal process | Allow roll to be held off-server; encrypted at rest with organizer key; retention limit |
| Email addresses for invitations | Transient, deletable after send | Exposure | Delete after send; allow external mailing |
| Backups, VM snapshots, hosting provider logs | Operator-dependent | Exposure | Document; encrypted backups; onion profile reduces provider logs |
| Application-level audit logs | Minimal | | Define schema in QV-06 |

Design for compulsion-resilience: (1) *Operator holds no secrets whose disclosure breaks secrecy* (already the stance); (2) data-at-rest encryption with keys not stored on the same host for the roll; (3) documented "emergency shutdown & wipe" runbook (but warn: destroying evidence after legal notice may be obstruction — **don't advise wiping after receiving process**; pre-planned retention schedules applied before any request are fine) `[COUNSEL]`; (4) legal-request policy: publish how requests are handled; notify affected organization unless prohibited; (5) transparency reports.

Jurisdictional tidbits to confirm `[UNVERIFIED]`: US Stored Communications Act, CLOUD Act reach; EU e-Evidence rules; UK Investigatory Powers Act 2016 (technical capability notices, which could in principle compel an operator to remove protection; counsel for any UK-based hosted operator); key-disclosure laws (UK RIPA Part III s.49). Choose hosted-operator jurisdiction deliberately, and recognize that crypto-libertarian positioning can attract unwelcome attention.

### 6.10 Warrant canary debate

A warrant canary is a periodically updated statement that no secret legal process has been received; removal signals receipt. Debate:

- **Pro:** gives a signal where gag orders prohibit disclosure; low cost; used by several providers historically.
- **Con:** legally untested; a compelled party may be forced to keep the canary updated (compelled speech) or may be ordered not to stop publishing; absence is ambiguous (could be lapse); gives false assurance; US government has taken the position that canaries may violate gag orders `[UNVERIFIED: citations not pulled]`; Apple's removal of its canary from reports is cited as a cautionary example `[UNVERIFIED]`.
- **Recommendation for QuietVote:** do **not** rely on a canary as a security control. Prefer (1) architecture that makes most requests unanswerable (data minimization), (2) a published legal-request policy and periodic transparency report that includes "number of requests received and nothing produced" where lawful, (3) if a canary is used at all (hosted offering), make it signed, dated, with specified update cadence and explicit statement that absence is not proof; counsel to review `[COUNSEL]`.

---

## 7. Cross-cutting recommendations summary

1. Ship zero telemetry; no IP logs; enforce with automated tests.
2. Make result-disclosure policy explicit and frozen in the manifest; enforce at trustee tooling and verifier.
3. State non-claims on coercion in product copy; do not export cast-ballot randomness.
4. Document Tor onion profile with vanguards; keep it optional-first-class.
5. Publish "roles" doc (GDPR), template DPA, model bylaws language, legal-validity checklist.
6. Send EAR §740.13(e) notification upon public release (after counsel check).
7. Keep out of statutory union/co-op/corporate elections; provide referral language.
8. Consider foundation/legal wrapper before any hosted offering.

## 8. Proposed ADRs

- **QV-ADR-P-R03-1 — Result-disclosure policy is part of the signed manifest and enforced by trustees and verifier.** Rationale: §2. Affects QV-05, QV-07, QV-09.
- **QV-ADR-P-R03-2 — No telemetry, no IP retention; test-enforced.** Extends ADR-009. Affects QV-06, QV-08, QV-11, QV-12.
- **QV-ADR-P-R03-3 — Cast-ballot randomness is never retained or exportable by the client.** Affects QV-05, QV-10.
- **QV-ADR-P-R03-4 — Legal-scope statement: not for statutory union/co-op/corporate/government elections; model-bylaw guidance provided.** Affects QV-00, QV-02, QV-03, QV-14.
- **QV-ADR-P-R03-5 — Open-source export notification under EAR §740.13(e) at first public release (subject to counsel confirmation).** Affects QV-12, QV-14.
- **QV-ADR-P-R03-6 — DCO-only, no CLA; consequence: no relicensing/dual-licensing without unanimous contributor consent.** Affects QV-14. (Alternative: CLA to preserve relicensing; rejected for values alignment but reopen if commercial licensing is wanted.)
- **QV-ADR-P-R03-7 — No warrant canary as a control; publish legal-request policy and transparency report.** Affects QV-12, QV-14.
- **QV-ADR-P-R03-8 — Onion profile defaults to vanguards-full for long-lived instances.** Affects QV-08, QV-12.

## 9. Open questions

| Question | Owner | Target review | Proposed default |
|---|---|---|---|
| Can the append-only log avoid revealing per-voter revote counts in P1 without breaking verifiability? | QV-05 owner | Protocol review | Publish per-voter final-ballot commitment at close; keep history in sealed append-only segment |
| Minimum-electorate thresholds (warn <10, strong <5)? | QV-07/QV-10 | Usability test | As stated, configurable |
| Is ristretto255/Ed25519 "standard cryptography" for EAR purposes; is notification required? | Counsel | Before first public release | Send notification anyway |
| Foundation jurisdiction and form | Project owner | Before hosted offering | Defer; evaluate Swiss association / US 501(c)(3)/(c)(6) / UK CIC |
| Will union/co-op pilots require legal validity? | Product | Target-user research | Decline until counsel opinion |
| Hosted offering and data-protection representative | Project owner | QV-14 | Not before foundation exists |
| UK/EU e-balloting reform effects on union law | Counsel | Annual | Monitor |

## 10. References (accessed 2026-10-21 unless noted)

Verified by retrieval in this session:
- Tor Vanguards Specification — https://spec.torproject.org/vanguards-spec/ (Vanguards-Lite MUST be default; Full Vanguards optional for long-lived services).
- "From 'Onion Not Found' to Guard Discovery", PoPETs 2022 — https://petsymposium.org/popets/2022/popets-2022-0026.pdf (vanguards-lite effectiveness; ~18% of users still vulnerable).
- Announcing Vanguards Support in Arti — https://blog.torproject.org/announcing-vanguards-for-arti/ (Arti 1.2.2; later security issues noted).
- Federal Register final rule, 7 Jan 2011 (encryption notification, crypt@bis.doc.gov and enc@nsa.gov) — https://docs.regulations.justia.com/entries/2011-01-07/2011-86.pdf (search-result summary; page not fully read; **check current 15 CFR 740.13(e) on eCFR**).
- BIS mass market / encryption pages (referenced in search results; not fetched) — https://www.bis.gov/learn-support/encryption-controls/mass-market
- EU dual-use Note 3 summary — https://www.thetradehub.eu/de/customs/export-control/annex-i/5a002 and https://lexgo.be/en/news-and-articles/2941-trade-controls-on-cryptography-products-how-shall-we-deal-with-the-mass-market-exemption (secondary; predecessor regulation 428/2009 wording).
- EDPB Guidelines 07/2020 commentary — https://www.mayerbrown.com/en/insights/publications/2020/09/european-data-protection-board-publishes-guidelines-on-the-concepts-of-controller-joint-controller-and-processor (draft-stage commentary; final 2021 text on EDPB site not retrieved).
- TULRCA 1992 s.51 — https://www.legislation.gov.uk/ukpga/1992/52/section/51 ; s.49 — https://www.legislation.gov.uk/cy/ukpga/1992/52/section/49 ; s.51A summary via Harvey (LexisNexis) https://www.lexisnexis.co.uk/legal/commentary/harvey-on-industrial-relations-and-employment-law/division-m-trade-unions/a-summary-17
- OLMS remote electronic voting guidance — https://www.dol.gov/agencies/olms/compliance-assistance/tips/remote-electronic-voting-systems ; OLMS compliance tip PDF https://dol.gov/sites/dolgov/files/olms/regs/compliance/catips/2016/comptip_electronicvotingsystems_oct2016.pdf ; APFA litigation brief https://apfa.org/wp-content/uploads/2017/12/170915-Perez-Brief-in-Response.pdf (search-result summaries; case outcome not verified).

From background knowledge, not retrieved (treat as `[UNVERIFIED]` until checked): Benaloh–Tuinstra 1994 (receipt-freeness); Juels–Catalano–Jakobsson 2005 (JCJ); RFC 9474 (RSA blind signatures); RFC 9496 (ristretto255); RFC 8032 (EdDSA); ICCPR Art. 25(b); CoE CM/Rec(2017)5; GDPR Arts. 4, 6, 9, 17, 25, 26, 28, 30, 32, 33; AGPL-3.0 text (https://www.gnu.org/licenses/agpl-3.0.html); Developer Certificate of Origin v1.1 (https://developercertificate.org); 29 U.S.C. §§402(k), 481; Regulation (EU) 2021/821.
