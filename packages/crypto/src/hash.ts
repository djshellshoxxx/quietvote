import { sha256 as nobleSha256, sha512 as nobleSha512 } from '@noble/hashes/sha2.js';

export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

export function sha512(data: Uint8Array): Uint8Array {
  return nobleSha512(data);
}
