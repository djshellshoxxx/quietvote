// Election-bundle loader/validator. Pure: no I/O. Strict QV-JSON parse; closed top-level key set.
import { parseQvJson } from '@quietvote/crypto';
import { bundleFromJson, type LogBundle } from '@quietvote/board';
import type { ElectionBundle } from '@quietvote/protocol';

export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

export interface LoadedBundle {
  /** The protocol-level bundle handed to protocol.verifyElection (without the `board` member). */
  election: ElectionBundle;
  /** Present when the bundle carries a board log export (`board`, the JSON form of board.LogBundle). */
  board?: LogBundle;
  /** The same export as received (JSON form): what protocol.verifyElection's log evidence consumes (C3 entry binding). */
  boardJson?: unknown;
}

export type LoadResult = { ok: true; value: LoadedBundle } | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Accepts text/bytes (strict QV-JSON: duplicate keys, floats, lone surrogates rejected) or an already-parsed value.
 * Shape: `{manifest, manifest_hash, roll[], log[], board?}`; any other top-level key is an error.
 * Deep validation (signatures, proofs, schemas) is protocol.verifyElection's job; this layer only decides
 * whether the file is a bundle at all and separates the board export.
 */
export function loadBundle(input: string | Uint8Array | object): LoadResult {
  let v: unknown = input;
  if (typeof input === 'string' || input instanceof Uint8Array) {
    const len = typeof input === 'string' ? input.length : input.byteLength;
    if (len > MAX_BUNDLE_BYTES) return { ok: false, errors: [`bundle exceeds ${MAX_BUNDLE_BYTES} bytes`] };
    try {
      v = parseQvJson(input);
    } catch (e) {
      return { ok: false, errors: [`not valid QV-JSON: ${e instanceof Error ? e.message : 'parse error'}`] };
    }
  }
  const errors: string[] = [];
  if (!isObj(v)) return { ok: false, errors: ['bundle must be a JSON object'] };
  for (const k of Object.keys(v)) {
    if (!['manifest', 'manifest_hash', 'roll', 'log', 'board'].includes(k)) errors.push(`unknown top-level member "${k}"`);
  }
  if (!isObj(v['manifest']) || !isObj(v['manifest']['body'])) errors.push('manifest must be {body, sigs}');
  if (typeof v['manifest_hash'] !== 'string') errors.push('manifest_hash must be a string');
  if (!Array.isArray(v['roll'])) errors.push('roll must be an array');
  if (!Array.isArray(v['log'])) errors.push('log must be an array');
  let board: LogBundle | undefined;
  if (v['board'] !== undefined) {
    const b = bundleFromJson(v['board']);
    if (!b.ok) errors.push(`board export invalid: ${b.error.message}`);
    else board = b.value;
  }
  if (errors.length > 0) return { ok: false, errors };
  const { board: _drop, ...rest } = v;
  void _drop;
  const election = rest as unknown as ElectionBundle;
  return { ok: true, value: board === undefined ? { election } : { election, board, boardJson: v['board'] } };
}
