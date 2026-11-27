// Offline public-archive preparation. Never extracts archive paths or handles private keys.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { bundleFromJson, bundleToJson, parseCheckpoint, readChecksummedArchive, toHex, unb64u } from '@quietvote/board';
import { bytesToHex, ed25519IsStrictPoint, jcs, parseQvJson, sha256 } from '@quietvote/crypto';
import { loadBundle } from '@quietvote/verifier';
import { S, check, manifestSchema, manifestHash, rollRoot, validateManifest, verifyLogStructure, verifyMultiSig } from '@quietvote/protocol';
import { FailError, InputError, UsageError, needPositional, parseArgs } from './args.ts';
import { pinnedHash, printJson } from './common.ts';
import { EXIT, type Io } from './io.ts';
import { writePrivateFileSync } from './private-files.ts';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

function readArchive(path: string): Uint8Array {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('archive must be a regular file of at most 64 MiB');
    // Read at most the observed size plus one byte, even if another process grows the file.
    const bytes = Buffer.alloc(stat.size + 1);
    let size = 0, n: number;
    while (size < bytes.length && (n = readSync(fd, bytes, size, bytes.length - size, null)) > 0) size += n;
    if (size !== stat.size) throw new Error('archive changed while reading');
    return bytes.subarray(0, size);
  } catch (e) { throw new InputError(e instanceof Error ? e.message : 'cannot read archive'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Authenticates the existing public archive framing; consumers still apply their own protocol stage checks. */
export function prepareElectionArchive(path: string, pin: string) {
  let election: ReturnType<typeof loadBundle> & { ok: true };
  let board: ReturnType<typeof bundleToJson>;
  let serverKey: string;
  try {
    const files = readChecksummedArchive(readArchive(path), { maxFiles: MAX_ENTRIES + 32 });
    const need = (name: string): Uint8Array => {
      const data = files.get(name);
      if (!data) throw new Error(`${name} is missing`);
      return data;
    };
    const json = (name: string, cap = 65536): unknown => {
      const bytes = need(name);
      if (bytes.length > cap) throw new Error(`${name} exceeds its size limit`);
      return parseQvJson(bytes);
    };
    const meta = json('bundle.json') as Record<string, unknown>;
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) throw new Error('bundle.json must be an object');
    const raw = need('log/entries.jsonl');
    if (meta['entries_sha256'] !== bytesToHex(sha256(raw))) throw new Error('entries_sha256 mismatch');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    if (!text.endsWith('\n')) throw new Error('entries must end with a newline');
    const lines = text.slice(0, -1).split('\n');
    if (lines.length > MAX_ENTRIES) throw new Error('archive exceeds 10000 entries');
    const entries = lines.map((line, seq) => {
      const entry = parseQvJson(line) as Record<string, unknown>;
      if (typeof entry !== 'object' || entry === null || Object.keys(entry).length !== 3 || entry['seq'] !== seq ||
          typeof entry['header_b64u'] !== 'string' || typeof entry['body_b64u'] !== 'string') throw new Error('entries must have gapless seq, header and unredacted body');
      return entry;
    });
    const checkpoints: string[] = [];
    for (const [name, data] of files) {
      const match = /^log\/checkpoints\/(0|[1-9][0-9]{0,15})\.txt$/.exec(name);
      if (!match) continue;
      const note = new TextDecoder('utf-8', { fatal: true }).decode(data);
      const cp = parseCheckpoint(note);
      if (!cp.ok || cp.value.size !== Number(match[1])) throw new Error('checkpoint filename does not match its size');
      checkpoints.push(note);
    }
    const parsed = bundleFromJson({ format: meta['format'], origin: meta['origin'], created_at: meta['created_at'],
      tree_size: meta['tree_size'], root_b64: meta['root_b64'], generator: meta['generator'], spec: meta['spec'],
      entries, checkpoints, receipts: [], policy: json('witness/policy.json'), redactions: json('redactions.json') });
    if (!parsed.ok) throw new Error(parsed.error.message);
    if (!parsed.value.entries.length || parsed.value.redactions.length) throw new Error('archive must have a complete, unredacted board');
    board = bundleToJson(parsed.value);
    const loaded = loadBundle(json('election.json', MAX_BYTES) as object);
    if (!loaded.ok) throw new Error(loaded.errors.join('; '));
    election = loaded;
    if (election.value.board !== undefined) throw new Error('election.json must not carry a second board');
    const first = parsed.value.entries[0]!.body!;
    if (toHex(first) !== toHex(jcs(election.value.election.manifest))) throw new Error('entry 0 differs from election manifest');
    const key = typeof meta['server_pk_b64u'] === 'string' ? unb64u(meta['server_pk_b64u']) : undefined;
    if (key === undefined || !ed25519IsStrictPoint(key)) throw new Error('invalid server public key');
    serverKey = bytesToHex(key);
    // Bind each content-export record before replacing its filtered log with all board bodies.
    const bySeq = new Map(parsed.value.entries.map((entry) => [entry.seq, entry.body]));
    const seen = new Set<number>();
    for (const entry of election.value.election.log) {
      const body = bySeq.get(entry.seq);
      if (entry.seq === 0 || seen.has(entry.seq) || !body || toHex(body) !== toHex(jcs(entry.entry))) throw new Error('election log differs from board bodies');
      seen.add(entry.seq);
    }
    election.value.election.log = parsed.value.entries.slice(1).map((entry) => ({ seq: entry.seq, entry: parseQvJson(entry.body!) }));
  } catch (e) { throw new InputError(`cannot prepare archive: ${e instanceof Error ? e.message : 'invalid input'}`); }

  const content = election.value.election;
  // Preserve the existing authority rules. In particular, a separate organizer key is not silently authorized here.
  if (content.manifest_hash !== pin) throw new FailError('archive manifest hash differs from --manifest-hash');
  const m = content.manifest.body;
  const shape = check(S.multiSigned(manifestSchema()), content.manifest);
  if (shape !== null || !validateManifest(m, content.roll.length).ok || bytesToHex(manifestHash(m)) !== pin ||
      !verifyMultiSig(manifestHash(m), content.manifest, m.coordinator.keys, m.coordinator.m) || !rollRoot(content.roll).ok) {
    throw new FailError('archive manifest, signatures or roll did not verify');
  }
  const structure = verifyLogStructure(m, content.manifest, content.roll, content.log, { board, extraAuthorKeys: [serverKey] });
  if (!structure.ok) throw new FailError(`archive verification refused: ${structure.findings.map((f) => f.code).join(', ')}`);
  const controlSeq = structure.notices.reduce((current, notice) => notice.control_seq ?? current, 0);
  const snapshot = { origin: structure.origin, tree_size: structure.tree.size, root_hash: toHex(structure.tree.root()) };
  return { content, board, serverKey, controlSeq, snapshot, checkpoints: structure.checkpoints, notices: structure.notices };
}

export async function cmdElectionPrepare(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'manifest-hash': 'value', out: 'value', format: 'value', json: 'bool' });
  const [path] = needPositional(p, 1, 'election prepare <archive.qvb>');
  const pin = pinnedHash(p);
  if (pin === undefined || !p.has('out')) throw new UsageError('prepare requires --manifest-hash and --out');
  const format = p.get('format') ?? 'election';
  if (format !== 'election' && format !== 'ceremony') throw new UsageError('--format must be election or ceremony');
  const { content, board, serverKey } = prepareElectionArchive(path!, pin);
  const output = format === 'ceremony'
    ? { format: 'qv-ceremony-log/v1', manifest_hash: pin, entries: content.log }
    : { ...content, log_evidence: { board, extraAuthorKeys: [serverKey] } };
  try { writePrivateFileSync(p.get('out')!, JSON.stringify(output) + '\n'); }
  catch { throw new InputError('cannot create output; destination must not exist'); }
  const summary = { prepared: true, format, manifest_hash: pin, entries: content.log.length,
    board_structure_verified: true, protocol_verified: false, witness_quorum_verified: false };
  if (p.has('json')) printJson(io, summary);
  else io.out(`prepared ${format} input; manifest and board structure verified; protocol and witness quorum checks remain with the consumer\n`);
  return EXIT.ok;
}
