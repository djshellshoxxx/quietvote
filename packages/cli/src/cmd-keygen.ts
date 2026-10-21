import { lstatSync, unlinkSync, writeFileSync, type Stats } from 'node:fs';
import { ed25519Keypair } from '@quietvote/crypto';
import { InputError, UsageError, needFlag, needPositional, parseArgs, type Parsed } from './args.ts';
import { PASSPHRASE_FLAGS, getPassphrase, hex, printJson, readFile } from './common.ts';
import { EXIT, type Io } from './io.ts';
import { DEFAULT_PARAMS, PLAIN_FORMAT, keyIdOf, parseContainer, parseKeyJson, serialize, unwrapSeed, wrapSeed, type KdfParams } from './keyfile.ts';

/** Accepts 32 raw bytes or 64 hex digits (surrounding whitespace allowed). */
export function parseSeed(data: Uint8Array): Uint8Array {
  if (data.length === 32) return data;
  const t = new TextDecoder().decode(data).trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Uint8Array.from(Buffer.from(t, 'hex'));
  throw new UsageError('seed must be 32 raw bytes or 64 hex digits');
}

function intFlag(p: Parsed, name: string, dflt: number): number {
  const v = p.get(name);
  if (v === undefined) return dflt;
  if (!/^[0-9]{1,9}$/.test(v)) throw new UsageError(`--${name} must be a positive integer`);
  return Number(v);
}

/**
 * Writes a new key file with mode 0600. `--force` replaces the old file rather than writing into it: an existing file keeps its
 * old permissions and a symlink would send the seed to its target, so the old entry is removed first and never followed.
 */
function writeKeyFile(out: string, data: string, force: boolean): void {
  if (force) {
    let st: Stats | undefined;
    try {
      st = lstatSync(out);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (st !== undefined) {
      if (st.isSymbolicLink()) throw new InputError(`${out} is a symbolic link; refusing to write a key through it`);
      unlinkSync(out);
    }
  }
  writeFileSync(out, data, { mode: 0o600, flag: 'wx' });
}

export async function cmdKeygen(argv: string[], io: Io): Promise<number> {
  const p = parseArgs(argv, {
    'seed-file': 'value', 'seed-stdin': 'bool', out: 'value', force: 'bool', 'no-passphrase': 'bool', json: 'bool',
    'kdf-memory-kib': 'value', 'kdf-iterations': 'value', ...PASSPHRASE_FLAGS,
  });
  needPositional(p, 0, 'keygen (no positional arguments)');
  const out = needFlag(p, 'out');
  if (p.has('seed-file') && p.has('seed-stdin')) throw new UsageError('use either --seed-file or --seed-stdin');
  const plain = p.has('no-passphrase');
  if (plain && (p.has('passphrase-file') || p.has('passphrase-stdin'))) throw new UsageError('--no-passphrase conflicts with the passphrase options');
  const prm: KdfParams = { m: intFlag(p, 'kdf-memory-kib', DEFAULT_PARAMS.m), t: intFlag(p, 'kdf-iterations', DEFAULT_PARAMS.t), p: DEFAULT_PARAMS.p };
  const seed = p.has('seed-file') ? parseSeed(readFile(p.get('seed-file')!)) : p.has('seed-stdin') ? parseSeed(await io.stdin()) : io.rng.bytes(32);
  const kp = ed25519Keypair(seed);
  let file: string;
  if (plain) file = JSON.stringify({ format: PLAIN_FORMAT, public_key: hex(kp.publicKey), seed: hex(seed) }) + '\n';
  else {
    const pass = await getPassphrase(p, io, 'passphrase for the new key: ', true, p.has('seed-stdin'));
    if (pass === undefined) throw new UsageError('a passphrase is required: use --passphrase-file or --passphrase-stdin, run on a terminal, or pass --no-passphrase to write an unprotected key');
    file = serialize(await wrapSeed(seed, pass, io.rng, prm));
  }
  try {
    writeKeyFile(out, file, p.has('force'));
  } catch (e) {
    if (e instanceof InputError) {
      io.err(`${e.message}\n`);
      return EXIT.input;
    }
    const code = (e as NodeJS.ErrnoException).code;
    io.err(code === 'EEXIST' ? `${out} exists; use --force to overwrite\n` : `cannot write ${out}: ${code ?? 'error'}\n`);
    return EXIT.input;
  }
  if (plain) io.err('warning: the key file is NOT passphrase-protected; it is written with mode 0600. Store it on an encrypted disk and never share it.\n');
  if (p.has('json')) printJson(io, { public_key: hex(kp.publicKey), key_id: keyIdOf(kp.publicKey), key_file: out, protected: !plain });
  else io.out(`voter public key: ${hex(kp.publicKey)}\nkey id: ${keyIdOf(kp.publicKey)}\nkey file: ${out}${plain ? ' (unprotected)' : ' (QVKEY1, argon2id)'}\n`);
  return EXIT.ok;
}

/** Loads a protected (QVKEY1) or unprotected voter key; the passphrase is asked only for the protected form. */
export async function loadVoterKey(path: string, p: Parsed, io: Io): Promise<{ seed: Uint8Array; publicKey: Uint8Array }> {
  const j = parseKeyJson(new TextDecoder().decode(readFile(path))) as { format?: unknown; public_key?: unknown; seed?: unknown; kdf?: unknown };
  if (typeof j === 'object' && j !== null && j.kdf !== undefined) {
    const c = parseContainer(j);
    const pass = await getPassphrase(p, io, `passphrase for key ${c.keyId}: `, false, false);
    if (pass === undefined) throw new UsageError('this key file is passphrase-protected: use --passphrase-file or --passphrase-stdin, or run on a terminal');
    return unwrapSeed(c, pass);
  }
  if (j.format !== PLAIN_FORMAT || typeof j.seed !== 'string' || !/^[0-9a-f]{64}$/.test(j.seed)) throw new UsageError(`${path} is not a voter key file`);
  const seed = Uint8Array.from(Buffer.from(j.seed, 'hex'));
  const kp = ed25519Keypair(seed);
  if (j.public_key !== hex(kp.publicKey)) throw new InputError(`${path}: public_key does not match seed`);
  return { seed, publicKey: kp.publicKey };
}
