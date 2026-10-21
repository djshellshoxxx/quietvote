// Receipts (QV-18 §7.1).
import { ed25519Sign, ed25519Verify } from '@quietvote/crypto';
import { Writer, b64, unb64, utf8 } from './bytes.ts';
import { parseCheckpoint, verifyLogSignature } from './checkpoint.ts';
import { err, ok, type Result } from './errors.ts';
import { verifyInclusion } from './merkle.ts';

export const MAX_MERGE_DELAY_S = 30;

export interface Receipt {
  origin: string;
  seq: number;
  leafHash: Uint8Array;
  sequencedAt: number;
  checkpointDeadline: number;
  promiseSig: Uint8Array;
  inclusion?: { treeSize: number; path: Uint8Array[]; checkpointNote: string };
}

export function promiseMessage(origin: string, seq: number, leafHash: Uint8Array, sequencedAt: number, deadline: number): Uint8Array {
  return new Writer().raw(utf8('QV-RECEIPT-v1\0')).str(origin).u64(seq).raw(leafHash).u64(sequencedAt).u64(deadline).done();
}

export function signPromise(secretKey: Uint8Array, origin: string, seq: number, leafHash: Uint8Array, sequencedAt: number): Receipt {
  const checkpointDeadline = sequencedAt + MAX_MERGE_DELAY_S;
  const promiseSig = ed25519Sign(secretKey, promiseMessage(origin, seq, leafHash, sequencedAt, checkpointDeadline));
  return { origin, seq, leafHash, sequencedAt, checkpointDeadline, promiseSig };
}

/** Verifies the promise signature, and the inclusion proof + checkpoint if present. Total. */
export function verifyReceipt(r: Receipt, logPublicKey: Uint8Array): Result<{ treeSize: number | undefined }> {
  try {
    if (r.checkpointDeadline !== r.sequencedAt + MAX_MERGE_DELAY_S) return err('QV_BOARD_BAD_RECEIPT', 'bad deadline');
    const msg = promiseMessage(r.origin, r.seq, r.leafHash, r.sequencedAt, r.checkpointDeadline);
    if (!ed25519Verify(logPublicKey, r.promiseSig, msg)) return err('QV_BOARD_BAD_RECEIPT', 'promise signature invalid');
    if (!r.inclusion) return ok({ treeSize: undefined });
    const cp = parseCheckpoint(r.inclusion.checkpointNote);
    if (!cp.ok) return err('QV_BOARD_BAD_RECEIPT', 'bad checkpoint in receipt');
    if (cp.value.origin !== r.origin || cp.value.size !== r.inclusion.treeSize) return err('QV_BOARD_BAD_RECEIPT', 'checkpoint does not match inclusion');
    if (!verifyLogSignature(cp.value, logPublicKey)) return err('QV_BOARD_BAD_RECEIPT', 'checkpoint signature invalid');
    if (!verifyInclusion(r.leafHash, r.seq, r.inclusion.treeSize, r.inclusion.path, cp.value.root)) {
      return err('QV_BOARD_BAD_PROOF', 'inclusion proof invalid');
    }
    return ok({ treeSize: r.inclusion.treeSize });
  } catch {
    return err('QV_BOARD_BAD_RECEIPT', 'malformed receipt');
  }
}

export interface ReceiptJson {
  origin: string;
  seq: number;
  leaf_hash: string;
  sequenced_at: number;
  checkpoint_deadline: number;
  promise_sig: string;
  inclusion?: { tree_size: number; path: string[]; checkpoint_note: string };
}

/** Proof hashes are base64 std in JSON (§7.3). */
export function receiptToJson(r: Receipt): ReceiptJson {
  const j: ReceiptJson = {
    origin: r.origin, seq: r.seq, leaf_hash: b64(r.leafHash), sequenced_at: r.sequencedAt,
    checkpoint_deadline: r.checkpointDeadline, promise_sig: b64(r.promiseSig),
  };
  if (r.inclusion) j.inclusion = { tree_size: r.inclusion.treeSize, path: r.inclusion.path.map(b64), checkpoint_note: r.inclusion.checkpointNote };
  return j;
}

export function receiptFromJson(x: unknown): Result<Receipt> {
  try {
    const j = x as ReceiptJson;
    const leafHash = unb64(j.leaf_hash);
    const promiseSig = unb64(j.promise_sig);
    if (!leafHash || leafHash.length !== 32 || !promiseSig || typeof j.origin !== 'string') return err('QV_BOARD_BAD_RECEIPT', 'malformed receipt');
    if (!Number.isSafeInteger(j.seq) || !Number.isSafeInteger(j.sequenced_at) || !Number.isSafeInteger(j.checkpoint_deadline)) {
      return err('QV_BOARD_BAD_RECEIPT', 'malformed receipt');
    }
    const r: Receipt = { origin: j.origin, seq: j.seq, leafHash, sequencedAt: j.sequenced_at, checkpointDeadline: j.checkpoint_deadline, promiseSig };
    if (j.inclusion) {
      const path = j.inclusion.path.map((p) => unb64(p));
      if (path.some((p) => !p || p.length !== 32) || typeof j.inclusion.checkpoint_note !== 'string' || !Number.isSafeInteger(j.inclusion.tree_size)) {
        return err('QV_BOARD_BAD_RECEIPT', 'malformed inclusion');
      }
      r.inclusion = { treeSize: j.inclusion.tree_size, path: path as Uint8Array[], checkpointNote: j.inclusion.checkpoint_note };
    }
    return ok(r);
  } catch {
    return err('QV_BOARD_BAD_RECEIPT', 'malformed receipt');
  }
}
