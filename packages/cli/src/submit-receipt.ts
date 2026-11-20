// Opt-in, client-owned verification of the one receipt returned by an online entry append.
// The server response is not a trust anchor. This does not verify election state, witnesses or freshness.
import {
  b64, b64u, bodyDigest, decodeHeader, HARD_BODY_CAP, hashLeaf, MAX_BODY,
  receiptFromJson, unb64u, verifyReceipt,
} from '@quietvote/board';
import { InputError, FailError } from './args.ts';

type JsonObject = Record<string, unknown>;
function object(v: unknown): JsonObject | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as JsonObject : undefined;
}
function nonnegativeSafe(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
function fail(): never {
  // This is *after* POST. Even malformed successful evidence does not prove that admission failed.
  throw new FailError('returned receipt did not verify; submission may have been accepted; retain the exact packet and inspect server state before any retry');
}

/** Bind the exact header bytes, body digest, canonical encodings and election origin before POST. */
export function submittedPacketLeaf(packet: { header: string; body: string }, origin: string): Uint8Array {
  const headerBytes = unb64u(packet.header);
  const body = unb64u(packet.body);
  if (!headerBytes || !body || b64u(headerBytes) !== packet.header || b64u(body) !== packet.body) {
    throw new InputError('entry packet has invalid or non-canonical base64url bytes');
  }
  const d = decodeHeader(headerBytes);
  if (!d.ok || d.value.origin !== origin) throw new InputError('entry header is malformed or belongs to another election');
  if (body.length !== d.value.bodyLen || body.length > Math.min(MAX_BODY[d.value.type], HARD_BODY_CAP) ||
      !equal(bodyDigest(body), d.value.bodyDigest)) {
    throw new InputError('entry body differs from its signed header length or digest');
  }
  return hashLeaf(headerBytes);
}

export interface SubmissionReceiptVerification {
  promise: 'VERIFIED';
  inclusion: 'VERIFIED' | 'INCOMPLETE';
  origin: string;
  leaf_hash: string;
  seq: number;
  tree_size?: number;
  scope: string;
}

/** Convert QV-09's nested/base64url REST response into the board verifier's exact receipt form. */
export function checkReturnedSubmissionReceipt(
  response: unknown,
  expected: { origin: string; leafHash: Uint8Array; logPk: Uint8Array },
): SubmissionReceiptVerification {
  const wrapper = object(response);
  const receipt = object(wrapper?.['receipt']);
  const promise = object(receipt?.['promise']);
  if (!wrapper || !receipt || !promise ||
      (wrapper['status'] !== 'included' && wrapper['status'] !== 'sequenced') ||
      typeof receipt['origin'] !== 'string' || !nonnegativeSafe(receipt['seq']) ||
      !nonnegativeSafe(promise['sequenced_at']) || !nonnegativeSafe(promise['checkpoint_deadline'])) fail();
  const leafText = receipt['leaf_hash'], sigText = receipt['promise_sig'];
  if (typeof leafText !== 'string' || typeof sigText !== 'string') fail();
  const leaf = unb64u(leafText), sig = unb64u(sigText);
  if (!leaf || leaf.length !== 32 || b64u(leaf) !== leafText ||
      !sig || sig.length !== 64 || b64u(sig) !== sigText) fail();
  if (receipt['origin'] !== expected.origin || !equal(leaf, expected.leafHash)) fail();

  const flat: JsonObject = {
    origin: receipt['origin'], seq: receipt['seq'], leaf_hash: b64(leaf),
    sequenced_at: promise['sequenced_at'], checkpoint_deadline: promise['checkpoint_deadline'],
    promise_sig: b64(sig),
  };
  const included = receipt['inclusion'] !== undefined;
  if (included !== (wrapper['status'] === 'included')) fail();
  if (included) {
    const proof = object(receipt['inclusion']);
    if (!proof || !nonnegativeSafe(proof['tree_size']) || proof['tree_size'] <= (receipt['seq'] as number) ||
        !Array.isArray(proof['path']) || proof['path'].length > 64 ||
        !proof['path'].every((p: unknown) => typeof p === 'string' && p.length <= 44) ||
        typeof proof['checkpoint_note'] !== 'string' || proof['checkpoint_note'].length > 8192) fail();
    // Some wire responses repeat these values inside inclusion. When present, they must agree.
    if (proof['seq'] !== undefined && proof['seq'] !== receipt['seq']) fail();
    if (proof['leaf_hash'] !== undefined && proof['leaf_hash'] !== leafText) fail();
    flat['inclusion'] = {
      tree_size: proof['tree_size'], path: proof['path'], checkpoint_note: proof['checkpoint_note'],
    };
  }
  const parsed = receiptFromJson(flat);
  if (!parsed.ok) fail();
  const checked = verifyReceipt(parsed.value, expected.logPk);
  if (!checked.ok) fail();
  return {
    promise: 'VERIFIED', inclusion: included ? 'VERIFIED' : 'INCOMPLETE',
    origin: expected.origin, leaf_hash: b64u(expected.leafHash), seq: parsed.value.seq,
    ...(checked.value.treeSize === undefined ? {} : { tree_size: checked.value.treeSize }),
    scope: 'returned receipt only; no witness quorum, newest head, freshness, election tally, finality or ballot-counting verdict',
  };
}
