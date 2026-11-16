// QV-08 signed-request client framing. Pure shared signing; authorization/replay policy remains in server.
import { concatBytes, ed25519Sign, sha256, utf8 } from '@quietvote/crypto';
import { authorKeyId } from './entry.ts';
import { b64u } from './bytes.ts';

export function requestMessage(method: string, target: string, audience: string, ts: number, nonce: Uint8Array, body: Uint8Array): Uint8Array {
  return concatBytes(utf8(`QV-REQ-v1\0${method}\0${target}\0${audience}\0${ts}\0`), nonce, sha256(body));
}

/** Client helper (used by tests, the CLI and the web client). */
export function signRequest(sk: Uint8Array, pk: Uint8Array, method: string, target: string, audience: string, body: Uint8Array, ts: number, nonce: Uint8Array): string {
  const sig = ed25519Sign(sk, requestMessage(method, target, audience, ts, nonce, body));
  return `QV-Sig keyid=${b64u(authorKeyId('ed25519', pk))},ts=${ts},nonce=${b64u(nonce)},sig=${b64u(sig)}`;
}
