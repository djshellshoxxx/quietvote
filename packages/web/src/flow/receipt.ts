// Receipts and inclusion checks (QV-19 §6.2-6.3, REQ-015; QV-10 §10.2). Distinct errors for a bad proof, a forked record and a
// rolled-back record.
import {
  hashLeaf, parseCheckpoint, receiptFromJson, verifyConsistency, verifyInclusion, verifyLogSignature, verifyReceipt,
  b64 as stdB64, unb64 as stdUnb64, type Checkpoint,
} from '@quietvote/board';
import { ApiError } from '../api/errors.ts';
import type { ApiClient } from '../api/client.ts';
import type { AppendResult, ReceiptView } from '../api/types.ts';
import type { PinnedHead } from '../key/storage.ts';
import { b64uDecode, b64uEncode } from '../util/hex.ts';
import type { SubmissionOutcome } from './ballot-machine.ts';

export type BoardAlarm = 'E-BOARD-INCL-FAIL' | 'E-BOARD-FORK' | 'E-BOARD-ROLLBACK';
export class BoardIntegrityError extends Error {
  readonly code: BoardAlarm;
  readonly evidence: Record<string, unknown>;
  constructor(code: BoardAlarm, message: string, evidence: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BoardIntegrityError';
    this.code = code;
    this.evidence = evidence;
  }
}

export interface RecordedInfo {
  outcome: Extract<SubmissionOutcome, 'ACCEPTED_RECORDED' | 'PENDING_UNCONFIRMED'>;
  seq: number;
  treeSize?: number;
  checkpointNote?: string;
}

function toBoardReceipt(v: ReceiptView): ReturnType<typeof receiptFromJson> {
  // QV-09 wire form -> board Receipt JSON form (leaf_hash and sig as standard base64, flat promise fields).
  const leaf = b64uDecode(v.leaf_hash);
  const sig = b64uDecode(v.promise_sig);
  if (leaf === undefined || sig === undefined) return { ok: false, error: { code: 'QV_BOARD_BAD_RECEIPT', message: 'bad encoding' } } as never;
  const j: Record<string, unknown> = {
    origin: v.origin, seq: v.seq, leaf_hash: stdB64(leaf), sequenced_at: v.promise.sequenced_at,
    checkpoint_deadline: v.promise.checkpoint_deadline, promise_sig: stdB64(sig),
  };
  if (v.inclusion) {
    if (v.inclusion.checkpoint_note === undefined) return { ok: false, error: { code: 'QV_BOARD_BAD_RECEIPT', message: 'inclusion without checkpoint' } } as never;
    j.inclusion = { tree_size: v.inclusion.tree_size, path: v.inclusion.path, checkpoint_note: v.inclusion.checkpoint_note };
  }
  return receiptFromJson(j);
}

/** Verifies the server's answer to a ballot append against the bytes we sent. Throws BoardIntegrityError on any mismatch. */
export function verifyAppendResult(res: AppendResult, expect: { origin: string; leafHash: Uint8Array; logPk: Uint8Array }): RecordedInfo {
  const r = toBoardReceipt(res.receipt);
  if (!r.ok) throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'receipt is malformed', { reason: r.error.message });
  if (r.value.origin !== expect.origin) throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'receipt is for another log', { origin: r.value.origin });
  const same = r.value.leafHash.length === expect.leafHash.length && r.value.leafHash.every((b, i) => b === expect.leafHash[i]);
  if (!same) throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'receipt is for different bytes than were sent', { sent: b64uEncode(expect.leafHash) });
  const v = verifyReceipt(r.value, expect.logPk);
  if (!v.ok) throw new BoardIntegrityError('E-BOARD-INCL-FAIL', v.error.message, { code: v.error.code });
  if (v.value.treeSize === undefined) return { outcome: 'PENDING_UNCONFIRMED', seq: r.value.seq };
  return { outcome: 'ACCEPTED_RECORDED', seq: r.value.seq, treeSize: v.value.treeSize, ...(r.value.inclusion ? { checkpointNote: r.value.inclusion.checkpointNote } : {}) };
}

/** Compares a fresh head to the pinned one: rollback and fork are distinct alarms. Pure given the consistency proof. */
export function checkHeadAgainstPin(cp: Checkpoint, pinned: Checkpoint | undefined, proof: readonly Uint8Array[] | undefined): void {
  if (pinned === undefined) return;
  if (cp.size < pinned.size) throw new BoardIntegrityError('E-BOARD-ROLLBACK', 'record is shorter than a version seen before', { pinnedSize: pinned.size, size: cp.size });
  const sameRoot = cp.root.length === pinned.root.length && cp.root.every((b, i) => b === pinned.root[i]);
  if (cp.size === pinned.size) {
    if (!sameRoot) throw new BoardIntegrityError('E-BOARD-FORK', 'two different records of the same size', { size: cp.size });
    return;
  }
  if (proof === undefined || !verifyConsistency(pinned.size, cp.size, pinned.root, cp.root, proof)) {
    throw new BoardIntegrityError('E-BOARD-FORK', 'new record does not extend the one seen before', { from: pinned.size, to: cp.size });
  }
}

export type InclusionState =
  | { state: 'included'; seq: number; treeSize: number; head: PinnedHead }
  | { state: 'not-found' };

/** V9 / "Check inclusion now": re-fetch the head, check signature + consistency with the pin, then the inclusion proof. */
export async function checkInclusion(a: {
  api: ApiClient;
  apiElectionId: string;
  logPk: Uint8Array;
  leafHash: Uint8Array;
  seq: number;
  pinned: PinnedHead | undefined;
}): Promise<InclusionState> {
  const note = await a.api.checkpointNote(a.apiElectionId);
  const cp = parseCheckpoint(note);
  if (!cp.ok || !verifyLogSignature(cp.value, a.logPk)) throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'checkpoint is malformed or not signed by the log key');
  const pinnedCp = a.pinned ? parseCheckpoint(a.pinned.note) : undefined;
  const pin = pinnedCp?.ok ? pinnedCp.value : undefined;
  let proof: Uint8Array[] | undefined;
  if (pin && cp.value.size > pin.size) {
    const cons = await a.api.consistency(a.apiElectionId, pin.size, cp.value.size);
    proof = cons.path.map((p) => stdUnb64(p) ?? new Uint8Array());
  }
  checkHeadAgainstPin(cp.value, pin, proof);
  if (a.seq >= cp.value.size) return { state: 'not-found' };
  let ip;
  try {
    ip = await a.api.inclusion(a.apiElectionId, { seq: a.seq, treeSize: cp.value.size });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') return { state: 'not-found' };
    throw e;
  }
  const path = ip.path.map((p) => stdUnb64(p));
  if (path.some((p) => p === undefined) || ip.tree_size !== cp.value.size || !verifyInclusion(a.leafHash, a.seq, cp.value.size, path as Uint8Array[], cp.value.root)) {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'inclusion proof does not verify', { seq: a.seq, treeSize: cp.value.size });
  }
  return { state: 'included', seq: a.seq, treeSize: cp.value.size, head: { electionId: a.pinned?.electionId ?? '', size: cp.value.size, note } };
}

/** Receipt file (QV-10 §10.2): plaintext, no secrets, no selections. */
export interface ReceiptFile {
  format: 'qv-receipt/1';
  election: string;
  manifest_hash: string;
  ballot_code: string;
  seq: number;
  leaf_hash: string;
  receipt: ReceiptView;
  client_build: string;
}
export function receiptFileText(f: ReceiptFile): string {
  return JSON.stringify(f, null, 2);
}
export function parseReceiptFile(text: string): ReceiptFile | undefined {
  try {
    const v = JSON.parse(text) as Partial<ReceiptFile>;
    if (v.format !== 'qv-receipt/1' || typeof v.ballot_code !== 'string' || typeof v.seq !== 'number' || typeof v.leaf_hash !== 'string') return undefined;
    return v as ReceiptFile;
  } catch {
    return undefined;
  }
}
export const leafHashOf = (headerBytes: Uint8Array): Uint8Array => hashLeaf(headerBytes);
