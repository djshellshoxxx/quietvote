// SPDX-License-Identifier: AGPL-3.0-or-later
// Relay previously produced signed spoil shares; no key material or decryption is needed online.
import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, type BigIntStats } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, parseQvJson, sha256 } from '@quietvote/crypto';
import { check, collectSpoilShares, spoilShareRecordSchema, type SignedRecord, type SpoilShareBody } from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag } from './args.ts';
import { electionContext, pinnedHash, printJson, type ElectionContext } from './common.ts';
import { args, electionPath, requestRawJson, RequestError, validateOnlineRequest, type HttpReply } from './cmd-online.ts';
import { EXIT, type Io } from './io.ts';

const MAX_BODY = 1_048_576; // Existing POST /spoil-shares request limit.
const MAX_FILES = 1024;
const MAX_TOTAL = 64 * 1024 * 1024;
const MAX_RESPONSE = 64 * 1024;

interface Prepared { bytes: Uint8Array; code: string; j: number; body_sha256: string }
type Outcome = 'accepted' | 'duplicate' | 'rejected' | 'unknown' | 'not_attempted';
interface ItemResult {
  item: number; code: string; j: number; body_sha256: string; status: Outcome;
  http_status: number | null; error_code: string | null;
}

function same(a: BigIntStats, b: BigIntStats): boolean { return a.dev === b.dev && a.ino === b.ino; }
function unchanged(a: BigIntStats, b: BigIntStats): boolean {
  return same(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

/** Read the exact bounded regular file that was inspected, without following a final symlink or waiting on a FIFO. */
function readBody(path: string): Uint8Array {
  let fd: number | undefined;
  try {
    const named = lstatSync(path, { bigint: true });
    if (!named.isFile() || named.size > BigInt(MAX_BODY)) throw new Error('not a bounded regular file');
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || !unchanged(named, before)) throw new Error('file changed');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (n === 0) break;
      size += n;
    }
    if (BigInt(size) !== before.size || !unchanged(before, fstatSync(fd, { bigint: true })) ||
        !unchanged(before, lstatSync(path, { bigint: true }))) throw new Error('file changed');
    return bytes.subarray(0, size);
  } catch { throw new InputError('post bodies must be unchanged regular files of at most 1 MiB; links and special files are refused'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** All bytes, schemas, signatures and context bindings are checked before the first request. */
function prepareDirectory(path: string, ec: ElectionContext): Prepared[] {
  let original: BigIntStats;
  const names: string[] = [];
  try {
    original = lstatSync(path, { bigint: true });
    if (!original.isDirectory()) throw new Error('not a directory');
    const directory = opendirSync(path);
    try {
      for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
        if (!entry.name.endsWith('.json') || names.length === MAX_FILES) throw new Error('unexpected or excess files');
        names.push(entry.name);
      }
    } finally { directory.closeSync(); }
    if (names.length === 0) throw new Error('empty directory');
  } catch { throw new InputError('post directory must be a real, nonempty directory containing at most 1024 JSON files only'); }

  let total = 0;
  const records: Prepared[] = [], identities = new Set<string>();
  for (const name of names.sort()) {
    const bytes = readBody(join(path, name));
    total += bytes.length;
    if (total > MAX_TOTAL) throw new InputError('post directory exceeds the 64 MiB total limit');
    let raw: unknown;
    try { raw = parseQvJson(bytes); }
    catch { throw new InputError('post body is not valid QV-JSON'); }
    if (check(spoilShareRecordSchema, raw) !== null) throw new InputError('post body is not a signed spoil-share record');
    const rec = raw as SignedRecord<SpoilShareBody>;
    const collected = collectSpoilShares(ec.manifest, ec.params.ctx, rec.body.code, [rec]);
    if (collected.rejected.length !== 0 || !collected.sets.has(rec.body.j)) {
      throw new FailError('post body does not verify against the pinned election context and trustee key');
    }
    const identity = `${rec.body.code}/${rec.body.j}`;
    if (identities.has(identity)) throw new InputError('post directory repeats a ballot code and trustee index');
    identities.add(identity);
    records.push({ bytes, code: rec.body.code, j: rec.body.j, body_sha256: bytesToHex(sha256(bytes)) });
  }
  try {
    const current = lstatSync(path, { bigint: true });
    if (!current.isDirectory() || !unchanged(original, current)) throw new Error('directory changed');
  } catch { throw new InputError('post directory changed while preparing its contents'); }
  return records;
}

function acknowledgment(reply: HttpReply, record: Prepared): 'accepted' | 'duplicate' | undefined {
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(reply.bytes)) as Record<string, unknown> | null;
    if (value === null || typeof value !== 'object' || Array.isArray(value) || value['code'] !== record.code || value['j'] !== record.j) return undefined;
    if (reply.status === 201 && value['status'] === 'accepted') return 'accepted';
    if (reply.status === 200 && value['status'] === 'duplicate') return 'duplicate';
  } catch { /* HTTP success without a matching acknowledgment cannot establish acceptance. */ }
  return undefined;
}

export async function cmdOnlineElectionSpoilPost(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { id: 'value', 'post-dir': 'value', election: 'value', 'manifest-hash': 'value' });
  const path = `${electionPath(p)}/spoil-shares`, directory = needFlag(p, 'post-dir'), election = needFlag(p, 'election');
  const pin = pinnedHash(p);
  if (pin === undefined) throw new UsageError('spoil posting requires an independently obtained --manifest-hash');
  validateOnlineRequest(p);
  let ec: ElectionContext;
  try { ec = await electionContext(election, pin); }
  catch (error) {
    // Imported parsers can name paths or malformed input. This command emits fixed diagnostics only.
    if (error instanceof InputError) throw new InputError('cannot read a valid bounded election bundle');
    if (error instanceof FailError) throw new FailError('election manifest, DKG context or independent manifest hash did not verify');
    throw error;
  }
  if (ec.manifest.election_id !== needFlag(p, 'id')) throw new FailError('--id differs from the pinned election');
  if (ec.manifest.spoil_trustee_decrypt !== true) throw new FailError('the pinned manifest does not enable trustee spoil decryption');
  const prepared = prepareDirectory(directory, ec);
  const results: ItemResult[] = prepared.map((record, index) => ({
    item: index + 1, code: record.code, j: record.j, body_sha256: record.body_sha256,
    status: 'not_attempted', http_status: null, error_code: null,
  }));

  for (const [index, record] of prepared.entries()) {
    const result = results[index]!;
    try {
      const reply = await requestRawJson(p, io, path, record.bytes, MAX_RESPONSE);
      result.http_status = reply.status;
      result.status = acknowledgment(reply, record) ?? 'unknown';
      if (result.status === 'unknown') result.error_code = 'INVALID_ACKNOWLEDGMENT';
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      result.status = error.outcome;
      result.http_status = error.status;
      result.error_code = error.serverCode;
    }
    if (result.status !== 'accepted' && result.status !== 'duplicate') break;
  }

  const acknowledged = results.filter((r) => r.status === 'accepted' || r.status === 'duplicate').length;
  const ok = acknowledged === results.length;
  const report = { ok, election_id: ec.manifest.election_id, manifest_hash: pin,
    verification: { scope: 'manifest-context-and-signatures', context: bytesToHex(ec.params.ctx),
      share_proofs_verified: false, server_admission_verified: false, tally_inclusion_verified: false },
    total: results.length, acknowledged, results };
  if (p.has('json')) printJson(io, report);
  else {
    io.out(`spoil-post: ${acknowledged} of ${results.length} records acknowledged by the server\n`);
    for (const item of results) io.out(`  item ${item.item}: ${item.status}; trustee ${item.j}; code ${item.code}; body SHA-256 ${item.body_sha256}\n`);
  }
  if (!ok) {
    const failed = results.find((r) => r.status === 'unknown' || r.status === 'rejected')!;
    const detail = failed.http_status === null ? '' : `: HTTP ${failed.http_status}${failed.error_code === null ? '' : ` ${failed.error_code}`}`;
    io.err(failed.status === 'unknown'
      ? `spoil-post: submission outcome unknown for item ${failed.item}${detail}; retain the exact files and inspect server state before retrying; later items were not attempted\n`
      : `spoil-post: server rejected item ${failed.item}${detail}; later items were not attempted\n`);
  }
  return ok ? EXIT.ok : EXIT.fail;
}
