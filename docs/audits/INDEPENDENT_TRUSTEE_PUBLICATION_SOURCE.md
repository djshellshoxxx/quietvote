# Independent trustee publication source review

**Date:** 2026-11-19 UTC

**Reviewer:** Codex, separate agent task `/root/independent_custody_source`

**Scope:** READ-ONLY production-source, existing-test-source, documentation and historical-log inspection. No project code or tests were executed by this reviewer. The only contribution by this reviewer is this additive receipt.

## Disposition

**The cleanup finding is addressed in the reviewed source within the explicit conventional effective-POSIX-permissions boundary. No blocking source issue remains in this scoped review.** This is a conditional source conclusion, not runtime qualification or a universal filesystem-custody claim. ACL grants overriding the inspected POSIX permission policy remain an unresolved implementation and qualification boundary. Native Windows qualification and final-source runtime gates remain open.

This receipt is not a formal GitHub approval and does not authorize merging `main`. Reviewer independence here means a separate agent task from the implementation author; it is not a claim of an external human audit.

## Exact reviewed source

| Checkpoint | Commit | Tree / role |
|---|---|---|
| Earlier independent runtime checkpoint | `e10e605eccd4d45040e63cc83948d743f5b14412` | Base of the original source-review delta; earlier execution belongs to the preceding reviewer |
| Held-descriptor trustee repair | `44d9d0676f48e813af31853aaf87112c7a20ed5e` | Tree `6f01524cede664b18c4338210050b077ecf64280`; this reviewer found the remaining cleanup namespace issue here |
| Protected-namespace repair reviewed for this receipt | `239dfaf9ddedf5c0f3288ed566e6a81be54d4e45` | Tree `c0a44b19c2e4e13a7cdcbda2b431b3cbfe4a6fe5`; parent is `44d9d0676f48e813af31853aaf87112c7a20ed5e` |

The initial review inspected `e10e605..44d9d067`: trustee `fsutil.ts`, its new publication regression, and the implementation report. The follow-up inspected the complete committed `44d9d067..239dfaf9` delta: both package-local `posix-staging.ts` copies, the CLI and trustee writers, their changed existing test files, both operator notes, and the implementation report. The package-local staging helper copies were compared and are byte-identical.

The review also read the relevant QV-17 and QV-07 contracts, the earlier custody report, the trustee error handler, and selected pre-existing result-log summaries. It did not independently re-audit the complete Windows native helper or unrelated repository features. Preserving a Windows dispatch branch in this delta is not evidence that its native implementation executes correctly.

## Findings and source resolution

### 1. A checked staging pathname was still mutable before removal

At `44d9d067`, `packages/trustee/src/fsutil.ts` validated a staging entry and later called `unlink(tmp)` in both exclusive-publication completion and failure cleanup. Keeping the original descriptor open prevents its inode from being recycled, but does not bind a later pathname unlink to that inode. An unrelated entry could occupy the name between inspection and removal. The comment claiming cleanup would never remove an independently substituted entry was therefore stronger than the source established.

This was identified by reading source. This reviewer created no reproduction, probe, payload or test case and executed no project code.

The repair at `239dfaf9` addresses the namespace precondition for both POSIX writers:

- Resolve the destination parent once and use the canonical parent for output, staging and directory synchronization.
- Inspect the ancestry from the filesystem root to that parent. Every component must be a real directory owned by the current effective UID or root. Group/other-writable components require the sticky bit; trusted ownership of the sticky directory and each descendant remains required.
- Create an exclusive, randomly named `0700` staging directory under the validated parent. Verify its owner, exact permission bits and same-filesystem identity before returning a payload path.
- Perform payload creation, writing and staging-name removal inside that controlled directory. Retain the prior held-file identity and metadata checks as additional refusal checks.
- Remove only an owned, matching empty staging directory with nonrecursive `rmdir`. An unexpected or nonempty stage is retained; no recursive recovery or scavenger was added.

Under the stated effective-permissions assumption, an unrelated UID cannot rebind the protected staging names. That property, rather than another pathname comparison, supplies the missing custody argument. A private child beneath writable nonsticky ancestry is rejected before a secret write.

### 2. The new directory-policy refusal needed trustee error translation

In the first uncommitted staging draft, the shared helper's plain `Error` with code `UNSAFE_DIRECTORY` could bypass the trustee CLI's `TrusteeError` handler. An expected policy refusal could then escape the structured CLI error path.

The committed repair at `239dfaf9` translates that specific helper refusal into `TrusteeError('REFUSED', 'UNSAFE_DIRECTORY', ...)` at the trustee boundary. The added ordinary test source requires `kind: 'REFUSED'`, code `UNSAFE_DIRECTORY`, and exit code `60`. The correction and expected behavior were checked by source inspection only.

## Contract and trust boundary

[QV-17](../17-key-ceremony-trustees.md) section 6.3 requires temporary-file, `fsync` and rename updates; section 6.5 requires private bundle/state files. Its section 2 non-claims state that a compromised trustee device defeats that trustee's share. [QV-07](../07-threat-model-security.md), trust boundary TB2, treats each trustee device as trusted by its holder. The [earlier custody report](../reports/next-custody-20261109.md) separately records limits for hostile filesystem rollback and arbitrary active filesystem tampering.

These documents support an explicit current-effective-UID/root trust boundary. They do not justify treating another user's writable, nonsticky ancestor as a protected namespace. The new ancestry checks enforce that distinction.

The conclusion requires effective namespace permissions to follow the inspected POSIX owner/mode/sticky policy, and requires the current effective UID and root to remain trusted. Same-UID/root compromise and filesystem administrators overriding those permissions are outside this boundary.

**ACLs that grant namespace mutation beyond those bits remain open.** The helper does not inspect macOS native ACLs. Apple's [filesystem security documentation](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html) describes separate deletion rights and ACL inheritance; a successful mode-bit or ordinary-path test therefore cannot establish ACL-safe namespace custody. Documenting this limit is not an implemented refusal for every such filesystem and is not a waiver or a passing native check.

The Windows private backend and the existing public Windows branch are unchanged by the staging follow-up. The POSIX namespace conclusion does not extend to public Windows namespace custody. Native Windows Node 22 and Node 24 execution remains required for the applicable native private-file behavior.

## Compatibility assessed by inspection

| Behavior | Reviewed source assessment |
|---|---|
| Private `0600` and public `0644` outputs | Requested file mode remains applied to the held descriptor before writing; published-path `chmod` is absent |
| Exclusive creation | The existing link-based no-overwrite publication remains, followed by held-identity and link-count checks |
| Replacement | The existing same-filesystem rename publication remains; the old target is not opened for payload writing |
| Final binding | Published identity is compared with the retained descriptor before success |
| Relative paths and parent aliases | The selected parent is resolved once; subsequent publication and cleanup use that canonical destination |
| Cleanup | The owned payload is removed inside the protected stage; only an empty matching stage is removed, without recursion |
| Package boundaries | CLI and trustee retain package-local helpers; no CLI-to-trustee production import is added |
| Windows routing | Private Windows dispatch remains native; the public Windows path remains separate from the POSIX helper |

The two added ordinary test cases describe unsafe-ancestor refusal, trusted sticky-parent acceptance, private/public outputs, and CLI alias/relative-path behavior. Existing substitution cases retain their assertions; their initial temporary directories are canonicalized so their hooks identify the canonical target now used by production. Those source changes were inspected, not executed.

A crash may still leave a private staged file, as the earlier implementation could leave a temporary file. This repair adds no automatic crash cleanup, and this review supplies no new crash-durability experiment.

## Historical execution evidence and attribution

The following pre-existing log summaries were read without rerunning their commands. They are separate from this source review. Commit attribution follows the original reviewer/author reports and the integration coordinator's record.

| Source checkpoint | Who executed it | Preserved evidence | Recorded result |
|---|---|---|---|
| `e10e605` | Earlier independent reviewer | `quietvote-evidence/final-review-windows-original-probes-green-e10e605.log` | Three unchanged transport cases plus two CLI publication cases passed: 5/5, no failures, cancellations or skips |
| `e10e605` | Earlier independent reviewer | `quietvote-evidence/final-review-trustee-publication-red-e10e605.log` | Trustee baseline: two ordinary controls passed and all four substitution cases failed; 2/6 passed |
| Held-descriptor repair associated with `44d9d067` | Implementation author, running the preserved independent-origin cases | `quietvote-evidence/windows-acl-trustee-publication-green.log` | 6/6 passed, no failures, cancellations or skips |
| Held-descriptor repair associated with `44d9d067` | Implementation author | `quietvote-evidence/windows-acl-trustee-custody-final.log` | Affected trustee custody/publication batch: 29/29 passed, no failures, cancellations or skips |
| Protected namespace at `239dfaf9` | This reviewer | No runtime command was run | Source inspection only; no runtime result asserted |

The earlier independent runtime follow-up after `44d9d067` was stopped by an automated content check, and its restricted follow-up could not resume. That independent runtime-verification gap remains. This materially narrower source review did not resume the blocked runtime activity, commission a new probe, or convert author-run results into independent execution.

The implementation report at `239dfaf9` explicitly marks focused exact-source checks pending. Any later author checks or hosted results must be recorded separately against their actual source revision; the historical 6/6 and 29/29 results do not qualify the later staging implementation.

## Remaining qualification and integration gates

1. Execute and record the required final-source runtime, typecheck and hosted matrix gates through the normal integration process. This reviewer has supplied no independent runtime pass for the staging repair.
2. Keep native Windows Node 22/24 qualification pending until those jobs execute the final published source. Linux checks cannot establish native ACL or handle-API behavior.
3. Keep overriding POSIX/macOS ACL namespace grants as an unresolved native custody implementation and qualification boundary. An ordinary macOS matrix pass does not close that issue.
4. Preserve the separate evidence categories: earlier independent execution, author execution, this source-only review, and final hosted qualification. Reassess source changes made after the exact reviewed commit.

## Reviewer attestation

I inspected the source and existing evidence identified above, reported the remaining cleanup race and the draft refusal-mapping issue to the author/coordinator, and reviewed their source resolution at `239dfaf9ddedf5c0f3288ed566e6a81be54d4e45`. I made no production or test-code changes, installed no dependencies, and executed no project code. The only added repository artifact from this review is this receipt.

Signed-off-by: Codex <codex@openai.com>

Reviewer task: `/root/independent_custody_source`

Attested scope: source-only, 2026-11-19 UTC
