# Product T10: pause/resume authority and halt-limit workflow

Date: 2026-11-27 (America/Vancouver). Base: PR #76,
`d38c55c3d6f0d8254967efea066cd282c4012553`. Test-only; no production changes or
new governance decisions.

## Completed acceptance

The new [pause/resume test](../../packages/server/test/pause-resume.test.ts)
implements accepted [product T10](inventory-20261111/product.tasks.md), associated
with [QV-02-REQ-062](../02-product-requirements.md) and
[QV-07-REQ-081](../07-threat-model-security.md). A real 2-of-3 DKG fixture uses the
existing 2-of-3 coordinator policy and an explicitly configured two-halt cap.
Expected phase, halt count and next signed control sequence are maintained by the
test independently of the runtime's projections.

| Step | Verified outcome |
|---|---|
| Authority | A separately seeded instance-admin key successfully authenticates to `/admin/status`. Its real control signatures are then refused, as are genuine single-coordinator signatures below quorum. These cases run for pause, resume and invalidate. An operator also cannot rewrap a fully coordinator-signed pause as its own outer entry. |
| First pause/resume | Authorized pause reaches PAUSED and blocks a valid ballot. Authorized resume reaches OPEN and restores ballot admission within the original voting window. |
| Second pause/resume | A pause begins before the signed close time and resumes after it. The state returns to OPEN, but the public voting-window gate is false and a valid new ballot is refused. The signed manifest remains byte-identical. |
| Persisted halt cap | A clean stop/reopen preserves the exhausted halt count, board, voter index and signed control sequence. The next otherwise valid pause returns `409 STATE_CONFLICT` without appending or consuming the next counter. |
| Invalidation | After operator and under-quorum refusals, the authorized quorum signs the still-available next counter. Invalidation succeeds and reaches INVALIDATED. Fresh resume and ceremony-start packets are refused. |

All **13 refused submissions** preserve the exact checkpoint, board size/body-byte
count, public voter index, phase, halt count, control counter and manifest. The
final admitted control transcript is exactly:

| Action | Signed control sequence |
|---|---:|
| pause | 1 |
| resume | 2 |
| pause | 3 |
| resume | 4 |
| invalidate | 5 |

There is exactly one admitted ceremony-start record. All authority cases have
valid outer entry signatures; inner single-coordinator/operator signatures are
also cryptographically checked before submission, so the refusal cases exercise
authority rather than malformed signature bytes. Final board signature and
append-only verification passes using fixture-owned keys and the fixture's
explicit zero-witness policy. No full-election verifier PASS is claimed.

## Scope

This pins current server behavior. It does not adopt automatic close-time
extension, a second server ceremony, CHALLENGED transitions or broader governance
semantics. The reopened halt-limit check concerns ordinary durable replay after a
clean stop; it is not a power-loss durability claim. Existing terminal identical-
packet retries are covered in T9 and are not changed by this workflow.

## Validation

- Focused new file: **1 passed, 0 failed, 0 skipped**, **3.96 seconds** on Node
  24.22.3/Linux.
- Repository TypeScript check, pinned vendor integrity (132 files), and diff
  whitespace checks: passed.
- No production defect was found. No production edits, dependency changes,
  commits or publication were needed.
