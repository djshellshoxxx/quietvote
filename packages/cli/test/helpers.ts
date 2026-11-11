import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ed25519Keypair, sha256, streamRng, type Rng } from '@quietvote/crypto';
import { BoardLog, MemoryBoardStore, buildEntry, bundleToJson, exportBundle, type EntryType } from '@quietvote/board';
import { run } from '../src/main.ts';
import type { Io } from '../src/io.ts';

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const VEC = join(ROOT, 'test-vectors');
export const BIN = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));
export const TINY = join(VEC, 'v1/elections/tiny-yesno-3v/bundle.json');
export const CANARY = join(VEC, 'v1/canary/canary-election.json');
export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export const tmp = (): string => mkdtempSync(join(tmpdir(), 'qv-cli-'));
export const copyVectors = (): string => {
  const d = tmp();
  cpSync(VEC, join(d, 'tv'), { recursive: true });
  return join(d, 'tv');
};

export interface Res { code: number; out: string; err: string }

/** In-process invocation with captured output. */
export async function qv(argv: string[], o: { stdin?: Uint8Array | string; rng?: Rng; prompts?: string[] } = {}): Promise<Res> {
  let out = '';
  let err = '';
  const io: Io = {
    out: (s) => void (out += s),
    err: (s) => void (err += s),
    stdin: async () => (typeof o.stdin === 'string' ? utf8(o.stdin) : (o.stdin ?? new Uint8Array(0))),
    rng: o.rng ?? streamRng('cli-test'),
    prompt: async () => o.prompts?.shift(),
  };
  const code = await run(argv, io);
  return { code, out, err };
}

/** Real process: proves the bin entry, shebang-less invocation and process exit codes. */
export function spawnQv(argv: string[], input?: string): Res {
  const r = spawnSync(process.execPath, [BIN, ...argv], { encoding: 'utf8', input });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

export const tinyBundle = (): any => JSON.parse(readFileSync(TINY, 'utf8'));
export function writeJson(dir: string, name: string, v: unknown): string {
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(v));
  return p;
}

/** Voter i of the tiny vector election (vecgen seed "vec-tiny"). */
export function voterKeyFile(dir: string, i: number, name = `voter${i}.key`): string {
  const seed = sha256(utf8(`vec-tiny/voter${i}`));
  const kp = ed25519Keypair(seed);
  const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
  return writeJson(dir, name, { format: 'qv-voter-key/v1', public_key: hex(kp.publicKey), seed: hex(seed) });
}
export function strangerKeyFile(dir: string): string {
  const seed = sha256(utf8('stranger'));
  const kp = ed25519Keypair(seed);
  return writeJson(dir, 'stranger.key', { format: 'qv-voter-key/v1', public_key: Buffer.from(kp.publicKey).toString('hex'), seed: Buffer.from(seed).toString('hex') });
}

// ---- a small board export bound to the tiny election's coordinator and log keys
const sk = (label: string): { secretKey: Uint8Array; publicKey: Uint8Array } => ed25519Keypair(sha256(utf8(`vec-tiny/${label}`)));
export const COORD = sk('coord');
export const LOGK = sk('log');
const ORIGIN = 'quietvote/v1/abcdefghijklmnopqrstuvwxyz';

export function makeBoardJson(): any {
  const store = new MemoryBoardStore();
  const log = new BoardLog({ origin: ORIGIN, store, secretKey: LOGK.secretKey, publicKey: LOGK.publicKey, clock: () => 1_800_000_000, allowUnverifiedSignatures: true });
  let n = 0;
  for (const type of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'ballot', 'election_close', 'tally_aggregate', 'tally_result', 'audit_close'] as EntryType[]) {
    n++;
    const e = buildEntry({ origin: ORIGIN, type, secretKey: COORD.secretKey, publicKey: COORD.publicKey, nonce: sha256(utf8(`n${n}`)).slice(0, 16), createdAt: 1_800_000_000, body: utf8(`b${n}`), refs: [] });
    assert.ok(log.append(e.headerBytes, e.body).ok, type);
  }
  assert.ok(log.checkpoint().ok);
  const b = exportBundle(store, { origin: ORIGIN, createdAt: 1_800_000_000, generator: 'test', policy: { logPublicKey: LOGK.publicKey, witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } } });
  return JSON.parse(JSON.stringify(bundleToJson(b)));
}
