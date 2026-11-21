"""HKDF-SHA-256 (RFC 5869) and AES-256-GCM decryption (FIPS 197, NIST SP 800-38D).

Pure Python, variable time; used only to adjudicate DKG complaints (QV-16 §5.7.5/§5.7.6),
where the DH value S has been published and therefore the share key is public.
"""

from __future__ import annotations

import hashlib
import hmac

# ------------------------------------------------------------------ HKDF (RFC 5869)


def hkdf_sha256(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    if not salt:
        salt = b"\x00" * 32
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    out, t, i = b"", b"", 1
    while len(out) < length:
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        out += t
        i += 1
    return out[:length]


# ------------------------------------------------------------------ AES (FIPS 197)


def _gf_mul8(a: int, b: int) -> int:
    r = 0
    while b:
        if b & 1:
            r ^= a
        a <<= 1
        if a & 0x100:
            a ^= 0x11B
        b >>= 1
    return r


def _build_sbox() -> list[int]:
    # Multiplicative inverse in GF(2^8) followed by the FIPS 197 §5.1.1 affine transform.
    # Inverses via exp/log tables for the generator 0x03 of GF(2^8)*.
    exp, log = [0] * 255, [0] * 256
    x = 1
    for i in range(255):
        exp[i], log[x] = x, i
        x = _gf_mul8(x, 3)
    inv = [0] + [exp[(255 - log[a]) % 255] for a in range(1, 256)]
    sbox = []
    for a in range(256):
        b = inv[a]
        s = b
        for k in range(1, 5):
            s ^= ((b << k) | (b >> (8 - k))) & 0xFF
        sbox.append(s ^ 0x63)
    return sbox


SBOX = _build_sbox()
assert SBOX[0x00] == 0x63 and SBOX[0x53] == 0xED  # FIPS 197 §5.1.1 example


def _xtime(a: int) -> int:
    a <<= 1
    return (a ^ 0x1B) & 0xFF if a & 0x100 else a


def _expand_key_256(key: bytes) -> list[list[int]]:
    assert len(key) == 32
    nk, nr = 8, 14
    w = [list(key[4 * i : 4 * i + 4]) for i in range(nk)]
    rcon = 1
    for i in range(nk, 4 * (nr + 1)):
        temp = list(w[i - 1])
        if i % nk == 0:
            temp = temp[1:] + temp[:1]
            temp = [SBOX[x] for x in temp]
            temp[0] ^= rcon
            rcon = _xtime(rcon)
        elif i % nk == 4:
            temp = [SBOX[x] for x in temp]
        w.append([a ^ b for a, b in zip(w[i - nk], temp)])
    return [sum(w[4 * r : 4 * r + 4], []) for r in range(nr + 1)]


class AES256:
    def __init__(self, key: bytes):
        self.rk = _expand_key_256(key)

    def encrypt_block(self, block: bytes) -> bytes:
        s = [b ^ k for b, k in zip(block, self.rk[0])]
        for rnd in range(1, 15):
            s = [SBOX[x] for x in s]  # SubBytes
            s = [s[r + 4 * ((c + r) % 4)] for c in range(4) for r in range(4)]  # ShiftRows
            if rnd != 14:  # MixColumns
                t = []
                for c in range(4):
                    a = s[4 * c : 4 * c + 4]
                    x = a[0] ^ a[1] ^ a[2] ^ a[3]
                    t += [a[i] ^ x ^ _xtime(a[i] ^ a[(i + 1) % 4]) for i in range(4)]
                s = t
            s = [b ^ k for b, k in zip(s, self.rk[rnd])]
        return bytes(s)


# ------------------------------------------------------------------ GCM (SP 800-38D)

_R = 0xE1 << 120


def _gf128_mul(x: int, y: int) -> int:
    z, v = 0, y
    for i in range(127, -1, -1):
        if (x >> i) & 1:
            z ^= v
        v = (v >> 1) ^ _R if v & 1 else v >> 1
    return z


def _ghash(h: int, aad: bytes, ct: bytes) -> int:
    def blocks(data: bytes):
        for i in range(0, len(data), 16):
            yield data[i : i + 16].ljust(16, b"\x00")

    y = 0
    for blk in list(blocks(aad)) + list(blocks(ct)):
        y = _gf128_mul(y ^ int.from_bytes(blk, "big"), h)
    lens = (8 * len(aad)).to_bytes(8, "big") + (8 * len(ct)).to_bytes(8, "big")
    return _gf128_mul(y ^ int.from_bytes(lens, "big"), h)


def _ctr(aes: AES256, j: int, data: bytes) -> bytes:
    out = bytearray()
    prefix = j >> 32
    ctr = j & 0xFFFFFFFF
    for i in range(0, len(data), 16):
        ctr = (ctr + 1) & 0xFFFFFFFF
        ks = aes.encrypt_block(((prefix << 32) | ctr).to_bytes(16, "big"))
        out += bytes(a ^ b for a, b in zip(data[i : i + 16], ks))
    return bytes(out)


def aes256gcm_encrypt(key: bytes, iv: bytes, pt: bytes, aad: bytes) -> tuple[bytes, bytes]:
    if len(iv) != 12:
        raise ValueError("only 96-bit IVs are supported")
    aes = AES256(key)
    h = int.from_bytes(aes.encrypt_block(b"\x00" * 16), "big")
    j0 = int.from_bytes(iv + b"\x00\x00\x00\x01", "big")
    ct = _ctr(aes, j0, pt)
    s = _ghash(h, aad, ct)
    tag = int.from_bytes(aes.encrypt_block(j0.to_bytes(16, "big")), "big") ^ s
    return ct, tag.to_bytes(16, "big")


def aes256gcm_decrypt(key: bytes, iv: bytes, ct: bytes, tag: bytes, aad: bytes) -> bytes | None:
    """Returns the plaintext, or None if authentication fails."""
    if len(iv) != 12 or len(tag) != 16:
        return None
    aes = AES256(key)
    h = int.from_bytes(aes.encrypt_block(b"\x00" * 16), "big")
    j0 = int.from_bytes(iv + b"\x00\x00\x00\x01", "big")
    s = _ghash(h, aad, ct)
    expect = (int.from_bytes(aes.encrypt_block(j0.to_bytes(16, "big")), "big") ^ s).to_bytes(16, "big")
    if not hmac.compare_digest(expect, tag):
        return None
    return _ctr(aes, j0, ct)
