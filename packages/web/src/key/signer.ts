// Session signing key (QV-19 §5.2): non-extractable WebCrypto Ed25519 key when available, noble closure otherwise.
import { bytesToHex, ed25519Keypair, ed25519Sign, h256, sha256 } from '@quietvote/crypto';
import { wipe } from '../util/hex.ts';

export interface Signer {
  readonly publicKey: Uint8Array;
  readonly kind: 'webcrypto' | 'noble';
  /** Hash-derived nonce key for hedged ballot randomness (QV-16 §5.11). A derived value, not the signing key. */
  readonly nonceKey: Uint8Array;
  /** Present for kind === 'webcrypto' (tests assert it is non-extractable). */
  readonly cryptoKey?: CryptoKey;
  sign(message: Uint8Array): Promise<Uint8Array>;
  /** Drops references; the signer is unusable afterwards. */
  lock(): void;
  readonly locked: boolean;
}

const PKCS8_PREFIX = Uint8Array.of(0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20);

async function tryWebCrypto(seed: Uint8Array, subtle: SubtleCrypto): Promise<CryptoKey | undefined> {
  try {
    const pkcs8 = new Uint8Array(48);
    pkcs8.set(PKCS8_PREFIX, 0);
    pkcs8.set(seed, 16);
    const key = await subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'Ed25519' }, false, ['sign']);
    wipe(pkcs8);
    return key;
  } catch {
    return undefined;
  }
}

/**
 * Builds a signer from an unwrapped seed and **zeroises the seed buffer**. With WebCrypto the seed is not retained at all;
 * on the noble fallback it lives in a closure until `lock()`.
 */
export async function createSigner(seed: Uint8Array, opts: { subtle?: SubtleCrypto | undefined; preferWebCrypto?: boolean } = {}): Promise<Signer> {
  const subtle = opts.subtle ?? globalThis.crypto?.subtle;
  const publicKey = ed25519Keypair(seed).publicKey;
  const nonceKey = h256('voter-nonce-key', seed);
  const wc = opts.preferWebCrypto === false || subtle === undefined ? undefined : await tryWebCrypto(seed, subtle);
  let held: Uint8Array | undefined = wc === undefined ? seed.slice() : undefined;
  let locked = false;
  let ck: CryptoKey | undefined = wc;
  wipe(seed);
  const self: Signer = {
    publicKey,
    kind: wc === undefined ? 'noble' : 'webcrypto',
    nonceKey,
    ...(wc === undefined ? {} : { cryptoKey: wc }),
    async sign(message: Uint8Array): Promise<Uint8Array> {
      if (locked) throw new Error('signer is locked');
      if (ck !== undefined && subtle !== undefined) return new Uint8Array(await subtle.sign({ name: 'Ed25519' }, ck, message as BufferSource));
      return ed25519Sign(held!, message);
    },
    lock(): void {
      locked = true;
      wipe(held, nonceKey);
      held = undefined;
      ck = undefined;
    },
    get locked(): boolean {
      return locked;
    },
  };
  return self;
}

/** Short stable identifier of a public key for logs-free UI use. */
export function pkHex(pk: Uint8Array): string {
  return bytesToHex(pk);
}
export const pkDigest = (pk: Uint8Array): Uint8Array => sha256(pk);
