// Recorded PUBLIC export management (QV-09 section 10.1, ADR-027 N-32(b)).
// Matching an artifact to server metadata is not independent election verification.
import { closeSync, constants, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { readChecksummedArchive } from '@quietvote/board';
import { bytesToHex, parseQvJson, sha256 } from '@quietvote/crypto';
import { logOrigin } from '@quietvote/protocol';
import { FailError, InputError, UsageError, needFlag, type Parsed } from './args.ts';
import { isHex, printJson } from './common.ts';
import { AUTH, args, electionPath, jsonRequest, request, withManagementKey, type ManagementKey } from './cmd-online.ts';
import { EXIT, type Io } from './io.ts';
import { writePrivateFileSync } from './private-files.ts';

const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_METADATA = 64 * 1024;
const ID = /^[a-z2-7]{26}$/;
const ELECTION_AUTH = { ...AUTH, id: 'value' } as const;
const RECORD_AUTH = { ...ELECTION_AUTH, 'export-id': 'value' } as const;

interface ExportRecord {
  export_id: string;
  kind: 'public';
  tree_size: number;
  root_hash: string;
  sha256: string;
  byte_length: number;
}

function recordPath(p: Parsed): string {
  const base = electionPath(p), id = needFlag(p, 'export-id');
  if (!ID.test(id)) throw new UsageError('--export-id must be a 26-character lowercase base32 identifier');
  return `${base}/exports/${id}`;
}

async function record(p: Parsed, io: Io, key: ManagementKey): Promise<ExportRecord> {
  const path = recordPath(p);
  let value: unknown;
  // Management JSON contains nullable acknowledgement/notice fields; it is not a QV-JSON signed record.
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await request(p, io, 'GET', path, undefined, key, MAX_METADATA))); }
  catch (e) { if (e instanceof FailError || e instanceof InputError || e instanceof UsageError) throw e; throw new FailError('server returned malformed export metadata'); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new FailError('server returned malformed export metadata');
  const v = value as Record<string, unknown>;
  if (v['export_id'] !== p.get('export-id') || v['kind'] !== 'public' ||
      typeof v['tree_size'] !== 'number' || !Number.isSafeInteger(v['tree_size']) || v['tree_size'] < 1 ||
      !isHex(v['root_hash'], 32) || !isHex(v['sha256'], 32) ||
      typeof v['byte_length'] !== 'number' || !Number.isSafeInteger(v['byte_length']) || v['byte_length'] < 1 || v['byte_length'] > MAX_ARCHIVE) {
    throw new FailError('export metadata has invalid identity, binding or length; CLI archives are limited to 64 MiB');
  }
  return value as ExportRecord;
}

function checkArtifact(bytes: Uint8Array, r: ExportRecord, electionId: string): void {
  if (bytes.length !== r.byte_length || bytesToHex(sha256(bytes)) !== r.sha256) {
    throw new FailError('archive length or SHA-256 differs from the recorded export');
  }
  try {
    const files = readChecksummedArchive(bytes, { maxFiles: 10_032 });
    const raw = files.get('bundle.json');
    if (!raw || raw.length > MAX_METADATA) throw new Error('metadata');
    const meta = parseQvJson(raw) as Record<string, unknown>;
    if (meta === null || typeof meta !== 'object' || Array.isArray(meta) || meta['format'] !== 'qv-bundle/v1' ||
        meta['origin'] !== logOrigin({ election_id: electionId }) || meta['tree_size'] !== r.tree_size ||
        meta['root_b64'] !== Buffer.from(r.root_hash, 'hex').toString('base64')) throw new Error('binding');
  } catch { throw new FailError('archive framing, checksums or election/tree binding do not match the recorded export'); }
}

function retainedBytes(path: string): Uint8Array {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ARCHIVE) throw new Error('size');
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const n = readSync(fd, bytes, used, bytes.length - used, null);
      if (n === 0) break;
      used += n;
    }
    if (used !== stat.size) throw new Error('changed');
    return bytes.subarray(0, used);
  } catch { throw new InputError('retained archive must be a readable, stable regular file of at most 64 MiB'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

async function create(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...ELECTION_AUTH, 'idempotency-key': 'value' });
  const path = `${electionPath(p)}/exports`;
  needFlag(p, 'idempotency-key');
  return jsonRequest(p, io, 'POST', path, { kind: 'public' }, true);
}

async function job(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...AUTH, 'job-id': 'value' }), id = needFlag(p, 'job-id');
  if (!ID.test(id)) throw new UsageError('--job-id must be a 26-character lowercase base32 identifier');
  return jsonRequest(p, io, 'GET', `/api/v1/jobs/${id}`, undefined, true);
}

async function list(argv: string[], io: Io): Promise<number> {
  const p = args(argv, ELECTION_AUTH);
  return jsonRequest(p, io, 'GET', `${electionPath(p)}/exports`, undefined, true);
}

async function inspect(argv: string[], io: Io): Promise<number> {
  const p = args(argv, RECORD_AUTH);
  return jsonRequest(p, io, 'GET', recordPath(p), undefined, true);
}

async function download(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...RECORD_AUTH, out: 'value' }), path = recordPath(p), out = needFlag(p, 'out');
  if (existsSync(out)) throw new InputError('export file exists; existing files are never overwritten');
  return withManagementKey(p, io, async (key) => {
    const r = await record(p, io, key);
    // Construct paths from validated IDs; server-supplied links never select a destination or credential audience.
    const bytes = await request(p, io, 'GET', `${path}/download`, undefined, key, r.byte_length);
    checkArtifact(bytes, r, needFlag(p, 'id'));
    try { writePrivateFileSync(out, bytes); }
    catch { throw new InputError('cannot create export file; existing files are never overwritten'); }
    printJson(io, { file: out, bytes: bytes.length, export_id: r.export_id, sha256: r.sha256,
      tree_size: r.tree_size, root_hash: r.root_hash, artifact_matches_record: true, verified: false, acknowledged: false });
    return EXIT.ok;
  });
}

async function acknowledge(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...RECORD_AUTH, file: 'value', retained: 'bool', 'idempotency-key': 'value' });
  const path = recordPath(p), file = needFlag(p, 'file');
  needFlag(p, 'idempotency-key');
  if (!p.has('retained')) throw new UsageError('--retained is required to explicitly confirm retention of the checked archive');
  const local = retainedBytes(file);
  return withManagementKey(p, io, async (key) => {
    const r = await record(p, io, key);
    checkArtifact(local, r, needFlag(p, 'id'));
    // Unlocking the signing key and fetching metadata can take time. Recheck retained bytes before the mutation.
    const response = await request(p, io, 'POST', `${path}/acknowledge`,
      { tree_size: r.tree_size, root_hash: r.root_hash, sha256: r.sha256 }, key, MAX_METADATA,
      () => checkArtifact(retainedBytes(file), r, needFlag(p, 'id')));
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response));
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
      const acknowledged = value as Record<string, unknown>;
      if (acknowledged['export_id'] !== r.export_id || acknowledged['tree_size'] !== r.tree_size ||
          acknowledged['root_hash'] !== r.root_hash || acknowledged['sha256'] !== r.sha256 || acknowledged['byte_length'] !== r.byte_length ||
          typeof acknowledged['acknowledged_at'] !== 'string' || !Number.isFinite(Date.parse(acknowledged['acknowledged_at']))) throw new Error('binding');
    } catch { throw new FailError('server returned HTTP success but malformed JSON; acknowledgement may have been accepted; inspect server state'); }
    printJson(io, value);
    return EXIT.ok;
  });
}

async function notice(argv: string[], io: Io): Promise<number> {
  const p = args(argv, { ...RECORD_AUTH, 'tree-size': 'value', 'root-hash': 'value', sha256: 'value', 'idempotency-key': 'value' });
  const path = recordPath(p), size = needFlag(p, 'tree-size'), root = needFlag(p, 'root-hash'), digest = needFlag(p, 'sha256');
  needFlag(p, 'idempotency-key');
  if (!/^[1-9][0-9]*$/.test(size) || !Number.isSafeInteger(Number(size))) throw new UsageError('--tree-size must be a positive safe integer');
  if (!isHex(root, 32) || !isHex(digest, 32)) throw new UsageError('--root-hash and --sha256 must each be 64 lowercase hex digits');
  return jsonRequest(p, io, 'POST', `${path}/deletion-notice`, { tree_size: Number(size), root_hash: root, sha256: digest }, true);
}

export const ONLINE_EXPORTS = {
  'export-create': create, 'job-inspect': job, 'export-list': list, 'export-inspect': inspect,
  'export-download': download, 'export-acknowledge': acknowledge, 'export-deletion-notice': notice,
} as const;
