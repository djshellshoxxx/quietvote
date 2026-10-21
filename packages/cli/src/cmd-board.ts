import { bundleFromJson, verifyLog, type VerifyOptions } from '@quietvote/board';
import { authorKeyId } from '@quietvote/board';
import { hexToBytes, parseQvJson } from '@quietvote/crypto';
import { verifyBundle } from '@quietvote/verifier';
import { InputError, UsageError, needPositional, parseArgs } from './args.ts';
import { isHex, printJson, readFile } from './common.ts';
import { EXIT, type Io } from './io.ts';

export async function cmdBoardVerify(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'log-key': 'value', 'manifest-hash': 'value', 'pin-file': 'value', 'author-key': 'multi', json: 'bool' });
  const [file] = needPositional(p, 1, 'board verify <board-bundle|election-bundle>');
  const data = readFile(file!);
  let j: unknown;
  try {
    j = parseQvJson(data);
  } catch {
    throw new InputError(`${file} is not valid QV-JSON`);
  }
  const o = j as { format?: unknown; manifest?: unknown };
  const pinned = p.get('pin-file') === undefined ? undefined : new TextDecoder().decode(readFile(p.get('pin-file')!));
  const keyHex = (name: string, v: string, n: number): Uint8Array => {
    if (!isHex(v, n)) throw new UsageError(`--${name} must be ${n * 2} lower-case hex digits`);
    return hexToBytes(v);
  };

  if (o.format === undefined && o.manifest !== undefined) {
    // Election bundle with a `board` export: trust anchors come from the verified manifest.
    const r = await verifyBundle(data, { extraAuthorKeys: p.all('author-key'), ...(pinned === undefined ? {} : { pinnedCheckpoint: pinned }) });
    if (r.board === undefined) {
      io.err(`${file}: no usable board export (V4: ${r.checks.V4.notes.join('; ') || 'not run'})\n`);
      return r.verdict === 'FAIL' ? EXIT.fail : EXIT.incomplete;
    }
    if (p.has('json')) printJson(io, r.board);
    else io.out(boardText(r.board.integrity, r.board.treeSize, r.board.witnessed, r.board.redacted, r.board.failures, r.board.warnings));
    return r.board.integrity === 'FAILED' ? EXIT.fail : r.checks.V4.status === 'pass' ? EXIT.ok : EXIT.incomplete;
  }

  const b = bundleFromJson(j);
  if (!b.ok) throw new InputError(`${file} is not a board bundle: ${b.error.message}`);
  const opts: VerifyOptions = {};
  if (p.get('log-key') !== undefined) opts.logPublicKey = keyHex('log-key', p.get('log-key')!, 32);
  if (p.get('manifest-hash') !== undefined) opts.expectedManifestHash = keyHex('manifest-hash', p.get('manifest-hash')!, 32);
  if (pinned !== undefined) opts.pinned = pinned;
  const authors = p.all('author-key');
  if (authors.length > 0) {
    const keys = new Map(authors.map((a) => {
      const pk = keyHex('author-key', a, 32);
      return [Buffer.from(authorKeyId('ed25519', pk)).toString('hex'), pk] as const;
    }));
    opts.resolveAuthorKey = (h) => keys.get(Buffer.from(h.author).toString('hex'));
  }
  const v = verifyLog(b.value, opts);
  if (p.has('json')) printJson(io, v);
  else io.out(boardText(v.integrity, v.treeSize, v.witnessed, v.redacted, v.failures, v.warnings));
  return v.integrity === 'FAILED' ? EXIT.fail : v.integrity === 'PARTIAL' ? EXIT.incomplete : EXIT.ok;
}

function boardText(
  integrity: string, size: number, w: { have: number; k: number; latest: boolean }, redacted: number,
  failures: { seq?: number; rule: string; detail: string }[], warnings: string[],
): string {
  const L = [`BOARD INTEGRITY: ${integrity}`, `entries: ${size}, witnesses on latest checkpoint: ${w.have}/${w.k}${w.latest ? ' (quorum met)' : ''}, redacted bodies: ${redacted}`];
  for (const f of failures) L.push(`failure ${f.rule}${f.seq === undefined ? '' : ` @${f.seq}`}: ${f.detail}`);
  for (const x of warnings) L.push(`warning: ${x}`);
  if (integrity === 'PARTIAL') L.push('PARTIAL means some inputs were absent (author keys, redacted bodies): it is not a pass.');
  return L.join('\n') + '\n';
}
