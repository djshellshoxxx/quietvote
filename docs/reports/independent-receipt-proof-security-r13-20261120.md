# Independent later receipt-proof security review — R13

Date: November 20, 2026. Fresh reviewer: `/root/security_audit_r13`.
This bounded defensive source review supplies no appointed security approval,
independent cryptographic certification or release authorization.

## Outcome and exact source

**No new blocking security defect was identified in the inspected implementation.**
The read-only command verifies saved evidence before making a request, binds
new inclusion to the requested snapshot, and requires consistency with a
supplied prior included checkpoint before successful growth output. Missing
signed evidence remains incomplete.

| Identity | Value |
| --- | --- |
| Published baseline, recorded by the coordinator | `46ede0a4aedb39a0ff648441a9fab6774af17097` |
| Equivalent local starting commit | `7a2fa27d37cfb5d5bdc2f8f9d266e2baa5a290a0` |
| Starting complete tree | `2cd074b563c6b11cb2ccb74a680721bea2748d9a` |
| Inspected production implementation | `febb956cdc61e892b7577c8b9c6f33882a6d7498` |
| Implementation tree | `d0b95e5974b57264f67e123e96bb64fcdf5984e0` |
| Independent acceptance source | `38acf8e64a3c042faa7a35a92e7987cb3fff4f1b` |
| Integrated acceptance source | `b002c2b6821b11f6db84a02cca87ce65af34c0c1` |
| Both complete acceptance trees | `86753b527d02075d5285914ae0e4a932f6c839df` |
| Final guide clarification | `2bc160da382d98c21c8af0f806ae6718d141f7db` |
| Guide composition tree before type-only test follow-up | `be15fdb5cb18869293170ccd56fb05f25174257f` |
| Inspected type-only acceptance follow-up | `b24ed760d919db644f3578404b2e8cc12bb5c4b1` |
| Type-only worker tree | `be682d0f28b73d4ece6dc6301126174273656139` |
| Isolated reviewer branch | `codex/qv-security-r13-20261120` |

The reviewer fast-forwarded an isolated checkout through the final guide.
Native local comparisons confirm that production source remains identical to
`febb956` and the acceptance file at `2bc160d` equals `38acf8e`. Only four
production/guide paths implement the feature; the later addition is a test
file and wording clarification. The separate type-only test follow-up was
inspected directly and changes no production or executable test statements.
No server, board, protocol, dependency or workflow changes are introduced.

The preceding publication's remote tree and parent verification belong to the
coordinator's receipt. This review independently inspects the available local
source above and does not claim a fresh remote fetch. No cancelled network
fetch or denied browser operation was retried.

## Scope and contract preflight

The [new helper](../../packages/cli/src/receipt-proof.ts),
[online command](../../packages/cli/src/cmd-online.ts),
[routing/help](../../packages/cli/src/main.ts) and
[operator guide](../../packages/cli/README.md#check-a-later-receipt-proof)
were inspected with the existing
[receipt verifier](../../packages/board/src/receipt.ts),
[checkpoint parser](../../packages/board/src/checkpoint.ts),
[consistency verifier](../../packages/board/src/merkle.ts),
[proof routes](../../packages/server/src/app.ts),
[API contract](../09-api-data-contracts.md) and
[transparency specification](../18-bulletin-board-transparency.md).

| Source-backed constraint | Inspected implementation |
| --- | --- |
| QV-09 §11.1 permits absent `checkpoint_note` | A structurally valid response without the signed note leaves requested inclusion incomplete and preserves saved evidence. |
| Inclusion/consistency paths are limited to 64/63 hashes | Canonical standard-base64 32-byte hashes are decoded within those limits before existing verification. |
| Current proof routes cap sizes at `2 ** 40` | A supported explicit request size is required; signed note size and root are still checked. |
| Saved inclusion must not be silently discarded | Own-property/object validation precedes the legacy receipt parser's inclusion branch. |
| QV-18 REQ-026 describes durable latest-checkpoint tracking | Supplied-receipt consistency is identified as a narrower capability; automatic latest-observation custody remains separate. |

Code and security reviewers supplied overlapping preflight guidance. These
constraints were addressed by the first inspected implementation. They are not
counted as new confirmed defects, separate repairs or reproduced vulnerabilities.

## Trust boundaries verified in source

### Independent anchors and local saved evidence

The command validates election ID, strict Ed25519 log key, hexadecimal expected
leaf and supported positive decimal size before reading the receipt. Expected
origin comes from the selected election. The input format is normalized board
receipt JSON, not the whole submission report or raw REST response.

The saved file is capped at 64 KiB and read through the existing regular-file
descriptor helper, with nonblocking/no-follow flags where supported. Present
inclusion must have an object, bounded canonical path and string note. Existing
receipt parsing and verification, plus explicit external origin/leaf equality,
check the promise and every supplied inclusion under the independent key.
The CLI cannot authenticate how the operator obtained those anchors.

The requested snapshot must cover the receipt sequence and cannot precede its
included checkpoint. The old checkpoint is parsed after its signature, origin,
tree-size agreement and inclusion have verified. Invalid saved evidence refuses
before any GET; it is not replaced by server-supplied expectations.

### Read transport and requested inclusion

The existing transport enforces HTTPS except for documented loopback HTTP,
refuses redirects, caps each response at 64 KiB and applies its timeout. The
request path uses validated election and numeric sequence/size. Optional
read-key access uses the existing protected-file/header path; the credential
does not enter the proof query, selected assurance output or static errors.

Strict UTF-8 transport JSON is parsed without applying QV-JSON restrictions to
unrelated additive API members. Returned sequence, canonical base64url leaf and
tree size must match saved evidence and the explicit request. The path uses
canonical standard-base64 hashes and the inclusion limit.

An absent note returns incomplete requested evidence and the prior normalized
receipt without a second request. A present malformed note refuses. A supplied
new note and path are combined with the unchanged signed promise and verified
through `verifyReceipt`, binding origin, size, log key, expected leaf and Merkle
path. No new signature framing, cryptographic primitive or entry-authority rule
is introduced.

### Consistency before successful output

Without prior inclusion, consistency is `NOT_CHECKED`; no prior root is
invented. Equal sizes use existing `verifyConsistency` with an empty proof and
require equal roots, without another GET. Growth requires one additional
bounded GET with explicit old/new sizes. Response sizes and the 63-hash path
are validated before the existing consistency verifier.

The helper can represent verified inclusion awaiting consistency internally.
The command does not print that intermediate report: the growth branch must
complete the consistency request successfully before `printJson`. Transport,
parsing or verification failure produces no successful proof report. No
automatic retry, polling, submission or other server mutation is added.

### Output, old evidence and retained state

Output contains normalized receipt data and client-owned `verification` with
`scope: "receipt-proof"`. Separate requested, previous and receipt tree sizes
identify the new target, supplied anchor and checkpoint actually in the output.
Missing new signed evidence can leave valid old inclusion in the receipt while
the requested inclusion remains `INCOMPLETE`. The guide states this distinction.

Authority, witness quorum, freshness and ballot counting remain explicitly
false. A log signature or signed promise deadline is not a newest-head or
current-time verdict. Consistency is relative to the supplied receipt, which
may not contain the user's latest observation. Input files and retained heads
are not automatically written or replaced.

## Independent acceptance and evidence ownership

This reviewer inspected the committed
[acceptance file](../../packages/cli/test/online-receipt-proof.test.ts) without
executing product tests. The functional worker reported **four groups passed**,
zero failures/skips/cancellations, **1.481629932 seconds**, on the implementation
and acceptance tree recorded above. That execution belongs to the functional
worker, not this source reviewer.

The later `b24ed760` correction replaces two explicit `any` annotations with
fixture/report types and a literal assertion-key tuple. Its diff changes no
runtime assertions or production statements. The recorded execution remains
bound to `38acf8e`; no second independent run is claimed for a type-only edit.

The source exercises an actual executable/server promise upgrade, subsequent
valid checkpoint growth with exactly one consistency read, equal-size reuse
without another read, and existing offline receipt reuse. A normal link election
uses its private read-key file and checks that the access value is not printed.
Two omitted-note cases retain either prior included evidence or promise-only
evidence with explicit output sizes and request counts. Local expectation,
size and file-boundary cases refuse before network access. Input bytes, board
length and election phase remain checked.

The code reviewer identified ambiguous `failed read` wording in the exit-1
table. Inspected guide-only commit `2bc160d` says `failed HTTP read`, preserving
the distinction from pre-request local input refusal with exit 4. This closes
that documentation observation without changing behavior. Initial full
TypeScript completion was reported by the coordinator; final integrated
compilation and receipt compatibility results belong to its separate record.

## Validation and fresh-worker handoff

Documentation validation passed: 2,513 links across 392 files, none broken;
claims lint found zero findings across 371 files and 45 unchanged rules.
The staged report passed whitespace checking. These results qualify
documentation, not product execution or cryptography. The report-only commit
carries matching Codex DCO and specification references.

The next fresh set should inspect final composition, supplied-versus-latest
checkpoint scope, same-size/growth consistency and actual hosted tested source.
Durable per-origin checkpoint custody, atomic updates and latest-observation
preservation remain separate work. Witness monitoring, authenticated freshness,
authority and finality remain outside this command's result.

No runtime probes, exploit or vulnerability reproduction, dependency changes,
external publication or formal approval was performed by this reviewer. The
stopped background-runtime/gossip investigation and its old untracked test were
not inspected or resumed. Historical DCO, native ACL, formal review and release
gates remain separate.
