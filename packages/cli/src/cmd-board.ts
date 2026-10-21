import { bundleFromJson, verifyLog, type VerifyOptions, type WitnessPolicy } from '@quietvote/board';
import { authorKeyId } from '@quietvote/board';
import { hexToBytes, parseQvJson } from '@quietvote/crypto';
import { verifyBundle } from '@quietvote/verifier';
import { InputError, UsageError, needPositional, parseArgs } from './args.ts';
import { isHex, printJson, readFile, readJson } from './common.ts';
import { EXIT, type Io } from './io.ts';

export async function cmdBoardVerify(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, { 'log-key': 'value', 'manifest-hash': 'value', 'pin-file': 'value', 'witness-policy': 'value', 'author-key': 'multi', json: 'bool' });
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
  if (p.get('witness-policy') !== undefined) opts.witnessPolicy = loadWitnessPolicy(p.get('witness-policy')!);
  if (authorKeys.length > 0) {
    const keys = new Map(authorKeys.map((pk) => {
      return [Buffer.from(authorKeyId('ed25519', pk)).toString('hex'), pk] as const;
    }));
    opts.resolveAuthorKey = (h) => keys.get(Buffer.from(h.author).toString('hex'));
  }
  const v = verifyLog(b.value, opts);
  // The log key inside a bundle is attacker-controlled: whoever forged the log also ships the key that verifies it.
  // Without --log-key (from the manifest-verified source) a clean result is only PARTIAL, never a pass.
  if (logKey === undefined && v.integrity === 'VERIFIED') {
    v.integrity = 'PARTIAL';
    if (!v.warnings.some((w) => /self-attested/.test(w))) v.warnings.push('log key taken from bundle (self-attested); pass --log-key');
  }
  if (p.has('json')) printJson(io, v);
  else io.out(boardText(v.integrity, v.treeSize, v.witnessed, v.redacted, v.failures, v.warnings));
  return v.integrity === 'FAILED' ? EXIT.fail : v.integrity === 'PARTIAL' ? EXIT.incomplete : EXIT.ok;
}

/** Out-of-band witness policy file: {quorum, none_acknowledged, witnesses:[{name, alg, pk_b64}]}; anything malformed is an input error. */
function loadWitnessPolicy(path: string): WitnessPolicy {
  const j = readJson(path) as { quorum?: unknown; none_acknowledged?: unknown; witnesses?: unknown } | null;
  const bad = (m: string): never => { throw new InputError(`--witness-policy ${path}: ${m}`); };
  if (typeof j !== 'object' || j === null || Array.isArray(j)) return bad('not a JSON object');
  if (typeof j.quorum !== 'number' || !Number.isSafeInteger(j.quorum) || j.quorum < 0) return bad('quorum must be a non-negative integer');
  if (typeof j.none_acknowledged !== 'boolean') return bad('none_acknowledged must be a boolean');
  if (!Array.isArray(j.witnesses)) return bad('witnesses must be an array');
  const witnesses = j.witnesses.map((w: unknown): WitnessPolicy['witnesses'][number] => {
    const x = w as { name?: unknown; alg?: unknown; pk_b64?: unknown } | null;
    if (typeof x !== 'object' || x === null || typeof x.name !== 'string' || (x.alg !== 'ed25519' && x.alg !== 'mldsa44') || typeof x.pk_b64 !== 'string') return bad('malformed witness entry');
    const pk = Buffer.from(x.pk_b64, 'base64');
    if (pk.toString('base64') !== x.pk_b64) return bad('witness pk_b64 is not canonical base64');
    return { name: x.name, alg: x.alg, publicKey: new Uint8Array(pk) };
  });
  return { quorum: j.quorum, noneAcknowledged: j.none_acknowledged, witnesses };
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
