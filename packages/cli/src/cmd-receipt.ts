// Offline receipt checking; trust anchors must come from the caller, never the receipt.
import { receiptFromJson, verifyReceipt } from '@quietvote/board';
import { bytesToHex, hexToBytes, parseQvJson } from '@quietvote/crypto';
import { InputError, UsageError, needFlag, needPositional, parseArgs } from './args.ts';
import { isHex, printJson, readFile } from './common.ts';
import { EXIT, type Io } from './io.ts';

export async function cmdVerifyReceipt(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'log-key': 'value', origin: 'value', 'leaf-hash': 'value', json: 'bool' });
  const [file] = needPositional(p, 1, 'verify-receipt <receipt.json>');
  const key = needFlag(p, 'log-key'), leaf = needFlag(p, 'leaf-hash'), origin = needFlag(p, 'origin');
  if (!isHex(key, 32) || !isHex(leaf, 32)) throw new UsageError('--log-key and --leaf-hash must be 64 lower-case hex digits');
  let value: unknown;
  try { value = parseQvJson(readFile(file!)); }
  catch { throw new InputError('receipt is not readable strict QV-JSON'); }
  const parsed = receiptFromJson(value);
  if (!parsed.ok) throw new InputError('malformed receipt');
  const r = parsed.value;
  const bound = r.origin === origin && bytesToHex(r.leafHash) === leaf;
  const checked = verifyReceipt(r, hexToBytes(key));
  const valid = bound && checked.ok;
  const inclusion = !valid ? 'FAILED' : r.inclusion === undefined ? 'INCOMPLETE' : 'VERIFIED';
  if (p.has('json')) printJson(io, { promise: valid ? 'VERIFIED' : 'FAILED', inclusion, origin, leaf_hash: leaf,
    scope: 'receipt only; no witness quorum, freshness, election tally or ballot-counting verdict' });
  else io.out(`RECEIPT INCLUSION: ${inclusion}\nReceipt only; witness quorum, freshness and ballot counting are not checked.\n`);
  return !valid ? EXIT.fail : r.inclusion === undefined ? EXIT.incomplete : EXIT.ok;
}
