// Portable equivocation evidence checks (QV-18 §9.6). All functions are total and offline.
import { bytesEqual } from './bytes.ts';
import { parseCheckpoint, verifyLogSignature, type Checkpoint } from './checkpoint.ts';
import { err, ok, type Result } from './errors.ts';
import { verifyConsistency, verifyInclusion } from './merkle.ts';
import { promiseMessage, type Receipt } from './receipt.ts';
import { ed25519Verify } from '@quietvote/crypto';

export type EquivocationKind = 'fork' | 'inconsistent' | 'broken_promise';

function signedNote(note: string, logPk: Uint8Array): Result<Checkpoint> {
  const p = parseCheckpoint(note);
  if (!p.ok) return p;
  if (!verifyLogSignature(p.value, logPk)) return err('QV_BOARD_BAD_CHECKPOINT', 'checkpoint not signed by log key');
  return p;
}

/** fork: two log-signed notes, same origin and size, different roots. Conclusive. */
export function checkFork(noteA: string, noteB: string, logPk: Uint8Array): Result<EquivocationKind> {
  const a = signedNote(noteA, logPk);
  const b = signedNote(noteB, logPk);
  if (!a.ok) return a;
  if (!b.ok) return b;
  if (a.value.origin === b.value.origin && a.value.size === b.value.size && !bytesEqual(a.value.root, b.value.root)) return ok('fork');
  return err('QV_BOARD_BAD_PROOF', 'not a fork');
}

/** inconsistent: sizes a<b, both log-signed, and the supplied (server-furnished) proof does not verify. Conclusive. */
export function checkInconsistent(noteA: string, noteB: string, proof: readonly Uint8Array[], logPk: Uint8Array): Result<EquivocationKind> {
  const a = signedNote(noteA, logPk);
  const b = signedNote(noteB, logPk);
  if (!a.ok) return a;
  if (!b.ok) return b;
  if (a.value.origin !== b.value.origin || a.value.size >= b.value.size) return err('QV_BOARD_BAD_PROOF', 'not an ordered pair');
  if (verifyConsistency(a.value.size, b.value.size, a.value.root, b.value.root, proof)) return err('QV_BOARD_BAD_PROOF', 'proof verifies; no inconsistency shown');
  return ok('inconsistent');
}

/**
 * broken_promise: a valid receipt promise for leaf L at seq s, plus a log-signed note of size > s
 * and a verifying inclusion proof showing a different leaf at index s.
 */
export function checkBrokenPromise(
  receipt: Receipt,
  note: string,
  otherLeafHash: Uint8Array,
  path: readonly Uint8Array[],
  logPk: Uint8Array,
): Result<EquivocationKind> {
  let msg: Uint8Array;
  try {
    msg = promiseMessage(receipt.origin, receipt.seq, receipt.leafHash, receipt.sequencedAt, receipt.checkpointDeadline);
  } catch {
    return err('QV_BOARD_BAD_RECEIPT', 'malformed receipt'); // checkers are total: out-of-range integers etc. are a Result, not a throw
  }
  if (!ed25519Verify(logPk, receipt.promiseSig, msg)) return err('QV_BOARD_BAD_RECEIPT', 'promise signature invalid');
  const cp = signedNote(note, logPk);
  if (!cp.ok) return cp;
  if (cp.value.origin !== receipt.origin || cp.value.size <= receipt.seq) return err('QV_BOARD_BAD_PROOF', 'note does not cover seq');
  if (bytesEqual(otherLeafHash, receipt.leafHash)) return err('QV_BOARD_BAD_PROOF', 'same leaf');
  if (!verifyInclusion(otherLeafHash, receipt.seq, cp.value.size, path, cp.value.root)) return err('QV_BOARD_BAD_PROOF', 'inclusion proof invalid');
  return ok('broken_promise');
}
