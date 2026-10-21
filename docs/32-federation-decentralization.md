# QV-32 — Federation and Decentralization (Roadmap Research)

**Module ID:** `federation-research`
**Status:** Draft (research; nothing here is committed scope)
**Owner:** Architecture lead
**Last reviewed:** 2026-10-21
**Related specs:** QV-08 (architecture), QV-12 (operations), QV-26 (metadata), QV-16 (crypto), QV-20 (voting methods), QV-07 (threat model); ADR-002, ADR-007, ADR-008, ADR-012.

## 1. Objective
Evaluate honestly whether and how QuietVote can reduce reliance on a single server through relays, witnesses, mirrors, multi-operator boards, and peer-to-peer or Nostr-style transports, in line with the stance "no operator in the trust base for secrecy/integrity, only for availability" (ADR-001/008). The central finding: **the cryptographic protocol already makes integrity independent of the server** (universal verifiability, ADR-007); decentralisation therefore mainly buys **availability, censorship resistance and operator-exit**, not integrity or secrecy — and it carries costs (consistency, abuse, metadata, UX). Federation features should be adopted only where they remove a concrete failure mode.

## 2. Scope
### In scope
Relay/witness federation; transparency-log witnessing; public mirrors; Nostr as transport; P2P gossip; IPFS-style content-addressed mirrors; multi-operator (replicated) bulletin boards; phased adoption plan with exit criteria.
### Out of scope
Blockchain consensus or tokens (ADR-012); automatic decentralisation claims; anonymous routing network design (Tor is used, QV-26).

## 3. What decentralisation could and could not fix
| Property | Single server today | Does federation help? |
|---|---|---|
| Ballot secrecy | Threshold trustees | **No** (orthogonal; trustees are the lever) |
| Integrity of tally | Verifiable by anyone | Marginal (already covered); helps *detect equivocation* sooner via witnesses |
| Log append-only / no equivocation | Signed tree heads (ADR-007) | **Yes**: witnesses/gossip detect split views (CT-style) [R1] |
| Availability | Single point of failure | **Yes**, with multi-operator replication, at consistency cost |
| Censorship (server drops specific voters' ballots) | Receipts expose it after the fact only | **Partially**: multiple submission endpoints/relays let a voter reach any operator |
| Operator exit/seizure | Export + restore | **Yes**: mirrors and replicated boards reduce dependence |
| Metadata privacy | Tor | **Mixed**: more parties see metadata unless relays are designed carefully |
| Eligibility/coordination (roll, registrar) | Org admin / registrar | **No**; a registrar remains necessary in Phases 1–2 |
| Sybil/spam resistance | Roll-gated | Worse in open relays (spam) |

## 4. Candidate mechanisms

### 4.1 Witness cosigning and public mirrors (builds directly on ADR-007)
- **Idea:** independent witnesses cosign signed tree heads after verifying append-only consistency, as in Certificate Transparency (RFC 9162 [R1]) and witness/cosignature ecosystems (e.g., Sigsum, Go checksum database; C2SP `tlog-witness`/`tlog-cosignature` specs) [R2, UNVERIFIED current spec names/status — verify].
- **Design:** the instance publishes a head `(size, root, ts)`; witnesses fetch, verify the consistency proof from their last cosigned head, and return a signature. Clients/verifiers accept a head only with ≥ k of m witness cosignatures declared in the manifest (e.g., 2-of-3).
- **Benefit:** a rogue operator cannot show different histories to different voters without witness collusion. **Cost:** low; witnesses are small stateless-ish services (store last head per log).
- **Mirrors:** static hosting of the entire log + artifacts (files + inclusion/consistency endpoints computable offline). Any party can mirror; mirror operators gain no trust.
- **Assessment: High value, low risk. Build first (Phase F1).** Honest limit: witnesses detect equivocation after the fact; they cannot force an operator to include a ballot.

### 4.2 Multi-operator bulletin board (replicated log)
- **Idea:** n operators each run a board; ballots are accepted by any; a consensus or deterministic-merge rule produces one log.
- **Approaches:** (a) *Primary with failover* (one writer at a time, signed hand-over, witnesses prevent forks) — simple; (b) *BFT/Raft-style replicated state machine* among operators [R3 Raft; R4 PBFT — citations only; not fetched] — heavy, requires operator identity and membership management; (c) *CRDT/set-union of ballots with deterministic ordering by hash per epoch* — fits QV because ballots are individually signed, self-validating, and the counted set is a function of the *set* (latest `seq` per voter in Phase 1; spent tokens in Phase 2). Order-independence is the key insight: the tally does not depend on arrival order beyond the revote rule, which uses signed `seq` (QV-20 §7).
- **Recommendation:** (c) with per-epoch Merkle roots computed over the sorted ballot hashes, where each operator publishes its epoch root; the canonical root for an epoch is the root of the union of all ballots observed by a quorum of operators at epoch close; reconciliation by set-difference exchange (e.g., Merkle/IBLT-style sync [UNVERIFIED]). Double-spend in Phase 2/3 (same token/nullifier submitted to two operators concurrently) is resolved deterministically: **earliest valid ballot by hash order within the epoch** or both rejected → this requires a closing epoch rule and may cause a voter to be told "accepted" by operator A but later superseded; therefore receipts are only final after the epoch is sealed (QV-26 batching aligns).
- **Risks:** liveness near the deadline (split operators at close), complex fault model, operator identity governance, higher metadata exposure (more parties see submissions), cost. **Assessment: Medium value for orgs needing high availability; build after F1 and only if demand exists (Phase F3).** Not for MVP.

### 4.3 Relays (submission and fetch)
- **Idea:** dumb store-and-forward relays accept an opaque, already-validated-looking ballot blob and forward it to the board; also relay reads. Reduces operator's visibility of voter IPs and allows censorship circumvention.
- **Design constraints:** relays cannot read ballots (encrypted) but can see IPs and timing; use over Tor; apply anti-spam (proof-of-work token or roll-signature precheck without learning identity in Phase 2: relays can check the unblinded token signature validity only if they hold the registrar's public key — acceptable; they never see voter identity). Padding and batching at relay (QV-26 §8 S5).
- **Assessment:** useful for QV-26 S5 and censorship resistance; Medium value; Low-medium complexity (Phase F2).

### 4.4 Nostr as a transport
- **What it is:** events (JSON, signed with secp256k1 Schnorr per NIP-01) published to relays that store/forward; clients subscribe by filters [R5 nostr-protocol/nips]. Related NIPs: NIP-44 versioned encryption (ChaCha20 + HMAC), NIP-59 gift wrap (rumor → seal → gift wrap; randomised timestamps) [R6; findings from search summaries, verify against nips repo].
- **Fit:** (+) an existing network of independent relays, trivially multi-endpoint, censorship-resistant publication; ballot submission = publish an event containing the ballot blob to several relays; verifiers fetch from any relay; relays are untrusted; event ids are content hashes, giving integrity checks. (+) Gift wrap offers metadata-hiding envelopes for relay→board messages. 
- **Misfits:** (−) different curve (secp256k1) from ristretto255 — Nostr keys would be *transport identities only*, never the voter/election keys (no new crypto); (−) relays are not committed to retention or ordering; deletion/rate-limits arbitrary; (−) public relays leak IPs/timing to arbitrary operators; spam; (−) no append-only guarantees — QV's Merkle log remains the source of truth; (−) event-size limits (relays often cap ~ 64–512 KB [UNVERIFIED]) fit approval ballots (~2–3 KB) but not weak-order ranked ballots up to hundreds of KB; (−) protocol churn (NIPs evolve) and moderate maturity of security review [UNVERIFIED].
- **Design sketch (optional transport adapter):** `Event kind = <QV-custom parameterised replaceable range, to be allocated>`, content = base64 ballot blob, tags: `["e", election_id]`, `["qv","1"]`. Anyone ingests events from relays into the board; the board only trusts its own validation of the ballot. Dedup by ballot hash. Relays serve as an availability net — no trust.
- **Assessment: Medium–low priority; optional "ingest from Nostr relays" and "mirror to Nostr relays" adapters are low-risk if treated as dumb pipes; as primary transport, no.** Phase F2/F4, behind feature flag, with no key reuse.

### 4.5 Peer-to-peer gossip
- **Idea:** voters/clients gossip ballots and heads directly (libp2p-style) with no central server.
- **Problems:** (1) NAT traversal and browser limits (WebRTC/WebTransport) — reliability on mobile; (2) discovery and membership; (3) metadata: peers see each other's IPs (worse than Tor-to-server); (4) abuse/spam without a gate; (5) closing time/ordering — requires consensus on the end of the ballot window; (6) UX complexity and offline voting issues; (7) hard to give availability guarantees; (8) ADR-002 explicitly deferred P2P-first.
- **Where it may fit:** gossip of **signed tree heads and witness cosignatures** among *verifiers* (not of ballots), which is cheap and improves split-view detection (like CT gossip, draft/rfc status [UNVERIFIED]). 
- **Assessment: Do not build ballot P2P. Head-gossip among monitors only (Phase F2/F3).**

### 4.6 IPFS-style content-addressed mirrors
- **Idea:** publish immutable artifacts (manifests, ballots bundle per epoch, tally transcripts, verifier release) by content hash (CIDs) so that anyone can pin and serve them [R7 IPFS docs — not fetched].
- **Fit:** (+) archives and exit-friendliness; (+) verification by hash; (+) cheap mirror distribution; (−) availability depends on pinning (no persistence by default); (−) IPFS retrieval exposes requesters' interest and IP to the DHT/peers; (−) mutable pointers (IPNS) have weak guarantees — use signed STHs as the "latest head" instead; (−) deletion (GDPR erasure) is impossible for pinned data (QV-25) — public-log content is already pseudonymous/hashed by design but note the tension.
- **Assessment: Good for post-election archives and release artifacts; not for live submission.** Phase F1 (as simple static+CID mirrors).

### 4.7 Trustee decentralisation
Already decentralised by design (threshold). A federation-adjacent improvement: **multi-org trustee panels** (trustees from independent organisations) and **external trustee services** that hold a share but never see ballots (still threshold). Potential "trustee-as-a-service" gives small groups real threshold security without recruiting individuals; risk: operator-controlled trustees collude. Document as an organisational pattern, not a protocol feature.

### 4.8 Registrar decentralisation (Phase 2/3 interplay)
Blind-signature issuance is a single point of metadata and availability. Options: threshold blind signatures (research; not standard — flagged [UNVERIFIED]); Phase 3 registrar-free ZK membership removes it (ADR-005). Keep this as the relevant path rather than inventing a threshold-registrar scheme.

## 5. Comparison
| Mechanism | Integrity gain | Availability gain | Censorship resist. | Metadata effect | Complexity | Maturity of components | Priority |
|---|---|---|---|---|---|---|---|
| Witnesses + mirrors | High (equivocation) | Medium (read) | Low | Neutral | Low | High (CT/tlog ecosystem) | **F1** |
| Static/CID archives | None | Medium (read) | Low | IPFS: negative | Low | Medium | **F1** |
| Relays (Tor-friendly) | None | Medium | Medium | Positive if designed | Medium | Custom | **F2** |
| Head gossip among monitors | Medium | Low | Low | Neutral | Medium | Medium | **F2–F3** |
| Nostr adapter | None | Medium | Medium | Negative on public relays | Low–Med | Medium | **F2–F4 optional** |
| Multi-operator board (set-union per epoch) | Low | High | High | Mixed | High | Custom | **F3** |
| BFT/consensus board | Low | High | High | Mixed | Very high | Medium | Not planned |
| P2P ballot gossip | Low | Uncertain | High | Negative | Very high | Medium | Not planned |

## 6. Phased plan
| Phase | Deliverables | Entry criteria | Exit criteria |
|---|---|---|---|
| **F0 (MVP baseline)** | Single server, signed Merkle log, `quietvote verify`, full export | ADR-007 implemented | Third-party verifier reproduces tally |
| **F1 – Witness & mirror** | Witness protocol (cosigned heads, k-of-m in manifest), reference witness service (stateless), static mirror generator, CID-export of archives, `monitor` CLI that fetches heads and checks consistency | F0 stable; log format frozen | Two independent witness operators running; test showing equivocation detected within one polling interval; mirror restore drill |
| **F2 – Relays & gossip** | Tor-friendly submission relay (store-and-forward, anti-spam), multi-endpoint client, head gossip between monitors, optional Nostr ingest/mirror adapter (flagged) | F1; QV-26 padding/batching done | Relay cannot link IP to voter (tested); censorship simulation: voter reaches board via alternate relay; adapter fuzzing |
| **F3 – Multi-operator board** | Set-union epoch board among 3+ operators, epoch sealing rule, failover, reconciliation protocol, formal model of double-spend resolution | Demand from ≥ 2 orgs; independent review of the model | Chaos tests (partition near close) never produce divergent counted sets; deterministic result across operators; audit by protocol reviewer |
| **F4 – Ecosystem** | Community operator directory (signed, no discovery magic), federation governance (admission, removal), optional trustee services | F3 | Operators from ≥ 3 independent orgs; abuse process documented |
Each phase is independently shippable; none is required for the MVP.

## 7. Requirements (for the phases when scheduled)
| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-32-REQ-001 | The manifest shall be able to declare witnesses (public keys, URLs) and a cosignature threshold k-of-m | Should (F1) | Verifier rejects heads lacking k cosignatures | Unit |
| QV-32-REQ-002 | A witness shall cosign a head only after verifying a consistency proof from its previously cosigned head and shall refuse inconsistent heads | Should (F1) | Fork-injection test yields refusal | Integration |
| QV-32-REQ-003 | Mirrors shall be generated as static files such that all inclusion/consistency proofs can be served without trusted code | Should (F1) | Verifier works against static mirror only | E2E |
| QV-32-REQ-004 | Federation features shall not change the vote-validity rules or tally function; they shall only add transport/replication | Must | Differential test: tally identical via any transport | Integration |
| QV-32-REQ-005 | Nostr or relay transport keys shall never be reused as voter, trustee, or election keys | Must | Key-separation lint/review | Review |
| QV-32-REQ-006 | Multi-operator boards shall define an epoch seal after which no further ballots are accepted for that epoch and shall resolve token/nullifier double-submission deterministically | Could (F3) | Partition/replay tests converge | Simulation |
| QV-32-REQ-007 | Relays shall store no IP addresses or long-term per-ballot metadata | Should (F2) | Log canary tests (QV-26) | Test |
| QV-32-REQ-008 | Docs shall not describe any federated mode as "decentralised voting" without listing residual central roles (registrar, trustees, manifest author) | Must | Doc review | Review |

## 8. Security and abuse cases
| Case | Attacker | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Split-view attack (different logs for different voters) | Malicious operator | Undetected selective inclusion | Witness cosignatures, gossip | Colluding witnesses |
| Relay censorship | Relay operator | Dropped ballots | Multi-relay submission, receipt checks | Coordinated relays |
| Relay deanonymisation | Relay/ISP | IP↔submission linking | Tor, batching/padding | Global adversary |
| Spam/DoS at relays | Anyone | Cost | PoW/token pre-checks, per-roll gating | Residual |
| Operator collusion in multi-operator board | k operators | Delay/withholding | Quorums, deadlines, witnesses | Availability only |
| Double submission across operators | Voter/attacker | Token double-spend race | Epoch seal + deterministic resolution | Rare UX confusion |
| Mirror serving stale head | Mirror | Freshness confusion | Heads include timestamp; witness cosigs | Rollback detection needs gossip |
| IPFS pin removal | Hosts | Archive loss | Multiple pinners, static mirrors | Availability |

## 9. Data and privacy
Federation increases the number of parties who may see submission metadata; ballots remain encrypted and the public log contains only data already public in the base design. Required privacy review (QV-26) per phase. Not claimed: that federation provides anonymity, coercion resistance, or removes the registrar/trustee trust assumptions (ADR-008).

## 10. Interfaces and dependencies
Depends on QV-16 log format and STH encoding, QV-09 endpoints (`/sth`, `/consistency`, `/inclusion`, `/witness/cosign`), QV-26 padding/batching, QV-12 witness operations. Versioning: witness protocol versioned independently; compatibility with C2SP-style cosignature formats preferred over novel formats [R2, verify].

## 11. UX, accessibility, localization
Voters see simple status: "Your ballot is recorded and witnessed by k of m independent witnesses" with a details view; avoid jargon, accessible text alternatives to any diagrams; no requirement to understand relays. Organizer UI: select witnesses from a directory or add custom; defaults offered by the project but not required.

## 12. Operations
Witness operations: run anywhere, minimal state (last head per log), uptime monitored via QV-31-compatible aggregates. Runbooks for witness key rotation, mirror refresh and operator hand-over live in QV-12 appendix when F1 starts. Costs per QV-14.

## 13. Testing and verification
Simulation of fork/equivocation; Jepsen-style partition tests for F3; property tests that tally is invariant to transport; fuzzing of ingest adapters; independent review before F3. Release-blocking for each phase: exit criteria in §6.

## 14. Constraints and assumptions
Community witness operators may be scarce at first (QV may need to operate one itself — a trust-neutral but real operational burden). Nostr/IPFS ecosystems change quickly; every external dependency must be re-evaluated at adoption time.

## 15. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-32-1 Adopt an existing witness spec (C2SP tlog-witness/Sigsum) vs custom? | Architecture lead | F1 start | Adopt existing spec if compatible with RFC 9162 tree format [verify] |
| QV-OQ-32-2 Who operates the first witnesses? | Steward | F1 | 2 independent volunteer/org operators + project's own |
| QV-OQ-32-3 Is multi-operator demand real? | Product | F2 review | Gate F3 on ≥ 2 orgs |
| QV-OQ-32-4 Nostr ballot size caps vs ranked ballots | Protocol | F2 | Chunking not supported; Nostr only for ≤ 32 KB ballots |
| QV-OQ-32-5 Threshold blind signatures for registrar | Researcher | Phase 2 research | Not pursued; use Phase 3 ZK |

## 16. Proposed ADRs
- **QV-ADR-P32-1 — Federation adds transport/replication only; validity and tally rules unchanged.**
- **QV-ADR-P32-2 — Witness cosigning with manifest-declared k-of-m is the first federation feature (F1).**
- **QV-ADR-P32-3 — No ballot P2P gossip; head-gossip among monitors only.**
- **QV-ADR-P32-4 — Nostr/IPFS only as optional dumb-pipe adapters; no key reuse; Merkle log remains source of truth.**

## 17. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## References (accessed 2026-10-21; many not individually retrieved — see tags)
- [R1] RFC 9162, Certificate Transparency Version 2.0, https://www.rfc-editor.org/rfc/rfc9162 (referenced in ADR-007; not re-fetched).
- [R2] Sigsum (https://www.sigsum.org) and C2SP transparency-log specs (https://c2sp.org) [UNVERIFIED names/status; not fetched].
- [R3] D. Ongaro, J. Ousterhout, "In Search of an Understandable Consensus Algorithm (Raft)", USENIX ATC 2014 [not fetched].
- [R4] M. Castro, B. Liskov, "Practical Byzantine Fault Tolerance", OSDI 1999 [not fetched].
- [R5] Nostr NIPs repository, https://github.com/nostr-protocol/nips (NIP-01 basic protocol) — search returned only secondary summaries.
- [R6] NIP-44 and NIP-59 as summarised by secondary sources in search results (e.g., https://d-central.tech/nostr-nips-reference/ , https://nips.4rs.nl/) — verify against the primary repository before relying on details (kind numbers, timestamp randomisation).
- [R7] IPFS documentation, https://docs.ipfs.tech [not fetched].
