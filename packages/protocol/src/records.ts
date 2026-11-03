import { bytesToHex, ed25519Sign, ed25519Verify, h256, hexToBytes, jcs, utf8 } from '@quietvote/crypto';
import type { MultiSignedRecord, Sig, SignedRecord } from './types.ts';

/** sig-record digest (QV-16 §5.4): H256("sig-record"; scope_hash, record_type, JCS(body)). */
export function recordDigest(scope: Uint8Array, type: string, body: unknown): Uint8Array {
  return h256('sig-record', scope, utf8(type), jcs(body));
}

export function signRecordRaw(sk: Uint8Array, pk: Uint8Array, scope: Uint8Array, type: string, body: unknown): Sig {
  return { key: bytesToHex(pk), sig: bytesToHex(ed25519Sign(sk, recordDigest(scope, type, body))) };
}

export function signRecord<B extends { type: string }>(sk: Uint8Array, pk: Uint8Array, scope: Uint8Array, body: B): SignedRecord<B> {
  return { body, sig: signRecordRaw(sk, pk, scope, body.type, body) };
}

export function verifySig(scope: Uint8Array, type: string, body: unknown, sig: Sig, expectedKey?: string): boolean {
  try {
    if (expectedKey !== undefined && sig.key !== expectedKey) return false;
    return ed25519Verify(hexToBytes(sig.key, 32), hexToBytes(sig.sig, 64), recordDigest(scope, type, body));
  } catch {
    return false;
  }
}

/** m-of-k coordinator verification: at least m distinct allowed keys with valid signatures. */
export function verifyMultiSig(
  scope: Uint8Array,
  rec: MultiSignedRecord<{ type: string }>,
  allowed: readonly string[],
  m: number,
): boolean {
  const good = new Set<string>();
  for (const s of rec.sigs) {
    if (allowed.includes(s.key) && verifySig(scope, rec.body.type, rec.body, s)) good.add(s.key);
  }
  return good.size >= m;
}
