import { jcs, parseQvJson } from '@quietvote/crypto';
import { TrusteeError } from './errors.ts';
import { atomicWrite, exists, readFile } from './fsutil.ts';

/**
 * Public release ledger: a plaintext sidecar `<bundle>.releases` holding every signed `tally-share` / `spoil-share` record this share
 * has ever released from that bundle path. It sits OUTSIDE the sealed bundle so that opening or restoring an older copy of the bundle
 * cannot silently forget what was already released (one-shot guards, SPOIL_REPLAY). The records are public data (they are published
 * anyway). Limit: anyone who controls the filesystem can delete or roll back the ledger too; this stops accidents and a restore from
 * an old backup, not a hostile operator.
 */
export const LEDGER_FORMAT = 'qv-release-ledger/v1';
export const ledgerPath = (bundle: string): string => `${bundle}.releases`;

export async function readLedger(path: string): Promise<unknown[] | undefined> {
  if (!(await exists(path))) return undefined;
  let j: unknown;
  try {
    j = parseQvJson(new Uint8Array(await readFile(path)));
  } catch {
    throw new TrusteeError('VERIFY', 'LEDGER_CORRUPT', `${path} is not valid`);
  }
  const o = j as { format?: unknown; records?: unknown } | null;
  if (typeof o !== 'object' || o === null || o.format !== LEDGER_FORMAT || !Array.isArray(o.records)) throw new TrusteeError('VERIFY', 'LEDGER_CORRUPT', `${path} is not a release ledger`);
  return o.records;
}

export async function writeLedger(path: string, records: readonly unknown[]): Promise<void> {
  await atomicWrite(path, jcs({ format: LEDGER_FORMAT, records }), 0o644);
}
