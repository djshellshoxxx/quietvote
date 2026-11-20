// SPDX-License-Identifier: AGPL-3.0-or-later
// QV-09 response adapter; expected identity and trust anchors stay with the caller.
import {
  HARD_BODY_CAP, MAX_BODY, b64, bodyDigest, decodeHeader, hashLeaf, receiptFromJson, receiptToJson,
  unb64u, verifyReceipt, err, ok, type ReceiptJson, type Result,
} from '@quietvote/board';
import { bytesToHex, ed25519IsStrictPoint, hexToBytes } from '@quietvote/crypto';
import { logOrigin } from '@quietvote/protocol';
import { InputError, UsageError } from './args.ts';
import { isHex } from './common.ts';

export const MAX_RETURNED_RECEIPT_BYTES = 64 * 1024;

export interface SubmissionBinding {
  origin: string;
  leafHash: Uint8Array;
  logKey: Uint8Array;
}

export interface SubmissionReceiptReport {
  status: 'included' | 'sequenced';
  /** Normalized board receipt JSON, suitable for the existing offline receipt verifier. */
  receipt: ReceiptJson;
  verification: {
    scope: 'receipt-only';
    promise: 'VERIFIED';
    inclusion: 'VERIFIED' | 'INCOMPLETE';
    origin: string;
    leaf_hash: string;
    log_key: string;
    authority_verified: false;
    witness_quorum_verified: false;
    freshness_verified: false;
    ballot_counting_verified: false;
  };
}

export function receiptLogKey(value: string): Uint8Array {
  if (!isHex(value, 32)) throw new UsageError('--log-key must be 64 lower-case hex digits for a valid Ed25519 public key');
  const key = hexToBytes(value, 32);
  if (!ed25519IsStrictPoint(key)) throw new UsageError('--log-key must be 64 lower-case hex digits for a valid Ed25519 public key');
  return key;
}

/** Bind exact packet bytes before sending; this is not an entry-authority or protocol check. */
export function submissionBinding(packet: { header: string; body: string }, id: string, logKey: Uint8Array): SubmissionBinding {
  const origin = logOrigin({ election_id: id }), header = unb64u(packet.header), body = unb64u(packet.body);
  if (!header || !body) throw new InputError('checked submission requires canonical base64url packet bytes');
  const parsed = decodeHeader(header);
  if (!parsed.ok || parsed.value.origin !== origin || parsed.value.bodyLen !== body.length ||
      body.length > HARD_BODY_CAP || body.length > MAX_BODY[parsed.value.type] ||
      bytesToHex(parsed.value.bodyDigest) !== bytesToHex(bodyDigest(body))) {
    throw new InputError('checked submission requires a canonical header bound to the selected election and exact body');
  }
  return { origin, leafHash: hashLeaf(header), logKey };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function integer(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}
function bytes(value: unknown, length: number): Uint8Array | undefined {
  if (typeof value !== 'string') return undefined;
  const decoded = unb64u(value);
  return decoded?.length === length ? decoded : undefined;
}

/** Verify already-returned evidence. Unknown additive API fields never become client assurance. */
export function checkSubmissionReceipt(value: unknown, expected: SubmissionBinding): Result<SubmissionReceiptReport> {
  const result = object(value), wire = object(result?.['receipt']), promise = object(wire?.['promise']);
  const status = result?.['status'], leaf = bytes(wire?.['leaf_hash'], 32), sig = bytes(wire?.['promise_sig'], 64);
  if ((status !== 'included' && status !== 'sequenced') || !wire || !promise || !leaf || !sig ||
      wire['origin'] !== expected.origin || bytesToHex(leaf) !== bytesToHex(expected.leafHash) ||
      !integer(wire['seq']) || !integer(promise['sequenced_at']) || !integer(promise['checkpoint_deadline'])) {
    return err('QV_BOARD_BAD_RECEIPT', 'receipt identity or promise fields invalid');
  }
  const normalized: ReceiptJson = {
    origin: expected.origin, seq: wire['seq'], leaf_hash: b64(leaf), promise_sig: b64(sig),
    sequenced_at: promise['sequenced_at'], checkpoint_deadline: promise['checkpoint_deadline'],
  };
  const hasInclusion = Object.hasOwn(wire, 'inclusion');
  if ((status === 'included') !== hasInclusion) return err('QV_BOARD_BAD_RECEIPT', 'receipt status does not match supplied inclusion');
  if (hasInclusion) {
    const inclusion = object(wire['inclusion']);
    if (!inclusion || inclusion['seq'] !== wire['seq'] || inclusion['leaf_hash'] !== wire['leaf_hash'] ||
        !integer(inclusion['tree_size'], 1) || !Array.isArray(inclusion['path']) || inclusion['path'].length > 64 ||
        !inclusion['path'].every((item): item is string => typeof item === 'string') ||
        typeof inclusion['checkpoint_note'] !== 'string' || inclusion['checkpoint_note'].length > MAX_RETURNED_RECEIPT_BYTES) {
      return err('QV_BOARD_BAD_RECEIPT', 'receipt inclusion fields invalid');
    }
    normalized.inclusion = { tree_size: inclusion['tree_size'], path: inclusion['path'], checkpoint_note: inclusion['checkpoint_note'] };
  }
  const parsed = receiptFromJson(normalized);
  if (!parsed.ok || !verifyReceipt(parsed.value, expected.logKey).ok) return err('QV_BOARD_BAD_RECEIPT', 'receipt evidence did not verify');
  return ok({
    status, receipt: receiptToJson(parsed.value),
    verification: {
      scope: 'receipt-only', promise: 'VERIFIED', inclusion: hasInclusion ? 'VERIFIED' : 'INCOMPLETE',
      origin: expected.origin, leaf_hash: bytesToHex(expected.leafHash), log_key: bytesToHex(expected.logKey),
      authority_verified: false, witness_quorum_verified: false, freshness_verified: false, ballot_counting_verified: false,
    },
  });
}
