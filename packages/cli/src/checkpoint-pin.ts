// SPDX-License-Identifier: AGPL-3.0-or-later
// QV-18 REQ-026: pure, source-verified pin transition. NO filesystem custody is supplied here.
import { bytesEqual, emptyRoot, err, ok, parseCheckpoint, verifyConsistency, verifyLogSignature, type Checkpoint, type Result } from '@quietvote/board';
import { bytesToHex, ed25519IsStrictPoint, jcs, parseQvJson } from '@quietvote/crypto';

export const MAX_CHECKPOINT_PIN_BYTES = 64 * 1024;
export const CHECKPOINT_PIN_FORMAT = 'qv-checkpoint-pin/v1';

export interface CheckpointPinAnchors {
  /** From an independent election identity, never from the candidate note. */
  origin: string;
  /** Independently announced per-election log public key. */
  logKey: Uint8Array;
}
export interface CheckpointPinRecord {
  format: typeof CHECKPOINT_PIN_FORMAT;
  origin: string;
  log_key: string;
  checkpoint_note: string;
}
export interface CheckpointPinProposal {
  /** The caller must still acquire trusted storage custody and publish atomically. */
  bytes: Uint8Array;
  action: 'INITIAL' | 'UNCHANGED' | 'ADVANCED';
  previous_size: number | null;
  checkpoint_size: number;
  consistency: 'NOT_CHECKED' | 'VERIFIED';
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function validAnchors(a: CheckpointPinAnchors): boolean {
  return !!a && typeof a === 'object' && typeof a.origin === 'string' && /^quietvote\/v1\/[0-9a-f]{32}$/.test(a.origin) &&
    a.logKey instanceof Uint8Array && a.logKey.length === 32 && ed25519IsStrictPoint(a.logKey);
}
function validProof(proof: unknown): proof is readonly Uint8Array[] {
  return Array.isArray(proof) && proof.length <= 63 &&
    Array.from(proof).every((hash: unknown) => hash instanceof Uint8Array && hash.length === 32);
}
function verifiedNote(note: unknown, anchors: CheckpointPinAnchors): Result<Checkpoint> {
  if (typeof note !== 'string' || note.length > MAX_CHECKPOINT_PIN_BYTES ||
      new TextEncoder().encode(note).length > MAX_CHECKPOINT_PIN_BYTES) {
    return err('QV_BOARD_BAD_CHECKPOINT', 'missing or oversized signed checkpoint');
  }
  const parsed = parseCheckpoint(note);
  if (!parsed.ok || parsed.value.origin !== anchors.origin || parsed.value.size > 2 ** 40 ||
      (parsed.value.size === 0 && !bytesEqual(parsed.value.root, emptyRoot())) ||
      !verifyLogSignature(parsed.value, anchors.logKey)) {
    return err('QV_BOARD_BAD_CHECKPOINT', 'checkpoint origin, size, root or log signature did not verify');
  }
  return parsed;
}
/** Strictly parse and reverify the SIGNED contents. The file's latest-observation status
 * remains contingent on an independent trusted filesystem provider. */
export function readCheckpointPin(bytes: Uint8Array, anchors: CheckpointPinAnchors): Result<{ record: CheckpointPinRecord; checkpoint: Checkpoint }> {
  if (!validAnchors(anchors)) return err('QV_BOARD_ORIGIN_MISMATCH', 'independent origin or log key is invalid');
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_CHECKPOINT_PIN_BYTES) {
    return err('QV_BOARD_TOO_LARGE', 'pin must be a bounded regular-file snapshot');
  }
  let value: unknown;
  try { value = parseQvJson(bytes); } catch { return err('QV_BOARD_MALFORMED', 'pin is not valid QV-JSON'); }
  if (!record(value) || Object.keys(value).length !== 4 ||
      !['format', 'origin', 'log_key', 'checkpoint_note'].every((k) => Object.hasOwn(value, k)) ||
      value['format'] !== CHECKPOINT_PIN_FORMAT || value['origin'] !== anchors.origin ||
      value['log_key'] !== bytesToHex(anchors.logKey)) {
    return err('QV_BOARD_ORIGIN_MISMATCH', 'pin format, origin or independently pinned log key differs');
  }
  // The on-disk record has exactly one canonical byte representation. Parsed
  // but noncanonical whitespace, field order and escape spelling are refused.
  const canonical = jcs(value);
  if (canonical.length !== bytes.length || canonical.some((b, i) => b !== bytes[i])) {
    return err('QV_BOARD_MALFORMED', 'pin must use canonical QV-JSON bytes');
  }
  const cp = verifiedNote(value['checkpoint_note'], anchors);
  if (!cp.ok) return cp;
  return ok({ record: value as unknown as CheckpointPinRecord, checkpoint: cp.value });
}
/** Compute a proposal only. No caller may report a durable update on this result alone.
 * The old snapshot MUST be obtained under a trusted exclusive cross-process lock.
 * A missing old snapshot MUST be established as genuinely absent by that provider. */
export function proposeCheckpointPin(
  oldBytes: Uint8Array | undefined,
  candidateNote: unknown,
  anchors: CheckpointPinAnchors,
  consistencyProof?: readonly Uint8Array[],
): Result<CheckpointPinProposal> {
  if (!validAnchors(anchors)) return err('QV_BOARD_ORIGIN_MISMATCH', 'independent origin or log key is invalid');
  const candidate = verifiedNote(candidateNote, anchors);
  if (!candidate.ok) return candidate;
  const old = oldBytes === undefined ? undefined : readCheckpointPin(oldBytes, anchors);
  if (old && !old.ok) return old;
  const previous = old?.value.checkpoint;
  if (!previous) {
    if (consistencyProof !== undefined) return err('QV_BOARD_BAD_PROOF', 'first pin has no prior consistency anchor');
  } else if (candidate.value.size < previous.size) {
    return err('QV_BOARD_ROLLBACK', 'older signed checkpoint cannot replace the retained pin');
  } else if (candidate.value.size === previous.size) {
    if (consistencyProof !== undefined && (!Array.isArray(consistencyProof) || consistencyProof.length !== 0)) return err('QV_BOARD_BAD_PROOF', 'equal-size consistency must not carry a proof');
    if (!bytesEqual(previous.root, candidate.value.root)) {
      return err('QV_BOARD_FORK', 'equal-size signed checkpoints have different roots');
    }
    // Preserve the original signed note, including any previously held cosignatures.
    return ok({ bytes: new Uint8Array(oldBytes!), action: 'UNCHANGED', previous_size: previous.size,
      checkpoint_size: previous.size, consistency: 'VERIFIED' });
  } else {
    if (!validProof(consistencyProof) ||
        !verifyConsistency(previous.size, candidate.value.size, previous.root, candidate.value.root, consistencyProof)) {
      return err('QV_BOARD_BAD_PROOF', 'growth requires a valid exact old/new consistency proof');
    }
  }
  const next: CheckpointPinRecord = {
    format: CHECKPOINT_PIN_FORMAT, origin: anchors.origin,
    log_key: bytesToHex(anchors.logKey), checkpoint_note: candidateNote as string,
  };
  // Signature-valid notes may still contain unrepresentable auxiliary text.
  // Never allow serialization of remotely supplied text to throw past Result.
  let bytes: Uint8Array;
  try { bytes = jcs(next); }
  catch { return err('QV_BOARD_BAD_CHECKPOINT', 'signed checkpoint is not representable as QV-JSON'); }
  if (bytes.length > MAX_CHECKPOINT_PIN_BYTES) return err('QV_BOARD_TOO_LARGE', 'pin exceeds bounded serialized size');
  return ok({ bytes, action: previous ? 'ADVANCED' : 'INITIAL', previous_size: previous?.size ?? null,
    checkpoint_size: candidate.value.size, consistency: previous ? 'VERIFIED' : 'NOT_CHECKED' });
}
