// SPDX-License-Identifier: AGPL-3.0-or-later
import { utf8 } from '@quietvote/crypto';
import { rollRoot } from '@quietvote/protocol';
import { ApiError } from './errors.ts';

/** The existing server request ceiling; configured voter limits can be lower. */
export const MAX_PINNED_ROLL_REQUEST = 1_153_434;

/** Copy the exact wire list. Do not normalize, sort or silently discard members. */
export function checkedPinnedRoll(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100_000 ||
      !value.every((key) => typeof key === 'string' && /^[0-9a-f]{64}$/.test(key)) || !rollRoot(value).ok) {
    throw new ApiError({ status: 0, code: 'PINNED_ROLL_INVALID', detail: 'pinned membership must contain distinct, strictly ascending canonical Ed25519 public keys' });
  }
  return [...value] as string[];
}

export function boundedPinnedRollBody<T>(body: T): T {
  if (utf8(JSON.stringify(body)).length > MAX_PINNED_ROLL_REQUEST) {
    throw new ApiError({ status: 0, code: 'PINNED_ROLL_INVALID', detail: 'pinned membership request exceeds the 1,153,434-byte limit' });
  }
  return body;
}
