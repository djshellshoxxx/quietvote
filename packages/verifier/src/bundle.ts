// Election-bundle loader/validator. Pure: no I/O. Strict QV-JSON or the existing checksummed QV-18 tar.
import { bytesToHex, decodeUtf8Strict, jcs, parseJsonContainer, parseQvJson, sha256, type JsonContainerPath } from '@quietvote/crypto';
import { bundleFromJson, bytesEqual, checkEntry, parseCheckpoint, readChecksummedArchive, unb64u, type LogBundle } from '@quietvote/board';
import type { ElectionBundle } from '@quietvote/protocol';

export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;

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
const entryBodyNull = (path: JsonContainerPath): boolean => path.length === 1 && path[0] === 'body_b64u';
const boardBodyNull = (path: JsonContainerPath): boolean => path.length === 4 && path[0] === 'board' && path[1] === 'entries' &&
  typeof path[2] === 'number' && path[3] === 'body_b64u';

/** Current reference-server archive. Checksums frame the input; the existing verifiers still authenticate it. */
function loadArchive(input: Uint8Array): LoadedBundle {
  const files = readChecksummedArchive(input, { maxFiles: MAX_ARCHIVE_ENTRIES + 32 });
  const need = (name: string): Uint8Array => {
    const bytes = files.get(name);
    if (bytes === undefined) throw new Error(`${name} is missing`);
    return bytes;
  };
  const json = (name: string, cap = 65_536): unknown => {
    const bytes = need(name);
    if (bytes.length > cap) throw new Error(`${name} exceeds its size limit`);
    return parseQvJson(bytes);
  };
  const meta = json('bundle.json');
  if (!isObj(meta)) throw new Error('bundle.json must be an object');
  const raw = need('log/entries.jsonl');
  if (meta['entries_sha256'] !== bytesToHex(sha256(raw))) throw new Error('entries_sha256 mismatch');
  const text = decodeUtf8Strict(raw);
  if (!text.endsWith('\n')) throw new Error('entries must end with a newline');
  const lines = text.slice(0, -1).split('\n', MAX_ARCHIVE_ENTRIES + 1);
  if (lines.length > MAX_ARCHIVE_ENTRIES) throw new Error('archive exceeds 10000 entries');
  const entries = lines.map((line, seq) => {
    const entry = parseJsonContainer(line, entryBodyNull);
    if (!isObj(entry) || Object.keys(entry).length !== 3 || entry['seq'] !== seq ||
        typeof entry['header_b64u'] !== 'string' || (entry['body_b64u'] !== null && typeof entry['body_b64u'] !== 'string')) {
      throw new Error('entries must have gapless seq, header and body (or null redaction)');
    }
    return entry;
  });
  const checkpoints: { size: number; note: string }[] = [];
  for (const [name, bytes] of files) {
    if (!name.startsWith('log/checkpoints/')) continue;
    const match = /^log\/checkpoints\/(0|[1-9][0-9]{0,15})\.txt$/.exec(name);
    const note = decodeUtf8Strict(bytes);
    const cp = parseCheckpoint(note);
    if (!match || !cp.ok || cp.value.size !== Number(match[1])) throw new Error('checkpoint filename does not match its size');
    checkpoints.push({ size: cp.value.size, note });
  }
  checkpoints.sort((a, b) => a.size - b.size);
  const boardJson = { format: meta['format'], origin: meta['origin'], created_at: meta['created_at'],
    tree_size: meta['tree_size'], root_b64: meta['root_b64'], generator: meta['generator'], spec: meta['spec'],
    entries, checkpoints: checkpoints.map((cp) => cp.note), receipts: [], policy: json('witness/policy.json'), redactions: json('redactions.json') };
  const parsed = bundleFromJson(boardJson);
  if (!parsed.ok) throw new Error(`board export invalid: ${parsed.error.message}`);
  const board = parsed.value;
  const loaded = loadBundle(json('election.json', MAX_BUNDLE_BYTES) as object);
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  if (loaded.value.board !== undefined) throw new Error('election.json must not carry a second board');
  const election = loaded.value.election;
  const manifestBody = board.entries[0]?.body;
  const manifestBytes = jcs(election.manifest);
  // With a missing body, bind the convenience manifest to the retained header's length/digest.
  // This is structural binding only; signatures and author authority still belong to the verifiers.
  if (manifestBody === undefined || (manifestBody === null
    ? !checkEntry(board.entries[0]!.headerBytes, manifestBytes, board.origin, undefined, 0).ok
    : !bytesEqual(manifestBody, manifestBytes))) {
    throw new Error('entry 0 differs from election manifest');
  }
  if (bytesToHex(board.policy.logPublicKey) !== election.manifest.body.bb?.log_pk) throw new Error('board log key differs from manifest');
  if (meta['log_pk_b64u'] !== undefined) {
    const key = typeof meta['log_pk_b64u'] === 'string' ? unb64u(meta['log_pk_b64u']) : undefined;
    if (!key || !bytesEqual(key, board.policy.logPublicKey)) throw new Error('bundle log key differs from manifest');
  }
  // Bind the filtered convenience export before restoring EVERY available board body, including derived records.
  const seen = new Set<number>();
  for (const entry of election.log) {
    const body = board.entries[entry.seq]?.body;
    if (!Number.isSafeInteger(entry.seq) || entry.seq < 1 || seen.has(entry.seq) || !body || !bytesEqual(body, jcs(entry.entry))) {
      throw new Error('election log differs from board bodies');
    }
    seen.add(entry.seq);
  }
  // Every row/header/redaction remains in board evidence. An absent body cannot supply a protocol record.
  const log: ElectionBundle['log'] = [];
  for (const entry of board.entries.slice(1)) {
    if (entry.body !== null) log.push({ seq: entry.seq, entry: parseQvJson(entry.body) });
  }
  // Metadata keys, convenience copies, receipts/anchor attachments do not become caller trust inputs.
  return { election: { ...election, log }, board, boardJson };
}

/**
 * Accepts text/bytes (QV-JSON bodies, nullable outer board body fields), checksummed .qvb tar bytes, or a parsed value.
 * Shape: `{manifest, manifest_hash, roll[], log[], board?}`; any other top-level key is an error.
 * Deep validation (signatures, proofs, schemas) is protocol.verifyElection's job; this layer only decides
 * whether the file is a bundle at all and separates the board export.
 */
export function loadBundle(input: string | Uint8Array | object): LoadResult {
  let v: unknown = input;
  if (typeof input === 'string' || input instanceof Uint8Array) {
    const len = typeof input === 'string' ? input.length : input.byteLength;
    if (len > MAX_BUNDLE_BYTES) return { ok: false, errors: [`bundle exceeds ${MAX_BUNDLE_BYTES} bytes`] };
    // A valid tar filename cannot start with JSON object syntax/whitespace. Preserve even JSON containing "ustar" at this offset.
    if (input instanceof Uint8Array && ![0x7b, 9, 10, 13, 32].includes(input[0] ?? 0) &&
        [0x75, 0x73, 0x74, 0x61, 0x72].every((byte, i) => input[257 + i] === byte)) {
      try { return { ok: true, value: loadArchive(input) }; }
      catch (e) { return { ok: false, errors: [`not a valid .qvb archive: ${e instanceof Error ? e.message : 'parse error'}`] }; }
    }
    try {
      v = parseJsonContainer(input, boardBodyNull);
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
