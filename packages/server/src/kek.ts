// Instance KEK and per-election DEK envelope (QV-28 §9). AES-256-GCM via node:crypto.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

/**
 * True when control.sqlite already holds data wrapped under the KEK: election DEK envelopes or webhook URL/secret blobs.
 * A missing control.sqlite (or one with no such rows) means a fresh data directory.
 */
function hasKekWrappedData(dataDir: string): boolean {
  const path = join(dataDir, 'control.sqlite');
  if (!existsSync(path)) return false;
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db
      .prepare('SELECT (EXISTS (SELECT 1 FROM election_registry WHERE dek_wrapped IS NOT NULL) OR EXISTS (SELECT 1 FROM webhook)) AS has')
      .get() as { has: number } | undefined;
    return row?.has === 1;
  } finally {
    db.close();
  }
}

export function loadOrCreateKek(dataDir: string): Buffer {
  const dir = join(dataDir, 'kek');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = join(dir, 'kek.bin');
  if (!existsSync(f)) {
    // Refuse to replace a missing KEK: wrapped data could never be unwrapped again. Never print key material here.
    if (hasKekWrappedData(dataDir)) {
      throw new Error(`KEK file missing at ${f} but wrapped data exists in ${dataDir}; refusing to generate a new KEK. Restore the original kek.bin.`);
    }
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
