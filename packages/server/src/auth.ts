// Signed-request authentication (QV-08 §7): `Authorization: QV-Sig keyid=…,ts=…,nonce=…,sig=…`.
// Ed25519 over a domain-separated digest of method, target, audience, timestamp, nonce and body hash.
// Window +-120 s; (key, nonce) pairs are single-use inside the window (persisted in control.sqlite).
import { authorKeyId, b64u, unb64u } from '@quietvote/board';
import { ed25519Sign, ed25519Verify, sha256, concatBytes, utf8, ed25519Keypair } from '@quietvote/crypto';
import type { AccountKey } from './controldb.ts';
import type { Env } from './env.ts';
import { ApiError } from './problem.ts';

export const WINDOW_SEC = 120;

export interface AuthInfo {
  keyId: string;
  pk: Uint8Array;
  role: AccountKey['role'];
  orgId: string | null;
}

export function requestMessage(method: string, target: string, audience: string, ts: number, nonce: Uint8Array, body: Uint8Array): Uint8Array {
  return concatBytes(utf8(`QV-REQ-v1\0${method}\0${target}\0${audience}\0${ts}\0`), nonce, sha256(body));
}

export function keyIdOf(pk: Uint8Array): string {
  return b64u(authorKeyId('ed25519', pk));
}

/** Client helper (used by tests, the CLI and the web client). */
export function signRequest(sk: Uint8Array, pk: Uint8Array, method: string, target: string, audience: string, body: Uint8Array, ts: number, nonce: Uint8Array): string {
  const sig = ed25519Sign(sk, requestMessage(method, target, audience, ts, nonce, body));
  return `QV-Sig keyid=${keyIdOf(pk)},ts=${ts},nonce=${b64u(nonce)},sig=${b64u(sig)}`;
}

const DUMMY = ed25519Keypair(new Uint8Array(32).fill(7));

interface Parsed {
  keyid: string;
  ts: number;
  nonce: string;
  sig: Uint8Array;
}

export function parseAuthHeader(h: string | undefined): Parsed {
  const bad = (): never => {
    throw new ApiError(401, 'UNAUTHENTICATED', 'missing or malformed QV-Sig authorization');
  };
  if (h === undefined || h.length > 512 || !h.startsWith('QV-Sig ')) return bad();
  const kv = new Map<string, string>();
  for (const part of h.slice(7).split(',')) {
    const i = part.indexOf('=');
    if (i < 1) return bad();
    const k = part.slice(0, i).trim();
    if (kv.has(k)) return bad();
    kv.set(k, part.slice(i + 1).trim());
  }
  const keyid = kv.get('keyid');
  const ts = kv.get('ts');
  const nonce = kv.get('nonce');
  const sigS = kv.get('sig');
  if (kv.size !== 4 || !keyid || !ts || !nonce || !sigS) return bad();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(keyid) || !/^\d{1,12}$/.test(ts) || !/^[A-Za-z0-9_-]{16,43}$/.test(nonce) || !/^[A-Za-z0-9_-]{86}$/.test(sigS)) return bad();
  const sig = unb64u(sigS);
  if (!sig || sig.length !== 64) return bad();
  return { keyid, ts: Number(ts), nonce, sig };
}

export function audienceOf(env: Env): string {
  return `qv:${env.control.instanceId()}@${env.cfg.publicUrl}`;
}

export function authenticate(env: Env, method: string, target: string, header: string | undefined, body: Uint8Array, selfPk?: Uint8Array): AuthInfo {
  const p = parseAuthHeader(header);
  const nowSec = env.nowSec();
  if (Math.abs(nowSec - p.ts) > WINDOW_SEC) throw new ApiError(401, 'UNAUTHENTICATED', 'request timestamp outside the +-120 s window', { reason: 'STALE_TIMESTAMP' });
  const nonce = unb64u(p.nonce);
  if (!nonce || nonce.length < 12) throw new ApiError(401, 'UNAUTHENTICATED', 'bad nonce');
  const key = selfPk === undefined ? env.control.keyById(p.keyid) : undefined;
  const pk = selfPk ?? (key ? new Uint8Array(key.pk) : undefined);
  const msg = requestMessage(method, target, audienceOf(env), p.ts, nonce, body);
  // Unknown keys take the same verification path (uniform failure; no key enumeration).
  const okSig = pk !== undefined && (selfPk === undefined || keyIdOf(selfPk) === p.keyid) ? ed25519Verify(pk, p.sig, msg) : (ed25519Verify(DUMMY.publicKey, p.sig, msg), false);
  if (!okSig) throw new ApiError(401, 'BAD_SIGNATURE', 'request signature invalid or key unknown');
  // replay cache only after the signature verifies, so unauthenticated callers cannot fill it
  if (!env.control.recordNonce(p.keyid, p.nonce, (nowSec + WINDOW_SEC + 5) * 1000)) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'nonce already used', { reason: 'REPLAY' });
  }
  if (selfPk !== undefined) return { keyId: p.keyid, pk: selfPk, role: 'org_owner', orgId: null };
  return { keyId: key!.key_id, pk, role: key!.role, orgId: key!.org_id } as AuthInfo;
}

/**
 * Cheap checks that run BEFORE a large upload body is read (the full signature covers a hash of the body, so it can only be
 * verified afterwards): header shape, timestamp window and that the key is known and not revoked. Same errors as `authenticate`.
 */
export function preflightAuth(env: Env, header: string | undefined): void {
  const p = parseAuthHeader(header);
  if (Math.abs(env.nowSec() - p.ts) > WINDOW_SEC) throw new ApiError(401, 'UNAUTHENTICATED', 'request timestamp outside the +-120 s window', { reason: 'STALE_TIMESTAMP' });
  if (env.control.keyById(p.keyid) === undefined) throw new ApiError(401, 'BAD_SIGNATURE', 'request signature invalid or key unknown');
}
