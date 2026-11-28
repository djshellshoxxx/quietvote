// SPDX-License-Identifier: AGPL-3.0-or-later
import { additionalEntropyRng, type AdditionalEntropyRng, type Rng } from '@quietvote/crypto';
import { TrusteeError } from './errors.ts';
import { readSecretFile } from './fsutil.ts';

/** Six-sided dice digits, with only ASCII spaces, tabs and line endings ignored.
 * No entropy estimate or minimum randomness claim is assigned to user input.
 */
export function parseDice(bytes: Uint8Array): Uint8Array {
  const digits = new Uint8Array(Math.min(bytes.length, 8192));
  let count = 0;
  try {
    for (const byte of bytes) {
      if (byte === 32 || byte === 9 || byte === 10 || byte === 13) continue;
      if (byte < 49 || byte > 54 || count === 8192) throw new Error('invalid dice');
      digits[count++] = byte;
    }
    if (count === 0) throw new Error('empty dice');
    return digits.slice(0, count);
  } catch {
    throw new TrusteeError('USAGE', 'BAD_DICE', 'dice input must contain 1 to 8192 digits from 1 through 6, separated only by ASCII whitespace');
  } finally { digits.fill(0); }
}

/** Same-handle owner-private file checks apply to this optional local secret. */
export async function readDiceRng(path: string, source: Rng): Promise<AdditionalEntropyRng> {
  let raw: Uint8Array;
  try { raw = await readSecretFile(path, 64 * 1024); }
  catch (error) {
    if (error instanceof TrusteeError) throw new TrusteeError(error.kind, error.code, 'cannot read dice input; supply a bounded owner-private regular file');
    throw new TrusteeError('REFUSED', 'DICE_INPUT_UNAVAILABLE', 'cannot read dice input');
  }
  let digits: Uint8Array | undefined;
  try {
    digits = parseDice(raw);
    const mixed = additionalEntropyRng(source, digits);
    return {
      bytes(n) {
        try { return mixed.bytes(n); }
        catch { throw new TrusteeError('REFUSED', 'RNG_UNAVAILABLE', 'required platform randomness is unavailable; dice input cannot replace it'); }
      },
      destroy: () => mixed.destroy(),
    };
  } finally { raw.fill(0); digits?.fill(0); }
}
