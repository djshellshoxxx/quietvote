// C2SP tlog-checkpoint / signed-note / tlog-cosignature (QV-18 §8, §9.3).
import { ed25519Sign, ed25519Verify, sha256 } from '@quietvote/crypto';
import { b64, bytesEqual, concat, u64be, unb64, utf8 } from './bytes.ts';
import { err, ok, type Result } from './errors.ts';

const DASH = '— ';
const ALG_ED25519 = 0x01;
const ALG_COSIG_ED25519 = 0x04;

export interface SigLine {
  name: string;
  keyHash: Uint8Array;
  sig: Uint8Array;
}

export interface Checkpoint {
  origin: string;
  size: number;
  root: Uint8Array;
  /** The signed text: "origin\nsize\nroot_b64\n". */
  text: string;
  lines: SigLine[];
}

export function checkpointText(origin: string, size: number, root: Uint8Array): string {
  return `${origin}\n${size}\n${b64(root)}\n`;
}

/** SHA-256(name || "\n" || type || pk)[:4] */
export function keyHash(name: string, type: number, pk: Uint8Array): Uint8Array {
  return sha256(concat(utf8(name + '\n'), new Uint8Array([type]), pk)).slice(0, 4);
}

function sigLine(name: string, payload: Uint8Array): string {
  return `${DASH}${name} ${b64(payload)}\n`;
}

/** Sign a checkpoint with the log key; returns the full note. */
export function signCheckpoint(origin: string, size: number, root: Uint8Array, secretKey: Uint8Array, publicKey: Uint8Array): string {
  const text = checkpointText(origin, size, root);
  const sig = ed25519Sign(secretKey, utf8(text));
  return `${text}\n${sigLine(origin, concat(keyHash(origin, ALG_ED25519, publicKey), sig))}`;
}

function cosigMessage(ts: number, text: string): Uint8Array {
  return utf8(`cosignature/v1\ntime ${ts}\n${text}`);
}

/** Produce a witness cosignature line (type 0x04) for a note's text. */
export function cosignLine(witnessName: string, secretKey: Uint8Array, publicKey: Uint8Array, text: string, timestamp: number): string {
  const sig = ed25519Sign(secretKey, cosigMessage(timestamp, text));
  return sigLine(witnessName, concat(keyHash(witnessName, ALG_COSIG_ED25519, publicKey), u64be(timestamp), sig));
}

/** Append cosignature line(s) to a stored note. */
export function addCosignatures(note: string, lines: readonly string[]): string {
  return note + lines.join('');
}

const NAME_RE = /^[^\s+]+$/;

/** Strict parse: exactly 3 text lines (no extensions), canonical size and root, >=1 signature line. */
export function parseCheckpoint(note: string): Result<Checkpoint> {
  const cut = note.indexOf('\n\n');
  if (cut < 0 || !note.endsWith('\n')) return err('QV_BOARD_BAD_CHECKPOINT', 'malformed note');
  const text = note.slice(0, cut + 1);
  const sigs = note.slice(cut + 2);
  const t = text.split('\n');
  if (t.length !== 4 || t[3] !== '') return err('QV_BOARD_BAD_CHECKPOINT', 'checkpoint must have exactly 3 text lines');
  const [origin, sizeS, rootS] = t as [string, string, string, string];
  if (!/^(0|[1-9][0-9]{0,15})$/.test(sizeS)) return err('QV_BOARD_BAD_CHECKPOINT', 'bad size');
  const size = Number(sizeS);
  const root = unb64(rootS);
  if (!Number.isSafeInteger(size) || !root || root.length !== 32) return err('QV_BOARD_BAD_CHECKPOINT', 'bad root');
  if (origin.length === 0) return err('QV_BOARD_BAD_CHECKPOINT', 'empty origin');
  const lines: SigLine[] = [];
  const parts = sigs.split('\n');
  if (parts.pop() !== '' || parts.length === 0) return err('QV_BOARD_BAD_CHECKPOINT', 'no signature lines');
  for (const p of parts) {
    if (!p.startsWith(DASH)) return err('QV_BOARD_BAD_CHECKPOINT', 'bad signature line prefix');
    const rest = p.slice(DASH.length);
    const sp = rest.lastIndexOf(' ');
    const name = rest.slice(0, sp);
    const raw = sp < 0 ? undefined : unb64(rest.slice(sp + 1));
    if (!raw || raw.length < 5 || !NAME_RE.test(name)) return err('QV_BOARD_BAD_CHECKPOINT', 'bad signature line');
    lines.push({ name, keyHash: raw.slice(0, 4), sig: raw.slice(4) });
  }
  return ok({ origin, size, root, text, lines });
}

/** True iff a valid log-key signature over the text is present. */
export function verifyLogSignature(cp: Checkpoint, logPublicKey: Uint8Array): boolean {
  const kh = keyHash(cp.origin, ALG_ED25519, logPublicKey);
  return cp.lines.some(
    (l) => l.name === cp.origin && bytesEqual(l.keyHash, kh) && l.sig.length === 64 && ed25519Verify(logPublicKey, l.sig, utf8(cp.text)),
  );
}

export interface PolicyWitness {
  name: string;
  /** 'ed25519' (tlog-cosignature 0x04) is verified; 'mldsa44' (0x06) is recognised but unsupported. */
  alg: 'ed25519' | 'mldsa44';
  publicKey: Uint8Array;
}

export interface WitnessPolicy {
  witnesses: PolicyWitness[];
  quorum: number;
  noneAcknowledged: boolean;
}

export interface WitnessStatus {
  /** policy witness name -> cosignature timestamp, for valid cosignatures (distinct). */
  valid: Map<string, number>;
  /** names of lines that did not verify or are not in the policy. */
  nonPolicy: string[];
  unsupported: string[];
  witnessed: boolean;
}

/** Counts valid cosignatures from distinct policy witnesses. `maxTimestamp` rejects future-dated cosigs (online use). */
export function witnessStatus(cp: Checkpoint, policy: WitnessPolicy, maxTimestamp?: number): WitnessStatus {
  const valid = new Map<string, number>();
  const nonPolicy: string[] = [];
  const unsupported: string[] = [];
  const usedKeys = new Set<string>(); // one key = one witness, even if a policy lists it under several names
  for (const l of cp.lines) {
    if (l.name === cp.origin) continue;
    const w = policy.witnesses.find((x) => x.name === l.name);
    if (!w) {
      nonPolicy.push(l.name);
      continue;
    }
    if (w.alg !== 'ed25519') {
      unsupported.push(l.name);
      continue;
    }
    if (valid.has(w.name) || l.sig.length !== 72 || !bytesEqual(l.keyHash, keyHash(w.name, ALG_COSIG_ED25519, w.publicKey))) {
      if (!valid.has(w.name)) nonPolicy.push(l.name);
      continue;
    }
    const tsBytes = l.sig.slice(0, 8);
    const ts = Number(new DataView(tsBytes.buffer, tsBytes.byteOffset, 8).getBigUint64(0));
    const okSig = Number.isSafeInteger(ts) && ed25519Verify(w.publicKey, l.sig.slice(8), cosigMessage(ts, cp.text));
    if (!okSig || (maxTimestamp !== undefined && ts > maxTimestamp)) {
      nonPolicy.push(l.name);
      continue;
    }
    const kid = b64(w.publicKey);
    if (usedKeys.has(kid)) {
      nonPolicy.push(l.name);
      continue;
    }
    usedKeys.add(kid);
    valid.set(w.name, ts);
  }
  const witnessed = policy.quorum >= 1 && valid.size >= policy.quorum;
  return { valid, nonPolicy, unsupported, witnessed };
}
