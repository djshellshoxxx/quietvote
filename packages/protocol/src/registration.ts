// QV-ADR-028: the registration PoP binds the API election id, invite bearer hash and key.
import { utf8 } from '@quietvote/crypto';

export const REGISTRATION_SCHEME = 'hashed-pop-v1' as const;
export function registrationMessage(electionId: string, inviteHash: Uint8Array, publicKey: Uint8Array): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(electionId) || inviteHash.length !== 32 || publicKey.length !== 32) throw new Error('invalid registration binding');
  return new Uint8Array([...utf8(`QV-REG-v1\0${electionId}\0`), ...inviteHash, ...publicKey]);
}
