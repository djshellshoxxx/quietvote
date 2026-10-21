import { ed25519Keypair, sha256 } from '@quietvote/crypto';
import {
  BoardLog, MemoryBoardStore, buildEntry, cosignLine, authorKeyId, toHex, utf8,
  type BuiltEntry, type EntryType, type WitnessPolicy,
} from '../src/index.ts';

/** Deterministic xorshift PRNG for tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

export function seedBytes(label: string): Uint8Array {
  return sha256(utf8(label));
}

export const ORIGIN = 'quietvote/v1/abcdefghijklmnopqrstuvwxyz';
export const NOW = 1_800_000_000;

export function kp(label: string) {
  return ed25519Keypair(seedBytes(label));
}

export const LOG = kp('log');
export const ORG = kp('org');
export const W1 = kp('w1');
export const W2 = kp('w2');
export const W3 = kp('w3');

export const POLICY: WitnessPolicy = {
  quorum: 2, noneAcknowledged: false,
  witnesses: [
    { name: 'w1', alg: 'ed25519', publicKey: W1.publicKey },
    { name: 'w2', alg: 'ed25519', publicKey: W2.publicKey },
    { name: 'w3', alg: 'ed25519', publicKey: W3.publicKey },
  ],
};

const keys = new Map<string, Uint8Array>();
export function register(k: { publicKey: Uint8Array }): void {
  keys.set(toHex(authorKeyId('ed25519', k.publicKey)), k.publicKey);
}
register(ORG);
export const resolveAuthorKey = (h: { author: Uint8Array }): Uint8Array | undefined => keys.get(toHex(h.author));

let ctr = 0;
export function mk(type: EntryType, who = ORG, body = `body-${ctr}`, refs: number[] = []): BuiltEntry {
  ctr++;
  const nonce = sha256(utf8(`nonce-${ctr}`)).slice(0, 16);
  return buildEntry({ origin: ORIGIN, type, secretKey: who.secretKey, publicKey: who.publicKey, nonce, createdAt: NOW, body: utf8(body), refs });
}

export function newLog(): { log: BoardLog; store: MemoryBoardStore } {
  const store = new MemoryBoardStore();
  const log = new BoardLog({ origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  return { log, store };
}

export function cosign(note: string, who: { secretKey: Uint8Array; publicKey: Uint8Array }, name: string, ts = NOW): string {
  const text = note.slice(0, note.indexOf('\n\n') + 1);
  return cosignLine(name, who.secretKey, who.publicKey, text, ts);
}

/** Full election-shaped log with witnessed checkpoints at each gate. */
export function fullElection(nBallots = 3) {
  const { log, store } = newLog();
  const types: EntryType[] = ['manifest', 'ceremony_start', 'joint_key', 'roll_commit'];
  const add = (t: EntryType): void => {
    const e = mk(t);
    const r = log.append(e.headerBytes, e.body);
    if (!r.ok) throw new Error(`${t}: ${r.error.message}`);
  };
  const witness = (): void => {
    const note = log.checkpoint();
    if (!note.ok) throw new Error(note.error.message);
    const size = log.size;
    log.attachCosignatures(size, [cosign(note.value, W1, 'w1'), cosign(note.value, W2, 'w2')], POLICY);
  };
  for (const t of types) add(t);
  witness();
  add('election_open');
  for (let i = 0; i < nBallots; i++) add('ballot');
  witness();
  add('election_close');
  add('tally_aggregate');
  add('tally_result');
  add('audit_close');
  witness();
  return { log, store };
}
