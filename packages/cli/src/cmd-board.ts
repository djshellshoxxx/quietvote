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
  // Every hex flag is checked before a bundle kind is chosen, so both kinds reject malformed input the same way (exit 2).
  const logKey = p.get('log-key') === undefined ? undefined : keyHex('log-key', p.get('log-key')!, 32);
  const manifestPin = p.get('manifest-hash') === undefined ? undefined : keyHex('manifest-hash', p.get('manifest-hash')!, 32);
  const authorKeys = p.all('author-key').map((a) => keyHex('author-key', a, 32));

  if (o.format === undefined && o.manifest !== undefined) {
    // Election bundle with a `board` export: trust anchors come from the verified manifest. The pins the caller gives are
    // checked against that manifest: a different manifest hash or log key is a verification failure, not a partial result.
    const boundLogKey = boundLogKeyOf(o.manifest);
    const unverifiable = (reason: string, failed: boolean): number => {
      io.err(`${file}: ${reason}\n`);
      if (p.has('json')) printJson(io, { integrity: failed ? 'FAILED' : 'INCOMPLETE', reason });
      return failed ? EXIT.fail : EXIT.incomplete;
    };
    if (p.get('log-key') !== undefined && boundLogKey !== p.get('log-key')) {
      return unverifiable('--log-key does not match the log key in the bundle manifest (bb.log_pk)', true);
    }
    const r = await verifyBundle(data, {
      extraAuthorKeys: p.all('author-key'),
      ...(p.get('manifest-hash') === undefined ? {} : { pinnedManifestHash: p.get('manifest-hash')! }),
      ...(pinned === undefined ? {} : { pinnedCheckpoint: pinned }),
    });
    // A pinned hash that the manifest does not meet means no board verdict applies to the expected election.
    if (p.get('manifest-hash') !== undefined && r.checks.V1.status !== 'pass') {
      return unverifiable(`--manifest-hash does not match the bundle manifest (V1 ${r.checks.V1.status})`, true);
    }
    if (r.board === undefined) {
      return unverifiable(`no usable board export (V4: ${r.checks.V4.notes.join('; ') || 'not run'})`, r.verdict === 'FAIL');
    }
    if (p.has('json')) printJson(io, r.board);
    else io.out(boardText(r.board.integrity, r.board.treeSize, r.board.witnessed, r.board.redacted, r.board.failures, r.board.warnings));
    return r.board.integrity === 'FAILED' ? EXIT.fail : r.checks.V4.status === 'pass' ? EXIT.ok : EXIT.incomplete;
  }

  const b = bundleFromJson(j);
  if (!b.ok) throw new InputError(`${file} is not a board bundle: ${b.error.message}`);
  const opts: VerifyOptions = {};
  if (logKey !== undefined) opts.logPublicKey = logKey;
  if (manifestPin !== undefined) opts.expectedManifestHash = manifestPin;
  if (pinned !== undefined) opts.pinned = pinned;
  if (authorKeys.length > 0) {
    const keys = new Map(authorKeys.map((pk) => {
      return [Buffer.from(authorKeyId('ed25519', pk)).toString('hex'), pk] as const;
    }));
    opts.resolveAuthorKey = (h) => keys.get(Buffer.from(h.author).toString('hex'));
  }
  const v = verifyLog(b.value, opts);
  if (p.has('json')) printJson(io, v);
  else io.out(boardText(v.integrity, v.treeSize, v.witnessed, v.redacted, v.failures, v.warnings));
  return v.integrity === 'FAILED' ? EXIT.fail : v.integrity === 'PARTIAL' ? EXIT.incomplete : EXIT.ok;
}

/** The log key an election bundle's manifest binds (`bb.log_pk`), or undefined when the manifest does not carry one. */
function boundLogKeyOf(manifest: unknown): string | undefined {
  const k = (manifest as { body?: { bb?: { log_pk?: unknown } } } | null)?.body?.bb?.log_pk;
  return typeof k === 'string' ? k : undefined;
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
