// Instance KEK and per-election DEK envelope (QV-28 §9). AES-256-GCM via node:crypto.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadOrCreateKek(dataDir: string): Buffer {
  const dir = join(dataDir, 'kek');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = join(dir, 'kek.bin');
  if (!existsSync(f)) {
    writeFileSync(f, randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  chmodSync(f, 0o600);
  const k = readFileSync(f);
  if (k.length !== 32) throw new Error('KEK file must be 32 bytes');
  return k;
}

/** nonce(12) || ciphertext || tag(16) */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): Uint8Array {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return new Uint8Array(Buffer.concat([iv, ct, c.getAuthTag()]));
}

export function open(key: Uint8Array, sealed: Uint8Array, aad: string): Uint8Array {
  if (sealed.length < 28) throw new Error('sealed blob too short');
  const b = Buffer.from(sealed);
  const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(b.length - 16));
  return new Uint8Array(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]));
}
