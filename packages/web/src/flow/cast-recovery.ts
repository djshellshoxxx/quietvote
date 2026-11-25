// SPDX-License-Identifier: AGPL-3.0-or-later
// Reload recovery needs public lookup data, never the signed request or ballot randomness.
import type { ApiClient } from '../api/client.ts';
import { ApiError } from '../api/errors.ts';
import type { DeviceStorage, PendingCast } from '../key/storage.ts';
import { b64uDecode } from '../util/hex.ts';
import { BoardIntegrityError, checkInclusion, type InclusionState } from './receipt.ts';

export async function recoverCast(a: {
  pending: PendingCast;
  origin: string;
  electionId: string;
  manifestHash: string;
  api: ApiClient;
  logPk: Uint8Array;
  storage: DeviceStorage;
}): Promise<InclusionState> {
  const p = a.pending;
  const leaf = b64uDecode(p.leafHash);
  if (p.origin !== a.origin || p.electionId !== a.electionId || p.manifestHash !== a.manifestHash ||
      !/^[0-9a-f]{64}$/.test(p.code) || !leaf || leaf.length !== 32) {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'pending cast does not match this election');
  }
  let lookup;
  try { lookup = await a.api.inclusion(a.electionId, { leafHash: p.leafHash }); }
  catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND') return { state: 'not-found' };
    throw e;
  }
  if (!Number.isSafeInteger(lookup.seq) || lookup.seq < 0 || lookup.leaf_hash !== p.leafHash) {
    throw new BoardIntegrityError('E-BOARD-INCL-FAIL', 'pending cast lookup mismatch');
  }
  const result = await checkInclusion({ api: a.api, apiElectionId: a.electionId, expectedOrigin: a.origin, logPk: a.logPk,
    leafHash: leaf, seq: lookup.seq, pinned: await a.storage.getHead(a.electionId) });
  if (result.state === 'included') {
    await a.storage.putHead({ ...result.head, electionId: a.electionId });
    await a.storage.deletePendingCast(p);
  }
  return result;
}
