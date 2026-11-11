// Client side of QV-08 §7 signed requests: `Authorization: QV-Sig keyid=…,ts=…,nonce=…,sig=…`.
// Mirrors packages/server/src/auth.ts (`requestMessage`, `signRequest`). The web package must not import the server package,
// so the byte layout is repeated here and pinned by test/api-signed.test.ts.
import { authorKeyId } from '@quietvote/board';
import { concatBytes, sha256, utf8 } from '@quietvote/crypto';
import { b64uEncode } from '../util/hex.ts';

/** Organizer signing key. Only the signature is needed here; the secret stays in the signer (key/signer.ts). */
export interface RequestSigner {
  readonly publicKey: Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export interface RequestSigning {
  signer: RequestSigner;
  /** `qv:<instance_id>@<publicUrl>` as the server computes it (server auth.ts `audienceOf`). */
  audience: string;
  /** Unix seconds. Defaults to the wall clock. */
  now?: () => number;
  /** At least 12 random bytes. Defaults to crypto.getRandomValues. */
  nonce?: () => Uint8Array;
}

/** Signed bytes: `QV-REQ-v1\0 method \0 target \0 audience \0 ts \0 || nonce || SHA-256(body)`. */
export function requestMessage(method: string, target: string, audience: string, ts: number, nonce: Uint8Array, body: Uint8Array): Uint8Array {
  return concatBytes(utf8(`QV-REQ-v1\0${method}\0${target}\0${audience}\0${ts}\0`), nonce, sha256(body));
}

export function keyIdOf(publicKey: Uint8Array): string {
  return b64uEncode(authorKeyId('ed25519', publicKey));
}

/** Builds the Authorization header value. `target` is the raw request target (path + query) exactly as sent. */
export async function qvSigHeader(cfg: RequestSigning, method: string, target: string, body: Uint8Array): Promise<string> {
  const ts = (cfg.now ?? (() => Math.floor(Date.now() / 1000)))();
  const nonce = (cfg.nonce ?? defaultNonce)();
  const sig = await cfg.signer.sign(requestMessage(method, target, cfg.audience, ts, nonce, body));
  return `QV-Sig keyid=${keyIdOf(cfg.signer.publicKey)},ts=${ts},nonce=${b64uEncode(nonce)},sig=${b64uEncode(sig)}`;
}

function defaultNonce(): Uint8Array {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return b;
}
