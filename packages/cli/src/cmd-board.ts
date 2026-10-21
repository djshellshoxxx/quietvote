import { authorKeyId, bundleFromJson, unb64, verifyLog, type VerifyOptions, type WitnessPolicy } from '@quietvote/board';
import { hexToBytes, parseQvJson } from '@quietvote/crypto';
import { verifyBundle } from '@quietvote/verifier';
import { InputError, UsageError, needPositional, parseArgs } from './args.ts';
import { isHex, printJson, readFile } from './common.ts';
import { EXIT, type Io } from './io.ts';

export async function cmdBoardVerify(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'log-key': 'value', 'witness-policy': 'value', 'manifest-hash': 'value', 'pin-file': 'value', 'author-key': 'multi', json: 'bool' });
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
  if (p.get('witness-policy') !== undefined) opts.witnessPolicy = loadWitnessPolicy(p.get('witness-policy')!);
  const authors = p.all('author-key');
  if (authors.length > 0) {
    const keys = new Map(authors.map((a) => {
      const pk = keyHex('author-key', a, 32);
      return [Buffer.from(authorKeyId('ed25519', pk)).toString('hex'), pk] as const;
    }));
    opts.resolveAuthorKey = (h) => keys.get(Buffer.from(h.author).toString('hex'));
  }
  let v = verifyLog(b.value, opts);
  // The log key inside the bundle is the bundle author's own claim: whoever holds a log key can re-sign any history under it.
  // A pass needs the key from the verified manifest (or the organizers), so without --log-key nothing better than PARTIAL is reported.
  if (v.integrity === 'VERIFIED' && opts.logPublicKey === undefined) {
    v = { ...v, integrity: 'PARTIAL', warnings: [...v.warnings, 'not a pass: the log key was taken from the bundle itself; pass --log-key (from the verified manifest)'] };
  }
  if (p.has('json')) printJson(io, v);
  else io.out(boardText(v.integrity, v.treeSize, v.witnessed, v.redacted, v.failures, v.warnings));
  return v.integrity === 'FAILED' ? EXIT.fail : v.integrity === 'PARTIAL' ? EXIT.incomplete : EXIT.ok;
}

/**
 * Out-of-band witness policy, same shape as the bundle's `policy.witness_policy`:
 * { quorum, none_acknowledged, witnesses: [{ name, alg: "ed25519"|"mldsa44", pk_b64 }] }. Anything else is an input error.
 */
export function loadWitnessPolicy(path: string): WitnessPolicy {
  let j: unknown;
  try {
    j = parseQvJson(readFile(path));
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError(`${path} is not valid QV-JSON`);
  }
  const bad = (): never => {
    throw new InputError(`${path} is not a witness policy`);
  };
  const o = j as { quorum?: unknown; none_acknowledged?: unknown; witnesses?: unknown } | null;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return bad();
  if (typeof o.quorum !== 'number' || !Number.isSafeInteger(o.quorum) || o.quorum < 0 || typeof o.none_acknowledged !== 'boolean' || !Array.isArray(o.witnesses)) return bad();
  const witnesses = o.witnesses.map((w: unknown) => {
    const x = w as { name?: unknown; alg?: unknown; pk_b64?: unknown } | null;
    if (typeof x !== 'object' || x === null || typeof x.name !== 'string' || (x.alg !== 'ed25519' && x.alg !== 'mldsa44') || typeof x.pk_b64 !== 'string') return bad();
    const pk = unb64(x.pk_b64);
    if (!pk || pk.length === 0) return bad();
    return { name: x.name, alg: x.alg as 'ed25519' | 'mldsa44', publicKey: pk };
  });
  return { quorum: o.quorum, noneAcknowledged: o.none_acknowledged, witnesses };
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
