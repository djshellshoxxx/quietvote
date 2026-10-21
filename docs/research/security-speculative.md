# Speculative security research: QuietVote

**Status:** AI-assisted speculation, **not an audit**. Written by an automated research agent (Claude, model claude-haiku-5-5) on 2026-10-21 from a read of `docs/16`, `docs/17`, `docs/18`, `docs/decision-log.md` and the TypeScript sources under `packages/**`. Nothing under `packages/**` was edited, no git operations were run, and no proposal below has been merged or reviewed by a cryptographer.

**Scope limits.** The external sources could not be fetched from the sandbox (DNS failed for `rfc-editor.org`, `ndss-symposium.org` and similar hosts), so every external citation is **UNVERIFIED** unless marked otherwise. Repository citations are file-and-function references, checked by reading the code. Two small proofs of concept were run in the session scratchpad (not in the repo); they are labelled PoC below.

## Legend

- **[CODE]** statement checked by reading the cited source.
- **[PoC]** reproduced by a scratch script importing the repo's crypto sources (`node` 22.22, scratch files only).
- **[REASON]** argued from the design; not executed.
- **[UNVERIFIED]** external claim or citation that could not be confirmed in this session.

## Top 10 by priority

1. **RNG-repeat amplification in DKG and share transport** (Item 1). `dhProve` and `encryptShare` leak a trustee's transport key or the AES-GCM keystream when the injected RNG repeats. [PoC]. Priority: High (conditional on RNG failure).
2. **Below-floor and differencing inference across elections** (Item 2). Floor defaults are weak, `privacy_ack` is hard-coded to `true`, and nothing stops differencing across elections or roll changes. [CODE]. Priority: High.
3. **Clock and witness defaults make close-extension and split view silent** (Item 3). The web wizard sets `witness_quorum: 0`, `clock_skew_s: 300`, and a single coordinator key with `m: 1`. [CODE]. Priority: High.
4. **Signer exposes a nonce key and acts as a signing oracle** (Item 4). `Signer.nonceKey` is a public field, and `sign(message)` signs arbitrary bytes for any code that holds the signer. [CODE]. Priority: High (malicious-extension model).
5. **Supply chain: no reproducible-build or release-manifest job in the repo** (Item 5). Only `ci.yml` exists. Internal dependencies are wildcard `"*"`. [CODE]. Priority: Medium-High.
6. **Coercion and revote linkability** (Item 6). Voter public key and `supersedes` chain are public in every cast body, and spoil publication links plaintext to the voter key. [CODE]. Priority: Medium (already a documented non-claim, but the linkage is wider than the docs' wording suggests).
7. **Server DoS via rate-limit bucket eviction** (Item 7). The LRU table is capped at 100 000 entries and IPv6 `/56` buckets are cheap to rotate. [CODE]. Priority: Medium.
8. **DKG abort and bias** (Item 8). Any qualified dealer can withhold to abort or shape the qualified set. [REASON; GJKR citation UNVERIFIED]. Priority: Medium.
9. **Harvest-now-decrypt-later on ElGamal ballots** (Item 9). Ristretto ElGamal ciphertexts are public forever, and the board's ML-DSA option is recognised but unsupported. [CODE + REASON]. Priority: Medium (long-horizon).
10. **Cross-protocol signature reuse on a single Ed25519 key** (Item 10). Ballot-cast, board-entry, registration proof-of-possession and the signer oracle all share one key, with domain tags that differ only by label. [CODE]. Priority: Medium-Low.

Lower-priority items (11-18): trustee collusion and rubber-hose, replay of trustee shares, metadata/size/timing, ballot-code side channels, BigInt timing, passphrase and KDF floors, roll/enrolment, and the `fixedA0` footgun.

---

## Item 1. RNG-repeat amplification in DKG and share transport

**Threat.** A trustee's transport secret `e_j` or a share ciphertext's keystream is recovered when the injected RNG repeats output.

**Attacker model.** Passive or active party with the public transcript, plus a VM snapshot or broken entropy source that repeats RNG output during one trustee's ceremony step. Not a remote attacker against a healthy CSPRNG.

**Impact.** Repeated RNG in `dhProve` leaks `e_j` [PoC]. With `e_j`, all share packages sent to trustee `j` decrypt, which reveals that trustee's final share `s_j` (given the dealt shares). Repeated RNG in `encryptShare` gives the same ephemeral `R` and the same AES key for two shares, and a zero IV is then reused [PoC]: `ct1 XOR ct2 = y1 XOR y2`.

**Existing mitigation.**
- `dhProve`, `pokProve`, `shareKeyProve`, `cdsProve` draw nonces from the injected `Rng`. [CODE: `packages/crypto/src/proofs.ts`]
- `decProve` and `spoilDecProve` hedge with the secret `s_j` and 32 RNG bytes. [CODE: `proofs.ts`, `decProve`]
- `encryptShare` uses a single-use key per share with a zero IV, and binds `mh`, `i`, `j`, `R` in the HKDF salt and AAD. [CODE: `packages/crypto/src/share-cipher.ts`]
- Existing test `proofs.test.ts` ("decryption with a failed RNG…") varies `oid` between the two statements, so it does not cover repeated RNG with the same `(cid, oid)` and different `(A, B)`. [CODE]

**Proposed fix.** Make nonces depend on the statement and on the secret, not only on RNG output. This is a spec change (it alters `cp-dec-nonce` and `share-eph` framing), so it must go through QV-16 revision and QV-34 vector regeneration.

```ts
// packages/crypto/src/proofs.ts  (proposal; do not merge without spec revision)
// Hedged decryption nonce: binds the statement (A, B) and the secret, so a repeated RNG
// with a different aggregate yields a different u.
import { frame, firstNonZero } from './transcript.ts';
import { scalarFromWide, scalarToBytes, pointToBytes, type Scalar } from './ristretto.ts';
import { sha512 } from '@noble/hashes/sha2.js';
import { u32, utf8 } from './bytes.ts';

export function hedgedDecNonce(sj: Scalar, ctx: Uint8Array, cid: string, oid: string, A: Point, B: Point, rnd: Uint8Array): Scalar {
  const fields = [scalarToBytes(sj), ctx, utf8(cid), utf8(oid), pointToBytes(A), pointToBytes(B), rnd];
  return firstNonZero((c) => scalarFromWide(sha512(frame('cp-dec-nonce', [...fields, u32(c)]))));
}
```

```ts
// packages/crypto/src/share-cipher.ts  (proposal): make the ephemeral scalar depend on y too,
// so AES-GCM (key, zero IV) never repeats for two different plaintexts.
export function hedgedShareEphemeral(rng: Rng, y: Scalar, mh: Uint8Array, i: number, j: number): Scalar {
  const rnd = rng.bytes(32);
  return firstNonZero((c) => scalarFromWide(sha512(frame('dkg-share-eph', [rnd, scalarToBytes(y), mh, utf8(`${i}/${j}`), u32(c)]))));
}
```

**Test idea.** Use `constantRng(7)` for two decryptions of the same `(cid, oid)` with different `A`; assert that `(s1 - s2) / (c1 - c2)` does not equal `s_j`. For the share path, assert two `encryptShare` calls with `constantRng` and different `y` give distinct `R`. The PoC in the session scratchpad (`poc-nonce.ts`, `poc-share-hedge.ts`) shows the attack and the hedge working.

**Priority.** High (conditional on RNG failure). Cheap to fix, and the fix is a spec-level change.

**Also noted (lower risk).** `pokProve` and `dhProve` use unhedged nonces. Two dealings with a repeated `u` and the same secret reveal little (the statement includes `A`, so the challenge is identical), so `pokProve` is Low. `dhProve` is High only through the transport-key chain above.

---

## Item 2. Below-floor and differencing inference

**Threat.** Individual votes are recovered by differencing aggregates, across elections with overlapping rolls, or by small per-option counts.

**Attacker model.** Organizer or coordinator who controls roll, election parameters and publication; or any party with two published results.

**Impact.** Unanimous or near-unanimous results disclose individual choices, especially with 3 counted ballots.

**Existing mitigation.**
- Trustee path recomputes the counted set from the full verified log and refuses below floor. [CODE: `packages/trustee/src/trustee.ts`, `verifiedElection` step 5; `packages/protocol/src/tally.ts`, `trusteeDecryptTally`]. A subset supplied by a coordinator is therefore not decrypted via the trustee machine. The library function `trusteeDecryptTally` does accept any `counted` list, so its safety depends on the caller.
- Floor: `effectiveMinCounted` gives 5 if roll ≥ 8, else 3. [CODE: `packages/protocol/src/manifest.ts`]
- Small-group acknowledgement required below 10. [CODE: `manifest.ts`, `privacy_ack`]
- Docs warn about small rolls (docs/06 R1; docs/07 QV-07-REQ-017).

**What is not covered.**
- `packages/web/src/flow/organizer.ts` writes `privacy_ack: true` unconditionally (no UI consent gate in the builder itself). [CODE] So a wizard run for a 3-person roll silently satisfies the acknowledgement.
- Cross-election differencing: two elections over rolls differing by one member reveal that member's vote. Nothing in the protocol relates elections. [REASON]
- Per-option totals with 3 counted ballots are public by design. [CODE: tally record publishes per-option counts]

**Proposed fix.** Require an explicit, non-defaulted acknowledgement in the wizard and a manifest-level refusal below a stronger floor for multi-option contests. Also add a cross-election guard that a coordinator can see but not silently waive.

```ts
// packages/web/src/flow/organizer.ts  (proposal)
// Replace the hard-coded privacy_ack with an explicit, user-supplied flag.
export function buildManifestGuard(rollSize: number, ackGiven: boolean): { ok: true } | { ok: false; code: string } {
  const floor = rollSize >= 8 ? 5 : 3;
  if (rollSize < 10 && !ackGiven) return { ok: false, code: 'E-ORG-PRIVACY-ACK' };
  if (floor < 5) return { ok: false, code: 'E-ORG-FLOOR-TOO-LOW' };
  return { ok: true };
}
```

```ts
// packages/protocol/test/privacy-guard.test.ts (proposal)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifestGuard } from '../../web/src/flow/organizer.ts';
test('small roll without explicit ack is refused', () => {
  assert.deepEqual(buildManifestGuard(3, false), { ok: false, code: 'E-ORG-PRIVACY-ACK' });
});
```

**Test idea.** Property test: for any two elections whose rolls differ by one voter and whose counted sets differ by one ballot, the verifier or wizard emits a warning. Compare against the Dinur-Nissim reconstruction literature (UNVERIFIED citation below).

**Priority.** High. Mostly a policy and UX gap that the code currently turns into a silent default.

---

## Item 3. Clock skew, close extension and witness defaults

**Threat.** A coordinator or operator extends the close or opens early, or equivocates the log, without the verifier noticing.

**Attacker model.** Operator (A5 in docs/07) and a coordinator holding the single signing key; optionally colluding witnesses.

**Impact.** Ballots accepted after the stated close, or admitted before open, and split views of the log not detected by voters.

**Existing mitigation.**
- Verifier checks witnessed tree-head times against `voting_open - clock_skew_s` and `voting_close ± clock_skew_s`. [CODE: `packages/protocol/src/logcheck.ts`, around the `E_TIME_WINDOW` checks]
- Server checks the window with its own clock. [CODE: `packages/server/src/election.ts`, `inVotingWindow`, and the close check]
- Unwitnessed elections carry an explicit caveat. [CODE: `logcheck.ts`, "NOT WITNESSED" message]

**What is not covered.**
- Web wizard sets `witness_quorum: 0` unconditionally, and `clock_skew_s: 300`. [CODE: `packages/web/src/flow/organizer.ts`]
- Schema allows `clock_skew_s` up to 86400 s. [CODE: `packages/protocol/src/schema.ts`]
- Coordinator is one key with `m: 1`, which can post the close marker alone. [CODE: `organizer.ts`, `coordinator: { keys: [...], m: 1 }`]
- The operator controls the server clock, so it can admit ballots up to `clock_skew_s` late; with no witnesses the verifier can only caveat this. [REASON]

**Proposed fix.** Refuse `witness_quorum = 0` for public elections by default, cap `clock_skew_s` at a smaller bound (for example 300), and require `m ≥ 2` for coordinator markers when more than one coordinator key exists.

```ts
// packages/protocol/src/manifest.ts  (proposal)
export const MAX_CLOCK_SKEW_S = 300;
export function checkTimeAndWitnessPolicy(m: { clock_skew_s: number; bb: { witness_quorum: number } }, publicElection: boolean): string | null {
  if (m.clock_skew_s > MAX_CLOCK_SKEW_S) return 'clock_skew_s above policy cap';
  if (publicElection && m.bb.witness_quorum < 1) return 'public elections require witness_quorum >= 1';
  return null;
}
```

**Test idea.** Build a manifest with `witness_quorum: 0` and assert `checkTimeAndWitnessPolicy(m, true)` is non-null. Add a log-replay test where the close marker is witnessed 301 s late and assert `E_TIME_WINDOW`.

**Priority.** High. These are defaults, so the risk is silent for every organizer who accepts the wizard output.

---

## Item 4. Signer exposes a nonce key and acts as a signing oracle

**Threat.** Page or extension code with a reference to the `Signer` (a) reads the hedging key and (b) gets arbitrary Ed25519 signatures from the voter key.

**Attacker model.** Malicious browser extension or compromised page script (QV-16 "malicious client" model). Not the operator.

**Impact.**
- (a) `nonceKey` is `h256('voter-nonce-key', seed)`. Ballot seed `xi` is `deriveXi(ctx, nonceKey, rho, attempt, selvec)`. If `rho` is also observed or biased (for example by hooking `crypto.getRandomValues`), `xi` is computable, and per QV-16 §5.11 P4 the whole ballot is recomputable from `xi` and the selections. This makes enumeration of the small selection space feasible for anyone holding both values. [REASON; by design P4 equals disclosure of the opening.]
- (b) The same key signs cast envelopes, board entries (`entries.ts`) and registration proof-of-possession signatures, so a page-level oracle can request signatures on messages it chose. [CODE]

**Existing mitigation.**
- Non-extractable WebCrypto key when available. [CODE: `packages/web/src/key/signer.ts`, `tryWebCrypto`]
- Seed is wiped after signer construction; `lock()` drops references. [CODE: `signer.ts`]
- `xi` is wiped after successful submit. [CODE: `packages/web/src/flow/ballot-controller.ts`, `discardSecrets`]
- Domain tags differ by label (`sig-cast`, `sig-spoil`, `QV-REG-v1`, entry `SIG_DOMAIN`).

**What is not covered.**
- `nonceKey` is a `readonly` public property on the object returned by `createSigner`. [CODE] It is also serialised to the seal worker (`ballot-controller.ts`, `nonceKey: bytesToHex(...)`).
- `sign(message)` accepts any bytes; there is no purpose binding at the signer. [CODE]
- Secrets are `Uint8Array` buffers; JS cannot guarantee they are zeroed (GC copies). [REASON]

**Proposed fix.** Keep `nonceKey` private to the seal worker and expose a purpose-bound API. The signer then only signs typed digests.

```ts
// packages/web/src/key/signer.ts  (proposal)
export type SignPurpose = 'cast' | 'spoil' | 'entry' | 'pop';
export interface PurposeSigner {
  readonly publicKey: Uint8Array;
  signPurpose(purpose: SignPurpose, digest: Uint8Array): Promise<Uint8Array>;
}
export function purposeSigner(inner: { sign(m: Uint8Array): Promise<Uint8Array>; publicKey: Uint8Array }): PurposeSigner {
  const prefix: Record<SignPurpose, number> = { cast: 1, spoil: 2, entry: 3, pop: 4 };
  return {
    publicKey: inner.publicKey,
    async signPurpose(purpose, digest) {
      if (digest.length !== 32 && purpose !== 'entry') throw new Error('digest must be 32 bytes');
      return inner.sign(Uint8Array.of(prefix[purpose], ...digest));
    },
  };
}
```

Note: changing the signed bytes changes verification, so this needs a protocol version bump or a verifier that accepts the old form for a deprecation window.

**Test idea.** Assert `Object.getOwnPropertyDescriptor(signer, 'nonceKey')` is absent after the change, and that `signPurpose('cast', x)` cannot produce a signature that verifies as `spoil` for the same `x`.

**Priority.** High under the malicious-extension model, which the docs already list as out of scope (docs/08 "malicious web code"). Worth fixing even so.

---

## Item 5. Supply chain: reproducible builds, release manifest, dependency confusion

**Threat.** A release artifact (web bundle, CLI, verifier) differs from the reviewed source, or a dependency name is hijacked.

**Attacker model.** Compromised maintainer or CI, malicious registry package, or operator serving modified JS (A5).

**Existing mitigation.**
- `.npmrc` sets `ignore-scripts=true`, `save-exact=true`. [CODE]
- CI runs `npm ci --ignore-scripts`, pins third-party actions to SHAs, and runs `check-action-pins.mjs`. [CODE: `.github/workflows/ci.yml`, `.github/scripts/check-action-pins.mjs`]
- Lockfile resolves to `registry.npmjs.org`. [CODE: `package-lock.json`]
- Static site emits sha384 SRI on its own assets and a restrictive CSP. [CODE: `packages/web/src/build/site.ts`]

**What is not covered.**
- Only `.github/workflows/ci.yml` exists. No job builds twice or emits a signed release manifest, although QV-02-REQ-083 and QV-07-REQ-050 require it. [CODE + REASON]
- Internal dependencies are `"*"` in every package (`packages/*/package.json`). Dependency confusion is possible if any `@quietvote/*` package is published or resolved outside the workspace. Whether the npm scope is claimed is UNVERIFIED. [CODE]
- The operator serves the HTML, so SRI on JS does not protect against a malicious HTML page changing the `integrity` attributes; only an external verifier does. [REASON]

**Proposed fix.** Add a release job that builds twice in clean containers and compares hashes, and pin internal versions to exact workspace versions.

```js
// scripts/release-manifest.mjs (proposal)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
export function manifestFor(dir) {
  const files = readdirSync(dir).sort();
  return files.map((f) => ({ path: f, sha256: createHash('sha256').update(readFileSync(join(dir, f))).digest('hex') }));
}
// CI: build in two jobs, diff manifestFor(distA) with manifestFor(distB), fail on any difference.
```

```json
// packages/web/package.json (proposal): pin internal deps to the workspace version, not "*"
{ "dependencies": { "@quietvote/crypto": "0.0.0", "@quietvote/board": "0.0.0", "@quietvote/protocol": "0.0.0" } }
```

**Test idea.** CI job: build twice with `SOURCE_DATE_EPOCH` set, assert `manifestFor` equal. Separate test: a package installed outside the workspace must fail to resolve an internal name.

**Priority.** Medium-High. The gap is in the process, not in the crypto code.

---

## Item 6. Coercion, vote-selling and receipt linkage

**Threat.** A coercer tests whether the victim voted as demanded, or buys a vote with proof.

**Attacker model.** A4 in docs/07: employer or household member, sometimes with the victim's key or device.

**Impact.**
- Every cast body contains the voter's public key and a `supersedes` hash that links revotes. [CODE: `packages/protocol/src/ballot.ts`, `encryptBallot`; ballot body schema] A coercer who knows the roll key sees whether and when the victim revoted, even without decrypting anything.
- Spoil with `publish` mode attaches the reveal and links selections to the voter key. [CODE: `ballot.ts`, `makeSpoil`] Published reveals are sale evidence for the same voter's *spoiled* attempts, not for the cast ballot, but they still prove the voter's handling of the interface.
- A coercer holding the key can cast last, overriding the victim's revote. [REASON]

**Existing mitigation.** Revoting, fresh randomness per ballot, cast-after-spoil and spoil-after-cast checks, binder-bound proofs (`election.ts`: `E_SPOILED_CODE_CAST`, `codeOwner` check). Docs state receipt-freeness is not claimed (docs/05 G-C1, docs/07 N-1, docs/10).

**Proposed fix (partial, honest).** Fake-credential or delayed-reveal designs are research-level (JCJ 2005; UNVERIFIED citation). A narrow improvement: decouple the public voter key from the body by using a per-election nullifier, as already sketched in docs/04 §6 (nullifier `nf = F(sk, election_id)`).

```ts
// packages/protocol/src/nullifier.ts (proposal sketch; needs spec change)
import { sha256 } from '@noble/hashes/sha2.js';
export function electionNullifier(voterSecret: Uint8Array, electionId: Uint8Array): Uint8Array {
  // Keyed hash so the roll key does not appear in the cast body.
  return sha256(new Uint8Array([...utf8('QV-NF-v1\0'), ...electionId, ...voterSecret]));
}
```

Caution: this hides only the roll key, not the timing or the fact of revoting, and it needs a registration step that proves roll membership without the public key.

**Test idea.** Two casts by the same voter produce distinct public identifiers in the body; the verifier still links them via the nullifier rule.

**Priority.** Medium. Already a non-claim; the finding is that the linkage is wider than "revoting only partially mitigates".

---

## Item 7. Server DoS and rate-limit bypass

**Threat.** Attackers exhaust server capacity or reset legitimate buckets.

**Attacker model.** Unauthenticated internet attacker with many IPv6 `/56` prefixes; or a voter with one valid key submitting many invalid ballots.

**Existing mitigation.**
- Token-bucket limiter with class-based specs and HMAC network buckets (IPv4 /24, IPv6 /56) rotated daily. [CODE: `packages/server/src/ratelimit.ts`]
- SSE caps: per-client and total streams. [CODE: `packages/server/src/sse.ts`, `config.ts` `maxSseTotal` default 1024]
- Body-size caps per route; ballot entry request cap. [CODE: `packages/server/src/app.ts`, `maxBody`]
- Admission order: state and phase checks, then `verifyEnvelope` (signature then proofs). [CODE: `packages/server/src/election.ts`, admission path]

**What is not covered.**
- When the bucket table exceeds 100 000 entries, the oldest entry is evicted. [CODE: `ratelimit.ts`, `this.m.size > this.max`] An attacker creating unique network buckets can evict legitimate ones and reset their budgets.
- Per-voter-key quotas on ballot submissions are not visible in the admission code; `max_per_voter` counts only admissible casts. [CODE + REASON] Invalid submissions by one valid key still cost one signature verify and up to a full proof verify each (`proofVerifications` counter).

**Proposed fix.** Use a per-author quota before proof verification, and a bucket table that rejects new keys when full instead of evicting.

```ts
// packages/server/src/ratelimit.ts (proposal)
if (this.m.size >= this.max && !this.m.has(key)) {
  return { ok: false, limit: spec.limit, remaining: 0, resetSec: 60, retryAfterSec: 60 }; // fail closed, do not evict
}
```

```ts
// packages/server/src/election.ts (proposal) - cheap quota before proof verification
const perKey = (st.authorBudget.get(kid) ?? 0) + 1;
if (perKey > 4) throw new ApiError(429, 'RATE_LIMITED', 'author quota', { retryable: true });
st.authorBudget.set(kid, perKey);
```

**Test idea.** Fill the bucket table to `max` with distinct keys; assert that an existing key's budget is not reset and that a new key is refused with 429.

**Priority.** Medium.

---

## Item 8. DKG abort and bias

**Threat.** A dealer aborts after seeing others' reveals to change the qualified set, or to bias the joint key distribution.

**Attacker model.** One malicious trustee below threshold.

**Existing mitigation.**
- Commit-then-reveal, PoK per coefficient, DH-reveal DLEQ for complaints, deterministic adjudication. [CODE: `packages/protocol/src/dkg.ts`; `checkDealing`, `dkgMakeComplaint`, `adjudicateDkg`]
- Events for equivocation and missing reveals. [CODE: `dkg.ts`, `E_DKG_EQUIVOCATION`, `E_DKG_R1`]
- `E_DKG_QUORUM` if fewer than `t` qualified dealers. [CODE: `dkg.ts`]

**Impact.** Abort is an availability attack (restart needed). Bias in Joint-Feldman style DKG is known: the adversary chooses whether to contribute after seeing others (Gennaro, Jarecki, Krawczyk, Rabin, EUROCRYPT 1999; UNVERIFIED citation). For ElGamal secrecy the bias is usually not decisive, but it matters for protocols needing uniform keys.

**Proposed fix.** Bound restarts, record aborts as a verifiable event, and pin the qualified set by a second commit round.

```ts
// packages/protocol/src/dkg.ts (proposal)
export const MAX_DKG_ATTEMPTS = 3;
export function nextAttempt(prev: { attempt: number; abortedBy: number[] }): { attempt: number; abortedBy: number[] } | 'ABANDON' {
  if (prev.attempt + 1 >= MAX_DKG_ATTEMPTS) return 'ABANDON';
  return { attempt: prev.attempt + 1, abortedBy: prev.abortedBy };
}
```

**Test idea.** Simulate t-1 honest and one withholding dealer over three attempts; assert `ABANDON` and that the abort list is signed by the coordinator.

**Priority.** Medium.

---

## Item 9. Harvest-now-decrypt-later on ElGamal ballots

**Threat.** A future quantum adversary breaks discrete logs on Ristretto255 and recovers individual ballots from the public log.

**Attacker model.** Passive recorder of the public log today, with a future CRQC.

**Impact.** Ciphertext `A = rG` yields `r` by Shor, then `B - rK = mG` gives the plaintext (QV-ADR-013 accepts this as residual risk). DKG share transports (ECDH on Ristretto) recorded today are also decryptable later, which yields trustee shares.

**Existing mitigation.** None in code. ADR-013 defers PQ secrecy. [CODE: `docs/decision-log.md`]. The board supports `mldsa44` as an author/witness algorithm but marks it unsupported. [CODE: `packages/board/src/checkpoint.ts`, `alg: 'ed25519' | 'mldsa44'`]

**Proposed fix.** Design-level only. Options: (a) a lattice-based additively homomorphic threshold scheme (research; UNVERIFIED), (b) hybrid share transport using ML-KEM (FIPS 203, UNVERIFIED URL), and (c) implementing ML-DSA signatures (FIPS 204) for the board so signatures are not the first thing to break. The code below is a suite-dispatch guard that makes the migration explicit.

```ts
// packages/protocol/src/suite.ts (proposal)
export type Suite = 'qv1-r255-sha2' | 'qv2-hybrid-pq';
export function assertSuite(s: string): asserts s is Suite {
  if (s !== 'qv1-r255-sha2' && s !== 'qv2-hybrid-pq') throw new Error(`unknown suite ${s}`);
}
```

**Test idea.** Election manifest with `qv1` must still verify, and a hybrid transport test must fail if the ML-KEM half is stripped.

**Priority.** Medium (long-horizon). Matters if ballots must stay confidential for more than a decade.

---

## Item 10. Cross-protocol signature reuse on one key

**Threat.** A signature made for one purpose is accepted for another.

**Attacker model.** Page-level signing oracle (see Item 4), or a malicious operator who gets a voter to sign a crafted entry.

**Impact.** Low in practice because labels are hashed into the digest, and `sig-cast` and `sig-spoil` are fixed-length 32-byte digests while entries are JSON. The residual risk is the oracle itself: any entry signature can be requested by a page holding the signer.

**Existing mitigation.** Domain tags `QV-RECEIPT-v1\0`, `QV-REQ-v1\0`, `cosignature/v1`, `QV-KEY-v1\0`, `QV-REG-v1\0`, label registry with framing. [CODE: `packages/board/src/receipt.ts`, `checkpoint.ts`, `packages/server/src/auth.ts`, `app.ts`, `packages/crypto/src/transcript.ts`]

**Proposed fix.** Use the purpose-bound signer from Item 4 for every signature site, and add a test that no two purposes can produce colliding messages.

```ts
// packages/crypto/test/domain.test.ts (proposal)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frame } from '../src/transcript.ts';
test('frames for different labels never coincide', () => {
  const a = frame('sig-cast', [new Uint8Array(32)]);
  const b = frame('sig-spoil', [new Uint8Array(32)]);
  assert.notDeepEqual(a, b);
});
```

**Priority.** Medium-Low.

---

## Items 11-18 (brief)

**11. Trustee collusion and rubber-hose.** Threshold `t` out of `n` is the only protection, as stated in docs/17. Speculative addition: require each trustee's signed `keycheck` (already present) before any release, which is in code. Priority: Low (out of scope per docs).

**12. Replay of trustee shares across elections.** Checked and not reproduced. `dkgDeal` uses fresh coefficients per election; `deriveKey` and AAD bind `mh`; decryption proofs bind `ctx`; `verifiedElection` checks the manifest hash. [CODE] Residual footgun: `dkgDeal` takes `fixedA0` (test and ceremony-replay only); production `trustee.ts` does not pass it. [CODE] Priority: Low.

**13. Metadata, size and timing.** Ballot size is fixed per contest with placeholders (QV-16 §5.9). Submission timing and IP are the main leaks (docs/07 AS-14). [REASON] Priority: Low.

**14. Ballot-code side channels.** The displayed prefix is 130 bits (docs/16 §5.12.1), which makes grinding a same-prefix ballot infeasible. A shoulder-surfed or photographed QR code reveals nothing about the vote. [REASON] Priority: Low.

**15. Timing side channels in scalar arithmetic.** `scalarMul` and `scalarAdd` are BigInt operations (`packages/crypto/src/ristretto.ts`). JS BigInt is not constant-time, so secret scalars (ElGamal `r`, shares `s_j`) pass through variable-time arithmetic. Exploitation over a network is UNVERIFIED and likely very hard. Priority: Low.

**16. Passphrase and KDF floors.** Trustee passphrase minimum is 60 estimated bits (`passphrase.ts`). Voter key floor is Argon2id m=19456 KiB, t=2 (`packages/web/src/key/keystore.ts`), which is near the OWASP minimum (UNVERIFIED citation). Parameters are read from the stored blob, so a tampered IndexedDB record can downgrade to the floor. Priority: Low-Medium.

**17. Roll and enrolment.** Invite codes are stored hashed (docs/04 REQ-004). Registration is unauthenticated apart from a proof-of-possession signature (`packages/server/src/app.ts`), which is correct. The steward controls the roll until the manifest is signed, and registration timestamps are rounded to an hour (`app.ts`), limiting timing leaks. Whether the server rejects registration after the roll commit was not confirmed. Priority: Low-Medium.

**18. Public-log linkage across elections.** The voter public key is reused across elections if the same key is registered; the nullifier idea in Item 6 addresses this. Priority: Low-Medium.

---

## Sources

All external sources below were **not** fetched in this session (DNS failure in the sandbox). Treat as UNVERIFIED until a reviewer confirms the URL and content. Access date for all: 2026-10-21.

- RFC 9496, ristretto255 and decaf448. https://www.rfc-editor.org/rfc/rfc9496 [UNVERIFIED]
- RFC 8032, Edwards-Curve Digital Signature Algorithm (EdDSA). https://www.rfc-editor.org/rfc/rfc8032 [UNVERIFIED]
- RFC 8452, AES-GCM-SIV (nonce-misuse resistance). https://www.rfc-editor.org/rfc/rfc8452 [UNVERIFIED]
- RFC 9106, Argon2. https://www.rfc-editor.org/rfc/rfc9106 [UNVERIFIED]
- RFC 9162, Certificate Transparency Version 2.0. https://www.rfc-editor.org/rfc/rfc9162 [UNVERIFIED]
- RFC 8785, JSON Canonicalization Scheme. https://www.rfc-editor.org/rfc/rfc8785 [UNVERIFIED]
- NIST FIPS 203 (ML-KEM) and FIPS 204 (ML-DSA). https://csrc.nist.gov/pubs/fips/203/final ; https://csrc.nist.gov/pubs/fips/204/final [UNVERIFIED]
- Ristenpart and Yilek, "When Good Randomness Goes Bad: Virtual Machine Reset Vulnerabilities and Hedging Deployed Cryptography", NDSS 2010. https://www.ndss-symposium.org/ndss2010/when-good-randomness-goes-bad-virtual-machine-reset-vulnerabilities-and-hedging-deployed-cryptography/ [UNVERIFIED]
- Juels, Catalano, Jakobsson, "Coercion-Resistant Electronic Elections", IACR ePrint 2002/165. https://eprint.iacr.org/2002/165 [UNVERIFIED; cited in docs/07]
- Gennaro, Jarecki, Krawczyk, Rabin, "Secure Distributed Key Generation for Discrete-Log Based Cryptosystems", EUROCRYPT 1999. No URL confirmed. [UNVERIFIED]
- Benaloh, "Simple Verifiable Elections", USENIX EVT 2006. [UNVERIFIED; cited in docs/07]
- Adida, "Helios: Web-based Open-Audit Voting", USENIX Security 2008. [UNVERIFIED]
- Dinur and Nissim, "Revealing Information while Preserving Privacy", PODS 2003 (differencing and reconstruction). [UNVERIFIED]
- Heninger et al., "Mining Your Ps and Qs", USENIX Security 2012 (repeated-randomness keys). https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/heninger [UNVERIFIED]
- Heilman et al., "Eclipse Attacks on Bitcoin's Peer-to-Peer Network", USENIX Security 2015. https://www.usenix.org/conference/usenixsecurity15/technical-sessions/presentation/heilman [UNVERIFIED]
- C2SP tlog-checkpoint, tlog-cosignature, tlog-witness. https://c2sp.org/tlog-checkpoint ; https://c2sp.org/tlog-cosignature ; https://c2sp.org/tlog-witness [UNVERIFIED]
- ZIP 215 (Ed25519 verification and malleability). https://zips.z.cash/zip-0215 [UNVERIFIED]
- Shor, "Polynomial-Time Algorithms for Prime Factorization and Discrete Logarithms on a Quantum Computer". https://arxiv.org/abs/quant-ph/9508027 [UNVERIFIED]
- CVE-2008-0166 (Debian OpenSSL predictable keys). https://nvd.nist.gov/vuln/detail/CVE-2008-0166 [UNVERIFIED]
- CVE-2020-10148 (SolarWinds supply-chain). https://nvd.nist.gov/vuln/detail/CVE-2020-10148 [UNVERIFIED]
- Birsan, "Dependency Confusion" (2021). https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610 [UNVERIFIED]
- NIST SP 800-38D (AES-GCM). https://csrc.nist.gov/pubs/sp/800/38/d/final [UNVERIFIED]

## Repository citations (checked)

- `packages/crypto/src/proofs.ts`: `dhProve`, `pokProve`, `shareKeyProve`, `cdsProve`, `limitProve`, `decProve`, `spoilDecProve`.
- `packages/crypto/src/share-cipher.ts`: `encryptShare`, `deriveKey`, `aad`.
- `packages/crypto/src/transcript.ts`: `LABELS`, `frame`, `hsNz`, `firstNonZero`.
- `packages/crypto/test/proofs.test.ts`: failed-RNG test (varies `oid`).
- `packages/protocol/src/dkg.ts`: `dkgDeal` (`fixedA0`), `checkDealing`, `dkgMakeComplaint`, `adjudicateDkg`.
- `packages/protocol/src/ballot.ts`: `deriveXi`, `encryptBallot`, `makeSpoil`, `buildBallot`.
- `packages/protocol/src/tally.ts`: `trusteeDecryptTally`, `trusteeDecryptSpoiled`.
- `packages/protocol/src/manifest.ts`: `effectiveMinCounted`, `privacy_ack` check.
- `packages/protocol/src/logcheck.ts`: `E_TIME_WINDOW`, "NOT WITNESSED".
- `packages/protocol/src/schema.ts`: `clock_skew_s` bound.
- `packages/trustee/src/trustee.ts`: `drillCiphertext`, `verifiedElection`, `releaseTally`.
- `packages/server/src/election.ts`: `inVotingWindow`, ballot admission (`E_SPOILED_CODE_CAST`, `codeOwner`).
- `packages/server/src/ratelimit.ts`: LRU eviction at `max`.
- `packages/server/src/sse.ts`, `config.ts`: SSE caps.
- `packages/web/src/flow/organizer.ts`: `privacy_ack: true`, `witness_quorum: 0`, `clock_skew_s: 300`, `coordinator m: 1`.
- `packages/web/src/key/signer.ts`: `nonceKey`, `sign`, `lock`.
- `packages/web/src/flow/ballot-controller.ts`: `nonceKey` passed to seal worker; `discardSecrets`.
- `packages/web/src/build/site.ts`: SRI, CSP.
- `packages/board/src/checkpoint.ts`: `mldsa44` unsupported.
- `.github/workflows/ci.yml`, `.npmrc`, `packages/*/package.json` (wildcard internal deps).

## Scratch artefacts (outside the repo)

- `poc-nonce.ts` and `poc-share-hedge.ts` in the session scratchpad (`.../scratchpad/poc/`). Four results: decProve, dhProve and encryptShare leak under repeated RNG; the proposed hedges remove the leak.

## Honest caveats

- Everything here is speculative or pattern-based unless marked [CODE] or [PoC]. No cryptographer has reviewed it.
- The PoCs use a constant RNG to model repetition; real RNG failure modes differ.
- Priorities reflect the threat models in docs/07, not a measured risk.
- The external literature was not checked in this session.
