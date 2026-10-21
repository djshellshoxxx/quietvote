import { argon2id, argon2idAsync } from '@noble/hashes/argon2.js';

export interface Argon2idParams {
  /** Memory in KiB. */
  m: number;
  /** Iterations. */
  t: number;
  /** Lanes. */
  p: number;
  /** Output length in bytes (default 32). */
  dkLen?: number;
}

/** Argon2id (RFC 9106) via @noble/hashes (QV-19 §5.3). `@noble/*` stays confined to this package (QV-ADR-024). */
export function argon2idKdf(password: Uint8Array, salt: Uint8Array, prm: Argon2idParams): Uint8Array {
  return argon2id(password, salt, { m: prm.m, t: prm.t, p: prm.p, dkLen: prm.dkLen ?? 32, maxmem: prm.m * 1024 * 2 + (1 << 20) });
}

/** Same as {@link argon2idKdf} but yields to the event loop so the UI stays responsive. */
export async function argon2idKdfAsync(
  password: Uint8Array,
  salt: Uint8Array,
  prm: Argon2idParams,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const o: Parameters<typeof argon2idAsync>[2] = {
    m: prm.m, t: prm.t, p: prm.p, dkLen: prm.dkLen ?? 32, maxmem: prm.m * 1024 * 2 + (1 << 20), asyncTick: 10,
  };
  if (onProgress) o.onProgress = onProgress;
  return argon2idAsync(password, salt, o);
}
