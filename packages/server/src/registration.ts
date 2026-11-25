// The on-wire hash is a bearer credential. Keep a distinct verifier at rest.
import { b64u, unb64u } from '@quietvote/board';
import { sha256, utf8 } from '@quietvote/crypto';
export type RegistrationScheme = 'legacy-raw-v1' | 'hashed-pop-v1';
export function canonicalB64u(text: string, size: number): Uint8Array | undefined {
  const value = unb64u(text);
  return value?.length === size && b64u(value) === text ? value : undefined;
}
export function storedInviteHash(bearerHash: Uint8Array): Uint8Array {
  if (bearerHash.length !== 32) throw new Error('invalid invite hash');
  return sha256(new Uint8Array([...utf8('QV-INVITE-HASH-v1\0'), ...bearerHash]));
}
