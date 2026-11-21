// SPDX-License-Identifier: AGPL-3.0-or-later
// ADR-029: authenticated complete membership is separate from voter enrollment.
import { bytesToHex } from '@quietvote/crypto';
import { rollRoot } from '@quietvote/protocol';
import { ApiError } from './problem.ts';

export interface PinnedRoll {
  readonly root: string;
  readonly size: number;
  readonly keys: readonly string[];
}

/** Canonical input spelling is part of the management request, not inferred from a draft. */
export function parsePinnedRoll(value: unknown, maximum = 100_000): PinnedRoll {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum ||
      value.some((key) => typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key))) {
    throw new ApiError(422, 'PINNED_ROLL_INVALID', `pinned_roll must contain 1..${maximum} canonical lowercase 32-byte public keys`);
  }
  const keys = value as string[];
  const root = rollRoot(keys);
  if (!root.ok) throw new ApiError(422, 'PINNED_ROLL_INVALID', 'pinned_roll must contain strictly ascending, unique, strict Ed25519 public keys');
  return Object.freeze({ root: bytesToHex(root.value), size: keys.length, keys: Object.freeze([...keys]) });
}

export function samePinnedRoll(a: PinnedRoll, b: PinnedRoll): boolean {
  return a.root === b.root && a.size === b.size && a.keys.every((key, index) => key === b.keys[index]);
}
