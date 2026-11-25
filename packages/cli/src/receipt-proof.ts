// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  b64u, err, ok, parseCheckpoint, receiptFromJson, receiptToJson, unb64,
  verifyConsistency, verifyReceipt, type Checkpoint, type Receipt, type ReceiptJson, type Result,
} from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { MAX_RETURNED_RECEIPT_BYTES, type SubmissionBinding } from './receipt-check.ts';

export interface ReceiptProofInput extends SubmissionBinding {
  receipt: Receipt;
  requestedSize: number;
  previous: Checkpoint | undefined;
}
export interface ReceiptProofReport {
  status: 'included' | 'incomplete';
  receipt: ReceiptJson;
  verification: {
    scope: 'receipt-proof';
    promise: 'VERIFIED';
    inclusion: 'VERIFIED' | 'INCOMPLETE';
    consistency: 'VERIFIED' | 'INCOMPLETE' | 'NOT_CHECKED';
    origin: string;
    leaf_hash: string;
    log_key: string;
    requested_tree_size: number;
    previous_tree_size: number | null;
    receipt_tree_size: number | null;
    authority_verified: false;
    witness_quorum_verified: false;
    freshness_verified: false;
    ballot_counting_verified: false;
  };
}
export interface CheckedReceiptProof {
  report: ReceiptProofReport;
  previous: Checkpoint | undefined;
  checkpoint: Checkpoint | undefined;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function proofPath(value: unknown, limit: number): Uint8Array[] | undefined {
  if (!Array.isArray(value) || value.length > limit || !value.every((p): p is string => typeof p === 'string')) return undefined;
  const hashes = value.map(unb64);
  return hashes.some((h) => !h || h.length !== 32) ? undefined : hashes as Uint8Array[];
}

/** Verify every saved evidence field before making a request. The caller supplies the anchors. */
export function receiptProofInput(value: unknown, expected: SubmissionBinding, requestedSize: number): Result<ReceiptProofInput> {
  const j = object(value);
  if (!j) return err('QV_BOARD_BAD_RECEIPT', 'saved receipt must be an object');
  if (Object.hasOwn(j, 'inclusion')) {
    const inclusion = object(j['inclusion']);
    if (!inclusion || !proofPath(inclusion['path'], 64) || typeof inclusion['checkpoint_note'] !== 'string' ||
        inclusion['checkpoint_note'].length > MAX_RETURNED_RECEIPT_BYTES) {
      return err('QV_BOARD_BAD_RECEIPT', 'saved inclusion is malformed');
    }
  }
  const parsed = receiptFromJson(j);
  if (!parsed.ok) return parsed;
  const receipt = parsed.value;
  if (receipt.origin !== expected.origin || bytesToHex(receipt.leafHash) !== bytesToHex(expected.leafHash) ||
      receipt.seq < 0 || receipt.sequencedAt < 0 || !verifyReceipt(receipt, expected.logKey).ok) {
    return err('QV_BOARD_BAD_RECEIPT', 'saved receipt does not match independent anchors');
  }
  let previous: Checkpoint | undefined;
  if (receipt.inclusion) {
    const checkpoint = parseCheckpoint(receipt.inclusion.checkpointNote);
    if (!checkpoint.ok) return err('QV_BOARD_BAD_RECEIPT', 'saved checkpoint is malformed');
    previous = checkpoint.value;
  }
  if (!Number.isSafeInteger(requestedSize) || requestedSize < 1 || requestedSize > 2 ** 40 ||
      requestedSize <= receipt.seq || (previous && requestedSize < previous.size)) {
    return err('QV_BOARD_BAD_RECEIPT', 'requested snapshot must cover the entry and not precede saved inclusion');
  }
  return ok({ ...expected, receipt, requestedSize, previous });
}

function report(input: ReceiptProofInput, receipt: Receipt, included: boolean, consistency: ReceiptProofReport['verification']['consistency']): ReceiptProofReport {
  return {
    status: included ? 'included' : 'incomplete', receipt: receiptToJson(receipt),
    verification: {
      scope: 'receipt-proof', promise: 'VERIFIED', inclusion: included ? 'VERIFIED' : 'INCOMPLETE', consistency,
      origin: input.origin, leaf_hash: bytesToHex(input.leafHash), log_key: bytesToHex(input.logKey),
      requested_tree_size: input.requestedSize, previous_tree_size: input.previous?.size ?? null,
      receipt_tree_size: receipt.inclusion?.treeSize ?? null,
      authority_verified: false, witness_quorum_verified: false, freshness_verified: false, ballot_counting_verified: false,
    },
  };
}

/** QV-09 permits a proof without a stored signed note; it cannot establish requested inclusion. */
export function checkReceiptProof(value: unknown, input: ReceiptProofInput): Result<CheckedReceiptProof> {
  const wire = object(value), path = proofPath(wire?.['path'], 64);
  if (!wire || !path || wire['seq'] !== input.receipt.seq || wire['leaf_hash'] !== b64u(input.leafHash) ||
      wire['tree_size'] !== input.requestedSize) return err('QV_BOARD_BAD_PROOF', 'requested proof identity is invalid');
  if (!Object.hasOwn(wire, 'checkpoint_note')) return ok({
    report: report(input, input.receipt, false, input.previous ? 'INCOMPLETE' : 'NOT_CHECKED'),
    previous: input.previous, checkpoint: undefined,
  });
  const note = wire['checkpoint_note'];
  if (typeof note !== 'string' || note.length > MAX_RETURNED_RECEIPT_BYTES) return err('QV_BOARD_BAD_PROOF', 'checkpoint note is malformed');
  const receipt: Receipt = { ...input.receipt, inclusion: { treeSize: input.requestedSize, path, checkpointNote: note } };
  if (!verifyReceipt(receipt, input.logKey).ok) return err('QV_BOARD_BAD_PROOF', 'requested inclusion did not verify');
  const checkpoint = parseCheckpoint(note);
  if (!checkpoint.ok) return err('QV_BOARD_BAD_PROOF', 'requested checkpoint is malformed');
  let consistency: ReceiptProofReport['verification']['consistency'] = input.previous ? 'INCOMPLETE' : 'NOT_CHECKED';
  if (input.previous?.size === checkpoint.value.size) {
    if (!verifyConsistency(input.previous.size, checkpoint.value.size, input.previous.root, checkpoint.value.root, [])) {
      return err('QV_BOARD_BAD_PROOF', 'requested checkpoint differs from saved checkpoint');
    }
    consistency = 'VERIFIED';
  }
  return ok({ report: report(input, receipt, true, consistency), previous: input.previous, checkpoint: checkpoint.value });
}

/** Check only against the caller's supplied verified checkpoint; no latest-observation claim. */
export function checkReceiptConsistency(value: unknown, proof: CheckedReceiptProof): Result<ReceiptProofReport> {
  const wire = object(value), path = proofPath(wire?.['path'], 63), { previous, checkpoint } = proof;
  if (!previous || !checkpoint || checkpoint.size <= previous.size || !wire || !path ||
      wire['old_size'] !== previous.size || wire['new_size'] !== checkpoint.size ||
      !verifyConsistency(previous.size, checkpoint.size, previous.root, checkpoint.root, path)) {
    return err('QV_BOARD_BAD_PROOF', 'consistency with saved checkpoint did not verify');
  }
  return ok({ ...proof.report, verification: { ...proof.report.verification, consistency: 'VERIFIED' } });
}
